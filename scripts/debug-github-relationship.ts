#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debug() {
  const jobId = '4d1bd06c-88dd-43b3-b8f2-1bb71b041752'
  
  // Check job
  const { data: job, error: jobError } = await supabase
    .from('github_crawl_queue')
    .select('*')
    .eq('id', jobId)
    .single()
    
  console.log('Job:', job)
  console.log('Job error:', jobError)
  
  if (job) {
    // Check repository
    const { data: repo, error: repoError } = await supabase
      .from('github_repositories')
      .select('*')
      .eq('id', job.repository_id)
      .single()
      
    console.log('\nRepository:', repo)
    console.log('Repository error:', repoError)
  }
  
  // Try the join query
  console.log('\nTrying join query...')
  const { data: joinData, error: joinError } = await supabase
    .from('github_crawl_queue')
    .select('*, github_repositories(*)')
    .eq('id', jobId)
  
  console.log('Join data:', joinData)
  console.log('Join error:', joinError)
}

debug()