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
  process.exit(1)
}

async function truncateProjectSummaries() {
  console.log('🗑️  Truncating project_summaries table...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  // First, count existing summaries
  const { count: beforeCount } = await supabase
    .from('project_summaries')
    .select('*', { count: 'exact', head: true })
  
  console.log(`Found ${beforeCount || 0} project summaries to delete`)
  
  // Truncate the table
  const { error } = await supabase
    .from('project_summaries')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all rows
  
  if (error) {
    console.error('Error truncating project_summaries:', error)
    process.exit(1)
  }
  
  // Verify truncation
  const { count: afterCount } = await supabase
    .from('project_summaries')
    .select('*', { count: 'exact', head: true })
  
  console.log(`\n✅ Truncation complete!`)
  console.log(`   Remaining summaries: ${afterCount || 0}`)
  
  process.exit(0)
}

truncateProjectSummaries().catch(console.error)