import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import neo4j from 'https://esm.sh/neo4j-driver@5.28.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Neo4j driver initialization
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

// Extract code references from text
function extractCodeReferences(content: string): { name: string; confidence: number; reason: string }[] {
  const references: { name: string; confidence: number; reason: string }[] = []
  
  // Pattern 1: Explicit mentions
  const explicitPatterns = [
    /(?:class|interface|function|method|component|service|controller|module)\s+(\w+)/gi,
    /(\w+)(?:Service|Controller|Component|Module|Handler|Manager|Provider)/g,
    /`(\w+)`/g,
  ]
  
  for (const pattern of explicitPatterns) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const name = match[1] || match[0]
      if (name.length > 2 && !isCommonWord(name)) {
        references.push({
          name,
          confidence: 0.9,
          reason: 'Explicit code reference'
        })
      }
    }
  }
  
  // Pattern 2: File paths
  const filePattern = /(?:src\/|lib\/|components\/)[\w\/]+\.(ts|js|tsx|jsx)/g
  const fileMatches = content.matchAll(filePattern)
  for (const match of fileMatches) {
    const filePath = match[0]
    const fileName = filePath.split('/').pop()?.replace(/\.(ts|js|tsx|jsx)$/, '')
    if (fileName) {
      references.push({
        name: fileName,
        confidence: 0.95,
        reason: 'File path reference'
      })
    }
  }
  
  // Deduplicate and sort by confidence
  const uniqueReferences = Array.from(
    new Map(references.map(r => [r.name, r])).values()
  ).sort((a, b) => b.confidence - a.confidence)
  
  return uniqueReferences
}

function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'The', 'This', 'That', 'These', 'Those',
    'Component', 'Service', 'Module', 'Function',
    'Error', 'Exception', 'Result', 'Response'
  ])
  return commonWords.has(word)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { memoryId, batchMemoryIds } = await req.json()
    
    if (!memoryId && !batchMemoryIds) {
      throw new Error('Either memoryId or batchMemoryIds must be provided')
    }

    const driver = getNeo4jDriver()
    const session = driver.session()
    
    try {
      const memoryIds = batchMemoryIds || [memoryId]
      const results = []
      
      for (const id of memoryIds) {
        // Get memory content
        const memoryResult = await session.run(
          'MATCH (m:Memory {id: $id}) RETURN m',
          { id }
        )
        
        if (memoryResult.records.length === 0) continue
        
        const memory = memoryResult.records[0].get('m').properties
        let relationshipsCreated = 0
        
        // 1. Infer code relationships
        const codeReferences = extractCodeReferences(memory.content)
        
        for (const ref of codeReferences) {
          if (ref.confidence > 0.7) {
            // Find matching code entities
            const codeResult = await session.run(
              `
              MATCH (c:CodeEntity)
              WHERE c.project_name = $projectName
                AND (c.name = $refName OR c.name CONTAINS $refName)
              WITH c
              LIMIT 5
              MATCH (m:Memory {id: $memoryId})
              MERGE (m)-[r:DISCUSSES]->(c)
              SET r.confidence = $confidence,
                  r.reason = $reason,
                  r.inferred = true,
                  r.created_at = datetime()
              RETURN c.id as codeId
              `,
              {
                projectName: memory.project_name,
                refName: ref.name,
                memoryId: id,
                confidence: ref.confidence,
                reason: ref.reason
              }
            )
            
            relationshipsCreated += codeResult.records.length
          }
        }
        
        // 2. Infer knowledge evolution (find similar previous memories)
        const evolutionResult = await session.run(
          `
          MATCH (current:Memory {id: $memoryId})
          MATCH (other:Memory)
          WHERE other.project_name = current.project_name
            AND other.id <> current.id
            AND other.user_id = current.user_id
            AND datetime(other.created_at) < datetime(current.created_at)
            AND datetime(other.created_at) > datetime(current.created_at) - duration({days: 7})
          WITH current, other,
               gds.similarity.cosine(current.embedding, other.embedding) as similarity
          WHERE similarity > 0.8
          ORDER BY similarity DESC
          LIMIT 3
          WITH current, other, similarity
          
          // Determine relationship type based on content
          WITH current, other, similarity,
               CASE
                 WHEN other.content CONTAINS 'error' AND current.content CONTAINS 'fixed'
                 THEN 'LED_TO_UNDERSTANDING'
                 WHEN other.content CONTAINS 'planning' AND current.content CONTAINS 'implemented'
                 THEN 'PRECEDED_BY'
                 ELSE 'EVOLVED_INTO'
               END as relType
          
          CALL apoc.do.when(
            relType = 'LED_TO_UNDERSTANDING',
            'CREATE (other)-[r:LED_TO_UNDERSTANDING]->(current) SET r.confidence = similarity, r.inferred = true, r.created_at = datetime() RETURN 1',
            'CALL apoc.do.when(
               relType = "PRECEDED_BY",
               "CREATE (other)-[r:PRECEDED_BY]->(current) SET r.confidence = similarity, r.inferred = true, r.created_at = datetime() RETURN 1",
               "CREATE (other)-[r:EVOLVED_INTO]->(current) SET r.confidence = similarity, r.inferred = true, r.created_at = datetime() RETURN 1",
               {other: other, current: current, similarity: similarity}
             ) YIELD value RETURN value',
            {other: other, current: current, similarity: similarity, relType: relType}
          ) YIELD value
          RETURN count(*) as evolutionRels
          `,
          { memoryId: id }
        )
        
        const evolutionRels = evolutionResult.records[0]?.get('evolutionRels') || 0
        relationshipsCreated += evolutionRels
        
        // 3. Extract and link concepts
        const conceptPattern = /\b(authentication|authorization|caching|database|api|frontend|backend|performance|security|testing)\b/gi
        const concepts = new Set<string>()
        const conceptMatches = memory.content.matchAll(conceptPattern)
        for (const match of conceptMatches) {
          concepts.add(match[1].toLowerCase())
        }
        
        for (const concept of Array.from(concepts).slice(0, 5)) {
          await session.run(
            `
            MERGE (c:Concept {name: $concept})
            ON CREATE SET c.id = randomUUID(),
                          c.created_at = datetime()
            WITH c
            MATCH (m:Memory {id: $memoryId})
            MERGE (m)-[r:DISCUSSES]->(c)
            SET r.created_at = datetime()
            `,
            { memoryId: id, concept }
          )
          relationshipsCreated++
        }
        
        results.push({
          memoryId: id,
          relationshipsCreated,
          codeReferences: codeReferences.length,
          concepts: concepts.size
        })
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          results,
          totalRelationships: results.reduce((sum, r) => sum + r.relationshipsCreated, 0)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
      
    } finally {
      await session.close()
      await driver.close()
    }
    
  } catch (error) {
    console.error('Error in infer-relationships:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})