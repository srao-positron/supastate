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

async function inspectNeo4j() {
  console.log('Inspecting Neo4j data...\n');
  
  // Query for Memory and EntitySummary nodes
  const queries = [
    {
      name: 'Memory nodes count and workspace_id',
      query: `
        MATCH (m:Memory)
        RETURN COUNT(m) as count, m.workspace_id
        LIMIT 10
      `
    },
    {
      name: 'Memory nodes with embeddings',
      query: `
        MATCH (m:Memory)
        WHERE m.embedding IS NOT NULL
        RETURN COUNT(m) as count
      `
    },
    {
      name: 'EntitySummary nodes',
      query: `
        MATCH (e:EntitySummary)
        RETURN COUNT(e) as count, e.type
        LIMIT 10
      `
    },
    {
      name: 'Recent Memory nodes details',
      query: `
        MATCH (m:Memory)
        RETURN m.id, m.content, m.workspace_id, m.user_id, m.created_at, 
               CASE WHEN m.embedding IS NOT NULL THEN true ELSE false END as has_embedding
        ORDER BY m.created_at DESC
        LIMIT 10
      `
    },
    {
      name: 'All CodeEntity nodes',
      query: `
        MATCH (n:CodeEntity)
        RETURN n.name as name, n.type as type, n.project_name as project, labels(n) as labels
        ORDER BY n.created_at DESC
        LIMIT 20
      `
    }
  ];
  
  for (const { name, query } of queries) {
    console.log(`\n=== ${name} ===`);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/query-neo4j`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error(`Error: ${error}`);
        continue;
      }
      
      const { results } = await response.json();
      
      if (results.length === 0) {
        console.log('No results found');
      } else {
        console.table(results);
      }
    } catch (error) {
      console.error(`Failed to run query: ${error}`);
    }
  }
  
  // Also check processing queue
  console.log('\n=== Recent Processing Queue Items ===');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  const { data: queue } = await supabase
    .from('code_processing_queue')
    .select('file_path, status, error, created_at, processed_at')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (queue && queue.length > 0) {
    console.table(queue);
  } else {
    console.log('No items in processing queue');
  }
}

inspectNeo4j().catch(console.error);