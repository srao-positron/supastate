#!/usr/bin/env npx tsx

/**
 * Trace how EntitySummary nodes with null entityId are created
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'
import type { Session } from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI!
const NEO4J_USERNAME = process.env.NEO4J_USER!
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
)

async function traceNullEntitySummaries() {
  let session: Session | null = null
  
  try {
    console.log('=== Tracing NULL EntitySummary Creation ===\n')
    
    session = driver.session()
    
    // Check the structure of one null EntitySummary
    const sampleQuery = `
      MATCH (s:EntitySummary)
      WHERE s.entityId IS NULL OR s.entity_id IS NULL
      RETURN s, ID(s) as nodeId,
             [(s)-[r:SUMMARIZES]->(e) | {
               relId: ID(r),
               entityType: labels(e),
               entityId: e.id,
               hasContent: e.content IS NOT NULL
             }] as relationships
      LIMIT 5
    `
    
    const sampleResult = await session.run(sampleQuery)
    
    console.log('Sample NULL EntitySummary nodes:')
    sampleResult.records.forEach((record, idx) => {
      const summary = record.get('s').properties
      const nodeId = record.get('nodeId')
      const relationships = record.get('relationships')
      
      console.log(`\n${idx + 1}. Node ID: ${nodeId}`)
      console.log('   Properties:')
      Object.entries(summary).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          console.log(`     ${key}: ${typeof value === 'object' ? JSON.stringify(value).substring(0, 50) + '...' : value}`)
        }
      })
      
      console.log('   SUMMARIZES relationships:')
      if (relationships.length === 0) {
        console.log('     None')
      } else {
        relationships.forEach((rel: any) => {
          console.log(`     -> ${rel.entityType} (ID: ${rel.entityId}, Has content: ${rel.hasContent})`)
        })
      }
    })
    
    // Check if there's a pattern in the property names
    console.log('\n\n=== Checking Property Name Patterns ===\n')
    
    const propsQuery = `
      MATCH (s:EntitySummary)
      WHERE s.entityId IS NULL
      WITH s LIMIT 10
      RETURN DISTINCT keys(s) as properties
    `
    
    const propsResult = await session.run(propsQuery)
    
    console.log('Property keys found on NULL entityId summaries:')
    propsResult.records.forEach(record => {
      const props = record.get('properties')
      console.log(`  ${props.join(', ')}`)
    })
    
    // Check if these are being created with wrong property names
    console.log('\n\n=== Checking for Property Name Mismatch ===\n')
    
    const mismatchQuery = `
      MATCH (s:EntitySummary)
      RETURN 
        COUNT(CASE WHEN s.entityId IS NOT NULL THEN 1 END) as withEntityId,
        COUNT(CASE WHEN s.entity_id IS NOT NULL THEN 1 END) as withEntity_id,
        COUNT(CASE WHEN s.entityId IS NULL AND s.entity_id IS NULL THEN 1 END) as withNeither,
        COUNT(*) as total
    `
    
    const mismatchResult = await session.run(mismatchQuery)
    const counts = mismatchResult.records[0]
    
    console.log('Property name analysis:')
    console.log(`  With 'entityId': ${counts.get('withEntityId').toNumber()}`)
    console.log(`  With 'entity_id': ${counts.get('withEntity_id').toNumber()}`)
    console.log(`  With neither: ${counts.get('withNeither').toNumber()}`)
    console.log(`  Total: ${counts.get('total').toNumber()}`)
    
    // Check if pattern detection is creating these
    console.log('\n\n=== Checking Pattern Detection Logs ===\n')
    
    // Check when these nodes were created by looking at their IDs
    const idRangeQuery = `
      MATCH (s:EntitySummary)
      WHERE s.entityId IS NULL AND s.entity_id IS NULL
      WITH ID(s) as nodeId
      RETURN MIN(nodeId) as minId, MAX(nodeId) as maxId, COUNT(*) as count
    `
    
    const idRangeResult = await session.run(idRangeQuery)
    const idRange = idRangeResult.records[0]
    
    console.log('NULL EntitySummary node ID range:')
    console.log(`  Min ID: ${idRange.get('minId')}`)
    console.log(`  Max ID: ${idRange.get('maxId')}`)
    console.log(`  Count: ${idRange.get('count').toNumber()}`)
    
    // Compare with properly created summaries
    const properQuery = `
      MATCH (s:EntitySummary)
      WHERE s.entity_id IS NOT NULL
      WITH ID(s) as nodeId
      RETURN MIN(nodeId) as minId, MAX(nodeId) as maxId, COUNT(*) as count
    `
    
    const properResult = await session.run(properQuery)
    
    if (properResult.records.length > 0) {
      const properRange = properResult.records[0]
      console.log('\nProper EntitySummary node ID range:')
      console.log(`  Min ID: ${properRange.get('minId')}`)
      console.log(`  Max ID: ${properRange.get('maxId')}`)
      console.log(`  Count: ${properRange.get('count').toNumber()}`)
    }
    
    // Find pattern in relationships
    console.log('\n\n=== Analyzing Relationship Creation Pattern ===\n')
    
    const relPatternQuery = `
      MATCH (s:EntitySummary)-[r:SUMMARIZES]->(e)
      WHERE s.entityId IS NULL AND s.entity_id IS NULL
      WITH labels(e) as entityType, COUNT(*) as count
      RETURN entityType, count
      ORDER BY count DESC
    `
    
    const relPatternResult = await session.run(relPatternQuery)
    
    console.log('NULL summaries are connected to:')
    relPatternResult.records.forEach(record => {
      console.log(`  ${record.get('entityType')}: ${record.get('count').toNumber()}`)
    })
    
    // Check if it's happening during batch processing
    console.log('\n\n=== Checking Batch Processing ===\n')
    
    const batchQuery = `
      MATCH (s:EntitySummary)
      WHERE s.entityId IS NULL AND s.entity_id IS NULL
      RETURN DISTINCT s.batch_id as batchId, COUNT(*) as count
      ORDER BY count DESC
      LIMIT 10
    `
    
    const batchResult = await session.run(batchQuery)
    
    console.log('Batch IDs associated with NULL summaries:')
    batchResult.records.forEach(record => {
      const batchId = record.get('batchId')
      const count = record.get('count').toNumber()
      console.log(`  Batch ${batchId || 'NULL'}: ${count} summaries`)
    })
    
  } catch (error) {
    console.error('Error tracing null summaries:', error)
  } finally {
    if (session) {
      await session.close()
    }
    await driver.close()
  }
}

// Run the trace
traceNullEntitySummaries()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })