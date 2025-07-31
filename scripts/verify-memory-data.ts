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

async function verifyMemoryData() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    console.log('=== Verifying Memory Data ===\n');

    // 1. Check total memory count
    const countResult = await session.run(`
      MATCH (m:Memory)
      RETURN count(m) as total
    `);
    const totalMemories = countResult.records[0].get('total').toNumber();
    console.log(`Total memories in database: ${totalMemories}\n`);

    // 2. Check workspace_id distribution
    console.log('=== Workspace ID Distribution ===');
    const wsResult = await session.run(`
      MATCH (m:Memory)
      RETURN m.workspace_id as workspace_id, count(m) as count
      ORDER BY count DESC
    `);

    wsResult.records.forEach(record => {
      const wsId = record.get('workspace_id');
      const count = record.get('count').toNumber();
      console.log(`  ${wsId || 'NULL'}: ${count} memories`);
    });

    // 3. Check occurred_at distribution
    console.log('\n=== Occurred At Analysis ===');
    const occurredResult = await session.run(`
      MATCH (m:Memory)
      RETURN 
        count(CASE WHEN m.occurred_at IS NOT NULL THEN 1 END) as withOccurredAt,
        count(CASE WHEN m.occurred_at IS NULL THEN 1 END) as withoutOccurredAt
    `);
    
    const occurredRecord = occurredResult.records[0];
    console.log(`  With occurred_at: ${occurredRecord.get('withOccurredAt').toNumber()}`);
    console.log(`  Without occurred_at: ${occurredRecord.get('withoutOccurredAt').toNumber()}`);

    // 4. Sample some memories to check data
    console.log('\n=== Sample Memory Data (5 most recent) ===');
    const sampleResult = await session.run(`
      MATCH (m:Memory)
      RETURN m
      ORDER BY m.created_at DESC
      LIMIT 5
    `);

    sampleResult.records.forEach((record, idx) => {
      const memory = record.get('m').properties;
      console.log(`\nMemory ${idx + 1}:`);
      console.log(`  ID: ${memory.id}`);
      console.log(`  Workspace ID: ${memory.workspace_id || 'NULL'}`);
      console.log(`  User ID: ${memory.user_id || 'NULL'}`);
      console.log(`  Team ID: ${memory.team_id || 'NULL'}`);
      console.log(`  Project: ${memory.project_name}`);
      console.log(`  Type: ${memory.type || 'NULL'}`);
      console.log(`  Created At: ${memory.created_at}`);
      console.log(`  Occurred At: ${memory.occurred_at || 'NULL'}`);
      console.log(`  Content Hash: ${memory.content_hash || 'NULL'}`);
      console.log(`  Content: ${memory.content.substring(0, 100)}...`);
    });

    // 5. Check date distribution
    console.log('\n=== Date Distribution (by occurred_at) ===');
    const dateResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.occurred_at IS NOT NULL
      WITH date(datetime(m.occurred_at)) as day, count(m) as count
      RETURN day, count
      ORDER BY day DESC
      LIMIT 10
    `);

    if (dateResult.records.length > 0) {
      dateResult.records.forEach(record => {
        const day = record.get('day');
        const count = record.get('count').toNumber();
        console.log(`  ${day}: ${count} memories`);
      });
    } else {
      console.log('  No memories with valid occurred_at timestamps');
    }

    // 6. Check for specific user
    console.log('\n=== Checking for user a02c3fed-3a24-442f-becc-97bac8b75e90 ===');
    const userResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.user_id = 'a02c3fed-3a24-442f-becc-97bac8b75e90' 
         OR m.workspace_id = 'user:a02c3fed-3a24-442f-becc-97bac8b75e90'
      RETURN count(m) as count
    `);
    
    const userCount = userResult.records[0].get('count').toNumber();
    console.log(`  Found ${userCount} memories for this user`);

  } catch (error) {
    console.error('Error verifying memory data:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

verifyMemoryData().catch(console.error);