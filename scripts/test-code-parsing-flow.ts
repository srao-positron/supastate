#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { executeQuery, verifyConnectivity } from '@/lib/neo4j/client'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://service.supastate.ai'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function testParseCodeFunction() {
  console.log('\n🧪 Testing parse-code function directly...')
  
  const testCode = `
    // Test TypeScript code
    export class UserService {
      private db: Database;
      
      constructor(db: Database) {
        this.db = db;
      }
      
      async findUser(id: string): Promise<User | null> {
        return await this.db.users.findOne({ id });
      }
      
      async createUser(data: CreateUserDto): Promise<User> {
        const user = await this.db.users.create(data);
        await this.sendWelcomeEmail(user.email);
        return user;
      }
      
      private async sendWelcomeEmail(email: string): Promise<void> {
        console.log('Sending welcome email to:', email);
      }
    }
    
    export interface User {
      id: string;
      email: string;
      name: string;
    }
    
    export interface CreateUserDto {
      email: string;
      name: string;
      password: string;
    }
  `
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-code`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: testCode,
        language: 'typescript',
        filename: 'test.ts'
      })
    })
    
    const data = await response.json()
    console.log('Parse result:', JSON.stringify(data, null, 2))
    
    return data
  } catch (error) {
    console.error('Parse error:', error)
  }
}

async function queueTestFile() {
  console.log('\n📨 Queueing test file for parsing...')
  
  const testFile = {
    repository_id: 'test-repo-001',
    file_id: 'test-repo-001#src/test.ts',
    file_path: 'src/test.ts',
    file_content: `
      export function calculateTotal(items: Item[]): number {
        return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      }
      
      export class ShoppingCart {
        items: Item[] = [];
        
        addItem(item: Item): void {
          this.items.push(item);
        }
        
        getTotal(): number {
          return calculateTotal(this.items);
        }
      }
      
      interface Item {
        id: string;
        name: string;
        price: number;
        quantity: number;
      }
    `,
    language: 'typescript',
    branch: 'main',
    commit_sha: 'abc123'
  }
  
  const { data, error } = await supabase.rpc('pgmq_send', {
    queue_name: 'github_code_parsing',
    msg: testFile
  })
  
  if (error) {
    console.error('Queue error:', error)
  } else {
    console.log(`✅ Message queued with ID: ${data}`)
  }
  
  return data
}

async function checkQueue() {
  console.log('\n📋 Checking queue status...')
  
  const { data: metrics, error } = await supabase.rpc('pgmq_metrics', {
    p_queue_name: 'github_code_parsing'
  })
  
  if (!error && metrics && metrics.length > 0) {
    console.log('Queue metrics:', JSON.stringify(metrics[0], null, 2))
  }
}

async function processQueue() {
  console.log('\n⚙️ Processing queue...')
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/github-code-parser-worker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ batch_size: 5 })
    })
    
    const data = await response.json()
    console.log('Processing result:', JSON.stringify(data, null, 2))
    
    return data
  } catch (error) {
    console.error('Processing error:', error)
  }
}

async function checkNeo4jData() {
  console.log('\n🔍 Checking Neo4j data...')
  
  // Check all node types
  const nodeTypes = await executeQuery(`
    MATCH (n)
    WITH labels(n) as lbls, COUNT(n) as count
    UNWIND lbls as label
    RETURN label, count
    ORDER BY count DESC
    LIMIT 20
  `)
  
  console.log('\nAll node types:')
  nodeTypes.records.forEach(record => {
    console.log(`- ${record.label}: ${record.count}`)
  })
  
  // Check parsed code nodes
  const codeNodes = await executeQuery(`
    MATCH (n)
    WHERE n:RepoFunction OR n:RepoClass OR n:RepoInterface
    RETURN labels(n)[0] as type, n.name as name, n.id as id, n.signature as signature
    ORDER BY n.id DESC
    LIMIT 10
  `)
  
  console.log('\nRecent code nodes:')
  codeNodes.records.forEach(record => {
    console.log(`- ${record.type}: ${record.name}`)
    if (record.signature) {
      console.log(`  Signature: ${record.signature}`)
    }
    console.log(`  ID: ${record.id}`)
  })
  
  // Check if test nodes were created
  const testNodes = await executeQuery(`
    MATCH (n)
    WHERE n.id STARTS WITH 'test-repo-001'
    RETURN labels(n)[0] as type, n.name as name, n.id as id
  `)
  
  if (testNodes.records.length > 0) {
    console.log('\n✅ Test nodes created:')
    testNodes.records.forEach(record => {
      console.log(`- ${record.type}: ${record.name} (${record.id})`)
    })
  }
}

async function main() {
  console.log('🚀 Testing Code Parsing Flow')
  console.log('============================')
  
  try {
    // Verify Neo4j connection
    await verifyConnectivity()
    
    // Step 1: Test parse-code function directly
    await testParseCodeFunction()
    
    // Step 2: Queue a test file
    await queueTestFile()
    
    // Step 3: Check queue
    await checkQueue()
    
    // Step 4: Process the queue
    await processQueue()
    
    // Wait a bit for processing
    console.log('\n⏳ Waiting 5 seconds...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Step 5: Check results
    await checkNeo4jData()
    
    console.log('\n✅ Test completed!')
    
  } catch (error) {
    console.error('Test failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)