import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize clients
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NEO4J_URI = Deno.env.get('NEO4J_URI')!
const NEO4J_USER = Deno.env.get('NEO4J_USER')!
const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function getNeo4jDriver() {
  return neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
}

// Helper to call the existing parse-code function
async function parseCode(code: string, language: string, filename: string) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ code, language, filename })
    })

    if (!response.ok) {
      console.error('[GitHub Code Parser] Parse code failed:', await response.text())
      return null
    }

    const result = await response.json()
    return result.parsed || result
  } catch (error) {
    console.error('[GitHub Code Parser] Error calling parse-code:', error)
    return null
  }
}

// Helper to generate embeddings
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-embedding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ text })
    })

    if (!response.ok) {
      console.error('[GitHub Code Parser] Generate embedding failed:', await response.text())
      return []
    }

    const result = await response.json()
    return result.embedding || []
  } catch (error) {
    console.error('[GitHub Code Parser] Error generating embedding:', error)
    return []
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { batch_size = 5 } = await req.json()
    
    console.log(`[GitHub Code Parser Worker] Processing batch of ${batch_size} messages`)
    
    // Read messages from queue
    const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
      queue_name: 'github_code_parsing',
      vt: 300, // 5 minute visibility timeout
      qty: batch_size
    })
    
    if (readError || !messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ 
          processed: 0, 
          message: 'No messages to process',
          error: readError?.message 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log(`[GitHub Code Parser Worker] Found ${messages.length} messages to process`)
    
    const driver = getNeo4jDriver()
    const session = driver.session()
    const processedIds = []
    const errors = []
    
    try {
      for (const msg of messages) {
        const { 
          repository_id,
          file_id, 
          file_path, 
          file_content, 
          language, 
          branch,
          commit_sha 
        } = msg.message
        
        try {
          console.log(`[GitHub Code Parser Worker] Processing ${file_path} (${language})`)
          
          // Parse the code using existing infrastructure
          const parsedData = await parseCode(file_content, language, file_path)
          
          if (!parsedData) {
            console.warn(`[GitHub Code Parser Worker] No parsed data for ${file_path}`)
            processedIds.push(msg.msg_id)
            continue
          }
          
          // Get repository info
          const repoResult = await session.run(
            'MATCH (r:Repository {id: $id}) RETURN r.github_id as github_id, r.full_name as full_name',
            { id: repository_id }
          )
          
          if (repoResult.records.length === 0) {
            throw new Error(`Repository not found: ${repository_id}`)
          }
          
          const repo = repoResult.records[0]
          const repoGithubId = repo.get('github_id')
          const repoFullName = repo.get('full_name')
          
          // Process functions
          if (parsedData.functions && parsedData.functions.length > 0) {
            for (const func of parsedData.functions) {
              const signature = `${func.name}(${(func.params || []).join(', ')})`
              const docstring = func.docstring || ''
              const combinedText = `${signature}\n${docstring}`.trim()
              const embedding = await generateEmbedding(combinedText)
              
              await session.run(
                `
                MERGE (fn:RepoFunction {id: $id})
                SET fn += {
                  name: $name,
                  signature: $signature,
                  parameters: $parameters,
                  return_type: $return_type,
                  docstring: $docstring,
                  start_line: $start_line,
                  end_line: $end_line,
                  is_async: $is_async,
                  is_exported: $is_exported,
                  embedding: $embedding
                }
                WITH fn
                MATCH (f:RepoFile {id: $file_id})
                MERGE (f)-[:CONTAINS_FUNCTION]->(fn)
                WITH fn
                MATCH (r:Repository {github_id: $repo_github_id})
                MERGE (r)-[:HAS_FUNCTION]->(fn)
                `,
                {
                  id: `${repoFullName}#${branch}#${file_path}#function:${func.name}`,
                  name: func.name,
                  signature: signature,
                  parameters: JSON.stringify(func.params || []),
                  return_type: func.returnType || null,
                  docstring: docstring,
                  start_line: func.line || 0,
                  end_line: func.endLine || func.line || 0,
                  is_async: func.async || false,
                  is_exported: func.exported || false,
                  embedding: embedding,
                  file_id: file_id,
                  repo_github_id: repoGithubId
                }
              )
            }
          }
          
          // Process classes
          if (parsedData.classes && parsedData.classes.length > 0) {
            for (const cls of parsedData.classes) {
              const docstring = cls.docstring || ''
              const classSignature = `class ${cls.name}${cls.extends ? ` extends ${cls.extends}` : ''}`
              const combinedText = `${classSignature}\n${docstring}`.trim()
              const embedding = await generateEmbedding(combinedText)
              
              await session.run(
                `
                MERGE (c:RepoClass {id: $id})
                SET c += {
                  name: $name,
                  extends: $extends,
                  implements: $implements,
                  docstring: $docstring,
                  start_line: $start_line,
                  end_line: $end_line,
                  is_exported: $is_exported,
                  method_count: $method_count,
                  property_count: $property_count,
                  embedding: $embedding
                }
                WITH c
                MATCH (f:RepoFile {id: $file_id})
                MERGE (f)-[:CONTAINS_CLASS]->(c)
                WITH c
                MATCH (r:Repository {github_id: $repo_github_id})
                MERGE (r)-[:HAS_CLASS]->(c)
                `,
                {
                  id: `${repoFullName}#${branch}#${file_path}#class:${cls.name}`,
                  name: cls.name,
                  extends: cls.extends || null,
                  implements: JSON.stringify(cls.implements || []),
                  docstring: docstring,
                  start_line: cls.line || 0,
                  end_line: cls.endLine || cls.line || 0,
                  is_exported: cls.exported || false,
                  method_count: (cls.methods || []).length,
                  property_count: (cls.properties || []).length,
                  embedding: embedding,
                  file_id: file_id,
                  repo_github_id: repoGithubId
                }
              )
            }
          }
          
          // Log success
          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-code-parser-worker',
            p_level: 'info',
            p_message: `Successfully parsed ${file_path}`,
            p_repository_id: repository_id,
            p_details: {
              file: file_path,
              functions: (parsedData.functions || []).length,
              classes: (parsedData.classes || []).length,
              types: (parsedData.types || []).length
            }
          })
          
          processedIds.push(msg.msg_id)
          
        } catch (error) {
          console.error(`[GitHub Code Parser Worker] Error processing ${file_path}:`, error)
          errors.push({ file: file_path, error: String(error) })
          
          await supabase.rpc('log_github_activity', {
            p_function_name: 'github-code-parser-worker',
            p_level: 'error',
            p_message: `Failed to parse ${file_path}`,
            p_repository_id: repository_id,
            p_error_code: 'PARSE_ERROR',
            p_error_stack: error.stack,
            p_details: { file: file_path, error: String(error) }
          })
          
          // Still mark as processed to avoid infinite retries
          processedIds.push(msg.msg_id)
        }
      }
      
      // Delete processed messages
      if (processedIds.length > 0) {
        await supabase.rpc('pgmq_delete', {
          queue_name: 'github_code_parsing',
          msg_ids: processedIds
        })
      }
      
      return new Response(
        JSON.stringify({
          processed: processedIds.length,
          errors: errors.length,
          message: `Processed ${processedIds.length} files with ${errors.length} errors`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
      
    } finally {
      await session.close()
      await driver.close()
    }
    
  } catch (error) {
    console.error('[GitHub Code Parser Worker] Fatal error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})