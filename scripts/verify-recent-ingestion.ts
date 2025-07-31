#!/usr/bin/env npx tsx

/**
 * Verify recent ingestion is working properly
 */

import neo4j from 'neo4j-driver'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD

if (!NEO4J_PASSWORD) {
  console.error('NEO4J_PASSWORD environment variable is required')
  process.exit(1)
}

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verifyRecentIngestion() {
  const session = driver.session()
  
  try {
    console.log('=== Verifying Recent Ingestion ===\n')
    
    // Get the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    
    // Check Neo4j for recent Memory nodes
    console.log('1. Recent Memory nodes in Neo4j (last 10 minutes):')
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.created_at > $since
      RETURN m.id, m.title, m.created_at, m.user_id, m.workspace_id
      ORDER BY m.created_at DESC
      LIMIT 10
    `, { since: tenMinutesAgo })
    
    console.log(`   Found ${memoryResult.records.length} recent Memory nodes`)
    memoryResult.records.forEach(record => {
      const m = record.toObject()
      console.log(`   - ${m['m.id'].substring(0, 8)}... created at ${m['m.created_at']}`)
    })
    
    // Check Neo4j for recent CodeEntity nodes
    console.log('\n2. Recent CodeEntity nodes in Neo4j (last 10 minutes):')
    const codeResult = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.created_at > $since
      RETURN c.id, c.path, c.created_at, c.user_id, c.workspace_id
      ORDER BY c.created_at DESC
      LIMIT 10
    `, { since: tenMinutesAgo })
    
    console.log(`   Found ${codeResult.records.length} recent CodeEntity nodes`)
    codeResult.records.forEach(record => {
      const c = record.toObject()
      console.log(`   - ${c['c.id'].substring(0, 8)}... (${c['c.path']}) created at ${c['c.created_at']}`)
    })
    
    // Check Supabase for recent memories
    console.log('\n3. Recent memories in Supabase (last 10 minutes):')
    const { data: recentMemories, error: memError } = await supabase
      .from('memories')
      .select('id, content, created_at, user_id, workspace_id')
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (memError) {
      console.error('   Error:', memError)
    } else {
      console.log(`   Found ${recentMemories?.length || 0} recent memories`)
      recentMemories?.forEach(m => {
        const preview = m.content ? m.content.substring(0, 50) + '...' : 'No content'
        console.log(`   - ${m.id.substring(0, 8)}... "${preview}" created at ${m.created_at}`)
      })
    }
    
    // Check Supabase for recent code entities
    console.log('\n4. Recent code entities in Supabase (last 10 minutes):')
    const { data: recentCode, error: codeError } = await supabase
      .from('code_entities')
      .select('id, file_path, created_at, user_id')
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (codeError) {
      console.error('   Error:', codeError)
    } else {
      console.log(`   Found ${recentCode?.length || 0} recent code entities`)
      recentCode?.forEach(c => {
        console.log(`   - ${c.id.substring(0, 8)}... (${c.file_path}) created at ${c.created_at}`)
      })
    }
    
    // Compare counts
    console.log('\n5. Summary:')
    console.log('   Memory ingestion:', memoryResult.records.length > 0 ? '✅ Working' : '❌ No recent data')
    console.log('   Code ingestion:', codeResult.records.length > 0 ? '✅ Working' : '❌ No recent data')
    
    // Check for any mismatches
    if (recentMemories && recentMemories.length > memoryResult.records.length) {
      console.log('\n   ⚠️  Warning: Some memories in Supabase are not in Neo4j yet')
    }
    if (recentCode && recentCode.length > codeResult.records.length) {
      console.log('   ⚠️  Warning: Some code entities in Supabase are not in Neo4j yet')
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

verifyRecentIngestion().catch(console.error)