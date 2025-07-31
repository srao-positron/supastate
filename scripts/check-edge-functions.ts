#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function checkEdgeFunctions() {
  console.log('=== CHECKING EDGE FUNCTIONS ===\n')
  
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  const functions = [
    'process-neo4j-embeddings',
    'memory-ingestion-worker',
    'pattern-detection-worker',
    'code-ingestion-worker'
  ]
  
  for (const func of functions) {
    console.log(`\nChecking ${func}...`)
    
    try {
      const response = await fetch(`${baseUrl}/functions/v1/${func}`, {
        method: 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
        }
      })
      
      if (response.ok) {
        console.log(`✅ ${func} exists`)
      } else {
        console.log(`❌ ${func} returned ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      console.error(`❌ ${func} error:`, error)
    }
  }
}

checkEdgeFunctions().catch(console.error)