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

async function ingestMissingCodeEntities() {
  console.log('🔍 Finding code entities missing from Neo4j...\n')

  try {
    // Query ALL code entities from Supabase (remove time filter)
    const { data: codeEntities, error } = await supabase
      .from('code_entities')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error querying code_entities:', error)
      return
    }

    if (!codeEntities || codeEntities.length === 0) {
      console.log('No code entities found in Supabase.')
      return
    }

    console.log(`Found ${codeEntities.length} total code entities in Supabase\n`)

    // Check which ones are missing from Neo4j
    const session = driver.session()
    const missingEntities = []
    const existingCount = { withSummary: 0, withoutSummary: 0 }

    for (const entity of codeEntities) {
      const result = await session.run(
        `
        MATCH (ce:CodeEntity {id: $entityId})
        OPTIONAL MATCH (ce)-[:HAS_SUMMARY]->(es:EntitySummary)
        RETURN ce, es
        `,
        { entityId: entity.id }
      )

      if (result.records.length === 0) {
        missingEntities.push(entity)
      } else {
        const hasSummary = result.records[0].get('es') !== null
        if (hasSummary) {
          existingCount.withSummary++
        } else {
          existingCount.withoutSummary++
        }
      }
    }

    await session.close()

    console.log(`📊 Summary:`)
    console.log(`   Total entities in Supabase: ${codeEntities.length}`)
    console.log(`   In Neo4j with EntitySummary: ${existingCount.withSummary}`)
    console.log(`   In Neo4j without EntitySummary: ${existingCount.withoutSummary}`)
    console.log(`   Missing from Neo4j: ${missingEntities.length}\n`)

    if (missingEntities.length === 0) {
      console.log('✅ All code entities are already in Neo4j!')
      
      // Check if we need to create EntitySummaries for existing entities
      if (existingCount.withoutSummary > 0) {
        console.log(`\n⚠️  ${existingCount.withoutSummary} entities need EntitySummaries created`)
        console.log('Consider running create-entity-summaries for these entities.')
      }
      return
    }

    console.log(`🚀 Ingesting ${missingEntities.length} missing entities...\n`)

    // Show sample of missing entities
    console.log('Sample of missing entities:')
    missingEntities.slice(0, 5).forEach(entity => {
      console.log(`  - ${entity.name} (${entity.file_path || 'no path'})`)
    })
    if (missingEntities.length > 5) {
      console.log(`  ... and ${missingEntities.length - 5} more\n`)
    }

    // Group by user/workspace for batch processing
    const batches = new Map<string, typeof missingEntities>()
    
    for (const entity of missingEntities) {
      const key = entity.workspace_id || `user:${entity.user_id}`
      if (!batches.has(key)) {
        batches.set(key, [])
      }
      batches.get(key)!.push(entity)
    }

    console.log(`\n📦 Processing ${batches.size} batches...`)
    console.log(`(Batched by workspace/user for efficient processing)\n`)

    let totalProcessed = 0
    let totalErrors = 0
    const batchSize = 10 // Process 10 entities at a time

    for (const [key, entities] of batches) {
      const isUserKey = key.startsWith('user:')
      const userId = isUserKey ? key.substring(5) : entities[0].user_id
      const workspaceId = isUserKey ? undefined : key

      console.log(`\nProcessing batch: ${key} (${entities.length} entities)`)
      
      // Process in smaller chunks
      for (let i = 0; i < entities.length; i += batchSize) {
        const chunk = entities.slice(i, i + batchSize)
        console.log(`  - Processing entities ${i + 1}-${Math.min(i + batchSize, entities.length)}...`)

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
                code_entities: chunk,
                user_id: userId,
                workspace_id: workspaceId,
              })
            }
          )

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`    ❌ Chunk failed: ${errorText}`)
            totalErrors += chunk.length
          } else {
            const result = await response.json()
            console.log(`    ✅ Chunk complete: ${result.processed} processed, ${result.errors} errors`)
            totalProcessed += result.processed || 0
            totalErrors += result.errors || 0
          }
        } catch (error) {
          console.error(`    ❌ Chunk error:`, error)
          totalErrors += chunk.length
        }

        // Add a small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 500))
      }
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
    let summaryCount = 0

    for (const entity of missingEntities) {
      const result = await verifySession.run(
        `
        MATCH (ce:CodeEntity {id: $entityId})
        OPTIONAL MATCH (ce)-[:HAS_SUMMARY]->(es:EntitySummary)
        RETURN ce, es
        `,
        { entityId: entity.id }
      )
      if (result.records.length > 0) {
        verifiedCount++
        if (result.records[0].get('es')) {
          summaryCount++
        }
      }
    }

    await verifySession.close()
    console.log(`✅ Verified ${verifiedCount} entities now exist in Neo4j`)
    console.log(`✅ ${summaryCount} entities have EntitySummaries`)

    if (verifiedCount < missingEntities.length) {
      console.log(`\n⚠️  ${missingEntities.length - verifiedCount} entities still missing`)
      console.log('You may need to check the error logs or re-run for failed entities.')
    }

    // Trigger EntitySummary creation if needed
    if (verifiedCount > summaryCount) {
      console.log(`\n🔄 Triggering EntitySummary creation for ${verifiedCount - summaryCount} entities...`)
      
      for (const [key, entities] of batches) {
        const isUserKey = key.startsWith('user:')
        const userId = isUserKey ? key.substring(5) : undefined
        const workspaceId = isUserKey ? undefined : key

        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-entity-summaries`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                workspace_id: workspaceId,
                user_id: userId,
                entity_type: 'code',
                limit: 100
              })
            }
          )

          if (response.ok) {
            const result = await response.json()
            console.log(`✅ Created summaries for workspace ${key}: ${result.processed} entities`)
          }
        } catch (error) {
          console.error(`❌ Error creating summaries for ${key}:`, error)
        }
      }
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await driver.close()
  }
}

// Run the ingestion
console.log('🚀 Starting missing code entity ingestion...')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
ingestMissingCodeEntities()