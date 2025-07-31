import { config } from 'dotenv';
import neo4j from 'neo4j-driver';

// Load environment variables
config({ path: '.env.local' });

async function testSpecificMemoryRelationships() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  );
  const session = driver.session();

  try {
    // Based on the earlier output, we know this memory has code references
    const memoryId = 'eda76fcd-d376-4857-b60e-cd54138718b1';
    
    console.log(`=== Testing Relationships for Memory: ${memoryId} ===\n`);

    // First, get the memory details
    const memoryResult = await session.run(`
      MATCH (m:Memory {id: $memoryId})
      RETURN m.title as title, 
             m.content as content,
             m.occurred_at as occurred_at,
             m.user_id as user_id,
             m.workspace_id as workspace_id
    `, { memoryId });

    if (memoryResult.records.length === 0) {
      console.log('Memory not found!');
      return;
    }

    const memory = memoryResult.records[0];
    console.log('Memory Details:');
    console.log('- Title:', memory.get('title') || 'Untitled');
    console.log('- User ID:', memory.get('user_id'));
    console.log('- Workspace ID:', memory.get('workspace_id'));
    console.log('- Content preview:', memory.get('content')?.substring(0, 200) + '...');
    console.log('- Occurred at:', memory.get('occurred_at'));

    // Strategy 1: Direct code references (already working)
    console.log('\n\n1. DIRECTLY REFERENCED CODE:');
    console.log('============================');
    const codeRefs = await session.run(`
      MATCH (m:Memory {id: $memoryId})-[r:REFERENCES_CODE]->(c:CodeEntity)
      RETURN c.name as name, 
             c.type as type,
             c.path as path,
             r.similarity as similarity,
             r.detection_method as method
      ORDER BY r.similarity DESC
    `, { memoryId });

    codeRefs.records.forEach(record => {
      console.log(`\n- ${record.get('name')} (${record.get('type')})`);
      console.log(`  Path: ${record.get('path') || 'N/A'}`);
      console.log(`  Similarity: ${record.get('similarity')?.toFixed(3)}`);
      console.log(`  Detection method: ${record.get('method')}`);
    });

    // Strategy 2: Semantic similarity using EntitySummary embeddings
    console.log('\n\n2. SEMANTICALLY SIMILAR MEMORIES (via EntitySummary):');
    console.log('=====================================================');
    const semanticResult = await session.run(`
      MATCH (m:Memory {id: $memoryId})-[:HAS_SUMMARY]->(es1:EntitySummary)
      WHERE es1.embedding IS NOT NULL
      CALL db.index.vector.queryNodes('entity_summary_embedding', 10, es1.embedding)
      YIELD node as es2, score
      WHERE es1.id <> es2.id
      MATCH (es2)<-[:HAS_SUMMARY]-(m2:Memory)
      WHERE m2.id <> m.id
      RETURN DISTINCT
        m2.id as id,
        m2.title as title,
        m2.content as content,
        score,
        m2.occurred_at as occurred_at
      ORDER BY score DESC
      LIMIT 5
    `, { memoryId });

    if (semanticResult.records.length > 0) {
      semanticResult.records.forEach(record => {
        console.log(`\n- "${record.get('title') || 'Untitled'}" (score: ${record.get('score').toFixed(3)})`);
        console.log(`  Content: ${record.get('content')?.substring(0, 150)}...`);
        console.log(`  Occurred: ${record.get('occurred_at')}`);
      });
    } else {
      console.log('No semantically similar memories found via EntitySummary.');
    }

    // Strategy 3: Memories from same conversation/session
    console.log('\n\n3. MEMORIES FROM SAME CONVERSATION/SESSION:');
    console.log('==========================================');
    const sessionResult = await session.run(`
      MATCH (m:Memory {id: $memoryId})
      MATCH (other:Memory)
      WHERE other.id <> m.id
        AND other.user_id = m.user_id
        AND abs(duration.inSeconds(m.occurred_at, other.occurred_at).seconds) < 1800
      WITH other, 
           abs(duration.inSeconds(m.occurred_at, other.occurred_at).seconds) as timeDiff,
           CASE 
             WHEN other.occurred_at < m.occurred_at THEN 'before'
             ELSE 'after'
           END as timing
      ORDER BY timeDiff ASC
      LIMIT 10
      RETURN other.id as id,
             other.title as title,
             other.content as content,
             timeDiff,
             timing,
             other.occurred_at as occurred_at
    `, { memoryId });

    if (sessionResult.records.length > 0) {
      console.log('\nNearby memories in conversation:');
      sessionResult.records.forEach(record => {
        const timeDiff = record.get('timeDiff').toNumber();
        const timing = record.get('timing');
        const minutes = Math.floor(timeDiff / 60);
        const seconds = timeDiff % 60;
        
        console.log(`\n- ${timing === 'before' ? '↑' : '↓'} ${minutes}m ${seconds}s ${timing}: "${record.get('title') || 'Untitled'}"`);
        console.log(`  Content: ${record.get('content')?.substring(0, 100)}...`);
      });
    }

    // Strategy 4: Code entities mentioned in same conversation
    console.log('\n\n4. CODE DISCUSSED IN SAME CONVERSATION:');
    console.log('=======================================');
    const conversationCodeResult = await session.run(`
      MATCH (m:Memory {id: $memoryId})
      MATCH (other:Memory)-[:REFERENCES_CODE]->(c:CodeEntity)
      WHERE other.user_id = m.user_id
        AND abs(duration.inSeconds(m.occurred_at, other.occurred_at).seconds) < 1800
        AND other.id <> m.id
      RETURN DISTINCT
        c.name as codeName,
        c.type as codeType,
        COUNT(DISTINCT other) as mentionCount,
        COLLECT(DISTINCT other.id)[0..3] as memoryIds
      ORDER BY mentionCount DESC
      LIMIT 10
    `, { memoryId });

    if (conversationCodeResult.records.length > 0) {
      conversationCodeResult.records.forEach(record => {
        console.log(`\n- ${record.get('codeName')} (${record.get('codeType')})`);
        console.log(`  Mentioned in ${record.get('mentionCount')} nearby memories`);
      });
    } else {
      console.log('No code references found in nearby conversation.');
    }

    // Strategy 5: Memories that reference the same code files
    console.log('\n\n5. OTHER MEMORIES REFERENCING SAME CODE:');
    console.log('========================================');
    const sharedCodeResult = await session.run(`
      MATCH (m:Memory {id: $memoryId})-[:REFERENCES_CODE]->(c:CodeEntity)
      WITH m, COLLECT(c) as referencedCode
      MATCH (other:Memory)-[:REFERENCES_CODE]->(c:CodeEntity)
      WHERE other.id <> m.id
        AND c IN referencedCode
      WITH other, COUNT(DISTINCT c) as sharedCount, COLLECT(DISTINCT c.name) as sharedFiles
      ORDER BY sharedCount DESC
      LIMIT 5
      RETURN other.id as id,
             other.title as title,
             other.content as content,
             other.occurred_at as occurred_at,
             sharedCount,
             sharedFiles
    `, { memoryId });

    if (sharedCodeResult.records.length > 0) {
      sharedCodeResult.records.forEach(record => {
        console.log(`\n- "${record.get('title') || 'Untitled'}"`);
        console.log(`  Shares ${record.get('sharedCount')} code references: ${record.get('sharedFiles').join(', ')}`);
        console.log(`  Content: ${record.get('content')?.substring(0, 100)}...`);
      });
    }

    // Summary of strategies
    console.log('\n\n=== RELATIONSHIP DISCOVERY STRATEGIES ===');
    console.log('\nFor Memories:');
    console.log('1. ✓ Direct code references (REFERENCES_CODE)');
    console.log('2. ✓ Semantic similarity via EntitySummary embeddings');
    console.log('3. ✓ Temporal proximity (same conversation/session)');
    console.log('4. ✓ Code discussed in same conversation');
    console.log('5. ✓ Memories referencing same code files');
    console.log('\nAdditional strategies to consider:');
    console.log('- Pattern-based relationships (if patterns are detected)');
    console.log('- Topic clustering based on content analysis');
    console.log('- User behavior patterns (time of day, frequency)');

  } catch (error) {
    console.error('Error testing relationships:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the test
testSpecificMemoryRelationships().catch(console.error);