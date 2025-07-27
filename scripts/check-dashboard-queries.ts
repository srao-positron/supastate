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

async function runDashboardQueries() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    console.log('Running dashboard-style queries...\n');

    // Check the exact query the dashboard might be using
    console.log('Query 1: Count CodeEntity with workspace filter');
    const workspaceId = 'user:a02c3fed-3a24-442f-becc-97bac8b75e90';
    const result1 = await session.run(`
      MATCH (e:CodeEntity {workspace_id: $workspaceId})
      RETURN count(e) as count
    `, { workspaceId });

    const count1 = result1.records[0].get('count').toNumber();
    console.log(`CodeEntity count for workspace: ${count1}`);
    console.log('');

    // Check if there's a case sensitivity issue
    console.log('Query 2: Check all workspace_id values');
    const result2 = await session.run(`
      MATCH (e:CodeEntity)
      RETURN DISTINCT e.workspace_id as workspace_id, count(e) as count
      ORDER BY count DESC
    `);

    console.log('Workspace IDs in CodeEntity:');
    result2.records.forEach(record => {
      const wsId = record.get('workspace_id');
      const count = record.get('count').toNumber();
      console.log(`  ${wsId}: ${count} entities`);
    });
    console.log('');

    // Check the relationship query as the dashboard might use it
    console.log('Query 3: Check REFERENCES_CODE relationship with workspace filter');
    const result3 = await session.run(`
      MATCH (m:Memory {workspace_id: $workspaceId})-[:REFERENCES_CODE]->(e:CodeEntity)
      RETURN count(DISTINCT e) as linkedEntities
    `, { workspaceId });

    const linkedCount = result3.records[0].get('linkedEntities').toNumber();
    console.log(`Linked entities count: ${linkedCount}`);
    console.log('');

    // Check if Memory nodes have workspace_id
    console.log('Query 4: Check Memory nodes with workspace_id');
    const result4 = await session.run(`
      MATCH (m:Memory)
      RETURN count(m) as total, 
             count(m.workspace_id) as withWorkspaceId,
             collect(DISTINCT m.workspace_id)[0..5] as sampleWorkspaceIds
    `);

    const record4 = result4.records[0];
    const totalMemories = record4.get('total').toNumber();
    const withWorkspaceId = record4.get('withWorkspaceId').toNumber();
    const sampleWorkspaceIds = record4.get('sampleWorkspaceIds');

    console.log(`Total Memory nodes: ${totalMemories}`);
    console.log(`Memory nodes with workspace_id: ${withWorkspaceId}`);
    console.log(`Sample workspace IDs: ${sampleWorkspaceIds.join(', ') || 'None'}`);
    console.log('');

    // Check the actual relationship
    console.log('Query 5: Check if REFERENCES_CODE relationship exists');
    const result5 = await session.run(`
      MATCH (m:Memory)-[r:REFERENCES_CODE]->(e:CodeEntity)
      RETURN count(r) as relationshipCount
    `);

    const relCount = result5.records[0].get('relationshipCount').toNumber();
    console.log(`REFERENCES_CODE relationships: ${relCount}`);

    // Alternative relationship check
    console.log('\nQuery 6: Check all relationships from Memory to CodeEntity');
    const result6 = await session.run(`
      MATCH (m:Memory)-[r]->(e:CodeEntity)
      RETURN type(r) as relType, count(r) as count
      ORDER BY count DESC
    `);

    if (result6.records.length > 0) {
      console.log('Relationships from Memory to CodeEntity:');
      result6.records.forEach(record => {
        const relType = record.get('relType');
        const count = record.get('count').toNumber();
        console.log(`  ${relType}: ${count}`);
      });
    } else {
      console.log('No relationships found from Memory to CodeEntity');
    }

  } catch (error) {
    console.error('Error running queries:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

runDashboardQueries().catch(console.error);