import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createSourceFile, ScriptTarget, SyntaxKind, isTypeNode, forEachChild, Node, TypeNode, FunctionDeclaration, MethodDeclaration, ParameterDeclaration, ClassDeclaration, InterfaceDeclaration, PropertySignature, MethodSignature, TypeAliasDeclaration, VariableStatement, ImportDeclaration, ExportDeclaration } from 'https://esm.sh/typescript@5.3.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Parse TypeScript/JavaScript locally using TypeScript compiler API
function parseTypeScriptLocally(code: string, language: string, filename: string) {
  const result = {
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    components: [],
    types: [],
    variables: [],
    apiCalls: [],
    errors: []
  }

  try {
    // Create a SourceFile from the code
    const sourceFile = createSourceFile(
      filename || 'temp.ts',
      code,
      ScriptTarget.Latest,
      true
    )

    // Helper to get type as string
    function getTypeString(node: TypeNode | undefined): string | null {
      if (!node) return null
      
      // Handle common type nodes
      switch (node.kind) {
        case SyntaxKind.StringKeyword:
          return 'string'
        case SyntaxKind.NumberKeyword:
          return 'number'
        case SyntaxKind.BooleanKeyword:
          return 'boolean'
        case SyntaxKind.AnyKeyword:
          return 'any'
        case SyntaxKind.VoidKeyword:
          return 'void'
        case SyntaxKind.ArrayType:
          const arrayType = node as any
          return `${getTypeString(arrayType.elementType)}[]`
        case SyntaxKind.TypeReference:
          const typeRef = node as any
          return typeRef.typeName?.text || 'unknown'
        default:
          // For complex types, use the text
          return node.getText?.(sourceFile) || 'unknown'
      }
    }

    // Helper to extract parameters with types
    function extractParameters(params: any[]): any[] {
      return params.map(param => {
        const name = param.name?.getText?.(sourceFile) || 'unknown'
        const type = getTypeString(param.type)
        const isOptional = !!param.questionToken
        
        return {
          name,
          type: type || 'any',
          optional: isOptional
        }
      })
    }

    // Traverse the AST
    function visit(node: Node) {
      switch (node.kind) {
        case SyntaxKind.ImportDeclaration:
          const importDecl = node as ImportDeclaration
          const moduleSpecifier = importDecl.moduleSpecifier?.getText?.(sourceFile).replace(/['"]/g, '')
          const specifiers = []
          
          if (importDecl.importClause) {
            // Default import
            if (importDecl.importClause.name) {
              specifiers.push('default')
            }
            // Named imports
            if (importDecl.importClause.namedBindings) {
              if (importDecl.importClause.namedBindings.kind === SyntaxKind.NamespaceImport) {
                specifiers.push(`* as ${importDecl.importClause.namedBindings.name.text}`)
              } else {
                importDecl.importClause.namedBindings.elements.forEach(element => {
                  specifiers.push(element.name.text)
                })
              }
            }
          }
          
          result.imports.push({
            source: moduleSpecifier,
            specifiers
          })
          break

        case SyntaxKind.FunctionDeclaration:
          const funcDecl = node as FunctionDeclaration
          if (funcDecl.name) {
            const params = extractParameters(funcDecl.parameters as any)
            const returnType = getTypeString(funcDecl.type)
            const isAsync = funcDecl.modifiers?.some(m => m.kind === SyntaxKind.AsyncKeyword) || false
            const isExported = funcDecl.modifiers?.some(m => m.kind === SyntaxKind.ExportKeyword) || false
            
            result.functions.push({
              name: funcDecl.name.text,
              async: isAsync,
              generator: false,
              params,
              returnType,
              exported: isExported,
              line: sourceFile.getLineAndCharacterOfPosition(funcDecl.pos).line + 1
            })

            if (isExported) {
              result.exports.push({
                name: funcDecl.name.text,
                type: 'function'
              })
            }
          }
          break

        case SyntaxKind.VariableStatement:
          const varStmt = node as VariableStatement
          const isExported = varStmt.modifiers?.some(m => m.kind === SyntaxKind.ExportKeyword) || false
          
          varStmt.declarationList.declarations.forEach(decl => {
            const name = decl.name?.getText?.(sourceFile)
            if (name) {
              // Check if it's an arrow function
              if (decl.initializer?.kind === SyntaxKind.ArrowFunction) {
                const arrowFunc = decl.initializer as any
                const params = extractParameters(arrowFunc.parameters)
                const returnType = getTypeString(arrowFunc.type)
                const isAsync = arrowFunc.modifiers?.some(m => m.kind === SyntaxKind.AsyncKeyword) || false
                
                result.functions.push({
                  name,
                  async: isAsync,
                  generator: false,
                  params,
                  returnType,
                  exported: isExported,
                  line: sourceFile.getLineAndCharacterOfPosition(decl.pos).line + 1
                })

                // Check if it's a React component
                if (name[0] === name[0].toUpperCase()) {
                  result.components.push({
                    name,
                    hooks: [],
                    props: params.length > 0 ? params[0].type : null
                  })
                }
              } else {
                result.variables.push({
                  name,
                  kind: varStmt.declarationList.flags & 2 ? 'const' : 'let'
                })
              }

              if (isExported) {
                result.exports.push({
                  name,
                  type: 'variable'
                })
              }
            }
          })
          break

        case SyntaxKind.ClassDeclaration:
          const classDecl = node as ClassDeclaration
          if (classDecl.name) {
            const methods = []
            const properties = []
            const isExported = classDecl.modifiers?.some(m => m.kind === SyntaxKind.ExportKeyword) || false
            
            // Get extends clause
            let extendsClass = null
            if (classDecl.heritageClauses) {
              const extendsClause = classDecl.heritageClauses.find(h => h.token === SyntaxKind.ExtendsKeyword)
              if (extendsClause && extendsClause.types.length > 0) {
                extendsClass = extendsClause.types[0].expression.getText(sourceFile)
              }
            }

            // Get implements
            const implementsList = []
            if (classDecl.heritageClauses) {
              const implementsClause = classDecl.heritageClauses.find(h => h.token === SyntaxKind.ImplementsKeyword)
              if (implementsClause) {
                implementsClause.types.forEach(type => {
                  implementsList.push(type.expression.getText(sourceFile))
                })
              }
            }

            // Extract methods and properties
            classDecl.members.forEach(member => {
              if (member.kind === SyntaxKind.MethodDeclaration) {
                const method = member as MethodDeclaration
                if (method.name) {
                  methods.push({
                    name: method.name.getText(sourceFile),
                    params: extractParameters(method.parameters as any),
                    returnType: getTypeString(method.type),
                    async: method.modifiers?.some(m => m.kind === SyntaxKind.AsyncKeyword) || false
                  })
                }
              } else if (member.kind === SyntaxKind.PropertyDeclaration) {
                const prop = member as any
                if (prop.name) {
                  properties.push({
                    name: prop.name.getText(sourceFile),
                    type: getTypeString(prop.type)
                  })
                }
              }
            })

            result.classes.push({
              name: classDecl.name.text,
              extends: extendsClass,
              implements: implementsList,
              methods,
              properties,
              exported: isExported,
              line: sourceFile.getLineAndCharacterOfPosition(classDecl.pos).line + 1
            })

            if (isExported) {
              result.exports.push({
                name: classDecl.name.text,
                type: 'class'
              })
            }

            // Check if it's a React component
            if (extendsClass && ['Component', 'React.Component', 'PureComponent'].includes(extendsClass)) {
              result.components.push({
                name: classDecl.name.text,
                hooks: [],
                props: properties.find(p => p.name === 'props')?.type || null
              })
            }
          }
          break

        case SyntaxKind.InterfaceDeclaration:
          const interfaceDecl = node as InterfaceDeclaration
          if (interfaceDecl.name) {
            const members = []
            const isExported = interfaceDecl.modifiers?.some(m => m.kind === SyntaxKind.ExportKeyword) || false

            interfaceDecl.members.forEach(member => {
              if (member.kind === SyntaxKind.PropertySignature) {
                const prop = member as PropertySignature
                members.push({
                  name: prop.name?.getText(sourceFile),
                  type: getTypeString(prop.type),
                  optional: !!prop.questionToken
                })
              } else if (member.kind === SyntaxKind.MethodSignature) {
                const method = member as MethodSignature
                members.push({
                  name: method.name?.getText(sourceFile),
                  type: 'method',
                  params: extractParameters(method.parameters as any),
                  returnType: getTypeString(method.type)
                })
              }
            })

            result.types.push({
              name: interfaceDecl.name.text,
              kind: 'interface',
              members,
              exported: isExported
            })

            if (isExported) {
              result.exports.push({
                name: interfaceDecl.name.text,
                type: 'interface'
              })
            }
          }
          break

        case SyntaxKind.TypeAliasDeclaration:
          const typeAlias = node as TypeAliasDeclaration
          if (typeAlias.name) {
            const isExported = typeAlias.modifiers?.some(m => m.kind === SyntaxKind.ExportKeyword) || false
            
            result.types.push({
              name: typeAlias.name.text,
              kind: 'type',
              definition: typeAlias.type.getText(sourceFile),
              exported: isExported
            })

            if (isExported) {
              result.exports.push({
                name: typeAlias.name.text,
                type: 'type'
              })
            }
          }
          break

        case SyntaxKind.ExportDeclaration:
          const exportDecl = node as ExportDeclaration
          if (exportDecl.exportClause && exportDecl.exportClause.kind === SyntaxKind.NamedExports) {
            exportDecl.exportClause.elements.forEach(element => {
              result.exports.push({
                name: element.name.text,
                type: 'named'
              })
            })
          }
          break
      }

      // Continue traversing
      forEachChild(node, visit)
    }

    // Start traversal
    forEachChild(sourceFile, visit)

    // Detect API calls and hooks
    const codeText = sourceFile.getText()
    
    // Detect API calls
    if (codeText.includes('fetch(')) {
      result.apiCalls.push({ type: 'fetch' })
    }
    if (codeText.match(/axios\./)) {
      result.apiCalls.push({ type: 'axios' })
    }

    // Find React hooks in components
    result.components.forEach(component => {
      const hookRegex = /use[A-Z]\w*/g
      const hooks = [...new Set(codeText.match(hookRegex) || [])]
      component.hooks = hooks
    })

  } catch (error) {
    result.errors.push(error.message || 'Failed to parse TypeScript/JavaScript')
  }

  return result
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { code, language, filename } = await req.json()

    if (!code || !language) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: code and language' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Check if it's TypeScript/JavaScript - parse locally
    if (['typescript', 'ts', 'javascript', 'js', 'jsx', 'tsx'].includes(language.toLowerCase())) {
      console.log(`[Parse Code] Parsing ${language} locally with TypeScript compiler`)
      const result = parseTypeScriptLocally(code, language, filename)
      
      return new Response(
        JSON.stringify(result),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    // For other languages, use the Lambda function
    const LAMBDA_FUNCTION_URL = Deno.env.get('LAMBDA_FUNCTION_URL')
    
    if (!LAMBDA_FUNCTION_URL) {
      console.error('LAMBDA_FUNCTION_URL not configured for non-TS languages')
      
      return new Response(
        JSON.stringify({ 
          error: 'Lambda Function URL not configured',
          message: 'Cannot parse non-TypeScript/JavaScript languages without Lambda'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }
    
    // Invoke Lambda via Function URL for Python and other languages
    console.log(`[Parse Code] Invoking Lambda for ${language}`)
    const response = await fetch(LAMBDA_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        language,
        filename: filename || ''
      })
    })
    
    console.log('Lambda response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Lambda invocation failed:', errorText)
      return new Response(
        JSON.stringify({ 
          error: 'Lambda invocation failed',
          details: errorText
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }
    
    const result = await response.json()
    
    // Return parsed results
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error:', error)
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