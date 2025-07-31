import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTables() {
  console.log('Checking for GitHub-related tables...\n')
  
  // Use a direct query to get table names
  const { data, error } = await supabase.rpc('get_table_names', {
    search_pattern: '%github%'
  }).single()
  
  if (error) {
    // Try a different approach - query pg_tables directly
    const { data: tableData, error: tableError } = await supabase
      .rpc('get_all_tables')
      .single()
    
    if (tableError) {
      console.log('Could not query tables directly. Let me check known tables...')
      
      // Try to query known tables
      const knownTables = [
        'github_activity_logs',
        'github_logs',
        'activity_logs',
        'ingestion_logs',
        'edge_function_logs',
        'function_logs'
      ]
      
      for (const tableName of knownTables) {
        try {
          const { count, error } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })
          
          if (!error) {
            console.log(`✓ Table exists: ${tableName} (${count} records)`)
          }
        } catch (e) {
          // Table doesn't exist
        }
      }
    } else {
      console.log('All tables:', tableData)
    }
  } else {
    console.log('Tables matching "github":', data)
  }
}

// Function to check ingestion logs
async function checkIngestionLogs() {
  console.log('\n\nChecking ingestion_logs table...\n')
  
  const { data, error } = await supabase
    .from('ingestion_logs')
    .select('*')
    .or('function_name.eq.github-code-parser-worker,edge_function.eq.github-code-parser-worker')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (error) {
    console.error('Error querying ingestion_logs:', error.message)
    return
  }
  
  if (data && data.length > 0) {
    console.log(`Found ${data.length} logs:`)
    data.forEach((log, i) => {
      console.log(`\n[${i + 1}] ${new Date(log.created_at).toLocaleString()}`)
      console.log('Function:', log.function_name || log.edge_function || 'Unknown')
      console.log('Status:', log.status || log.log_level || 'Unknown')
      console.log('Message:', log.message || log.details || 'No message')
      if (log.error) {
        console.log('Error:', log.error)
      }
    })
  } else {
    console.log('No logs found')
  }
}

// Main execution
async function main() {
  await checkTables()
  await checkIngestionLogs()
}

main().catch(console.error)