import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

async function debugEntityIdIssue() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('=== DEBUGGING ENTITY ID ISSUE ===\n')
  
  // Get some code entities to test
  const { data: entities } = await supabase
    .from('code_entities')
    .select('id, name, file_path')
    .eq('project_name', 'camille')
    .limit(5)
  
  if (!entities || entities.length === 0) {
    console.error('No entities found')
    return
  }
  
  console.log('Sample entities from Supabase:')
  entities.forEach((e, i) => {
    console.log(`${i + 1}. ID: ${e.id}, Name: ${e.name}`)
  })
  
  console.log('\n=== ANALYZING THE BUG ===')
  console.log('\nThe issue appears to be that when the code-ingestion-worker')
  console.log('calls ingest-code-to-neo4j, something happens to the entity IDs.')
  console.log('\nPossible causes:')
  console.log('1. The entity.id field is being overwritten')
  console.log('2. All entities are being assigned the same ID')
  console.log('3. The MERGE operation is matching on something other than ID')
  
  console.log('\n=== LOOKING AT THE MERGE STATEMENT ===')
  console.log('MERGE (c:CodeEntity {')
  console.log('  id: $id,')
  console.log('  workspace_id: $workspace_id')
  console.log('})')
  console.log('\nThis MERGE uses BOTH id AND workspace_id as the key.')
  console.log('If all entities have the same workspace_id and something')
  console.log('causes them to have the same ID, they will all merge.')
  
  console.log('\n=== THE SMOKING GUN ===')
  console.log('The ID c58846a3-da47-42e1-a206-cd2a9cdd5b44 does not exist in Supabase.')
  console.log('This means it was generated during the Neo4j ingestion process.')
  console.log('\nThe most likely cause is that entity.id is undefined or null,')
  console.log('and Neo4j is generating a default ID that gets reused.')
  
  console.log('\n=== SOLUTION ===')
  console.log('We need to add logging to ingest-code-to-neo4j to see what')
  console.log('entity.id values are being passed to the MERGE statement.')
}

debugEntityIdIssue().catch(console.error)