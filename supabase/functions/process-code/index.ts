import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts'
import neo4j from 'https://unpkg.com/neo4j-driver@5.12.0/lib/browser/neo4j-web.esm.js'
import ts from 'https://esm.sh/typescript@5.3.3'

const BATCH_SIZE = 50
const PARALLEL_WORKERS = 10
const MAX_RETRIES = 3

// Neo4j connection
let driver: any = null

function getDriver() {
  if (!driver) {
    const NEO4J_URI = Deno.env.get('NEO4J_URI') || 'neo4j+s://eb61aceb.databases.neo4j.io'
    const NEO4J_USER = Deno.env.get('NEO4J_USER') || 'neo4j'
    const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD')

    if (!NEO4J_PASSWORD) {
      throw new Error('NEO4J_PASSWORD environment variable is required')
    }

    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      {
        maxConnectionPoolSize: 100,
        connectionAcquisitionTimeout: 120000,
        maxTransactionRetryTime: 60000,
      }
    )
  }
  return driver
}

interface CodeEntity {
  id: string
  type: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'import' | 'jsx_component'
  name: string
  signature?: string
  content: string
  lineStart: number
  lineEnd: number
  columnStart?: number
  columnEnd?: number
  metadata: any
  embedding?: number[]
  docEmbedding?: number[]
}

interface Relationship {
  fromId: string
  toId: string
  type: string
  properties?: Record<string, any>
}

// TypeScript Parser
class TypeScriptParser {
  parse(content: string, filePath: string): { entities: CodeEntity[], relationships: Relationship[] } {
    const entities: CodeEntity[] = []
    const relationships: Relationship[] = []
    
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    )

