#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'

dotenv.config({ path: '.env.local' })

async function deleteAllData() {
  console.log('=== DELETING ALL MEMORIES AND CODE DATA ===\n')
  console.log('⚠️  WARNING: This will delete ALL data from both Supabase and Neo4j!')
  console.log('Press Ctrl+C within 5 seconds to cancel...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // 1. Clear queues first
  console.log('1. Clearing message queues...')
  
  // Clear memory ingestion queue
  const { data: memoryMsgs } = await supabase.rpc('pgmq_read', {
    queue_name: 'memory_ingestion',
    vt: 1,
    qty: 1000 // Read up to 1000 messages
  })
  
  if (memoryMsgs && memoryMsgs.length > 0) {
    console.log(`  - Deleting ${memoryMsgs.length} messages from memory_ingestion queue`)
    for (const msg of memoryMsgs) {
      await supabase.rpc('pgmq_delete', {
        queue_name: 'memory_ingestion',
        msg_id: msg.msg_id
      })
    }
  }
  
  // Clear pattern detection queue
  const { data: patternMsgs } = await supabase.rpc('pgmq_read', {
    queue_name: 'pattern_detection',
    vt: 1,
    qty: 1000
  })
  
  if (patternMsgs && patternMsgs.length > 0) {
    console.log(`  - Deleting ${patternMsgs.length} messages from pattern_detection queue`)
    for (const msg of patternMsgs) {
      await supabase.rpc('pgmq_delete', {
        queue_name: 'pattern_detection',
        msg_id: msg.msg_id
      })
    }
  }
  
  // 2. Delete from Supabase
  console.log('\n2. Deleting from Supabase...')
  
  // Delete memories
  const { error: memError, count: memCount } = await supabase
    .from('memories')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
  console.log(`  - Deleted memories: ${memCount || 'all'}`)
  if (memError) console.error('    Error:', memError)
  
  // Delete code files
  const { error: codeError, count: codeCount } = await supabase
    .from('code_files')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    
  console.log(`  - Deleted code files: ${codeCount || 'all'}`)
  if (codeError) console.error('    Error:', codeError)
  
  // Delete code entities
  const { error: entityError, count: entityCount } = await supabase
    .from('code_entities')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    
  console.log(`  - Deleted code entities: ${entityCount || 'all'}`)
  if (entityError) console.error('    Error:', entityError)
  
  // Delete pattern processor logs
  const { error: logError, count: logCount } = await supabase
    .from('pattern_processor_logs')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    
  console.log(`  - Deleted pattern logs: ${logCount || 'all'}`)
  if (logError) console.error('    Error:', logError)
  
  // 3. Delete from Neo4j
  console.log('\n3. Deleting from Neo4j...')
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const session = driver.session()
  
  try {
    // Delete all Memory nodes
    const memoryCount = await session.run(`
      MATCH (m:Memory)
      WITH count(m) as total
      RETURN total
    `)
    const memoryTotal = memoryCount.records[0]?.get('total').toInt() || 0
    
    if (memoryTotal > 0) {
      await session.run(`MATCH (m:Memory) DETACH DELETE m`)
      console.log(`  - Deleted Memory nodes: ${memoryTotal}`)
    } else {
      console.log(`  - Deleted Memory nodes: 0`)
    }
    
    // Delete all CodeEntity nodes
    const codeCount = await session.run(`
      MATCH (c:CodeEntity)
      WITH count(c) as total
      RETURN total
    `)
    const codeTotal = codeCount.records[0]?.get('total').toInt() || 0
    
    if (codeTotal > 0) {
      await session.run(`MATCH (c:CodeEntity) DETACH DELETE c`)
      console.log(`  - Deleted CodeEntity nodes: ${codeTotal}`)
    } else {
      console.log(`  - Deleted CodeEntity nodes: 0`)
    }
    
    // Delete all EntitySummary nodes
    const summaryCount = await session.run(`
      MATCH (s:EntitySummary)
      WITH count(s) as total
      RETURN total
    `)
    const summaryTotal = summaryCount.records[0]?.get('total').toInt() || 0
    
    if (summaryTotal > 0) {
      await session.run(`MATCH (s:EntitySummary) DETACH DELETE s`)
      console.log(`  - Deleted EntitySummary nodes: ${summaryTotal}`)
    } else {
      console.log(`  - Deleted EntitySummary nodes: 0`)
    }
    
    // Delete all PatternSummary nodes
    const patternCount = await session.run(`
      MATCH (p:PatternSummary)
      WITH count(p) as total
      RETURN total
    `)
    const patternTotal = patternCount.records[0]?.get('total').toInt() || 0
    
    if (patternTotal > 0) {
      await session.run(`MATCH (p:PatternSummary) DETACH DELETE p`)
      console.log(`  - Deleted PatternSummary nodes: ${patternTotal}`)
    } else {
      console.log(`  - Deleted PatternSummary nodes: 0`)
    }
    
    // Delete all relationships (should be gone already)
    const relResult = await session.run(`
      MATCH ()-[r]->()
      WITH count(r) as count
      DELETE r
      RETURN count
    `)
    console.log(`  - Deleted relationships: ${relResult.records[0]?.get('count') || 0}`)
    
  } finally {
    await session.close()
    await driver.close()
  }
  
  console.log('\n✅ All data deleted successfully!')
  console.log('\nNote: Camille can now start fresh with new data ingestion.')
}

deleteAllData().catch(console.error)