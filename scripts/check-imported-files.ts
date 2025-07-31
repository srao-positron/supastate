#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { getDriver } from '../src/lib/neo4j/client'

dotenv.config({ path: '.env.local' })

async function checkImportedFiles() {
  console.log('Checking imported GitHub files...\n')
  
  const driver = getDriver()
  const session = driver.session()
  
  try {
    // Check file types
    const result = await session.run(`
      MATCH (f:RepoFile)
      RETURN f.language as lang, count(f) as count
      ORDER BY count DESC
    `)
    
    console.log('File types imported:')
    result.records.forEach(record => {
      console.log(`  - ${record.get('lang')}: ${record.get('count')}`)
    })
    
    // Check TypeScript files
    console.log('\nTypeScript/JavaScript files:')
    const tsResult = await session.run(`
      MATCH (f:RepoFile)
      WHERE f.language IN ['ts', 'tsx', 'js', 'jsx']
      RETURN f.path as path, f.size as size
      ORDER BY f.path
      LIMIT 20
    `)
    
    if (tsResult.records.length > 0) {
      tsResult.records.forEach(record => {
        console.log(`  - ${record.get('path')} (${record.get('size')} bytes)`)
      })
    } else {
      console.log('  No TypeScript/JavaScript files found')
    }
    
  } catch (error) {
    console.error('Error checking files:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

checkImportedFiles()