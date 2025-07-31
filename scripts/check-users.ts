#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function checkUsers() {
  console.log('=== Checking Users ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Check auth.users
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
    
  if (error) {
    console.error('Error fetching users:', error)
    return
  }
  
  console.log('Recent users:')
  for (const user of users || []) {
    console.log(`- ${user.id} (${user.email}) - created ${new Date(user.created_at).toLocaleDateString()}`)
  }
  
  // Check memories to see what user_ids are in use
  const { data: memoryUsers } = await supabase
    .from('memories')
    .select('user_id')
    .not('user_id', 'is', null)
    .limit(10)
    
  if (memoryUsers && memoryUsers.length > 0) {
    console.log('\nUser IDs with memories:')
    const uniqueUserIds = [...new Set(memoryUsers.map(m => m.user_id))]
    for (const userId of uniqueUserIds) {
      console.log(`- ${userId}`)
    }
  }
}

checkUsers().catch(console.error)