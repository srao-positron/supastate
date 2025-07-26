#!/usr/bin/env tsx
// Script to migrate existing memories from Supabase to Neo4j
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { neo4jService } from '../src/lib/neo4j/service'
import { ingestionService } from '../src/lib/neo4j/ingestion'
import { codeAnalysisService } from '../src/lib/neo4j/code-analysis'
import { relationshipInferenceEngine } from '../src/lib/neo4j/relationship-inference'
import { closeDriver } from '../src/lib/neo4j/client'
import * as fs from 'fs/promises'
import * as path from 'path'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface MigrationStats {
  totalMemories: number
  migratedMemories: number
  failedMemories: number
  totalProjects: number
  analyzedCodeFiles: number
  inferredRelationships: number
  errors: Array<{ id: string; error: string }>
}

async function migrateToNeo4j() {
  const stats: MigrationStats = {
    totalMemories: 0,
    migratedMemories: 0,
    failedMemories: 0,
    totalProjects: 0,
    analyzedCodeFiles: 0,
    inferredRelationships: 0,
    errors: []
  }

  try {
    console.log('🚀 Starting migration from Supabase to Neo4j...\n')
    
    // Initialize Neo4j
    await neo4jService.initialize()
    console.log('✅ Neo4j connection established\n')

    // Step 1: Count total memories
    const { count } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
    
    stats.totalMemories = count || 0
    
    // Apply limit if specified
    const limitNum = limit ? parseInt(limit) : stats.totalMemories
    const memoriesToMigrate = Math.min(limitNum, stats.totalMemories)
    
    console.log(`📊 Found ${stats.totalMemories} memories total`)
    console.log(`📊 Will migrate ${memoriesToMigrate} memories\n`)

    // Step 2: Get unique projects
    const { data: projects } = await supabase
      .from('memories')
      .select('project_name')
      .not('project_name', 'is', null)
      .order('project_name')
    
    const uniqueProjects = [...new Set(projects?.map(p => p.project_name) || [])]
    stats.totalProjects = uniqueProjects.length
    console.log(`📁 Found ${stats.totalProjects} unique projects\n`)

    // Step 3: Migrate memories in batches
    console.log('💾 Migrating memories...')
    const batchSize = 100
    let offset = 0
    
    while (offset < memoriesToMigrate) {
      const { data: memories, error } = await supabase
        .from('memories')
        .select('*')
        .order('created_at')
        .range(offset, offset + batchSize - 1)
      
      if (error) {
        console.error(`❌ Error fetching batch at offset ${offset}:`, error)
        break
      }
      
      if (!memories || memories.length === 0) break
      
      // Process each memory
      for (const memory of memories) {
        try {
          // Parse embedding if it's a string
          let embedding: number[]
          if (typeof memory.embedding === 'string') {
            try {
              embedding = JSON.parse(memory.embedding)
              if (!Array.isArray(embedding) || embedding.length !== 3072) {
                console.warn(`⚠️  Skipping memory ${memory.id} - invalid embedding format`)
                stats.failedMemories++
                continue
              }
            } catch (e) {
              console.warn(`⚠️  Skipping memory ${memory.id} - failed to parse embedding`)
              stats.failedMemories++
              continue
            }
          } else if (Array.isArray(memory.embedding) && memory.embedding.length === 3072) {
            embedding = memory.embedding
          } else {
            console.warn(`⚠️  Skipping memory ${memory.id} - invalid embedding`)
            stats.failedMemories++
            continue
          }

          await ingestionService.ingestMemoryWithEmbedding({
            id: memory.id,
            content: memory.content,
            embedding: embedding,
            project_name: memory.project_name || 'unknown',
            user_id: memory.user_id,
            team_id: memory.team_id,
            type: memory.metadata?.messageType || 'general',
            metadata: memory.metadata || {},
            chunk_id: memory.chunk_id,
            session_id: memory.metadata?.sessionId,
            file_paths: memory.metadata?.filePaths,
            topics: memory.metadata?.topics,
            entities_mentioned: memory.metadata?.entitiesMentioned,
            tools_used: memory.metadata?.toolsUsed,
            created_at: memory.created_at, // Pass the original timestamp
            occurred_at: memory.metadata?.timestamp || memory.created_at // Use transcript timestamp if available
          }, {
            useInferenceEngine: false // We'll run inference in batch later
          })
          
          stats.migratedMemories++
          
          if (stats.migratedMemories % 50 === 0) {
            console.log(`  Progress: ${stats.migratedMemories}/${stats.totalMemories} memories migrated`)
          }
        } catch (error) {
          console.error(`❌ Failed to migrate memory ${memory.id}:`, error)
          stats.failedMemories++
          stats.errors.push({ 
            id: memory.id, 
            error: error instanceof Error ? error.message : String(error) 
          })
        }
      }
      
      offset += batchSize
    }
    
    console.log(`\n✅ Memory migration complete: ${stats.migratedMemories} migrated, ${stats.failedMemories} failed\n`)

    // Step 4: Analyze codebase for each project
    console.log('🔍 Analyzing codebases...')
    for (const projectName of uniqueProjects) {
      console.log(`\n  Analyzing project: ${projectName}`)
      
      // Try to find the project directory
      const possiblePaths = [
        path.join(process.cwd(), '..', projectName),
        path.join(process.cwd(), projectName),
        '/Users/srao/' + projectName // Adjust based on your setup
      ]
      
      let projectPath: string | null = null
      for (const testPath of possiblePaths) {
        try {
          await fs.access(testPath)
          projectPath = testPath
          break
        } catch {
          // Path doesn't exist, try next
        }
      }
      
      if (projectPath) {
        try {
          await codeAnalysisService.analyzeProject(projectPath, projectName)
          console.log(`  ✅ Code analysis complete for ${projectName}`)
          stats.analyzedCodeFiles++
        } catch (error) {
          console.error(`  ❌ Failed to analyze ${projectName}:`, error)
        }
      } else {
        console.log(`  ⚠️  Project directory not found for ${projectName}`)
      }
    }

    // Step 5: Run relationship inference
    console.log('\n🔗 Inferring relationships...')
    
    // Get all migrated memory IDs
    const memoryIds = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      RETURN m.id as id
      LIMIT 1000
    `)
    
    const ids = memoryIds.records.map((r: any) => r.id)
    console.log(`  Processing ${ids.length} memories for relationship inference...`)
    
    const inferenceResult = await relationshipInferenceEngine.batchInferRelationships(ids, {
      includeCodeConnections: true,
      includeEvolution: true
    })
    
    stats.inferredRelationships = inferenceResult.totalCreated
    console.log(`  ✅ Created ${stats.inferredRelationships} relationships\n`)

    // Step 6: Generate summary
    console.log('📊 Migration Summary:')
    console.log('=====================')
    console.log(`Total memories in Supabase: ${stats.totalMemories}`)
    console.log(`Successfully migrated: ${stats.migratedMemories}`)
    console.log(`Failed migrations: ${stats.failedMemories}`)
    console.log(`Projects found: ${stats.totalProjects}`)
    console.log(`Code files analyzed: ${stats.analyzedCodeFiles}`)
    console.log(`Relationships inferred: ${stats.inferredRelationships}`)
    
    if (stats.errors.length > 0) {
      console.log('\n❌ Errors:')
      stats.errors.slice(0, 10).forEach(err => {
        console.log(`  - Memory ${err.id}: ${err.error}`)
      })
      if (stats.errors.length > 10) {
        console.log(`  ... and ${stats.errors.length - 10} more errors`)
      }
    }

    // Step 7: Verify migration
    console.log('\n🔍 Verifying migration...')
    const neo4jCount = await neo4jService.executeQuery(`
      MATCH (m:Memory)
      RETURN count(m) as count
    `)
    
    const neo4jMemoryCount = neo4jCount.records[0]?.count || 0
    console.log(`Neo4j now contains ${neo4jMemoryCount} memories`)
    
    if (neo4jMemoryCount === stats.migratedMemories) {
      console.log('✅ Migration verification passed!')
    } else {
      console.log('⚠️  Memory count mismatch - manual verification recommended')
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
  } finally {
    await closeDriver()
    console.log('\n🎉 Migration process complete!')
  }
}

// Add command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const skipCode = args.includes('--skip-code')
const skipInference = args.includes('--skip-inference')
const limit = args.find(arg => arg.startsWith('--limit='))?.split('=')[1]

async function run() {
  if (limit) {
    console.log(`🔢 Limited migration mode - will process ${limit} memories\n`)
  }
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be migrated\n')
  } else {
    console.log('⚠️  This will migrate memories from Supabase to Neo4j.')
    console.log('Make sure you have backed up your data!')
    console.log('\nPress Ctrl+C to cancel, or wait 3 seconds to continue...\n')
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  
  await migrateToNeo4j()
}

run().catch(console.error)