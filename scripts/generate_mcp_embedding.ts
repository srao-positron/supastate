import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateEmbedding() {
  console.log('Generating embedding for "MCP"...');
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: 'MCP',
    dimensions: 3072,
  });
  
  const embedding = response.data[0].embedding;
  const embeddingJson = JSON.stringify(embedding);
  
  console.log('Embedding generated successfully!');
  console.log('Array length:', embedding.length);
  console.log('First 5 values:', embedding.slice(0, 5));
  console.log('JSON string length:', embeddingJson.length);
  
  // Save to file for use in psql
  fs.writeFileSync('/tmp/mcp_embedding.json', embeddingJson);
  console.log('\nEmbedding saved to /tmp/mcp_embedding.json');
  
  // Generate psql command with proper escaping
  const psqlCommand = `
-- Test match_memories function with MCP embedding
SELECT 
  id,
  substring(content, 1, 100) as content_preview,
  similarity
FROM match_memories(
  query_embedding := $embedding$${embeddingJson}$embedding$,
  match_threshold := 0.5,
  match_count := 10,
  filter_user_id := 'a02c3fed-3a24-442f-becc-97bac8b75e90'::uuid
)
ORDER BY similarity DESC;`;
  
  fs.writeFileSync('/tmp/test_match_memories.sql', psqlCommand);
  console.log('\nSQL query saved to /tmp/test_match_memories.sql');
  console.log('\nTo test, run:');
  console.log('npx supabase db query < /tmp/test_match_memories.sql');
}

generateEmbedding().catch(console.error);