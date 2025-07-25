import * as ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs/promises'
import { glob } from 'glob'
import OpenAI from 'openai'
import { executeQuery, writeTransaction } from './client'
import { CodeEntityNode } from './types'

export interface CodeEntity {
  id: string
  name: string
  type: 'function' | 'class' | 'method' | 'interface' | 'enum' | 'variable' | 'module'
  file_path: string
  project_name: string
  line_start: number
  line_end: number
  content: string
  signature?: string
  visibility?: 'public' | 'private' | 'protected'
  is_exported: boolean
  parent_id?: string
  metadata: Record<string, any>
}

export interface CodeRelationship {
  from_id: string
  to_id: string
  type: 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'USES' | 'HAS_METHOD' | 'HAS_PROPERTY' | 'RETURNS' | 'ACCEPTS'
  metadata?: Record<string, any>
}

export class CodeAnalysisService {
  private openai: OpenAI | null = null
  private typeChecker: ts.TypeChecker | null = null

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required')
      }
      this.openai = new OpenAI({ apiKey })
    }
    return this.openai
  }

  /**
   * Analyze a TypeScript/JavaScript project
   */
  async analyzeProject(projectPath: string, projectName: string): Promise<void> {
    console.log(`[CodeAnalysis] Analyzing project: ${projectName} at ${projectPath}`)
    
    // Find all TypeScript and JavaScript files
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: projectPath,
      ignore: ['node_modules/**', '**/dist/**', '**/build/**', '**/.next/**']
    })
    
    console.log(`[CodeAnalysis] Found ${files.length} code files`)
    
    // Create TypeScript program for type analysis
    const program = this.createProgram(files.map(f => path.join(projectPath, f)))
    this.typeChecker = program.getTypeChecker()
    
    // Analyze each file
    for (const file of files) {
      const filePath = path.join(projectPath, file)
      await this.analyzeFile(filePath, projectName)
    }
    
    console.log(`[CodeAnalysis] Project analysis complete`)
  }

  /**
   * Create TypeScript program for analysis
   */
  private createProgram(files: string[]): ts.Program {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.CommonJS,
      lib: ['es2022'],
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.React,
      noEmit: true,
      esModuleInterop: true,
      skipLibCheck: true
    }
    
    return ts.createProgram(files, compilerOptions)
  }

  /**
   * Analyze a single code file
   */
  private async analyzeFile(filePath: string, projectName: string): Promise<void> {
    console.log(`[CodeAnalysis] Analyzing file: ${path.basename(filePath)}`)
    
    const content = await fs.readFile(filePath, 'utf-8')
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    )
    
    const entities: CodeEntity[] = []
    const relationships: CodeRelationship[] = []
    
    // Extract entities and relationships
    this.visitNode(sourceFile, sourceFile, entities, relationships, projectName, filePath)
    
    // Store entities in Neo4j
    for (const entity of entities) {
      await this.createCodeEntity(entity)
    }
    
    // Store relationships
    for (const rel of relationships) {
      await this.createCodeRelationship(rel)
    }
    
    // Create module node for the file itself
    await this.createModuleNode(filePath, projectName, content)
  }

  /**
   * Recursively visit TypeScript AST nodes
   */
  private visitNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    entities: CodeEntity[],
    relationships: CodeRelationship[],
    projectName: string,
    filePath: string,
    parentId?: string
  ): void {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      const entity = this.extractFunction(node, sourceFile, projectName, filePath, parentId)
      if (entity) {
        entities.push(entity)
        // Extract function calls
        this.extractFunctionCalls(node, entity.id, relationships)
      }
    } else if (ts.isClassDeclaration(node)) {
      const entity = this.extractClass(node, sourceFile, projectName, filePath)
      if (entity) {
        entities.push(entity)
        // Extract inheritance
        this.extractInheritance(node, entity.id, relationships)
        // Visit class members
        ts.forEachChild(node, child => {
          this.visitNode(child, sourceFile, entities, relationships, projectName, filePath, entity.id)
        })
        return
      }
    } else if (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) {
      const entity = this.extractClassMember(node, sourceFile, projectName, filePath, parentId)
      if (entity) {
        entities.push(entity)
        if (parentId) {
          relationships.push({
            from_id: parentId,
            to_id: entity.id,
            type: ts.isMethodDeclaration(node) ? 'HAS_METHOD' : 'HAS_PROPERTY'
          })
        }
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      const entity = this.extractInterface(node, sourceFile, projectName, filePath)
      if (entity) {
        entities.push(entity)
      }
    } else if (ts.isImportDeclaration(node)) {
      this.extractImports(node, filePath, relationships)
    }
    
    // Continue traversing
    ts.forEachChild(node, child => {
      this.visitNode(child, sourceFile, entities, relationships, projectName, filePath, parentId)
    })
  }

  /**
   * Extract function entity
   */
  private extractFunction(
    node: ts.FunctionDeclaration | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
    projectName: string,
    filePath: string,
    parentId?: string
  ): CodeEntity | null {
    const name = node.name?.getText(sourceFile) || 'anonymous'
    const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
    
    return {
      id: `${filePath}:${name}:${lineStart}`,
      name,
      type: 'function',
      file_path: filePath,
      project_name: projectName,
      line_start: lineStart + 1,
      line_end: lineEnd + 1,
      content: node.getText(sourceFile),
      signature: this.getFunctionSignature(node, sourceFile),
      is_exported: this.isExported(node),
      parent_id: parentId,
      metadata: {
        parameters: node.parameters.length,
        isAsync: node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) || false
      }
    }
  }

  /**
   * Extract class entity
   */
  private extractClass(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    projectName: string,
    filePath: string
  ): CodeEntity | null {
    const name = node.name?.getText(sourceFile) || 'anonymous'
    const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
    
    return {
      id: `${filePath}:${name}:${lineStart}`,
      name,
      type: 'class',
      file_path: filePath,
      project_name: projectName,
      line_start: lineStart + 1,
      line_end: lineEnd + 1,
      content: node.getText(sourceFile),
      is_exported: this.isExported(node),
      metadata: {
        isAbstract: node.modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword) || false
      }
    }
  }

  /**
   * Extract class member (method or property)
   */
  private extractClassMember(
    node: ts.MethodDeclaration | ts.PropertyDeclaration,
    sourceFile: ts.SourceFile,
    projectName: string,
    filePath: string,
    parentId?: string
  ): CodeEntity | null {
    const name = node.name?.getText(sourceFile) || 'anonymous'
    const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
    
    const visibility = node.modifiers?.find(m => 
      m.kind === ts.SyntaxKind.PublicKeyword ||
      m.kind === ts.SyntaxKind.PrivateKeyword ||
      m.kind === ts.SyntaxKind.ProtectedKeyword
    )
    
    return {
      id: `${filePath}:${name}:${lineStart}`,
      name,
      type: ts.isMethodDeclaration(node) ? 'method' : 'variable',
      file_path: filePath,
      project_name: projectName,
      line_start: lineStart + 1,
      line_end: lineEnd + 1,
      content: node.getText(sourceFile),
      visibility: visibility ? visibility.getText(sourceFile) as any : 'public',
      is_exported: false,
      parent_id: parentId,
      metadata: ts.isMethodDeclaration(node) ? {
        parameters: node.parameters.length,
        isAsync: node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) || false,
        isStatic: node.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) || false
      } : {}
    }
  }

  /**
   * Extract interface entity
   */
  private extractInterface(
    node: ts.InterfaceDeclaration,
    sourceFile: ts.SourceFile,
    projectName: string,
    filePath: string
  ): CodeEntity | null {
    const name = node.name.getText(sourceFile)
    const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
    
    return {
      id: `${filePath}:${name}:${lineStart}`,
      name,
      type: 'interface',
      file_path: filePath,
      project_name: projectName,
      line_start: lineStart + 1,
      line_end: lineEnd + 1,
      content: node.getText(sourceFile),
      is_exported: this.isExported(node),
      metadata: {
        memberCount: node.members.length
      }
    }
  }

  /**
   * Extract function calls from a function body
   */
  private extractFunctionCalls(
    node: ts.Node,
    fromId: string,
    relationships: CodeRelationship[]
  ): void {
    const visit = (child: ts.Node) => {
      if (ts.isCallExpression(child)) {
        const calledName = child.expression.getText()
        // Simple heuristic - in real implementation, resolve through type checker
        relationships.push({
          from_id: fromId,
          to_id: calledName, // This would need proper resolution
          type: 'CALLS',
          metadata: { resolved: false }
        })
      }
      ts.forEachChild(child, visit)
    }
    
    ts.forEachChild(node, visit)
  }

  /**
   * Extract class inheritance
   */
  private extractInheritance(
    node: ts.ClassDeclaration,
    fromId: string,
    relationships: CodeRelationship[]
  ): void {
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        for (const type of clause.types) {
          const baseType = type.expression.getText()
          relationships.push({
            from_id: fromId,
            to_id: baseType, // This would need proper resolution
            type: clause.token === ts.SyntaxKind.ExtendsKeyword ? 'EXTENDS' : 'IMPLEMENTS',
            metadata: { resolved: false }
          })
        }
      }
    }
  }

  /**
   * Extract import relationships
   */
  private extractImports(
    node: ts.ImportDeclaration,
    fromFile: string,
    relationships: CodeRelationship[]
  ): void {
    const moduleSpecifier = node.moduleSpecifier.getText().slice(1, -1) // Remove quotes
    relationships.push({
      from_id: fromFile,
      to_id: moduleSpecifier,
      type: 'IMPORTS'
    })
  }

  /**
   * Check if node is exported
   */
  private isExported(node: ts.Node): boolean {
    if ('modifiers' in node) {
      const modifiableNode = node as any
      return modifiableNode.modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword) || false
    }
    return false
  }

  /**
   * Get function signature
   */
  private getFunctionSignature(
    node: ts.FunctionDeclaration | ts.FunctionExpression,
    sourceFile: ts.SourceFile
  ): string {
    const params = node.parameters.map(p => p.getText(sourceFile)).join(', ')
    const name = node.name?.getText(sourceFile) || 'anonymous'
    return `${name}(${params})`
  }

  /**
   * Create code entity in Neo4j
   */
  private async createCodeEntity(entity: CodeEntity): Promise<void> {
    const embedding = await this.generateCodeEmbedding(entity)
    
    // Build SET properties dynamically to handle optional fields
    const setProperties = [
      'c.name = $name',
      'c.type = $type',
      'c.file_path = $file_path',
      'c.project_name = $project_name',
      'c.line_start = $line_start',
      'c.line_end = $line_end',
      'c.content = $content',
      'c.is_exported = $is_exported',
      'c.metadata = $metadata',
      'c.embedding = $embedding',
      'c.created_at = datetime()',
      'c.updated_at = datetime()'
    ]
    
    const params: any = {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      file_path: entity.file_path,
      project_name: entity.project_name,
      line_start: entity.line_start,
      line_end: entity.line_end,
      content: entity.content,
      is_exported: entity.is_exported,
      metadata: JSON.stringify(entity.metadata),
      embedding
    }
    
    // Add optional properties
    if (entity.signature !== undefined) {
      setProperties.push('c.signature = $signature')
      params.signature = entity.signature
    }
    if (entity.visibility !== undefined) {
      setProperties.push('c.visibility = $visibility')
      params.visibility = entity.visibility
    }
    if (entity.parent_id !== undefined) {
      setProperties.push('c.parent_id = $parent_id')
      params.parent_id = entity.parent_id
    }
    
    const query = `
      MERGE (c:CodeEntity {id: $id})
      SET ${setProperties.join(',\n          ')}
      RETURN c
    `
    
    await executeQuery(query, params)
  }

  /**
   * Create code relationship in Neo4j
   */
  private async createCodeRelationship(rel: CodeRelationship): Promise<void> {
    // For now, skip unresolved relationships
    if (rel.metadata?.resolved === false) {
      return
    }
    
    const query = `
      MATCH (from:CodeEntity {id: $from_id})
      MATCH (to:CodeEntity {id: $to_id})
      MERGE (from)-[r:${rel.type}]->(to)
      SET r.created_at = datetime()
      RETURN r
    `
    
    try {
      await executeQuery(query, {
        from_id: rel.from_id,
        to_id: rel.to_id
      })
    } catch (error) {
      // Relationship target might not exist yet
      console.log(`[CodeAnalysis] Skipping unresolved relationship: ${rel.from_id} -> ${rel.to_id}`)
    }
  }

  /**
   * Create module node for file
   */
  private async createModuleNode(
    filePath: string,
    projectName: string,
    content: string
  ): Promise<void> {
    const summary = await this.generateFileSummary(filePath, content)
    const embedding = await this.generateEmbedding(summary)
    
    const query = `
      MERGE (m:Module {file_path: $file_path})
      SET m.project_name = $project_name,
          m.name = $name,
          m.summary = $summary,
          m.embedding = $embedding,
          m.line_count = $line_count,
          m.created_at = datetime(),
          m.updated_at = datetime()
      RETURN m
    `
    
    await executeQuery(query, {
      file_path: filePath,
      project_name: projectName,
      name: path.basename(filePath),
      summary,
      embedding,
      line_count: content.split('\n').length
    })
  }

  /**
   * Generate embedding for code entity
   */
  private async generateCodeEmbedding(entity: CodeEntity): Promise<number[]> {
    const text = `${entity.type} ${entity.name}: ${entity.signature || ''}\n${entity.content.substring(0, 500)}`
    return this.generateEmbedding(text)
  }

  /**
   * Generate embedding using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const openai = this.getOpenAI()
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 3072
      })
      return response.data[0].embedding
    } catch (error) {
      console.error('[CodeAnalysis] Embedding generation failed:', error)
      // Return zero vector as fallback
      return new Array(3072).fill(0)
    }
  }

  /**
   * Generate file summary using OpenAI
   */
  private async generateFileSummary(filePath: string, content: string): Promise<string> {
    try {
      const openai = this.getOpenAI()
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Summarize this code file in 2-3 sentences. Focus on its purpose and main functionality.'
          },
          {
            role: 'user',
            content: `File: ${path.basename(filePath)}\n\n${content.substring(0, 2000)}`
          }
        ],
        max_tokens: 100
      })
      return response.choices[0].message.content || 'Code file'
    } catch (error) {
      console.error('[CodeAnalysis] Summary generation failed:', error)
      return `Code file: ${path.basename(filePath)}`
    }
  }
}

export const codeAnalysisService = new CodeAnalysisService()