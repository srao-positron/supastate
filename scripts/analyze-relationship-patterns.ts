import { config } from 'dotenv';
import neo4j from 'neo4j-driver';

// Load environment variables
config({ path: '.env.local' });

async function analyzeRelationshipPatterns() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  );
  const session = driver.session();

  try {
    console.log('=== Analyzing Relationship Patterns in Neo4j ===\n');

    // 1. Analyze REFERENCES_CODE relationships
    console.log('1. REFERENCES_CODE Relationship Analysis:');
    console.log('----------------------------------------');
    const refCodeResult = await session.run(`
      MATCH (m:Memory)-[r:REFERENCES_CODE]->(c:CodeEntity)
      RETURN 
        m.title as memoryTitle,
        m.content as memoryContent,
        c.name as codeName,
        c.type as codeType,
        r.similarity as similarity,
        r.detection_method as method,
        m.workspace_id as workspace_id,
        m.user_id as user_id
      ORDER BY r.similarity DESC
      LIMIT 10
    `);
    
    console.log('Sample REFERENCES_CODE relationships (high similarity):');
    refCodeResult.records.forEach((record, idx) => {
      console.log(`\n${idx + 1}. Memory: "${record.get('memoryTitle') || 'Untitled'}" (User: ${record.get('user_id')?.substring(0, 8)})`);
      console.log(`   Content: "${record.get('memoryContent')?.substring(0, 100)}..."`);
      console.log(`   → Code: ${record.get('codeName')} (${record.get('codeType')})`);
      console.log(`   Similarity: ${record.get('similarity')?.toFixed(3)}`);
      console.log(`   Method: ${record.get('method')}`);
    });

    // 2. Analyze DISCUSSED_IN relationships
    console.log('\n\n2. DISCUSSED_IN Relationship Analysis:');
    console.log('----------------------------------------');
    const discussedResult = await session.run(`
      MATCH (c:CodeEntity)-[r:DISCUSSED_IN]->(m:Memory)
      RETURN 
        c.name as codeName,
        c.type as codeType,
        m.title as memoryTitle,
        m.content as memoryContent,
        properties(r) as relProps
      LIMIT 10
    `);
    
    console.log('Sample DISCUSSED_IN relationships:');
    discussedResult.records.forEach((record, idx) => {
      console.log(`\n${idx + 1}. Code: ${record.get('codeName')} (${record.get('codeType')})`);
      console.log(`   → Memory: "${record.get('memoryTitle') || 'Untitled'}"`);
      console.log(`   Memory Content: "${record.get('memoryContent')?.substring(0, 100)}..."`);
      const props = record.get('relProps');
      if (props && Object.keys(props).length > 0) {
        console.log(`   Properties:`, props);
      }
    });

    // 3. Check for pattern nodes and their relationships
    console.log('\n\n3. Pattern Node Analysis:');
    console.log('----------------------------------------');
    const patternResult = await session.run(`
      MATCH (p:Pattern)
      OPTIONAL MATCH (p)-[r1]->(n1)
      OPTIONAL MATCH (n2)-[r2]->(p)
      RETURN 
        p.type as patternType,
        p.name as patternName,
        COUNT(DISTINCT r1) as outgoingRels,
        COUNT(DISTINCT r2) as incomingRels,
        COLLECT(DISTINCT type(r1))[0..3] as outTypes,
        COLLECT(DISTINCT type(r2))[0..3] as inTypes
      LIMIT 10
    `);
    
    if (patternResult.records.length === 0) {
      console.log('No Pattern nodes found in the database.');
    } else {
      patternResult.records.forEach(record => {
        console.log(`\nPattern: ${record.get('patternName')} (${record.get('patternType')})`);
        console.log(`  Outgoing: ${record.get('outgoingRels')} relationships - Types: ${record.get('outTypes').join(', ')}`);
        console.log(`  Incoming: ${record.get('incomingRels')} relationships - Types: ${record.get('inTypes').join(', ')}`);
      });
    }

    // 4. Analyze entity summaries and their connections
    console.log('\n\n4. EntitySummary Connections:');
    console.log('----------------------------------------');
    const summaryResult = await session.run(`
      MATCH (e:EntitySummary)
      OPTIONAL MATCH (e)-[r1:SUMMARIZES]->(n)
      OPTIONAL MATCH (n)-[r2:HAS_SUMMARY]->(e)
      RETURN 
        labels(n)[0] as entityType,
        COUNT(DISTINCT e) as summaryCount,
        COUNT(DISTINCT n) as entityCount
      ORDER BY summaryCount DESC
    `);
    
    summaryResult.records.forEach(record => {
      console.log(`- ${record.get('entityType') || 'Unknown'}: ${record.get('summaryCount')} summaries for ${record.get('entityCount')} entities`);
    });

    // 5. Check for orphaned nodes
    console.log('\n\n5. Orphaned Nodes Check:');
    console.log('----------------------------------------');
    const orphanedResult = await session.run(`
      MATCH (n)
      WHERE NOT (n)--() AND NOT n:EntitySummary
      RETURN labels(n)[0] as nodeType, COUNT(n) as count
      ORDER BY count DESC
    `);
    
    orphanedResult.records.forEach(record => {
      const count = record.get('count');
      if (count > 0) {
        console.log(`- ${record.get('nodeType')}: ${count} orphaned nodes`);
      }
    });

    // 6. Analyze code-to-code relationships
    console.log('\n\n6. Code-to-Code Relationships:');
    console.log('----------------------------------------');
    const codeRelResult = await session.run(`
      MATCH (c1:CodeEntity)-[r]->(c2:CodeEntity)
      WHERE type(r) <> 'IMPORTS'
      RETURN 
        type(r) as relType,
        c1.type as fromType,
        c2.type as toType,
        COUNT(*) as count
      ORDER BY count DESC
    `);
    
    codeRelResult.records.forEach(record => {
      console.log(`- ${record.get('relType')}: ${record.get('fromType')} → ${record.get('toType')} (${record.get('count')} times)`);
    });

    // 7. Check workspace isolation
    console.log('\n\n7. Workspace Isolation Check:');
    console.log('----------------------------------------');
    const workspaceResult = await session.run(`
      MATCH (n1)-[r]-(n2)
      WHERE n1.workspace_id IS NOT NULL 
        AND n2.workspace_id IS NOT NULL 
        AND n1.workspace_id <> n2.workspace_id
      RETURN 
        labels(n1)[0] as type1,
        labels(n2)[0] as type2,
        type(r) as relType,
        COUNT(*) as violations
    `);
    
    if (workspaceResult.records.length === 0) {
      console.log('✅ No workspace isolation violations found!');
    } else {
      console.log('⚠️  Workspace isolation violations found:');
      workspaceResult.records.forEach(record => {
        console.log(`- ${record.get('type1')} -[${record.get('relType')}]-> ${record.get('type2')}: ${record.get('violations')} violations`);
      });
    }

    // 8. Analyze similarity distribution
    console.log('\n\n8. Similarity Score Distribution:');
    console.log('----------------------------------------');
    const simResult = await session.run(`
      MATCH ()-[r:REFERENCES_CODE]->()
      WITH r.similarity as sim
      RETURN 
        CASE 
          WHEN sim >= 0.9 THEN '0.9-1.0'
          WHEN sim >= 0.8 THEN '0.8-0.9'
          WHEN sim >= 0.7 THEN '0.7-0.8'
          WHEN sim >= 0.6 THEN '0.6-0.7'
          ELSE '<0.6'
        END as range,
        COUNT(*) as count
      ORDER BY range DESC
    `);
    
    simResult.records.forEach(record => {
      console.log(`- ${record.get('range')}: ${record.get('count')} relationships`);
    });

    // 9. Check for potential missing relationships
    console.log('\n\n9. Potential Missing Relationships:');
    console.log('----------------------------------------');
    
    // Check memories without code references
    const memoriesWithoutCode = await session.run(`
      MATCH (m:Memory)
      WHERE NOT (m)-[:REFERENCES_CODE]->(:CodeEntity)
        AND m.embedding IS NOT NULL
      RETURN COUNT(m) as count
    `);
    console.log(`- Memories with embeddings but no code references: ${memoriesWithoutCode.records[0].get('count')}`);

    // Check code entities without summaries
    const codeWithoutSummary = await session.run(`
      MATCH (c:CodeEntity)
      WHERE NOT (c)-[:HAS_SUMMARY]->(:EntitySummary)
      RETURN COUNT(c) as count
    `);
    console.log(`- CodeEntities without summaries: ${codeWithoutSummary.records[0].get('count')}`);

  } catch (error) {
    console.error('Error analyzing relationships:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the analysis
analyzeRelationshipPatterns().catch(console.error);