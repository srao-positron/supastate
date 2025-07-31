import * as ts from 'typescript'

export interface ParsedFunction {
  name: string
  signature: string
  parameters: Array<{
    name: string
    type?: string
  }>
  returnType?: string
  docstring?: string
  startLine: number
  endLine: number
  isAsync: boolean
  isExported: boolean
}

export interface ParsedClass {
  name: string
  extends?: string
  implements?: string[]
  docstring?: string
  startLine: number
  endLine: number
  isExported: boolean
  methods: ParsedFunction[]
  properties: Array<{
    name: string
    type?: string
    isStatic: boolean
  }>
}

export interface ParsedInterface {
  name: string
  extends?: string[]
  docstring?: string
  startLine: number
  endLine: number
  isExported: boolean
  properties: Array<{
    name: string
    type?: string
    optional: boolean
  }>
  methods: Array<{
    name: string
    signature: string
  }>
}

export interface ParsedCode {
  functions: ParsedFunction[]
  classes: ParsedClass[]
  interfaces: ParsedInterface[]
  imports: Array<{
    from: string
    items: string[]
  }>
  exports: string[]
}

export function parseTypeScriptCode(code: string, filename: string): ParsedCode {
  const sourceFile = ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.Latest,
    true
  )

  const result: ParsedCode = {
    functions: [],
    classes: [],
    interfaces: [],
    imports: [],
    exports: []
  }

  // Helper to get line numbers
  const getLineNumber = (pos: number): number => {
    const lineAndChar = sourceFile.getLineAndCharacterOfPosition(pos)
    return lineAndChar.line + 1
  }

  // Helper to extract JSDoc comment
  const getJSDocComment = (node: ts.Node): string | undefined => {
    const jsDocTags = ts.getJSDocCommentsAndTags(node)
    if (jsDocTags.length > 0) {
      const comment = jsDocTags[0]
      if (ts.isJSDoc(comment)) {
        return comment.comment?.toString()
      }
    }
    return undefined
  }

  // Helper to get type as string
  const getTypeString = (type: ts.TypeNode | undefined): string | undefined => {
    if (!type) return undefined
    return type.getText(sourceFile)
  }

  // Helper to check if node is exported
  const isExported = (node: ts.Node): boolean => {
    if (ts.canHaveModifiers(node)) {
      const modifiers = ts.getModifiers(node)
      return !!(modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))
    }
    return false
  }

  // Parse function declaration
  const parseFunction = (node: ts.FunctionDeclaration | ts.MethodDeclaration, isMethod = false): ParsedFunction | null => {
    const name = node.name?.getText(sourceFile)
    if (!name) return null

    const parameters = node.parameters.map(param => ({
      name: param.name.getText(sourceFile),
      type: getTypeString(param.type)
    }))

    const signature = `${name}(${parameters.map(p => 
      p.type ? `${p.name}: ${p.type}` : p.name
    ).join(', ')})`

    return {
      name,
      signature,
      parameters,
      returnType: getTypeString(node.type),
      docstring: getJSDocComment(node),
      startLine: getLineNumber(node.pos),
      endLine: getLineNumber(node.end),
      isAsync: ts.canHaveModifiers(node) ? !!(ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) : false,
      isExported: !isMethod && isExported(node)
    }
  }

  // Parse class declaration
  const parseClass = (node: ts.ClassDeclaration): ParsedClass | null => {
    const name = node.name?.getText(sourceFile)
    if (!name) return null

    const methods: ParsedFunction[] = []
    const properties: ParsedClass['properties'] = []

    // Parse heritage clauses (extends/implements)
    let extendsClause: string | undefined
    const implementsClauses: string[] = []

    node.heritageClauses?.forEach(clause => {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        extendsClause = clause.types[0]?.getText(sourceFile)
      } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
        clause.types.forEach(type => {
          implementsClauses.push(type.getText(sourceFile))
        })
      }
    })

    // Parse members
    node.members.forEach(member => {
      if (ts.isMethodDeclaration(member)) {
        const method = parseFunction(member, true)
        if (method) methods.push(method)
      } else if (ts.isPropertyDeclaration(member)) {
        const propName = member.name?.getText(sourceFile)
        if (propName) {
          properties.push({
            name: propName,
            type: getTypeString(member.type),
            isStatic: !!(member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword))
          })
        }
      }
    })

    return {
      name,
      extends: extendsClause,
      implements: implementsClauses.length > 0 ? implementsClauses : undefined,
      docstring: getJSDocComment(node),
      startLine: getLineNumber(node.pos),
      endLine: getLineNumber(node.end),
      isExported: isExported(node),
      methods,
      properties
    }
  }

  // Parse interface declaration
  const parseInterface = (node: ts.InterfaceDeclaration): ParsedInterface | null => {
    const name = node.name?.getText(sourceFile)
    if (!name) return null

    const properties: ParsedInterface['properties'] = []
    const methods: ParsedInterface['methods'] = []

    // Parse extends clauses
    const extendsClause: string[] = []
    node.heritageClauses?.forEach(clause => {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        clause.types.forEach(type => {
          extendsClause.push(type.getText(sourceFile))
        })
      }
    })

    // Parse members
    node.members.forEach(member => {
      if (ts.isPropertySignature(member)) {
        const propName = member.name?.getText(sourceFile)
        if (propName) {
          properties.push({
            name: propName,
            type: getTypeString(member.type),
            optional: !!member.questionToken
          })
        }
      } else if (ts.isMethodSignature(member)) {
        const methodName = member.name?.getText(sourceFile)
        if (methodName) {
          const params = member.parameters?.map(p => 
            p.name.getText(sourceFile)
          ).join(', ') || ''
          methods.push({
            name: methodName,
            signature: `${methodName}(${params})`
          })
        }
      }
    })

    return {
      name,
      extends: extendsClause.length > 0 ? extendsClause : undefined,
      docstring: getJSDocComment(node),
      startLine: getLineNumber(node.pos),
      endLine: getLineNumber(node.end),
      isExported: isExported(node),
      properties,
      methods
    }
  }

  // Parse imports
  const parseImports = (node: ts.ImportDeclaration) => {
    const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text
    const items: string[] = []

    if (node.importClause) {
      // Default import
      if (node.importClause.name) {
        items.push(node.importClause.name.getText(sourceFile))
      }

      // Named imports
      if (node.importClause.namedBindings) {
        if (ts.isNamedImports(node.importClause.namedBindings)) {
          node.importClause.namedBindings.elements.forEach(element => {
            items.push(element.name.getText(sourceFile))
          })
        } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          items.push(`* as ${node.importClause.namedBindings.name.getText(sourceFile)}`)
        }
      }
    }

    if (items.length > 0) {
      result.imports.push({ from: moduleSpecifier, items })
    }
  }

  // Visit all nodes
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node)) {
      const func = parseFunction(node)
      if (func) result.functions.push(func)
    } else if (ts.isClassDeclaration(node)) {
      const cls = parseClass(node)
      if (cls) result.classes.push(cls)
    } else if (ts.isInterfaceDeclaration(node)) {
      const iface = parseInterface(node)
      if (iface) result.interfaces.push(iface)
    } else if (ts.isImportDeclaration(node)) {
      parseImports(node)
    } else if (ts.isExportDeclaration(node)) {
      // Track re-exports
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        result.exports.push(`export * from '${node.moduleSpecifier.text}'`)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return result
}