    const visit = (node: ts.Node) => {
      // Functions
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        const name = (node as any).name?.getText() || 'anonymous'
        const entity: CodeEntity = {
          id: crypto.randomUUID(),
          type: 'function',
          name,
          signature: this.getFunctionSignature(node as any),
          content: node.getText(),
          lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
          columnStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).character,
          columnEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).character,
          metadata: {
            isAsync: (node as any).modifiers?.some((m: any) => m.kind === ts.SyntaxKind.AsyncKeyword),
            isExported: (node as any).modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword),
            parameters: this.getParameters(node as any),
            returnType: this.getReturnType(node as any)
          }
        }
        entities.push(entity)

        // Extract function calls
        this.extractFunctionCalls(node, entity.id, relationships, sourceFile)
      }

      // Classes
      if (ts.isClassDeclaration(node)) {
        const name = node.name?.getText() || 'anonymous'
        const entity: CodeEntity = {
          id: crypto.randomUUID(),
          type: 'class',
          name,
          content: node.getText(),
          lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
          metadata: {
            isExported: node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword),
            isAbstract: node.modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword),
            extends: this.getExtends(node),
            implements: this.getImplements(node)
          }
        }
        entities.push(entity)

        // Process class members
        node.members.forEach(member => {
          if (ts.isMethodDeclaration(member)) {
            const methodEntity: CodeEntity = {
              id: crypto.randomUUID(),
              type: 'method',
              name: member.name?.getText() || 'anonymous',
              signature: this.getMethodSignature(member),
              content: member.getText(),
              lineStart: sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1,
              lineEnd: sourceFile.getLineAndCharacterOfPosition(member.getEnd()).line + 1,
              metadata: {
                isStatic: member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword),
                isPrivate: member.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword),
                isProtected: member.modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword),
                isAsync: member.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword),
                classId: entity.id
              }
            }
            entities.push(methodEntity)
            
            relationships.push({
              fromId: methodEntity.id,
              toId: entity.id,
              type: 'BELONGS_TO'
            })
          }
        })
      }

      // Interfaces
      if (ts.isInterfaceDeclaration(node)) {
        const entity: CodeEntity = {
          id: crypto.randomUUID(),
          type: 'interface',
          name: node.name.getText(),
          content: node.getText(),
          lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
          metadata: {
            isExported: node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
          }
        }
        entities.push(entity)
      }

      // Type aliases
      if (ts.isTypeAliasDeclaration(node)) {
        const entity: CodeEntity = {
          id: crypto.randomUUID(),
          type: 'type',
          name: node.name.getText(),
          content: node.getText(),
          lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
          metadata: {
            isExported: node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
          }
        }
        entities.push(entity)
      }

      // Imports
      if (ts.isImportDeclaration(node)) {
        const entity: CodeEntity = {
          id: crypto.randomUUID(),
          type: 'import',
          name: 'import',
          content: node.getText(),
          lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
          metadata: {
            source: node.moduleSpecifier.getText().replace(/['"]/g, ''),
            imports: this.getImportedItems(node)
          }
        }
        entities.push(entity)
      }

      // JSX Components (simplified detection)
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const name = node.name.getText()
        if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
          const returnType = this.checkReturnsJSX(node.initializer)
          if (returnType) {
            const entity: CodeEntity = {
              id: crypto.randomUUID(),
              type: 'jsx_component',
              name,
              content: node.getText(),
              lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
              metadata: {
                isExported: false, // Will be determined by parent
                props: this.getComponentProps(node.initializer)
              }
            }
            entities.push(entity)
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return { entities, relationships }
  }

  private getFunctionSignature(node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction): string {
    const name = (node as any).name?.getText() || 'anonymous'
    const params = node.parameters.map(p => p.getText()).join(', ')
    return `${name}(${params})`
  }

  private getMethodSignature(node: ts.MethodDeclaration): string {
    const name = node.name?.getText() || 'anonymous'
    const params = node.parameters.map(p => p.getText()).join(', ')
    return `${name}(${params})`
  }

  private getParameters(node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration): any[] {
    return node.parameters.map(p => ({
      name: p.name?.getText(),
      type: p.type?.getText(),
      optional: p.questionToken !== undefined,
      initializer: p.initializer?.getText()
    }))
  }

  private getReturnType(node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration): string | undefined {
    return node.type?.getText()
  }

  private getExtends(node: ts.ClassDeclaration): string | undefined {
    if (node.heritageClauses) {
      const extendsClause = node.heritageClauses.find(
        clause => clause.token === ts.SyntaxKind.ExtendsKeyword
      )
      return extendsClause?.types[0]?.getText()
    }
    return undefined
  }

  private getImplements(node: ts.ClassDeclaration): string[] {
    if (node.heritageClauses) {
      const implementsClause = node.heritageClauses.find(
        clause => clause.token === ts.SyntaxKind.ImplementsKeyword
      )
      return implementsClause?.types.map(t => t.getText()) || []
    }
    return []
  }

  private getImportedItems(node: ts.ImportDeclaration): any {
    const clause = node.importClause
    if (!clause) return { type: 'side-effect' }

    const items: any = {}
    
    if (clause.name) {
      items.default = clause.name.getText()
    }
    
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        items.namespace = clause.namedBindings.name.getText()
      } else if (ts.isNamedImports(clause.namedBindings)) {
        items.named = clause.namedBindings.elements.map(e => ({
          name: e.name.getText(),
          alias: e.propertyName?.getText()
        }))
      }
    }
    
    return items
  }

  private checkReturnsJSX(node: ts.ArrowFunction | ts.FunctionExpression): boolean {
    // Simplified check - in real implementation, would traverse AST
    const text = node.getText()
    return text.includes('return <') || text.includes('return (') || text.includes('=>')
  }

  private getComponentProps(node: ts.ArrowFunction | ts.FunctionExpression): any {
    const firstParam = node.parameters[0]
    if (firstParam) {
      return {
        name: firstParam.name?.getText(),
        type: firstParam.type?.getText()
      }
    }
    return null
  }

  private extractFunctionCalls(node: ts.Node, fromId: string, relationships: Relationship[], sourceFile: ts.SourceFile) {
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const callText = n.expression.getText()
        relationships.push({
          fromId,
          toId: '', // Will be resolved later
          type: 'CALLS',
          properties: {
            callExpression: callText,
            line: sourceFile.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            unresolvedTarget: callText
          }
        })
      }
      ts.forEachChild(n, visit)
    }
    ts.forEachChild(node, visit)
  }
}

