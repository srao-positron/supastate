const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkEdgeLogs() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  console.log('Checking edge function logs...\n');
  
  // Get recent logs from edge_logs table
  const { data: logs, error } = await supabase
    .from('edge_logs')
    .select('*')
    .ilike('path', '%process-code%')
    .order('timestamp', { ascending: false })
    .limit(20);
    
  if (error) {
    // Try another table name
    console.log('edge_logs not found, trying _analytics schema...');
    
    // Use raw SQL to query analytics schema
    const { data, error: sqlError } = await supabase
      .rpc('exec_sql', {
        query: `
          SELECT event_message, level, timestamp, metadata
          FROM _analytics.function_logs 
          WHERE metadata->>'function_name' = 'process-code'
          ORDER BY timestamp DESC 
          LIMIT 20
        `
      });
      
    if (sqlError) {
      console.error('Error fetching logs:', sqlError);
      
      // Let's check what tables exist
      const { data: tables } = await supabase
        .rpc('exec_sql', {
          query: `
            SELECT schemaname, tablename 
            FROM pg_tables 
            WHERE tablename LIKE '%log%' 
            OR tablename LIKE '%function%'
            ORDER BY schemaname, tablename
          `
        });
        
      if (tables) {
        console.log('\nAvailable log-related tables:');
        console.table(tables);
      }
      return;
    }
    
    if (data && data.length > 0) {
      console.log('Found logs in _analytics.function_logs:');
      data.forEach(log => {
        console.log('-'.repeat(80));
        console.log(`Time: ${log.timestamp}`);
        console.log(`Level: ${log.level}`);
        console.log(`Message: ${log.event_message}`);
        if (log.metadata) {
          console.log(`Metadata:`, JSON.stringify(log.metadata, null, 2));
        }
      });
    }
    return;
  }
  
  if (!logs || logs.length === 0) {
    console.log('No logs found');
    return;
  }
  
  // Display logs
  for (const log of logs) {
    console.log('='.repeat(80));
    console.log(`Time: ${log.timestamp}`);
    console.log(`Level: ${log.level || 'info'}`);
    console.log(`Path: ${log.path}`);
    console.log(`Status: ${log.status_code}`);
    if (log.error) {
      console.log(`Error:`, log.error);
    }
    console.log();
  }
}

checkEdgeLogs().catch(console.error);