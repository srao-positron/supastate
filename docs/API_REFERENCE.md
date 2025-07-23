# Supastate API Reference

## Authentication

All API endpoints require authentication via API key in the Authorization header:
```
Authorization: Bearer <your-api-key>
```

## Endpoints

### Memory Search

Search through processed memories using semantic similarity.

**Endpoint:** `GET /api/search/memories`

**Query Parameters:**
- `q` (required): The search query text
- `limit` (optional): Maximum number of results to return (default: 20)
- `project` (optional): Filter results by project name (e.g., "my-project")
- `includeProcessing` (optional): Include count of items still being processed (default: false)

**Example Request:**
```bash
curl -X GET "https://api.supastate.ai/api/search/memories?q=authentication&limit=10&project=my-app" \
  -H "Authorization: Bearer your-api-key"
```

**Response:**
```json
{
  "results": [
    {
      "chunkId": "chunk-123",
      "content": "User asked about authentication...",
      "similarity": 0.89,
      "metadata": {...},
      "sessionId": "session-456",
      "projectName": "my-app"
    }
  ],
  "count": 1,
  "processingCount": 0,
  "query": "authentication"
}
```

### Memory Ingestion

Submit memory chunks for server-side processing and embedding generation.

**Endpoint:** `POST /api/ingest/memory`

**Request Body:**
```json
{
  "sessionId": "session-123",
  "projectPath": "/path/to/project",
  "chunks": [
    {
      "chunkId": "chunk-001",
      "content": "Memory content here",
      "metadata": {
        "timestamp": "2025-07-23T00:00:00Z",
        "messageType": "user",
        "hasCode": false
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "queued": 1,
  "failed": 0,
  "results": [...],
  "message": "Chunks queued for processing"
}
```

### Code Ingestion

Submit code files for server-side processing and analysis.

**Endpoint:** `POST /api/ingest/code`

**Request Body:**
```json
{
  "projectPath": "/path/to/project",
  "files": [
    {
      "path": "/project/src/index.ts",
      "content": "export function main() {...}",
      "language": "typescript"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "queued": 1,
  "failed": 0,
  "results": [...],
  "message": "Files queued for processing"
}
```

## Project Filtering

When using the search API, you can filter results by project name using the `project` query parameter. This is useful when:

- You have multiple projects indexed in Supastate
- You want to search within a specific codebase
- You need to isolate search results to a particular context

**Note:** The project name is derived from the basename of the project path. For example:
- `/home/user/my-project` → project name: `my-project`
- `/workspace/api-server` → project name: `api-server`

## Rate Limits

- Memory ingestion: 100 chunks per request
- Code ingestion: 50 files per request
- Search queries: No hard limit, but results are capped by the `limit` parameter

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "details": [...] // Optional detailed error information
}
```

Common HTTP status codes:
- `400`: Bad Request - Invalid parameters or request body
- `401`: Unauthorized - Missing or invalid API key
- `500`: Internal Server Error - Server-side processing error