// Process a single code file
async function processCodeFile(file: any, supabase: any, openai: OpenAI) {
  try {
    console.log(`[Process Code] Processing file: ${file.file_path}`)
    
    // Mark as processing
    await supabase
      .from('code_processing_queue')
      .update({ status: 'processing' })
      .eq('id', file.id)

    // Parse the code based on language
    let entities: CodeEntity[] = []
    let relationships: Relationship[] = []
    
    if (file.language === 'typescript' || file.language === 'javascript' || 
        file.language === 'tsx' || file.language === 'jsx') {
      const parser = new TypeScriptParser()
      const result = parser.parse(file.content, file.file_path)
      entities = result.entities
      relationships = result.relationships
    } else {
      console.log(`[Process Code] Unsupported language: ${file.language}`)
      // For now, create a single file entity for unsupported languages
      entities = [{
        id: crypto.randomUUID(),
        type: 'function',
        name: file.file_path.split('/').pop() || 'unknown',
        content: file.content,
        lineStart: 1,
        lineEnd: file.content.split('\n').length,
        metadata: {
          isFile: true,
          language: file.language
        }
      }]
    }

    // Generate embeddings for entities
    const EMBEDDING_BATCH_SIZE = 50
    for (let i = 0; i < entities.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = entities.slice(i, i + EMBEDDING_BATCH_SIZE)
      
      // Prepare embedding inputs
      const inputs = batch.map(entity => {
        const contextualContent = `${entity.type}: ${entity.name}
${entity.signature || ''}
${entity.content.substring(0, 4000)}`
        return contextualContent
      })

      try {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-large',
          input: inputs,
          dimensions: 3072
        })

        // Assign embeddings
        batch.forEach((entity, idx) => {
          entity.embedding = embeddingResponse.data[idx].embedding
        })
      } catch (error) {
        console.error(`[Process Code] Embedding error:`, error)
      }
    }

    // Store in Neo4j
    const driver = getDriver()
    const session = driver.session()
    
    try {
      // Create file node
      const fileId = crypto.randomUUID()
      await session.run(`
        MERGE (f:CodeFile {path: $path, project_name: $project_name})
        SET f.id = $id,
            f.content = $content,
            f.language = $language,
            f.size = $size,
            f.line_count = $line_count,
            f.workspace_id = $workspace_id,
            f.git_metadata = $git_metadata,
            f.last_modified = datetime($last_modified),
            f.updated_at = datetime()
        WITH f
        MERGE (p:Project {name: $project_name})
        ON CREATE SET p.id = randomUUID(),
                      p.created_at = datetime()
        MERGE (f)-[:BELONGS_TO_PROJECT]->(p)
      `, {
        id: fileId,
        path: file.file_path,
        content: file.content,
        language: file.language,
        size: file.size || file.content.length,
        line_count: file.line_count || file.content.split('\n').length,
        workspace_id: file.workspace_id,
        project_name: file.project_name,
        git_metadata: JSON.stringify(file.git_metadata || {}),
        last_modified: new Date().toISOString()
      })

      // Create entity nodes
      for (const entity of entities) {
        const nodeLabel = entity.type === 'jsx_component' ? 'Component' : 
                         entity.type === 'interface' ? 'Interface' :
                         entity.type === 'type' ? 'TypeDefinition' :
                         entity.type === 'import' ? 'Import' :
                         entity.type === 'method' ? 'Method' :
                         entity.type === 'class' ? 'Class' : 'Function'
        
        await session.run(`
          CREATE (n:${nodeLabel}:CodeEntity {
            id: $id,
            name: $name,
            type: $type,
            content: $content,
            signature: $signature,
            line_start: $line_start,
            line_end: $line_end,
            column_start: $column_start,
            column_end: $column_end,
            embedding: $embedding,
            metadata: $metadata,
            file_id: $file_id,
            project_name: $project_name,
            created_at: datetime()
          })
          WITH n
          MATCH (f:CodeFile {id: $file_id})
          CREATE (n)-[:DEFINED_IN]->(f)
        `, {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          content: entity.content,
          signature: entity.signature || null,
          line_start: entity.lineStart,
          line_end: entity.lineEnd,
          column_start: entity.columnStart || null,
          column_end: entity.columnEnd || null,
          embedding: entity.embedding || null,
          metadata: JSON.stringify(entity.metadata),
          file_id: fileId,
          project_name: file.project_name
        })
      }

      // Create relationships
      for (const rel of relationships) {
        if (rel.fromId && rel.toId) {
          await session.run(`
            MATCH (from:CodeEntity {id: $fromId})
            MATCH (to:CodeEntity {id: $toId})
            CREATE (from)-[r:${rel.type} $properties]->(to)
          `, {
            fromId: rel.fromId,
            toId: rel.toId,
            properties: rel.properties || {}
          })
        }
      }

      // Update Neo4j file ID in code_files table
      await supabase
        .from('code_files')
        .update({ 
          neo4j_file_id: fileId,
          last_processed_at: new Date().toISOString() 
        })
        .eq('workspace_id', file.workspace_id)
        .eq('project_name', file.project_name)
        .eq('path', file.file_path)

      // Mark as completed
      await supabase
        .from('code_processing_queue')
        .update({ 
          status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('id', file.id)

      console.log(`[Process Code] Successfully processed ${file.file_path} with ${entities.length} entities`)
      
    } finally {
      await session.close()
    }
    
  } catch (error) {
    console.error(`[Process Code] Error processing file ${file.file_path}:`, error)
    
    // Mark as failed
    await supabase
      .from('code_processing_queue')
      .update({ 
        status: 'failed',
        error: error.message,
        retry_count: file.retry_count + 1
      })
      .eq('id', file.id)
  }
}

