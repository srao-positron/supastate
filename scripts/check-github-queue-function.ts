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

async function checkGitHubQueueFunction() {
  console.log('🔍 Checking GitHub Queue Function')
  console.log('=================================\n')

  try {
    // Test if the function exists
    const { data, error } = await supabase.rpc('queue_github_crawl', {
      p_repository_id: '00000000-0000-0000-0000-000000000000',
      p_crawl_type: 'test',
      p_priority: 10,
      p_data: {}
    })
    
    if (error) {
      console.log('❌ Function error:', error.message)
      
      if (error.message.includes('does not exist')) {
        console.log('\n📝 Function queue_github_crawl does not exist!')
        console.log('\nCreating the function...')
        
        // Create the function
        const createFunctionSQL = `
-- Queue GitHub crawl job function
CREATE OR REPLACE FUNCTION queue_github_crawl(
  p_repository_id UUID,
  p_crawl_type TEXT DEFAULT 'update',
  p_priority INTEGER DEFAULT 10,
  p_data JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Insert into crawl queue
  INSERT INTO github_crawl_queue (
    repository_id,
    crawl_type,
    priority,
    data,
    status
  ) VALUES (
    p_repository_id,
    p_crawl_type,
    p_priority,
    p_data,
    'pending'
  ) RETURNING id INTO v_job_id;
  
  -- Also queue in PGMQ for immediate processing
  PERFORM pgmq.send(
    'github_crawl',
    jsonb_build_object(
      'job_id', v_job_id,
      'repository_id', p_repository_id,
      'crawl_type', p_crawl_type,
      'data', p_data
    )
  );
  
  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION queue_github_crawl TO anon, authenticated, service_role;
`
        
        const { error: createError } = await supabase.rpc('execute_sql', {
          sql: createFunctionSQL
        })
        
        if (createError) {
          console.log('Failed to create function:', createError)
          console.log('\nTrying direct approach...')
          
          // Let's check what tables exist
          const { data: tables } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .ilike('table_name', '%github%')
          
          console.log('\nGitHub-related tables:')
          tables?.forEach(t => console.log(`- ${t.table_name}`))
        }
      } else if (error.code === '23503') {
        console.log('Foreign key violation - repository ID does not exist')
      }
    } else {
      console.log('✅ Function exists and returned:', data)
    }
    
    // Check if github_crawl_queue table exists
    console.log('\n🔍 Checking github_crawl_queue table...')
    
    const { data: tableExists } = await supabase
      .from('github_crawl_queue')
      .select('id')
      .limit(1)
    
    if (tableExists !== null) {
      console.log('✅ github_crawl_queue table exists')
      
      // Check queue contents
      const { data: queueItems, count } = await supabase
        .from('github_crawl_queue')
        .select('*', { count: 'exact', head: false })
        .order('created_at', { ascending: false })
        .limit(5)
      
      console.log(`\n📊 Queue contains ${count || 0} items`)
      if (queueItems && queueItems.length > 0) {
        console.log('\nRecent queue items:')
        queueItems.forEach(item => {
          console.log(`- ${item.crawl_type} (${item.status}) - Created: ${new Date(item.created_at).toLocaleString()}`)
        })
      }
    } else {
      console.log('❌ github_crawl_queue table does not exist!')
    }
    
    // Check PGMQ queues
    console.log('\n🔍 Checking PGMQ queues...')
    
    const { data: pgmqQueues } = await supabase.rpc('pgmq_list_queues')
    
    if (pgmqQueues) {
      const githubQueues = pgmqQueues.filter((q: string) => q.includes('github'))
      console.log('\nGitHub-related PGMQ queues:')
      githubQueues.forEach((q: string) => console.log(`- ${q}`))
      
      if (!githubQueues.includes('github_crawl')) {
        console.log('\n❌ github_crawl PGMQ queue does not exist!')
        console.log('Creating queue...')
        
        await supabase.rpc('pgmq_create', { queue_name: 'github_crawl' })
        console.log('✅ Created github_crawl queue')
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the check
checkGitHubQueueFunction()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })