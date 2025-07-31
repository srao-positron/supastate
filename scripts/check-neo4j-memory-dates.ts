import { Neo4jService } from '../src/lib/neo4j/client.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkNeo4jMemoryDates() {
  const neo4j = new Neo4jService();
  
  try {
    console.log('Checking Memory nodes in Neo4j...\n');
    
    // Get a sample of Memory nodes
    const result = await neo4j.query(`
      MATCH (m:Memory)
      RETURN m.id as id, 
             m.user_id as user_id,
             m.workspace_id as workspace_id,
             m.occurred_at as occurred_at,
             m.created_at as created_at,
             m.metadata as metadata,
             m.startTime as startTime,
             m.endTime as endTime
      ORDER BY m.created_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${result.length} Memory nodes\n`);
    
    result.forEach((record, index) => {
      console.log(`\n--- Memory #${index + 1} ---`);
      console.log(`ID: ${record.id}`);
      console.log(`User ID: ${record.user_id}`);
      console.log(`Workspace ID: ${record.workspace_id || 'NULL'}`);
      console.log(`Occurred At: ${record.occurred_at || 'NULL'}`);
      console.log(`Created At: ${record.created_at}`);
      console.log(`StartTime property: ${record.startTime || 'NULL'}`);
      console.log(`EndTime property: ${record.endTime || 'NULL'}`);
      
      if (record.metadata) {
        console.log(`\nMetadata:`);
        const metadata = typeof record.metadata === 'string' 
          ? JSON.parse(record.metadata) 
          : record.metadata;
        console.log(JSON.stringify(metadata, null, 2));
        
        // Check metadata fields
        console.log(`\nMetadata Analysis:`);
        console.log(`- Has metadata.startTime: ${metadata.startTime ? 'YES' : 'NO'}`);
        console.log(`- Metadata startTime: ${metadata.startTime || 'N/A'}`);
        console.log(`- Has metadata.endTime: ${metadata.endTime ? 'YES' : 'NO'}`);
        console.log(`- Metadata endTime: ${metadata.endTime || 'N/A'}`);
      } else {
        console.log(`\nNo metadata found`);
      }
    });
    
    // Summary statistics
    console.log(`\n\n=== NEO4J SUMMARY ===`);
    const summaryResult = await neo4j.query(`
      MATCH (m:Memory)
      WITH m
      LIMIT 1000
      RETURN 
        count(m) as total,
        count(m.occurred_at) as with_occurred_at,
        count(m.startTime) as with_startTime,
        count(m.endTime) as with_endTime
    `);
    
    if (summaryResult[0]) {
      const summary = summaryResult[0];
      console.log(`Total Memory nodes (sample of 1000): ${summary.total}`);
      console.log(`Nodes with occurred_at: ${summary.with_occurred_at}`);
      console.log(`Nodes with startTime property: ${summary.with_startTime}`);
      console.log(`Nodes with endTime property: ${summary.with_endTime}`);
    }
    
    // Check all properties of a Memory node
    console.log(`\n\n=== ALL PROPERTIES OF A MEMORY NODE ===`);
    const propsResult = await neo4j.query(`
      MATCH (m:Memory)
      WITH m LIMIT 1
      RETURN keys(m) as properties
    `);
    
    if (propsResult[0]) {
      console.log(`Properties: ${propsResult[0].properties.join(', ')}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await neo4j.disconnect();
  }
}

checkNeo4jMemoryDates().catch(console.error);
EOF < /dev/null