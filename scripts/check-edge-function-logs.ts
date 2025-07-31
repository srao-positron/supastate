#!/usr/bin/env npx tsx

/**
 * Check Supabase Edge Function logs
 * 
 * This script queries the Supabase analytics API to retrieve edge function logs.
 * It uses the platform API endpoint which requires authentication.
 */

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

interface LogMetadata {
  event_type: string
  function_id: string
  level: string
  execution_id?: string
  error_type?: string
  [key: string]: any
}

interface LogEntry {
  id: string
  timestamp: number | string
  event_message: string
  metadata?: LogMetadata
  level?: string
  function_id?: string
  event_type?: string
  execution_id?: string
  error_type?: string
}

async function checkEdgeFunctionLogs(options: {
  functionName?: string
  functionId?: string
  limit?: number
  hoursAgo?: number
  searchPattern?: string
  level?: 'error' | 'warning' | 'info'
}) {
  const {
    functionName,
    functionId,
    limit = 100,
    hoursAgo = 24,
    searchPattern,
    level
  } = options

  // Calculate timestamps
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - (hoursAgo * 60 * 60 * 1000))

  // Build SQL query
  let sql = `
    select 
      id,
      function_logs.timestamp,
      event_message,
      metadata.event_type,
      metadata.function_id,
      metadata.level,
      metadata.execution_id,
      metadata.error_type
    from function_logs
    cross join unnest(metadata) as metadata
    where 1=1
  `

  if (functionId) {
    sql += ` and metadata.function_id = '${functionId}'`
  }

  if (level) {
    sql += ` and metadata.level = '${level}'`
  }

  if (searchPattern) {
    sql += ` and event_message ilike '%${searchPattern}%'`
  }

  sql += `
    and function_logs.timestamp >= ${startTime.getTime() * 1000}
    and function_logs.timestamp <= ${endTime.getTime() * 1000}
    order by timestamp desc
    limit ${limit}
  `

  // URL encode the SQL
  const encodedSql = encodeURIComponent(sql.trim())
  
  // Build the API URL
  const projectRef = 'zqlfxakbkwssxfynrmnk' // Project ref for Supastate
  
  const apiUrl = `https://api.supabase.com/platform/projects/${projectRef}/analytics/endpoints/logs.all?sql=${encodedSql}&iso_timestamp_start=${encodeURIComponent(startTime.toISOString())}&iso_timestamp_end=${encodeURIComponent(endTime.toISOString())}`

  console.log(`\n=== Checking Edge Function Logs ===`)
  console.log(`Project: ${projectRef}`)
  console.log(`Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`)
  if (functionName) console.log(`Function: ${functionName}`)
  if (functionId) console.log(`Function ID: ${functionId}`)
  if (searchPattern) console.log(`Search pattern: ${searchPattern}`)
  if (level) console.log(`Level: ${level}`)
  console.log(`\nQuerying logs...`)

  // Use the user's working auth token
  const authToken = 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjNlNjE5YzJjIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2FsdC5zdXBhYmFzZS5pby9hdXRoL3YxIiwic3ViIjoiZjNlMDY2YWUtOTQ4OS00ZjE2LTk3NjEtZjY1YTIyMjc2MDA2IiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTc1MzY4MDkxNCwiaWF0IjoxNzUzNjgwMzE0LCJlbWFpbCI6InNpZEBoYXdraW5nZWRpc29uLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im90cCIsInRpbWVzdGFtcCI6MTc1MTY5NzI1M31dLCJzZXNzaW9uX2lkIjoiZmVkYTkzYTItYWQ1MS00Mjg5LTk3NzgtODdiZWIzNzY0MTEyIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.PUfnrV6iQhbNXP3Iz90rMu-NsmPL0qCLe7Pfk8Ww32ic8O8aoZHrh0UP30FrN1jn5W6gwzCqCXrqjynXG2fxTibet4WL9vdlXtJ2AKNsj12k6cNnL2GB4VvzhiQWbrWK-B_AYOnatxjXJeJVYVYr2EWBedi4_zHtN0rhzGnugeBGtdGp6bjBpHEO0VxHK-MIXGWKubMGZcSCBZQWDiHmOt8WyGL8iCyuYoLMZ29DmQub463G4wWnKQM-dlG-FaUwaFUzesaA9KzSODzHEDcM77lTlXVBg--8Ewbsk9Vpa3tGszL4gpUAg5iCbiwzVKJGHR6pI3pRc-PgvOSqyJBoIg'

  let response: Response | null = null
  let lastError: Error | null = null

  try {
    response = await fetch(apiUrl, {
      headers: {
        'Authorization': authToken,
        'Accept': 'application/json',
        'Origin': 'https://supabase.com'
      }
    })

    if (!response.ok) {
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  } catch (error) {
    lastError = error as Error
  }

  if (!response?.ok) {
    console.error('Failed to fetch logs:', lastError?.message)
    console.log('\nAlternative: Use the Supabase Dashboard')
    console.log(`Go to: https://supabase.com/dashboard/project/${projectRef}/logs/edge-functions`)
    console.log('\nOr run these queries in the SQL Editor:')
    console.log(generateSQLQueries(functionName, functionId))
    return
  }

  const data = await response.json()
  
  // The response format is { result: [...] }
  const logs = (data.result || []) as LogEntry[]

  if (!logs || logs.length === 0) {
    console.log('\nNo logs found matching criteria')
    return
  }

  console.log(`\nFound ${logs.length} log entries:\n`)

  // Group logs by execution ID for better readability
  const logsByExecution = new Map<string, LogEntry[]>()
  
  logs.forEach((log: any) => {
    // Handle the flattened structure from the SQL query
    const execId = log.execution_id || log['metadata.execution_id'] || 'no-execution-id'
    if (!logsByExecution.has(execId)) {
      logsByExecution.set(execId, [])
    }
    logsByExecution.get(execId)!.push(log)
  })

  // Display logs grouped by execution
  let displayCount = 0
  let errorDetails: string[] = []
  
  for (const [execId, execLogs] of logsByExecution) {
    if (displayCount >= 10 && !includeErrors) {
      console.log(`\n... and ${logs.length - displayCount} more logs`)
      break
    }

    const firstLog = execLogs[0]
    const logLevel = firstLog.level || firstLog['metadata.level'] || 'info'
    const timestamp = typeof firstLog.timestamp === 'number' 
      ? new Date(firstLog.timestamp / 1000).toISOString()
      : new Date(firstLog.timestamp).toISOString()
    
    console.log(`\n${'='.repeat(80)}`)
    console.log(`Execution: ${execId}`)
    console.log(`Time: ${timestamp}`)
    console.log(`Level: ${logLevel}`)
    if (firstLog.error_type || firstLog['metadata.error_type']) {
      console.log(`Error Type: ${firstLog.error_type || firstLog['metadata.error_type']}`)
    }
    console.log(`${'='.repeat(80)}`)
    
    execLogs.forEach(log => {
      const message = log.event_message || ''
      console.log(`\n${message}`)
      
      // Collect error details for analysis
      if (logLevel === 'error' && message.includes('Neo4jError')) {
        errorDetails.push(message)
      }
    })
    
    displayCount += execLogs.length
  }

  // Show summary
  const errorCount = logs.filter((l: any) => 
    (l.level || l['metadata.level']) === 'error'
  ).length
  const warningCount = logs.filter((l: any) => 
    (l.level || l['metadata.level']) === 'warning'
  ).length
  
  console.log(`\n\nSummary:`)
  console.log(`  Total logs: ${logs.length}`)
  console.log(`  Errors: ${errorCount}`)
  console.log(`  Warnings: ${warningCount}`)
  
  // If we found Neo4j errors, provide specific guidance
  if (errorDetails.length > 0) {
    console.log(`\n\n=== Neo4j Error Analysis ===`)
    errorDetails.forEach((error, idx) => {
      if (error.includes('Property values can only be of primitive types')) {
        console.log(`\nError ${idx + 1}: Neo4j property type error`)
        console.log('Solution: JSON.stringify() complex objects before storing in Neo4j')
        console.log('Affected properties: metadata objects in pattern storage')
      }
    })
  }
}

function generateSQLQueries(functionName?: string, functionId?: string): string {
  const queries = []
  
  // Recent logs query
  queries.push(`-- Recent logs for ${functionName || 'all functions'}
SELECT 
  id,
  timestamp,
  event_message,
  metadata.level as level,
  metadata.function_id as function_id
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
${functionId ? `WHERE metadata.function_id = '${functionId}'` : ''}
ORDER BY timestamp DESC
LIMIT 50;`)

  // Error logs query
  queries.push(`-- Recent errors
SELECT 
  id,
  timestamp,
  event_message,
  metadata.error_type as error_type
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE metadata.level = 'error'
${functionId ? `  AND metadata.function_id = '${functionId}'` : ''}
ORDER BY timestamp DESC
LIMIT 20;`)

  // Pattern search query
  queries.push(`-- Search for specific patterns
SELECT 
  id,
  timestamp,
  event_message
FROM function_logs
CROSS JOIN unnest(metadata) as metadata
WHERE event_message LIKE '%pattern%'
   OR event_message LIKE '%error%'
${functionId ? `  AND metadata.function_id = '${functionId}'` : ''}
ORDER BY timestamp DESC
LIMIT 50;`)

  return queries.join('\n\n')
}

// Function ID mapping
const FUNCTION_IDS: Record<string, string> = {
  'pattern-processor': 'af0c921e-4d31-4353-8176-f5963f370af2',
  'smart-pattern-detection': 'af0c921e-4d31-4353-8176-f5963f370af2',
  // Add more mappings as needed
}

// Parse command line arguments
const args = process.argv.slice(2)
const functionName = args.find(arg => !arg.startsWith('--'))
const includeErrors = args.includes('--errors')
const searchPattern = args.find(arg => arg.startsWith('--search='))?.split('=')[1]
const hoursAgo = parseInt(args.find(arg => arg.startsWith('--hours='))?.split('=')[1] || '24')

// Run the check
checkEdgeFunctionLogs({
  functionName,
  functionId: functionName ? FUNCTION_IDS[functionName] : undefined,
  level: includeErrors ? 'error' : undefined,
  searchPattern,
  hoursAgo
}).catch(console.error)

// Show usage if no args
if (args.length === 0) {
  console.log(`
Usage: npx tsx scripts/check-edge-function-logs.ts [function-name] [options]

Options:
  --errors          Show only error logs
  --search=PATTERN  Search for pattern in logs
  --hours=N         Look back N hours (default: 24)

Examples:
  npx tsx scripts/check-edge-function-logs.ts pattern-processor
  npx tsx scripts/check-edge-function-logs.ts --errors
  npx tsx scripts/check-edge-function-logs.ts pattern-processor --search=Neo4j
`)
}
