import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../.env.local') })

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function queueCodeEntityForIngestion(entityId: string) {
  console.log(`📦 Queueing code entity ${entityId} for ingestion...\n`)

  try {
    // First, get the entity details from Supabase
    const { data: entity, error: fetchError } = await supabase
      .from('code_entities')
      .select('*')
      .eq('id', entityId)
      .single()

    if (fetchError || !entity) {
      console.error('Error fetching entity:', fetchError)
      return
    }

    console.log('Entity details:')
    console.log(`  Name: ${entity.name}`)
    console.log(`  Type: ${entity.type}`)
    console.log(`  File Path: ${entity.file_path}`)
    console.log(`  User ID: ${entity.user_id}`)
    console.log(`  Workspace ID: ${entity.workspace_id || 'NULL'}\n`)

    // Call the edge function to ingest into Neo4j
    console.log('🚀 Calling ingest-code-to-neo4j edge function...')
    
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-code-to-neo4j`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code_entities: [entity], // Pass the full entity object in an array
          user_id: entity.user_id,
          workspace_id: entity.workspace_id,
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Edge function error:', errorText)
      return
    }

    const result = await response.json()
    console.log('✅ Edge function response:', JSON.stringify(result, null, 2))

    // Also queue through pgmq if needed
    console.log('\n🔄 Queueing through pgmq as backup...')
    
    const { data: queueResult, error: queueError } = await supabase.rpc('pgmq_send', {
      queue_name: 'code_ingestion',
      message: {
        entity_id: entityId,
        user_id: entity.user_id,
        workspace_id: entity.workspace_id,
        timestamp: new Date().toISOString(),
        source: 'manual_queue'
      }
    })

    if (queueError) {
      console.error('❌ Queue error:', queueError)
    } else {
      console.log('✅ Queued successfully with message ID:', queueResult)
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

// Get entity ID from command line or use the one we found
const entityId = process.argv[2] || '20563ea6-5c61-4189-8fb7-e0a26fa09055'

console.log(`🎯 Processing entity: ${entityId}\n`)
queueCodeEntityForIngestion(entityId)