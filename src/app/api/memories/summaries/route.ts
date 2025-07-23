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
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .single()

    const workspaceId = teamMember?.team_id || user.id

    // Fetch project summaries
    const { data: summaries, error } = await supabase
      .from('project_summaries')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })

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