#!/usr/bin/env npx tsx

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

async function findChunkConstraint() {
  console.log('=== Finding All Tables/Constraints with Chunk IDs ===\n')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // The error message mentioned: "memories_workspace_chunk_unique"
  // This suggests there's a unique constraint on workspace_id + chunk_id
  
  // Let's check ALL tables in the database
  console.log('Checking all tables in the database...\n')
  
  // Query to find all tables
  const { data: tables, error } = await supabase.rpc('get_all_tables')
  
  if (error) {
    // Try a different approach - check information_schema
    console.log('Checking via raw SQL query...')
    
    // Let's look for any table that might have chunk_id column
    const query = `
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE column_name LIKE '%chunk%' 
         OR column_name LIKE '%session%'
      ORDER BY table_name;
    `
    
    console.log('Tables with chunk/session columns:')
    console.log('(Run this query in Supabase SQL Editor)')
    console.log(query)
  }
  
  // Check specific tables that might cache chunk IDs
  const suspectTables = [
    'memories',
    'memory_cache',
    'chunk_registry',
    'processed_chunks',
    'ingestion_cache',
    'deduplication_cache',
    'chunk_hashes',
    'content_hashes'
  ]
  
  console.log('\nChecking suspect tables:')
  for (const table of suspectTables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        
      if (!error) {
        console.log(`✓ ${table}: ${count} records`)
        
        if (count > 0) {
          // Get a sample
          const { data: sample } = await supabase
            .from(table)
            .select('*')
            .limit(1)
            
          if (sample && sample.length > 0) {
            const columns = Object.keys(sample[0])
            console.log(`  Columns: ${columns.join(', ')}`)
          }
        }
      } else if (error.code !== '42P01') { // 42P01 = table doesn't exist
        console.log(`! ${table}: Error - ${error.message}`)
      }
    } catch (e) {
      // Table doesn't exist
    }
  }
  
  // Check for the constraint itself
  console.log('\n=== Constraint Information ===')
  console.log('Run this in Supabase SQL Editor to find the constraint:')
  console.log(`
SELECT 
    tc.table_name, 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_name LIKE '%chunk%' 
   OR tc.constraint_name LIKE '%workspace_chunk%'
ORDER BY tc.table_name;
  `)
  
  // Check if there's a materialized view or something
  console.log('\n=== Check for Views/Materialized Views ===')
  console.log('Run this in SQL Editor:')
  console.log(`
SELECT schemaname, viewname 
FROM pg_views 
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND (viewname LIKE '%chunk%' OR viewname LIKE '%memory%');
  `)
}

findChunkConstraint().catch(console.error)