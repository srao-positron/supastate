#!/usr/bin/env npx tsx

/**
 * Test the complete ingestion pipeline
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testIngestionPipeline() {
  console.log('=== Testing Ingestion Pipeline ===\n')

  // Use a real user ID from the existing data
  const testUserId = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
  
  // Create a test memory
  const testMemory = {
    user_id: testUserId,
    content: 'Test Memory - Pipeline Check: This is a test memory to verify the ingestion pipeline is working correctly.',
    type: 'general',
    project_name: 'test-project',
    chunk_id: `test-chunk-${Date.now()}`,
    metadata: {
      test: true,
      timestamp: Date.now()
    }
  }

  console.log('1. Creating test memory in Supabase...')
  const { data: memory, error: memoryError } = await supabase
    .from('memories')
    .insert(testMemory)
    .select()
    .single()

  if (memoryError) {
    console.error('Error creating memory:', memoryError)
    return
  }

  console.log(`   Created memory: ${memory.id}`)

  // Create a test code entity
  const testCode = {
    user_id: testUserId,
    file_path: 'test/pipeline-check.ts',
    name: 'pipeline-check.ts',
    entity_type: 'module',
    language: 'typescript',
    source_code: `// Test file for pipeline check
export function testFunction() {
  console.log('Hello from test');
}`,
    project_name: 'test-project',
    metadata: {
      test: true,
      timestamp: Date.now()
    }
  }

  console.log('\n2. Creating test code entity in Supabase...')
  const { data: codeEntity, error: codeError } = await supabase
    .from('code_entities')
    .insert(testCode)
    .select()
    .single()

  if (codeError) {
    console.error('Error creating code entity:', codeError)
    return
  }

  console.log(`   Created code entity: ${codeEntity.id}`)

  // Trigger the ingestion workers directly
  console.log('\n3. Triggering ingestion workers...')
  
  // Trigger memory ingestion
  console.log('   Invoking memory-ingestion-coordinator...')
  const { error: memoryWorkerError } = await supabase.functions.invoke('memory-ingestion-coordinator')
  if (memoryWorkerError) {
    console.error('   Error:', memoryWorkerError)
  } else {
    console.log('   Success!')
  }

  // Trigger code ingestion
  console.log('   Invoking code-ingestion-coordinator...')
  const { error: codeWorkerError } = await supabase.functions.invoke('code-ingestion-coordinator')
  if (codeWorkerError) {
    console.error('   Error:', codeWorkerError)
  } else {
    console.log('   Success!')
  }

  // Wait a bit for processing
  console.log('\n4. Waiting 5 seconds for processing...')
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Check Neo4j for the data
  console.log('\n5. Checking Neo4j for ingested data...')
  
  // We'll use a separate script to check Neo4j
  console.log('   Run: npx tsx scripts/check-neo4j-test-data.ts')
  
  // Cleanup
  console.log('\n6. Cleaning up test data...')
  
  await supabase
    .from('memories')
    .delete()
    .eq('id', memory.id)
  
  await supabase
    .from('code_entities')
    .delete()
    .eq('id', codeEntity.id)
    
  console.log('   Cleanup complete!')
  
  console.log('\n\n=== Summary ===')
  console.log('Test memory created:', memory.id)
  console.log('Test code entity created:', codeEntity.id)
  console.log('\nCheck the Supabase dashboard for edge function logs:')
  console.log('https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/logs/edge-functions')
}

testIngestionPipeline().catch(console.error)