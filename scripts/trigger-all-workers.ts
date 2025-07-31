#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function triggerAllWorkers() {
  console.log('=== TRIGGERING ALL WORKERS ===\n')
  
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  const workers = [
    'memory-ingestion-worker',
    'pattern-detection-worker', 
    'code-ingestion-worker'
  ]
  
  for (const worker of workers) {
    console.log(`\nTriggering ${worker}...`)
    
    try {
      const response = await fetch(`${baseUrl}/functions/v1/${worker}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trigger: 'manual' })
      })
      
      const result = await response.json()
      console.log(`✅ ${worker}: ${JSON.stringify(result)}`)
      
      // Trigger multiple times to process backlog
      if (worker === 'memory-ingestion-worker') {
        console.log('  Triggering additional times to clear backlog...')
        for (let i = 0; i < 10; i++) {
          const r = await fetch(`${baseUrl}/functions/v1/${worker}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ trigger: 'manual' })
          })
          const res = await r.json()
          console.log(`  Round ${i+2}: processed ${res.processed || 0} messages`)
          
          // Stop if no more messages
          if (!res.processed || res.processed === 0) break
        }
      }
    } catch (error) {
      console.error(`❌ Error triggering ${worker}:`, error)
    }
  }
  
  console.log('\n\nAll workers triggered!')
}

triggerAllWorkers().catch(console.error)