#!/usr/bin/env tsx
import { config } from 'dotenv'
import { resolve } from 'path'
import { executeQuery, getDriver } from '../src/lib/neo4j/client'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

async function truncateAllData() {
  console.log('⚠️  WARNING: This will delete ALL data from Neo4j and Supabase!')
  console.log('Starting in 3 seconds... Press Ctrl+C to cancel.\n')
  
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  // 1. Truncate Neo4j data
  console.log('🗑️  Truncating Neo4j data...')
  const driver = getDriver()
  
  try {
    // Delete all nodes and relationships
    console.log('   Deleting all nodes and relationships...')
    await executeQuery(`
      MATCH (n)
      DETACH DELETE n
    `)
    console.log('   ✅ Neo4j data truncated successfully\n')
    
    // Verify deletion
    const countResult = await executeQuery(`
      MATCH (n)
      RETURN count(n) as nodeCount
    `)
    console.log(`   Verification: ${countResult.records[0].nodeCount} nodes remaining\n`)
    
  } catch (error) {
    console.error('❌ Error truncating Neo4j:', error)
  } finally {
    await driver.close()
  }
  
  // 2. Truncate Supabase data
  console.log('🗑️  Truncating Supabase data...')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables')
    return
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  try {
    // Delete memories
    console.log('   Deleting memories...')
    const { error: memoriesError } = await supabase
      .from('memories')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (memoriesError) throw memoriesError
    console.log(`   ✅ Deleted all memories`)
    
    // Delete memory_queue
    console.log('   Deleting memory queue...')
    const { error: queueError } = await supabase
      .from('memory_queue')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (queueError) throw queueError
    console.log(`   ✅ Deleted all memory queue items`)
    
    // Delete code_entities
    console.log('   Deleting code entities...')
    const { error: codeError } = await supabase
      .from('code_entities')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (codeError) throw codeError
    console.log(`   ✅ Deleted all code entities`)
    
    // Delete code_relationships
    console.log('   Deleting code relationships...')
    const { error: relError } = await supabase
      .from('code_relationships')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (relError) throw relError
    console.log(`   ✅ Deleted all code relationships`)
    
    // Delete file_memories (if table exists)
    console.log('   Deleting file memories...')
    const { error: fileMemError } = await supabase
      .from('file_memories')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (fileMemError) {
      if (fileMemError.code === '42P01') {
        console.log(`   ⚠️  Table 'file_memories' does not exist, skipping...`)
      } else {
        throw fileMemError
      }
    } else {
      console.log(`   ✅ Deleted all file memories`)
    }
    
    console.log('\n✅ All data truncated successfully!')
    
  } catch (error) {
    console.error('❌ Error truncating Supabase:', error)
  }
}

// Run the truncation
truncateAllData().catch(console.error)