#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { neo4jService } from '../src/lib/neo4j/service'

async function checkCodeMetadata() {
  console.log('🔍 Checking Code Metadata for Better Categorization...\n')

  try {
    await neo4jService.initialize()
    
    // Check metadata structure
    console.log('📊 Code Entity Metadata Analysis:')
    console.log('─'.repeat(80))
    const metadataAnalysis = await neo4jService.executeQuery(`
      MATCH (c:CodeEntity)
      WHERE c.metadata IS NOT NULL
      WITH c
      LIMIT 5
      RETURN c.name as name, c.metadata as metadata, c.language as language
    `, {})
    
    metadataAnalysis.records.forEach((record, i) => {
      console.log(`\n${i + 1}. ${record.name} (${record.language})`)
      try {
        const meta = JSON.parse(record.metadata)
        console.log('   Has functions:', (meta.functions || []).length > 0)
        console.log('   Has classes:', (meta.classes || []).length > 0)
        console.log('   Has components:', (meta.components || []).length > 0)
        console.log('   Has types:', (meta.types || []).length > 0)
        console.log('   Has exports:', (meta.exports || []).length > 0)
      } catch (e) {
        console.log('   Invalid metadata')
      }
    })

    // Count actual entity types from metadata
    console.log('\n📊 Actual Entity Types from Metadata:')
    console.log('─'.repeat(80))
    const typeCount = await neo4jService.executeQuery(`
      MATCH (c:CodeEntity)
      WHERE c.metadata IS NOT NULL
      WITH c, 
           CASE 
             WHEN c.metadata CONTAINS '"components":[' AND c.metadata CONTAINS '"name"' THEN 'component'
             WHEN c.metadata CONTAINS '"classes":[' AND c.metadata CONTAINS '"name"' THEN 'class'
             WHEN c.metadata CONTAINS '"functions":[' AND c.metadata CONTAINS '"name"' THEN 'function'
             WHEN c.metadata CONTAINS '"types":[' AND c.metadata CONTAINS '"name"' THEN 'type'
             WHEN c.language = 'json' THEN 'config'
             WHEN c.language IN ['md', 'mdx'] THEN 'documentation'
             WHEN c.path CONTAINS 'test' OR c.path CONTAINS 'spec' THEN 'test'
             ELSE 'other'
           END as entityType
      RETURN entityType, COUNT(c) as count
      ORDER BY count DESC
    `, {})
    
    typeCount.records.forEach(record => {
      console.log(`${record.entityType}: ${record.count?.toNumber() || 0}`)
    })

    // Language distribution might be more useful
    console.log('\n📊 Language Distribution:')
    console.log('─'.repeat(80))
    const langDist = await neo4jService.executeQuery(`
      MATCH (c:CodeEntity)
      RETURN c.language as language, COUNT(c) as count
      ORDER BY count DESC
      LIMIT 10
    `, {})
    
    langDist.records.forEach(record => {
      console.log(`${record.language || 'unknown'}: ${record.count?.toNumber() || 0}`)
    })

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    console.log('\n🎯 Done!')
  }
}

checkCodeMetadata()