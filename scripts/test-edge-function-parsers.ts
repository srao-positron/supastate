// Test what parsers work in Supabase Edge Functions environment

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const results: any = {}

  // Test 1: swc parser (built into Deno)
  try {
    const { parseSync } = await import('https://deno.land/x/swc@0.2.1/mod.ts')
    
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
    
    const ast = parseSync(tsCode, { syntax: 'typescript', tsx: false })
    results.swc = {
      available: true,
      parsed: true,
      bodyCount: ast.body.length
    }
  } catch (error) {
    results.swc = {
      available: false,
      error: error.message
    }
  }

  // Test 2: Python via subprocess
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
'''

tree = ast.parse(code)

# Count node types
imports = sum(1 for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom)))
functions = sum(1 for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)))

print(json.dumps({"imports": imports, "functions": functions}))
`

    const command = new Deno.Command('python3', {
      args: ['-c', pythonCode],
      stdout: 'piped',
      stderr: 'piped',
    })
    
    const { code, stdout, stderr } = await command.output()
    
    if (code === 0) {
      const result = JSON.parse(new TextDecoder().decode(stdout))
      results.python = {
        available: true,
        ...result
      }
    } else {
      results.python = {
        available: false,
        error: new TextDecoder().decode(stderr)
      }
    }
  } catch (error) {
    results.python = {
      available: false,
      error: error.message
    }
  }

  // Test 3: Simple TypeScript compiler API
  try {
    const ts = await import('https://esm.sh/typescript@5.3.3')
    results.typescript = {
      available: true,
      version: ts.version
    }
  } catch (error) {
    results.typescript = {
      available: false,
      error: error.message
    }
  }

  // Test 4: Check Python binary availability
  try {
    const pythonVersion = new Deno.Command('python3', {
      args: ['--version'],
      stdout: 'piped',
    })
    
    const { code, stdout } = await pythonVersion.output()
    results.pythonBinary = {
      available: code === 0,
      version: code === 0 ? new TextDecoder().decode(stdout).trim() : null
    }
  } catch (error) {
    results.pythonBinary = {
      available: false,
      error: error.message
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})