#!/usr/bin/env tsx
import { config } from 'dotenv'
import { resolve } from 'path'
import { executeQuery, getDriver } from '../src/lib/neo4j/client'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

interface DetailedMemory {
  id: string
  chunk_id: string
  user_id: string
  team_id: string
  project_name: string
  content: string
  metadata: any
  created_at: string
}

async function inspectNeo4jData() {
  console.log('🔍 Inspecting Neo4j data...\n')

  const driver = getDriver()

  try {
    // 1. Count total memories
    console.log('📊 Total Memory Nodes:')
    const countResult = await executeQuery(`
      MATCH (m:Memory)
      RETURN count(m) as total
    `)
    console.log(`   Total: ${countResult.records[0].total}\n`)

    // 2. Check unique projects
    console.log('📁 Unique Projects:')
    const projectsResult = await executeQuery(`
      MATCH (m:Memory)
      WHERE m.project_name IS NOT NULL
      RETURN DISTINCT m.project_name as project, count(m) as count
      ORDER BY count DESC
    `)
    
    if (projectsResult.records.length === 0) {
      console.log('   ⚠️  No projects found!\n')
    } else {
      projectsResult.records.forEach((record: any) => {
        console.log(`   - ${record.project || 'null'}: ${record.count} memories`)
      })
      console.log()
    }

    // 3. Inspect first 5 memories in detail
    console.log('🔬 Detailed inspection of first 5 memories:')
    const detailResult = await executeQuery(`
      MATCH (m:Memory)
      RETURN m
      ORDER BY m.created_at DESC
      LIMIT 5
    `)

    detailResult.records.forEach((record: any, index: number) => {
      const memory = record.m
      console.log(`\n📝 Memory ${index + 1}:`)
      console.log(`   Raw memory object type: ${typeof memory}`)
      console.log(`   Raw memory keys: ${memory ? Object.keys(memory).join(', ') : 'null'}`)
      
      // Access properties correctly
      const props = memory?.properties
      console.log(`   ID: ${props?.id || 'MISSING'}`)
      console.log(`   Chunk ID: ${props?.chunk_id || 'MISSING'}`)
      console.log(`   User ID: ${props?.user_id || 'MISSING'}`)
      console.log(`   Team ID: ${props?.team_id || 'MISSING'}`)
      console.log(`   Project Name: ${props?.project_name || 'MISSING'}`)
      console.log(`   Created At: ${props?.created_at || 'MISSING'}`)
      console.log(`   Content: ${props?.content ? props.content.substring(0, 100) + '...' : 'MISSING'}`)
      console.log(`   Has Embedding: ${props?.embedding ? 'Yes' : 'NO - MISSING'}`)
      
      // Check metadata
      if (memory.metadata) {
        try {
          const metadata = typeof memory.metadata === 'string' 
            ? JSON.parse(memory.metadata) 
            : memory.metadata
          console.log(`   Metadata fields:`)
          console.log(`     - messageType: ${metadata.messageType || 'missing'}`)
          console.log(`     - conversationId: ${metadata.conversationId || 'missing'}`)
          console.log(`     - projectName: ${metadata.projectName || 'missing'}`)
          console.log(`     - filePaths: ${metadata.filePaths?.length || 0} files`)
          console.log(`     - topics: ${metadata.topics?.join(', ') || 'none'}`)
        } catch (e) {
          console.log(`   Metadata: Error parsing - ${e}`)
        }
      } else {
        console.log(`   Metadata: MISSING`)
      }
    })

    // 4. Check for memories with missing critical fields
    console.log('\n\n❌ Memories with missing critical fields:')
    
    const missingFieldsResult = await executeQuery(`
      MATCH (m:Memory)
      WHERE m.project_name IS NULL 
         OR m.content IS NULL 
         OR m.chunk_id IS NULL
         OR m.user_id IS NULL
      RETURN 
        m.id as id,
        m.chunk_id as chunk_id,
        m.project_name as project_name,
        m.content IS NOT NULL as has_content,
        m.user_id as user_id,
        m.created_at as created_at
      LIMIT 20
    `)

    if (missingFieldsResult.records.length === 0) {
      console.log('   ✅ All memories have required fields')
    } else {
      console.log(`   Found ${missingFieldsResult.records.length} memories with missing fields:`)
      missingFieldsResult.records.forEach((record: any) => {
        const issues = []
        if (!record.chunk_id) issues.push('chunk_id')
        if (!record.project_name) issues.push('project_name')
        if (!record.has_content) issues.push('content')
        if (!record.user_id) issues.push('user_id')
        
        console.log(`   - Memory ${record.id}: Missing ${issues.join(', ')}`)
      })
    }

    // 5. Check memory queue vs Neo4j sync status
    console.log('\n\n🔄 Checking sync status:')
    
    // Get a sample of chunk_ids from Neo4j
    const neo4jChunksResult = await executeQuery(`
      MATCH (m:Memory)
      WHERE m.chunk_id IS NOT NULL
      RETURN COLLECT(DISTINCT m.chunk_id)[0..10] as sample_chunks
    `)
    
    const sampleChunks = neo4jChunksResult.records[0]?.sample_chunks || []
    console.log(`   Sample chunk IDs from Neo4j: ${sampleChunks.slice(0, 3).join(', ')}...`)

    // 6. Check if embeddings are stored correctly
    console.log('\n\n🧮 Embedding Analysis:')
    const embeddingResult = await executeQuery(`
      MATCH (m:Memory)
      WHERE m.embedding IS NOT NULL
      RETURN 
        count(m) as with_embeddings,
        size(m.embedding) as embedding_size
      LIMIT 1
    `)
    
    if (embeddingResult.records.length > 0 && embeddingResult.records[0].with_embeddings > 0) {
      console.log(`   Memories with embeddings: ${embeddingResult.records[0].with_embeddings}`)
      console.log(`   Embedding dimension: ${embeddingResult.records[0].embedding_size}`)
    } else {
      console.log('   ⚠️  No memories have embeddings!')
    }

    // 7. Check Project nodes (if they exist)
    console.log('\n\n🏗️  Project Nodes:')
    const projectNodesResult = await executeQuery(`
      MATCH (p:Project)
      RETURN p.name as name, p.id as id
      ORDER BY p.name
    `)
    
    if (projectNodesResult.records.length === 0) {
      console.log('   No separate Project nodes found (might be normal)')
    } else {
      console.log(`   Found ${projectNodesResult.records.length} Project nodes:`)
      projectNodesResult.records.forEach((record: any) => {
        console.log(`   - ${record.name} (${record.id})`)
      })
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await driver.close()
    console.log('\n✅ Inspection complete')
  }
}

// Run the inspection
inspectNeo4jData().catch(console.error)