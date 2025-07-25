# Neo4j Environment Variables Setup

The following environment variables need to be set for Neo4j integration:

## For Vercel (Production)

Add these environment variables in your Vercel project settings:

```
NEO4J_URI=neo4j+s://eb61aceb.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=[your-password-here]
OPENAI_API_KEY=[your-openai-api-key]
```

## For Supabase Edge Functions

The edge functions need the same environment variables. Set them using the Supabase CLI:

```bash
supabase secrets set NEO4J_URI=neo4j+s://eb61aceb.databases.neo4j.io
supabase secrets set NEO4J_USER=neo4j
supabase secrets set NEO4J_PASSWORD=[your-password-here]
supabase secrets set OPENAI_API_KEY=[your-openai-api-key]
```

## For Local Development

These are already set in your `.env.local` file.

## Important Notes

1. The Neo4j URI uses the `neo4j+s://` protocol for secure connections
2. The OPENAI_API_KEY is required for generating embeddings (text-embedding-3-large model)
3. All systems use the same embedding model (3072 dimensions) for consistency