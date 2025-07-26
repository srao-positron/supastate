import { promises as fs } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

async function testCodeProcessing() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  // Read the test file
  const content = await fs.readFile('./test-code-sample.ts', 'utf-8');
  
  // Use a test workspace ID
  const workspaceId = 'user:test-user';
  
  console.log('Testing code processing with workspace:', workspaceId);
  
  // Send file to ingest-code endpoint
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ingest-code`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workspaceId,
      projectName: 'test-project',
      files: [{
        path: 'test-code-sample.ts',
        content,
        language: 'typescript',
        git: {
          branch: 'main',
          commit: 'test-commit',
          author: 'Test User',
          timestamp: new Date().toISOString()
        }
      }]
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to ingest code: ${error}`);
  }
  
  const result = await response.json();
  console.log('Ingestion result:', result);
  
  // Wait a bit for processing
  console.log('Waiting for processing to complete...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Check the processing status
  const { data: processedFiles } = await supabase
    .from('code_processing_queue')
    .select('*')
    .eq('task_id', result.taskId)
    .order('created_at', { ascending: false });
  
  console.log('Processing status:', processedFiles?.map(f => ({
    file: f.file_path,
    status: f.status,
    error: f.error
  })));
  
  // Query Neo4j to see the relationships
  console.log('\nQuerying Neo4j for entities and relationships...');
  
  const neo4jResponse = await fetch(`${SUPABASE_URL}/functions/v1/query-neo4j`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        MATCH (e:CodeEntity {project_name: 'test-project'})
        OPTIONAL MATCH (e)-[r]->(target)
        RETURN e.name as entity, e.type as entityType, type(r) as relationship, target.name as targetName
        ORDER BY e.name
      `
    })
  });
  
  if (neo4jResponse.ok) {
    const neo4jData = await neo4jResponse.json();
    console.log('\nExtracted entities and relationships:');
    neo4jData.results.forEach((r: any) => {
      console.log(`- ${r.entity} (${r.entityType})${r.relationship ? ` --[${r.relationship}]--> ${r.targetName}` : ''}`);
    });
  }
}

testCodeProcessing()
  .then(() => console.log('\nTest completed!'))
  .catch(console.error);