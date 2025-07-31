#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js';
import neo4j from 'neo4j-driver';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const neo4jUri = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io';
const neo4jUser = process.env.NEO4J_USER || 'neo4j';
const neo4jPassword = process.env.NEO4J_PASSWORD;

if (!supabaseUrl || !supabaseServiceKey || !neo4jPassword) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword));

async function checkCodeMetadata() {
  const session = driver.session();
  
  try {
    // Find a TypeScript CodeEntity with functions in metadata
    const result = await session.run(`
      MATCH (c:CodeEntity)
      WHERE c.language = 'typescript' 
        AND c.metadata IS NOT NULL
        AND c.metadata CONTAINS 'functions'
      RETURN c.id as id, 
             c.name as name, 
             c.path as path, 
             c.metadata as metadata
      LIMIT 5
    `);

    console.log('=== TypeScript Code Entities with Functions ===\n');

    for (const record of result.records) {
      const id = record.get('id');
      const name = record.get('name');
      const path = record.get('path');
      const metadataStr = record.get('metadata');
      
      console.log(`Entity: ${name}`);
      console.log(`Path: ${path}`);
      console.log(`ID: ${id}`);
      
      try {
        const metadata = JSON.parse(metadataStr);
        
        if (metadata.functions && metadata.functions.length > 0) {
          console.log('\nFunctions found:');
          metadata.functions.forEach((fn: any, idx: number) => {
            console.log(`  ${idx + 1}. ${fn.name}`);
            console.log(`     - Async: ${fn.async}`);
            console.log(`     - Generator: ${fn.generator}`);
            console.log(`     - Parameters: ${JSON.stringify(fn.params)}`);
            // Check if any type information exists
            if (fn.returnType) {
              console.log(`     - Return Type: ${fn.returnType}`);
            }
            if (fn.paramTypes) {
              console.log(`     - Parameter Types: ${JSON.stringify(fn.paramTypes)}`);
            }
          });
        }
        
        if (metadata.classes && metadata.classes.length > 0) {
          console.log('\nClasses found:');
          metadata.classes.forEach((cls: any, idx: number) => {
            console.log(`  ${idx + 1}. ${cls.name}`);
            console.log(`     - Extends: ${cls.extends || 'none'}`);
            console.log(`     - Methods: ${cls.methods ? cls.methods.join(', ') : 'none'}`);
          });
        }
        
        if (metadata.types && metadata.types.length > 0) {
          console.log('\nTypes/Interfaces found:');
          metadata.types.forEach((type: any, idx: number) => {
            console.log(`  ${idx + 1}. ${type.name} (${type.kind})`);
          });
        }
        
        // Check for any parsed structure that might have type info
        console.log('\nFull metadata keys:', Object.keys(metadata));
        
      } catch (err) {
        console.log('Error parsing metadata:', err);
      }
      
      console.log('\n' + '='.repeat(60) + '\n');
    }

    // Now check if there are any Function or Class nodes (separate from CodeEntity)
    console.log('\n=== Checking for separate Function/Class nodes ===\n');
    
    const functionNodes = await session.run(`
      MATCH (f:Function)
      RETURN count(f) as count
    `);
    
    const classNodes = await session.run(`
      MATCH (c:Class)
      RETURN count(c) as count
    `);
    
    console.log(`Function nodes in Neo4j: ${functionNodes.records[0].get('count')}`);
    console.log(`Class nodes in Neo4j: ${classNodes.records[0].get('count')}`);
    
    // Check what node labels exist
    const labels = await session.run(`
      CALL db.labels()
      YIELD label
      WHERE label IN ['Function', 'Class', 'Interface', 'Type', 'Method']
      RETURN collect(label) as labels
    `);
    
    console.log(`\nCode-related node labels in Neo4j: ${labels.records[0].get('labels').join(', ') || 'None found'}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the check
checkCodeMetadata();