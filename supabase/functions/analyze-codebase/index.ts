import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import neo4j from 'https://esm.sh/neo4j-driver@5.28.1'
import * as ts from 'https://esm.sh/typescript@5.5.3'

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

// Generate embedding for code
async function generateCodeEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-large',
      dimensions: 3072
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

// Extract entities from TypeScript code
function extractCodeEntities(content: string, filePath: string, projectName: string) {
  const entities: any[] = []
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  )

  function visit(node: ts.Node, parentId?: string) {
    // Extract functions
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile)
      const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
      const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
      
      entities.push({
        id: `${filePath}:${name}:${lineStart}`,
        name,
        type: 'function',
        file_path: filePath,
        project_name: projectName,
        line_start: lineStart + 1,
        line_end: lineEnd + 1,
        content: node.getText(sourceFile),
        is_exported: node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) || false,
        parent_id: parentId
      })
    }
    
    // Extract classes
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile)
      const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
      const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
      
      const classId = `${filePath}:${name}:${lineStart}`
      entities.push({
        id: classId,
        name,
        type: 'class',
        file_path: filePath,
        project_name: projectName,
        line_start: lineStart + 1,
        line_end: lineEnd + 1,
        content: node.getText(sourceFile),
        is_exported: node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) || false
      })
      
      // Visit class members with parent reference
      ts.forEachChild(node, child => visit(child, classId))
      return
    }
    
    // Extract interfaces
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.getText(sourceFile)
      const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
      const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
      
      entities.push({
        id: `${filePath}:${name}:${lineStart}`,
        name,
        type: 'interface',
        file_path: filePath,
        project_name: projectName,
        line_start: lineStart + 1,
        line_end: lineEnd + 1,
        content: node.getText(sourceFile),
        is_exported: node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) || false
      })
    }
    
    // Continue traversing
    ts.forEachChild(node, child => visit(child, parentId))
  }

  visit(sourceFile)
  return entities
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { files, projectName, workspaceId } = await req.json()
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('Files array is required')
    }
    
    if (!projectName) {
      throw new Error('Project name is required')
    }

    const driver = getNeo4jDriver()
    const session = driver.session()
    
    try {
      let totalEntities = 0
      let totalRelationships = 0
      
      // Process each file
      for (const file of files) {
        const { path: filePath, content } = file
        
        // Skip non-TypeScript/JavaScript files
        if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) continue
        
        // Extract code entities
        const entities = extractCodeEntities(content, filePath, projectName)
        
        // Create module node
        const moduleEmbedding = await generateCodeEmbedding(
          `File: ${filePath.split('/').pop()}\n${content.substring(0, 1000)}`
        )
        
        await session.run(
          `
          MERGE (m:Module {file_path: $filePath})
          SET m.project_name = $projectName,
              m.name = $name,
              m.embedding = $embedding,
              m.line_count = $lineCount,
              m.created_at = datetime(),
              m.updated_at = datetime()
          `,
          {
            filePath,
            projectName,
            name: filePath.split('/').pop(),
            embedding: moduleEmbedding,
            lineCount: content.split('\n').length
          }
        )
        
        // Create code entities
        for (const entity of entities) {
          const embedding = await generateCodeEmbedding(
            `${entity.type} ${entity.name}: ${entity.content.substring(0, 500)}`
          )
          
          await session.run(
            `
            MERGE (c:CodeEntity {id: $id})
            SET c.name = $name,
                c.type = $type,
                c.file_path = $file_path,
                c.project_name = $project_name,
                c.line_start = $line_start,
                c.line_end = $line_end,
                c.content = $content,
                c.is_exported = $is_exported,
                c.embedding = $embedding,
                c.created_at = datetime(),
                c.updated_at = datetime()
            `,
            {
              ...entity,
              embedding
            }
          )
          
          totalEntities++
          
          // Create parent relationships
          if (entity.parent_id) {
            await session.run(
              `
              MATCH (parent:CodeEntity {id: $parentId})
              MATCH (child:CodeEntity {id: $childId})
              MERGE (parent)-[r:HAS_${entity.type === 'method' ? 'METHOD' : 'PROPERTY'}]->(child)
              SET r.created_at = datetime()
              `,
              {
                parentId: entity.parent_id,
                childId: entity.id
              }
            )
            totalRelationships++
          }
        }
      }
      
      // Connect memories to newly created code entities
      const connectResult = await session.run(
        `
        MATCH (m:Memory)
        WHERE m.project_name = $projectName
          AND NOT EXISTS {
            MATCH (m)-[:DISCUSSES]->(:CodeEntity)
          }
        WITH m LIMIT 100
        CALL {
          WITH m
          MATCH (c:CodeEntity)
          WHERE c.project_name = m.project_name
            AND gds.similarity.cosine(m.embedding, c.embedding) > 0.75
          WITH m, c
          ORDER BY gds.similarity.cosine(m.embedding, c.embedding) DESC
          LIMIT 3
          MERGE (m)-[r:DISCUSSES]->(c)
          SET r.confidence = gds.similarity.cosine(m.embedding, c.embedding),
              r.inferred = true,
              r.created_at = datetime()
          RETURN 1 as connected
        }
        RETURN count(distinct m) as memoriesConnected
        `,
        { projectName }
      )
      
      const memoriesConnected = connectResult.records[0]?.get('memoriesConnected') || 0
      
      return new Response(
        JSON.stringify({
          success: true,
          projectName,
          filesProcessed: files.length,
          entitiesCreated: totalEntities,
          relationshipsCreated: totalRelationships,
          memoriesConnected
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
      
    } finally {
      await session.close()
      await driver.close()
    }
    
  } catch (error) {
    console.error('Error in analyze-codebase:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})