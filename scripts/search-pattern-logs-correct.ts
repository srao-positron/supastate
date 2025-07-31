import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function searchPatternLogs() {
  console.log('Searching for pattern detection logs around 8:48 PM PST on July 28, 2025...\n');

  // Convert 8:48 PM PST (UTC-8) to UTC
  // July 28, 2025 8:48 PM PST = July 29, 2025 4:48 AM UTC
  const startTime = '2025-07-29T04:47:00.000Z';
  const endTime = '2025-07-29T04:49:00.000Z';

  console.log(`Time range (UTC): ${startTime} to ${endTime}\n`);

  // Query 1: All pattern processor logs in the time range
  const { data: allLogs, error: allError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: true });

  if (allError) {
    console.error('Error querying pattern_processor_logs:', allError);
  } else {
    console.log(`Found ${allLogs?.length || 0} pattern processor logs in time range:`);
    allLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.level}: ${log.message}`);
      if (log.batch_id) console.log(`  Batch ID: ${log.batch_id}`);
      if (log.pattern_type) console.log(`  Pattern Type: ${log.pattern_type}`);
      if (log.entity_count) console.log(`  Entity Count: ${log.entity_count}`);
      if (log.details) console.log(`  Details:`, JSON.stringify(log.details, null, 2));
      if (log.error_stack) console.log(`  Error:`, log.error_stack);
    });
  }

  // Query 2: Logs mentioning EntitySummary
  console.log('\n\n=== Searching for EntitySummary mentions ===');
  const { data: summaryLogs, error: summaryError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.ilike.%EntitySummary%,message.ilike.%entity summary%,details::text.ilike.%EntitySummary%')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: true });

  if (summaryError) {
    console.error('Error querying for EntitySummary logs:', summaryError);
  } else {
    console.log(`Found ${summaryLogs?.length || 0} logs mentioning EntitySummary:`);
    summaryLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.message}`);
      if (log.details) console.log(`  Details:`, JSON.stringify(log.details, null, 2));
    });
  }

  // Query 3: Check for any pattern detection activity
  console.log('\n\n=== Searching for pattern detection activity ===');
  const { data: patternLogs, error: patternError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.ilike.%pattern detection%,message.ilike.%pattern-detection%,function_name.ilike.%pattern%')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: true });

  if (patternError) {
    console.error('Error querying for pattern logs:', patternError);
  } else {
    console.log(`Found ${patternLogs?.length || 0} pattern detection logs:`);
    patternLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.message}`);
      if (log.function_name) console.log(`  Function: ${log.function_name}`);
      if (log.batch_id) console.log(`  Batch ID: ${log.batch_id}`);
    });
  }

  // Query 4: Look for any errors around that time
  console.log('\n\n=== Checking for errors around that time ===');
  const { data: errorLogs, error: errorQueryError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .eq('level', 'error')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: true });

  if (errorQueryError) {
    console.error('Error querying errors:', errorQueryError);
  } else {
    console.log(`Found ${errorLogs?.length || 0} error logs:`);
    errorLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ERROR: ${log.message}`);
      if (log.error_stack) console.log(`  Stack:`, log.error_stack);
      if (log.details) console.log(`  Details:`, JSON.stringify(log.details, null, 2));
    });
  }

  // Query 5: Expand search to 10 minutes before and after
  console.log('\n\n=== Expanding search to ±10 minutes ===');
  const expandedStart = '2025-01-29T04:38:00.000Z';
  const expandedEnd = '2025-01-29T04:58:00.000Z';
  
  const { data: expandedLogs, error: expandedError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', expandedStart)
    .lte('created_at', expandedEnd)
    .order('created_at', { ascending: true });

  if (expandedError) {
    console.error('Error querying expanded range:', expandedError);
  } else {
    console.log(`Found ${expandedLogs?.length || 0} logs in expanded range (${expandedStart} to ${expandedEnd}):`);
    
    // Group by batch_id
    const batchGroups = expandedLogs?.reduce((acc, log) => {
      const batch = log.batch_id || 'no-batch';
      if (!acc[batch]) acc[batch] = [];
      acc[batch].push(log);
      return acc;
    }, {} as Record<string, any[]>) || {};

    Object.entries(batchGroups).forEach(([batchId, logs]) => {
      console.log(`\n\nBatch: ${batchId} (${logs.length} logs)`);
      console.log(`Time range: ${logs[0].created_at} to ${logs[logs.length - 1].created_at}`);
      
      // Show key events
      logs.forEach(log => {
        if (log.message.includes('EntitySummary') || 
            log.message.includes('pattern detection') ||
            log.level === 'error' ||
            log.message.includes('Processing') ||
            log.message.includes('Completed')) {
          console.log(`  [${log.created_at}] ${log.level}: ${log.message}`);
          if (log.entity_count) console.log(`    Entity Count: ${log.entity_count}`);
          if (log.pattern_type) console.log(`    Pattern Type: ${log.pattern_type}`);
        }
      });
    });
  }

  // Query 6: Check the most recent pattern processor activity
  console.log('\n\n=== Most recent pattern processor activity ===');
  const { data: recentLogs, error: recentError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (recentError) {
    console.error('Error querying recent logs:', recentError);
  } else {
    console.log(`Showing last 20 logs:`);
    recentLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.level}: ${log.message}`);
      if (log.batch_id) console.log(`  Batch ID: ${log.batch_id}`);
      if (log.pattern_type) console.log(`  Pattern Type: ${log.pattern_type}`);
    });
  }

  // Query 7: Check for activity from July 28
  console.log('\n\n=== Checking logs from July 28, 2025 ===');
  const { data: july28Logs, error: july28Error } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', '2025-07-28T00:00:00.000Z')
    .lte('created_at', '2025-07-29T00:00:00.000Z')
    .order('created_at', { ascending: false });

  if (july28Error) {
    console.error('Error querying July 28 logs:', july28Error);
  } else {
    console.log(`Found ${july28Logs?.length || 0} logs from July 28:`);
    if (july28Logs && july28Logs.length > 0) {
      // Group by hour
      const hourGroups: Record<string, any[]> = {};
      july28Logs.forEach(log => {
        const hour = new Date(log.created_at).toISOString().substring(0, 13);
        if (!hourGroups[hour]) hourGroups[hour] = [];
        hourGroups[hour].push(log);
      });
      
      Object.entries(hourGroups).forEach(([hour, logs]) => {
        console.log(`\n  Hour: ${hour}:00 UTC (${logs.length} logs)`);
      });
    }
  }
}

searchPatternLogs().catch(console.error);