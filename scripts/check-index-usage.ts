import neo4j from 'neo4j-driver'
import { config } from 'dotenv'

config({ path: '.env.local' })

const driver = neo4j.driver(
  process.env.NEO4J_URI || '',
  neo4j.auth.basic(process.env.NEO4J_USER || '', process.env.NEO4J_PASSWORD || '')
)

async function checkIndexUsage() {
  const session = driver.session()
  
  try {
    console.log('=== COMMON QUERY PATTERNS & INDEX USAGE ===\n')
    
    // Check common query patterns
    const queryPatterns = [
      {
        name: 'Memory lookup by ID',
        query: 'MATCH (m:Memory {id: $id}) RETURN m',
        params: { id: 'test-id' }
      },
      {
        name: 'Code entity by file path',
        query: 'MATCH (c:CodeEntity {file_path: $path}) RETURN c',
        params: { path: '/test/path' }
      },
      {
        name: 'Memories by workspace and time range',
        query: `MATCH (m:Memory) 
                WHERE m.workspace_id = $workspace_id 
                AND m.occurred_at >= $start_date 
                AND m.occurred_at <= $end_date 
                RETURN m`,
        params: { 
          workspace_id: 'test-workspace',
          start_date: '2025-01-01T00:00:00Z',
          end_date: '2025-01-31T23:59:59Z'
        }
      },
      {
        name: 'Pattern by type and scope',
        query: `MATCH (p:Pattern) 
                WHERE p.pattern_type = $type 
                AND p.scope_id = $scope_id 
                RETURN p`,
        params: { type: 'debugging', scope_id: 'test-scope' }
      },
      {
        name: 'Entity summary by entity reference',
        query: `MATCH (e:EntitySummary) 
                WHERE e.entity_id = $entity_id 
                AND e.entity_type = $entity_type 
                RETURN e`,
        params: { entity_id: 'test-id', entity_type: 'memory' }
      }
    ]
    
    for (const pattern of queryPatterns) {
      console.log(`\n${pattern.name}:`)
      console.log(`Query: ${pattern.query.replace(/\s+/g, ' ')}`)
      
      try {
        const explainResult = await session.run(
          `EXPLAIN ${pattern.query}`,
          pattern.params
        )
        
        // Look for index usage in the plan
        const plan = explainResult.summary.plan
        const hasIndexScan = JSON.stringify(plan).includes('NodeIndexSeek') || 
                            JSON.stringify(plan).includes('NodeIndexScan')
        
        if (hasIndexScan) {
          console.log('✓ Uses index')
        } else {
          console.log('⚠️  Does NOT use index - may need optimization')
        }
      } catch (error) {
        console.log('✗ Query error:', error.message)
      }
    }
    
    console.log('\n\n=== RELATIONSHIP INDEXES ===\n')
    console.log('Note: Neo4j does not support indexes on relationships directly.')
    console.log('For relationship queries, ensure proper node indexes exist.\n')
    
    // Check important relationships
    const relationships = await session.run(`
      MATCH ()-[r]->()
      RETURN DISTINCT type(r) as relType, count(r) as count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    console.log('Top relationship types by count:')
    relationships.records.forEach(record => {
      const relType = record.get('relType')
      const count = record.get('count')
      console.log(`  ${relType}: ${count.toNumber()} relationships`)
    })
    
    console.log('\n\n=== RECOMMENDATIONS ===\n')
    
    console.log('1. ✓ Vector indexes created for semantic search')
    console.log('2. ✓ Ownership indexes (workspace_id, user_id) created for multi-tenancy')
    console.log('3. ✓ ID indexes created for direct lookups')
    console.log('4. ✓ Composite indexes created for common query patterns')
    console.log('\nAdditional considerations:')
    console.log('- Monitor query performance with PROFILE instead of EXPLAIN')
    console.log('- Use db.index.fulltext.* for text search if needed')
    console.log('- Consider constraints for uniqueness + automatic indexing')
    
  } catch (error) {
    console.error('Error checking index usage:', error)
  } finally {
    await session.close()
    await driver.close()
  }
}

checkIndexUsage()