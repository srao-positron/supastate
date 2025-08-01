import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extract keywords from code
function extractKeywords(text: string): Record<string, number> {
  if (!text) return {}
  
  const lowerText = text.toLowerCase()
  const keywords: Record<string, number> = {}
  
  // Define keyword patterns to look for
  const patterns = {
    // Debugging patterns
    error: /\b(error|exception|fail|crash|bug)\b/g,
    debug: /\b(debug|trace|log|console)\b/g,
    fix: /\b(fix|patch|resolve|solve)\b/g,
    issue: /\b(issue|problem|trouble|wrong)\b/g,
    
    // Learning patterns
    learn: /\b(learn|study|understand|research)\b/g,
    implement: /\b(implement|build|create|develop)\b/g,
    understand: /\b(understand|comprehend|grasp)\b/g,
    
    // Architecture patterns
    architecture: /\b(architecture|structure|design)\b/g,
    pattern: /\b(pattern|paradigm|approach)\b/g,
    system: /\b(system|infrastructure|framework)\b/g,
    component: /\b(component|module|service)\b/g,
    
    // Refactoring patterns
    refactor: /\b(refactor|restructure|reorganize)\b/g,
    improve: /\b(improve|enhance|optimize)\b/g,
    clean: /\b(clean|tidy|organize)\b/g,
    
    // Other useful keywords
    test: /\b(test|testing|spec|unit)\b/g,
    deploy: /\b(deploy|deployment|production)\b/g,
    performance: /\b(performance|speed|latency|optimize)\b/g,
    security: /\b(security|auth|authentication|permission)\b/g,
  }
  
  // Count occurrences
  for (const [key, pattern] of Object.entries(patterns)) {
    const matches = lowerText.match(pattern)
    if (matches) {
      keywords[key] = matches.length
    }
  }
  
  return keywords
}

// Generate embedding for code
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const openAIKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAIKey) {
      console.error('[Ingest Code to Neo4j] No OpenAI API key configured')
      return null
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 3072
      })
    })

    if (!response.ok) {
      console.error('[Ingest Code to Neo4j] OpenAI API error:', response.statusText)
      return null
    }

    const data = await response.json()
    return data.data[0].embedding
  } catch (error) {
    console.error('[Ingest Code to Neo4j] Error generating embedding:', error)
    return null
  }
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
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )
}

