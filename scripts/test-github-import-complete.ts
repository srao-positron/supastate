#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { executeQuery, verifyConnectivity } from '@/lib/neo4j/client'
import { Octokit } from '@octokit/rest'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://service.supastate.ai'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const NEO4J_URI = process.env.NEO4J_URI!
const NEO4J_USER = process.env.NEO4J_USER!
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

if (!SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// GitHub configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'YOUR_GITHUB_TOKEN_HERE'
const USER_ID = '2563f659-c90f-47d4-b33d-c80877f854e5'
const REPO_OWNER = 'srao-positron'
const REPO_NAME = 'camille'

async function importRepository() {
  console.log('\n🚀 Importing GitHub repository...')
  
  // Create GitHub client to get repo details
  const octokit = new Octokit({ auth: GITHUB_TOKEN })
  
  try {
    const { data: repoData } = await octokit.repos.get({
      owner: REPO_OWNER,
      repo: REPO_NAME
    })
    
    // Insert repository into Supabase
    const { data: repo, error } = await supabase
      .from('github_repositories')
      .upsert({
        user_id: USER_ID,
        full_name: `${REPO_OWNER}/${REPO_NAME}`,
        owner: REPO_OWNER,
        name: REPO_NAME,
        github_id: repoData.id,
        private: repoData.private,
        default_branch: repoData.default_branch || 'main',
        description: repoData.description,
        language: repoData.language,
        stars_count: repoData.stargazers_count,
        crawl_status: 'pending'
      })
      .select()
      .single()
    
    if (error) {
      throw error
    }
    
    console.log(`✅ Repository imported: ${repo.full_name}`)
    return repo
    
  } catch (error) {
    console.error('Import error:', error)
    throw error
  }
}

async function crawlRepositoryFiles(repoId: string) {
  console.log('\n🕷️ Crawling repository files...')
  
  const octokit = new Octokit({ auth: GITHUB_TOKEN })
  
  try {
    // Get all TypeScript and JavaScript files
    const { data: searchResults } = await octokit.search.code({
      q: `repo:${REPO_OWNER}/${REPO_NAME} language:typescript OR language:javascript`,
      per_page: 100
    })
    
    console.log(`Found ${searchResults.total_count} code files`)
    
    // Queue files for parsing
    let queued = 0
    for (const file of searchResults.items) {
      // Get file content
      const { data: fileData } = await octokit.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: file.path
      })
      
      if ('content' in fileData && !Array.isArray(fileData)) {
        // Decode base64 content
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8')
        
        // Queue for parsing
        const { error } = await supabase.rpc('pgmq_send', {
          queue_name: 'github_code_parsing',
          msg: {
            repository_id: repoId,
            file_id: `${REPO_OWNER}/${REPO_NAME}#${file.path}`,
            file_path: file.path,
            file_content: content,
            language: file.path.endsWith('.ts') ? 'typescript' : 'javascript',
            branch: 'main',
            commit_sha: fileData.sha
          }
        })
        
        if (!error) {
          queued++
          console.log(`Queued: ${file.path}`)
        }
        
        // Rate limit: wait a bit between requests
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Limit to first 10 files for testing
        if (queued >= 10) break
      }
    }
    
    console.log(`✅ Queued ${queued} files for parsing`)
    return queued
    
  } catch (error) {
    console.error('Crawl error:', error)
    throw error
  }
}

async function triggerParser() {
  console.log('\n⚙️ Triggering code parser...')
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/github-code-parser-worker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ batch_size: 10 })
    })
    
    const data = await response.json()
    console.log('Parser response:', JSON.stringify(data, null, 2))
    
    if (!response.ok) {
      throw new Error(`Parser failed: ${data.error || response.statusText}`)
    }
    
    return data
  } catch (error) {
    console.error('Parser error:', error)
    throw error
  }
}

async function checkResults() {
  console.log('\n🔍 Checking parsed results in Neo4j...')
  
  // Check parsed nodes
  const result = await executeQuery(`
    MATCH (n)
    WHERE n:RepoFunction OR n:RepoClass OR n:RepoInterface
    WITH labels(n)[0] as type, COUNT(n) as count
    RETURN type, count
    ORDER BY count DESC
  `)
  
  console.log('\nParsed node counts:')
  result.records.forEach(record => {
    console.log(`- ${record.type}: ${record.count}`)
  })
  
  // Get recent examples
  const examples = await executeQuery(`
    MATCH (n)
    WHERE n:RepoFunction OR n:RepoClass OR n:RepoInterface
    RETURN labels(n)[0] as type, n.name as name, n.file_path as file_path, n.id as id
    ORDER BY n.id DESC
    LIMIT 10
  `)
  
  console.log('\nRecent parsed nodes:')
  examples.records.forEach(record => {
    console.log(`- ${record.type}: ${record.name} (ID: ${record.id})`)
  })
  
  // Check relationships
  const relationships = await executeQuery(`
    MATCH (f:RepoFile)-[r:CONTAINS_FUNCTION|CONTAINS_CLASS]->(n)
    RETURN COUNT(r) as count, TYPE(r) as type
  `)
  
  console.log('\nRelationships:')
  relationships.records.forEach(record => {
    console.log(`- ${record.type}: ${record.count}`)
  })
}

async function main() {
  console.log('🚀 Testing Complete GitHub Import Flow')
  console.log('=====================================')
  
  if (GITHUB_TOKEN === 'YOUR_GITHUB_TOKEN_HERE') {
    console.error('❌ Please set GITHUB_TOKEN environment variable')
    console.log('You can create a token at: https://github.com/settings/tokens')
    console.log('Required scopes: repo (for private repos) or public_repo (for public repos)')
    process.exit(1)
  }
  
  try {
    // Verify Neo4j connection
    await verifyConnectivity()
    
    // Step 1: Import repository
    const repo = await importRepository()
    
    // Step 2: Crawl and queue files
    const queuedCount = await crawlRepositoryFiles(repo.id)
    
    if (queuedCount > 0) {
      // Wait a bit for queue to be ready
      console.log('\n⏳ Waiting 3 seconds...')
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Step 3: Trigger parser
      await triggerParser()
      
      // Wait for parsing to complete
      console.log('\n⏳ Waiting 10 seconds for parsing to complete...')
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
    
    // Step 4: Check results
    await checkResults()
    
    console.log('\n✅ Test completed!')
    
  } catch (error) {
    console.error('Test failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)