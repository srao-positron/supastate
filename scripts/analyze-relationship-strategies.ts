import { config } from 'dotenv';
import neo4j from 'neo4j-driver';

// Load environment variables
config({ path: '.env.local' });

async function analyzeRelationshipStrategies() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  );
  const session = driver.session();

  try {
    console.log('=== Analyzing Relationship Strategies ===\n');

    // 1. Check if embeddings exist and their dimensions
    console.log('1. Embedding Analysis:');
    console.log('---------------------');
    const embeddingResult = await session.run(`
      MATCH (n)
      WHERE n.embedding IS NOT NULL
      RETURN 
        labels(n)[0] as nodeType,
        COUNT(n) as count,
        SIZE(n.embedding) as embeddingSize
      ORDER BY count DESC
    `);
    
    embeddingResult.records.forEach(record => {
      console.log(`- ${record.get('nodeType')}: ${record.get('count')} nodes with ${record.get('embeddingSize')}-dimensional embeddings`);
    });

    // 2. Check EntitySummary relationships
    console.log('\n2. EntitySummary Relationships:');
    console.log('-------------------------------');
    const summaryResult = await session.run(`
      MATCH (e:EntitySummary)-[r]-(n)
      RETURN 
        type(r) as relType,
        labels(n)[0] as connectedType,
        COUNT(*) as count
      ORDER BY count DESC
    `);
    
    summaryResult.records.forEach(record => {
      console.log(`- ${record.get('relType')} → ${record.get('connectedType')}: ${record.get('count')}`);
    });

    // 3. Analyze memory content patterns
    console.log('\n3. Memory Content Patterns:');
    console.log('---------------------------');
    const memoryPatternResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.content IS NOT NULL
      WITH m, 
           CASE 
             WHEN m.content CONTAINS 'user:' THEN 'user_message'
             WHEN m.content CONTAINS 'assistant:' THEN 'assistant_message'
             WHEN m.content CONTAINS 'system:' THEN 'system_message'
             ELSE 'other'
           END as contentType
      RETURN contentType, COUNT(*) as count
      ORDER BY count DESC
    `);
    
    memoryPatternResult.records.forEach(record => {
      console.log(`- ${record.get('contentType')}: ${record.get('count')} memories`);
    });

    // 4. Check for temporal patterns in memories
    console.log('\n4. Temporal Patterns:');
    console.log('--------------------');
    const temporalResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.occurred_at IS NOT NULL
      WITH date(m.occurred_at) as day, COUNT(*) as count
      ORDER BY day DESC
      LIMIT 10
      RETURN day, count
    `);
    
    console.log('Recent activity by day:');
    temporalResult.records.forEach(record => {
      console.log(`- ${record.get('day')}: ${record.get('count')} memories`);
    });

    // 5. Analyze code entity types and their relationships
    console.log('\n5. Code Entity Types:');
    console.log('--------------------');
    const codeTypeResult = await session.run(`
      MATCH (c:CodeEntity)
      RETURN c.type as codeType, COUNT(*) as count
      ORDER BY count DESC
    `);
    
    codeTypeResult.records.forEach(record => {
      console.log(`- ${record.get('codeType')}: ${record.get('count')} entities`);
    });

    // 6. Find potential semantic relationships using embeddings
    console.log('\n6. Potential Semantic Relationships:');
    console.log('------------------------------------');
    
    // Check if we can do vector similarity search
    const vectorIndexResult = await session.run(`
      SHOW INDEXES
      WHERE type = 'VECTOR'
    `);
    
    if (vectorIndexResult.records.length > 0) {
      console.log('Vector indexes found:');
      vectorIndexResult.records.forEach(record => {
        console.log(`- ${record.get('name')} on ${record.get('labelsOrTypes')} (${record.get('properties')})`);
      });

      // Test semantic search between memories
      console.log('\nTesting semantic similarity between memories:');
      const semanticTestResult = await session.run(`
        MATCH (m1:Memory)
        WHERE m1.embedding IS NOT NULL
        WITH m1 LIMIT 1
        CALL db.index.vector.queryNodes('memory_embedding_index', 5, m1.embedding)
        YIELD node as m2, score
        WHERE m1.id <> m2.id
        RETURN 
          m1.title as fromTitle,
          m2.title as toTitle,
          score,
          m1.content as fromContent,
          m2.content as toContent
      `);
      
      if (semanticTestResult.records.length > 0) {
        const first = semanticTestResult.records[0];
        console.log(`\nExample: "${first.get('fromTitle') || 'Untitled'}" is similar to:`);
        semanticTestResult.records.forEach(record => {
          console.log(`- "${record.get('toTitle') || 'Untitled'}" (score: ${record.get('score').toFixed(3)})`);
        });
      }
    } else {
      console.log('No vector indexes found. Semantic search not available.');
    }

    // 7. Analyze existing pattern detection results
    console.log('\n7. Pattern Detection Results:');
    console.log('-----------------------------');
    const patternDetectionResult = await session.run(`
      MATCH (p:Pattern)
      OPTIONAL MATCH (p)-[r:FOUND_IN|DERIVED_FROM]-(n)
      RETURN 
        p.type as patternType,
        p.name as patternName,
        type(r) as relType,
        labels(n)[0] as connectedType,
        COUNT(DISTINCT n) as connectedCount
      ORDER BY connectedCount DESC
      LIMIT 10
    `);
    
    if (patternDetectionResult.records.length === 0) {
      console.log('No pattern detection results found.');
    } else {
      patternDetectionResult.records.forEach(record => {
        console.log(`- Pattern "${record.get('patternName')}" (${record.get('patternType')}) ${record.get('relType') || 'has'} ${record.get('connectedCount')} ${record.get('connectedType') || 'connections'}`);
      });
    }

    // 8. Suggest new relationship strategies
    console.log('\n\n=== Suggested Relationship Strategies ===');
    console.log('\nFor Memories:');
    console.log('1. Semantic Similarity: Use embeddings to find conceptually related memories');
    console.log('2. Temporal Proximity: Group memories from same session/time period');
    console.log('3. Code References: Connect memories that discuss same code files');
    console.log('4. User Context: Group by user activity patterns');
    console.log('5. Content Patterns: Group by conversation type (user/assistant)');

    console.log('\nFor Code Entities:');
    console.log('1. Import Graph: Already implemented via IMPORTS relationship');
    console.log('2. Structural Hierarchy: DEFINES_FUNCTION/CLASS relationships');
    console.log('3. Project Grouping: BELONGS_TO_PROJECT relationship');
    console.log('4. Semantic Code Search: Use embeddings to find similar code');
    console.log('5. Memory References: DISCUSSED_IN/REFERENCES_CODE relationships');

    console.log('\nMissing Opportunities:');
    
    // Check for memories without embeddings
    const noEmbeddingResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.embedding IS NULL
      RETURN COUNT(m) as count
    `);
    console.log(`- ${noEmbeddingResult.records[0].get('count')} memories without embeddings (can't do semantic search)`);

    // Check for isolated nodes
    const isolatedResult = await session.run(`
      MATCH (n)
      WHERE NOT (n)--() AND NOT n:EntitySummary
      RETURN labels(n)[0] as type, COUNT(n) as count
    `);
    
    isolatedResult.records.forEach(record => {
      if (record.get('count') > 0) {
        console.log(`- ${record.get('count')} isolated ${record.get('type')} nodes (no relationships)`);
      }
    });

  } catch (error) {
    console.error('Error analyzing relationships:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the analysis
analyzeRelationshipStrategies().catch(console.error);