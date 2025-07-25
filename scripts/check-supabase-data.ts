#!/usr/bin/env tsx
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

async function checkSupabaseData() {
  console.log('🔍 Checking Supabase data...\n')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables')
    return
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  try {
    // Check memories
    const { count: memoriesCount, error: memoriesError } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
    
    if (memoriesError) throw memoriesError
    console.log(`📊 Memories table: ${memoriesCount || 0} records`)
    
    // Check memory_queue
    const { count: queueCount, error: queueError } = await supabase
      .from('memory_queue')
      .select('*', { count: 'exact', head: true })
    
    if (queueError) throw queueError
    console.log(`📋 Memory queue: ${queueCount || 0} records`)
    
    // Check code_entities
    const { count: codeCount, error: codeError } = await supabase
      .from('code_entities')
      .select('*', { count: 'exact', head: true })
    
    if (codeError) throw codeError
    console.log(`🔧 Code entities: ${codeCount || 0} records`)
    
    // Check code_relationships
    const { count: relCount, error: relError } = await supabase
      .from('code_relationships')
      .select('*', { count: 'exact', head: true })
    
    if (relError) throw relError
    console.log(`🔗 Code relationships: ${relCount || 0} records`)
    
    // Check conversations
    const { count: convCount, error: convError } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
    
    if (convError) throw convError
    console.log(`💬 Conversations: ${convCount || 0} records`)
    
    console.log('\n✅ Data check complete')
    
  } catch (error) {
    console.error('❌ Error checking Supabase:', error)
  }
}

// Run the check
checkSupabaseData().catch(console.error)