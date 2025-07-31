#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function processMemoryBacklog() {
  console.log('=== PROCESSING MEMORY BACKLOG ===\n')
  
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  let totalProcessed = 0
  let round = 0
  
  // Keep calling the worker until no more messages
  while (true) {
    round++
    console.log(`\nRound ${round}: Calling memory-ingestion-worker...`)
    
    try {
      const response = await fetch(`${baseUrl}/functions/v1/memory-ingestion-worker`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trigger: 'manual-backlog' })
      })
      
      if (!response.ok) {
        console.error(`Error: ${response.status} ${response.statusText}`)
        break
      }
      
      const result = await response.json()
      console.log(`Processed: ${result.processed} messages`)
      
      if (result.processed === 0) {
        console.log('\n✅ No more messages to process!')
        break
      }
      
      totalProcessed += result.processed
      
      // Brief pause to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Safety limit
      if (round > 200) {
        console.log('\n⚠️  Reached safety limit of 200 rounds')
        break
      }
    } catch (error) {
      console.error('Error:', error)
      break
    }
  }
  
  console.log(`\n🎉 Total messages processed: ${totalProcessed}`)
}

processMemoryBacklog().catch(console.error)