#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkGithubCodeParsingQueue() {
  console.log('🔍 Checking github_code_parsing PGMQ queue...\n')

  try {
    // 1. Check if the queue exists using pgmq.metrics directly
    console.log('📊 Checking queue metrics...')
    const { data: metrics, error: metricsError } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'github_code_parsing'
    })
    
    if (metricsError) {
      console.log('Error getting metrics:', metricsError.message)
    } else if (metrics && metrics.length > 0) {
      const m = metrics[0]
      console.log('✅ Queue exists!')
      console.log(`  - Queue Length: ${m.queue_length || 0}`)
      console.log(`  - Total Messages: ${m.total_messages || 0}`)
      console.log(`  - Newest Msg Age: ${m.newest_msg_age_sec ? `${m.newest_msg_age_sec}s` : 'N/A'}`)
      console.log(`  - Oldest Msg Age: ${m.oldest_msg_age_sec ? `${m.oldest_msg_age_sec}s` : 'N/A'}`)
    } else {
      console.log('❌ Queue metrics returned empty - queue may not exist')
    }

    // 2. Check if queue_github_code_parsing function exists
    console.log('\n📋 Checking if queue_github_code_parsing function exists...')
    const { error: funcError } = await supabase.rpc('queue_github_code_parsing', {
      p_repository_id: '00000000-0000-0000-0000-000000000000',
      p_file_id: 'test',
      p_file_path: 'test.ts',
      p_file_content: 'test',
      p_language: 'ts'
    })
    
    if (funcError && funcError.message.includes('not find')) {
      console.log('❌ queue_github_code_parsing function does not exist')
      console.log('   Migration may not have been applied')
    } else if (funcError) {
      console.log('⚠️  Function exists but returned error:', funcError.message)
    } else {
      console.log('✅ queue_github_code_parsing function exists')
    }

    // 3. Try to read messages directly using pgmq schema
    console.log('\n📦 Attempting to read messages from queue...')
    
    // Use the pgmq.read function directly
    const readQuery = `
      SELECT * FROM pgmq.read('github_code_parsing', 30, 10)
    `
    
    // Since we can't execute raw SQL through Supabase client, we'll try the RPC approach
    // Note: This requires the pgmq_read wrapper function to exist
    
    // 4. Check for messages using different approach
    console.log('\n🔍 Checking for any test messages...')
    
    // Try to send a test message using the queue function
    const testRepoId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' // Random UUID
    console.log('\nSending test message to queue...')
    
    const { data: msgId, error: sendError } = await supabase.rpc('queue_github_code_parsing', {
      p_repository_id: testRepoId,
      p_file_id: 'test-file-' + Date.now(),
      p_file_path: 'test/example.ts',
      p_file_content: 'console.log("Hello, World!");',
      p_language: 'ts',
      p_branch: 'main',
      p_commit_sha: 'abc123'
    })
    
    if (sendError) {
      console.log('❌ Failed to send test message:', sendError.message)
    } else {
      console.log('✅ Test message sent successfully! Message ID:', msgId)
      
      // Check metrics again
      const { data: newMetrics, error: newMetricsError } = await supabase.rpc('pgmq_metrics', {
        p_queue_name: 'github_code_parsing'
      })
      
      if (!newMetricsError && newMetrics && newMetrics.length > 0) {
        const m = newMetrics[0]
        console.log('\n📊 Updated Queue Metrics:')
        console.log(`  - Queue Length: ${m.queue_length || 0}`)
        console.log(`  - Total Messages: ${m.total_messages || 0}`)
      }
    }

    // 5. Summary
    console.log('\n📋 Summary:')
    console.log('- Queue Name: github_code_parsing')
    console.log('- Purpose: Queue GitHub files for code parsing')
    console.log('- Supported Languages: ts, tsx, js, jsx, py, go, java, rs')
    console.log('- Queue Function: queue_github_code_parsing()')
    console.log('\nTo process messages from this queue, you would need a worker that:')
    console.log('1. Reads messages using pgmq.read()')
    console.log('2. Parses the code based on language')
    console.log('3. Stores results (e.g., in code_entities table)')
    console.log('4. Deletes processed messages using pgmq.delete()')

  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

// Run the check
checkGithubCodeParsingQueue()