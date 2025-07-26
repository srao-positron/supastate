const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkFunctionLogs() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  console.log('Checking function logs...\n');
  
  // Get recent logs for process-code function
  const { data: logs, error } = await supabase
    .from('function_logs')
    .select('*')
    .eq('function_name', 'process-code')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error fetching logs:', error);
    return;
  }
  
  if (!logs || logs.length === 0) {
    console.log('No logs found');
    return;
  }
  
  // Display logs
  for (const log of logs) {
    console.log('='.repeat(80));
    console.log(`Time: ${log.created_at}`);
    console.log(`Level: ${log.level}`);
    console.log(`Event: ${log.event_message}`);
    if (log.metadata) {
      console.log(`Metadata:`, JSON.stringify(log.metadata, null, 2));
    }
    console.log();
  }
}

checkFunctionLogs().catch(console.error);