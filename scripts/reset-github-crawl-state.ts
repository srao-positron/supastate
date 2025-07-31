#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resetCrawlState() {
  console.log('Resetting GitHub crawl state...\n')
  
  try {
    // Clear the crawl queue
    console.log('1. Clearing crawl queue...')
    const { error: queueError } = await supabase
      .from('github_crawl_queue')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (queueError) {
      console.error('Error clearing queue:', queueError)
    } else {
      console.log('✓ Crawl queue cleared')
    }
    
    // Clear crawl history
    console.log('\n2. Clearing crawl history...')
    const { error: historyError } = await supabase
      .from('github_crawl_history')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (historyError) {
      console.error('Error clearing history:', historyError)
    } else {
      console.log('✓ Crawl history cleared')
    }
    
    // Clear ingestion logs
    console.log('\n3. Clearing ingestion logs...')
    const { error: logsError } = await supabase
      .from('github_ingestion_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (logsError) {
      console.error('Error clearing logs:', logsError)
    } else {
      console.log('✓ Ingestion logs cleared')
    }
    
    // Reset repository crawl status
    console.log('\n4. Resetting repository crawl status...')
    const { data: repos, error: repoFetchError } = await supabase
      .from('github_repositories')
      .select('id, full_name')
    
    if (repoFetchError) {
      console.error('Error fetching repositories:', repoFetchError)
    } else if (repos && repos.length > 0) {
      for (const repo of repos) {
        const { error: updateError } = await supabase
          .from('github_repositories')
          .update({
            crawl_status: 'pending',
            crawl_error: null,
            crawl_started_at: null,
            crawl_completed_at: null,
            last_crawled_at: null,
            webhook_id: null,
            webhook_secret: null,
            webhook_installed_at: null
          })
          .eq('id', repo.id)
        
        if (updateError) {
          console.error(`Error resetting ${repo.full_name}:`, updateError)
        } else {
          console.log(`✓ Reset crawl status for ${repo.full_name}`)
        }
      }
    }
    
    console.log('\n✅ GitHub crawl state reset complete!')
    
  } catch (error) {
    console.error('Error resetting crawl state:', error)
  }
}

resetCrawlState()