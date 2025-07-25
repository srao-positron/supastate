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

async function monitorProcessing() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  )

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const session = driver.session()

  console.log('Monitoring memory processing... (Press Ctrl+C to stop)\n')

  let previousNeo4jCount = 0
  let previousCompletedCount = 0

  const interval = setInterval(async () => {
    try {
      // Check Neo4j memory count
      const neo4jResult = await session.run('MATCH (m:Memory) RETURN count(m) as total')
      const neo4jCount = neo4jResult.records[0].get('total').toNumber()
      
      // Check queue status
      const { data: queueData } = await supabase
        .from('memory_queue')
        .select('status')
        
      if (queueData) {
        const statusCounts = queueData.reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        
        const completedCount = statusCounts.completed || 0
        const processingRate = neo4jCount - previousNeo4jCount
        const completionRate = completedCount - previousCompletedCount
        
        console.log(`[${new Date().toISOString()}]`)
        console.log(`  Neo4j memories: ${neo4jCount} (+${processingRate})`)
        console.log(`  Queue: pending=${statusCounts.pending || 0}, processing=${statusCounts.processing || 0}, completed=${completedCount} (+${completionRate}), failed=${statusCounts.failed || 0}`)
        console.log('')
        
        previousNeo4jCount = neo4jCount
        previousCompletedCount = completedCount
        
        // If all are completed, stop monitoring
        if (!statusCounts.pending && !statusCounts.processing) {
          console.log('All items processed!')
          clearInterval(interval)
          await session.close()
          await driver.close()
          process.exit(0)
        }
      }
    } catch (error) {
      console.error('Error during monitoring:', error)
    }
  }, 10000) // Check every 10 seconds

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nStopping monitor...')
    clearInterval(interval)
    await session.close()
    await driver.close()
    process.exit(0)
  })
}

monitorProcessing().catch(console.error)