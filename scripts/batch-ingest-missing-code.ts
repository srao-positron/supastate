import { createClient } from '@supabase/supabase-js'
import neo4j from 'neo4j-driver'
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

// Initialize Neo4j driver
const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function batchIngestMissingCode() {
  console.log('🔍 Finding code entities missing from Neo4j...\n')

  try {
    // Query ALL code entities from Supabase (not just recent)
    const { data: codeEntities, error } = await supabase
      .from('code_entities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100) // Process up to 100 at a time

    if (error) {
      console.error('Error querying code_entities:', error)
      return
    }

    if (!codeEntities || codeEntities.length === 0) {
      console.log('No code entities found in Supabase.')
      return
    }

    console.log(`Found ${codeEntities.length} code entities in Supabase\n`)

    // Check which ones are missing from Neo4j
    const session = driver.session()
    const missingEntities = []

    for (const entity of codeEntities) {
      const result = await session.run(
        `MATCH (ce:CodeEntity {id: $entityId}) RETURN ce`,
        { entityId: entity.id }
      )

      if (result.records.length === 0) {
        missingEntities.push(entity)
      }
    }

    await session.close()

    console.log(`📊 Summary:`)
    console.log(`   Total entities: ${codeEntities.length}`)
    console.log(`   In Neo4j: ${codeEntities.length - missingEntities.length}`)
    console.log(`   Missing: ${missingEntities.length}\n`)

    if (missingEntities.length === 0) {
      console.log('✅ All code entities are already in Neo4j!')
      return
    }

    console.log(`🚀 Ingesting ${missingEntities.length} missing entities...\n`)

    // Group by user/workspace for batch processing
    const batches = new Map<string, typeof missingEntities>()
    
    for (const entity of missingEntities) {
      const key = entity.workspace_id || `user:${entity.user_id}`
      if (!batches.has(key)) {
        batches.set(key, [])
      }
      batches.get(key)!.push(entity)
    }

    console.log(`📦 Processing ${batches.size} batches...\n`)

    let totalProcessed = 0
    let totalErrors = 0

    for (const [key, entities] of batches) {
      const isUserKey = key.startsWith('user:')
      const userId = isUserKey ? key.substring(5) : entities[0].user_id
      const workspaceId = isUserKey ? null : key

      console.log(`Processing batch: ${key} (${entities.length} entities)`)

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-code-to-neo4j`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code_entities: entities,
              user_id: userId,
              workspace_id: workspaceId,
            })
          }
        )

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`❌ Batch failed: ${errorText}`)
          totalErrors += entities.length
        } else {
          const result = await response.json()
          console.log(`✅ Batch complete: ${result.processed} processed, ${result.errors} errors`)
          totalProcessed += result.processed
          totalErrors += result.errors || 0
        }
      } catch (error) {
        console.error(`❌ Batch error:`, error)
        totalErrors += entities.length
      }

      // Add a small delay between batches to avoid overwhelming the edge function
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 Final Summary:')
    console.log(`   Total processed: ${totalProcessed}`)
    console.log(`   Total errors: ${totalErrors}`)
    console.log(`   Success rate: ${((totalProcessed / missingEntities.length) * 100).toFixed(1)}%`)

    // Verify the results
    console.log('\n🔍 Verifying ingestion...')
    const verifySession = driver.session()
    let verifiedCount = 0

    for (const entity of missingEntities) {
      const result = await verifySession.run(
        `MATCH (ce:CodeEntity {id: $entityId}) RETURN ce`,
        { entityId: entity.id }
      )
      if (result.records.length > 0) {
        verifiedCount++
      }
    }

    await verifySession.close()
    console.log(`✅ Verified ${verifiedCount} entities now exist in Neo4j`)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await driver.close()
  }
}

// Run the batch ingestion
batchIngestMissingCode()