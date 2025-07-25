#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { executeQuery } from '../src/lib/neo4j/client'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing required environment variables')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', !!SUPABASE_URL)
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', !!SUPABASE_ANON_KEY)
  process.exit(1)
}

async function checkData() {
  console.log('🔍 Checking data in both Supabase and Neo4j...\n')

  // Check Supabase
  console.log('📦 SUPABASE DATA:')
  console.log('================')
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  
  // Check memory_chunks
  const { data: chunks, count: chunkCount } = await supabase
    .from('memory_chunks')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5)
  
  console.log(`Total memory_chunks: ${chunkCount || 0}`)
  
  if (chunks && chunks.length > 0) {
    console.log('\nLatest chunks:')
    chunks.forEach(chunk => {
      console.log(`- ${chunk.id} | ${chunk.project_name} | ${new Date(chunk.created_at).toLocaleString()}`)
      console.log(`  Content preview: ${chunk.content.substring(0, 50)}...`)
    })
  }
  
  // Check memories_v3
  const { data: memories, count: memoryCount } = await supabase
    .from('memories_v3')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5)
  
  console.log(`\nTotal memories_v3: ${memoryCount || 0}`)
  
  // Check Neo4j
  console.log('\n\n🌐 NEO4J DATA:')
  console.log('==============')
  
  try {
    // Count Memory nodes
    const memoryResult = await executeQuery(`
      MATCH (m:Memory)
      RETURN count(m) as count, 
             collect(DISTINCT m.project_name)[0..5] as sampleProjects,
             max(m.created_at) as latestCreated
    `)
    
    const memoryData = memoryResult.records[0]
    console.log(`Total Memory nodes: ${memoryData.count}`)
    console.log(`Sample projects: ${memoryData.sampleProjects.join(', ')}`)
    console.log(`Latest created: ${memoryData.latestCreated}`)
    
    // Get sample memories
    const sampleResult = await executeQuery(`
      MATCH (m:Memory)
      RETURN m.id as id, 
             m.project_name as project,
             substring(m.content, 0, 50) as preview,
             m.created_at as created
      ORDER BY m.created_at DESC
      LIMIT 5
    `)
    
    if (sampleResult.records.length > 0) {
      console.log('\nLatest Memory nodes:')
      sampleResult.records.forEach(record => {
        console.log(`- ${record.id} | ${record.project} | ${record.created}`)
        console.log(`  Preview: ${record.preview}...`)
      })
    }
    
    // Check relationships
    const relResult = await executeQuery(`
      MATCH ()-[r]->()
      RETURN type(r) as relType, count(r) as count
      ORDER BY count DESC
    `)
    
    if (relResult.records.length > 0) {
      console.log('\nRelationship counts:')
      relResult.records.forEach(record => {
        console.log(`- ${record.relType}: ${record.count}`)
      })
    }
    
    // Check CodeEntity nodes
    const codeResult = await executeQuery(`
      MATCH (c:CodeEntity)
      RETURN count(c) as count
    `)
    console.log(`\nTotal CodeEntity nodes: ${codeResult.records[0].count}`)
    
  } catch (error) {
    console.error('Error checking Neo4j:', error)
  }
  
  process.exit(0)
}

checkData().catch(console.error)