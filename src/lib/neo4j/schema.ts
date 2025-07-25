import { executeQuery } from './client'

/**
 * Initialize Neo4j schema with constraints, indexes, and vector indexes
 * This sets up the knowledge graph structure for Supastate
 */
export async function initializeSchema(): Promise<void> {
  console.log('Initializing Neo4j schema...')

  // ============= NODE CONSTRAINTS =============
  
  // Ensure unique IDs for all node types
  const constraints = [
    'CREATE CONSTRAINT memory_id IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE',
    'CREATE CONSTRAINT code_entity_id IF NOT EXISTS FOR (c:CodeEntity) REQUIRE c.id IS UNIQUE',
    'CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE',
    'CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
    'CREATE CONSTRAINT team_id IF NOT EXISTS FOR (t:Team) REQUIRE t.id IS UNIQUE',
    'CREATE CONSTRAINT insight_id IF NOT EXISTS FOR (i:Insight) REQUIRE i.id IS UNIQUE',
    'CREATE CONSTRAINT debug_session_id IF NOT EXISTS FOR (d:DebugSession) REQUIRE d.id IS UNIQUE',
    'CREATE CONSTRAINT api_endpoint_id IF NOT EXISTS FOR (a:APIEndpoint) REQUIRE a.id IS UNIQUE',
    'CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE',
    'CREATE CONSTRAINT code_change_id IF NOT EXISTS FOR (cc:CodeChange) REQUIRE cc.id IS UNIQUE',
    'CREATE CONSTRAINT module_file_path IF NOT EXISTS FOR (m:Module) REQUIRE m.file_path IS UNIQUE'
  ]

  for (const constraint of constraints) {
    try {
      await executeQuery(constraint)
      console.log(`✓ Created constraint: ${constraint.match(/CONSTRAINT (\w+)/)?.[1]}`)
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error
      }
    }
  }

  // ============= VECTOR INDEXES =============
  
  // Vector index for memory embeddings (3072 dimensions)
  const vectorIndexes = [
    {
      name: 'memory_embeddings',
      query: `
        CREATE VECTOR INDEX memory_embeddings IF NOT EXISTS
        FOR (m:Memory)
        ON m.embedding
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `
    },
    {
      name: 'code_embeddings',
      query: `
        CREATE VECTOR INDEX code_embeddings IF NOT EXISTS
        FOR (c:CodeEntity)
        ON c.embedding
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `
    },
    {
      name: 'insight_embeddings',
      query: `
        CREATE VECTOR INDEX insight_embeddings IF NOT EXISTS
        FOR (i:Insight)
        ON i.embedding
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `
    },
    {
      name: 'change_embeddings',
      query: `
        CREATE VECTOR INDEX change_embeddings IF NOT EXISTS
        FOR (cc:CodeChange)
        ON cc.embedding
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `
    },
    {
      name: 'module_embeddings',
      query: `
        CREATE VECTOR INDEX module_embeddings IF NOT EXISTS
        FOR (m:Module)
        ON m.embedding
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 3072,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `
    }
  ]

  for (const { name, query } of vectorIndexes) {
    try {
      await executeQuery(query)
      console.log(`✓ Created vector index: ${name}`)
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error
      }
    }
  }

  // ============= REGULAR INDEXES =============
  
  // Indexes for common query patterns
  const indexes = [
    // Memory indexes
    'CREATE INDEX memory_project IF NOT EXISTS FOR (m:Memory) ON (m.project_name)',
    'CREATE INDEX memory_created IF NOT EXISTS FOR (m:Memory) ON (m.created_at)',
    'CREATE INDEX memory_user IF NOT EXISTS FOR (m:Memory) ON (m.user_id)',
    'CREATE INDEX memory_team IF NOT EXISTS FOR (m:Memory) ON (m.team_id)',
    'CREATE INDEX memory_type IF NOT EXISTS FOR (m:Memory) ON (m.type)',
    
    // Code entity indexes
    'CREATE INDEX code_project IF NOT EXISTS FOR (c:CodeEntity) ON (c.project_name)',
    'CREATE INDEX code_type IF NOT EXISTS FOR (c:CodeEntity) ON (c.type)',
    'CREATE INDEX code_file IF NOT EXISTS FOR (c:CodeEntity) ON (c.file_path)',
    'CREATE INDEX code_name IF NOT EXISTS FOR (c:CodeEntity) ON (c.name)',
    
    // User indexes
    'CREATE INDEX user_team IF NOT EXISTS FOR (u:User) ON (u.team_id)',
    'CREATE INDEX user_github IF NOT EXISTS FOR (u:User) ON (u.github_username)',
    
    // Insight indexes
    'CREATE INDEX insight_category IF NOT EXISTS FOR (i:Insight) ON (i.category)',
    'CREATE INDEX insight_created IF NOT EXISTS FOR (i:Insight) ON (i.created_at)',
    
    // Debug session indexes
    'CREATE INDEX debug_resolved IF NOT EXISTS FOR (d:DebugSession) ON (d.resolved)',
    'CREATE INDEX debug_created IF NOT EXISTS FOR (d:DebugSession) ON (d.created_at)',
    
    // Module indexes
    'CREATE INDEX module_project IF NOT EXISTS FOR (m:Module) ON (m.project_name)',
    'CREATE INDEX module_name IF NOT EXISTS FOR (m:Module) ON (m.name)'
  ]

  for (const index of indexes) {
    try {
      await executeQuery(index)
      console.log(`✓ Created index: ${index.match(/INDEX (\w+)/)?.[1]}`)
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error
      }
    }
  }

  // ============= COMPOSITE INDEXES =============
  
  const compositeIndexes = [
    'CREATE INDEX memory_project_date IF NOT EXISTS FOR (m:Memory) ON (m.project_name, m.created_at)',
    'CREATE INDEX code_project_type IF NOT EXISTS FOR (c:CodeEntity) ON (c.project_name, c.type)',
    'CREATE INDEX memory_team_project IF NOT EXISTS FOR (m:Memory) ON (m.team_id, m.project_name)'
  ]

  for (const index of compositeIndexes) {
    try {
      await executeQuery(index)
      console.log(`✓ Created composite index: ${index.match(/INDEX (\w+)/)?.[1]}`)
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error
      }
    }
  }

  console.log('✓ Schema initialization complete!')
}

/**
 * Drop all indexes and constraints (use with caution!)
 */
export async function dropSchema(): Promise<void> {
  console.log('Dropping Neo4j schema...')
  
  // Get all constraints
  const constraints = await executeQuery(`
    SHOW CONSTRAINTS 
    YIELD name 
    RETURN collect(name) as names
  `)
  
  // Drop each constraint
  for (const name of constraints.records[0]?.names || []) {
    await executeQuery(`DROP CONSTRAINT ${name}`)
    console.log(`✓ Dropped constraint: ${name}`)
  }
  
  // Get all indexes
  const indexes = await executeQuery(`
    SHOW INDEXES 
    YIELD name 
    WHERE name <> 'index_entity_id'
    RETURN collect(name) as names
  `)
  
  // Drop each index
  for (const name of indexes.records[0]?.names || []) {
    await executeQuery(`DROP INDEX ${name}`)
    console.log(`✓ Dropped index: ${name}`)
  }
  
  console.log('✓ Schema drop complete!')
}

/**
 * Create sample data for testing
 */
export async function createSampleData(): Promise<void> {
  console.log('Creating sample data...')
  
  // Create sample users and team
  await executeQuery(`
    CREATE (team:Team {
      id: 'team-123',
      name: 'Supastate Team',
      github_org: 'supastate'
    })
    
    CREATE (user1:User {
      id: 'user-1',
      email: 'alice@supastate.ai',
      github_username: 'alice',
      team_id: 'team-123'
    })
    
    CREATE (user2:User {
      id: 'user-2', 
      email: 'bob@supastate.ai',
      github_username: 'bob',
      team_id: 'team-123'
    })
    
    CREATE (user1)-[:MEMBER_OF]->(team)
    CREATE (user2)-[:MEMBER_OF]->(team)
  `)
  
  // Create sample project
  await executeQuery(`
    CREATE (project:Project {
      id: 'project-supastate',
      name: 'supastate',
      total_memories: 0,
      key_patterns: ['authentication', 'graph-database', 'vector-search'],
      common_issues: ['connection-timeout', 'memory-leak']
    })
  `)
  
  console.log('✓ Sample data created!')
}

/**
 * Get schema statistics
 */
export async function getSchemaStats(): Promise<any> {
  const stats = await executeQuery(`
    CALL apoc.meta.stats()
    YIELD labels, relTypesCount, propertyKeyCount, nodeCount, relCount
    RETURN {
      nodeTypes: labels,
      relationshipTypes: relTypesCount,
      totalNodes: nodeCount,
      totalRelationships: relCount,
      propertyKeys: propertyKeyCount
    } as stats
  `)
  
  return stats.records[0]?.stats
}