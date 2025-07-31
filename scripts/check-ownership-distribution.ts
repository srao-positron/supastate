#!/usr/bin/env npx tsx

/**
 * Check ownership distribution in Neo4j
 */

import * as dotenv from 'dotenv'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI as string,
  neo4j.auth.basic(process.env.NEO4J_USER as string, process.env.NEO4J_PASSWORD as string)
)

async function checkOwnershipDistribution() {
  const session = driver.session()
  
  try {
    console.log('=== Ownership Distribution in Neo4j ===\n')
    
    // Check Memory nodes
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      WITH 
        count(CASE WHEN m.workspace_id IS NOT NULL THEN 1 END) as withWorkspace,
        count(CASE WHEN m.workspace_id IS NULL AND m.user_id IS NOT NULL THEN 1 END) as userOnly,
        count(CASE WHEN m.workspace_id IS NULL AND m.user_id IS NULL THEN 1 END) as orphaned,
        count(m) as total
      RETURN withWorkspace, userOnly, orphaned, total
    `)
    
    const mem = memoryResult.records[0]
    console.log('Memory nodes:')
    console.log(`  Total: ${mem.get('total').low || 0}`)
    console.log(`  With workspace_id: ${mem.get('withWorkspace').low || 0}`)
    console.log(`  User-only (no workspace): ${mem.get('userOnly').low || 0}`)
    console.log(`  Orphaned (no user/workspace): ${mem.get('orphaned').low || 0}`)
    
    // Check EntitySummary nodes
    const summaryResult = await session.run(`
      MATCH (e:EntitySummary)
      WITH 
        count(CASE WHEN e.workspace_id IS NOT NULL THEN 1 END) as withWorkspace,
        count(CASE WHEN e.workspace_id IS NULL AND e.user_id IS NOT NULL THEN 1 END) as userOnly,
        count(CASE WHEN e.workspace_id IS NULL AND e.user_id IS NULL THEN 1 END) as orphaned,
        count(e) as total
      RETURN withWorkspace, userOnly, orphaned, total
    `)
    
    const sum = summaryResult.records[0]
    console.log('\nEntitySummary nodes:')
    console.log(`  Total: ${sum.get('total').low || 0}`)
    console.log(`  With workspace_id: ${sum.get('withWorkspace').low || 0}`)
    console.log(`  User-only (no workspace): ${sum.get('userOnly').low || 0}`)
    console.log(`  Orphaned (no user/workspace): ${sum.get('orphaned').low || 0}`)
    
    // Check CodeEntity nodes
    const codeResult = await session.run(`
      MATCH (c:CodeEntity)
      WITH 
        count(CASE WHEN c.workspace_id IS NOT NULL THEN 1 END) as withWorkspace,
        count(CASE WHEN c.workspace_id IS NULL AND c.user_id IS NOT NULL THEN 1 END) as userOnly,
        count(CASE WHEN c.workspace_id IS NULL AND c.user_id IS NULL THEN 1 END) as orphaned,
        count(c) as total
      RETURN withWorkspace, userOnly, orphaned, total
    `)
    
    const code = codeResult.records[0]
    console.log('\nCodeEntity nodes:')
    console.log(`  Total: ${code.get('total').low || 0}`)
    console.log(`  With workspace_id: ${code.get('withWorkspace').low || 0}`)
    console.log(`  User-only (no workspace): ${code.get('userOnly').low || 0}`)
    console.log(`  Orphaned (no user/workspace): ${code.get('orphaned').low || 0}`)
    
    // Sample some user-only data
    console.log('\n=== Sample User-Only Data ===')
    
    const sampleResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.workspace_id IS NULL AND m.user_id IS NOT NULL
      RETURN m.user_id as userId, count(m) as count
      ORDER BY count DESC
      LIMIT 5
    `)
    
    console.log('\nTop users with personal data (no workspace):')
    sampleResult.records.forEach(record => {
      console.log(`  ${record.get('userId')}: ${record.get('count').low || 0} memories`)
    })
    
    // Check EntitySummary with user_id only
    const entityUserResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.workspace_id IS NULL AND e.user_id IS NOT NULL
      RETURN e.user_id as userId, count(e) as count
      ORDER BY count DESC
      LIMIT 5
    `)
    
    console.log('\nTop users with EntitySummary (no workspace):')
    entityUserResult.records.forEach(record => {
      console.log(`  ${record.get('userId')}: ${record.get('count').low || 0} summaries`)
    })
    
  } finally {
    await session.close()
    await driver.close()
  }
}

checkOwnershipDistribution().catch(console.error)
