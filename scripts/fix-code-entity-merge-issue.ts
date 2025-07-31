import { config } from 'dotenv'
import neo4j from 'neo4j-driver'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

async function fixCodeEntityMergeIssue() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  )
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const session = driver.session()
    
    console.log('=== FIXING CODE ENTITY MERGE ISSUE ===\n')
    
    // Step 1: Identify the problematic node
    console.log('Step 1: Finding the merged CodeEntity node...')
    const findResult = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.id = 'c58846a3-da47-42e1-a206-cd2a9cdd5b44'
      RETURN c
    `)
    
    if (findResult.records.length > 0) {
      console.log('✓ Found the problematic merged node')
      
      // Step 2: Delete the merged node and its relationships
      console.log('\nStep 2: Deleting the merged node and its relationships...')
      await session.run(`
        MATCH (c:CodeEntity {id: 'c58846a3-da47-42e1-a206-cd2a9cdd5b44'})
        DETACH DELETE c
      `)
      console.log('✓ Deleted the merged node')
      
      // Also delete any orphaned EntitySummary nodes
      console.log('\nStep 3: Cleaning up orphaned EntitySummary nodes...')
      const cleanupResult = await session.run(`
        MATCH (s:EntitySummary)
        WHERE s.entity_type = 'code' 
          AND NOT EXISTS((s)-[:SUMMARIZES]->(:CodeEntity))
        DELETE s
        RETURN COUNT(s) as deleted
      `)
      const deletedCount = cleanupResult.records[0]?.get('deleted').toNumber() || 0
      console.log(`✓ Deleted ${deletedCount} orphaned EntitySummary nodes`)
    } else {
      console.log('✗ No problematic node found (may have been already deleted)')
    }
    
    // Step 4: Verify the fix was applied
    console.log('\nStep 4: Verifying the fix in the edge function...')
    console.log('The MERGE statement has been updated to only use ID:')
    console.log('  MERGE (c:CodeEntity { id: $id })')
    console.log('Instead of:')
    console.log('  MERGE (c:CodeEntity { id: $id, workspace_id: $workspace_id })')
    
    // Step 5: Check how many code entities need re-ingestion
    console.log('\nStep 5: Checking code entities in Supabase...')
    const { count } = await supabase
      .from('code_entities')
      .select('*', { count: 'exact', head: true })
      .eq('project_name', 'camille')
      .eq('user_id', 'a02c3fed-3a24-442f-becc-97bac8b75e90')
    
    console.log(`Found ${count} code entities that need to be re-ingested`)
    
    // Step 6: Instructions for re-ingestion
    console.log('\n=== NEXT STEPS ===')
    console.log('1. Deploy the updated ingest-code-to-neo4j function:')
    console.log('   npx supabase functions deploy ingest-code-to-neo4j')
    console.log('\n2. Re-queue the code entities for ingestion:')
    console.log('   - Option A: Re-upload the code through the UI')
    console.log('   - Option B: Create a script to re-queue existing entities')
    console.log('\n3. Monitor the ingestion to ensure unique nodes are created')
    
    await session.close()
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await driver.close()
  }
}

fixCodeEntityMergeIssue().catch(console.error)