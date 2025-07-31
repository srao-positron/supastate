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

async function searchLogs() {
  console.log('Searching for pattern detection logs around 8:48 PM on January 28, 2025...\n');

  // Query 1: Pattern detection mentions
  const { data: patternLogs, error: patternError } = await supabase
    .from('function_logs')
    .select('*')
    .or('event_message.ilike.%pattern detection%,event_message.ilike.%pattern-detection%')
    .gte('timestamp', '2025-01-28T20:47:00')
    .lte('timestamp', '2025-01-28T20:49:00')
    .order('timestamp', { ascending: false });

  if (patternError) {
    console.error('Error querying pattern logs:', patternError);
  } else {
    console.log(`Found ${patternLogs?.length || 0} logs mentioning pattern detection:`);
    patternLogs?.forEach(log => {
      console.log(`\n[${log.timestamp}] ${log.metadata?.function_id || 'Unknown'}:`);
      console.log(log.event_message);
    });
  }

  // Query 2: EntitySummary mentions
  const { data: summaryLogs, error: summaryError } = await supabase
    .from('function_logs')
    .select('*')
    .or('event_message.ilike.%EntitySummary%,event_message.ilike.%entity summary%')
    .gte('timestamp', '2025-01-28T20:47:00')
    .lte('timestamp', '2025-01-28T20:49:00')
    .order('timestamp', { ascending: false });

  if (summaryError) {
    console.error('Error querying summary logs:', summaryError);
  } else {
    console.log(`\n\nFound ${summaryLogs?.length || 0} logs mentioning EntitySummary:`);
    summaryLogs?.forEach(log => {
      console.log(`\n[${log.timestamp}] ${log.metadata?.function_id || 'Unknown'}:`);
      console.log(log.event_message);
    });
  }

  // Query 3: Pattern processor function logs
  const { data: processorLogs, error: processorError } = await supabase
    .from('function_logs')
    .select('*')
    .eq('metadata->>function_id', 'pattern-processor')
    .gte('timestamp', '2025-01-28T20:47:00')
    .lte('timestamp', '2025-01-28T20:49:00')
    .order('timestamp', { ascending: false });

  if (processorError) {
    console.error('Error querying processor logs:', processorError);
  } else {
    console.log(`\n\nFound ${processorLogs?.length || 0} logs from pattern-processor:`);
    processorLogs?.forEach(log => {
      console.log(`\n[${log.timestamp}]:`);
      console.log(log.event_message);
    });
  }

  // Query 4: Batch ID mentions
  const { data: batchLogs, error: batchError } = await supabase
    .from('function_logs')
    .select('*')
    .ilike('event_message', '%batch%')
    .gte('timestamp', '2025-01-28T20:47:00')
    .lte('timestamp', '2025-01-28T20:49:00')
    .order('timestamp', { ascending: false });

  if (batchError) {
    console.error('Error querying batch logs:', batchError);
  } else {
    console.log(`\n\nFound ${batchLogs?.length || 0} logs mentioning batch:`);
    batchLogs?.forEach(log => {
      console.log(`\n[${log.timestamp}] ${log.metadata?.function_id || 'Unknown'}:`);
      console.log(log.event_message);
    });
  }

  // Query 5: Any logs from pattern-detection-coordinator or worker
  const { data: coordLogs, error: coordError } = await supabase
    .from('function_logs')
    .select('*')
    .or('metadata->>function_id.eq.pattern-detection-coordinator,metadata->>function_id.eq.pattern-detection-worker')
    .gte('timestamp', '2025-01-28T20:47:00')
    .lte('timestamp', '2025-01-28T20:49:00')
    .order('timestamp', { ascending: false });

  if (coordError) {
    console.error('Error querying coordinator/worker logs:', coordError);
  } else {
    console.log(`\n\nFound ${coordLogs?.length || 0} logs from coordinator/worker:`);
    coordLogs?.forEach(log => {
      console.log(`\n[${log.timestamp}] ${log.metadata?.function_id}:`);
      console.log(log.event_message);
    });
  }
}

searchLogs().catch(console.error);