#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

dotenv.config({ path: '.env.local' })

const TEST_REPO_PATH = join(process.env.HOME!, '.camille', 'watched', 'supastate-test-repo')
const REPO_NAME = 'local/supastate-test-repo'
const USER_ID = 'a02c3fed-3a24-442f-becc-97bac8b75e90'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function createTestRepoEntities() {
  console.log('📦 Creating code entities for test repository...\n')
  
  const files = [
    { name: 'user-service.ts', language: 'typescript' },
    { name: 'data_processor.py', language: 'python' },
    { name: 'TodoList.tsx', language: 'typescript' },
    { name: 'feature-code.ts', language: 'typescript' }
  ]
  
  const createdEntities = []
  
  for (const file of files) {
    try {
      console.log(`Processing ${file.name}...`)
      
      const filePath = join(TEST_REPO_PATH, file.name)
      const content = await readFile(filePath, 'utf-8')
      
      // Create code entity in Supabase
      const entity = {
        id: randomUUID(),
        name: file.name,
        file_path: `${REPO_NAME}/${file.name}`,
        entity_type: 'module', // Always use 'module' to match constraint
        language: file.language,
        source_code: content,
        user_id: USER_ID,
        project_name: REPO_NAME,
        metadata: {
          project_name: REPO_NAME,
          repository: REPO_NAME,
          branch: 'feature/async-parsing-test',
          test_repo: true
        }
      }
      
      const { data, error } = await supabase
        .from('code_entities')
        .insert(entity)
        .select()
        .single()
      
      if (error) {
        console.error(`  ❌ Error creating entity: ${error.message}`)
      } else {
        console.log(`  ✅ Created entity: ${data.id}`)
        createdEntities.push(data)
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${file.name}:`, error)
    }
  }
  
  if (createdEntities.length > 0) {
    console.log(`\n✅ Created ${createdEntities.length} code entities`)
    
    // Now ingest them into Neo4j
    console.log('\n🚀 Ingesting entities into Neo4j...')
    
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-code-to-neo4j`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code_entities: createdEntities.map(entity => ({
            id: entity.id,
            name: entity.name,
            file_path: entity.file_path,
            path: entity.file_path,
            entity_type: entity.entity_type,
            language: entity.language,
            source_code: entity.source_code,
            project_name: REPO_NAME,
            created_at: entity.created_at,
            updated_at: entity.updated_at,
            metadata: entity.metadata,
            repository: REPO_NAME
          })),
          user_id: USER_ID
        })
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Ingestion error: ${response.status} - ${errorText}`)
    } else {
      const result = await response.json()
      console.log('✅ Ingestion completed!')
      console.log(`Processed: ${result.processed} entities`)
      
      if (result.errors && result.errors.length > 0) {
        console.log('\nErrors:')
        result.errors.forEach((err: any) => console.log(`  - ${err}`))
      }
    }
  }
  
  console.log('\n✅ Test repository setup completed!')
  console.log('Next: Run npx tsx scripts/check-test-repo-entities.ts to verify entities in Neo4j')
}

createTestRepoEntities()