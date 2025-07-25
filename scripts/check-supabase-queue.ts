#!/usr/bin/env npx tsx
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load env vars
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function checkQueue() {
  console.log('🔍 Checking Supabase processing queue...\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  
  // Check orchestration_jobs table
  console.log('📋 ORCHESTRATION JOBS:')
  console.log('=====================')
  
  const { data: jobs, error: jobsError } = await supabase
    .from('orchestration_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (jobsError) {
    console.error('Error fetching jobs:', jobsError)
  } else if (jobs && jobs.length > 0) {
    console.log(`Found ${jobs.length} recent jobs:\n`)
    jobs.forEach(job => {
      console.log(`ID: ${job.id}`)
      console.log(`Type: ${job.job_type}`)
      console.log(`Status: ${job.status}`)
      console.log(`Created: ${new Date(job.created_at).toLocaleString()}`)
      console.log(`Updated: ${new Date(job.updated_at).toLocaleString()}`)
      if (job.error) {
        console.log(`Error: ${job.error}`)
      }
      console.log(`Payload: ${JSON.stringify(job.payload).substring(0, 100)}...`)
      console.log('---')
    })
  } else {
    console.log('No jobs found in orchestration_jobs table')
  }
  
  // Check if there's a background_tasks table
  console.log('\n\n📋 BACKGROUND TASKS (if exists):')
  console.log('================================')
  
  const { data: tasks, error: tasksError } = await supabase
    .from('background_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (tasksError) {
    if (tasksError.code === '42P01') {
      console.log('No background_tasks table found')
    } else {
      console.error('Error fetching tasks:', tasksError)
    }
  } else if (tasks && tasks.length > 0) {
    console.log(`Found ${tasks.length} recent tasks:\n`)
    tasks.forEach(task => {
      console.log(`ID: ${task.id}`)
      console.log(`Type: ${task.task_type}`)
      console.log(`Status: ${task.status}`)
      console.log(`Created: ${new Date(task.created_at).toLocaleString()}`)
      console.log('---')
    })
  } else {
    console.log('No tasks found in background_tasks table')
  }
  
  // Check if edge function logs are available
  console.log('\n\n📋 EDGE FUNCTION INVOCATIONS:')
  console.log('=============================')
  console.log('Note: Edge function logs are only available in Supabase Dashboard')
  console.log('Visit: https://supabase.com/dashboard/project/zqlfxakbkwssxfynrmnk/functions')
  
  process.exit(0)
}

checkQueue().catch(console.error)