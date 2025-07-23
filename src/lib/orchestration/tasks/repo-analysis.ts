import { getInstallationOctokit } from '@/lib/github/app'
import { createServiceClient } from '@/lib/supabase/server'

interface AnalyzeRepositoryOptions {
  repository: string
  branch: string
  onProgress: (progress: { current: number; total: number; message: string }) => Promise<void>
  onLog: (message: string) => Promise<void>
}

export async function analyzeRepository(options: AnalyzeRepositoryOptions) {
  const { repository, branch, onProgress, onLog } = options
  const [owner, repo] = repository.split('/')
  
  await onLog(`Starting analysis of ${repository} on branch ${branch}`)
  await onProgress({ current: 0, total: 100, message: 'Initializing...' })

  // Get GitHub installation
  const supabase = await createServiceClient()
  const { data: installation } = await supabase
    .from('github_installations')
    .select('id')
    .single()

  if (!installation) {
    throw new Error('GitHub App not installed')
  }

  const octokit = await getInstallationOctokit(installation.id)

  // Get repository info
  await onProgress({ current: 10, total: 100, message: 'Fetching repository info...' })
  const { data: repoData } = await (octokit as any).repos.get({ owner, repo })

  // Get file tree
  await onProgress({ current: 20, total: 100, message: 'Analyzing file structure...' })
  const { data: tree } = await (octokit as any).git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: 'true',
  })

  // Filter for code files
  const codeFiles = tree.tree.filter((item: any) => 
    item.type === 'blob' && 
    isCodeFile(item.path || '')
  )

  await onLog(`Found ${codeFiles.length} code files to analyze`)

  // Analyze files in batches
  const batchSize = 10
  const entities: any[] = []
  const relationships: any[] = []

  for (let i = 0; i < codeFiles.length; i += batchSize) {
    const batch = codeFiles.slice(i, i + batchSize)
    const progress = 20 + (i / codeFiles.length) * 60
    
    await onProgress({
      current: Math.round(progress),
      total: 100,
      message: `Analyzing files ${i + 1}-${Math.min(i + batchSize, codeFiles.length)} of ${codeFiles.length}...`
    })

    // Analyze each file in the batch
    for (const file of batch) {
      if (!file.path || !file.sha) continue
      
      try {
        // Get file content
        const { data: blob } = await (octokit as any).git.getBlob({
          owner,
          repo,
          file_sha: file.sha,
        })

        const content = Buffer.from(blob.content, 'base64').toString('utf-8')
        
        // Parse file based on language
        const fileEntities = await parseFile(file.path, content)
        entities.push(...fileEntities)

        // Extract relationships
        const fileRelationships = await extractRelationships(file.path, content, fileEntities)
        relationships.push(...fileRelationships)
      } catch (error) {
        await onLog(`Error analyzing ${file.path}: ${(error as any).message}`)
      }
    }
  }

  await onProgress({ current: 80, total: 100, message: 'Storing analysis results...' })

  // Store results in database
  const { data: repoState } = await supabase
    .from('repository_states')
    .insert({
      github_repo_id: repoData.id,
      full_name: repository,
      default_branch: repoData.default_branch,
      main_branch_sha: repoData.default_branch === branch ? repoData.sha : branch,
      stats: {
        total_files: tree.tree.length,
        code_files: codeFiles.length,
        entities: entities.length,
        relationships: relationships.length,
        languages: getLanguageStats(codeFiles),
      },
      entity_count: entities.length,
      relationship_count: relationships.length,
      languages: getLanguageStats(codeFiles),
    })
    .select()
    .single()

  // Store entities
  if (entities.length > 0) {
    await supabase
      .from('code_entities')
      .insert(
        entities.map(e => ({
          ...e,
          repository_state_id: repoState.id,
          team_id: repoState.team_id,
          is_source_truth: true,
        }))
      )
  }

  // Store relationships
  if (relationships.length > 0) {
    await supabase
      .from('code_relationships')
      .insert(
        relationships.map(r => ({
          ...r,
          repository_state_id: repoState.id,
          team_id: repoState.team_id,
          is_source_truth: true,
        }))
      )
  }

  await onProgress({ current: 100, total: 100, message: 'Analysis complete!' })

  return {
    repository,
    branch,
    stats: repoState.stats,
    entities: entities.length,
    relationships: relationships.length,
  }
}

function isCodeFile(path: string): boolean {
  const extensions = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h',
    '.cs', '.go', '.rs', '.swift', '.kt', '.rb', '.php', '.scala',
  ]
  return extensions.some(ext => path.endsWith(ext))
}

async function parseFile(path: string, content: string): Promise<any[]> {
  // This would use language-specific parsers
  // For now, return placeholder
  return []
}

async function extractRelationships(path: string, content: string, entities: any[]): Promise<any[]> {
  // This would analyze imports, calls, etc.
  // For now, return placeholder
  return []
}

function getLanguageStats(files: any[]): Record<string, number> {
  const stats: Record<string, number> = {}
  
  for (const file of files) {
    if (!file.path) continue
    const ext = file.path.split('.').pop() || ''
    const lang = getLanguageFromExtension(ext)
    stats[lang] = (stats[lang] || 0) + 1
  }
  
  return stats
}

function getLanguageFromExtension(ext: string): string {
  const langMap: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    py: 'Python',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    cs: 'C#',
    go: 'Go',
    rs: 'Rust',
    swift: 'Swift',
    kt: 'Kotlin',
    rb: 'Ruby',
    php: 'PHP',
    scala: 'Scala',
  }
  return langMap[ext] || 'Other'
}