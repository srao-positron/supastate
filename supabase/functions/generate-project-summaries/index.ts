import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Use CDN version that works with Deno
import neo4j from 'https://cdn.neo4j.com/neo4j-javascript-driver/5.12.0/lib/browser/neo4j-web.esm.min.js'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const CLAUDE_MODEL = 'claude-3-opus-20240229'

// Initialize Neo4j driver
function getNeo4jDriver() {
  const NEO4J_URI = Deno.env.get('NEO4J_URI') || 'neo4j+s://eb61aceb.databases.neo4j.io'
  const NEO4J_USER = Deno.env.get('NEO4J_USER') || 'neo4j'
  const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD')

  if (!NEO4J_PASSWORD) {
    throw new Error('NEO4J_PASSWORD environment variable is required')
  }

  return neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 60000,
      maxTransactionRetryTime: 30000
    }
  )
}

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

    // Initialize Neo4j driver
    const driver = getNeo4jDriver()
    const session = driver.session()
    
    try {
      // Get all unique projects with recent activity from Neo4j
      const result = await session.run(`
        MATCH (m:Memory)
        WHERE m.created_at >= datetime() - duration('P1D')
        WITH m.project_name as project_name, 
             COALESCE(m.team_id, m.user_id) as workspace_id,
             m.created_at as created_at
        WITH project_name, workspace_id, max(created_at) as latest_created_at
        WHERE project_name IS NOT NULL AND workspace_id IS NOT NULL
        RETURN project_name, workspace_id, latest_created_at
        ORDER BY latest_created_at DESC
        LIMIT 10000
      `)
      
      console.log(`[Generate Summaries] Retrieved ${result.records.length} project records from Neo4j`)
      
      // Group by project and workspace
      const projectMap = new Map<string, { workspace_id: string; latest: string }>()
      result.records.forEach(record => {
        const project_name = record.get('project_name')
        const workspace_id = record.get('workspace_id')
        const latest = record.get('latest_created_at')
        
        if (project_name && workspace_id) {
          const key = `${workspace_id}:${project_name}`
          projectMap.set(key, {
            workspace_id: workspace_id,
            latest: latest.toString()
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

      // Get memories for this project from Neo4j
      const memoriesSession = driver.session()
      try {
        const memoriesResult = await memoriesSession.run(`
          MATCH (m:Memory)
          WHERE m.project_name = $project_name
            AND (m.team_id = $workspace_id OR m.user_id = $workspace_id)
            AND m.created_at >= datetime() - duration('P1D')
          RETURN m.content as content, m.created_at as created_at
          ORDER BY m.created_at DESC
          LIMIT 100
        `, { project_name, workspace_id })
        
        const memories = memoriesResult.records.map(record => ({
          content: record.get('content'),
          created_at: record.get('created_at').toString()
        }))
        
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
      } finally {
        await memoriesSession.close()
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
    } finally {
      await session.close()
      await driver.close()
    }
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