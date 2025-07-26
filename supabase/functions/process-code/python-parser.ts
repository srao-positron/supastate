export interface ExtractedEntity {
  id: string
  name: string
  type: 'function' | 'class' | 'method' | 'interface' | 'type' | 'property' | 'variable' | 'import' | 'component'
  filePath: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  content?: string
  metadata?: Record<string, any>
}

export interface ExtractedRelationship {
  fromId: string
  toName: string // Target name that needs to be resolved
  type: 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'INSTANTIATES' | 'USES_TYPE' | 'REFERENCES' | 'HAS_METHOD' | 'HAS_PROPERTY'
  properties?: Record<string, any>
}

export interface CodeParser {
  parse(content: string, filePath: string): Promise<void>
  getEntities(): ExtractedEntity[]
  getRelationships(): ExtractedRelationship[]
  extractRelationships(): Promise<void>
}

interface PythonNode {
  type: string
  text?: string
  children?: PythonNode[]
  startPosition?: { row: number; column: number }
  endPosition?: { row: number; column: number }
  childForFieldName?: (name: string) => PythonNode | null
  namedChildren?: PythonNode[]
  descendantsOfType?: (type: string) => PythonNode[]
}

export class PythonParser implements CodeParser {
  private entities: ExtractedEntity[] = []
  private relationships: ExtractedRelationship[] = []
  private fileContent: string = ''
  private currentClass: string | null = null

  async parse(content: string, filePath: string): Promise<void> {
    this.entities = []
    this.relationships = []
    this.fileContent = content
    
    // For Python, we'll use a regex-based parser for now since tree-sitter
    // requires WASM bindings that are complex in Deno. This covers most common patterns.
    
    // Extract imports
    this.extractImports(content, filePath)
    
    // Extract classes
    this.extractClasses(content, filePath)
    
    // Extract functions
    this.extractFunctions(content, filePath)
    
    // Extract global variables
    this.extractGlobalVariables(content, filePath)
  }

  private extractImports(content: string, filePath: string): void {
    // Standard imports: import module, from module import name
    const importRegex = /^(?:from\s+([\w.]+)\s+)?import\s+(.+)$/gm
    let match

    while ((match = importRegex.exec(content)) !== null) {
      const fromModule = match[1]
      const imports = match[2]
      const line = content.substring(0, match.index).split('\n').length

      if (fromModule) {
        // from module import name1, name2
        const names = imports.split(',').map(n => n.trim().split(' as ')[0])
        names.forEach(name => {
          this.entities.push({
            id: `${filePath}:import:${fromModule}.${name}`,
            name,
            type: 'import',
            filePath,
            line,
            column: match.index! - content.lastIndexOf('\n', match.index! - 1),
            metadata: {
              module: fromModule,
              importType: 'from'
            }
          })
          
          this.relationships.push({
            fromId: filePath,
            toName: fromModule,
            type: 'IMPORTS',
            properties: { importedName: name }
          })
        })
      } else {
        // import module1, module2
        const modules = imports.split(',').map(m => m.trim().split(' as ')[0])
        modules.forEach(module => {
          this.entities.push({
            id: `${filePath}:import:${module}`,
            name: module,
            type: 'import',
            filePath,
            line,
            column: match.index! - content.lastIndexOf('\n', match.index! - 1),
            metadata: {
              module,
              importType: 'direct'
            }
          })
          
          this.relationships.push({
            fromId: filePath,
            toName: module,
            type: 'IMPORTS'
          })
        })
      }
    }
  }

  private extractClasses(content: string, filePath: string): void {
    // Match class definitions with optional inheritance
    const classRegex = /^class\s+(\w+)(?:\((.*?)\))?\s*:/gm
    let match

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1]
      const inheritance = match[2]
      const line = content.substring(0, match.index).split('\n').length
      const classId = `${filePath}:class:${className}`

      // Extract class content
      const classContent = this.extractEntityContent(content, match.index!)

      this.entities.push({
        id: classId,
        name: className,
        type: 'class',
        filePath,
        line,
        column: match.index! - content.lastIndexOf('\n', match.index! - 1),
        content: classContent.content,
        endLine: classContent.endLine,
        metadata: {
          inheritance: inheritance || '',
          isAbstract: this.checkIfAbstract(content, match.index!)
        }
      })

      // Extract base classes
      if (inheritance) {
        const baseClasses = inheritance.split(',').map(b => b.trim())
        baseClasses.forEach(baseClass => {
          if (baseClass && !baseClass.includes('=')) { // Skip keyword arguments
            this.relationships.push({
              fromId: classId,
              toName: baseClass,
              type: 'EXTENDS'
            })
          }
        })
      }

      // Extract class methods and properties
      this.currentClass = className
      this.extractClassMembers(content, match.index! + match[0].length, filePath, classId)
      this.currentClass = null
    }
  }

  private extractClassMembers(content: string, startIndex: number, filePath: string, classId: string): void {
    // Find the indentation level of the class
    const lines = content.substring(startIndex).split('\n')
    let classIndent = -1
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineContent = line.trim()
      
      if (lineContent === '') continue
      
      // Determine class body indentation
      if (classIndent === -1) {
        classIndent = line.length - lineContent.length
        if (classIndent === 0) break // No class body
      }
      
      // Check if we're still in the class
      const currentIndent = line.length - lineContent.length
      if (currentIndent <= classIndent && lineContent !== '') {
        break // Out of class scope
      }
      
      // Extract methods
      const methodMatch = lineContent.match(/^(?:async\s+)?def\s+(\w+)\s*\((.*?)\)/)
      if (methodMatch) {
        const methodName = methodMatch[1]
        const params = methodMatch[2]
        const lineNum = content.substring(0, startIndex).split('\n').length + i + 1
        
        const methodId = `${filePath}:method:${this.currentClass}.${methodName}`
        this.entities.push({
          id: methodId,
          name: methodName,
          type: 'method',
          filePath,
          line: lineNum,
          column: currentIndent,
          content: `def ${methodName}(${params})`,
          metadata: {
            className: this.currentClass,
            parameters: this.parseParameters(params),
            isAsync: lineContent.includes('async def'),
            isStatic: methodName === '__new__' || this.hasDecorator(lines, i, 'staticmethod'),
            isClassMethod: this.hasDecorator(lines, i, 'classmethod'),
            isPrivate: methodName.startsWith('_'),
            isSpecial: methodName.startsWith('__') && methodName.endsWith('__')
          }
        })
        
        this.relationships.push({
          fromId: classId,
          toName: methodName,
          type: 'HAS_METHOD',
          properties: { methodId }
        })
      }
      
      // Extract properties (simple assignments at class level)
      const propertyMatch = lineContent.match(/^(\w+)\s*[:=]/)
      if (propertyMatch && !lineContent.includes('def')) {
        const propertyName = propertyMatch[1]
        const lineNum = content.substring(0, startIndex).split('\n').length + i + 1
        
        this.entities.push({
          id: `${filePath}:property:${this.currentClass}.${propertyName}`,
          name: propertyName,
          type: 'property',
          filePath,
          line: lineNum,
          column: currentIndent,
          metadata: {
            className: this.currentClass,
            isPrivate: propertyName.startsWith('_')
          }
        })
      }
    }
  }

  private extractFunctions(content: string, filePath: string): void {
    // Match top-level functions (not indented)
    const functionRegex = /^(?:async\s+)?def\s+(\w+)\s*\((.*?)\)/gm
    let match

    while ((match = functionRegex.exec(content)) !== null) {
      // Check if this is a top-level function (no indentation)
      const lineStart = content.lastIndexOf('\n', match.index!) + 1
      const indentation = match.index! - lineStart
      
      if (indentation === 0) { // Top-level function
        const functionName = match[1]
        const params = match[2]
        const line = content.substring(0, match.index).split('\n').length
        
        const funcContent = this.extractEntityContent(content, match.index!)
        
        this.entities.push({
          id: `${filePath}:function:${functionName}`,
          name: functionName,
          type: 'function',
          filePath,
          line,
          column: 0,
          content: funcContent.content,
          endLine: funcContent.endLine,
          metadata: {
            parameters: this.parseParameters(params),
            isAsync: match[0].includes('async'),
            isPrivate: functionName.startsWith('_')
          }
        })
      }
    }
  }

  private extractGlobalVariables(content: string, filePath: string): void {
    // Match top-level variable assignments
    const variableRegex = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/gm
    let match

    while ((match = variableRegex.exec(content)) !== null) {
      const varName = match[1]
      const value = match[2]
      const line = content.substring(0, match.index).split('\n').length
      
      this.entities.push({
        id: `${filePath}:variable:${varName}`,
        name: varName,
        type: 'variable',
        filePath,
        line,
        column: 0,
        metadata: {
          isConstant: varName === varName.toUpperCase(),
          valuePreview: value.substring(0, 50)
        }
      })
    }
  }

  private parseParameters(params: string): any[] {
    if (!params.trim()) return []
    
    const parameters = []
    const parts = params.split(',').map(p => p.trim())
    
    for (const part of parts) {
      if (!part) continue
      
      // Handle different parameter types
      const defaultMatch = part.match(/^(\*?\*?)(\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?$/)
      if (defaultMatch) {
        const [, prefix, name, type, defaultValue] = defaultMatch
        parameters.push({
          name,
          type: type?.trim(),
          hasDefault: !!defaultValue,
          defaultValue: defaultValue?.trim(),
          isVarArgs: prefix === '*',
          isKwArgs: prefix === '**'
        })
      }
    }
    
    return parameters
  }

  private checkIfAbstract(content: string, classIndex: number): boolean {
    // Check for ABC inheritance or abstractmethod decorators
    const beforeClass = content.substring(Math.max(0, classIndex - 500), classIndex)
    return beforeClass.includes('ABC') || beforeClass.includes('@abstractmethod')
  }

  private hasDecorator(lines: string[], methodIndex: number, decoratorName: string): boolean {
    // Check previous lines for decorator
    for (let i = methodIndex - 1; i >= 0 && i > methodIndex - 5; i--) {
      const line = lines[i].trim()
      if (line.includes(`@${decoratorName}`)) return true
      if (line && !line.startsWith('@')) break
    }
    return false
  }

  getEntities(): ExtractedEntity[] {
    return this.entities
  }

  getRelationships(): ExtractedRelationship[] {
    return this.relationships
  }

  async extractRelationships(): Promise<void> {
    // Additional relationship extraction for function calls and type usage
    this.extractFunctionCalls()
    this.extractTypeUsage()
  }

  private extractFunctionCalls(): void {
    // Match function calls: function_name(
    const callRegex = /\b(\w+)\s*\(/g
    let match

    while ((match = callRegex.exec(this.fileContent)) !== null) {
      const functionName = match[1]
      const line = this.fileContent.substring(0, match.index).split('\n').length
      
      // Skip Python keywords
      if (['if', 'for', 'while', 'with', 'except', 'def', 'class', 'return', 'yield', 'lambda'].includes(functionName)) {
        continue
      }
      
      // Find the containing entity
      const containingEntity = this.findContainingEntity(line)
      if (containingEntity) {
        this.relationships.push({
          fromId: containingEntity.id,
          toName: functionName,
          type: 'CALLS',
          properties: { line }
        })
      }
    }
  }

  private extractTypeUsage(): void {
    // Match type annotations: : TypeName
    const typeRegex = /:\s*([A-Z]\w*(?:\[[\w\[\], ]+\])?)/g
    let match

    while ((match = typeRegex.exec(this.fileContent)) !== null) {
      const typeName = match[1].split('[')[0] // Get base type without generics
      const line = this.fileContent.substring(0, match.index).split('\n').length
      
      const containingEntity = this.findContainingEntity(line)
      if (containingEntity) {
        this.relationships.push({
          fromId: containingEntity.id,
          toName: typeName,
          type: 'USES_TYPE',
          properties: { line }
        })
      }
    }
  }

  private findContainingEntity(line: number): ExtractedEntity | null {
    // Find the entity that contains this line
    let bestMatch: ExtractedEntity | null = null
    let closestLine = 0
    
    for (const entity of this.entities) {
      if (entity.line <= line && entity.line > closestLine) {
        bestMatch = entity
        closestLine = entity.line
      }
    }
    
    return bestMatch
  }
  
  private extractEntityContent(content: string, startIndex: number): { content: string; endLine: number } {
    const lines = content.split('\n')
    const startLine = content.substring(0, startIndex).split('\n').length - 1
    let endLine = startLine
    let entityLines = [lines[startLine]]
    
    // Find the indentation of the entity
    const entityIndent = lines[startLine].search(/\S/)
    
    // Extract content based on indentation
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i]
      const lineIndent = line.search(/\S/)
      
      // Empty lines are part of the entity
      if (line.trim() === '') {
        entityLines.push(line)
        continue
      }
      
      // If line is indented more than entity, it's part of the entity
      if (lineIndent > entityIndent) {
        entityLines.push(line)
        endLine = i + 1
      } else {
        // Found next entity at same or lower indentation
        break
      }
    }
    
    return {
      content: entityLines.join('\n'),
      endLine: endLine + 1
    }
  }
}