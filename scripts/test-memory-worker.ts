#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function testMemoryWorker() {
  console.log('=== TESTING MEMORY INGESTION WORKER ===\n')
  
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  console.log('Invoking memory-ingestion-worker directly...')
  
  try {
    const response = await fetch(`${baseUrl}/functions/v1/memory-ingestion-worker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ trigger: 'manual' })
    })
    
    console.log('Response status:', response.status)
    console.log('Response headers:', response.headers)
    
    const text = await response.text()
    console.log('Response body:', text)
    
    // Try to parse as JSON
    try {
      const json = JSON.parse(text)
      console.log('\nParsed response:', JSON.stringify(json, null, 2))
    } catch (e) {
      console.log('\nCould not parse as JSON')
    }
  } catch (error) {
    console.error('Error invoking worker:', error)
  }
}

testMemoryWorker().catch(console.error)