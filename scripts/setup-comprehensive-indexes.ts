/**
 * Create comprehensive Neo4j indexes for multi-tenant pattern discovery
 * Optimized for filtering by user, team, and workspace
 */

import { neo4jService } from '../src/lib/neo4j/service'
import { log } from '@/lib/logger'

async function createComprehensiveIndexes() {
  console.log('\n=== Creating Comprehensive Neo4j Indexes ===')
  
  try {
    await neo4jService.initialize()
    
    // Drop existing indexes that might conflict
    console.log('\nDropping conflicting indexes if they exist...')
    const dropIndexes = [
      'DROP INDEX memory_project_name IF EXISTS',
      'DROP INDEX memory_user_id IF EXISTS',
      'DROP INDEX memory_created_at IF EXISTS',
      'DROP INDEX memory_composite IF EXISTS',
      'DROP INDEX code_project_name IF EXISTS'
    ]
    
    for (const dropQuery of dropIndexes) {
      try {
        await neo4jService.executeQuery(dropQuery, {})
        console.log(`  Dropped: ${dropQuery.split(' ')[2]}`)
      } catch (error) {
        // Ignore if doesn't exist
      }
    }
    
    // Multi-tenant composite indexes for memories
    console.log('\nCreating multi-tenant composite indexes for memories...')
    
    const memoryCompositeIndexes = [
      {
        name: 'memory_workspace_project_created',
        query: `CREATE INDEX memory_workspace_project_created IF NOT EXISTS 
                FOR (m:Memory) 
                ON (m.workspace_id, m.project_name, m.created_at)`
      },
      {
        name: 'memory_user_project_created',
        query: `CREATE INDEX memory_user_project_created IF NOT EXISTS 
                FOR (m:Memory) 
                ON (m.user_id, m.project_name, m.created_at)`
      },
      {
        name: 'memory_team_project_created',
        query: `CREATE INDEX memory_team_project_created IF NOT EXISTS 
                FOR (m:Memory) 
                ON (m.team_id, m.project_name, m.created_at)`
      },
      {
        name: 'memory_workspace_created',
        query: `CREATE INDEX memory_workspace_created IF NOT EXISTS 
                FOR (m:Memory) 
                ON (m.workspace_id, m.created_at)`
      },
      {
        name: 'memory_user_created',
        query: `CREATE INDEX memory_user_created IF NOT EXISTS 
                FOR (m:Memory) 
                ON (m.user_id, m.created_at)`
      },
      {
        name: 'memory_team_created',
        query: `CREATE INDEX memory_team_created IF NOT EXISTS 
                FOR (m:Memory) 
                ON (m.team_id, m.created_at)`
      }
    ]
    
    for (const index of memoryCompositeIndexes) {
      try {
        await neo4jService.executeQuery(index.query, {})
        console.log(`✓ Created: ${index.name}`)
      } catch (error) {
        console.error(`✗ Failed ${index.name}:`, error.message)
      }
    }
    
    // Multi-tenant composite indexes for code entities
    console.log('\nCreating multi-tenant composite indexes for code entities...')
    
    const codeCompositeIndexes = [
      {
        name: 'code_workspace_project_type',
        query: `CREATE INDEX code_workspace_project_type IF NOT EXISTS 
                FOR (c:CodeEntity) 
                ON (c.workspace_id, c.project_name, c.type)`
      },
      {
        name: 'code_workspace_project_created',
        query: `CREATE INDEX code_workspace_project_created IF NOT EXISTS 
                FOR (c:CodeEntity) 
                ON (c.workspace_id, c.project_name, c.created_at)`
      },
      {
        name: 'code_team_project_type',
        query: `CREATE INDEX code_team_project_type IF NOT EXISTS 
                FOR (c:CodeEntity) 
                ON (c.team_id, c.project_name, c.type)`
      }
    ]
    
    for (const index of codeCompositeIndexes) {
      try {
        await neo4jService.executeQuery(index.query, {})
        console.log(`✓ Created: ${index.name}`)
      } catch (error) {
        console.error(`✗ Failed ${index.name}:`, error.message)
      }
    }
    
    // Lookup indexes for filtering
    console.log('\nCreating lookup indexes...')
    
    const lookupIndexes = [
      {
        name: 'memory_id_lookup',
        query: `CREATE INDEX memory_id_lookup IF NOT EXISTS FOR (m:Memory) ON (m.id)`
      },
      {
        name: 'code_id_lookup',
        query: `CREATE INDEX code_id_lookup IF NOT EXISTS FOR (c:CodeEntity) ON (c.id)`
      },
      {
        name: 'memory_chunk_lookup',
        query: `CREATE INDEX memory_chunk_lookup IF NOT EXISTS FOR (m:Memory) ON (m.chunk_id)`
      },
      {
        name: 'memory_session_lookup',
        query: `CREATE INDEX memory_session_lookup IF NOT EXISTS FOR (m:Memory) ON (m.session_id)`
      }
    ]
    
    for (const index of lookupIndexes) {
      try {
        await neo4jService.executeQuery(index.query, {})
        console.log(`✓ Created: ${index.name}`)
      } catch (error) {
        console.error(`✗ Failed ${index.name}:`, error.message)
      }
    }
    
    // Text indexes for efficient pattern matching
    console.log('\nCreating full-text search indexes...')
    
    const fullTextIndexes = [
      {
        name: 'memory_content_fulltext',
        query: `CREATE FULLTEXT INDEX memory_content_fulltext IF NOT EXISTS 
                FOR (m:Memory) 
                ON EACH [m.content]
                OPTIONS {
                  indexConfig: {
                    \`fulltext.analyzer\`: 'english',
                    \`fulltext.eventually_consistent\`: false
                  }
                }`
      }
    ]
    
    for (const index of fullTextIndexes) {
      try {
        await neo4jService.executeQuery(index.query, {})
        console.log(`✓ Created: ${index.name}`)
      } catch (error) {
        if (!error.message.includes('already exists')) {
          console.error(`✗ Failed ${index.name}:`, error.message)
        }
      }
    }
    
    // Analyze existing data distribution
    console.log('\nAnalyzing data distribution...')
    
    const statsQuery = `
      MATCH (m:Memory)
      WITH 
        COUNT(DISTINCT m.workspace_id) as workspaces,
        COUNT(DISTINCT m.user_id) as users,
        COUNT(DISTINCT m.team_id) as teams,
        COUNT(DISTINCT m.project_name) as projects,
        COUNT(m) as totalMemories
      RETURN workspaces, users, teams, projects, totalMemories
    `
    
    const statsResult = await neo4jService.executeQuery(statsQuery, {})
    if (statsResult.records.length > 0) {
      const stats = statsResult.records[0]
      console.log('\nData distribution:')
      console.log(`  Workspaces: ${stats.workspaces || 0}`)
      console.log(`  Users: ${stats.users || 0}`)
      console.log(`  Teams: ${stats.teams || 0}`)
      console.log(`  Projects: ${stats.projects || 0}`)
      console.log(`  Total memories: ${stats.totalMemories || 0}`)
    }
    
    // Create constraints for data integrity
    console.log('\nCreating constraints...')
    
    const constraints = [
      {
        name: 'memory_id_unique',
        query: `CREATE CONSTRAINT memory_id_unique IF NOT EXISTS 
                FOR (m:Memory) 
                REQUIRE m.id IS UNIQUE`
      },
      {
        name: 'code_id_unique',
        query: `CREATE CONSTRAINT code_id_unique IF NOT EXISTS 
                FOR (c:CodeEntity) 
                REQUIRE c.id IS UNIQUE`
      }
    ]
    
    for (const constraint of constraints) {
      try {
        await neo4jService.executeQuery(constraint.query, {})
        console.log(`✓ Created constraint: ${constraint.name}`)
      } catch (error) {
        if (!error.message.includes('already exists')) {
          console.error(`✗ Failed ${constraint.name}:`, error.message)
        }
      }
    }
    
    // Wait for indexes to be populated
    console.log('\nWaiting for indexes to populate...')
    await new Promise(resolve => setTimeout(resolve, 10000))
    
    // Verify indexes are online
    console.log('\nVerifying indexes...')
    const verifyQuery = `
      CALL db.indexes() 
      YIELD name, state, type, entityType, properties
      WHERE state = 'ONLINE'
      RETURN name, type, entityType, properties
      ORDER BY name
    `
    
    try {
      const verifyResult = await neo4jService.executeQuery(verifyQuery, {})
      console.log('\nOnline indexes:')
      verifyResult.records.forEach(record => {
        const name = record.name || record.get?.('name') || 'unknown'
        const type = record.type || record.get?.('type') || 'unknown'
        const properties = record.properties || record.get?.('properties') || []
        console.log(`  ✓ ${name} (${type}) on ${properties.join(', ')}`)
      })
    } catch (error) {
      console.log('Could not verify indexes:', error.message)
    }
    
    console.log('\n✅ Index creation complete!')
    console.log('\nRecommended query patterns:')
    console.log('  - Always filter by workspace_id or user_id first')
    console.log('  - Use composite indexes by including project_name and created_at')
    console.log('  - Use LIMIT clauses to prevent memory issues')
    console.log('  - Use vector indexes for semantic search after filtering')
    
  } catch (error) {
    console.error('Failed to create indexes:', error)
  }
}

createComprehensiveIndexes().catch(console.error)