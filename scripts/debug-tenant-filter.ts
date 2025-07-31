#!/usr/bin/env npx tsx
import neo4j from 'neo4j-driver'

const NEO4J_URI = 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = 'XROfdG-0_Idz6zzm6s1C5Bwao6GgW_84T7BeT_uvtW8'

function getTenantFilter(workspaceId?: string, userId?: string, alias: string = 'e'): string {
  if (!workspaceId && !userId) {
    return 'TRUE'
  }
  
  if (workspaceId) {
    return `(${alias}.workspace_id = '${workspaceId}' OR (${alias}.user_id = '${userId}' AND ${alias}.workspace_id IS NULL))`
  } else if (userId) {
    return `(${alias}.user_id = '${userId}' AND ${alias}.workspace_id IS NULL)`
  }
  
  return 'TRUE'
}

async function main() {
  console.log('=== Debugging Tenant Filter Issue ===\n')
  
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    // Test case 1: With workspaceId in "user:id" format
    const workspaceId = 'user:a02c3fed-3a24-442f-becc-97bac8b75e90'
    let userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
    
    // Extract userId from workspace_id if it's in "user:id" format
    if (workspaceId && workspaceId.startsWith('user:')) {
      userId = workspaceId.substring(5)
      console.log('1. Extracted userId from workspaceId:')
      console.log('  Original workspaceId:', workspaceId)
      console.log('  Extracted userId:', userId)
      console.log('  Setting workspaceId to undefined for personal data')
      
      // Test the current pattern processor logic
      const tenantFilter = getTenantFilter(undefined, userId, 'm')
      console.log('  Tenant filter:', tenantFilter)
      
      // Test query
      const result1 = await session.run(`
        MATCH (m:EntitySummary {entity_type: 'memory'})
        WHERE m.embedding IS NOT NULL
          AND ${tenantFilter}
        WITH m
        LIMIT 20
        RETURN collect(m) as memories
      `)
      
      const memories1 = result1.records[0]?.get('memories') || []
      console.log('  Memories found with this filter:', memories1.length)
    }
    
    // Test case 2: With the original values (what the pattern processor is likely using)
    console.log('\n2. Testing with original values (likely what pattern processor uses):')
    const tenantFilter2 = getTenantFilter(workspaceId, userId, 'm')
    console.log('  workspaceId:', workspaceId)
    console.log('  userId:', userId) 
    console.log('  Tenant filter:', tenantFilter2)
    
    const result2 = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL
        AND ${tenantFilter2}
      WITH m
      LIMIT 20
      RETURN collect(m) as memories
    `)
    
    const memories2 = result2.records[0]?.get('memories') || []
    console.log('  Memories found:', memories2.length)
    
    // Test case 3: Check what workspace_id values actually exist
    console.log('\n3. Checking actual workspace_id values in EntitySummary:')
    const wsResult = await session.run(`
      MATCH (e:EntitySummary)
      WHERE e.workspace_id IS NOT NULL
      RETURN DISTINCT e.workspace_id as workspace_id
      LIMIT 10
    `)
    
    console.log('  Distinct workspace_ids:')
    for (const record of wsResult.records) {
      console.log('    -', record.get('workspace_id'))
    }
    
    // Test case 4: Count memories by workspace_id pattern
    console.log('\n4. Counting memories by workspace pattern:')
    const countResult = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL
      WITH 
        CASE 
          WHEN m.workspace_id IS NULL THEN 'NULL'
          WHEN m.workspace_id STARTS WITH 'user:' THEN 'user:*'
          ELSE 'other'
        END as pattern,
        count(*) as count
      RETURN pattern, count
      ORDER BY count DESC
    `)
    
    for (const record of countResult.records) {
      console.log(`  ${record.get('pattern')}: ${record.get('count').toNumber()}`)
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)