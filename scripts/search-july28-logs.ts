import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function searchJuly28Logs() {
  console.log('Searching for pattern detection activity on July 28, 2025 around 8:48 PM PST...');
  
  // 8:48 PM PST = 3:48 AM UTC next day (PST is UTC-8 in summer)
  const targetTimeUTC = '2025-07-29T03:48:00.000Z';
  const startTime = '2025-07-29T03:40:00.000Z'; // 8 minutes before
  const endTime = '2025-07-29T03:56:00.000Z';   // 8 minutes after
  
  console.log(`\nSearching time range (UTC): ${startTime} to ${endTime}`);
  console.log('(This is 8:40 PM to 8:56 PM PST on July 28)\n');

  // Get all logs in this time window
  const { data: logs, error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${logs?.length || 0} logs in time range:\n`);
  
  if (logs && logs.length > 0) {
    // Group by batch
    const batches = new Map();
    logs.forEach(log => {
      const batch = log.batch_id || 'no-batch';
      if (!batches.has(batch)) {
        batches.set(batch, []);
      }
      batches.get(batch).push(log);
    });

    console.log(`Found ${batches.size} unique batch(es):\n`);
    
    batches.forEach((batchLogs, batchId) => {
      console.log(`\nBatch: ${batchId}`);
      console.log(`  Log count: ${batchLogs.length}`);
      
      // Show key events for this batch
      batchLogs.forEach(log => {
        const timestamp = new Date(log.created_at);
        const pstTime = new Date(timestamp.getTime() - 8 * 60 * 60 * 1000);
        console.log(`  [${pstTime.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })} PST] ${log.level}: ${log.message}`);
        
        if (log.pattern_type) console.log(`    Pattern Type: ${log.pattern_type}`);
        if (log.entity_count) console.log(`    Entity Count: ${log.entity_count}`);
        if (log.details) console.log(`    Details: ${JSON.stringify(log.details)}`);
        if (log.error_stack) console.log(`    Error: ${log.error_stack}`);
      });
    });
  }

  // Also check for any EntitySummary mentions
  console.log('\n\nChecking for EntitySummary activity...');
  const { data: summaryLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .ilike('message', '%summar%')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: true });

  if (summaryLogs && summaryLogs.length > 0) {
    console.log(`\nFound ${summaryLogs.length} logs mentioning summaries:`);
    summaryLogs.forEach(log => {
      console.log(`  [${log.created_at}] ${log.message}`);
    });
  } else {
    console.log('No logs mentioning summaries found in this time range.');
  }

  // Check if there's any pattern detection activity just before this time
  console.log('\n\nChecking for pattern detection activity in the hour before...');
  const hourBefore = '2025-07-29T02:48:00.000Z';
  
  const { data: beforeLogs } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', hourBefore)
    .lt('created_at', startTime)
    .order('created_at', { ascending: false })
    .limit(20);

  if (beforeLogs && beforeLogs.length > 0) {
    console.log(`\nFound ${beforeLogs.length} logs in the hour before:`);
    // Group by batch to see what was happening
    const beforeBatches = new Set();
    beforeLogs.forEach(log => {
      if (log.batch_id) beforeBatches.add(log.batch_id);
    });
    console.log(`  Unique batches: ${beforeBatches.size}`);
    console.log(`  Latest log: ${beforeLogs[0].created_at}`);
    console.log(`  Earliest log: ${beforeLogs[beforeLogs.length - 1].created_at}`);
  }
}

searchJuly28Logs().catch(console.error);