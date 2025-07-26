const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testDirectProcessing() {
  console.log('Testing direct code processing...\n');
  
  // Get the pending task
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: tasks } = await supabase
    .from('code_processing_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (!tasks || tasks.length === 0) {
    console.log('No processing tasks found');
    return;
  }
  
  const taskId = tasks[0].id;
  console.log('Found task:', taskId, 'Status:', tasks[0].status);
  
  // Directly call the process-code function
  console.log('\nTriggering process-code function...');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-code`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ taskId })
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    return;
  }
  
  const result = await response.json();
  console.log('Process response:', result);
  
  // Wait a bit
  console.log('\nWaiting 15 seconds for processing...');
  await new Promise(resolve => setTimeout(resolve, 15000));
  
  // Check the results
  const { data: updatedTask } = await supabase
    .from('code_processing_tasks')
    .select('*')
    .eq('id', taskId)
    .single();
    
  console.log('\nTask status:', updatedTask?.status);
  
  // Check queue status
  const { data: queue } = await supabase
    .from('code_processing_queue')
    .select('file_path, status, error')
    .eq('task_id', taskId);
    
  console.log('\nQueue items:');
  console.table(queue);
  
  // Query Neo4j
  console.log('\nQuerying Neo4j for entities...');
  const neo4jResponse = await fetch(`${SUPABASE_URL}/functions/v1/query-neo4j`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        MATCH (n:CodeEntity {project_name: 'test-project'})
        RETURN n.name as name, n.type as type, n.line_start as line
        ORDER BY n.line_start
      `
    })
  });
  
  if (neo4jResponse.ok) {
    const { results } = await neo4jResponse.json();
    console.log('\nFound entities:');
    console.table(results);
  }
}

testDirectProcessing().catch(console.error);