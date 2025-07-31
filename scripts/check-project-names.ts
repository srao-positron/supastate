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

async function checkProjectNames() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD!)
  );

  const session = driver.session();

  try {
    console.log('=== Checking Project Names in Neo4j ===\n');

    // Check Memory project names
    console.log('Memory project names:');
    const memoryResult = await session.run(`
      MATCH (m:Memory)
      RETURN DISTINCT m.project_name as project_name, count(m) as count
      ORDER BY count DESC
    `);

    memoryResult.records.forEach(record => {
      const projectName = record.get('project_name');
      const count = record.get('count').toNumber();
      console.log(`  ${projectName}: ${count} memories`);
    });

    // Check CodeEntity project names
    console.log('\nCodeEntity project names:');
    const codeResult = await session.run(`
      MATCH (c:CodeEntity)
      RETURN DISTINCT c.project_name as project_name, count(c) as count
      ORDER BY count DESC
    `);

    codeResult.records.forEach(record => {
      const projectName = record.get('project_name');
      const count = record.get('count').toNumber();
      console.log(`  ${projectName}: ${count} code entities`);
    });

    // Check for any project names with "edison" or "maxwell"
    console.log('\nSearching for specific project patterns:');
    const patternResult = await session.run(`
      MATCH (n)
      WHERE n.project_name CONTAINS 'edison' OR n.project_name CONTAINS 'maxwell'
      RETURN DISTINCT n.project_name as project_name, labels(n)[0] as label, count(n) as count
      ORDER BY project_name
    `);

    if (patternResult.records.length > 0) {
      console.log('\nFound project names containing "edison" or "maxwell":');
      patternResult.records.forEach(record => {
        const projectName = record.get('project_name');
        const label = record.get('label');
        const count = record.get('count').toNumber();
        console.log(`  ${projectName} (${label}): ${count} nodes`);
      });
    }

    // Sample some actual content to see the pattern
    console.log('\n=== Sample Memory Content ===');
    const sampleResult = await session.run(`
      MATCH (m:Memory)
      WHERE m.project_name CONTAINS 'edison' OR m.project_name CONTAINS 'maxwell'
      RETURN m.project_name, m.content, m.created_at
      ORDER BY m.created_at DESC
      LIMIT 5
    `);

    sampleResult.records.forEach((record, idx) => {
      const projectName = record.get('m.project_name');
      const content = record.get('m.content');
      const createdAt = record.get('m.created_at');
      console.log(`\nSample ${idx + 1}:`);
      console.log(`  Project: ${projectName}`);
      console.log(`  Created: ${createdAt}`);
      console.log(`  Content: ${content?.substring(0, 100)}...`);
    });

  } catch (error) {
    console.error('Error checking project names:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

checkProjectNames().catch(console.error);