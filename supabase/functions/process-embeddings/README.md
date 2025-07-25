# Process Embeddings Edge Function

This Supabase Edge Function processes memory embeddings from the `memory_queue` table and stores them in Neo4j.

## Overview

The function:
1. Reads pending items from the `memory_queue` table
2. Generates embeddings using OpenAI's text-embedding-3-large model (if not already provided)
3. Creates Memory nodes in Neo4j with the embeddings
4. Establishes relationships between memories, projects, and users
5. Updates the queue status to completed/failed

## Environment Variables

Required environment variables:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for Supabase
- `OPENAI_API_KEY`: OpenAI API key for generating embeddings
- `NEO4J_URI`: Neo4j connection URI (defaults to neo4j+s://eb61aceb.databases.neo4j.io)
- `NEO4J_USER`: Neo4j username (defaults to neo4j)
- `NEO4J_PASSWORD`: Neo4j password (required)

## Neo4j Integration

The function creates the following graph structure:

```
(User)-[:CREATED]->(Memory)-[:BELONGS_TO_PROJECT]->(Project)
```

### Memory Node Properties
- `id`: Unique identifier
- `content`: The memory content
- `embedding`: Vector embedding (3072 dimensions)
- `project_name`: Associated project
- `user_id`: User who created the memory
- `team_id`: Team association (if applicable)
- `type`: Memory type (general, code, etc.)
- `metadata`: Additional metadata as JSON string
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

### Project Node Properties
- `id`: Unique identifier
- `name`: Project name
- `total_memories`: Count of associated memories
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

## Processing Flow

1. **Batch Processing**: Processes up to 100 items at a time
2. **Parallel Workers**: Uses up to 10 parallel workers for efficiency
3. **Error Handling**: Failed items are marked with error details and retry count
4. **Pre-computed Embeddings**: Supports embeddings passed in metadata to avoid regeneration

## Usage

The function is triggered via HTTP request to the edge function endpoint:

```bash
curl -X POST https://[project-ref].supabase.co/functions/v1/process-embeddings \
  -H "Authorization: Bearer [anon-key]" \
  -H "Content-Type: application/json"
```

## Notes

- The function runs in the background and returns immediately
- Neo4j connection is properly closed after processing
- Supports both new embedding generation and pre-computed embeddings
- Automatically creates Project and User nodes as needed