// Test script to check available parsers in Deno environment

// Test 1: Check if deno_ast is available
console.log('=== Testing deno_ast for TypeScript/JavaScript ===')
try {
  // Try importing deno_ast
  const { parseModule } = await import('https://deno.land/x/deno_ast@0.31.0/mod.ts')
  
  const tsCode = `
    import { createClient } from '@supabase/supabase-js'
    
    export async function fetchUser(id: string): Promise<User> {
      const user = await db.users.findOne({ id })
      return user
    }
    
    export class UserService {
      async getProfile(userId: string) {
        try {
          return await fetchUser(userId)
        } catch (error) {
          console.error('Failed to fetch user:', error)
          throw error
        }
      }
    }
  `
  
  const parsed = parseModule(tsCode, { kind: 'ts' })
  console.log('✓ deno_ast works! Parsed AST has', parsed.module.body.length, 'top-level statements')
  
  // Extract imports
  const imports = parsed.module.body.filter((node: any) => node.type === 'ImportDeclaration')
  console.log('  Imports found:', imports.length)
  
  // Extract exports
  const exports = parsed.module.body.filter((node: any) => 
    node.type === 'ExportDeclaration' || 
    node.type === 'FunctionDeclaration' || 
    node.type === 'ClassDeclaration'
  )
  console.log('  Exports found:', exports.length)
  
} catch (error) {
  console.error('✗ deno_ast not available:', error.message)
}

// Test 2: Check if Python AST is available via subprocess
console.log('\n=== Testing Python AST via subprocess ===')
try {
  const pythonCode = `
import ast
import json

code = '''
import pandas as pd
from typing import List, Dict

async def process_data(items: List[Dict]) -> pd.DataFrame:
    df = pd.DataFrame(items)
    return df

class DataProcessor:
    def __init__(self):
        self.data = []
    
    async def analyze(self, df: pd.DataFrame) -> Dict:
        try:
            return {"rows": len(df), "columns": len(df.columns)}
        except Exception as e:
            print(f"Error: {e}")
            raise
'''

tree = ast.parse(code)

# Extract info
imports = []
functions = []
classes = []

for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        imports.extend([alias.name for alias in node.names])
    elif isinstance(node, ast.ImportFrom):
        imports.append(node.module)
    elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
        functions.append({
            "name": node.name,
            "async": isinstance(node, ast.AsyncFunctionDef),
            "args": [arg.arg for arg in node.args.args]
        })
    elif isinstance(node, ast.ClassDef):
        classes.append({
            "name": node.name,
            "methods": [n.name for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        })

print(json.dumps({
    "imports": imports,
    "functions": functions,
    "classes": classes
}))
`

  const command = new Deno.Command('python3', {
    args: ['-c', pythonCode],
    stdout: 'piped',
    stderr: 'piped',
  })
  
  const { code, stdout, stderr } = await command.output()
  
  if (code === 0) {
    const result = JSON.parse(new TextDecoder().decode(stdout))
    console.log('✓ Python AST works via subprocess!')
    console.log('  Imports:', result.imports)
    console.log('  Functions:', result.functions.map((f: any) => f.name))
    console.log('  Classes:', result.classes.map((c: any) => c.name))
  } else {
    console.error('✗ Python subprocess failed:', new TextDecoder().decode(stderr))
  }
  
} catch (error) {
  console.error('✗ Python not available:', error.message)
}

// Test 3: Alternative - Try tree-sitter WASM (works for many languages)
console.log('\n=== Testing tree-sitter-wasm as alternative ===')
try {
  // Tree-sitter provides WASM bindings that work in Deno
  const TreeSitter = (await import('https://cdn.jsdelivr.net/npm/web-tree-sitter@0.20.8/tree-sitter.js')).default
  console.log('✓ tree-sitter might be an option for multi-language parsing')
} catch (error) {
  console.log('✗ tree-sitter-wasm needs more setup')
}

console.log('\n=== Recommendation ===')
console.log('1. Use deno_ast for TypeScript/JavaScript - it\'s native to Deno')
console.log('2. For Python, we have two options:')
console.log('   a. Use subprocess with python3 (if available in Edge Functions)')
console.log('   b. Use a pure JS/WASM Python parser')
console.log('   c. Use regex-based extraction as fallback')