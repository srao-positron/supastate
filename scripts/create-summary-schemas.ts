/**
 * Create summary node schemas and indexes for efficient pattern detection
 * This implements the design from PATTERN_DETECTION_DESIGN.md
 */

import * as dotenv from 'dotenv'
import { neo4jService } from '../src/lib/neo4j/service'
import { log } from '../src/lib/logger'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function createSummarySchemas() {
  console.log('\n=== Creating Summary Node Schemas ===')
  
  try {
    await neo4jService.initialize()
    
    // Create constraints for unique IDs
    const constraints = [
      {
        name: 'entity_summary_id_unique',
        query: `CREATE CONSTRAINT entity_summary_id_unique IF NOT EXISTS 
                FOR (e:EntitySummary) REQUIRE e.id IS UNIQUE`
      },
      {
        name: 'session_summary_id_unique',
        query: `CREATE CONSTRAINT session_summary_id_unique IF NOT EXISTS 
                FOR (s:SessionSummary) REQUIRE s.id IS UNIQUE`
      },
      {
        name: 'pattern_summary_id_unique',
        query: `CREATE CONSTRAINT pattern_summary_id_unique IF NOT EXISTS 
                FOR (p:PatternSummary) REQUIRE p.id IS UNIQUE`
      },
      {
        name: 'semantic_cluster_id_unique',
        query: `CREATE CONSTRAINT semantic_cluster_id_unique IF NOT EXISTS 
                FOR (c:SemanticCluster) REQUIRE c.id IS UNIQUE`
      }
    ]
    
    console.log('\nCreating constraints...')
    for (const constraint of constraints) {
      try {
        await neo4jService.executeQuery(constraint.query, {})
        console.log(`✓ Created constraint: ${constraint.name}`)
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log(`○ Constraint already exists: ${constraint.name}`)
        } else {
          console.error(`✗ Failed to create constraint ${constraint.name}:`, error.message)
        }
      }
    }
    
    // Create indexes for primary access patterns
    const indexes = [
      {
        name: 'entity_summary_user_project',
        query: `CREATE INDEX entity_summary_user_project IF NOT EXISTS 
                FOR (e:EntitySummary) 
                ON (e.user_id, e.project_name, e.created_at)`
      },
      {
        name: 'entity_summary_workspace',
        query: `CREATE INDEX entity_summary_workspace IF NOT EXISTS 
                FOR (e:EntitySummary) 
                ON (e.workspace_id, e.entity_type, e.created_at)`
      },
      {
        name: 'entity_summary_cluster',
        query: `CREATE INDEX entity_summary_cluster IF NOT EXISTS 
                FOR (e:EntitySummary) 
                ON (e.semantic_cluster_id)`
      },
      {
        name: 'session_summary_user_project',
        query: `CREATE INDEX session_summary_user_project IF NOT EXISTS 
                FOR (s:SessionSummary) 
                ON (s.user_id, s.project_name, s.start_time)`
      },
      {
        name: 'pattern_summary_scope',
        query: `CREATE INDEX pattern_summary_scope IF NOT EXISTS 
                FOR (p:PatternSummary) 
                ON (p.scope_type, p.scope_id, p.pattern_type)`
      },
      {
        name: 'pattern_summary_confidence',
        query: `CREATE INDEX pattern_summary_confidence IF NOT EXISTS 
                FOR (p:PatternSummary) 
                ON (p.confidence, p.last_validated)`
      },
      {
        name: 'semantic_cluster_project',
        query: `CREATE INDEX semantic_cluster_project IF NOT EXISTS 
                FOR (c:SemanticCluster) 
                ON (c.project_name, c.cluster_type)`
      }
    ]
    
    console.log('\nCreating indexes...')
    for (const index of indexes) {
      try {
        await neo4jService.executeQuery(index.query, {})
        console.log(`✓ Created index: ${index.name}`)
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log(`○ Index already exists: ${index.name}`)
        } else {
          console.error(`✗ Failed to create index ${index.name}:`, error.message)
        }
      }
    }
    
    // Create vector indexes for semantic search
    const vectorIndexes = [
      {
        name: 'entity_summary_embedding',
        query: `CREATE VECTOR INDEX entity_summary_embedding IF NOT EXISTS
                FOR (e:EntitySummary) 
                ON e.embedding
                OPTIONS {indexConfig: {
                  \`vector.dimensions\`: 3072,
                  \`vector.similarity_function\`: 'cosine'
                }}`
      },
      {
        name: 'cluster_centroid',
        query: `CREATE VECTOR INDEX cluster_centroid IF NOT EXISTS
                FOR (c:SemanticCluster) 
                ON c.centroid_embedding
                OPTIONS {indexConfig: {
                  \`vector.dimensions\`: 3072,
                  \`vector.similarity_function\`: 'cosine'
                }}`
      },
      {
        name: 'pattern_embedding',
        query: `CREATE VECTOR INDEX pattern_embedding IF NOT EXISTS
                FOR (p:PatternSummary) 
                ON p.pattern_embedding
                OPTIONS {indexConfig: {
                  \`vector.dimensions\`: 3072,
                  \`vector.similarity_function\`: 'cosine'
                }}`
      },
      {
        name: 'session_centroid',
        query: `CREATE VECTOR INDEX session_centroid IF NOT EXISTS
                FOR (s:SessionSummary) 
                ON s.centroid_embedding
                OPTIONS {indexConfig: {
                  \`vector.dimensions\`: 3072,
                  \`vector.similarity_function\`: 'cosine'
                }}`
      }
    ]
    
    console.log('\nCreating vector indexes...')
    for (const index of vectorIndexes) {
      try {
        await neo4jService.executeQuery(index.query, {})
        console.log(`✓ Created vector index: ${index.name}`)
      } catch (error: any) {
        if (error.message?.includes('already exists') || error.message?.includes('There already exists an index')) {
          console.log(`○ Vector index already exists: ${index.name}`)
        } else {
          console.error(`✗ Failed to create vector index ${index.name}:`, error.message)
        }
      }
    }
    
    // Create full-text search index
    console.log('\nCreating full-text search index...')
    try {
      await neo4jService.executeQuery(
        `CREATE FULLTEXT INDEX summary_keywords IF NOT EXISTS
         FOR (e:EntitySummary) 
         ON EACH [e.keyword_frequencies]`,
        {}
      )
      console.log('✓ Created full-text index: summary_keywords')
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('○ Full-text index already exists: summary_keywords')
      } else {
        console.error('✗ Failed to create full-text index:', error.message)
      }
    }
    
    // Verify schema creation
    console.log('\n=== Verifying Schema Creation ===')
    
    // Check constraints
    const constraintCheck = await neo4jService.executeQuery(
      `SHOW CONSTRAINTS WHERE entityType = 'NODE' 
       AND labelsOrTypes CONTAINS 'EntitySummary' 
       OR labelsOrTypes CONTAINS 'SessionSummary'
       OR labelsOrTypes CONTAINS 'PatternSummary'
       OR labelsOrTypes CONTAINS 'SemanticCluster'`,
      {}
    )
    
    console.log(`\nFound ${constraintCheck.records.length} constraints`)
    
    // Check indexes
    const indexCheck = await neo4jService.executeQuery(
      `SHOW INDEXES WHERE entityType = 'NODE'
       AND (labelsOrTypes CONTAINS 'EntitySummary' 
       OR labelsOrTypes CONTAINS 'SessionSummary'
       OR labelsOrTypes CONTAINS 'PatternSummary'
       OR labelsOrTypes CONTAINS 'SemanticCluster')`,
      {}
    )
    
    console.log(`Found ${indexCheck.records.length} indexes`)
    
    // Create sample nodes to test schema
    console.log('\n=== Creating Sample Nodes ===')
    
    const sampleQueries = [
      {
        name: 'EntitySummary',
        query: `
          CREATE (e:EntitySummary {
            id: 'sample-entity-summary-1',
            entity_id: 'memory-123',
            entity_type: 'memory',
            user_id: 'test-user',
            workspace_id: 'test-workspace',
            project_name: 'test-project',
            created_at: datetime(),
            updated_at: datetime(),
            semantic_cluster_id: 'cluster-1',
            keyword_frequencies: {error: 2, bug: 1, fix: 3},
            entity_references: ['code-456', 'memory-789'],
            temporal_context: {
              session_id: 'session-1',
              sequence_position: 1,
              gap_from_previous: duration({minutes: 5})
            },
            pattern_signals: {
              is_debugging: true,
              is_learning: false,
              is_refactoring: false,
              complexity_score: 0.7,
              urgency_score: 0.8
            }
          })
          RETURN e`
      },
      {
        name: 'SessionSummary',
        query: `
          CREATE (s:SessionSummary {
            id: 'sample-session-1',
            user_id: 'test-user',
            project_name: 'test-project',
            start_time: datetime() - duration({hours: 2}),
            end_time: datetime() - duration({hours: 1}),
            duration: duration({hours: 1}),
            entity_count: 15,
            dominant_patterns: ['debugging', 'refactoring'],
            keywords: {error: 5, fix: 8, refactor: 3},
            semantic_diversity: 0.6
          })
          RETURN s`
      },
      {
        name: 'PatternSummary',
        query: `
          CREATE (p:PatternSummary {
            id: 'sample-pattern-1',
            pattern_type: 'debugging',
            scope_type: 'project',
            scope_id: 'test-project',
            first_detected: datetime() - duration({days: 7}),
            last_validated: datetime(),
            last_updated: datetime(),
            confidence: 0.85,
            frequency: 42,
            stability: 0.9,
            supporting_entities: 15,
            example_entity_ids: ['entity-1', 'entity-2', 'entity-3'],
            metadata: {
              avg_resolution_time: 'PT30M',
              common_keywords: ['error', 'exception', 'fix']
            }
          })
          RETURN p`
      },
      {
        name: 'SemanticCluster',
        query: `
          CREATE (c:SemanticCluster {
            id: 'sample-cluster-1',
            project_name: 'test-project',
            radius: 0.2,
            entity_count: 25,
            dominant_keywords: ['authentication', 'login', 'security'],
            cluster_type: 'mixed',
            created_at: datetime() - duration({days: 3}),
            updated_at: datetime()
          })
          RETURN c`
      }
    ]
    
    for (const sample of sampleQueries) {
      try {
        await neo4jService.executeQuery(sample.query, {})
        console.log(`✓ Created sample ${sample.name}`)
      } catch (error: any) {
        console.error(`✗ Failed to create sample ${sample.name}:`, error.message)
      }
    }
    
    // Create sample relationships
    console.log('\n=== Creating Sample Relationships ===')
    
    const relationshipQueries = [
      {
        name: 'SUMMARIZES',
        query: `
          MATCH (e:EntitySummary {id: 'sample-entity-summary-1'})
          MATCH (m:Memory) 
          WHERE m.id IS NOT NULL
          WITH e, m LIMIT 1
          CREATE (e)-[:SUMMARIZES]->(m)
          RETURN e, m`
      },
      {
        name: 'CONTAINS_ENTITY',
        query: `
          MATCH (s:SessionSummary {id: 'sample-session-1'})
          MATCH (e:EntitySummary {id: 'sample-entity-summary-1'})
          CREATE (s)-[:CONTAINS_ENTITY]->(e)
          RETURN s, e`
      },
      {
        name: 'IN_CLUSTER',
        query: `
          MATCH (e:EntitySummary {id: 'sample-entity-summary-1'})
          MATCH (c:SemanticCluster {id: 'sample-cluster-1'})
          CREATE (e)-[:IN_CLUSTER]->(c)
          RETURN e, c`
      },
      {
        name: 'EXHIBITS_PATTERN',
        query: `
          MATCH (e:EntitySummary {id: 'sample-entity-summary-1'})
          MATCH (p:PatternSummary {id: 'sample-pattern-1'})
          CREATE (e)-[:EXHIBITS_PATTERN {confidence: 0.8}]->(p)
          RETURN e, p`
      }
    ]
    
    for (const rel of relationshipQueries) {
      try {
        const result = await neo4jService.executeQuery(rel.query, {})
        if (result.records.length > 0) {
          console.log(`✓ Created relationship: ${rel.name}`)
        } else {
          console.log(`○ No nodes found for relationship: ${rel.name}`)
        }
      } catch (error: any) {
        console.error(`✗ Failed to create relationship ${rel.name}:`, error.message)
      }
    }
    
    console.log('\n=== Summary Schema Creation Complete ===')
    console.log('\nNext steps:')
    console.log('1. Run create-entity-summarizer.ts to build the summarization pipeline')
    console.log('2. Run migrate-existing-data.ts to create summaries for existing data')
    console.log('3. Update ingestion pipeline to create summaries in real-time')
    
  } catch (error) {
    console.error('Schema creation failed:', error)
  } finally {
    // Close connection if method exists
    if (typeof neo4jService.close === 'function') {
      await neo4jService.close()
    }
  }
}

createSummarySchemas().catch(console.error)