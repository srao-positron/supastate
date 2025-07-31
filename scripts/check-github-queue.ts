#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkQueue() {
  // Check pending jobs
  const { data: jobs } = await supabase
    .from('github_crawl_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5)

  console.log('Pending jobs:', jobs)
  
  // Check repository details
  if (jobs && jobs.length > 0) {
    const repoId = jobs[0].repository_id
    const { data: repo } = await supabase
      .from('github_repositories')
      .select('*')
      .eq('id', repoId)
      .single()
    
    console.log('\nRepository:', repo)
  }
}

checkQueue()