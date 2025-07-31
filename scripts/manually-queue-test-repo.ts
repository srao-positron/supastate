#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { readdir } from 'fs/promises'
import { join } from 'path'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEST_REPO_PATH = join(process.env.HOME!, '.camille', 'watched', 'supastate-test-repo')
const REPO_NAME = 'local/supastate-test-repo'
const USER_ID = 'a02c3fed-3a24-442f-becc-97bac8b75e90'

async function queueTestRepoFiles() {
  console.log('📦 Manually queueing test repository files for parsing...\n')
  
  try {
    // Get all code files from the test repository
    const files = await readdir(TEST_REPO_PATH)
    const codeFiles = files.filter(f => 
      f.endsWith('.ts') || 
      f.endsWith('.tsx') || 
      f.endsWith('.js') || 
      f.endsWith('.jsx') || 
      f.endsWith('.py')
    )
    
    console.log(`Found ${codeFiles.length} code files:`)
    codeFiles.forEach(f => console.log(`  - ${f}`))
    console.log()
    
    // Queue each file for parsing using pgmq
    for (const file of codeFiles) {
      const filePath = join(TEST_REPO_PATH, file)
      
      console.log(`Queueing ${file}...`)
      
      // Use pgmq_send to queue the file
      const { data, error } = await supabase.rpc('pgmq_send', {
        queue_name: 'code_ingestion',
        msg: {
          file_path: filePath,
          repository: REPO_NAME,
          branch: 'feature/async-parsing-test',
          user_id: USER_ID,
          priority: 5,
          metadata: {
            source: 'manual_test',
            test_repo: true,
            timestamp: new Date().toISOString()
          }
        }
      })
      
      if (error) {
        console.error(`  ❌ Error queueing ${file}:`, error.message)
      } else {
        console.log(`  ✅ Queued with message ID: ${data}`)
      }
    }
    
    console.log('\n📊 Checking queue depth...')
    const { data: queueDepth, error: depthError } = await supabase.rpc('pgmq_metrics', {
      p_queue_name: 'code_ingestion'
    })
    
    if (depthError) {
      console.error('Error checking queue depth:', depthError)
    } else {
      console.log(`Queue depth: ${queueDepth?.queue_depth || 0} messages`)
      console.log(`Total messages: ${queueDepth?.total_messages || 0}`)
    }
    
    console.log('\n✅ Files queued successfully!')
    console.log('\nNext steps:')
    console.log('1. The code-ingestion-worker should pick up these files')
    console.log('2. Monitor the queue with: npx tsx scripts/check-code-ingestion-queue.ts')
    console.log('3. Check Neo4j for CodeEntity nodes after processing')
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

queueTestRepoFiles()