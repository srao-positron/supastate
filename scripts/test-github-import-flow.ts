#!/usr/bin/env npx tsx

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { executeQuery, verifyConnectivity } from '@/lib/neo4j/client'
import { log } from '@/lib/logger'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://service.supastate.ai'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY environment variable')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// User ID from previous successful operations
const USER_ID = '2563f659-c90f-47d4-b33d-c80877f854e5'
// GitHub token - you'll need to set this
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'YOUR_GITHUB_TOKEN_HERE'

async function checkExistingRepos() {
  console.log('\n🔍 Checking existing GitHub repositories...')
  
  const result = await executeQuery(`
    MATCH (r:GitHubRepo)
    RETURN r.name as name, r.owner as owner, r.url as url, r.created_at as created_at
    ORDER BY r.created_at DESC
    LIMIT 10
  `)
  
  console.log(`Found ${result.records.length} repositories`)
  result.records.forEach(record => {
    console.log(`- ${record.owner}/${record.name} (${record.url})`)
  })
  
  return result.records
}

async function importCamilleRepo() {
  console.log('\n🚀 Importing Camille repository...')
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/import-github-repo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repoUrl: 'https://github.com/srao-positron/camille',
        token: GITHUB_TOKEN,
        userId: USER_ID
      })
    })
    
    const data = await response.json()
    console.log('Import response:', JSON.stringify(data, null, 2))
    
    if (!response.ok) {
      throw new Error(`Import failed: ${data.error || response.statusText}`)
    }
    
    return data
  } catch (error) {
    console.error('Import error:', error)
    throw error
  }
}

async function triggerCrawl() {
  console.log('\n🕷️ Triggering repository crawl...')
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/crawl-github-repo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repoUrl: 'https://github.com/srao-positron/camille',
        token: GITHUB_TOKEN,
        userId: USER_ID
      })
    })
    
    const data = await response.json()
    console.log('Crawl response:', JSON.stringify(data, null, 2))
    
    if (!response.ok) {
      throw new Error(`Crawl failed: ${data.error || response.statusText}`)
    }
    
    return data
  } catch (error) {
    console.error('Crawl error:', error)
    throw error
  }
}

async function checkParsingQueue() {
  console.log('\n📋 Checking github_code_parsing queue...')
  
  const { data, error } = await supabase
    .from('github_code_parsing_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (error) {
    console.error('Queue query error:', error)
    return []
  }
  
  console.log(`Found ${data?.length || 0} items in queue`)
  data?.forEach(item => {
    console.log(`- ${item.file_path} (${item.status})`)
  })
  
  return data || []
}

async function triggerParser() {
  console.log('\n⚙️ Triggering github-code-parser-worker...')
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/github-code-parser-worker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
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

async function checkParsedNodes() {
  console.log('\n🔍 Checking parsed code nodes in Neo4j...')
  
  const result = await executeQuery(`
    MATCH (n)
    WHERE n:RepoFunction OR n:RepoClass OR n:RepoInterface
    WITH labels(n)[0] as type, COUNT(n) as count
    RETURN type, count
    ORDER BY count DESC
  `)
  
  console.log('Parsed node counts:')
  result.records.forEach(record => {
    console.log(`- ${record.type}: ${record.count}`)
  })
  
  // Get some examples
  const examples = await executeQuery(`
    MATCH (n)
    WHERE n:RepoFunction OR n:RepoClass OR n:RepoInterface
    RETURN labels(n)[0] as type, n.name as name, n.file_path as file_path
    LIMIT 10
  `)
  
  console.log('\nExample nodes:')
  examples.records.forEach(record => {
    console.log(`- ${record.type}: ${record.name} (${record.file_path})`)
  })
  
  return result.records
}

async function main() {
  console.log('🚀 Testing GitHub Import Flow with Code Parsing')
  console.log('===============================================')
  
  try {
    // Verify Neo4j connection
    await verifyConnectivity()
    
    // Step 1: Check existing repos
    const existingRepos = await checkExistingRepos()
    
    const camilleExists = existingRepos.some(r => 
      r.owner === 'srao-positron' && r.name === 'camille'
    )
    
    if (!camilleExists) {
      // Step 2: Import Camille repo
      await importCamilleRepo()
      
      // Wait a bit for import to complete
      console.log('\n⏳ Waiting 5 seconds for import to complete...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    } else {
      console.log('\n✅ Camille repo already exists, skipping import')
    }
    
    // Step 3: Trigger crawl
    await triggerCrawl()
    
    // Wait for crawl to populate queue
    console.log('\n⏳ Waiting 10 seconds for crawl to populate queue...')
    await new Promise(resolve => setTimeout(resolve, 10000))
    
    // Step 4: Check parsing queue
    const queueItems = await checkParsingQueue()
    
    if (queueItems.length > 0) {
      // Step 5: Run parser
      await triggerParser()
      
      // Wait for parsing to complete
      console.log('\n⏳ Waiting 15 seconds for parsing to complete...')
      await new Promise(resolve => setTimeout(resolve, 15000))
    }
    
    // Step 6: Verify parsed nodes
    await checkParsedNodes()
    
    console.log('\n✅ GitHub import flow test completed!')
    
  } catch (error) {
    console.error('Test failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)