// Background processing function
async function processCodeBackground(taskId: string) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const openai = new OpenAI({
    apiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
  })
  
  console.log(`[Process Code] Starting background task ${taskId}`)
  
  try {
    // Update task status
    await supabase
      .from('code_processing_tasks')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', taskId)

    while (true) {
      // Get pending files
      const { data: files, error } = await supabase
        .from('code_processing_queue')
        .select('*')
        .eq('task_id', taskId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE)
      
      if (error) {
        throw new Error(`Failed to get code files: ${error.message}`)
      }
      
      if (!files || files.length === 0) {
        console.log('[Process Code] No more pending files to process')
        break
      }
      
      console.log(`[Process Code] Processing batch of ${files.length} files`)
      
      // Process files in parallel batches
      for (let i = 0; i < files.length; i += PARALLEL_WORKERS) {
        const batch = files.slice(i, i + PARALLEL_WORKERS)
        await Promise.all(
          batch.map(file => processCodeFile(file, supabase, openai))
        )
      }
    }
    
    console.log(`[Process Code] Task ${taskId} completed`)
    
  } catch (error) {
    console.error(`[Process Code] Background task ${taskId} error:`, error)
    
    // Update task status to failed
    await supabase
      .from('code_processing_tasks')
      .update({ 
        status: 'failed',
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId)
      
    throw error
  } finally {
    // Close Neo4j driver connection
    if (driver) {
      await driver.close()
      driver = null
    }
  }
}

serve(async (req, connInfo) => {
  try {
    // Verify Neo4j connectivity first
    const driver = getDriver()
    await driver.verifyConnectivity()
    console.log('[Process Code] Neo4j connection verified')
    
    // Parse request
    const { taskId } = await req.json()
    
    if (!taskId) {
      return new Response(
        JSON.stringify({ error: 'taskId is required' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      )
    }
    
    // Use EdgeRuntime.waitUntil for proper background task handling
    const runtime = connInfo as any
    if (runtime?.waitUntil) {
      runtime.waitUntil(
        processCodeBackground(taskId).catch(error => {
          console.error(`[Process Code] Background task ${taskId} failed:`, error)
        })
      )
    } else {
      // Fallback for local development
      processCodeBackground(taskId).catch(error => {
        console.error(`[Process Code] Background task ${taskId} failed:`, error)
      })
    }
    
    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        taskId: taskId,
        message: 'Processing started in background',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('[Process Code] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})