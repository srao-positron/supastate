import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Set' : 'Missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkGithubActivityLogs() {
  console.log('Checking github_activity_logs for github-code-parser-worker errors...\n')
  
  // Get recent logs from github-code-parser-worker
  const { data: logs, error } = await supabase
    .from('github_activity_logs')
    .select('*')
    .eq('function_name', 'github-code-parser-worker')
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (error) {
    console.error('Error fetching logs:', error)
    return
  }
  
  if (!logs || logs.length === 0) {
    console.log('No logs found for github-code-parser-worker')
    return
  }
  
  console.log(`Found ${logs.length} recent logs:\n`)
  
  // Group by status
  const errorLogs = logs.filter(log => log.status === 'error')
  const successLogs = logs.filter(log => log.status === 'success')
  const otherLogs = logs.filter(log => log.status !== 'error' && log.status !== 'success')
  
  if (errorLogs.length > 0) {
    console.log('=== ERROR LOGS ===')
    errorLogs.forEach((log, i) => {
      console.log(`\n[${i + 1}] Error at ${new Date(log.created_at).toLocaleString()}`)
      console.log('Repository:', log.repository_name || 'N/A')
      console.log('Status:', log.status)
      console.log('Message:', log.message)
      if (log.error_details) {
        console.log('Error Details:', JSON.stringify(log.error_details, null, 2))
      }
      if (log.metadata) {
        console.log('Metadata:', JSON.stringify(log.metadata, null, 2))
      }
    })
  }
  
  console.log(`\n=== SUMMARY ===`)
  console.log(`Total logs: ${logs.length}`)
  console.log(`Errors: ${errorLogs.length}`)
  console.log(`Success: ${successLogs.length}`)
  console.log(`Other: ${otherLogs.length}`)
  
  // Show unique error messages
  if (errorLogs.length > 0) {
    console.log('\n=== UNIQUE ERROR MESSAGES ===')
    const uniqueErrors = [...new Set(errorLogs.map(log => log.message))]
    uniqueErrors.forEach((msg, i) => {
      const count = errorLogs.filter(log => log.message === msg).length
      console.log(`${i + 1}. "${msg}" (occurred ${count} times)`)
    })
  }
  
  // Check for recent successful logs
  if (successLogs.length > 0) {
    console.log('\n=== RECENT SUCCESSFUL LOGS ===')
    successLogs.slice(0, 5).forEach((log, i) => {
      console.log(`\n[${i + 1}] Success at ${new Date(log.created_at).toLocaleString()}`)
      console.log('Repository:', log.repository_name || 'N/A')
      console.log('Message:', log.message)
    })
  }
}

checkGithubActivityLogs().catch(console.error)