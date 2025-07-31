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

async function findUserMemories() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    // First check all workspace IDs
    console.log('=== All Workspace IDs in Memory nodes ===\n');
    
    const wsResult = await session.run(`
      MATCH (m:Memory)
      RETURN DISTINCT m.workspace_id as workspace_id, count(m) as count
      ORDER BY count DESC
    `);

    console.log('Workspace IDs found:');
    wsResult.records.forEach(record => {
      const wsId = record.get('workspace_id');
      const count = record.get('count').toNumber();
      console.log(`  ${wsId || 'NULL'}: ${count} memories`);
    });

    // Check user_id field
    console.log('\n=== All User IDs in Memory nodes ===\n');
    
    const userResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.user_id IS NOT NULL
      RETURN DISTINCT m.user_id as user_id, count(m) as count
      ORDER BY count DESC
    `);

    console.log('User IDs found:');
    userResult.records.forEach(record => {
      const userId = record.get('user_id');
      const count = record.get('count').toNumber();
      console.log(`  ${userId}: ${count} memories`);
    });

    // Check for your specific user ID
    console.log('\n=== Searching for user a02c3fed-3a24-442f-becc-97bac8b75e90 ===\n');
    
    const yourResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.user_id = 'a02c3fed-3a24-442f-becc-97bac8b75e90' 
         OR m.workspace_id = 'user:a02c3fed-3a24-442f-becc-97bac8b75e90'
         OR m.workspace_id = 'a02c3fed-3a24-442f-becc-97bac8b75e90'
      RETURN m.id as id, m.workspace_id as workspace_id, m.user_id as user_id, m.occurred_at as occurred_at
      LIMIT 10
    `);

    if (yourResult.records.length > 0) {
      console.log(`Found ${yourResult.records.length} memories for your user:`);
      yourResult.records.forEach(record => {
        console.log(`  ID: ${record.get('id')}`);
        console.log(`  workspace_id: ${record.get('workspace_id')}`);
        console.log(`  user_id: ${record.get('user_id')}`);
        console.log(`  occurred_at: ${record.get('occurred_at')}`);
        console.log('');
      });
    } else {
      console.log('No memories found for user a02c3fed-3a24-442f-becc-97bac8b75e90');
    }

    // Get total count
    console.log('\n=== Total Memory Count ===');
    const totalResult = await session.run(`
      MATCH (m:Memory)
      RETURN count(m) as total
    `);
    const total = totalResult.records[0].get('total').toNumber();
    console.log(`Total memories in database: ${total}`);

  } catch (error) {
    console.error('Error querying Neo4j:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

findUserMemories().catch(console.error);