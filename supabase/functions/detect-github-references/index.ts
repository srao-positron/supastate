import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize Supabase client
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code_entity_id } = await req.json()
    
    if (!code_entity_id) {
      return new Response(
        JSON.stringify({ error: 'code_entity_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }
    
    console.log(`[Detect GitHub References] Processing code entity: ${code_entity_id}`)
    
    // Get code entity details
    const { data: codeEntity, error: entityError } = await supabase
      .from('code_entities')
      .select('*')
      .eq('id', code_entity_id)
      .single()
    
    if (entityError || !codeEntity) {
      console.error('[Detect GitHub References] Code entity not found:', entityError)
      return new Response(
        JSON.stringify({ error: 'Code entity not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }
    
    // Extract GitHub references
    const githubRefs = extractGitHubReferences(codeEntity)
    
    if (githubRefs.length === 0) {
      console.log('[Detect GitHub References] No GitHub references found')
      return new Response(
        JSON.stringify({ detected: 0, queued: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log(`[Detect GitHub References] Found ${githubRefs.length} GitHub references`)
    
    let queued = 0
    const results = []
    
    for (const ref of githubRefs) {
      // Check if repository exists
      const { data: repository } = await supabase
        .from('github_repositories')
        .select('*')
        .eq('owner', ref.owner)
        .eq('name', ref.repo)
        .single()
      
      if (!repository) {
        console.log(`[Detect GitHub References] Repository not found: ${ref.owner}/${ref.repo}`)
        results.push({
          ...ref,
          status: 'repository_not_found'
        })
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
        console.log(`[Detect GitHub References] Branch already synced: ${ref.owner}/${ref.repo}#${ref.branch}`)
        results.push({
          ...ref,
          status: 'already_synced',
          branch_id: existingBranch.id
        })
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
            camille_code_entity_id: code_entity_id,
            detected_from: ref.detectedFrom,
            file_path: ref.filePath
          }
        }, {
          onConflict: 'repository_id,branch_name'
        })
        .select()
        .single()
      
      if (branchError) {
        console.error(`[Detect GitHub References] Error creating branch record:`, branchError)
        results.push({
          ...ref,
          status: 'error',
          error: branchError.message
        })
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
            camille_code_entity_id: code_entity_id
          }
        })
      
      if (crawlError) {
        console.error(`[Detect GitHub References] Error queuing crawl job:`, crawlError)
        results.push({
          ...ref,
          status: 'queue_error',
          error: crawlError.message
        })
        continue
      }
      
      // Queue relationship detection job
      await supabase
        .from('github_relationship_queue')
        .insert({
          job_type: 'camille_to_github',
          source_entity_id: code_entity_id,
          source_entity_type: 'camille_code',
          target_hints: {
            repository_id: repository.id,
            branch_name: ref.branch,
            owner: ref.owner,
            repo: ref.repo
          },
          priority: 8
        })
      
      // Log activity
      await supabase.rpc('log_github_activity', {
        p_function_name: 'detect-github-references',
        p_level: 'info',
        p_message: `Auto-queued branch ${ref.branch} from Camille import`,
        p_repository_id: repository.id,
        p_repository_full_name: repository.full_name,
        p_details: {
          branch_name: ref.branch,
          camille_code_entity_id: code_entity_id,
          file_path: codeEntity.file_path,
          detected_from: ref.detectedFrom
        }
      })
      
      results.push({
        ...ref,
        status: 'queued',
        branch_id: branch.id,
        repository_id: repository.id
      })
      queued++
    }
    
    return new Response(
      JSON.stringify({ 
        detected: githubRefs.length, 
        queued,
        references: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('[Detect GitHub References] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})