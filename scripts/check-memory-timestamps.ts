import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_PASSWORD) {
  console.error('NEO4J_PASSWORD is not set in environment variables');
  process.exit(1);
}

async function checkMemoryTimestamps() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!));
  const session = driver.session();

  try {
    console.log('Connecting to Neo4j...');
    console.log(`URI: ${NEO4J_URI}`);
    
    const query = `
      MATCH (m:Memory)
      RETURN m.created_at as created_at, m.occurred_at as occurred_at, m.content as content
      ORDER BY m.created_at DESC
      LIMIT 5
    `;
    
    console.log('\nRunning query to check memory timestamps...\n');
    
    const result = await session.run(query);
    
    if (result.records.length === 0) {
      console.log('No memories found in the database.');
      return;
    }
    
    console.log(`Found ${result.records.length} memories:\n`);
    
    result.records.forEach((record, index) => {
      const created_at = record.get('created_at');
      const occurred_at = record.get('occurred_at');
      const content = record.get('content');
      
      console.log(`Memory ${index + 1}:`);
      console.log(`  Created at:  ${created_at || 'NULL'}`);
      console.log(`  Occurred at: ${occurred_at || 'NULL'}`);
      console.log(`  Content:     ${content ? content.substring(0, 100) + '...' : 'NULL'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error querying Neo4j:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the check
checkMemoryTimestamps();