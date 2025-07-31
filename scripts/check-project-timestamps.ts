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

async function checkProjectTimestamps() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    console.log('=== Checking Project Creation Timestamps ===\n');

    // Check unique timestamps for each project
    console.log('Unique created_at timestamps by project:');
    
    const timestampResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.project_name IN ['edison', 'maxwell-edison']
      WITH m.project_name as project, m.created_at as timestamp, count(m) as count
      RETURN project, timestamp, count
      ORDER BY timestamp DESC, project
    `);

    const projectTimestamps: Record<string, Record<string, number>> = {};
    
    timestampResult.records.forEach(record => {
      const project = record.get('project');
      const timestamp = record.get('timestamp');
      const count = record.get('count').toNumber();
      
      if (!projectTimestamps[project]) {
        projectTimestamps[project] = {};
      }
      projectTimestamps[project][timestamp] = count;
    });

    Object.entries(projectTimestamps).forEach(([project, timestamps]) => {
      console.log(`\n${project}:`);
      Object.entries(timestamps).forEach(([timestamp, count]) => {
        console.log(`  ${timestamp}: ${count} memories`);
      });
      console.log(`  Total unique timestamps: ${Object.keys(timestamps).length}`);
    });

    // Check if there's a pattern in content_hash
    console.log('\n=== Checking for Duplicate Content ===');
    
    const duplicateResult = await session.run(`
      MATCH (m1:Memory {project_name: 'edison'})
      MATCH (m2:Memory {project_name: 'maxwell-edison'})
      WHERE m1.content = m2.content
      RETURN m1.id as edison_id, m2.id as maxwell_id, m1.content as content
      LIMIT 5
    `);

    if (duplicateResult.records.length > 0) {
      console.log('\nFound duplicate content between projects:');
      duplicateResult.records.forEach((record, idx) => {
        console.log(`\nDuplicate ${idx + 1}:`);
        console.log(`  Edison ID: ${record.get('edison_id')}`);
        console.log(`  Maxwell-Edison ID: ${record.get('maxwell_id')}`);
        console.log(`  Content: ${record.get('content')?.substring(0, 100)}...`);
      });
    } else {
      console.log('\nNo duplicate content found between projects');
    }

    // Check metadata
    console.log('\n=== Checking Metadata ===');
    
    const metadataResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.project_name IN ['edison', 'maxwell-edison']
      RETURN m.project_name as project, m.metadata as metadata
      LIMIT 10
    `);

    metadataResult.records.forEach((record, idx) => {
      const project = record.get('project');
      const metadata = record.get('metadata');
      if (metadata) {
        console.log(`\nMemory ${idx + 1} (${project}):`);
        console.log(`  Metadata: ${JSON.stringify(metadata, null, 2)}`);
      }
    });

  } catch (error) {
    console.error('Error checking project timestamps:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

checkProjectTimestamps().catch(console.error);