#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const neo4jUri = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io';
const neo4jUser = process.env.NEO4J_USER || 'neo4j';
const neo4jPassword = process.env.NEO4J_PASSWORD;

if (!neo4jPassword) {
  console.error('Missing NEO4J_PASSWORD');
  process.exit(1);
}

const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword));

async function checkFunctionNodes() {
  const session = driver.session();
  
  try {
    // Get a sample of Function nodes
    const result = await session.run(`
      MATCH (f:Function)
      RETURN f, labels(f) as labels
      LIMIT 5
    `);

    console.log('=== Sample Function Nodes ===\n');

    for (const record of result.records) {
      const func = record.get('f').properties;
      const labels = record.get('labels');
      
      console.log(`Function: ${func.name}`);
      console.log(`Labels: ${labels.join(', ')}`);
      console.log('Properties:');
      Object.entries(func).forEach(([key, value]) => {
        if (key !== 'content' && key !== 'embedding') { // Skip large fields
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      });
      
      // Check if it has metadata with type info
      if (func.metadata) {
        try {
          const metadata = JSON.parse(func.metadata);
          if (metadata.params || metadata.returns || metadata.paramTypes) {
            console.log('\nType Information in metadata:');
            console.log('  params:', metadata.params);
            console.log('  returns:', metadata.returns);
            console.log('  paramTypes:', metadata.paramTypes);
          }
        } catch (e) {
          // Not JSON
        }
      }
      
      console.log('\n' + '-'.repeat(60) + '\n');
    }

    // Check relationships from Function nodes
    console.log('\n=== Function Node Relationships ===\n');
    
    const relResult = await session.run(`
      MATCH (f:Function)-[r]->(target)
      RETURN type(r) as relType, labels(target) as targetLabels, count(*) as count
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log('Outgoing relationships from Function nodes:');
    for (const record of relResult.records) {
      console.log(`  ${record.get('relType')} -> ${record.get('targetLabels').join(',')} (${record.get('count')} times)`);
    }

    // Check if Functions are connected to CodeEntity
    const codeEntityRel = await session.run(`
      MATCH (f:Function)-[r]-(c:CodeEntity)
      RETURN type(r) as relType, count(*) as count
      LIMIT 5
    `);

    console.log('\nFunction <-> CodeEntity relationships:');
    for (const record of codeEntityRel.records) {
      console.log(`  ${record.get('relType')}: ${record.get('count')} times`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the check
checkFunctionNodes();