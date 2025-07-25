#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables')
  console.error('Need SUPABASE_SERVICE_ROLE_KEY for truncation')
  process.exit(1)
}

async function truncateTables() {
  console.log('🗑️  Truncating Supabase tables...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  // Truncate memories table
  console.log('Truncating memories table...')
  const { error: memoriesError } = await supabase
    .from('memories')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
  
  if (memoriesError) {
    console.error('Error truncating memories:', memoriesError)
  } else {
    console.log('✅ memories table truncated')
  }
  
  // Truncate memory_queue table
  console.log('\nTruncating memory_queue table...')
  const { error: queueError } = await supabase
    .from('memory_queue')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
  
  if (queueError) {
    console.error('Error truncating memory_queue:', queueError)
  } else {
    console.log('✅ memory_queue table truncated')
  }
  
  // Verify truncation
  const { count: memoriesCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
  
  const { count: queueCount } = await supabase
    .from('memory_queue')
    .select('*', { count: 'exact', head: true })
  
  console.log('\n📊 Final counts:')
  console.log(`memories: ${memoriesCount || 0}`)
  console.log(`memory_queue: ${queueCount || 0}`)
  
  process.exit(0)
}

truncateTables().catch(console.error)