#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { executeQuery } from '../src/lib/neo4j/client'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function checkUserMemories() {
  console.log('🔍 Checking User Memory Filtering...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  console.log('Current logged-in user:', user?.id || 'Not logged in')
  
  if (!user) {
    console.log('\nYou need to be logged in to run this test.')
    return
  }

  // Check memories in Neo4j for this user
  console.log('\nChecking memories for this user in Neo4j:')
  const userMemories = await executeQuery(`
    MATCH (m:Memory)
    WHERE m.user_id = $userId
    RETURN m.id as id, m.user_id as user_id, m.project_name as project, m.content as content
    LIMIT 5
  `, { userId: user.id })
  
  console.log(`Found ${userMemories.records.length} memories for user ${user.id}`)
  userMemories.records.forEach(record => {
    console.log(`  - ${record.id?.substring(0, 8)}... | ${record.project}`)
    console.log(`    Content: ${record.content?.substring(0, 50)}...`)
  })

  // Check all unique user IDs in Neo4j
  console.log('\n\nAll unique user IDs in Neo4j:')
  const allUsers = await executeQuery(`
    MATCH (m:Memory)
    RETURN DISTINCT m.user_id as user_id, count(m) as count
  `)
  
  allUsers.records.forEach(record => {
    console.log(`  - ${record.user_id}: ${record.count} memories`)
  })

  process.exit(0)
}

checkUserMemories().catch(console.error)