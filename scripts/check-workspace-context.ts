import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function checkWorkspaceContext() {
  console.log('Checking workspace context...\n')

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    console.error('Error getting user:', authError)
    return
  }

  console.log('Current user ID:', user.id)
  console.log('User email:', user.email)

  // Check team membership
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('team_id, teams(name)')
    .eq('user_id', user.id)

  if (teamMembers && teamMembers.length > 0) {
    console.log('\nTeam memberships:')
    teamMembers.forEach(tm => {
      console.log(`- Team ID: ${tm.team_id}`)
      console.log(`  Team name: ${(tm as any).teams?.name || 'N/A'}`)
    })
  } else {
    console.log('\nNo team memberships found')
  }

  // Calculate workspace IDs
  const teamId = teamMembers?.[0]?.team_id
  const userWorkspaceId = `user:${user.id}`
  const teamWorkspaceId = teamId ? `team:${teamId}` : null

  console.log('\nWorkspace IDs:')
  console.log('- User workspace:', userWorkspaceId)
  console.log('- Team workspace:', teamWorkspaceId || 'None')
  console.log('- Primary workspace:', teamWorkspaceId || userWorkspaceId)

  // Check for entities in Neo4j with matching workspace
  console.log('\nChecking for entities with workspace_id = user:a02c3fed-3a24-442f-becc-97bac8b75e90')
  console.log('(This is the workspace where entities were created)')
  
  if (userWorkspaceId === 'user:a02c3fed-3a24-442f-becc-97bac8b75e90') {
    console.log('✓ This matches your current user workspace!')
  } else {
    console.log('✗ This does NOT match your current user workspace')
    console.log('  This might explain why entities are not showing in the UI')
  }
}

checkWorkspaceContext().then(() => {
  console.log('\nDone!')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})