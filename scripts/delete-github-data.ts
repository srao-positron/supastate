#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { getDriver } from '../src/lib/neo4j/client'

dotenv.config({ path: '.env.local' })

async function deleteGitHubData() {
  console.log('Deleting all GitHub data from Neo4j...\n')
  
  const driver = getDriver()
  const session = driver.session()
  
  try {
    // Count existing data first
    console.log('Counting existing GitHub data...')
    
    const counts = await session.run(`
      MATCH (r:Repository) WITH count(r) as repos
      MATCH (i:RepoIssue) WITH repos, count(i) as issues
      MATCH (pr:RepoPullRequest) WITH repos, issues, count(pr) as prs
      MATCH (c:RepoCommit) WITH repos, issues, prs, count(c) as commits
      MATCH (f:RepoFile) WITH repos, issues, prs, commits, count(f) as files
      RETURN repos, issues, prs, commits, files
    `)
    
    if (counts.records.length > 0) {
      const record = counts.records[0]
      console.log('Current data:')
      console.log(`- Repositories: ${record.get('repos')}`)
      console.log(`- Issues: ${record.get('issues')}`)
      console.log(`- Pull Requests: ${record.get('prs')}`)
      console.log(`- Commits: ${record.get('commits')}`)
      console.log(`- Files: ${record.get('files')}`)
    }
    
    // Delete all GitHub-related nodes and relationships
    console.log('\nDeleting GitHub data...')
    
    // Delete files first (leaf nodes)
    await session.run(`
      MATCH (f:RepoFile)
      DETACH DELETE f
    `)
    console.log('✓ Deleted RepoFile nodes')
    
    // Delete commits
    await session.run(`
      MATCH (c:RepoCommit)
      DETACH DELETE c
    `)
    console.log('✓ Deleted RepoCommit nodes')
    
    // Delete pull requests
    await session.run(`
      MATCH (pr:RepoPullRequest)
      DETACH DELETE pr
    `)
    console.log('✓ Deleted RepoPullRequest nodes')
    
    // Delete issues
    await session.run(`
      MATCH (i:RepoIssue)
      DETACH DELETE i
    `)
    console.log('✓ Deleted RepoIssue nodes')
    
    // Delete repositories
    await session.run(`
      MATCH (r:Repository)
      DETACH DELETE r
    `)
    console.log('✓ Deleted Repository nodes')
    
    // Verify deletion
    console.log('\nVerifying deletion...')
    const verifyResult = await session.run(`
      MATCH (n)
      WHERE n:Repository OR n:RepoIssue OR n:RepoPullRequest OR n:RepoCommit OR n:RepoFile
      RETURN count(n) as remaining
    `)
    
    const remaining = verifyResult.records[0].get('remaining').toNumber()
    if (remaining === 0) {
      console.log('✅ All GitHub data successfully deleted from Neo4j')
    } else {
      console.log(`⚠️  Warning: ${remaining} GitHub nodes still remain`)
    }
    
  } catch (error) {
    console.error('Error deleting GitHub data:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

deleteGitHubData()