#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function forceGenerateSummaries() {
  console.log('Force generating project summaries...')
  
  // Invoke the function with a force flag to process all projects
  const { data, error } = await supabase.functions.invoke('generate-project-summaries', {
    body: { 
      manual_trigger: true,
      force_all: true  // This will need to be handled in the edge function
    }
  })
  
  if (error) {
    console.error('Error invoking function:', error)
  } else {
    console.log('Function response:', JSON.stringify(data, null, 2))
  }
}

forceGenerateSummaries().catch(console.error)