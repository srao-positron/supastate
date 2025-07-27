import neo4j from 'neo4j-driver';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_PASSWORD) {
  console.error('NEO4J_PASSWORD not found in environment variables');
  process.exit(1);
}

async function runQueries() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    console.log('Checking code entities in Neo4j database...\n');

    // Query 1: Check for all code entities
    console.log('Query 1: Checking all CodeEntity nodes');
    const result1 = await session.run(`
      MATCH (e:CodeEntity)
      RETURN count(e) as totalEntities, 
             collect(DISTINCT e.type)[0..5] as sampleTypes, 
             collect(DISTINCT e.workspace_id)[0..5] as workspaceIds
    `);

    const record1 = result1.records[0];
    const totalEntities = record1.get('totalEntities').toNumber();
    const sampleTypes = record1.get('sampleTypes');
    const workspaceIds = record1.get('workspaceIds');

    console.log(`Total CodeEntity nodes: ${totalEntities}`);
    console.log(`Sample entity types: ${sampleTypes.join(', ') || 'None'}`);
    console.log(`Workspace IDs: ${workspaceIds.join(', ') || 'None'}`);
    console.log('');

    // Query 2: Check for entities linked to memories
    console.log('Query 2: Checking CodeEntity nodes linked to Memory nodes');
    const result2 = await session.run(`
      MATCH (m:Memory)-[:REFERENCES_CODE]->(e:CodeEntity)
      RETURN count(DISTINCT e) as linkedEntities, 
             count(DISTINCT m) as memoryCount
    `);

    const record2 = result2.records[0];
    const linkedEntities = record2.get('linkedEntities').toNumber();
    const memoryCount = record2.get('memoryCount').toNumber();

    console.log(`CodeEntity nodes linked to memories: ${linkedEntities}`);
    console.log(`Memory nodes with code references: ${memoryCount}`);
    console.log('');

    // Additional query to check relationship types
    console.log('Query 3: Checking all relationship types involving CodeEntity');
    const result3 = await session.run(`
      MATCH (e:CodeEntity)-[r]-()
      RETURN DISTINCT type(r) as relationshipType, count(r) as count
      ORDER BY count DESC
    `);

    if (result3.records.length > 0) {
      console.log('Relationship types:');
      result3.records.forEach(record => {
        const relType = record.get('relationshipType');
        const count = record.get('count').toNumber();
        console.log(`  ${relType}: ${count}`);
      });
    } else {
      console.log('No relationships found involving CodeEntity nodes');
    }
    console.log('');

    // Check for any nodes at all
    console.log('Query 4: Checking total node count');
    const result4 = await session.run(`
      MATCH (n)
      RETURN count(n) as totalNodes, collect(DISTINCT labels(n))[0..10] as nodeLabels
    `);

    const record4 = result4.records[0];
    const totalNodes = record4.get('totalNodes').toNumber();
    const nodeLabels = record4.get('nodeLabels').flat();

    console.log(`Total nodes in database: ${totalNodes}`);
    console.log(`Node labels: ${nodeLabels.join(', ') || 'None'}`);

  } catch (error) {
    console.error('Error running queries:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

runQueries().catch(console.error);