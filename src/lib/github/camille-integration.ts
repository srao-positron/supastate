import { createServiceClient } from '@/lib/supabase/server'

/**
 * Detect and queue GitHub branches referenced in Camille code imports
 */
export async function detectCamilleGitHubReferences(codeEntity: {
  id: string
  file_path: string
  project_name: string
  source_code?: string
  metadata?: any
}) {
  const supabase = await createServiceClient()
  
  try {
    // Extract GitHub references from the file path or content
    const githubRefs = extractGitHubReferences(codeEntity)
    
    if (githubRefs.length === 0) {
      return { detected: 0, queued: 0 }
    }
    
    console.log(`[Camille Integration] Found ${githubRefs.length} GitHub references in ${codeEntity.file_path}`)
    
    let queued = 0
    
    for (const ref of githubRefs) {
      // Check if repository exists
      const { data: repository } = await supabase
        .from('github_repositories')
        .select('*')
        .eq('owner', ref.owner)
        .eq('name', ref.repo)
        .single()
      
      if (!repository) {
        console.log(`[Camille Integration] Repository not found: ${ref.owner}/${ref.repo}`)
        continue
      }
      
      // Check if branch is already indexed
      const { data: existingBranch } = await supabase
        .from('github_indexed_branches')
        .select('*')
        .eq('repository_id', repository.id)
        .eq('branch_name', ref.branch)
        .single()
      
      if (existingBranch?.sync_status === 'synced') {
        console.log(`[Camille Integration] Branch already synced: ${ref.owner}/${ref.repo}#${ref.branch}`)
        continue
      }
      
      // Create or update branch record
      const { data: branch, error: branchError } = await supabase
        .from('github_indexed_branches')
        .upsert({
          repository_id: repository.id,
          branch_name: ref.branch,
          base_branch: repository.default_branch || 'main',
          source: 'camille',
          metadata: {
            camille_code_entity_id: codeEntity.id,
            detected_from: ref.detectedFrom,
            file_path: ref.filePath
          }
        }, {
          onConflict: 'repository_id,branch_name'
        })
        .select()
        .single()
      
      if (branchError) {
        console.error(`[Camille Integration] Error creating branch record:`, branchError)
        continue
      }
      
      // Queue crawl job for the branch
      const { error: crawlError } = await supabase
        .from('github_crawl_queue')
        .insert({
          repository_id: repository.id,
          crawl_type: 'branch',
          branch_name: ref.branch,
          crawl_scope: 'delta',
          priority: 7, // Higher priority for Camille-detected branches
          data: {
            branch_id: branch.id,
            source: 'camille',
            camille_code_entity_id: codeEntity.id
          }
        })
      
      if (crawlError) {
        console.error(`[Camille Integration] Error queuing crawl job:`, crawlError)
        continue
      }
      
      // Log activity
      await supabase.rpc('log_github_activity', {
        p_function_name: 'camille-github-integration',
        p_level: 'info',
        p_message: `Auto-queued branch ${ref.branch} from Camille import`,
        p_repository_id: repository.id,
        p_repository_full_name: repository.full_name,
        p_details: {
          branch_name: ref.branch,
          camille_code_entity_id: codeEntity.id,
          file_path: codeEntity.file_path,
          detected_from: ref.detectedFrom
        }
      })
      
      queued++
    }
    
    return { detected: githubRefs.length, queued }
    
  } catch (error) {
    console.error('[Camille Integration] Error:', error)
    return { detected: 0, queued: 0, error }
  }
}

/**
 * Extract GitHub repository and branch references from code
 */
function extractGitHubReferences(codeEntity: {
  file_path: string
  source_code?: string
  metadata?: any
}): Array<{
  owner: string
  repo: string
  branch: string
  filePath?: string
  detectedFrom: 'url' | 'import' | 'comment' | 'path'
}> {
  const references: Array<{
    owner: string
    repo: string
    branch: string
    filePath?: string
    detectedFrom: 'url' | 'import' | 'comment' | 'path'
  }> = []
  
  // Pattern to match GitHub URLs with branch/file references
  const githubUrlPattern = /github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-_]+)(?:\/(?:tree|blob)\/([a-zA-Z0-9-_\.\/]+))?(?:\/(.+))?/g
  
  // Pattern to match git clone commands
  const gitClonePattern = /git clone.*github\.com[/:]([\w-]+)\/([\w-]+)(?:\.git)?(?:\s+-b\s+([\w-]+))?/g
  
  // Check file path for GitHub-like structure
  if (codeEntity.file_path) {
    // Look for patterns like: github.com/owner/repo/branch/path/to/file
    const pathMatch = codeEntity.file_path.match(/github\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)/)
    if (pathMatch) {
      references.push({
        owner: pathMatch[1],
        repo: pathMatch[2],
        branch: pathMatch[3],
        detectedFrom: 'path'
      })
    }
  }
  
  // Check source code for GitHub references
  if (codeEntity.source_code) {
    // Find GitHub URLs
    let match
    while ((match = githubUrlPattern.exec(codeEntity.source_code)) !== null) {
      const [, owner, repo, branchOrPath, filePath] = match
      
      // Determine if third part is branch or file path
      let branch = 'main'
      let file = filePath
      
      if (branchOrPath && !branchOrPath.includes('/')) {
        // Likely a branch name
        branch = branchOrPath
      } else if (branchOrPath) {
        // Likely a file path, assume main branch
        file = branchOrPath
      }
      
      references.push({
        owner,
        repo,
        branch,
        filePath: file,
        detectedFrom: 'url'
      })
    }
    
    // Find git clone commands
    while ((match = gitClonePattern.exec(codeEntity.source_code)) !== null) {
      const [, owner, repo, branch] = match
      references.push({
        owner,
        repo,
        branch: branch || 'main',
        detectedFrom: 'import'
      })
    }
    
    // Check imports for patterns like: from 'github:owner/repo#branch'
    const importPattern = /from\s+['"]github:([^\/]+)\/([^#]+)(?:#([^'"]+))?['"]/g
    while ((match = importPattern.exec(codeEntity.source_code)) !== null) {
      const [, owner, repo, branch] = match
      references.push({
        owner,
        repo,
        branch: branch || 'main',
        detectedFrom: 'import'
      })
    }
  }
  
  // Deduplicate references
  const uniqueRefs = new Map<string, typeof references[0]>()
  references.forEach(ref => {
    const key = `${ref.owner}/${ref.repo}#${ref.branch}`
    if (!uniqueRefs.has(key)) {
      uniqueRefs.set(key, ref)
    }
  })
  
  return Array.from(uniqueRefs.values())
}

/**
 * Create relationships between Camille code and GitHub branches
 */
export async function createCamilleGitHubRelationships(
  camilleEntityId: string,
  githubReferences: Array<{ owner: string; repo: string; branch: string }>
) {
  const supabase = await createServiceClient()
  
  try {
    for (const ref of githubReferences) {
      // Queue relationship detection job
      await supabase
        .from('github_relationship_queue')
        .insert({
          job_type: 'camille_to_github',
          source_entity_id: camilleEntityId,
          source_entity_type: 'camille_code',
          target_hints: {
            owner: ref.owner,
            repo: ref.repo,
            branch: ref.branch
          },
          priority: 8
        })
    }
  } catch (error) {
    console.error('[Camille Integration] Error creating relationships:', error)
  }
}