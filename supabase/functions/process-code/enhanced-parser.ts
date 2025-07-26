import ts from 'https://esm.sh/typescript@5.3.3'
import { RelationshipExtractor, ExtractedRelationship } from './relationship-extractor.ts'

export interface CodeEntity {
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

export interface Relationship {
  fromId: string
  toId: string
  type: string
  properties?: Record<string, any>
}

export class EnhancedTypeScriptParser {
  private entities: CodeEntity[] = []
  private extractedRelationships: ExtractedRelationship[] = []
  private entityMap: Map<string, CodeEntity> = new Map()
  private importMap: Map<string, { source: string; entityId?: string }> = new Map()
  
  parse(content: string, filePath: string): { entities: CodeEntity[], relationships: Relationship[] } {
    this.entities = []
    this.extractedRelationships = []
    this.entityMap.clear()
    this.importMap.clear()
    
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    )
    
    // First pass: Extract all entities
    this.extractEntities(sourceFile)
    
    // Build entity map for quick lookup
    this.entities.forEach(entity => {
      this.entityMap.set(entity.name, entity)
    })
    
    // Second pass: Extract relationships
    this.extractRelationships(sourceFile)
    
    // Resolve relationships
    const relationships = this.resolveRelationships()
    
    return { entities: this.entities, relationships }
  }
  
  private extractEntities(sourceFile: ts.SourceFile) {
    const visit = (node: ts.Node) => {
      // Functions
      if (ts.isFunctionDeclaration(node)) {
        const entity = this.createFunctionEntity(node, sourceFile)
        if (entity) this.entities.push(entity)
      }
      
      // Arrow functions and function expressions in variable declarations
      else if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
          const entity = this.createFunctionEntity(node, sourceFile, node.name.getText())
          if (entity) this.entities.push(entity)
        }
      }
      
      // Classes
      else if (ts.isClassDeclaration(node)) {
        const classEntity = this.createClassEntity(node, sourceFile)
        if (classEntity) {
          this.entities.push(classEntity)
          
          // Extract class members
          node.members.forEach(member => {
            if (ts.isMethodDeclaration(member)) {
              const methodEntity = this.createMethodEntity(member, sourceFile, classEntity.id)
              if (methodEntity) this.entities.push(methodEntity)
            } else if (ts.isPropertyDeclaration(member)) {
              const propEntity = this.createPropertyEntity(member, sourceFile, classEntity.id)
              if (propEntity) this.entities.push(propEntity)
            }
          })
        }
      }
      
      // Interfaces
      else if (ts.isInterfaceDeclaration(node)) {
        const entity = this.createInterfaceEntity(node, sourceFile)
        if (entity) this.entities.push(entity)
      }
      
      // Type aliases
      else if (ts.isTypeAliasDeclaration(node)) {
        const entity = this.createTypeEntity(node, sourceFile)
        if (entity) this.entities.push(entity)
      }
      
      // Imports
      else if (ts.isImportDeclaration(node)) {
        const entity = this.createImportEntity(node, sourceFile)
        if (entity) {
          this.entities.push(entity)
          
          // Track imports for relationship resolution
          const extractor = new RelationshipExtractor(sourceFile)
          const imports = extractor.extractImports(node)
          imports.forEach((value, key) => {
            this.importMap.set(key, { source: value.source, entityId: entity.id })
          })
        }
      }
      
