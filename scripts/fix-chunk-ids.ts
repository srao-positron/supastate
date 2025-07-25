#!/usr/bin/env node
import neo4j from 'neo4j-driver'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!NEO4J_PASSWORD || !supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

async function fixChunkIds() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  )

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const session = driver.session()

  try {
    // First, get all memories from Neo4j that have null chunk_id
    console.log('Finding memories with null chunk_id...')
    
    const nullChunkResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.chunk_id IS NULL
      RETURN m.id as id, m.content as content, m.created_at as created_at
      LIMIT 1000
    `)

    console.log(`Found ${nullChunkResult.records.length} memories with null chunk_id`)

    let fixedCount = 0
    let notFoundCount = 0

    // For each memory, try to find the corresponding chunk_id from memory_queue
    for (const record of nullChunkResult.records) {
      const memoryId = record.get('id')
      const content = record.get('content')
      
      // Try to find matching record in memory_queue by content
      const { data: queueData } = await supabase
        .from('memory_queue')
        .select('chunk_id')
        .eq('content', content)
        .single()

      if (queueData?.chunk_id) {
        // Update Neo4j with the chunk_id
        await session.run(`
          MATCH (m:Memory {id: $id})
          SET m.chunk_id = $chunk_id
          RETURN m
        `, { id: memoryId, chunk_id: queueData.chunk_id })
        
        console.log(`Fixed chunk_id for memory ${memoryId} -> ${queueData.chunk_id}`)
        fixedCount++
      } else {
        notFoundCount++
      }
    }

    console.log(`\nSummary:`)
    console.log(`- Fixed: ${fixedCount} memories`)
    console.log(`- Not found in queue: ${notFoundCount} memories`)

    // Now check if we still have any null chunk_ids
    const remainingNullResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.chunk_id IS NULL
      RETURN count(m) as count
    `)

    const remainingNull = remainingNullResult.records[0].get('count')
    console.log(`\nRemaining memories with null chunk_id: ${remainingNull}`)

  } finally {
    await session.close()
    await driver.close()
  }
}

fixChunkIds().catch(console.error)