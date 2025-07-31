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
  console.log('Searching for pattern detection logs around 8:48 PM on January 28, 2025...\n');

  // Convert to UTC (assuming 8:48 PM is in the user's timezone)
  const startTime = '2025-01-29T03:47:00.000Z'; // 8:47 PM PST = 3:47 AM UTC next day
  const endTime = '2025-01-29T03:49:00.000Z';   // 8:49 PM PST = 3:49 AM UTC next day

  // Query 1: Pattern processor logs
  const { data: processorLogs, error: processorError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: false });

  if (processorError) {
    console.error('Error querying pattern_processor_logs:', processorError);
  } else {
    console.log(`Found ${processorLogs?.length || 0} pattern processor logs:`);
    processorLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.operation} - ${log.status}`);
      console.log(`Batch ID: ${log.batch_id}`);
      console.log(`Message: ${log.message}`);
      if (log.error) console.log(`Error: ${log.error}`);
      if (log.metadata) console.log(`Metadata:`, JSON.stringify(log.metadata, null, 2));
    });
  }

  // Query 2: Pattern detection logs (if table exists)
  const { data: detectionLogs, error: detectionError } = await supabase
    .from('pattern_detection_logs')
    .select('*')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: false });

  if (detectionError) {
    if (detectionError.code !== '42P01') { // Table doesn't exist
      console.error('Error querying pattern_detection_logs:', detectionError);
    }
  } else {
    console.log(`\n\nFound ${detectionLogs?.length || 0} pattern detection logs:`);
    detectionLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.function_name}`);
      console.log(`Status: ${log.status}`);
      console.log(`Message: ${log.message}`);
      if (log.error) console.log(`Error: ${log.error}`);
      if (log.metadata) console.log(`Metadata:`, JSON.stringify(log.metadata, null, 2));
    });
  }

  // Query 3: Check for EntitySummary creation in pattern processor logs
  console.log('\n\nSearching for EntitySummary mentions...');
  const { data: summaryLogs, error: summaryError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .or('message.ilike.%EntitySummary%,message.ilike.%entity summary%,metadata->>entityType.eq.EntitySummary')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: false });

  if (summaryError) {
    console.error('Error querying for EntitySummary logs:', summaryError);
  } else {
    console.log(`Found ${summaryLogs?.length || 0} logs mentioning EntitySummary:`);
    summaryLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.operation}`);
      console.log(`Message: ${log.message}`);
      if (log.metadata) console.log(`Metadata:`, JSON.stringify(log.metadata, null, 2));
    });
  }

  // Query 4: Check ingestion logs around the same time
  console.log('\n\nChecking ingestion logs around the same time...');
  const { data: ingestionLogs, error: ingestionError } = await supabase
    .from('code_ingestion_logs')
    .select('*')
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: false });

  if (ingestionError) {
    if (ingestionError.code !== '42P01') {
      console.error('Error querying code_ingestion_logs:', ingestionError);
    }
  } else {
    console.log(`Found ${ingestionLogs?.length || 0} code ingestion logs:`);
    ingestionLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.operation} - ${log.status}`);
      console.log(`Message: ${log.message}`);
      if (log.metadata?.queuedPatternDetection) {
        console.log(`Pattern detection queued: ${JSON.stringify(log.metadata.queuedPatternDetection)}`);
      }
    });
  }

  // Query 5: Check any recent pattern processor logs with errors
  console.log('\n\nChecking recent pattern processor errors...');
  const { data: errorLogs, error: errorQueryError } = await supabase
    .from('pattern_processor_logs')
    .select('*')
    .eq('status', 'error')
    .gte('created_at', '2025-01-28T00:00:00.000Z')
    .order('created_at', { ascending: false })
    .limit(10);

  if (errorQueryError) {
    console.error('Error querying recent errors:', errorQueryError);
  } else {
    console.log(`Found ${errorLogs?.length || 0} recent error logs:`);
    errorLogs?.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.operation}`);
      console.log(`Error: ${log.error}`);
      console.log(`Message: ${log.message}`);
    });
  }
}

searchPatternLogs().catch(console.error);