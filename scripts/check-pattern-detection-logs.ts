/**
 * Check Supabase edge function logs for pattern detection
 */

console.log(`
=== Checking Pattern Detection Logs ===

To view logs for the smart-pattern-detection function:

1. Using Supabase Dashboard:
   https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/logs/edge-functions

2. Using SQL Editor in Supabase Dashboard:
   https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/sql/new

   Run this query:
   \`\`\`sql
   -- View recent smart-pattern-detection function logs
   select 
     id,
     function_logs.timestamp,
     event_message,
     metadata.event_type,
     metadata.function_id,
     metadata.level,
     metadata.status_code
   from function_logs
   cross join unnest(metadata) as metadata
   where metadata.function_id = 'smart-pattern-detection'
   order by timestamp desc
   limit 100;
   \`\`\`

3. Search for errors:
   \`\`\`sql
   -- Find errors in pattern detection
   select 
     id,
     function_logs.timestamp,
     event_message,
     metadata.level,
     metadata.error_type,
     metadata.status_code
   from function_logs
   cross join unnest(metadata) as metadata
   where metadata.function_id = 'smart-pattern-detection'
     and (metadata.level in ('error', 'warning') 
          or event_message like '%error%'
          or event_message like '%failed%')
   order by timestamp desc
   limit 50;
   \`\`\`

4. Check processing results:
   \`\`\`sql
   -- Look for successful pattern detection
   select 
     id,
     function_logs.timestamp,
     event_message,
     metadata.status_code
   from function_logs
   cross join unnest(metadata) as metadata
   where metadata.function_id = 'smart-pattern-detection'
     and (event_message like '%processed%'
          or event_message like '%patterns%'
          or event_message like '%summaries%')
   order by timestamp desc
   limit 50;
   \`\`\`

5. Monitor checkpoint progress:
   \`\`\`sql
   -- Check processing checkpoints
   SELECT 
     checkpoint_type,
     last_processed_at,
     processed_count,
     metadata,
     updated_at
   FROM pattern_processing_checkpoints
   ORDER BY updated_at DESC;
   \`\`\`
`)