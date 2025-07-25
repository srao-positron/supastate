#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { executeQuery } from '../src/lib/neo4j/client'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables')
  console.error('Need SUPABASE_SERVICE_ROLE_KEY for truncation')
  process.exit(1)
}

async function resetAllTables() {
  console.log('🗑️  Resetting all tables for fresh start...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  // List of tables to truncate
  const tablesToTruncate = [
    'memory_queue',
    'memories',
    'memories_v3',
    'memory_chunks',
    'code_queue',
    'orchestration_jobs',
    'project_summaries'
  ]
  
  console.log('📦 SUPABASE TABLES:')
  console.log('==================')
  
  for (const table of tablesToTruncate) {
    console.log(`\nTruncating ${table}...`)
    
    // Get count before truncation
    const { count: beforeCount } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
    
    if (beforeCount === null) {
      console.log(`⚠️  Table ${table} doesn't exist or is inaccessible`)
      continue
    }
    
    console.log(`  Found ${beforeCount} records`)
    
    // Truncate table
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (error) {
      console.error(`  ❌ Error truncating ${table}:`, error.message)
    } else {
      // Verify truncation
      const { count: afterCount } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      
      console.log(`  ✅ Truncated successfully (remaining: ${afterCount || 0})`)
    }
  }
  
  // Reset Neo4j
  console.log('\n\n🌐 NEO4J DATABASE:')
  console.log('==================')
  console.log('Truncating Neo4j...')
  
  try {
    // Get counts before truncation
    const beforeResult = await executeQuery(`
      MATCH (n)
      WITH labels(n) as nodeLabels, count(n) as count
      RETURN nodeLabels, count
      ORDER BY count DESC
    `)
    
    if (beforeResult.records.length > 0) {
      console.log('\nBefore truncation:')
      beforeResult.records.forEach(record => {
        console.log(`  ${record.nodeLabels.join(',')}: ${record.count}`)
      })
    }
    
    // Delete all nodes and relationships
    await executeQuery(`
      MATCH (n)
      DETACH DELETE n
    `)
    
    // Verify truncation
    const afterResult = await executeQuery(`
      MATCH (n)
      RETURN count(n) as nodeCount
    `)
    
    const nodeCount = afterResult.records[0]?.nodeCount || 0
    console.log(`\n✅ Neo4j truncated successfully (remaining nodes: ${nodeCount})`)
    
  } catch (error) {
    console.error('❌ Error truncating Neo4j:', error)
  }
  
  console.log('\n\n✨ All tables have been reset!')
  console.log('The system is ready for fresh data from Camille.')
  
  process.exit(0)
}

resetAllTables().catch(console.error)