      // Continue traversing
      ts.forEachChild(node, visit)
    }
    
    visit(sourceFile)
  }
  
  private extractRelationships(sourceFile: ts.SourceFile) {
    try {
      const extractor = new RelationshipExtractor(sourceFile)
      
      const visit = (node: ts.Node, currentScope: { type: string; id: string } | null) => {
        try {
          // Update scope for functions and methods
          let newScope = currentScope
          
          if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
            const name = (node as any).name?.getText()
            const entity = this.entityMap.get(name)
            if (entity) {
              newScope = { type: entity.type, id: entity.id }
            }
          } else if (ts.isVariableDeclaration(node) && node.initializer &&
                     (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
            const name = node.name.getText()
            const entity = this.entityMap.get(name)
            if (entity) {
              newScope = { type: entity.type, id: entity.id }
            }
          } else if (ts.isClassDeclaration(node)) {
            const name = node.name?.getText()
            const entity = name ? this.entityMap.get(name) : null
            if (entity) {
              newScope = { type: entity.type, id: entity.id }
              
              // Extract inheritance relationships
              if (node.heritageClauses) {
                node.heritageClauses.forEach(clause => {
                  clause.types.forEach(type => {
                    const typeName = type.expression.getText()
                    this.extractedRelationships.push({
                      fromId: entity.id,
                      toName: typeName,
                      type: clause.token === ts.SyntaxKind.ExtendsKeyword ? 'EXTENDS' : 'IMPLEMENTS',
                      properties: {
                        line: sourceFile.getLineAndCharacterOfPosition(type.getStart()).line + 1
                      }
                    })
                  })
                })
              }
            }
          }
          
          // Extract relationships within current scope
          if (newScope) {
            const scopeRelationships = extractor.extract(newScope)
            extractor.visitNode(node)
            this.extractedRelationships.push(...scopeRelationships)
          }
          
          // Continue traversing with updated scope
          ts.forEachChild(node, child => visit(child, newScope))
        } catch (visitError: any) {
          console.error(`[Parser] Error visiting node: ${visitError.message}`)
          // Continue processing other nodes
        }
      }
      
      visit(sourceFile, null)
    } catch (error: any) {
      console.error(`[Parser] Error in extractRelationships: ${error.message}`)
      // Continue with empty relationships
    }
  }
  
  private resolveRelationships(): Relationship[] {
    const resolved: Relationship[] = []
    
    for (const rel of this.extractedRelationships) {
      // Try to resolve the target entity
      let targetEntity = this.entityMap.get(rel.toName)
      
      // If not found directly, check if it's an imported entity
      if (!targetEntity && this.importMap.has(rel.toName)) {
        const importInfo = this.importMap.get(rel.toName)
        if (importInfo?.entityId) {
          // Create a relationship to the import
          resolved.push({
            fromId: rel.fromId,
            toId: importInfo.entityId,
            type: 'USES_IMPORT',
            properties: rel.properties
          })
        }
      }
      
      if (targetEntity) {
        resolved.push({
          fromId: rel.fromId,
          toId: targetEntity.id,
          type: rel.type,
          properties: rel.properties
        })
      } else {
        // Store unresolved relationships for later resolution across files
        resolved.push({
          fromId: rel.fromId,
          toId: '', // Will be resolved later
          type: rel.type,
          properties: {
            ...rel.properties,
            unresolvedTarget: rel.toName
          }
        })
      }
    }
    
    return resolved
  }
  
  // Entity creation methods
  private createFunctionEntity(node: ts.FunctionDeclaration | ts.VariableDeclaration, sourceFile: ts.SourceFile, name?: string): CodeEntity | null {
    const funcNode = ts.isFunctionDeclaration(node) ? node : node.initializer as ts.ArrowFunction | ts.FunctionExpression
    const funcName = name || (node as ts.FunctionDeclaration).name?.getText() || 'anonymous'
    
    return {
      id: crypto.randomUUID(),
      type: 'function',
      name: funcName,
      signature: this.getFunctionSignature(funcNode, funcName),
      content: node.getText(),
      lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
      columnStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).character,
      columnEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).character,
      metadata: {
        isAsync: false, // Simplified for now
        isExported: false, // Simplified for now
        parameters: this.getParameters(funcNode),
        returnType: this.getReturnType(funcNode),
        isArrow: ts.isArrowFunction(funcNode),
        isGenerator: false // Simplified for now
      }
    }
  }
  
  private createClassEntity(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): CodeEntity | null {
    const name = node.name?.getText()
    if (!name) return null
    
    return {
      id: crypto.randomUUID(),
      type: 'class',
      name,
      content: node.getText(),
      lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
      metadata: {
        isExported: false,
        isAbstract: false,
        memberCount: node.members.length
      }
    }
  }
  
  private createMethodEntity(node: ts.MethodDeclaration, sourceFile: ts.SourceFile, classId: string): CodeEntity | null {
    const name = node.name?.getText()
    if (!name) return null
    
    return {
      id: crypto.randomUUID(),
      type: 'method',
      name,
      signature: this.getMethodSignature(node),
      content: node.getText(),
      lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
      metadata: {
        classId,
        isStatic: false,
        isPrivate: false,
        isProtected: false,
        isAsync: false,
        parameters: this.getParameters(node),
        returnType: this.getReturnType(node)
      }
    }
  }
  
  private createPropertyEntity(node: ts.PropertyDeclaration, sourceFile: ts.SourceFile, classId: string): CodeEntity | null {
    const name = node.name?.getText()
    if (!name) return null
    
    return {
      id: crypto.randomUUID(),
      type: 'variable',
      name,
      content: node.getText(),
      lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
      metadata: {
        classId,
        isStatic: false,
        isPrivate: false,
        isProtected: false,
        isReadonly: false,
        type: node.type?.getText(),
        initializer: node.initializer?.getText()
      }
    }
  }
  
  private createInterfaceEntity(node: ts.InterfaceDeclaration, sourceFile: ts.SourceFile): CodeEntity {
    return {
      id: crypto.randomUUID(),
      type: 'interface',
      name: node.name.getText(),
      content: node.getText(),
      lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
      metadata: {
        isExported: false,
        memberCount: node.members.length
      }
    }
  }
  
  private createTypeEntity(node: ts.TypeAliasDeclaration, sourceFile: ts.SourceFile): CodeEntity {
    return {
      id: crypto.randomUUID(),
      type: 'type',
      name: node.name.getText(),
      content: node.getText(),
      lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
      metadata: {
        isExported: false,
        typeDefinition: node.type.getText()
      }
    }
  }
  
  private createImportEntity(node: ts.ImportDeclaration, sourceFile: ts.SourceFile): CodeEntity {
    return {
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
  }
  
  // Helper methods
  private getFunctionSignature(node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration, name: string): string {
    const params = node.parameters.map(p => p.getText()).join(', ')
    const returnType = this.getReturnType(node)
    return `${name}(${params})${returnType ? `: ${returnType}` : ''}`
  }
  
  private getMethodSignature(node: ts.MethodDeclaration): string {
    const name = node.name?.getText() || 'anonymous'
    return this.getFunctionSignature(node, name)
  }
  
  private getParameters(node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration): any[] {
    try {
      if (!node.parameters) return []
      return node.parameters.map(p => ({
        name: p.name?.getText(),
        type: p.type?.getText(),
        optional: !!p.questionToken,
        initializer: p.initializer?.getText()
      }))
    } catch (e) {
      return []
    }
  }
  
  private getReturnType(node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration): string | undefined {
    return node.type?.getText()
  }
  
  private hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    if (!node || !node.modifiers) return false
    try {
      return Array.from(node.modifiers).some((m: any) => m && m.kind === kind)
    } catch (e) {
      return false
    }
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
}