#!/usr/bin/env npx tsx

/**
 * Test the parse-code edge function with TypeScript code that has typed parameters
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// TypeScript code snippet with various type annotations
const testCode = `
import { Request, Response } from 'express'
import { User, UserProfile } from './types'
import * as lodash from 'lodash'

// Interface with typed members
interface ApiResponse<T> {
  data: T
  error?: string
  timestamp: Date
}

// Type alias
type UserId = string | number

// Function with typed parameters and return type
export async function getUser(id: UserId, includeProfile: boolean = false): Promise<User> {
  const user = await db.findUser(id)
  if (includeProfile) {
    user.profile = await db.findProfile(id)
  }
  return user
}

// Arrow function with typed parameters
export const processUsers = async (
  users: User[], 
  filter?: (user: User) => boolean,
  options?: { limit?: number; offset?: number }
): Promise<ApiResponse<User[]>> => {
  let result = users
  
  if (filter) {
    result = result.filter(filter)
  }
  
  if (options?.limit) {
    result = result.slice(options.offset || 0, options.limit)
  }
  
  return {
    data: result,
    timestamp: new Date()
  }
}

// Class with typed methods and properties
export class UserService {
  private readonly apiKey: string
  private cache: Map<UserId, User>
  
  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.cache = new Map()
  }
  
  async findUser(id: UserId): Promise<User | null> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!
    }
    
    const user = await this.fetchUser(id)
    if (user) {
      this.cache.set(id, user)
    }
    return user
  }
  
  private async fetchUser(id: UserId): Promise<User | null> {
    const response = await fetch(\`/api/users/\${id}\`, {
      headers: { 'Authorization': \`Bearer \${this.apiKey}\` }
    })
    
    if (!response.ok) return null
    return response.json()
  }
}

// React component with typed props
interface ButtonProps {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

const Button: React.FC<ButtonProps> = ({ onClick, children, disabled = false, variant = 'primary' }) => {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={\`btn btn-\${variant}\`}
    >
      {children}
    </button>
  )
}

// Generic function
function mapArray<T, U>(array: T[], mapper: (item: T) => U): U[] {
  return array.map(mapper)
}

// Complex type with nested generics
type ApiHandler<T = any> = (
  req: Request<{ id: string }, any, T>,
  res: Response<ApiResponse<T>>
) => Promise<void> | void
`

async function testParseCode() {
  console.log('Testing parse-code edge function with TypeScript code...\n')
  
  try {
    // Get the edge function URL
    const functionUrl = `${SUPABASE_URL}/functions/v1/parse-code`
    
    console.log('Calling parse-code function at:', functionUrl)
    console.log('Code length:', testCode.length, 'characters\n')
    
    // Call the edge function
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        code: testCode,
        language: 'typescript',
        filename: 'test.ts'
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Function returned ${response.status}: ${error}`)
    }
    
    const result = await response.json()
    
    console.log('✅ Parse successful!\n')
    console.log('=== PARSING RESULTS ===\n')
    
    // Display imports
    console.log('📦 IMPORTS:')
    result.imports.forEach((imp: any) => {
      console.log(`  - ${imp.source}: ${imp.specifiers.join(', ')}`)
    })
    
    // Display functions with parameters
    console.log('\n🔧 FUNCTIONS:')
    result.functions.forEach((func: any) => {
      console.log(`\n  ${func.name}${func.async ? ' (async)' : ''}:`)
      console.log(`    Line: ${func.line}`)
      console.log(`    Exported: ${func.exported}`)
      console.log(`    Return Type: ${func.returnType || 'any'}`)
      console.log(`    Parameters:`)
      func.params.forEach((param: any) => {
        console.log(`      - ${param.name}: ${param.type}${param.optional ? ' (optional)' : ''}`)
      })
    })
    
    // Display classes
    console.log('\n🏗️  CLASSES:')
    result.classes.forEach((cls: any) => {
      console.log(`\n  ${cls.name}:`)
      console.log(`    Line: ${cls.line}`)
      console.log(`    Exported: ${cls.exported}`)
      if (cls.extends) {
        console.log(`    Extends: ${cls.extends}`)
      }
      if (cls.implements.length > 0) {
        console.log(`    Implements: ${cls.implements.join(', ')}`)
      }
      console.log(`    Properties:`)
      cls.properties.forEach((prop: any) => {
        console.log(`      - ${prop.name}: ${prop.type || 'any'}`)
      })
      console.log(`    Methods:`)
      cls.methods.forEach((method: any) => {
        console.log(`      - ${method.name}(${method.params.map((p: any) => `${p.name}: ${p.type}`).join(', ')}): ${method.returnType || 'any'}`)
      })
    })
    
    // Display types and interfaces
    console.log('\n📐 TYPES & INTERFACES:')
    result.types.forEach((type: any) => {
      console.log(`\n  ${type.name} (${type.kind}):`)
      console.log(`    Exported: ${type.exported}`)
      if (type.members) {
        console.log(`    Members:`)
        type.members.forEach((member: any) => {
          if (member.type === 'method') {
            const params = member.params.map((p: any) => `${p.name}: ${p.type}`).join(', ')
            console.log(`      - ${member.name}(${params}): ${member.returnType || 'any'}`)
          } else {
            console.log(`      - ${member.name}: ${member.type}${member.optional ? ' (optional)' : ''}`)
          }
        })
      }
      if (type.definition) {
        console.log(`    Definition: ${type.definition}`)
      }
    })
    
    // Display React components
    if (result.components.length > 0) {
      console.log('\n⚛️  REACT COMPONENTS:')
      result.components.forEach((comp: any) => {
        console.log(`\n  ${comp.name}:`)
        if (comp.props) {
          console.log(`    Props: ${comp.props}`)
        }
        if (comp.hooks.length > 0) {
          console.log(`    Hooks: ${comp.hooks.join(', ')}`)
        }
      })
    }
    
    // Display exports
    console.log('\n📤 EXPORTS:')
    result.exports.forEach((exp: any) => {
      console.log(`  - ${exp.name} (${exp.type})`)
    })
    
    // Display any errors
    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:')
      result.errors.forEach((error: string) => {
        console.log(`  - ${error}`)
      })
    }
    
    console.log('\n✅ Test completed successfully!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Run the test
testParseCode()