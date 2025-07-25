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

async function checkMemoryCounts() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  )

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const session = driver.session()

  try {
    // Check Neo4j memory count
    const neo4jResult = await session.run('MATCH (m:Memory) RETURN count(m) as total')
    const neo4jCount = neo4jResult.records[0].get('total')
    console.log('Total memories in Neo4j:', neo4jCount)
    
    // Check queue status
    const { data: queueData } = await supabase
      .from('memory_queue')
      .select('status')
      
    if (queueData) {
      const statusCounts = queueData.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      console.log('\nMemory queue status:')
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`)
      })
      
      const totalInQueue = queueData.length
      console.log(`  Total in queue: ${totalInQueue}`)
    }
    
    // Check Supabase memories table
    const { count: supabaseCount } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      
    console.log('\nTotal memories in Supabase:', supabaseCount)
    
    // Test the processing function
    console.log('\nInvoking process-embeddings function...')
    const { data, error } = await supabase.functions.invoke('process-embeddings')
    
    if (error) {
      console.error('Error invoking function:', error)
    } else {
      console.log('Function response:', data)
    }

  } finally {
    await session.close()
    await driver.close()
  }
}

checkMemoryCounts().catch(console.error)