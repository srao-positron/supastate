#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function triggerWorkers() {
  console.log('=== Triggering Queue Workers ===\n')
  
  const workers = [
    'memory-ingestion-worker',
    'pattern-detection-worker',
    'code-ingestion-worker'
  ]
  
  for (const worker of workers) {
    console.log(`Triggering ${worker}...`)
    
    try {
      const response = await fetch(
        `https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/${worker}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: '{}'
        }
      )
      
      console.log(`${worker}: Status ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`Response:`, data)
      } else {
        const error = await response.text()
        console.error(`Error:`, error)
      }
      
      console.log('')
    } catch (e) {
      console.error(`Failed to trigger ${worker}:`, e)
    }
  }
}

triggerWorkers().catch(console.error)