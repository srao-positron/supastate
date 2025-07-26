const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function resetAndTest() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  console.log('Resetting test data...\n');
  
  // Delete old test data
  await supabase
    .from('code_processing_queue')
    .delete()
    .eq('project_name', 'test-project');
    
  await supabase
    .from('code_processing_tasks')
    .delete()
    .eq('status', 'completed');
  
  // Read the test file
  const content = await fs.readFile('./test-code-sample.ts', 'utf-8');
  
  console.log('Sending new test file...\n');
  
  // Send file to ingest-code endpoint
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ingest-code`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workspaceId: 'user:test-user',
      projectName: 'test-project',
      files: [{
        path: 'test-code-sample.ts',
        content,
        language: 'typescript',
        git: {
          branch: 'main',
          commit: 'test-commit-2',
          author: 'Test User',
          timestamp: new Date().toISOString()
        }
      }]
    })
  });
  
  const result = await response.json();
  console.log('Ingestion result:', result);
  
  if (!result.taskId) {
    console.error('No task ID returned');
    return;
  }
  
  // Directly trigger processing
  console.log('\nTriggering processing...');
  const processResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-code`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ taskId: result.taskId })
  });
  
  console.log('Process response status:', processResponse.status);
  
  // Wait for processing
  console.log('\nWaiting 20 seconds for processing...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  // Check results
  const { data: queue } = await supabase
    .from('code_processing_queue')
    .select('file_path, status, error')
    .eq('task_id', result.taskId);
    
  console.log('\nProcessing results:');
  console.table(queue);
  
  // Query Neo4j for entities
  console.log('\nQuerying Neo4j for entities...');
  const entityResponse = await fetch(`${SUPABASE_URL}/functions/v1/query-neo4j`, {
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
        LIMIT 20
      `
    })
  });
  
  if (entityResponse.ok) {
    const { results } = await entityResponse.json();
    console.log('\nExtracted entities:');
    console.table(results);
  }
  
  // Query for relationships
  console.log('\nQuerying Neo4j for relationships...');
  const relResponse = await fetch(`${SUPABASE_URL}/functions/v1/query-neo4j`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        MATCH (n:CodeEntity {project_name: 'test-project'})-[r]->(m)
        WHERE NOT type(r) = 'DEFINED_IN'
        RETURN n.name as from, type(r) as relationship, m.name as to
        ORDER BY n.line_start
        LIMIT 20
      `
    })
  });
  
  if (relResponse.ok) {
    const { results } = await relResponse.json();
    console.log('\nExtracted relationships:');
    console.table(results);
  }
}

resetAndTest().catch(console.error);