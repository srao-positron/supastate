#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { getDriver } from '../src/lib/neo4j/client'

dotenv.config({ path: '.env.local' })

async function createVectorIndexes() {
  console.log('Creating vector indexes for GitHub entities...\n')
  
  const driver = getDriver()
  const session = driver.session()
  
  try {
    // Vector indexes for GitHub entities
    const indexes = [
      {
        name: 'github_issue_title_embedding',
        node: 'RepoIssue',
        property: 'title_embedding',
        dimensions: 3072,
        similarity: 'cosine'
      },
      {
        name: 'github_issue_body_embedding',
        node: 'RepoIssue',
        property: 'body_embedding',
        dimensions: 3072,
        similarity: 'cosine'
      },
      {
        name: 'github_pr_title_embedding',
        node: 'RepoPullRequest',
        property: 'title_embedding',
        dimensions: 3072,
        similarity: 'cosine'
      },
      {
        name: 'github_pr_body_embedding',
        node: 'RepoPullRequest',
        property: 'body_embedding',
        dimensions: 3072,
        similarity: 'cosine'
      },
      {
        name: 'github_commit_message_embedding',
        node: 'RepoCommit',
        property: 'message_embedding',
        dimensions: 3072,
        similarity: 'cosine'
      },
      {
        name: 'github_file_content_embedding',
        node: 'RepoFile',
        property: 'content_embedding',
        dimensions: 3072,
        similarity: 'cosine'
      },
      {
        name: 'github_repository_description_embedding',
        node: 'Repository',
        property: 'description_embedding',
        dimensions: 3072,
        similarity: 'cosine'
      }
    ]
    
    for (const index of indexes) {
      console.log(`Creating vector index: ${index.name}...`)
      
      try {
        // Drop existing index if it exists
        await session.run(`DROP INDEX ${index.name} IF EXISTS`)
        
        // Create new vector index
        const query = `
          CREATE VECTOR INDEX ${index.name} IF NOT EXISTS
          FOR (n:${index.node})
          ON (n.${index.property})
          OPTIONS {
            indexConfig: {
              \`vector.dimensions\`: ${index.dimensions},
              \`vector.similarity_function\`: '${index.similarity}'
            }
          }
        `
        
        await session.run(query)
        console.log(`✓ Created ${index.name}`)
      } catch (error: any) {
        console.error(`✗ Failed to create ${index.name}:`, error.message)
      }
    }
    
    // Wait a bit for indexes to be created
    console.log('\nWaiting for indexes to be ready...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Check index status
    console.log('\nChecking index status...')
    const result = await session.run('SHOW INDEXES')
    
    const githubIndexes = result.records.filter(record => {
      const name = record.get('name')
      return name?.startsWith('github_')
    })
    
    console.log(`\nFound ${githubIndexes.length} GitHub vector indexes:`)
    githubIndexes.forEach(record => {
      const name = record.get('name')
      const state = record.get('state')
      const type = record.get('type')
      console.log(`- ${name}: ${state} (${type})`)
    })
    
    // Test query
    console.log('\nTesting vector search...')
    const testResult = await session.run(`
      MATCH (n:RepoIssue)
      RETURN count(n) as count
    `)
    
    const issueCount = testResult.records[0].get('count').toNumber()
    console.log(`Found ${issueCount} RepoIssue nodes`)
    
    const fileResult = await session.run(`
      MATCH (n:RepoFile)
      RETURN count(n) as count
    `)
    
    const fileCount = fileResult.records[0].get('count').toNumber()
    console.log(`Found ${fileCount} RepoFile nodes`)
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

createVectorIndexes()