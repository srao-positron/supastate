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

async function testDashboardQuery() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    // Use the exact values from the dashboard
    const userId = 'a02c3fed-3a24-442f-becc-97bac8b75e90';
    const teamId = null; // Assuming no team for now
    const workspaceId = `user:${userId}`;
    const userWorkspaceId = `user:${userId}`;

    console.log('Testing the exact dashboard query...\n');
    console.log(`userId: ${userId}`);
    console.log(`teamId: ${teamId}`);
    console.log(`workspaceId: ${workspaceId}`);
    console.log(`userWorkspaceId: ${userWorkspaceId}`);
    console.log('');

    // Run the exact query from the dashboard
    console.log('Running the UNION query from dashboard...');
    const result = await session.run(`
      MATCH (e:CodeEntity)
      WHERE (e.workspace_id = $workspaceId 
             OR e.workspace_id = $userWorkspaceId
             OR e.user_id = $userId 
             OR e.team_id = $teamId)
      OPTIONAL MATCH (e)-[:DEFINED_IN]->(f:CodeFile)
      WITH e, f
      RETURN 
        COUNT(DISTINCT e) as totalEntities,
        COUNT(DISTINCT f.path) as totalFiles,
        COUNT(DISTINCT e.project_name) as totalProjects,
        COLLECT(DISTINCT e.type) as entityTypes,
        null as linkedEntities
      UNION
      MATCH (e:CodeEntity)<-[:REFERENCES_CODE]-(m:Memory)
      WHERE (e.workspace_id = $workspaceId 
             OR e.workspace_id = $userWorkspaceId
             OR e.user_id = $userId 
             OR e.team_id = $teamId)
      RETURN 
        null as totalEntities,
        null as totalFiles,
        null as totalProjects,
        null as entityTypes,
        COUNT(DISTINCT e) as linkedEntities
    `, { workspaceId, userWorkspaceId, userId, teamId });

    console.log(`Number of records returned: ${result.records.length}`);
    
    for (let i = 0; i < result.records.length; i++) {
      const record = result.records[i];
      console.log(`\nRecord ${i + 1}:`);
      console.log(`  totalEntities: ${record.get('totalEntities')}`);
      console.log(`  totalFiles: ${record.get('totalFiles')}`);
      console.log(`  totalProjects: ${record.get('totalProjects')}`);
      console.log(`  entityTypes: ${JSON.stringify(record.get('entityTypes'))}`);
      if (record.has('linkedEntities')) {
        console.log(`  linkedEntities: ${record.get('linkedEntities')}`);
      }
    }

    // Test the queries separately
    console.log('\n\nTesting queries separately...');
    
    // Query 1: Just count CodeEntity
    console.log('\nQuery 1: Simple count');
    const result1 = await session.run(`
      MATCH (e:CodeEntity)
      WHERE (e.workspace_id = $workspaceId 
             OR e.workspace_id = $userWorkspaceId
             OR e.user_id = $userId 
             OR e.team_id = $teamId)
      RETURN COUNT(DISTINCT e) as count
    `, { workspaceId, userWorkspaceId, userId, teamId });
    
    console.log(`CodeEntity count: ${result1.records[0].get('count').toNumber()}`);

    // Query 2: Check properties
    console.log('\nQuery 2: Check CodeEntity properties');
    const result2 = await session.run(`
      MATCH (e:CodeEntity)
      RETURN 
        e.workspace_id as workspace_id,
        e.user_id as user_id,
        e.team_id as team_id,
        count(e) as count
      ORDER BY count DESC
      LIMIT 5
    `);

    console.log('Sample CodeEntity properties:');
    result2.records.forEach(record => {
      console.log(`  workspace_id: ${record.get('workspace_id')}, user_id: ${record.get('user_id')}, team_id: ${record.get('team_id')}, count: ${record.get('count').toNumber()}`);
    });

  } catch (error) {
    console.error('Error running queries:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

testDashboardQuery().catch(console.error);