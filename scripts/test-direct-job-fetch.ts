#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
  const jobId = '4d1bd06c-88dd-43b3-b8f2-1bb71b041752'
  
  console.log('Testing job fetch with ID:', jobId)
  
  // Test 1: Basic fetch
  const { data: test1, error: error1 } = await supabase
    .from('github_crawl_queue')
    .select('*')
    .eq('id', jobId)
    .single()
  
  console.log('Test 1 - Basic fetch:')
  console.log('Data:', test1)
  console.log('Error:', error1)
  
  // Test 2: Check all jobs
  const { data: allJobs } = await supabase
    .from('github_crawl_queue')
    .select('id')
  
  console.log('\nAll job IDs:', allJobs?.map(j => j.id))
  
  // Test 3: Direct SQL
  const { data: sqlResult, error: sqlError } = await supabase.rpc('query', {
    query: `SELECT id FROM github_crawl_queue WHERE id = '${jobId}'`
  }).catch(e => ({ data: null, error: 'RPC not available' }))
  
  console.log('\nSQL result:', sqlResult)
  console.log('SQL error:', sqlError)
}

test()