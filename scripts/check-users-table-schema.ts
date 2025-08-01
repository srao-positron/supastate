#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkUsersTable() {
  console.log('Checking users table schema...\n')
  
  // Query to get column information
  const { data: columns, error } = await supabase
    .rpc('get_table_columns', { table_name: 'users' })
    .select('*')
  
  if (error) {
    // If the RPC doesn't exist, use direct query
    const { data, error: directError } = await supabase.from('users').select('*').limit(1)
    
    if (!directError && data && data.length > 0) {
      console.log('Users table columns:', Object.keys(data[0]))
      console.log('\nSample user record:', JSON.stringify(data[0], null, 2))
    } else {
      console.error('Error querying users table:', directError)
    }
  } else {
    console.log('Users table columns:', columns)
  }
  
  // Also check team_members table
  console.log('\n\nChecking team_members table...')
  const { data: teamData, error: teamError } = await supabase
    .from('team_members')
    .select('*')
    .limit(1)
  
  if (!teamError && teamData) {
    if (teamData.length > 0) {
      console.log('Team members table columns:', Object.keys(teamData[0]))
      console.log('\nSample team member record:', JSON.stringify(teamData[0], null, 2))
    } else {
      console.log('No records in team_members table')
    }
  } else {
    console.error('Error querying team_members table:', teamError)
  }
  
  // Check if teams table exists
  console.log('\n\nChecking teams table...')
  const { data: teamsData, error: teamsError } = await supabase
    .from('teams')
    .select('*')
    .limit(1)
  
  if (!teamsError && teamsData) {
    if (teamsData.length > 0) {
      console.log('Teams table columns:', Object.keys(teamsData[0]))
      console.log('\nSample team record:', JSON.stringify(teamsData[0], null, 2))
    } else {
      console.log('No records in teams table')
    }
  } else {
    console.error('Error querying teams table:', teamsError)
  }
}

checkUsersTable()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })