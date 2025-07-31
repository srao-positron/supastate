#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkUsers() {
  console.log('Checking for users in the database...\n')
  
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, github_username, github_access_token_encrypted')
    .limit(10)
  
  if (error) {
    console.error('Error fetching users:', error)
    return
  }
  
  console.log(`Found ${users?.length || 0} users:`)
  users?.forEach(u => {
    console.log(`- ${u.email}`)
    console.log(`  ID: ${u.id}`)
    console.log(`  GitHub: ${u.github_username || 'Not connected'}`)
    console.log(`  Has GitHub token: ${!!u.github_access_token_encrypted}`)
    // console.log(`  Workspace: ${u.workspace_id || 'None (personal)'}`)
    console.log()
  })
}

checkUsers()