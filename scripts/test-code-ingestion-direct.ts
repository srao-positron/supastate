#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqlfxakbkwssxfynrmnk.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxbGZ4YWtia3dzc3hmeW5ybW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzEyNDMxMiwiZXhwIjoyMDY4NzAwMzEyfQ.Dvvga6Y4vu7xtorjzgQ3B4kjoJYvISQcnOEAIuoFSOU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=== Testing Code Ingestion Direct ===\n')
  
  // 1. Get a recent code entity from Supabase
  const { data: codeEntity } = await supabase
    .from('code_entities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  if (!codeEntity) {
    console.log('No code entities found in Supabase')
    return
  }
  
  console.log('Found code entity:')
  console.log(`  ID: ${codeEntity.id}`)
  console.log(`  Path: ${codeEntity.path}`)
  console.log(`  Name: ${codeEntity.name}`)
  console.log(`  Created: ${codeEntity.created_at}`)
  
  // 2. Try to call the ingest-code-to-neo4j function directly
  console.log('\nCalling ingest-code-to-neo4j function...')
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ingest-code-to-neo4j`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code_entities: [{
          id: codeEntity.id,
          name: codeEntity.name,
          file_path: codeEntity.path,
          path: codeEntity.path,
          entity_type: codeEntity.type || 'module',
          language: codeEntity.language,
          source_code: codeEntity.content,
          project_name: codeEntity.metadata?.project_name || 'unknown',
          created_at: codeEntity.created_at,
          updated_at: codeEntity.updated_at,
          metadata: codeEntity.metadata
        }],
        user_id: codeEntity.user_id,
        workspace_id: codeEntity.workspace_id || `user:${codeEntity.user_id}`
      })
    })
    
    console.log(`Response status: ${response.status} ${response.statusText}`)
    
    const responseText = await response.text()
    console.log('Response body:', responseText)
    
    if (response.ok) {
      const result = JSON.parse(responseText)
      console.log('\nSuccess! Processed:', result.processed, 'entities')
      
      // 3. Check if it made it to Neo4j
      console.log('\nChecking Neo4j...')
      const { data: logs } = await supabase
        .from('pattern_processor_logs')
        .select('*')
        .like('message', '%Created CodeEntity node%')
        .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (logs && logs.length > 0) {
        console.log('Found Neo4j creation logs:')
        for (const log of logs) {
          console.log(`  ${log.message}`)
        }
      }
    } else {
      console.log('\nError response:', responseText)
    }
    
  } catch (error) {
    console.error('Error calling function:', error)
  }
}

main().catch(console.error)