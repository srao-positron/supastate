#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupGitHubAsyncComplete() {
  console.log('🔧 Complete GitHub Async System Setup')
  console.log('====================================\n')

  const steps = []

  try {
    // Step 1: Apply missing migrations
    console.log('📝 Step 1: Applying missing migrations...\n')
    
    try {
      execSync('npx supabase db push --skip-confirm', { stdio: 'inherit' })
      steps.push({ step: 'Apply migrations', status: 'success' })
    } catch (error) {
      console.log('⚠️  Some migrations may have failed (functions might already exist)')
      steps.push({ step: 'Apply migrations', status: 'partial' })
    }

    // Step 2: Create GitHub user tokens table if missing
    console.log('\n📊 Step 2: Creating missing tables...\n')
    
    const createTablesSQL = `
-- Create github_user_tokens table if not exists
CREATE TABLE IF NOT EXISTS github_user_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'bearer',
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create RLS policies
ALTER TABLE github_user_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" ON github_user_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all tokens" ON github_user_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Create get_github_token function
CREATE OR REPLACE FUNCTION get_github_token(user_id UUID)
RETURNS TEXT AS $$
DECLARE
  token TEXT;
BEGIN
  SELECT access_token INTO token
  FROM github_user_tokens
  WHERE github_user_tokens.user_id = $1;
  
  RETURN token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_github_token TO service_role;
`

    // Execute via a temporary migration file
    const fs = await import('fs/promises')
    const migrationPath = join(__dirname, '../supabase/migrations/20250808_github_user_tokens.sql')
    await fs.writeFile(migrationPath, createTablesSQL)
    
    try {
      execSync('npx supabase db push --skip-confirm', { stdio: 'inherit' })
      steps.push({ step: 'Create github_user_tokens table', status: 'success' })
    } catch (error) {
      steps.push({ step: 'Create github_user_tokens table', status: 'failed' })
    }

    // Step 3: Setup cron jobs via direct API call
    console.log('\n⏰ Step 3: Setting up cron jobs...\n')
    
    // We'll need to do this via SQL since cron.schedule might not be available via RPC
    console.log('Please run the following in the Supabase SQL Editor:')
    console.log(`
-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule GitHub crawl coordinator
SELECT cron.schedule(
  'github-crawl-coordinator',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/github-crawl-coordinator',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Schedule GitHub code parser worker
SELECT cron.schedule(
  'github-code-parser-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://zqlfxakbkwssxfynrmnk.supabase.co/functions/v1/github-code-parser-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),  
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'cron', 'batch_size', 10)
  );
  $$
);
`)
    
    steps.push({ step: 'Setup cron jobs', status: 'manual' })

    // Step 4: Create PGMQ queues
    console.log('\n📬 Step 4: Creating PGMQ queues...\n')
    
    console.log('Please run the following in the Supabase SQL Editor:')
    console.log(`
-- Create GitHub queues
SELECT pgmq.create('github_crawl');
SELECT pgmq.create('github_code_parsing');

-- Verify queues
SELECT * FROM pgmq.list_queues();
`)
    
    steps.push({ step: 'Create PGMQ queues', status: 'manual' })

    // Step 5: Test basic functionality
    console.log('\n🧪 Step 5: Testing basic functionality...\n')
    
    // Test coordinator
    const coordResponse = await fetch(`${supabaseUrl}/functions/v1/github-crawl-coordinator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ test: true })
    })
    
    console.log(`Coordinator test: ${coordResponse.ok ? '✅ Working' : '❌ Failed'}`)
    steps.push({ 
      step: 'Test coordinator', 
      status: coordResponse.ok ? 'success' : 'failed' 
    })

    // Summary
    console.log('\n\n📋 SETUP SUMMARY')
    console.log('================\n')
    
    steps.forEach(step => {
      const icon = step.status === 'success' ? '✅' : 
                   step.status === 'failed' ? '❌' : 
                   step.status === 'manual' ? '⚠️' : '⚡'
      console.log(`${icon} ${step.step}: ${step.status}`)
    })
    
    console.log('\n🎯 NEXT STEPS:')
    console.log('1. Run the SQL commands shown above in the Supabase SQL Editor')
    console.log('2. Ensure you have a GitHub OAuth app configured in Supabase Auth')
    console.log('3. Test with: npx tsx scripts/test-github-async-e2e.ts')
    
    console.log('\n📚 DOCUMENTATION:')
    console.log('- GitHub OAuth setup: https://supabase.com/docs/guides/auth/social-login/auth-github')
    console.log('- Edge Functions: https://supabase.com/docs/guides/functions')
    console.log('- pg_cron: https://supabase.com/docs/guides/database/extensions/pg_cron')

  } catch (error) {
    console.error('❌ Setup error:', error)
  }
}

// Run setup
setupGitHubAsyncComplete()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })