import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

async function analyzeIngestionBug() {
  console.log('=== ANALYZING THE INGESTION BUG ===\n')
  
  console.log('The bug is in ingest-code-to-neo4j/index.ts\n')
  
  console.log('PROBLEM IDENTIFIED:')
  console.log('1. Supabase has 109 unique code entities with unique IDs')
  console.log('2. Neo4j has only 1 CodeEntity node')
  console.log('3. The Neo4j node has ID: c58846a3-da47-42e1-a206-cd2a9cdd5b44')
  console.log('4. This ID does NOT exist in Supabase\n')
  
  console.log('HYPOTHESIS:')
  console.log('The entity.id is undefined or null when passed to Neo4j MERGE')
  console.log('Neo4j then generates or uses a default ID for all entities\n')
  
  console.log('LOOKING AT THE CODE:')
  console.log('In ingest-code-to-neo4j/index.ts, line 210:')
  console.log('  id: entity.id,')
  console.log('')
  console.log('But the worker passes codeEntity (from Supabase) in line 141:')
  console.log('  code_entities: [codeEntity],')
  console.log('')
  console.log('The issue might be that codeEntity uses a different property name!')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Let's check the actual structure of a code entity
  const { data: sampleEntity } = await supabase
    .from('code_entities')
    .select('*')
    .eq('project_name', 'camille')
    .limit(1)
    .single()
    
  if (sampleEntity) {
    console.log('\n=== ACTUAL CODE ENTITY STRUCTURE ===')
    console.log('Keys:', Object.keys(sampleEntity))
    console.log('\nThe entity has these ID-related fields:')
    console.log(`- id: ${sampleEntity.id}`)
    console.log(`- user_id: ${sampleEntity.user_id}`)
    console.log(`- team_id: ${sampleEntity.team_id}`)
  }
  
  console.log('\n=== THE BUG ===')
  console.log('The code expects entity.id but the actual data structure might be different!')
  console.log('Or the entity object is not being passed correctly through the chain.')
  console.log('\nNeed to check what data structure is actually being passed to ingest-code-to-neo4j')
}

analyzeIngestionBug().catch(console.error)