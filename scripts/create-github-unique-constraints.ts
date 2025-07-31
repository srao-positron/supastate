#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { getDriver } from '../src/lib/neo4j/client'

dotenv.config({ path: '.env.local' })

async function createUniqueConstraints() {
  console.log('Creating unique constraints for GitHub entities...\n')
  
  const driver = getDriver()
  const session = driver.session()
  
  try {
    // Create unique constraints to prevent duplicate entries
    const constraints = [
      {
        name: 'github_repository_unique',
        query: `CREATE CONSTRAINT github_repository_unique IF NOT EXISTS
                FOR (r:Repository) REQUIRE r.github_id IS UNIQUE`
      },
      {
        name: 'github_issue_unique',
        query: `CREATE CONSTRAINT github_issue_unique IF NOT EXISTS
                FOR (i:RepoIssue) REQUIRE i.id IS UNIQUE`
      },
      {
        name: 'github_pr_unique',
        query: `CREATE CONSTRAINT github_pr_unique IF NOT EXISTS
                FOR (pr:RepoPullRequest) REQUIRE pr.id IS UNIQUE`
      },
      {
        name: 'github_commit_unique',
        query: `CREATE CONSTRAINT github_commit_unique IF NOT EXISTS
                FOR (c:RepoCommit) REQUIRE c.sha IS UNIQUE`
      },
      {
        name: 'github_file_unique',
        query: `CREATE CONSTRAINT github_file_unique IF NOT EXISTS
                FOR (f:RepoFile) REQUIRE f.id IS UNIQUE`
      },
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
    
    // Create composite indexes for faster lookups
    const indexes = [
      {
        name: 'github_issue_repo_number',
        query: `CREATE INDEX github_issue_repo_number IF NOT EXISTS
                FOR (i:RepoIssue) ON (i.number)`
      },
      {
        name: 'github_pr_repo_number',
        query: `CREATE INDEX github_pr_repo_number IF NOT EXISTS
                FOR (pr:RepoPullRequest) ON (pr.number)`
      },
      {
        name: 'github_file_path',
        query: `CREATE INDEX github_file_path IF NOT EXISTS
                FOR (f:RepoFile) ON (f.path)`
      },
      {
        name: 'github_repo_full_name',
        query: `CREATE INDEX github_repo_full_name IF NOT EXISTS
                FOR (r:Repository) ON (r.full_name)`
      }
    ]
    
    console.log('\nCreating indexes for performance...')
    for (const index of indexes) {
      console.log(`Creating index: ${index.name}...`)
      try {
        await session.run(index.query)
        console.log(`✓ Created ${index.name}`)
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`✓ ${index.name} already exists`)
        } else {
          console.error(`✗ Failed to create ${index.name}:`, error.message)
        }
      }
    }
    
    // List all constraints
    console.log('\nListing all GitHub-related constraints...')
    const constraintResult = await session.run(`
      SHOW CONSTRAINTS
      WHERE name STARTS WITH 'github_'
    `)
    
    console.log('\nActive constraints:')
    constraintResult.records.forEach(record => {
      const name = record.get('name')
      const type = record.get('type')
      const entityType = record.get('entityType')
      console.log(`- ${name} (${type} on ${entityType})`)
    })
    
  } catch (error) {
    console.error('Error creating constraints:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

createUniqueConstraints()