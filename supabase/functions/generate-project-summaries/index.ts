import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const CLAUDE_MODEL = 'claude-3-opus-20240229'

async function generateSummary(projectName: string, memories: any[]): Promise<string> {
  const recentMemories = memories
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30) // Take most recent 30 memories for better focus
    .map(m => m.content)
    .join('\n\n')

  const prompt = `You are analyzing conversation history for the project "${projectName}". Based on the conversations below, write ONE insightful paragraph (4-6 sentences) that summarizes:
- What the project fundamentally does/solves
- The current implementation status and recent progress
- Key technical decisions or challenges being addressed
- The immediate next steps or blockers

IMPORTANT: You are summarizing the PROJECT, not continuing any conversation. Do NOT respond as if you are the assistant in these conversations. Write from a third-person perspective as an observer analyzing what the project is about.

Recent conversations:
${recentMemories}

Write a single paragraph project summary (third-person perspective):`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.statusText}`)
  }

  const data = await response.json()
  return data.content[0].text
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get all unique projects with recent activity
    const { data: projects, error: projectsError } = await supabase
      .from('memories')
      .select('project_name, team_id, user_id, created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10000) // Limit to prevent timeout
    
    if (projectsError) throw projectsError
    
    console.log(`[Generate Summaries] Retrieved ${projects?.length || 0} memory rows`)
    
    // Group by project and workspace
    const projectMap = new Map<string, { workspace_id: string; latest: string }>()
    projects?.forEach(p => {
      const workspace_id = p.team_id || p.user_id
      const key = `${workspace_id}:${p.project_name}`
      if (!projectMap.has(key) || new Date(p.created_at) > new Date(projectMap.get(key)!.latest)) {
        projectMap.set(key, {
          workspace_id: workspace_id,
          latest: p.created_at
        })
      }
    })

    console.log(`[Generate Summaries] Found ${projectMap.size} projects with recent activity`)
    console.log(`[Generate Summaries] Projects:`, Array.from(projectMap.keys()))

    // Process each project
    const summaryPromises = Array.from(projectMap.entries()).map(async ([key, info]) => {
      // Split only on first colon to handle project names with colons
      const colonIndex = key.indexOf(':')
      const workspace_id = key.substring(0, colonIndex)
      const project_name = key.substring(colonIndex + 1)
      
      // Check if summary exists and when it was last updated
      const { data: existingSummary } = await supabase
        .from('project_summaries')
        .select('last_memory_timestamp, updated_at')
        .eq('workspace_id', workspace_id)
        .eq('project_name', project_name)
        .single()

      // Skip if:
      // 1. Summary exists AND is up to date (no new memories)
      // 2. Summary was updated less than 15 minutes ago (even if new memories exist)
      if (existingSummary) {
        const hasNewMemories = new Date(existingSummary.last_memory_timestamp) < new Date(info.latest)
        const minutesSinceUpdate = (Date.now() - new Date(existingSummary.updated_at).getTime()) / (1000 * 60)
        
        if (!hasNewMemories) {
          console.log(`[Generate Summaries] Skipping ${project_name} - no new memories`)
          return null
        }
        
        if (minutesSinceUpdate < 15) {
          console.log(`[Generate Summaries] Skipping ${project_name} - updated ${Math.round(minutesSinceUpdate)} minutes ago`)
          return null
        }
      }

      // Get memories for this project based on team_id or user_id
      let memoriesQuery = supabase
        .from('memories')
        .select('*')
        .eq('project_name', project_name)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(100)
      
      // Add workspace filter
      if (workspace_id.length === 36) { // UUID length, could be team or user
        memoriesQuery = memoriesQuery.or(`team_id.eq.${workspace_id},user_id.eq.${workspace_id}`)
      }
      
      const { data: memories, error: memoriesError } = await memoriesQuery

      if (memoriesError) throw memoriesError

      if (!memories || memories.length === 0) {
        console.log(`[Generate Summaries] No memories found for ${project_name}`)
        return null
      }

      console.log(`[Generate Summaries] Generating summary for ${project_name} with ${memories.length} memories`)

      try {
        const summary = await generateSummary(project_name, memories)
        
        // Upsert the summary
        const { error: upsertError } = await supabase
          .from('project_summaries')
          .upsert({
            workspace_id,
            project_name,
            summary: summary.slice(0, 1000), // First 1000 chars for preview
            summary_markdown: summary,
            last_memory_timestamp: info.latest,
            memories_included: memories.length,
            metadata: {
              model: CLAUDE_MODEL,
              generated_at: new Date().toISOString()
            }
          }, {
            onConflict: 'workspace_id,project_name'
          })

        if (upsertError) throw upsertError

        return { project: project_name, status: 'updated' }
      } catch (error) {
        console.error(`[Generate Summaries] Error processing ${project_name}:`, error)
        return { project: project_name, status: 'error', error: error.message }
      }
    })

    const results = await Promise.all(summaryPromises)
    const updated = results.filter(r => r?.status === 'updated').length
    const errors = results.filter(r => r?.status === 'error').length

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${projectMap.size} projects: ${updated} updated, ${errors} errors`,
        results: results.filter(Boolean)
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('[Generate Summaries] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})