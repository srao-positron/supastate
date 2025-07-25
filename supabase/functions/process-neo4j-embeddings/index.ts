import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Use unpkg CDN version that works with Deno - ESM build
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MemoryQueueItem {
  id: string
  workspace_id: string
  chunk_id: string
  chunk_index: number
  content: string
  metadata: Record<string, any>
  session_id?: string
  project_name?: string
  file_paths?: string[]
  topics?: string[]
  entities_mentioned?: string[]
  tools_used?: string[]
}

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

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get items from memory queue
    const { data: queueItems, error: queueError } = await supabaseClient
      .from('memory_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50)

    if (queueError) throw queueError

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No items to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${queueItems.length} memory queue items`)

    const driver = getNeo4jDriver()
    const processedIds: string[] = []
    const errors: any[] = []

    // Process each queue item
    for (const item of queueItems as MemoryQueueItem[]) {
      try {
        // Mark as processing
        await supabaseClient
          .from('memory_queue')
          .update({ status: 'processing' })
          .eq('id', item.id)

        // Generate embedding using OpenAI
        const openAIResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: item.content,
            model: 'text-embedding-3-large',
            dimensions: 3072
          }),
        })

        if (!openAIResponse.ok) {
          throw new Error(`OpenAI API error: ${openAIResponse.statusText}`)
        }

        const embeddingData = await openAIResponse.json()
        const embedding = embeddingData.data[0].embedding

        // Get user and team information
        const { data: workspace } = await supabaseClient
          .from('workspaces')
          .select('owner_id, team_id')
          .eq('id', item.workspace_id)
          .single()

        // Create memory in Neo4j with embedding
        const session = driver.session()
        try {
          const result = await session.run(
            `
            MERGE (m:Memory {chunk_id: $chunk_id, workspace_id: $workspace_id})
            SET m.id = COALESCE(m.id, randomUUID()),
                m.content = $content,
                m.embedding = $embedding,
                m.project_name = $project_name,
                m.user_id = $user_id,
                m.team_id = $team_id,
                m.session_id = $session_id,
                m.chunk_index = $chunk_index,
                m.type = $type,
                m.metadata = $metadata,
                m.file_paths = $file_paths,
                m.topics = $topics,
                m.entities_mentioned = $entities_mentioned,
                m.tools_used = $tools_used,
                m.created_at = COALESCE(m.created_at, datetime()),
                m.updated_at = datetime()
            RETURN m.id as memoryId
            `,
            {
              chunk_id: item.chunk_id,
              workspace_id: item.workspace_id,
              content: item.content,
              embedding: embedding,
              project_name: item.project_name || 'default',
              user_id: workspace?.owner_id || null,
              team_id: workspace?.team_id || null,
              session_id: item.session_id || null,
              chunk_index: item.chunk_index,
              type: item.metadata?.type || 'general',
              metadata: JSON.stringify(item.metadata || {}),
              file_paths: item.file_paths || [],
              topics: item.topics || [],
              entities_mentioned: item.entities_mentioned || [],
              tools_used: item.tools_used || []
            }
          )

          const memoryId = result.records[0].get('memoryId')

          // Create project relationship
          await session.run(
            `
            MATCH (m:Memory {id: $memoryId})
            MERGE (p:Project {name: $projectName})
            ON CREATE SET p.id = randomUUID(),
                          p.created_at = datetime()
            MERGE (m)-[:BELONGS_TO_PROJECT]->(p)
            `,
            { memoryId, projectName: item.project_name || 'default' }
          )

          // Create user relationship if available
          if (workspace?.owner_id) {
            await session.run(
              `
              MATCH (m:Memory {id: $memoryId})
              MERGE (u:User {id: $userId})
              ON CREATE SET u.created_at = datetime()
              MERGE (u)-[:CREATED]->(m)
              `,
              { memoryId, userId: workspace.owner_id }
            )
          }

          // Run relationship inference (async - don't wait)
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/infer-relationships`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ memoryId })
          }).catch(err => console.error('Failed to trigger relationship inference:', err))

          // Mark as completed in queue
          await supabaseClient
            .from('memory_queue')
            .update({ 
              status: 'completed',
              processed_at: new Date().toISOString()
            })
            .eq('id', item.id)

          processedIds.push(item.id)

        } finally {
          await session.close()
        }

      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error)
        errors.push({ id: item.id, error: error.message })

        // Mark as failed
        await supabaseClient
          .from('memory_queue')
          .update({ 
            status: 'failed',
            error: error.message,
            retry_count: item.retry_count ? item.retry_count + 1 : 1
          })
          .eq('id', item.id)
      }
    }

    await driver.close()

    return new Response(
      JSON.stringify({
        processed: processedIds.length,
        failed: errors.length,
        processedIds,
        errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-neo4j-embeddings:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})