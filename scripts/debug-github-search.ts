#!/usr/bin/env npx tsx
import dotenv from 'dotenv'

// Load env vars FIRST before any other imports
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { getDriver } from '../src/lib/neo4j/client'
import { generateEmbedding } from '../src/lib/embeddings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debug() {
  console.log('Debugging GitHub search...\n')
  
  const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90' // Correct user ID with GitHub access
  
  // 1. Check user's accessible repositories
  console.log('1. Checking user\'s accessible repositories...')
  const { data: userRepos, error: reposError } = await supabase
    .from('github_user_repos')
    .select('repository:github_repositories(id, full_name)')
    .eq('user_id', userId)
  
  console.log('User repos:', userRepos)
  console.log('Repos error:', reposError)
  
  if (!userRepos || userRepos.length === 0) {
    console.log('No repositories found for user')
    return
  }
  
  const repoFullNames = userRepos.map(ur => ur.repository.full_name)
  console.log('Accessible repos:', repoFullNames)
  
  // 2. Check Neo4j data
  console.log('\n2. Checking Neo4j data...')
  const driver = getDriver()
  const session = driver.session()
  
  try {
    // Check repositories
    const repoResult = await session.run(`
      MATCH (r:Repository)
      RETURN r.full_name as full_name, r.github_id as github_id
    `)
    
    console.log('\nRepositories in Neo4j:')
    repoResult.records.forEach(record => {
      console.log(`- ${record.get('full_name')} (github_id: ${record.get('github_id')})`)
    })
    
    // Check issues
    const issueResult = await session.run(`
      MATCH (i:RepoIssue)<-[:HAS_ISSUE]-(r:Repository)
      RETURN i.title as title, i.number as number, r.full_name as repo, 
             size(i.title_embedding) as embedding_size
      LIMIT 5
    `)
    
    console.log('\nIssues in Neo4j:')
    issueResult.records.forEach(record => {
      console.log(`- ${record.get('repo')} #${record.get('number')}: ${record.get('title')}`)
      console.log(`  Embedding size: ${record.get('embedding_size')}`)
    })
    
    // 3. Test vector search directly
    console.log('\n3. Testing vector search directly...')
    const query = 'search'
    const queryEmbedding = await generateEmbedding(query)
    console.log(`Query embedding size: ${queryEmbedding.length}`)
    
    // Search issues
    const searchQuery = `
      CALL db.index.vector.queryNodes('github_issue_title_embedding', $limit, $embedding)
      YIELD node AS issue, score
      MATCH (issue)<-[:HAS_ISSUE]-(r:Repository)
      WHERE r.full_name IN $repos
      RETURN issue.title as title, issue.number as number, r.full_name as repo, score
      ORDER BY score DESC
      LIMIT 5
    `
    
    const searchResult = await session.run(searchQuery, {
      embedding: queryEmbedding,
      repos: repoFullNames,
      limit: 10
    })
    
    console.log('\nSearch results:')
    if (searchResult.records.length === 0) {
      console.log('No results found')
      
      // Try without repo filter
      console.log('\n4. Testing without repo filter...')
      const unfiltered = await session.run(`
        CALL db.index.vector.queryNodes('github_issue_title_embedding', 10, $embedding)
        YIELD node AS issue, score
        MATCH (issue)<-[:HAS_ISSUE]-(r:Repository)
        RETURN issue.title as title, issue.number as number, r.full_name as repo, score
        ORDER BY score DESC
        LIMIT 5
      `, { embedding: queryEmbedding })
      
      console.log('Unfiltered results:')
      unfiltered.records.forEach(record => {
        console.log(`- ${record.get('repo')} #${record.get('number')}: ${record.get('title')} (score: ${record.get('score')})`)
      })
    } else {
      searchResult.records.forEach(record => {
        console.log(`- ${record.get('repo')} #${record.get('number')}: ${record.get('title')} (score: ${record.get('score')})`)
      })
    }
    
    // Check if vector index is working
    console.log('\n5. Checking vector index...')
    const indexCheck = await session.run(`
      SHOW INDEXES
      WHERE name = 'github_issue_title_embedding'
    `)
    
    if (indexCheck.records.length > 0) {
      const indexRecord = indexCheck.records[0]
      console.log('Index status:', indexRecord.get('state'))
      console.log('Index type:', indexRecord.get('type'))
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

debug()