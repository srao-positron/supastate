#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createGitHubQueues() {
  console.log('🔧 Creating GitHub PGMQ Queues')
  console.log('==============================\n')

  try {
    // Create github_crawl queue
    console.log('Creating github_crawl queue...')
    const { error: crawlError } = await supabase.rpc('pgmq_create', {
      queue_name: 'github_crawl'
    })
    
    if (crawlError) {
      if (crawlError.message.includes('already exists')) {
        console.log('✅ github_crawl queue already exists')
      } else {
        console.log('❌ Failed to create github_crawl queue:', crawlError.message)
      }
    } else {
      console.log('✅ Created github_crawl queue')
    }

    // Create github_code_parsing queue (already exists but let's check)
    console.log('\nCreating github_code_parsing queue...')
    const { error: parsingError } = await supabase.rpc('pgmq_create', {
      queue_name: 'github_code_parsing'
    })
    
    if (parsingError) {
      if (parsingError.message.includes('already exists')) {
        console.log('✅ github_code_parsing queue already exists')
      } else {
        console.log('❌ Failed to create github_code_parsing queue:', parsingError.message)
      }
    } else {
      console.log('✅ Created github_code_parsing queue')
    }

    // List all queues to verify
    console.log('\n📋 Listing all PGMQ queues...')
    
    // Since pgmq_list_queues doesn't work, let's check metrics
    const queueNames = ['github_crawl', 'github_code_parsing', 'code_ingestion', 'memory_ingestion']
    
    for (const queueName of queueNames) {
      const { data: metrics } = await supabase.rpc('pgmq_metrics', {
        queue_name: queueName
      })
      
      if (metrics) {
        console.log(`✅ ${queueName}: length=${metrics.queue_length}, total=${metrics.total_messages}`)
      }
    }

    console.log('\n✅ GitHub queues setup complete!')

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run setup
createGitHubQueues()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })