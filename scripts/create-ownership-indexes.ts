import neo4j from 'neo4j-driver'
import { config } from 'dotenv'

config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
)

async function createOwnershipIndexes() {
  const session = driver.session()
  
  try {
    console.log('Creating ownership indexes for better query performance...\n')
    
    // Create workspace_id indexes for all main node types
    const nodeTypes = [
      'Memory',
      'CodeEntity',
      'EntitySummary',
      'Pattern',
      'Project',
      'PatternSummary',
      'SessionSummary',
      'SemanticCluster'
    ]
    
    for (const nodeType of nodeTypes) {
      try {
        // Create workspace_id index
        await session.run(`
          CREATE INDEX ${nodeType.toLowerCase()}_workspace_id IF NOT EXISTS
          FOR (n:${nodeType})
          ON (n.workspace_id)
        `)
        console.log(`✓ Created workspace_id index for ${nodeType}`)
        
        // Create user_id index
        await session.run(`
          CREATE INDEX ${nodeType.toLowerCase()}_user_id IF NOT EXISTS
          FOR (n:${nodeType})
          ON (n.user_id)
        `)
        console.log(`✓ Created user_id index for ${nodeType}`)
        
        // Create composite index for project queries
        if (nodeType === 'Memory' || nodeType === 'CodeEntity' || nodeType === 'EntitySummary') {
          await session.run(`
            CREATE INDEX ${nodeType.toLowerCase()}_project_workspace IF NOT EXISTS
            FOR (n:${nodeType})
            ON (n.project_name, n.workspace_id)
          `)
          console.log(`✓ Created composite project/workspace index for ${nodeType}`)
        }
        
      } catch (error) {
        console.error(`✗ Error creating index for ${nodeType}:`, error.message)
      }
    }
    
    // Create specific indexes for common query patterns
    console.log('\nCreating specialized indexes...')
    
    // EntitySummary vector search optimization
    await session.run(`
      CREATE INDEX entity_summary_entity_type IF NOT EXISTS
      FOR (n:EntitySummary)
      ON (n.entity_type)
    `)
    console.log('✓ Created entity_type index for EntitySummary')
    
    // Memory occurred_at for temporal queries
    await session.run(`
      CREATE INDEX memory_occurred_at IF NOT EXISTS
      FOR (n:Memory)
      ON (n.occurred_at)
    `)
    console.log('✓ Created occurred_at index for Memory')
    
    // CodeEntity file_path for lookups
    await session.run(`
      CREATE INDEX code_entity_file_path IF NOT EXISTS
      FOR (n:CodeEntity)
      ON (n.file_path)
    `)
    console.log('✓ Created file_path index for CodeEntity')
    
    // Pattern indexes
    await session.run(`
      CREATE INDEX pattern_type_scope IF NOT EXISTS
      FOR (n:Pattern)
      ON (n.pattern_type, n.scope_id)
    `)
    console.log('✓ Created pattern type/scope index')
    
    console.log('\nAll indexes created successfully!')
    
  } catch (error) {
    console.error('Error creating indexes:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

createOwnershipIndexes()