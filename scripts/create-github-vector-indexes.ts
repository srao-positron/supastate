#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { getDriver } from '../src/lib/neo4j/client'

dotenv.config({ path: '.env.local' })

async function createGitHubVectorIndexes() {
  console.log('Creating vector indexes for GitHub entities...\n')
  
  const driver = getDriver()
  const session = driver.session()
  
  try {
    // Vector indexes for GitHub entities
    const vectorIndexes = [
      {
        name: 'github_issue_title_embedding',
        label: 'RepoIssue',
        property: 'title_embedding',
        description: 'Vector index for issue titles'
      },
      {
        name: 'github_issue_body_embedding',
        label: 'RepoIssue',
        property: 'body_embedding',
        description: 'Vector index for issue bodies'
      },
      {
        name: 'github_pr_title_embedding',
        label: 'RepoPullRequest',
        property: 'title_embedding',
        description: 'Vector index for PR titles'
      },
      {
        name: 'github_pr_body_embedding',
        label: 'RepoPullRequest',
        property: 'body_embedding',
        description: 'Vector index for PR bodies'
      },
      {
        name: 'github_commit_message_embedding',
        label: 'RepoCommit',
        property: 'message_embedding',
        description: 'Vector index for commit messages'
      },
      {
        name: 'github_file_content_embedding',
        label: 'RepoFile',
        property: 'content_embedding',
        description: 'Vector index for file content'
      },
      {
        name: 'github_function_embedding',
        label: 'RepoFunction',
        property: 'embedding',
        description: 'Vector index for function signatures and docstrings'
      },
      {
        name: 'github_class_embedding',
        label: 'RepoClass',
        property: 'embedding',
        description: 'Vector index for class definitions and docstrings'
      },
      {
        name: 'github_interface_embedding',
        label: 'RepoInterface',
        property: 'embedding',
        description: 'Vector index for interface definitions and docstrings'
      },
      {
        name: 'github_repository_embedding',
        label: 'Repository',
        property: 'description_embedding',
        description: 'Vector index for repository descriptions'
      },
      {
        name: 'github_universal_embedding',
        label: 'GitHubEntity',
        property: 'universal_embedding',
        description: 'Universal vector index for cross-entity search'
      }
    ]
    
    for (const index of vectorIndexes) {
      console.log(`Creating ${index.description}...`)
      try {
        await session.run(`
          CREATE VECTOR INDEX ${index.name} IF NOT EXISTS
          FOR (n:${index.label})
          ON (n.${index.property})
          OPTIONS {
            indexConfig: {
              \`vector.dimensions\`: 3072,
              \`vector.similarity_function\`: 'cosine'
            }
          }
        `)
        console.log(`✓ Created ${index.name}`)
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`✓ ${index.name} already exists`)
        } else {
          console.error(`✗ Failed to create ${index.name}:`, error.message)
        }
      }
    }
    
    // Create unique constraints for new entity types
    console.log('\nCreating unique constraints for code entities...')
    const constraints = [
      {
        name: 'github_function_unique',
        query: `CREATE CONSTRAINT github_function_unique IF NOT EXISTS
                FOR (fn:RepoFunction) REQUIRE fn.id IS UNIQUE`
      },
      {
        name: 'github_class_unique',
        query: `CREATE CONSTRAINT github_class_unique IF NOT EXISTS
                FOR (c:RepoClass) REQUIRE c.id IS UNIQUE`
      },
      {
        name: 'github_interface_unique',
        query: `CREATE CONSTRAINT github_interface_unique IF NOT EXISTS
                FOR (i:RepoInterface) REQUIRE i.id IS UNIQUE`
      }
    ]
    
    for (const constraint of constraints) {
      console.log(`Creating constraint: ${constraint.name}...`)
      try {
        await session.run(constraint.query)
        console.log(`✓ Created ${constraint.name}`)
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`✓ ${constraint.name} already exists`)
        } else {
          console.error(`✗ Failed to create ${constraint.name}:`, error.message)
        }
      }
    }
    
    // Wait for indexes to come online
    console.log('\nWaiting for indexes to come online...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Check index status
    console.log('\nChecking vector index status...')
    const indexResult = await session.run(`
      SHOW INDEXES
      WHERE type = 'VECTOR' AND name STARTS WITH 'github_'
    `)
    
    console.log('\nGitHub Vector Indexes:')
    indexResult.records.forEach(record => {
      const name = record.get('name')
      const state = record.get('state')
      const entityType = record.get('entityType')
      console.log(`- ${name} (${entityType}): ${state}`)
    })
    
    // Test a vector index
    console.log('\nTesting vector search...')
    const testResult = await session.run(`
      MATCH (n)
      WHERE n:RepoIssue OR n:RepoPullRequest OR n:RepoCommit OR n:RepoFile 
         OR n:RepoFunction OR n:RepoClass OR n:RepoInterface OR n:Repository
      AND (n.embedding IS NOT NULL 
           OR n.title_embedding IS NOT NULL 
           OR n.message_embedding IS NOT NULL 
           OR n.content_embedding IS NOT NULL
           OR n.description_embedding IS NOT NULL)
      RETURN labels(n)[0] as label, count(n) as count
    `)
    
    if (testResult.records.length > 0) {
      console.log('\nEntities with embeddings:')
      testResult.records.forEach(record => {
        const label = record.get('label')
        const count = record.get('count').toNumber()
        console.log(`- ${label}: ${count}`)
      })
    } else {
      console.log('\nNo entities with embeddings found yet')
    }
    
    // Show constraint status
    console.log('\nChecking constraint status...')
    const constraintResult = await session.run(`
      SHOW CONSTRAINTS
      WHERE name STARTS WITH 'github_'
    `)
    
    console.log('\nGitHub Constraints:')
    constraintResult.records.forEach(record => {
      const name = record.get('name')
      const type = record.get('type')
      const entityType = record.get('entityType')
      console.log(`- ${name} (${type} on ${entityType})`)
    })
    
  } catch (error) {
    console.error('Error creating GitHub vector indexes:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

createGitHubVectorIndexes()