import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get user info
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Determine workspace
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)

    const teamId = teamMembers?.[0]?.team_id

    // Fetch project summaries
    let query = supabase
      .from('project_summaries')
      .select('*')
      .order('updated_at', { ascending: false })

    // If user is part of a team, show both team summaries AND their personal summaries
    if (teamId) {
      query = query.or(`workspace_id.eq.${teamId},workspace_id.eq.${user.id}`)
    } else {
      query = query.eq('workspace_id', user.id)
    }

    const { data: summaries, error } = await query

    if (error) {
      console.error('Error fetching summaries:', error)
      return NextResponse.json({ error: 'Failed to fetch summaries' }, { status: 500 })
    }

    return NextResponse.json({ summaries: summaries || [] })
  } catch (error) {
    console.error('Error in summaries API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}