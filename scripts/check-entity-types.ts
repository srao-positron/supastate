#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'

async function checkEntityTypes() {
  console.log('🔍 Checking Entity Types in Neo4j...\n')

  try {
    await neo4jService.initialize()
    
    // Check Memory types
    console.log('📊 Memory Types:')
    console.log('─'.repeat(80))
    const memoryTypes = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      RETURN m.type as type, COUNT(m) as count
      ORDER BY count DESC
    `, {})
    
    if (memoryTypes.records.length === 0) {
      console.log('No memory types found')
    } else {
      memoryTypes.records.forEach(record => {
        console.log(`${record.type || 'null'}: ${record.count?.toNumber() || 0}`)
      })
    }

    // Check CodeEntity types
    console.log('\n📊 CodeEntity Types:')
    console.log('─'.repeat(80))
    const codeTypes = await neo4jService.executeQuery(`
      MATCH (c:CodeEntity)
      RETURN c.type as type, COUNT(c) as count
      ORDER BY count DESC
    `, {})
    
    if (codeTypes.records.length === 0) {
      console.log('No code entity types found')
    } else {
      codeTypes.records.forEach(record => {
        console.log(`${record.type || 'null'}: ${record.count?.toNumber() || 0}`)
      })
    }

    // Check actual distinct values
    console.log('\n📊 Sample Memory Data:')
    console.log('─'.repeat(80))
    const sampleMemories = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      RETURN m.type as type, m.metadata as metadata
      LIMIT 5
    `, {})
    
    sampleMemories.records.forEach((record, i) => {
      console.log(`${i + 1}. Type: ${record.type || 'null'}`)
      if (record.metadata) {
        try {
          const meta = JSON.parse(record.metadata)
          console.log(`   Metadata keys: ${Object.keys(meta).join(', ')}`)
        } catch (e) {
          console.log(`   Metadata: ${record.metadata}`)
        }
      }
    })

    // Check actual distinct values for code
    console.log('\n📊 Sample CodeEntity Data:')
    console.log('─'.repeat(80))
    const sampleCode = await neo4jService.executeQuery(`
      MATCH (c:CodeEntity)
      RETURN c.type as type, c.language as language, c.path as path
      LIMIT 10
    `, {})
    
    sampleCode.records.forEach((record, i) => {
      console.log(`${i + 1}. Type: ${record.type || 'null'}, Language: ${record.language || 'null'}, Path: ${record.path}`)
    })

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

checkEntityTypes()