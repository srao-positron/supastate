#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import { Driver } from 'neo4j-driver'
import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const neo4jUri = process.env.NEO4J_URI
const neo4jUser = process.env.NEO4J_USER
const neo4jPassword = process.env.NEO4J_PASSWORD

if (!supabaseUrl || !supabaseServiceKey || !neo4jUri || !neo4jUser || !neo4jPassword) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const driver = neo4j.driver(
  neo4jUri,
  neo4j.auth.basic(neo4jUser, neo4jPassword)
)

async function checkFinalStatus() {
  console.log('=== FINAL STATUS CHECK ===\n')
  
  try {
    const session = driver.session()
    
    // 1. Check queue status
    console.log('📋 Queue Status:\n')
    const { data: queueMessages } = await supabase
      .rpc('pgmq_read', { 
        queue_name: 'code_ingestion',
        vt: 0,
        qty: 1
      })
    
    console.log(`Code ingestion queue: ${queueMessages?.length || 0} messages`)
    
    // 2. Check Supabase counts
    console.log('\n📊 Supabase Database:\n')
    
    const { count: memoryCount } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
    
    const { count: codeCount } = await supabase
      .from('code_entities')
      .select('*', { count: 'exact', head: true })
    
    console.log(`Memories: ${memoryCount}`)
    console.log(`Code entities: ${codeCount}`)
    
    // 3. Check Neo4j counts
    console.log('\n🔷 Neo4j Database:\n')
    
    const result = await session.run(`
      MATCH (n)
      WITH labels(n)[0] as label, count(n) as count
      RETURN label, count
      ORDER BY count DESC
    `)
    
    result.records.forEach(record => {
      const label = record.get('label')
      const count = record.get('count').toNumber()
      console.log(`${label}: ${count}`)
    })
    
    // 4. Check for duplicates
    console.log('\n✅ Duplicate Check:\n')
    
    const dupResult = await session.run(`
      MATCH (s:EntitySummary)
      WITH s.entity_id as entity_id, count(s) as count
      WHERE count > 1
      RETURN entity_id, count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    if (dupResult.records.length === 0) {
      console.log('No duplicate EntitySummaries found! ✨')
    } else {
      console.log('⚠️  Found duplicate EntitySummaries:')
      dupResult.records.forEach(record => {
        console.log(`- Entity ${record.get('entity_id')}: ${record.get('count').toNumber()} copies`)
      })
    }
    
    // 5. Check relationships
    console.log('\n🔗 Relationships:\n')
    
    const relResult = await session.run(`
      MATCH ()-[r]->()
      WITH type(r) as relType, count(r) as count
      RETURN relType, count
      ORDER BY count DESC
    `)
    
    relResult.records.forEach(record => {
      const relType = record.get('relType')
      const count = record.get('count').toNumber()
      console.log(`${relType}: ${count}`)
    })
    
    // 6. Check worker logs
    console.log('\n📝 Recent Worker Status:\n')
    
    const { data: recentLogs } = await supabase
      .from('code_ingestion_worker_logs')
      .select('status, count')
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (recentLogs) {
      const statusCounts = recentLogs.reduce((acc, log) => {
        acc[log.status] = (acc[log.status] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`${status}: ${count}`)
      })
    }
    
    // 7. Final summary
    console.log('\n🎯 Summary:\n')
    
    const issues = []
    
    if ((queueMessages?.length || 0) > 0) {
      issues.push('- Code ingestion queue has pending messages')
    }
    
    if (dupResult.records.length > 0) {
      issues.push('- Duplicate EntitySummaries exist')
    }
    
    const { data: errorLogs } = await supabase
      .from('code_ingestion_worker_logs')
      .select('id')
      .eq('status', 'error')
      .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // Last hour
      .limit(1)
    
    if (errorLogs && errorLogs.length > 0) {
      issues.push('- Recent worker errors detected')
    }
    
    if (issues.length === 0) {
      console.log('✅ All systems operational!')
      console.log('✅ No duplicates detected!')
      console.log('✅ Code entities synced: ' + (codeCount === result.records.find(r => r.get('label') === 'CodeEntity')?.get('count').toNumber()))
    } else {
      console.log('⚠️  Issues detected:')
      issues.forEach(issue => console.log(issue))
    }
    
    await session.close()
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await driver.close()
  }
}

checkFinalStatus().catch(console.error)