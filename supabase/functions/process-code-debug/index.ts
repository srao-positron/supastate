import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Simple debug function that tests the enhanced parser
serve(async (req) => {
  const logs: string[] = []
  const log = (message: string) => {
    console.log(message)
    logs.push(message)
  }
  
  try {
    log('[Debug] Starting process-code-debug function')
    
    // Test TypeScript import
    log('[Debug] Importing TypeScript...')
    const ts = await import('https://esm.sh/typescript@5.3.3')
    log('[Debug] TypeScript imported successfully')
    
    // Test creating a source file
    const testCode = `
export function hello() {
  return "world";
}

class Test {
  method() {}
}
`
    
    log('[Debug] Creating source file...')
    const sourceFile = ts.createSourceFile(
      'test.ts',
      testCode,
      ts.ScriptTarget.Latest,
      true
    )
    log('[Debug] Source file created')
    
    // Test node traversal
    log('[Debug] Testing node traversal...')
    let nodeCount = 0
    const visit = (node: any) => {
      nodeCount++
      
      // Test modifiers access
      if (node.modifiers) {
        log(`[Debug] Found node with modifiers: ${ts.SyntaxKind[node.kind]}`)
        try {
          const modCount = node.modifiers.length
          log(`[Debug] Modifier count: ${modCount}`)
          
          // Test accessing modifier properties
          if (modCount > 0) {
            const firstMod = node.modifiers[0]
            log(`[Debug] First modifier kind: ${firstMod.kind}`)
          }
        } catch (e: any) {
          log(`[Debug] Error accessing modifiers: ${e.message}`)
        }
      }
      
      ts.forEachChild(node, visit)
    }
    
    visit(sourceFile)
    log(`[Debug] Traversed ${nodeCount} nodes`)
    
    // Test the enhanced parser
    log('[Debug] Testing enhanced parser...')
    try {
      const { EnhancedTypeScriptParser } = await import('../process-code/enhanced-parser.ts')
      log('[Debug] Enhanced parser imported')
      
      const parser = new EnhancedTypeScriptParser()
      log('[Debug] Parser instantiated')
      
      const result = parser.parse(testCode, 'test.ts')
      log(`[Debug] Parse result: ${result.entities.length} entities, ${result.relationships.length} relationships`)
      
      for (const entity of result.entities) {
        log(`[Debug] Entity: ${entity.name} (${entity.type})`)
      }
    } catch (parserError: any) {
      log(`[Debug] Enhanced parser error: ${parserError.message}`)
      log(`[Debug] Stack: ${parserError.stack}`)
    }
    
    return new Response(
      JSON.stringify({ 
        success: true,
        logs,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
    
  } catch (error: any) {
    log(`[Debug] Error: ${error.message}`)
    log(`[Debug] Stack: ${error.stack}`)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        logs,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})