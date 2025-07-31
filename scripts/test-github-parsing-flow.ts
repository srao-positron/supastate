#!/usr/bin/env npx tsx

import dotenv from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { executeQuery, verifyConnectivity } from '../src/lib/neo4j/client'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://service.supastate.ai'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY environment variable')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// User ID from previous successful operations
const USER_ID = '2563f659-c90f-47d4-b33d-c80877f854e5'
// GitHub token - you'll need to set this
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'YOUR_GITHUB_TOKEN_HERE'

async function checkPGMQQueue() {
  console.log('\n📋 Checking github_code_parsing PGMQ queue...')
  
  try {
    // Check queue metrics
    const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
      queue_name: 'github_code_parsing'
    })
    
    if (!metricsError && metrics) {
      console.log('Queue metrics:', metrics)
    }
    
    // Try to peek at messages
    const { data: messages, error: readError } = await supabase.rpc('pgmq_read', {
      queue_name: 'github_code_parsing',
      vt: 0, // Just peek, don't consume
      qty: 5
    })
    
    if (!readError && messages) {
      console.log(`\nFound ${messages.length} messages in queue:`)
      messages.forEach((msg: any, idx: number) => {
        console.log(`\nMessage ${idx + 1}:`)
        console.log('- File:', msg.message.file_path)
        console.log('- Language:', msg.message.language)
        console.log('- Repository:', msg.message.repository_id)
      })
    }
  } catch (error) {
    console.error('Queue check error:', error)
  }
}

async function queueTestFile() {
  console.log('\n🔧 Queueing a test TypeScript file for parsing...')
  
  const testMessage = {
    repository_id: 'camille-test',
    file_id: 'camille-test#src/test-functions.ts',
    file_path: 'src/test-functions.ts',
    file_content: `
// Test file with various TypeScript constructs
export function simpleFunction(name: string): string {
  return \`Hello, \${name}!\`;
}

export async function asyncFunction(url: string): Promise<Response> {
  const response = await fetch(url);
  return response;
}

export function functionWithOptionalParams(
  required: string,
  optional?: number,
  defaultParam: boolean = true
): void {
  console.log(required, optional, defaultParam);
}

interface User {
  id: string;
  name: string;
  email?: string;
}

export class UserService {
  private users: Map<string, User> = new Map();
  
  constructor(private apiKey: string) {}
  
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }
  
  createUser(name: string, email?: string): User {
    const user: User = {
      id: Math.random().toString(36),
      name,
      email
    };
    this.users.set(user.id, user);
    return user;
  }
}

export type Status = 'active' | 'inactive' | 'pending';

export const CONFIG = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3
} as const;
`,
    language: 'typescript',
    branch: 'main',
    commit_sha: 'test123'
  }
  
  try {
    // Send message to PGMQ queue
    const { data, error } = await supabase.rpc('pgmq_send', {
      queue_name: 'github_code_parsing',
      msg: testMessage
    })
    
    if (error) {
      console.error('Failed to queue message:', error)
    } else {
      console.log('✅ Successfully queued test file for parsing')
      console.log('Message ID:', data)
    }
  } catch (error) {
    console.error('Queue error:', error)
  }
}

async function runParser() {
  console.log('\n⚙️ Running github-code-parser-worker...')
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/github-code-parser-worker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    })
    
    const data = await response.json()
    console.log('Parser response:', JSON.stringify(data, null, 2))
    
    if (!response.ok) {
      throw new Error(`Parser failed: ${data.error || response.statusText}`)
    }
    
    return data
  } catch (error) {
    console.error('Parser error:', error)
    throw error
  }
}

async function checkParsedNodes() {
  console.log('\n🔍 Checking parsed nodes in Neo4j...')
  
  const result = await executeQuery(`
    MATCH (f:RepoFunction)
    WHERE f.repository_id = 'camille-test'
    RETURN f.name as name, 
           f.parameters as parameters,
           f.returnType as returnType,
           f.isAsync as isAsync,
           f.isExport as isExport
    ORDER BY f.name
  `)
  
  console.log(`\nFound ${result.records.length} functions:`)
  result.records.forEach(record => {
    console.log(`\n📄 ${record.name}`)
    console.log('  - Parameters:', record.parameters || 'None')
    console.log('  - Return Type:', record.returnType || 'void')
    console.log('  - Async:', record.isAsync ? 'Yes' : 'No')
    console.log('  - Exported:', record.isExport ? 'Yes' : 'No')
  })
  
  // Check classes
  const classResult = await executeQuery(`
    MATCH (c:RepoClass)
    WHERE c.repository_id = 'camille-test'
    RETURN c.name as name, c.methods as methods
  `)
  
  if (classResult.records.length > 0) {
    console.log(`\n\nFound ${classResult.records.length} classes:`)
    classResult.records.forEach(record => {
      console.log(`\n📦 ${record.name}`)
      console.log('  - Methods:', record.methods || 'None')
    })
  }
  
  // Check interfaces
  const interfaceResult = await executeQuery(`
    MATCH (i:RepoInterface)
    WHERE i.repository_id = 'camille-test'
    RETURN i.name as name, i.properties as properties
  `)
  
  if (interfaceResult.records.length > 0) {
    console.log(`\n\nFound ${interfaceResult.records.length} interfaces:`)
    interfaceResult.records.forEach(record => {
      console.log(`\n🔷 ${record.name}`)
      console.log('  - Properties:', record.properties || 'None')
    })
  }
  
  return result.records
}

async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...')
  
  await executeQuery(`
    MATCH (n)
    WHERE n.repository_id = 'camille-test'
    DETACH DELETE n
  `)
  
  console.log('✅ Test data cleaned up')
}

async function main() {
  console.log('🚀 Testing GitHub Code Parsing Flow')
  console.log('====================================')
  
  try {
    // Verify Neo4j connection
    await verifyConnectivity()
    
    // Step 1: Check queue status
    await checkPGMQQueue()
    
    // Step 2: Queue a test file
    await queueTestFile()
    
    // Step 3: Check queue again
    await checkPGMQQueue()
    
    // Step 4: Run the parser
    await runParser()
    
    // Step 5: Wait a bit for processing
    console.log('\n⏳ Waiting 5 seconds for processing...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Step 6: Check parsed nodes
    await checkParsedNodes()
    
    // Step 7: Cleanup
    await cleanupTestData()
    
    console.log('\n✅ GitHub parsing flow test completed successfully!')
    
  } catch (error) {
    console.error('Test failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)