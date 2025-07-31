import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

async function checkCodeEntityIds() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('=== CHECKING CODE ENTITIES IN SUPABASE ===\n')

  // Check for duplicate IDs
  const { data: duplicates, error: dupError } = await supabase
    .from('code_entities')
    .select('id, file_path, name, project_name, created_at')
    .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    .eq('project_name', 'camille')
    .order('created_at', { ascending: false })
    .limit(20)

  if (dupError) {
    console.error('Error checking duplicates:', dupError)
    return
  }

  console.log(`Found ${duplicates?.length || 0} code entities in Supabase\n`)

  // Count unique IDs
  const uniqueIds = new Set(duplicates?.map(d => d.id))
  console.log(`Unique IDs: ${uniqueIds.size}`)
  
  if (uniqueIds.size === 1) {
    console.log(`\n⚠️  ALL CODE ENTITIES HAVE THE SAME ID: ${Array.from(uniqueIds)[0]}`)
    console.log('This is why they all merged into one Neo4j node!')
  }

  console.log('\nFirst 10 code entities:')
  duplicates?.slice(0, 10).forEach((entity, i) => {
    console.log(`${i + 1}. ID: ${entity.id}`)
    console.log(`   Path: ${entity.file_path}`)
    console.log(`   Name: ${entity.name}`)
    console.log(`   Created: ${entity.created_at}`)
    console.log('')
  })

  // Check total count
  const { count } = await supabase
    .from('code_entities')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    .eq('project_name', 'camille')

  console.log(`\nTotal code entities for camille project: ${count}`)
}

checkCodeEntityIds().catch(console.error)