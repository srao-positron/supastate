#!/usr/bin/env npx tsx

import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

async function triggerGithubCodeParserWorker() {
  console.log('🚀 Triggering github-code-parser-worker...\n')
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/github-code-parser-worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceRoleKey}`
      },
      body: JSON.stringify({
        batch_size: 10  // Process up to 10 messages at once
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Worker failed:', response.status, errorText)
      return
    }
    
    const result = await response.json()
    console.log('✅ Worker completed:', result)
    
    if (result.processed > 0) {
      console.log(`\n📦 Processed ${result.processed} messages`)
      if (result.errors > 0) {
        console.log(`⚠️  ${result.errors} errors occurred`)
      }
    } else {
      console.log('\n📭 No messages to process')
    }
    
  } catch (error) {
    console.error('❌ Error triggering worker:', error)
  }
}

// Run the worker
triggerGithubCodeParserWorker()