// Helper to call parse-code function
async function parseCode(code: string, language: string, filename: string) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Ingest Code to Neo4j] Missing Supabase credentials for parse-code')
    return null
  }

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
      console.error('[Ingest Code to Neo4j] Parse code failed:', await response.text())
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('[Ingest Code to Neo4j] Error calling parse-code:', error)
    return null
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code_entities, user_id, workspace_id } = await req.json()

    if (!code_entities || !Array.isArray(code_entities) || code_entities.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No code entities provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`[Ingest Code to Neo4j] Processing ${code_entities.length} code entities`)

    const driver = getNeo4jDriver()
    const session = driver.session()
    
    const results = []
    const errors = []

    try {
      for (const entity of code_entities) {
        try {
          // Parse the code to extract structured information
          let parsedData = null
          if (entity.source_code && entity.language) {
            console.log(`[Ingest Code to Neo4j] Parsing ${entity.file_path} (${entity.language})`)
            parsedData = await parseCode(entity.source_code, entity.language, entity.file_path)
          }

          // Merge parsed data into metadata
          const enrichedMetadata = {
            ...(entity.metadata || {}),
            ...(parsedData && {
              imports: parsedData.imports || [],
              exports: parsedData.exports || [],
              functions: parsedData.functions || [],
              classes: parsedData.classes || [],
              components: parsedData.components || [],
              types: parsedData.types || [],
              apiCalls: parsedData.apiCalls || []
            })
          }

          // Validate entity ID
          if (!entity.id) {
            throw new Error(`Entity missing ID: ${entity.file_path}`)
          }

          console.log(`[Ingest Code to Neo4j] Processing entity: ID=${entity.id}, path=${entity.file_path}`)

          // Create CodeEntity node in Neo4j
          // IMPORTANT: Only use ID for MERGE since it's unique across all entities
          const result = await session.run(
            `
            MERGE (c:CodeEntity {
              id: $id
            })
            SET c.path = $path,
                c.name = $name,
                c.type = $type,
                c.language = $language,
                c.content = $content,
                c.project_name = $project_name,
                c.workspace_id = $workspace_id,
                c.user_id = $user_id,
                c.created_at = datetime($created_at),
                c.updated_at = datetime($updated_at),
                c.metadata = $metadata
            RETURN c
            `,
            {
              id: entity.id,
              workspace_id: workspace_id || `user:${user_id}`,
              path: entity.file_path,
              name: entity.name,
              type: entity.entity_type || 'module',
              language: entity.language,
              content: entity.source_code,
              project_name: entity.project_name,
              user_id: user_id,
              created_at: entity.created_at || new Date().toISOString(),
              updated_at: entity.updated_at || new Date().toISOString(),
              metadata: JSON.stringify(enrichedMetadata)
            }
          )

          console.log(`[Ingest Code to Neo4j] Created/Updated CodeEntity node: ID=${entity.id}, path=${entity.file_path}`)

          // Create EntitySummary for this code entity
          const embeddingText = [
            entity.name || '',
            entity.file_path || '',
            // Include function names
            ...(enrichedMetadata.functions || []).map((f: any) => f.name),
            // Include class names
            ...(enrichedMetadata.classes || []).map((c: any) => c.name),
            // Include component names
            ...(enrichedMetadata.components || []).map((c: any) => c.name),
            // Include type names
            ...(enrichedMetadata.types || []).map((t: any) => t.name),
            // Extract key content (first 500 chars)
            (entity.source_code || '').slice(0, 500)
          ].filter(Boolean).join(' ')
          
          const embedding = await generateEmbedding(embeddingText)
          if (embedding) {
            const keywords = extractKeywords(entity.source_code || '')
            const patternSignals = {
              has_imports: (enrichedMetadata.imports || []).length > 0,
              has_exports: (enrichedMetadata.exports || []).length > 0,
              has_functions: (enrichedMetadata.functions || []).length > 0,
              has_classes: (enrichedMetadata.classes || []).length > 0,
              has_components: (enrichedMetadata.components || []).length > 0,
              has_types: (enrichedMetadata.types || []).length > 0,
              has_api_calls: (enrichedMetadata.apiCalls || []).length > 0,
              is_test_file: entity.file_path?.includes('test') || entity.file_path?.includes('spec'),
              is_config_file: entity.file_path?.includes('config') || entity.file_path?.endsWith('.json'),
              language: entity.language || 'unknown',
              function_count: (enrichedMetadata.functions || []).length,
              class_count: (enrichedMetadata.classes || []).length,
              import_count: (enrichedMetadata.imports || []).length
            }
            
            const summaryId = crypto.randomUUID()
            await session.run(`
              MATCH (c:CodeEntity {id: $entityId})
              MERGE (s:EntitySummary {
                entity_id: $entityId,
                entity_type: 'code'
              })
              ON CREATE SET
                s.id = $summaryId,
                s.user_id = $userId,
                s.workspace_id = $workspaceId,
                s.project_name = $projectName,
                s.created_at = datetime(),
                s.updated_at = datetime(),
                s.processed_at = datetime(),
                s.embedding = $embedding,
                s.keyword_frequencies = $keywords,
                s.pattern_signals = $patternSignals,
                s.metadata = $metadata
              ON MATCH SET
                s.updated_at = datetime(),
                s.processed_at = datetime()
              WITH c, s
              MERGE (s)-[:SUMMARIZES]->(c)
              MERGE (c)-[:HAS_SUMMARY]->(s)
            `, {
              summaryId,
              entityId: entity.id,
              userId: user_id || null,
              workspaceId: workspace_id || null,
              projectName: entity.project_name || 'default',
              embedding: embedding,
              keywords: JSON.stringify(keywords),
              patternSignals: JSON.stringify(patternSignals),
              metadata: JSON.stringify(enrichedMetadata)
            })
            
            console.log(`[Ingest Code to Neo4j] Created EntitySummary for code entity ${entity.id}`)
          }

          // Create Project node if it doesn't exist
          if (entity.project_name) {
            await session.run(
              `
              MERGE (p:Project {name: $project_name, workspace_id: $workspace_id})
              WITH p
              MATCH (c:CodeEntity {id: $entity_id})
              MERGE (c)-[:BELONGS_TO_PROJECT]->(p)
              `,
              {
                project_name: entity.project_name,
                workspace_id: workspace_id || `user:${user_id}`,
                entity_id: entity.id
              }
            )
          }

          // Create User relationship if user_id provided
          if (user_id) {
            await session.run(
              `
              MERGE (u:User {id: $user_id})
              WITH u
              MATCH (c:CodeEntity {id: $entity_id})
              MERGE (c)-[:CREATED_BY]->(u)
              `,
              {
                user_id: user_id,
                entity_id: entity.id
              }
            )
          }

          // Create file hierarchy relationships
          const pathParts = entity.file_path.split('/')
          if (pathParts.length > 1) {
            const parentPath = pathParts.slice(0, -1).join('/')
            await session.run(
              `
              MATCH (c:CodeEntity {id: $entity_id})
              MATCH (p:CodeEntity {path: $parent_path, workspace_id: $workspace_id})
              MERGE (c)-[:CHILD_OF]->(p)
              `,
              {
                entity_id: entity.id,
                parent_path: parentPath,
                workspace_id: workspace_id || `user:${user_id}`
              }
            ).catch(() => {
              // Parent might not exist, that's ok
            })
          }

          // Create relationships based on parsed data
          if (parsedData) {
            // Create import relationships
            if (parsedData.imports && parsedData.imports.length > 0) {
              for (const imp of parsedData.imports) {
                // Try to find the imported module in the same workspace
                const importPath = imp.source.startsWith('.') 
                  ? entity.file_path.split('/').slice(0, -1).join('/') + '/' + imp.source
                  : imp.source

                await session.run(
                  `
                  MATCH (c:CodeEntity {id: $entity_id})
                  MATCH (m:CodeEntity {workspace_id: $workspace_id})
                  WHERE m.path CONTAINS $import_path OR m.name = $import_path
                  MERGE (c)-[r:IMPORTS]->(m)
                  SET r.specifiers = $specifiers
                  `,
                  {
                    entity_id: entity.id,
                    workspace_id: workspace_id || `user:${user_id}`,
                    import_path: importPath,
                    specifiers: imp.specifiers || []
                  }
                ).catch(() => {
                  // Imported module might not exist in our codebase, that's ok
                })
              }
            }

            // Create function/class nodes and relationships
            if (parsedData.functions && parsedData.functions.length > 0) {
              for (const func of parsedData.functions) {
                await session.run(
                  `
                  MATCH (c:CodeEntity {id: $entity_id})
                  MERGE (f:Function {
                    name: $name,
                    parent_id: $entity_id,
                    workspace_id: $workspace_id
                  })
                  SET f.async = $async,
                      f.generator = $generator,
                      f.params = $params,
                      f.returnType = $returnType
                  MERGE (c)-[:DEFINES_FUNCTION]->(f)
                  `,
                  {
                    entity_id: entity.id,
                    workspace_id: workspace_id || `user:${user_id}`,
                    name: func.name,
                    async: func.async || false,
                    generator: func.generator || false,
                    params: JSON.stringify(func.params || []),
                    returnType: func.returnType || null
                  }
                )
              }
            }

            // Create class nodes
            if (parsedData.classes && parsedData.classes.length > 0) {
              for (const cls of parsedData.classes) {
                await session.run(
                  `
                  MATCH (c:CodeEntity {id: $entity_id})
                  MERGE (cl:Class {
                    name: $name,
                    parent_id: $entity_id,
                    workspace_id: $workspace_id
                  })
                  SET cl.extends = $extends,
                      cl.methods = $methods
                  MERGE (c)-[:DEFINES_CLASS]->(cl)
                  `,
                  {
                    entity_id: entity.id,
                    workspace_id: workspace_id || `user:${user_id}`,
                    name: cls.name,
                    extends: cls.extends || null,
                    methods: JSON.stringify(cls.methods || [])
                  }
                )
              }
            }

            // Create React component nodes
            if (parsedData.components && parsedData.components.length > 0) {
              for (const comp of parsedData.components) {
                await session.run(
                  `
                  MATCH (c:CodeEntity {id: $entity_id})
                  MERGE (rc:ReactComponent {
                    name: $name,
                    parent_id: $entity_id,
                    workspace_id: $workspace_id
                  })
                  SET rc.hooks = $hooks,
                      rc.props = $props
                  MERGE (c)-[:DEFINES_COMPONENT]->(rc)
                  `,
                  {
                    entity_id: entity.id,
                    workspace_id: workspace_id || `user:${user_id}`,
                    name: comp.name,
                    hooks: comp.hooks || [],
                    props: comp.props || []
                  }
                )
              }
            }
          }

          results.push({ id: entity.id, success: true })
        } catch (error) {
          console.error(`[Ingest Code to Neo4j] Error processing entity ${entity.id}:`, error)
          errors.push({ id: entity.id, error: error.message })
        }
      }

    } finally {
      await session.close()
      await driver.close()
    }

    console.log(`[Ingest Code to Neo4j] Completed: ${results.length} success, ${errors.length} errors`)

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        errors: errors.length,
        results,
        errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Ingest Code to Neo4j] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})