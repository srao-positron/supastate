import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

interface LinkingRequest {
  memoryId?: string // Link a specific memory
  projectName?: string // Link all memories in a project
  workspaceId?: string // Link all memories in a workspace
  threshold?: number // Similarity threshold (default: 0.7)
}

async function analyzeMemoryContent(content: string, openai: OpenAI): Promise<{
  codeReferences: string[]
  functionCalls: string[]
  classReferences: string[]
  fileReferences: string[]
  topics: string[]
}> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `You are a code analysis expert. Analyze the given conversation content and extract:
1. Code entity references (function names, class names, variable names)
2. File paths mentioned
3. Programming concepts and topics discussed
4. Specific function calls or method invocations mentioned

Return a JSON object with arrays for each category. Be precise and only extract actual code references, not general terms.`
      }, {
        role: 'user',
        content: content
      }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1000
    })

    const result = JSON.parse(response.choices[0].message.content || '{}')
    
    return {
      codeReferences: result.codeReferences || [],
      functionCalls: result.functionCalls || [],
      classReferences: result.classReferences || [],
      fileReferences: result.fileReferences || [],
      topics: result.topics || []
    }
  } catch (error) {
    console.error('Error analyzing memory content:', error)
    return {
      codeReferences: [],
      functionCalls: [],
      classReferences: [],
      fileReferences: [],
      topics: []
    }
  }
}

async function linkMemoryToCode(
  driver: any,
  memoryId: string,
  projectName: string,
  analysis: any,
  threshold: number
) {
  const session = driver.session()
  
  try {
    // First, get the memory's embedding
    const memoryResult = await session.run(`
      MATCH (m:Memory {id: $memoryId})
      RETURN m.embedding as embedding
    `, { memoryId })
    
    if (!memoryResult.records.length) {
      console.warn(`Memory ${memoryId} not found`)
      return
    }
    
    const memoryEmbedding = memoryResult.records[0].get('embedding')
    
    // Link based on semantic similarity using cosine similarity
    if (memoryEmbedding) {
      await session.run(`
        MATCH (m:Memory {id: $memoryId})
        MATCH (c:CodeEntity {project_name: $projectName})
        WHERE c.embedding IS NOT NULL
        WITH m, c, 
             gds.similarity.cosine(m.embedding, c.embedding) AS similarity
        WHERE similarity >= $threshold
        MERGE (m)-[r:REFERENCES_CODE {
          similarity: similarity,
          type: 'semantic',
          created_at: datetime()
        }]->(c)
      `, { memoryId, projectName, threshold })
    }
    
    // Link based on exact name matches
    for (const ref of [...analysis.codeReferences, ...analysis.functionCalls, ...analysis.classReferences]) {
      await session.run(`
        MATCH (m:Memory {id: $memoryId})
        MATCH (c:CodeEntity {project_name: $projectName, name: $name})
        MERGE (m)-[r:REFERENCES_CODE {
          type: 'name_match',
          reference_text: $name,
          created_at: datetime()
        }]->(c)
      `, { memoryId, projectName, name: ref })
    }
    
    // Link based on file path matches
    for (const filePath of analysis.fileReferences) {
      // Handle partial paths
      await session.run(`
        MATCH (m:Memory {id: $memoryId})
        MATCH (f:CodeFile {project_name: $projectName})
        WHERE f.path CONTAINS $filePath
        MERGE (m)-[r:REFERENCES_FILE {
          type: 'path_match',
          reference_path: $filePath,
          created_at: datetime()
        }]->(f)
      `, { memoryId, projectName, filePath })
    }
    
    // Store analysis results in memory metadata
    await session.run(`
      MATCH (m:Memory {id: $memoryId})
      SET m.code_analysis = $analysis,
          m.has_code_references = true,
          m.code_linked_at = datetime()
    `, { memoryId, analysis: JSON.stringify(analysis) })
    
  } finally {
    await session.close()
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { memoryId, projectName, workspaceId, threshold = 0.7 } = await req.json() as LinkingRequest
    
    if (!memoryId && !projectName && !workspaceId) {
      return new Response(
        JSON.stringify({ error: 'Either memoryId, projectName, or workspaceId is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }
    
    const driver = getNeo4jDriver()
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
    })
    
    const session = driver.session()
    
    try {
      // Get memories to process
      let memoriesQuery = ''
      let params: Record<string, any> = {}
      
      if (memoryId) {
        memoriesQuery = `
          MATCH (m:Memory {id: $memoryId})
          RETURN m.id as id, m.content as content, m.project_name as projectName
        `
        params = { memoryId }
      } else if (projectName) {
        memoriesQuery = `
          MATCH (m:Memory {project_name: $projectName})
          WHERE m.has_code_references IS NULL OR m.has_code_references = false
          RETURN m.id as id, m.content as content, m.project_name as projectName
          LIMIT 100
        `
        params = { projectName }
      } else if (workspaceId) {
        memoriesQuery = `
          MATCH (m:Memory {workspace_id: $workspaceId})
          WHERE m.has_code_references IS NULL OR m.has_code_references = false
          RETURN m.id as id, m.content as content, m.project_name as projectName
          LIMIT 100
        `
        params = { workspaceId }
      }
      
      const result = await session.run(memoriesQuery, params)
      
      if (!result.records.length) {
        return new Response(
          JSON.stringify({ 
            message: 'No memories found to process',
            processed: 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log(`Processing ${result.records.length} memories for code linking`)
      
      let processedCount = 0
      const errors: any[] = []
      
      // Process memories
      for (const record of result.records) {
        const memId = record.get('id')
        const content = record.get('content')
        const projName = record.get('projectName')
        
        try {
          // Analyze memory content
          const analysis = await analyzeMemoryContent(content, openai)
          
          // Only link if we found code references
          if (
            analysis.codeReferences.length > 0 ||
            analysis.functionCalls.length > 0 ||
            analysis.classReferences.length > 0 ||
            analysis.fileReferences.length > 0
          ) {
            await linkMemoryToCode(driver, memId, projName, analysis, threshold)
            processedCount++
          } else {
            // Mark as analyzed but no code references found
            const markSession = driver.session()
            try {
              await markSession.run(`
                MATCH (m:Memory {id: $memoryId})
                SET m.has_code_references = false,
                    m.code_linked_at = datetime()
              `, { memoryId: memId })
            } finally {
              await markSession.close()
            }
          }
        } catch (error) {
          console.error(`Error processing memory ${memId}:`, error)
          errors.push({ memoryId: memId, error: error.message })
        }
      }
      
      return new Response(
        JSON.stringify({
          message: 'Memory-code linking completed',
          processed: processedCount,
          total: result.records.length,
          errors: errors.length > 0 ? errors : undefined
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
      
    } finally {
      await session.close()
      await driver.close()
    }
    
  } catch (error) {
    console.error('Error in link-memory-code:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})