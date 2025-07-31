import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

async function findMergedEntity() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const targetId = 'c58846a3-da47-42e1-a206-cd2a9cdd5b44'
  
  console.log(`=== SEARCHING FOR ENTITY WITH ID: ${targetId} ===\n`)

  const { data, error } = await supabase
    .from('code_entities')
    .select('*')
    .eq('id', targetId)
    .single()

  if (error) {
    console.error('Error finding entity:', error)
    
    // Try searching by name
    console.log('\nSearching by filename SUBSTACK_POST.md...')
    const { data: byName, error: nameError } = await supabase
      .from('code_entities')
      .select('id, file_path, name, project_name, created_at')
      .eq('name', 'SUBSTACK_POST.md')
      .eq('project_name', 'camille')

    if (!nameError && byName) {
      console.log(`Found ${byName.length} entities with name SUBSTACK_POST.md:`)
      byName.forEach(entity => {
        console.log(`\nID: ${entity.id}`)
        console.log(`Path: ${entity.file_path}`)
        console.log(`Created: ${entity.created_at}`)
      })
    }
  } else if (data) {
    console.log('Found entity in Supabase:')
    console.log('ID:', data.id)
    console.log('Path:', data.file_path)
    console.log('Name:', data.name)
    console.log('Project:', data.project_name)
    console.log('Created:', data.created_at)
    console.log('Updated:', data.updated_at)
  } else {
    console.log('Entity not found in Supabase!')
    console.log('This ID exists in Neo4j but not in Supabase.')
    console.log('\nThis suggests the ID was generated during Neo4j ingestion, not from Supabase.')
  }
}

findMergedEntity().catch(console.error)