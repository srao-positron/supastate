#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { getDriver } from '../src/lib/neo4j/client'

dotenv.config({ path: '.env.local' })

async function checkTestRepoEntities() {
  const driver = getDriver()
  const session = driver.session()
  
  try {
    console.log('Checking for CodeEntity nodes from test repository...\n')
    
    // Check for any entities from the test repo
    const result = await session.run(`
      MATCH (ce:CodeEntity)
      WHERE ce.repository = 'local/supastate-test-repo' 
         OR ce.file_path CONTAINS 'supastate-test-repo'
         OR ce.name IN ['user-service.ts', 'data_processor.py', 'TodoList.tsx', 'feature-code.ts']
      RETURN ce.name as name, ce.type as type, ce.file_path as filePath, ce.id as id, ce.repository as repo
      ORDER BY ce.file_path
    `)
    
    console.log(`Found ${result.records.length} CodeEntity nodes:`)
    if (result.records.length > 0) {
      result.records.forEach(record => {
        console.log(`- ${record.get('type')}: ${record.get('name')}`)
        console.log(`  File: ${record.get('filePath')}`)
        console.log(`  Repository: ${record.get('repo') || 'Not set'}`)
        console.log(`  ID: ${record.get('id')}`)
      })
    } else {
      console.log('No entities found yet.')
    }
    
    // Check for any recent CodeEntity nodes to see if parsing is working
    console.log('\nChecking recent CodeEntity nodes (last 10):')
    const recentResult = await session.run(`
      MATCH (ce:CodeEntity)
      WHERE ce.created_at IS NOT NULL
      RETURN ce.name as name, ce.type as type, ce.repository as repo, ce.created_at as createdAt
      ORDER BY ce.created_at DESC
      LIMIT 10
    `)
    
    if (recentResult.records.length > 0) {
      recentResult.records.forEach(record => {
        console.log(`- ${record.get('type')}: ${record.get('name')} (${record.get('repo')})`)
        console.log(`  Created: ${record.get('createdAt')}`)
      })
    } else {
      console.log('No recent entities found.')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkTestRepoEntities()