#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkGitHubParsingErrors() {
  console.log('Checking GitHub parsing errors...\n')
  
  try {
    // Get recent warning/error logs that indicate parsing failures
    const { data: logs, error } = await supabase
      .from('github_ingestion_logs')
      .select('*')
      .in('level', ['warning', 'error'])
      .like('message', '%parse%')
      .order('timestamp', { ascending: false })
      .limit(50)
    
    if (error) {
      console.error('Error fetching logs:', error)
      return
    }
    
    if (!logs || logs.length === 0) {
      console.log('No parsing errors found')
      return
    }
    
    console.log(`Found ${logs.length} parsing errors:\n`)
    
    // Group errors by file
    const errorsByFile = new Map<string, any[]>()
    
    logs.forEach(log => {
      // Extract filename from message
      const match = log.message.match(/Failed to parse code from (.+)/)
      if (match) {
        const filename = match[1]
        if (!errorsByFile.has(filename)) {
          errorsByFile.set(filename, [])
        }
        errorsByFile.get(filename)!.push(log)
      }
    })
    
    // Show errors by file
    errorsByFile.forEach((errors, filename) => {
      console.log(`\n📄 ${filename} (${errors.length} errors)`)
      
      // Show the most recent error details
      const latestError = errors[0]
      console.log(`   Last error: ${new Date(latestError.timestamp).toLocaleString()}`)
      
      if (latestError.details) {
        console.log('   Error details:')
        console.log(JSON.stringify(latestError.details, null, 2).split('\n').map(line => '   ' + line).join('\n'))
      }
      
      if (latestError.error) {
        console.log('   Error info:', latestError.error)
      }
    })
    
    // Get a sample of the actual error details
    console.log('\n\n=== Sample Error Details ===')
    const sampleErrors = logs.slice(0, 3)
    sampleErrors.forEach((log, i) => {
      console.log(`\n[${i + 1}] ${log.message}`)
      console.log('Timestamp:', new Date(log.timestamp).toLocaleString())
      if (log.details) {
        console.log('Details:', JSON.stringify(log.details, null, 2))
      }
      if (log.error) {
        console.log('Error:', JSON.stringify(log.error, null, 2))
      }
    })
    
  } catch (error) {
    console.error('Error:', error)
  }
}

checkGitHubParsingErrors()