# Test Entity IDs for API Testing

Based on the script output, here are entity IDs you can use for testing the APIs:

## Memory Nodes with REFERENCES_CODE Relationships

1. **Memory ID**: `eda76fcd-d376-4857-b60e-cd54138718b1`
   - Content: TypeScript compilation error discussion
   - References 5 code entities

2. **Memory ID**: `56dda965-0dea-465c-8690-806cd754663d`
   - Content: MCP tool definition update
   - References 3 code entities

3. **Memory ID**: `73fd8a3b-a1ed-41a2-ae9b-6e4656b0676b`
   - Content: Graph search implementation completion
   - References 5 code entities

## CodeEntity Nodes with IMPORTS Relationships

1. **Code Entity ID**: `9efde629-ba77-4f52-80f8-d3c7418ae104`
   - Name: mcp-pipe-proxy.py
   - Type: module
   - Imports 35 other entities

2. **Code Entity ID**: `27434e8b-98c4-4f9a-929b-f8bb1aa9dc72`
   - Name: config-watch.test.ts
   - Type: module
   - Imports 6 other entities

## CodeEntity Nodes with DEFINES_FUNCTION Relationships

1. **Code Entity ID**: `246e86e3-e9d0-484e-87c4-1379f60b7b45`
   - Name: test-graph-search-api.js
   - Type: module
   - Defines 1 function

2. **Code Entity ID**: `ace32f9f-98e1-4ca1-9932-5781bc65637b`
   - Name: test-graph-count.js
   - Type: module
   - Defines 1 function

## Memory Nodes with Embeddings (via EntitySummary)

1. **Memory ID**: `887aef42-02f5-46a6-8824-2eeb96021ddc`
   - Summary ID: `11e30b74-03da-4f5b-ad2a-e1c2238fd7d8`
   - Has 3072-dimensional embedding

2. **Memory ID**: `183f2762-0259-4787-9516-dc5e3ec6b777`
   - Summary ID: `30ef720e-95cc-4d89-be51-2b1f0c54e13a`
   - Has 3072-dimensional embedding

## CodeEntity Nodes with Embeddings (via EntitySummary)

1. **Code Entity ID**: `246e86e3-e9d0-484e-87c4-1379f60b7b45`
   - Name: test-graph-search-api.js
   - Summary ID: `58584449-f35e-4bd4-9d80-381173f72a85`
   - Has 3072-dimensional embedding

2. **Code Entity ID**: `c3794da6-66c1-4d5a-b47b-a8f769437427`
   - Name: tsconfig.json
   - Summary ID: `75c8b591-01dd-4493-9855-24d5540d7a4d`
   - Has 3072-dimensional embedding

## API Testing Examples

### Test Memory API
```bash
# Get memory details
curl http://localhost:3000/api/memories/887aef42-02f5-46a6-8824-2eeb96021ddc

# Search memories with embeddings
curl http://localhost:3000/api/memories/search?q=typescript+error
```

### Test Code API
```bash
# Get code entity details
curl http://localhost:3000/api/code/246e86e3-e9d0-484e-87c4-1379f60b7b45

# Get code entity content
curl http://localhost:3000/api/code/246e86e3-e9d0-484e-87c4-1379f60b7b45/content

# Search code entities
curl http://localhost:3000/api/code/search?q=test+graph
```

### Test Pattern API
```bash
# Get patterns for a specific entity
curl http://localhost:3000/api/patterns?entityId=887aef42-02f5-46a6-8824-2eeb96021ddc
```

## Summary Statistics
- Total Memory nodes: 12,031
- Total CodeEntity nodes: 808
- Total EntitySummary nodes: 12,872
- Memory nodes with code references: Multiple found
- Code entities with imports: Multiple found
- Entities with embeddings: Multiple found for both Memory and CodeEntity types