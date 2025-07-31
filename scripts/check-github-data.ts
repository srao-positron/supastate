#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { executeQuery, verifyConnectivity } from '@/lib/neo4j/client'

async function checkGitHubData() {
  console.log('🔍 Checking GitHub data in Neo4j...')
  
  try {
    await verifyConnectivity()
    
    // Check GitHubRepo nodes
    const repos = await executeQuery(`
      MATCH (r:GitHubRepo)
      RETURN r.name as name, r.owner as owner, r.url as url, 
             r.created_at as created_at, r.user_id as user_id
      ORDER BY r.created_at DESC
      LIMIT 10
    `)
    
    console.log(`\n📦 GitHub Repositories: ${repos.records.length}`)
    repos.records.forEach(record => {
      console.log(`- ${record.owner}/${record.name} (User: ${record.user_id})`)
    })
    
    // Check GitHubFile nodes
    const files = await executeQuery(`
      MATCH (f:GitHubFile)
      RETURN COUNT(f) as count
    `)
    console.log(`\n📄 GitHub Files: ${files.records[0]?.count || 0}`)
    
    // Check GitHubIssue nodes
    const issues = await executeQuery(`
      MATCH (i:GitHubIssue)
      RETURN COUNT(i) as count
    `)
    console.log(`\n🐛 GitHub Issues: ${issues.records[0]?.count || 0}`)
    
    // Check GitHubCommit nodes
    const commits = await executeQuery(`
      MATCH (c:GitHubCommit)
      RETURN COUNT(c) as count
    `)
    console.log(`\n💾 GitHub Commits: ${commits.records[0]?.count || 0}`)
    
    // Check parsed code nodes
    console.log('\n🔧 Parsed Code Nodes:')
    const codeNodes = await executeQuery(`
      MATCH (n)
      WHERE n:RepoFunction OR n:RepoClass OR n:RepoInterface
      WITH labels(n)[0] as type, COUNT(n) as count
      RETURN type, count
      ORDER BY count DESC
    `)
    
    codeNodes.records.forEach(record => {
      console.log(`- ${record.type}: ${record.count}`)
    })
    
    // Get some example parsed nodes
    if (codeNodes.records.length > 0) {
      console.log('\n📋 Example parsed nodes:')
      const examples = await executeQuery(`
        MATCH (n)
        WHERE n:RepoFunction OR n:RepoClass OR n:RepoInterface
        RETURN labels(n)[0] as type, n.name as name, n.file_path as file_path
        ORDER BY n.created_at DESC
        LIMIT 5
      `)
      
      examples.records.forEach(record => {
        console.log(`- ${record.type}: ${record.name} (${record.file_path})`)
      })
    }
    
    // Check github_code_parsing_queue
    console.log('\n📋 Checking parsing queue in Supabase...')
    // We'll check this via direct SQL if needed
    
  } catch (error) {
    console.error('Error:', error)
  }
}

checkGitHubData().catch(console.error)