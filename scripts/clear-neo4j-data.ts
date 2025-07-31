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

async function clearNeo4jData() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    console.log('🚨 WARNING: This will delete ALL data from the Neo4j database!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    
    // Give user time to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Starting cleanup...\n');

    // Count current data
    console.log('=== Current Data Count ===');
    const countResult = await session.run(`
      MATCH (n)
      WITH labels(n)[0] as label, count(n) as count
      RETURN label, count
      ORDER BY count DESC
    `);

    if (countResult.records.length === 0) {
      console.log('Database is already empty.');
      return;
    }

    console.log('Current data:');
    let totalNodes = 0;
    countResult.records.forEach(record => {
      const label = record.get('label');
      const count = record.get('count').toNumber();
      totalNodes += count;
      console.log(`  ${label}: ${count} nodes`);
    });
    console.log(`  Total: ${totalNodes} nodes\n`);

    // Delete all relationships first
    console.log('Deleting all relationships...');
    const relResult = await session.run(`
      MATCH ()-[r]-()
      WITH count(r) as totalRels
      CALL apoc.periodic.iterate(
        "MATCH ()-[r]-() RETURN r",
        "DELETE r",
        {batchSize: 1000}
      ) YIELD batches, total
      RETURN batches, total, totalRels
    `);
    
    if (relResult.records.length > 0) {
      const record = relResult.records[0];
      console.log(`  Deleted ${record.get('total')} relationships in ${record.get('batches')} batches\n`);
    }

    // Delete all nodes
    console.log('Deleting all nodes...');
    const nodeResult = await session.run(`
      MATCH (n)
      WITH count(n) as totalNodes
      CALL apoc.periodic.iterate(
        "MATCH (n) RETURN n",
        "DELETE n",
        {batchSize: 1000}
      ) YIELD batches, total
      RETURN batches, total, totalNodes
    `);
    
    if (nodeResult.records.length > 0) {
      const record = nodeResult.records[0];
      console.log(`  Deleted ${record.get('total')} nodes in ${record.get('batches')} batches\n`);
    }

    // Verify deletion
    console.log('=== Verification ===');
    const verifyResult = await session.run(`
      MATCH (n)
      RETURN count(n) as nodeCount
    `);
    
    const remainingNodes = verifyResult.records[0].get('nodeCount').toNumber();
    if (remainingNodes === 0) {
      console.log('✅ All data successfully deleted!');
    } else {
      console.log(`⚠️  Warning: ${remainingNodes} nodes still remain in the database`);
    }

  } catch (error) {
    console.error('Error clearing Neo4j data:', error);
    
    // If APOC is not available, try simpler approach
    if (error instanceof Error && error.message?.includes('apoc')) {
      console.log('\nAPOC not available, trying simpler approach...\n');
      
      try {
        // Delete relationships
        console.log('Deleting all relationships...');
        await session.run(`MATCH ()-[r]-() DELETE r`);
        
        // Delete nodes
        console.log('Deleting all nodes...');
        await session.run(`MATCH (n) DELETE n`);
        
        console.log('✅ All data successfully deleted!');
      } catch (simpleError) {
        console.error('Error with simple deletion:', simpleError);
      }
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

clearNeo4jData().catch(console.error);