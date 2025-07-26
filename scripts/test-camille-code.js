const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testCamilleCode() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  console.log('Testing with Camille source files...\n');
  
  // Read some key Camille files
  const camilleFiles = [
    {
      path: 'src/server.ts',
      content: await fs.readFile('/Users/srao/camille/src/server.ts', 'utf-8'),
      language: 'typescript'
    },
    {
      path: 'src/storage/supastate-provider.ts',
      content: await fs.readFile('/Users/srao/camille/src/storage/supastate-provider.ts', 'utf-8'),
      language: 'typescript'
    },
    {
      path: 'src/code-parser/typescript-parser.ts',
      content: await fs.readFile('/Users/srao/camille/src/code-parser/typescript-parser.ts', 'utf-8'),
      language: 'typescript'
    }
  ];
  
  console.log(`Sending ${camilleFiles.length} Camille files for processing...`);
  
  // Send files to ingest-code endpoint
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ingest-code`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workspaceId: 'user:test-user',
      projectName: 'camille',
      files: camilleFiles.map(f => ({
        ...f,
        git: {
          branch: 'main',
          commit: 'test-camille-commit',
          author: 'Test User',
          timestamp: new Date().toISOString()
        }
      }))
    })
  });
  
  const result = await response.json();
  console.log('Ingestion result:', result);
  
  if (!result.taskId) {
    console.error('No task ID returned');
    return;
  }
  
  // Trigger processing
  console.log('\nTriggering processing...');
  await fetch(`${SUPABASE_URL}/functions/v1/process-code`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ taskId: result.taskId })
  });
  
  // Wait for processing
  console.log('Waiting 30 seconds for processing...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Check results
  const { data: queue } = await supabase
    .from('code_processing_queue')
    .select('file_path, status, error')
    .eq('task_id', result.taskId);
    
  console.log('\nProcessing results:');
  console.table(queue);
  
  // Query for entities
  console.log('\nQuerying for Camille entities...');
  const entityResponse = await fetch(`${SUPABASE_URL}/functions/v1/query-neo4j`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        MATCH (n:CodeEntity {project_name: 'camille'})
        RETURN n.name as name, n.type as type, count(*) as count
        ORDER BY n.type, n.name
        LIMIT 50
      `
    })
  });
  
  if (entityResponse.ok) {
    const { results } = await entityResponse.json();
    console.log('\nCamille code entities:');
    console.table(results);
  }
  
  // Query for relationships
  console.log('\nQuerying for relationships...');
  const relResponse = await fetch(`${SUPABASE_URL}/functions/v1/query-neo4j`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        MATCH (n:CodeEntity {project_name: 'camille'})-[r]->(m:CodeEntity)
        WHERE NOT type(r) = 'DEFINED_IN'
        RETURN n.name as from, type(r) as relationship, m.name as to
        LIMIT 30
      `
    })
  });
  
  if (relResponse.ok) {
    const { results } = await relResponse.json();
    console.log('\nCamille code relationships:');
    console.table(results);
  }
}

testCamilleCode().catch(console.error);