// Simple JavaScript parser (fallback for non-TypeScript files)
export function parseJavaScriptCode(code: string): ParsedCode {
  const result: ParsedCode = {
    functions: [],
    classes: [],
    interfaces: [], // JavaScript doesn't have interfaces
    imports: [],
    exports: []
  }

  // Simple regex-based parsing for JavaScript
  const lines = code.split('\n')

  // Parse functions
  const functionRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\((.*?)\)/gm
  let match
  while ((match = functionRegex.exec(code)) !== null) {
    const [fullMatch, name, params] = match
    const startLine = code.substring(0, match.index).split('\n').length
    
    result.functions.push({
      name,
      signature: `${name}(${params})`,
      parameters: params.split(',').filter(p => p.trim()).map(p => ({
        name: p.trim().split(/\s+/)[0]
      })),
      startLine,
      endLine: startLine + 5, // Approximate
      isAsync: fullMatch.includes('async'),
      isExported: fullMatch.includes('export')
    })
  }

  // Parse classes
  const classRegex = /^(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{/gm
  while ((match = classRegex.exec(code)) !== null) {
    const [fullMatch, name, extendsClass] = match
    const startLine = code.substring(0, match.index).split('\n').length
    
    result.classes.push({
      name,
      extends: extendsClass,
      startLine,
      endLine: startLine + 10, // Approximate
      isExported: fullMatch.includes('export'),
      methods: [],
      properties: []
    })
  }

  // Parse imports
  const importRegex = /^import\s+(?:{([^}]+)}|(\w+)|(\*\s+as\s+\w+))\s+from\s+['"]([^'"]+)['"]/gm
  while ((match = importRegex.exec(code)) !== null) {
    const [, namedImports, defaultImport, namespaceImport, from] = match
    const items: string[] = []
    
    if (namedImports) {
      items.push(...namedImports.split(',').map(i => i.trim()))
    } else if (defaultImport) {
      items.push(defaultImport)
    } else if (namespaceImport) {
      items.push(namespaceImport)
    }
    
    result.imports.push({ from, items })
  }

  return result
}

export function parseCode(code: string, filename: string): ParsedCode {
  const ext = filename.split('.').pop()?.toLowerCase()
  
  if (ext === 'ts' || ext === 'tsx') {
    return parseTypeScriptCode(code, filename)
  } else if (ext === 'js' || ext === 'jsx') {
    return parseJavaScriptCode(code)
  }
  
  // Default to empty result for unsupported files
  return {
    functions: [],
    classes: [],
    interfaces: [],
    imports: [],
    exports: []
  }
}