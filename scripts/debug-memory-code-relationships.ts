#!/usr/bin/env npx tsx
import neo4j from 'neo4j-driver'
import { createClient } from '@supabase/supabase-js'

const NEO4J_URI = 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = 'neo4j'
const NEO4J_PASSWORD = 'XROfdG-0_Idz6zzm6s1C5Bwao6GgW_84T7BeT_uvtW8'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Debugging Memory-Code Relationships ===\n')
  
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
  
  const session = driver.session()
  
  try {
    // 1. Test tenant filter with actual user data
    console.log('1. Testing tenant filter logic:')
    const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
    const workspaceId = 'user:a02c3fed-3a24-442f-becc-97bac8b75e90'
    
    // Test getOwnershipFilter logic
    const tenantFilter = workspaceId 
      ? `(m.workspace_id = '${workspaceId}' OR (m.user_id = '${userId}' AND m.workspace_id IS NULL))`
      : `(m.user_id = '${userId}' AND m.workspace_id IS NULL)`
    
    console.log('  Workspace ID:', workspaceId)
    console.log('  User ID:', userId)
    console.log('  Tenant filter:', tenantFilter)
    
    // 2. Check how many memories match this filter
    console.log('\n2. Checking memories with tenant filter:')
    const memoryCountResult = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL
        AND ${tenantFilter}
      RETURN count(m) as count
    `)
    
    const memoryCount = memoryCountResult.records[0]?.get('count')
    console.log('  Total memories matching filter:', memoryCount)
    
    // 3. Test the exact query used in pattern processor
    console.log('\n3. Testing pattern processor query:')
    const batchResult = await session.run(`
      MATCH (m:EntitySummary {entity_type: 'memory'})
      WHERE m.embedding IS NOT NULL
        AND ${tenantFilter}
      WITH m
      LIMIT 20
      RETURN collect(m) as memories
    `)
    
    const memories = batchResult.records[0]?.get('memories')
    console.log('  Memories returned:', memories?.length || 0)
    
    // 4. Examine memory structure
    if (memories && memories.length > 0) {
      console.log('\n4. Memory structure analysis:')
      const firstMemory = memories[0]
      console.log('  Type:', typeof firstMemory)
      console.log('  Constructor:', firstMemory?.constructor?.name)
      console.log('  Has properties field:', 'properties' in firstMemory)
      
      // Check properties access
      if (firstMemory.properties) {
        console.log('\n  Properties via .properties:')
        console.log('    entity_id:', firstMemory.properties.entity_id)
        console.log('    project_name:', firstMemory.properties.project_name)
        console.log('    user_id:', firstMemory.properties.user_id)
        console.log('    workspace_id:', firstMemory.properties.workspace_id)
        console.log('    embedding exists:', !!firstMemory.properties.embedding)
      } else {
        console.log('\n  Direct properties:')
        console.log('    entity_id:', firstMemory.entity_id)
        console.log('    project_name:', firstMemory.project_name)
        console.log('    user_id:', firstMemory.user_id)
        console.log('    workspace_id:', firstMemory.workspace_id)
        console.log('    embedding exists:', !!firstMemory.embedding)
      }
    }
    
    // 5. Check code entities
    console.log('\n5. Checking code entities:')
    const codeCountResult = await session.run(`
      MATCH (c:EntitySummary {entity_type: 'code'})
      WHERE c.embedding IS NOT NULL
        AND ${tenantFilter.replace(/m\./g, 'c.')}
      RETURN count(c) as count
    `)
    
    const codeCount = codeCountResult.records[0]?.get('count')
    console.log('  Total code entities matching filter:', codeCount)
    
    // 6. Test vector similarity search
    if (memories && memories.length > 0 && codeCount > 0) {
      console.log('\n6. Testing vector similarity search:')
      const testMemory = memories[0]
      const memoryEmbedding = testMemory.properties?.embedding || testMemory.embedding
      
      if (memoryEmbedding) {
        const similarityResult = await session.run(`
          MATCH (c:EntitySummary {entity_type: 'code'})
          WHERE c.embedding IS NOT NULL
            AND ${tenantFilter.replace(/m\./g, 'c.')}
          WITH c, vector.similarity.cosine(c.embedding, $embedding) AS similarity
          WHERE similarity >= 0.75
          RETURN c.entity_id as entity_id, similarity
          ORDER BY similarity DESC
          LIMIT 5
        `, {
          embedding: memoryEmbedding
        })
        
        console.log('  Similar code entities found:', similarityResult.records.length)
        for (const record of similarityResult.records) {
          console.log(`    ${record.get('entity_id')}: ${record.get('similarity').toFixed(3)}`)
        }
      }
    }
    
    // 7. Check recent pattern processor logs
    console.log('\n7. Recent pattern processor logs:')
    const { data: logs } = await supabase
      .from('pattern_processor_logs')
      .select('*')
      .or('message.like.%memory-code%,message.like.%detectMemoryCodeRelationships%')
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (logs && logs.length > 0) {
      for (const log of logs) {
        const time = new Date(log.created_at).toLocaleTimeString()
        console.log(`  [${time}] ${log.message}`)
        if (log.metadata?.workspaceId || log.metadata?.userId) {
          console.log(`    Context: workspace=${log.metadata.workspaceId}, user=${log.metadata.userId}`)
        }
      }
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch(console.error)