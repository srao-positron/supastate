import { config } from 'dotenv';
import neo4j from 'neo4j-driver';

// Load environment variables
config({ path: '.env.local' });

async function checkRelationshipTypes() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
  );
  const session = driver.session();

  try {
    console.log('=== Checking Neo4j Relationship Types ===\n');

    // 1. Get all relationship types in the database
    console.log('1. All Relationship Types in Database:');
    console.log('----------------------------------------');
    const allTypesResult = await session.run(`
      MATCH ()-[r]->()
      RETURN DISTINCT type(r) as relationshipType, COUNT(r) as count
      ORDER BY count DESC
    `);
    
    if (allTypesResult.records.length === 0) {
      console.log('No relationships found in the database.');
    } else {
      allTypesResult.records.forEach(record => {
        console.log(`- ${record.get('relationshipType')}: ${record.get('count')} relationships`);
      });
    }

    // 2. Check Memory to CodeEntity relationships
    console.log('\n2. Memory → CodeEntity Relationships:');
    console.log('----------------------------------------');
    const memoryToCodeResult = await session.run(`
      MATCH (m:Memory)-[r]->(c:CodeEntity)
      RETURN DISTINCT type(r) as relationshipType, COUNT(r) as count
      ORDER BY count DESC
    `);
    
    if (memoryToCodeResult.records.length === 0) {
      console.log('No direct relationships found from Memory to CodeEntity.');
    } else {
      for (const record of memoryToCodeResult.records) {
        const relType = record.get('relationshipType');
        const count = record.get('count');
        console.log(`\n- ${relType}: ${count} relationships`);
        
        // Get sample of this relationship type
        const sampleResult = await session.run(`
          MATCH (m:Memory)-[r:${relType}]->(c:CodeEntity)
          RETURN m.title as memoryTitle, 
                 m.id as memoryId,
                 c.name as codeEntityName, 
                 c.id as codeEntityId,
                 properties(r) as relProperties
          LIMIT 3
        `);
        
        console.log('  Sample relationships:');
        sampleResult.records.forEach((sample, idx) => {
          console.log(`  ${idx + 1}. Memory: "${sample.get('memoryTitle')}" (${sample.get('memoryId').substring(0, 8)}...)`);
          console.log(`     → CodeEntity: "${sample.get('codeEntityName')}" (${sample.get('codeEntityId').substring(0, 8)}...)`);
          const props = sample.get('relProperties');
          if (props && Object.keys(props).length > 0) {
            console.log(`     Properties:`, props);
          }
        });
      }
    }

    // 3. Check CodeEntity to Memory relationships (reverse)
    console.log('\n3. CodeEntity → Memory Relationships:');
    console.log('----------------------------------------');
    const codeToMemoryResult = await session.run(`
      MATCH (c:CodeEntity)-[r]->(m:Memory)
      RETURN DISTINCT type(r) as relationshipType, COUNT(r) as count
      ORDER BY count DESC
    `);
    
    if (codeToMemoryResult.records.length === 0) {
      console.log('No direct relationships found from CodeEntity to Memory.');
    } else {
      codeToMemoryResult.records.forEach(record => {
        console.log(`- ${record.get('relationshipType')}: ${record.get('count')} relationships`);
      });
    }

    // 4. Check CodeEntity to CodeEntity relationships
    console.log('\n4. CodeEntity → CodeEntity Relationships:');
    console.log('----------------------------------------');
    const codeToCodeResult = await session.run(`
      MATCH (c1:CodeEntity)-[r]->(c2:CodeEntity)
      RETURN DISTINCT type(r) as relationshipType, COUNT(r) as count
      ORDER BY count DESC
    `);
    
    if (codeToCodeResult.records.length === 0) {
      console.log('No relationships found between CodeEntity nodes.');
    } else {
      for (const record of codeToCodeResult.records) {
        const relType = record.get('relationshipType');
        const count = record.get('count');
        console.log(`\n- ${relType}: ${count} relationships`);
        
        // Get sample of this relationship type
        const sampleResult = await session.run(`
          MATCH (c1:CodeEntity)-[r:${relType}]->(c2:CodeEntity)
          RETURN c1.name as fromEntity, 
                 c1.type as fromType,
                 c2.name as toEntity,
                 c2.type as toType,
                 properties(r) as relProperties
          LIMIT 3
        `);
        
        console.log('  Sample relationships:');
        sampleResult.records.forEach((sample, idx) => {
          console.log(`  ${idx + 1}. ${sample.get('fromEntity')} (${sample.get('fromType')})`);
          console.log(`     → ${sample.get('toEntity')} (${sample.get('toType')})`);
          const props = sample.get('relProperties');
          if (props && Object.keys(props).length > 0) {
            console.log(`     Properties:`, props);
          }
        });
      }
    }

    // 5. Check for specific relationship types
    console.log('\n5. Checking for Specific Relationship Types:');
    console.log('----------------------------------------');
    const specificTypes = ['REFERENCES_CODE', 'DISCUSSES_CODE', 'RELATES_TO', 'SIMILAR_TO', 'MENTIONED_IN'];
    
    for (const relType of specificTypes) {
      const result = await session.run(`
        MATCH ()-[r:${relType}]->()
        RETURN COUNT(r) as count
      `);
      const count = result.records[0]?.get('count') || 0;
      console.log(`- ${relType}: ${count} relationships`);
    }

    // 6. Check bidirectional relationships
    console.log('\n6. Bidirectional Relationships (Memory ↔ CodeEntity):');
    console.log('----------------------------------------');
    const bidirectionalResult = await session.run(`
      MATCH (m:Memory)-[r]-(c:CodeEntity)
      RETURN DISTINCT type(r) as relationshipType, 
             COUNT(DISTINCT id(r)) as count,
             COUNT(DISTINCT CASE WHEN startNode(r) = m THEN id(r) END) as memoryToCode,
             COUNT(DISTINCT CASE WHEN startNode(r) = c THEN id(r) END) as codeToMemory
      ORDER BY count DESC
    `);
    
    if (bidirectionalResult.records.length === 0) {
      console.log('No relationships found between Memory and CodeEntity nodes.');
    } else {
      bidirectionalResult.records.forEach(record => {
        const relType = record.get('relationshipType');
        const total = record.get('count');
        const m2c = record.get('memoryToCode');
        const c2m = record.get('codeToMemory');
        console.log(`- ${relType}: ${total} total (Memory→Code: ${m2c}, Code→Memory: ${c2m})`);
      });
    }

    // 7. Check for any pattern-related relationships
    console.log('\n7. Pattern-Related Relationships:');
    console.log('----------------------------------------');
    const patternResult = await session.run(`
      MATCH (n)-[r]->(p:Pattern)
      RETURN DISTINCT labels(n) as sourceLabels, type(r) as relationshipType, COUNT(r) as count
      ORDER BY count DESC
      UNION
      MATCH (p:Pattern)-[r]->(n)
      RETURN DISTINCT labels(n) as targetLabels, type(r) as relationshipType, COUNT(r) as count
      ORDER BY count DESC
    `);
    
    if (patternResult.records.length === 0) {
      console.log('No Pattern node relationships found.');
    } else {
      patternResult.records.forEach(record => {
        const labels = record.get('sourceLabels') || record.get('targetLabels');
        const relType = record.get('relationshipType');
        const count = record.get('count');
        console.log(`- ${labels.join(',')} ↔ Pattern via ${relType}: ${count} relationships`);
      });
    }

  } catch (error) {
    console.error('Error checking relationship types:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the check
checkRelationshipTypes().catch(console.error);