import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// This script shows how to query Supabase logs
// Note: The function_logs table is accessed through Supabase's platform API, not the regular database

const PROJECT_ID = process.env.SUPABASE_PROJECT_ID || 'zqlfxakbkwssxfynrmnk';

console.log('=== Supabase Edge Function Logs Query ===\n');

console.log('To view edge function logs, use one of these methods:\n');

console.log('1. Supabase Dashboard:');
console.log(`   https://supabase.com/dashboard/project/${PROJECT_ID}/logs/edge-functions\n`);

console.log('2. Using psql with the analytics connection:');
console.log('   Note: You need to connect to the analytics endpoint, not the regular database\n');

console.log('3. SQL queries to use in Supabase SQL Editor:');
console.log('   (Go to SQL Editor in Supabase Dashboard)\n');

const queries = [
  {
    name: 'View all recent logs',
    sql: `select 
  id, 
  function_logs.timestamp, 
  event_message, 
  metadata.event_type, 
  metadata.function_id, 
  metadata.level
from function_logs
cross join unnest(metadata) as metadata
order by timestamp desc
limit 100`
  },
  {
    name: 'Search for memory/ingestion related logs',
    sql: `select 
  id, 
  function_logs.timestamp, 
  event_message, 
  metadata.level,
  metadata.error_type
from function_logs
cross join unnest(metadata) as metadata
where event_message like '%memory%' 
   or event_message like '%ingest%'
   or event_message like '%occurred_at%'
   or event_message like '%workspace_id%'
order by timestamp desc
limit 100`
  },
  {
    name: 'Find errors and warnings',
    sql: `select 
  id, 
  function_logs.timestamp, 
  event_message, 
  metadata.level,
  metadata.error_type,
  metadata.function_id
from function_logs
cross join unnest(metadata) as metadata
where metadata.level in ('error', 'warning')
order by timestamp desc
limit 100`
  },
  {
    name: 'Check specific function logs (replace FUNCTION_ID)',
    sql: `select 
  id, 
  function_logs.timestamp, 
  event_message, 
  metadata.event_type, 
  metadata.function_id, 
  metadata.level
from function_logs
cross join unnest(metadata) as metadata
where metadata.function_id = 'YOUR_FUNCTION_ID'
order by timestamp desc
limit 100`
  }
];

queries.forEach((query, index) => {
  console.log(`${index + 1}. ${query.name}:`);
  console.log('```sql');
  console.log(query.sql);
  console.log('```\n');
});

console.log('=== Direct API Access ===\n');
console.log('The Supabase Console uses this API endpoint:');
console.log(`https://api.supabase.com/platform/projects/${PROJECT_ID}/analytics/endpoints/logs.all\n`);

console.log('Parameters:');
console.log('- sql: Your SQL query (URL encoded)');
console.log('- iso_timestamp_start: Start time filter (optional)');
console.log('- iso_timestamp_end: End time filter (optional)\n');

console.log('Note: This requires platform authentication, typically done through the Supabase Dashboard.\n');

console.log('=== Alternative: Check Recent API Logs ===\n');
console.log('You can also check the application logs by running:');
console.log('1. Check Vercel logs: vercel logs');
console.log('2. Check local logs: Look for console output when running npm run dev');
console.log('3. Check Neo4j ingestion logs in the terminal\n');

// Create a helper function to encode SQL for URL
function encodeSQLForURL(sql: string): string {
  return encodeURIComponent(sql);
}

console.log('=== Example: Copy this URL to browser (while logged into Supabase Dashboard) ===\n');
const exampleSQL = queries[1].sql; // Memory/ingestion related logs
const encodedSQL = encodeSQLForURL(exampleSQL);
console.log(`https://supabase.com/dashboard/project/${PROJECT_ID}/sql/new?query=${encodedSQL}\n`);