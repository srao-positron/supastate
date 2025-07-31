import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

async function checkCodeEntity() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );

  const session = driver.session();
  const entityId = '1ad528cf-589f-41d2-bee9-cd84dc7a07e1';

  try {
    console.log(`\n🔍 Investigating CodeEntity with ID: ${entityId}\n`);

    // 1. Find the entity and get all its properties
    console.log('1️⃣ Entity Properties:');
    console.log('=' .repeat(80));
    
    const entityResult = await session.run(`
      MATCH (c:CodeEntity {id: $entityId})
      RETURN c
    `, { entityId });

    if (entityResult.records.length === 0) {
      console.log(`❌ No CodeEntity found with ID: ${entityId}`);
      return;
    }

    const entity = entityResult.records[0].get('c').properties;
    console.log(JSON.stringify(entity, null, 2));

    const filePath = entity.path || entity.file_path;
    console.log(`\nFile Path: ${filePath}`);

    // 2. Check all relationships this entity has
    console.log('\n2️⃣ All Relationships:');
    console.log('=' .repeat(80));

    const relationshipsResult = await session.run(`
      MATCH (c:CodeEntity {id: $entityId})-[r]->(target)
      RETURN type(r) as relType, 
             labels(target) as targetLabels,
             target.id as targetId,
             target.name as targetName,
             target.path as targetPath,
             count(*) as count
      ORDER BY type(r), target.name
    `, { entityId });

    console.log('\nOutgoing relationships:');
    if (relationshipsResult.records.length === 0) {
      console.log('  No outgoing relationships found');
    } else {
      relationshipsResult.records.forEach(record => {
        const relType = record.get('relType');
        const targetLabels = record.get('targetLabels');
        const targetId = record.get('targetId');
        const targetName = record.get('targetName') || 'N/A';
        const targetPath = record.get('targetPath') || 'N/A';
        console.log(`  ${relType} -> ${targetLabels.join(':')} (${targetName})`);
        console.log(`    ID: ${targetId}`);
        if (targetPath !== 'N/A') {
          console.log(`    Path: ${targetPath}`);
        }
      });
    }

    // Check incoming relationships
    const incomingResult = await session.run(`
      MATCH (source)-[r]->(c:CodeEntity {id: $entityId})
      RETURN type(r) as relType,
             labels(source) as sourceLabels,
             source.id as sourceId,
             source.name as sourceName,
             source.path as sourcePath,
             count(*) as count
      ORDER BY type(r), source.name
    `, { entityId });

    console.log('\nIncoming relationships:');
    if (incomingResult.records.length === 0) {
      console.log('  No incoming relationships found');
    } else {
      incomingResult.records.forEach(record => {
        const relType = record.get('relType');
        const sourceLabels = record.get('sourceLabels');
        const sourceId = record.get('sourceId');
        const sourceName = record.get('sourceName') || 'N/A';
        const sourcePath = record.get('sourcePath') || 'N/A';
        console.log(`  ${sourceLabels.join(':')} (${sourceName}) -> ${relType}`);
        console.log(`    ID: ${sourceId}`);
        if (sourcePath !== 'N/A') {
          console.log(`    Path: ${sourcePath}`);
        }
      });
    }

    // 3. Check for relationship types summary
    console.log('\n3️⃣ Relationship Types Summary:');
    console.log('=' .repeat(80));

    const relTypesResult = await session.run(`
      MATCH (c:CodeEntity {id: $entityId})-[r]-(other)
      WITH type(r) as relType, 
           CASE WHEN startNode(r) = c THEN 'outgoing' ELSE 'incoming' END as direction,
           count(*) as count
      RETURN relType, direction, count
      ORDER BY relType, direction
    `, { entityId });

    relTypesResult.records.forEach(record => {
      const relType = record.get('relType');
      const direction = record.get('direction');
      const count = record.get('count').toNumber();
      console.log(`  ${relType} (${direction}): ${count}`);
    });

    // 4. Check for other entities with the same file_path
    console.log('\n4️⃣ Other CodeEntities with same file_path:');
    console.log('=' .repeat(80));

    const duplicatesResult = await session.run(`
      MATCH (c:CodeEntity {path: $filePath})
      RETURN c.id as id,
             c.name as name,
             c.type as type,
             c.created_at as created_at,
             c.user_id as user_id,
             c.workspace_id as workspace_id
      ORDER BY c.created_at DESC
    `, { filePath });

    console.log(`Found ${duplicatesResult.records.length} entities with path: ${filePath}\n`);
    
    duplicatesResult.records.forEach((record, index) => {
      const id = record.get('id');
      const name = record.get('name');
      const type = record.get('type');
      const createdAt = record.get('created_at');
      const userId = record.get('user_id');
      const workspaceId = record.get('workspace_id');
      
      console.log(`${index + 1}. ${id === entityId ? '→ ' : '  '}${name} (${type})`);
      console.log(`   ID: ${id}${id === entityId ? ' ← THIS ONE' : ''}`);
      console.log(`   Created: ${createdAt}`);
      console.log(`   User: ${userId || 'N/A'}`);
      console.log(`   Workspace: ${workspaceId || 'N/A'}`);
      console.log('');
    });

    // 5. Check specific relationship patterns
    console.log('5️⃣ Specific Relationship Patterns:');
    console.log('=' .repeat(80));

    // Check IMPORTS
    const importsResult = await session.run(`
      MATCH (c:CodeEntity {id: $entityId})-[:IMPORTS]->(imported)
      RETURN imported.name as name, imported.path as path
      ORDER BY imported.name
    `, { entityId });

    console.log('\nIMPORTS:');
    if (importsResult.records.length === 0) {
      console.log('  None');
    } else {
      importsResult.records.forEach(record => {
        console.log(`  - ${record.get('name')} from ${record.get('path')}`);
      });
    }

    // Check DEFINES_FUNCTION
    const functionsResult = await session.run(`
      MATCH (c:CodeEntity {id: $entityId})-[:DEFINES_FUNCTION]->(f)
      RETURN f.name as name
      ORDER BY f.name
    `, { entityId });

    console.log('\nDEFINES_FUNCTION:');
    if (functionsResult.records.length === 0) {
      console.log('  None');
    } else {
      functionsResult.records.forEach(record => {
        console.log(`  - ${record.get('name')}`);
      });
    }

    // Check REFERENCES_CODE
    const referencesResult = await session.run(`
      MATCH (c:CodeEntity {id: $entityId})-[:REFERENCES_CODE]->(ref)
      RETURN ref.name as name, ref.path as path, ref.type as type
      ORDER BY ref.name
    `, { entityId });

    console.log('\nREFERENCES_CODE:');
    if (referencesResult.records.length === 0) {
      console.log('  None');
    } else {
      referencesResult.records.forEach(record => {
        console.log(`  - ${record.get('name')} (${record.get('type')}) from ${record.get('path')}`);
      });
    }

    // 6. Check Function and Class nodes details
    console.log('\n6️⃣ Function and Class Node Details:');
    console.log('=' .repeat(80));

    // Check Function nodes
    const functionsDetailResult = await session.run(`
      MATCH (c:CodeEntity {id: $entityId})-[:DEFINES_FUNCTION]->(f:Function)
      RETURN f
      ORDER BY f.name
    `, { entityId });

    console.log('\nFunction Nodes:');
    if (functionsDetailResult.records.length === 0) {
      console.log('  None');
    } else {
      functionsDetailResult.records.forEach(record => {
        const func = record.get('f').properties;
        console.log(`\n  Function: ${func.name}`);
        console.log(`    Properties: ${JSON.stringify(func, null, 4)}`);
      });
    }

    // Check Class nodes
    const classesDetailResult = await session.run(`
      MATCH (c:CodeEntity {id: $entityId})-[:DEFINES_CLASS]->(cl:Class)
      RETURN cl
      ORDER BY cl.name
    `, { entityId });

    console.log('\nClass Nodes:');
    if (classesDetailResult.records.length === 0) {
      console.log('  None');
    } else {
      classesDetailResult.records.forEach(record => {
        const cls = record.get('cl').properties;
        console.log(`\n  Class: ${cls.name}`);
        console.log(`    Properties: ${JSON.stringify(cls, null, 4)}`);
      });
    }

    // 7. Check entity summaries
    console.log('\n7️⃣ Entity Summaries:');
    console.log('=' .repeat(80));

    const summariesResult = await session.run(`
      MATCH (c:CodeEntity {id: $entityId})-[:HAS_SUMMARY]->(s:EntitySummary)
      RETURN s.id as id,
             s.summary_type as type,
             s.content as content,
             s.created_at as created_at
      ORDER BY s.created_at DESC
    `, { entityId });

    if (summariesResult.records.length === 0) {
      console.log('  No summaries found');
    } else {
      summariesResult.records.forEach((record, index) => {
        console.log(`\nSummary ${index + 1}:`);
        console.log(`  ID: ${record.get('id')}`);
        console.log(`  Type: ${record.get('type')}`);
        console.log(`  Created: ${record.get('created_at')}`);
        const content = record.get('content');
        console.log(`  Content: ${content ? content.substring(0, 200) + '...' : 'No content'}`);
      });
    }

  } catch (error) {
    console.error('Error checking code entity:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the check
checkCodeEntity().catch(console.error);