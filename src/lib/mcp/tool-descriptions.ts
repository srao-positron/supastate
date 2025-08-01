/**
 * Rich documentation for Supastate MCP tools
 * Following Camille's pattern of comprehensive tool descriptions
 */

export const TOOL_DESCRIPTIONS = {
  search: {
    name: 'search',
    description: `Search across code, memories, and GitHub data using natural language queries.

## Overview
This is your primary discovery tool for finding any information stored in Supastate. It uses 
semantic search powered by OpenAI embeddings to find conceptually related content across all 
entity types. Unlike keyword search, it understands meaning and context.

**IMPORTANT**: Supastate is a KNOWLEDGE GRAPH where memories, code, and GitHub entities are 
richly interconnected. Results now include contextual relationships - always examine the 
\`relatedMemories\` and \`relatedCode\` fields to understand the full context. Results are 
sorted by relevance AND recency to show the most recent relevant items first.

## When to Use This Tool
1. **Initial exploration** - Start here when you need to understand any topic
2. **Cross-cutting concerns** - Find how a concept appears across code AND conversations
3. **Historical context** - Discover past decisions and their implementations
4. **Impact analysis** - See all entities related to a feature or system
5. **Debugging assistance** - Find similar errors or issues from the past

## Entity Types
- **code**: Functions, classes, interfaces from your codebase
- **memory**: Development conversations, decisions, and discussions
- **github**: Issues, PRs, commits (when available)

## Integration into Your Workflow
- Always search first before asking clarifying questions
- Use broad queries initially, then filter by type if needed
- Combine with inspectEntity to dive deeper into specific results
- Follow up with exploreRelationships to understand connections

## Example Queries and Expected Results

### Example 1: Understanding a feature
Query: "user authentication flow"
Expected results:
- Memory: Past conversations about auth design decisions
- Code: Auth middleware, login controllers, JWT utilities
- GitHub: Auth-related issues and PRs

### Example 2: Debugging an error
Query: "connection timeout database error"
Expected results:
- Memory: Previous debugging sessions with similar errors
- Code: Database connection utilities, retry logic
- GitHub: Issues reporting timeout problems

### Example 3: Architecture decisions
Query: "why did we choose Redis for caching"
Expected results:
- Memory: Architecture discussion conversations
- Code: Redis client implementation, cache utilities
- GitHub: PRs introducing Redis integration

## URI Format
All entities in Supastate use a simple URI format: \`type:id\`
- **Memory**: \`memory:d6c77a29-19e5-467a-b394-6ead35c7dc4a\`
- **Code**: \`code:src/auth/validateToken:validateToken\`
- **Pattern**: \`pattern:pat_123abc\`

The \`id\` field in all search results contains the full URI, ready to use with inspectEntity, 
exploreRelationships, or getRelatedItems tools.

## Response Format
{
  "results": [
    {
      "id": "memory:d6c77a29-19e5-467a-b394-6ead35c7dc4a",
      "name": "Discussion about Redis vs Memcached",
      "type": "memory",
      "content": "We evaluated both options...",
      "summary": "Team discussion comparing Redis and Memcached for caching layer",
      "score": 0.92,
      "projectName": "backend-refactor"
    },
    {
      "id": "code:src-cache-redis-client-ts-RedisCache",
      "name": "RedisCache",
      "type": "code",
      "content": "export class RedisCache implements ICache...",
      "summary": "Redis cache implementation with automatic retry and connection pooling",
      "filePath": "src/cache/redis-client.ts",
      "score": 0.87
    }
  ],
  "query": "why did we choose Redis for caching",
  "totalResults": 15
}

## Pro Tips
- Use natural language, not keywords (e.g., "how do we handle user sessions" not "session handler")
- Include context in queries for better results ("React component for user profile" vs just "profile")
- Results are sorted by relevance score AND recency - newest relevant content appears first
- Check scores - below 0.7 might be less relevant
- Combine multiple concepts with "and" for refined results
- Use the type filter only when you specifically need one kind of entity
- **ALWAYS follow the graph**: Use the related entities in results to explore connected content
- Memory results include \`relatedCode\` showing what code was discussed
- Code results include \`relatedMemories\` showing conversations about that code`,
  },

  searchCode: {
    name: 'searchCode',
    description: `Search code with deep understanding of programming patterns and language semantics.

## Overview
Specialized code search that understands programming concepts, design patterns, and language-specific 
idioms. Goes beyond text matching to find functionally similar code even with different implementations.
Ideal for finding examples, understanding patterns, and locating specific functionality.

**NEW FEATURES**:
- Results include full EntitySummary data with keywords and pattern signals
- Each code result shows related memories discussing that code
- Results sorted by relevance AND recency
- Rich metadata helps understand code purpose and usage

## When to Use This Tool
1. **Finding implementations** - Locate where specific functionality is coded
2. **Learning patterns** - Discover how certain patterns are used in the codebase
3. **Refactoring preparation** - Find all instances of a pattern to refactor
4. **Code review** - Find similar code that might need the same fix
5. **Understanding conventions** - See examples of project coding standards
6. **Security audits** - Find potentially vulnerable code patterns

## Integration into Your Workflow
- Use before implementing new features to find existing patterns
- Search for similar code when fixing bugs - the issue might exist elsewhere
- Include language filter when working in polyglot codebases
- Exclude tests when looking for production implementations
- Include tests when looking for usage examples

## Search Capabilities
- **Semantic understanding**: Finds "user authentication" even if code says "login validation"
- **Pattern recognition**: Understands "singleton pattern" or "error handling"
- **Language awareness**: Knows TypeScript types, Python decorators, etc.
- **Framework knowledge**: Recognizes React hooks, Express middleware, etc.

## Example Queries and Expected Results

### Example 1: Finding API endpoints
Query: "REST API endpoints for user management"
Language: "typescript"
Expected results:
- User controller with CRUD operations
- Route definitions for /users paths
- Middleware for user authentication
- OpenAPI/Swagger definitions

### Example 2: Finding error handling patterns
Query: "try catch error handling with logging"
includeTests: false
Expected results:
- Global error handlers
- Service methods with try-catch blocks
- Error logging utilities
- Custom error classes

### Example 3: Finding React components
Query: "React form components with validation"
Language: "typescript"
Project: "frontend"
Expected results:
- Form components with validation logic
- Custom form hooks
- Validation utility functions
- Form field components

## Response Format
{
  "results": [
    {
      "id": "code:src/controllers/user.controller.ts:UserController",
      "name": "UserController",
      "type": "class",
      "filePath": "src/controllers/user.controller.ts",
      "language": "typescript",
      "content": "export class UserController {\\n  async createUser(req: Request, res: Response)...",
      "summary": "REST controller handling user CRUD operations with validation and error handling",
      "metadata": {
        "exports": ["UserController"],
        "imports": ["express", "user.service", "validation"],
        "methods": ["createUser", "getUser", "updateUser", "deleteUser"]
      },
      "keywords": {
        "error": 5,
        "test": 2,
        "security": 3
      },
      "patternSignals": {
        "has_classes": true,
        "has_api_calls": true,
        "is_test_file": false
      },
      "relatedMemories": [
        {
          "id": "memory:2024-01-10:session-99:chunk-3",
          "content": "We discussed adding rate limiting to the user controller...",
          "summary": "Team discussion about API security improvements",
          "occurredAt": "2024-01-10T15:30:00Z"
        }
      ],
      "score": 0.89
    }
  ],
  "query": "REST API endpoints for user management",
  "filters": {
    "language": "typescript",
    "includeTests": false
  }
}

## Pro Tips
- Be specific about what aspect of code you want ("error handling in async functions" vs "error handling")
- Use programming terminology when appropriate ("dependency injection", "observer pattern")
- Language filter is helpful in polyglot projects
- Set includeTests=false for production code only
- Set includeTests=true to find usage examples
- Project filter helps in monorepos
- Higher scores (>0.8) indicate very relevant matches
- Check the metadata for quick overview of exports/imports
- **FOLLOW THE GRAPH**: Each code result includes memories discussing it - explore these for context
- Check \`keywords\` to understand code focus areas (error handling, testing, etc.)
- Use \`patternSignals\` to quickly identify code characteristics
- Results are sorted by relevance AND recency to show newest matches first`,
  },

  searchMemories: {
    name: 'searchMemories',
    description: `Search through development conversations, decisions, and team discussions.

## Overview
Access the team's collective memory of all development conversations, architectural decisions, 
debugging sessions, and planning discussions. This tool searches through conversation chunks 
that have been automatically summarized and indexed, helping you understand the "why" behind 
code and decisions.

**GRAPH CONTEXT**: Each memory result now includes:
- \`relatedCode\`: Code entities discussed in the conversation
- \`sessionContext\`: Adjacent memory chunks from the same session
- Results sorted by relevance AND recency to show newest discussions first

## When to Use This Tool
1. **Understanding decisions** - Why was something built a certain way?
2. **Finding solutions** - How did we solve this problem before?
3. **Context recovery** - What was discussed in past meetings?
4. **Debugging history** - What issues have we encountered?
5. **Onboarding** - Understanding project history and decisions
6. **Continuity** - Picking up where previous discussions left off

## Memory Types
- **Architecture discussions**: System design, technology choices
- **Bug investigations**: Debugging sessions, root cause analyses
- **Feature planning**: Requirements, user stories, technical specs
- **Code reviews**: PR discussions, improvement suggestions
- **Team decisions**: Process changes, tool adoption
- **Learning moments**: Gotchas, lessons learned, best practices

## Integration into Your Workflow
- Search memories before making architectural changes
- Look for past debugging sessions when facing similar issues
- Use date ranges to find recent discussions
- Filter by project when working on specific components
- Combine with code search to see implementation of discussed ideas

## Example Queries and Expected Results

### Example 1: Architecture decision
Query: "why microservices instead of monolith"
Expected results:
- Team discussion about scaling challenges
- Decision matrix comparing architectures
- Migration planning conversations
- Lessons learned from the transition

### Example 2: Debugging session
Query: "memory leak in production"
dateRange: { start: "2024-01-01" }
Expected results:
- Debugging session transcripts
- Root cause analysis discussion
- Solution implementation planning
- Post-mortem conversations

### Example 3: Feature development
Query: "user notification system requirements"
projects: ["backend", "mobile"]
Expected results:
- Initial feature planning discussions
- Technical design conversations
- API contract negotiations
- Testing strategy discussions

## Response Format
{
  "results": [
    {
      "id": "memory:2024-01-15:session-123:chunk-5",
      "sessionId": "session-123",
      "chunkId": "chunk-5",
      "content": "Team discussed the memory leak issue. Sarah mentioned...",
      "summary": "Debugging session identifying memory leak caused by event listener accumulation",
      "occurredAt": "2024-01-15T14:30:00Z",
      "projectName": "backend",
      "metadata": {
        "participants": ["sarah", "john", "alice"],
        "topics": ["memory-leak", "event-listeners", "performance"],
        "outcome": "identified-fix"
      },
      "relatedCode": [
        {
          "id": "code:src/utils/event-manager.ts:EventManager",
          "name": "EventManager",
          "type": "class",
          "filePath": "src/utils/event-manager.ts",
          "summary": "Event management utility with listener cleanup"
        }
      ],
      "sessionContext": [
        {
          "id": "memory:2024-01-15:session-123:chunk-4",
          "chunkId": "chunk-4",
          "content": "John suggested we implement automatic cleanup...",
          "occurredAt": "2024-01-15T14:25:00Z"
        }
      ],
      "score": 0.91
    }
  ],
  "query": "memory leak in production",
  "filters": {
    "dateRange": { "start": "2024-01-01" },
    "projects": null
  }
}

## Pro Tips
- Use conversational queries ("how did we decide on the API structure")
- Date ranges help find recent discussions
- Project filters are useful for component-specific history
- Higher scores indicate more relevant conversations
- Check metadata for participants and outcomes
- Session IDs group related conversations
- Chunk IDs maintain conversation continuity
- **FOLLOW THE GRAPH**: Always check \`relatedCode\` to see what code was discussed
- Use \`sessionContext\` to understand the full conversation flow
- Results are sorted by relevance AND recency - newest discussions appear first
- Navigate from memories to code to see how discussions became implementations`,
  },

  exploreRelationships: {
    name: 'exploreRelationships',
    description: `Navigate the knowledge graph to understand connections between code, memories, and GitHub entities.

## Overview
Traverse the relationship graph to understand how different parts of your system connect. This tool 
reveals dependencies, references, associations, and semantic relationships between any entities in 
the knowledge base. Essential for impact analysis and understanding system architecture.

## When to Use This Tool
1. **Impact analysis** - What will be affected if I change this?
2. **Dependency tracking** - What does this code depend on?
3. **Architecture visualization** - How do components connect?
4. **Change propagation** - Trace effects of modifications
5. **Knowledge discovery** - Find unexpected connections
6. **Documentation** - Understand system relationships

## Relationship Types
- **IMPORTS**: Code importing/requiring other modules
- **CALLS**: Functions calling other functions
- **EXTENDS**: Class inheritance relationships
- **IMPLEMENTS**: Interface implementations
- **REFERENCES**: Memory discussing code/issues
- **MENTIONS**: Entities referencing each other
- **SEMANTIC_SIMILARITY**: Conceptually related entities
- **AUTHORED**: User authorship relationships
- **MODIFIES**: Changes to entities

## Direction Options
- **out**: Follow outgoing relationships (what this depends on)
- **in**: Follow incoming relationships (what depends on this)
- **both**: Follow all relationships (full context)

## Integration into Your Workflow
- Start from a search result to explore its connections
- Use depth=1 for immediate dependencies, depth=2-3 for broader impact
- Follow "out" for dependencies, "in" for dependents
- Filter by relationship types to focus exploration
- Combine with inspectEntity for detailed information

## Example Uses and Expected Results

### Example 1: Impact analysis
EntityUri: "code:src/auth/jwt.service.ts:JWTService"
Direction: "in"
Depth: 2
Expected results:
- Controllers that use JWTService
- Tests that verify JWT functionality
- Other services depending on JWT
- Memories discussing JWT implementation

### Example 2: Understanding architecture
EntityUri: "code:src/models/user.model.ts:User"
RelationshipTypes: ["REFERENCES", "IMPORTS"]
Direction: "both"
Expected results:
- Services using User model
- Controllers handling User data
- Database queries involving User
- API endpoints returning User data

### Example 3: Tracing discussions
EntityUri: "memory:2024-01-15:session-123:chunk-5"
Direction: "both"
Depth: 1
Expected results:
- Code entities discussed in the memory
- Related memory chunks from same session
- GitHub issues referenced
- Subsequent implementation code

## Response Format
{
  "entityUri": "code:src/auth/jwt.service.ts:JWTService",
  "relationships": [
    {
      "source": {
        "id": "code:src/auth/jwt.service.ts:JWTService",
        "name": "JWTService",
        "type": "code"
      },
      "relationship": "IMPORTED_BY",
      "target": {
        "id": "code:src/controllers/auth.controller.ts:AuthController",
        "name": "AuthController",
        "type": "code"
      },
      "distance": 1
    },
    {
      "source": {
        "id": "code:src/middleware/auth.ts:requireAuth",
        "name": "requireAuth",
        "type": "code"
      },
      "relationship": "CALLS",
      "target": {
        "id": "code:src/auth/jwt.service.ts:JWTService",
        "name": "JWTService",
        "type": "code"
      },
      "distance": 1
    }
  ],
  "totalRelationships": 15,
  "maxDepth": 2
}

## Pro Tips
- Start with depth=1 and increase if needed
- Use "in" to find what depends on your changes
- Use "out" to understand dependencies
- Filter relationship types to reduce noise
- Distance indicates how many hops from the source
- Check relationship direction in results
- Combine multiple relationships types with array
- Entity URIs are from search results' id field`,
  },

  getRelatedItems: {
    name: 'getRelatedItems',
    description: `Find all items related to a specific entity through relationships or semantic similarity.

## Overview
Discover connections and related content for any entity in the knowledge graph. This tool reveals
direct relationships (code dependencies, memory references) and semantically similar content,
helping you understand context and find relevant information that might not be obvious.

## When to Use This Tool
1. **Context expansion** - Find all content related to a specific topic
2. **Code exploration** - Discover all code that references or is referenced by an entity
3. **Memory connections** - Find all conversations about a specific code entity
4. **Pattern discovery** - Identify similar implementations or discussions
5. **Documentation gathering** - Collect all relevant information about a feature
6. **Impact assessment** - See everything connected to what you're changing

## Relationship Types Returned
- **Direct relationships**: Imports, calls, references, mentions, authored by
- **Semantic similarity**: Conceptually related content based on embeddings
- **Cross-type connections**: Memory→Code, Code→Memory, Pattern associations
- **Temporal relationships**: Related conversations from same session
- **Structural relationships**: Parent/child, implements, extends

## Integration into Your Workflow
- Use after search to expand context around interesting results
- Combine with inspectEntity for full details on related items
- Filter by relationship type to focus on specific connections
- Use similarity threshold to control relevance
- Follow chains of relationships to understand system flow

## Example Uses and Expected Results

### Example 1: Finding all content about a function
EntityUri: "code:src/auth/validateToken:validateToken"
Types: ["code", "memory"]
IncludeSimilar: true
Expected results:
- Controllers calling validateToken
- Tests for validateToken
- Memory chunks discussing token validation
- Similar validation functions
- Error handling patterns

### Example 2: Exploring a conversation topic
EntityUri: "memory:2024-01-15:session-123:chunk-5"
Types: ["memory", "code"]
Limit: 20
Expected results:
- Other chunks from same conversation
- Code entities mentioned in discussion
- Related conversations on same topic
- Implementation code created after discussion

### Example 3: Understanding a feature
EntityUri: "code:src/features/notifications:NotificationService"
RelationshipTypes: ["IMPORTS", "IMPORTED_BY", "REFERENCES"]
Expected results:
- All modules using NotificationService
- Dependencies of NotificationService
- Configuration files referencing it
- Related API endpoints

## Response Format
{
  "entityUri": "code:src/auth/validateToken:validateToken",
  "relatedItems": [
    {
      "id": "code:src/controllers/auth:AuthController",
      "type": "code",
      "relationship": "IMPORTED_BY",
      "title": "AuthController",
      "snippet": "import { validateToken } from '../auth/validateToken'...",
      "metadata": {
        "filePath": "src/controllers/auth.ts",
        "language": "typescript"
      }
    },
    {
      "id": "memory:2024-01-10:session-99:chunk-3",
      "type": "memory",
      "relationship": "REFERENCES",
      "title": "Discussion about token validation security",
      "snippet": "We need to ensure the validateToken function checks expiry...",
      "metadata": {
        "participants": ["alice", "bob"],
        "projectName": "auth-service"
      }
    },
    {
      "id": "code:src/auth/verifyToken:verifyToken",
      "type": "code",
      "relationship": "SIMILAR",
      "similarity": 0.89,
      "title": "verifyToken",
      "snippet": "export async function verifyToken(token: string)...",
      "metadata": {
        "reason": "Similar validation pattern"
      }
    }
  ],
  "summary": {
    "totalRelated": 42,
    "byType": {
      "code": 28,
      "memory": 14
    },
    "byRelationship": {
      "IMPORTED_BY": 12,
      "REFERENCES": 8,
      "SIMILAR": 10,
      "CALLS": 12
    }
  },
  "hasMore": true,
  "nextCursor": "eyJvZmZzZXQiOjIwfQ=="
}

## Pro Tips
- Start with default options to see all relationships
- Use type filter to focus on code or conversations
- RelationshipTypes filter helps trace specific patterns
- Higher similarity thresholds (>0.8) for more relevant results
- Check hasMore to know if pagination is available
- Use the summary to understand relationship distribution
- Cross-type relationships reveal hidden connections
- Temporal relationships help reconstruct conversation flow`,
  },

  inspectEntity: {
    name: 'inspectEntity',
    description: `Get comprehensive details about any entity including code, memories, or GitHub items.

## Overview
Deep dive into any entity to see all its properties, relationships, and context. This tool provides 
complete information about a specific item including its content, metadata, connections, and similar 
entities. Use after search to get full details.

**Difference from getRelatedItems**: This tool focuses on the entity itself with a basic view of 
relationships, while getRelatedItems provides comprehensive relationship exploration with filtering, 
pagination, and richer metadata about related items.

## When to Use This Tool
1. **Detailed examination** - See all properties of an entity
2. **Context understanding** - Get full content and metadata
3. **Quick relationship overview** - Basic view of connections (use getRelatedItems for detailed exploration)
4. **Similarity search** - Find related entities
5. **Code inspection** - See full implementation details
6. **Memory review** - Read complete conversation chunks

## Entity Information Provided
- **Full content**: Complete code, conversation, or issue text
- **All properties**: Timestamps, authors, paths, etc.
- **Relationships**: Connected entities and relationship types
- **Similar entities**: Semantically related items
- **Metadata**: Language, framework, tags, participants
- **Embeddings**: Confirmation of vector indexing

## Options
- **includeRelationships**: Get connected entities (default: true)
- **includeContent**: Include full text content (default: true)
- **includeSimilar**: Find similar entities (default: false)

## Integration into Your Workflow
- Use after search to examine specific results
- Enable includeSimilar to find related code/memories
- Review relationships before using exploreRelationships
- Check metadata for context (dates, authors, tags)
- Use content for detailed analysis

## Example Uses and Expected Results

### Example 1: Inspecting code entity
URI: "code:src/services/email.service.ts:EmailService"
includeRelationships: true
includeSimilar: true
Expected results:
- Full class implementation
- Methods and properties
- Import/export relationships
- Test files using this service
- Similar email-related code

### Example 2: Inspecting memory chunk
URI: "memory:2024-01-15:session-123:chunk-5"
Expected results:
- Full conversation text
- Participants and timestamps
- Related memory chunks
- Code entities discussed
- Topics and outcomes

### Example 3: Inspecting GitHub issue
URI: "github:issue:123"
includeRelationships: true
Expected results:
- Issue title and description
- Labels and assignees
- Related PRs
- Mentioned code files
- Linked memories discussing it

## Response Format
{
  "uri": "code:src/services/email.service.ts:EmailService",
  "type": "code",
  "entity": {
    "id": "code:src/services/email.service.ts:EmailService",
    "name": "EmailService",
    "type": "class",
    "filePath": "src/services/email.service.ts",
    "language": "typescript",
    "content": "export class EmailService implements IEmailService {\\n  constructor(private config: EmailConfig) {}\\n  ...",
    "summary": "Email service handling transactional emails with retry logic and template support",
    "createdAt": "2023-11-20T10:30:00Z",
    "modifiedAt": "2024-01-10T15:45:00Z",
    "metadata": {
      "exports": ["EmailService"],
      "imports": ["nodemailer", "email-templates"],
      "methods": ["sendEmail", "sendBulk", "validateAddress"],
      "implements": ["IEmailService"],
      "linesOfCode": 245
    },
    "hasEmbedding": true
  },
  "relationships": [
    {
      "type": "IMPORTED_BY",
      "direction": "incoming",
      "target": {
        "id": "code:src/controllers/notification.controller.ts",
        "name": "NotificationController",
        "type": "code"
      }
    }
  ],
  "similar": [
    {
      "id": "code:src/services/sms.service.ts:SMSService",
      "name": "SMSService",
      "type": "code",
      "similarity": 0.82
    }
  ]
}

## Pro Tips
- URI comes from search results' id field
- includeContent=false for quick property inspection
- includeSimilar=true to find related implementations
- Check hasEmbedding to verify indexing status
- Relationships show quick connection overview
- Use relationship direction to understand flow
- Similar entities are sorted by similarity score
- Metadata varies by entity type`,
  },
};

/**
 * Get the capabilities description for the MCP handler
 */
export function getCapabilitiesDescription() {
  return {
    tools: {
      search: {
        description: "Search across all Supastate entities using semantic understanding"
      },
      searchCode: {
        description: "Search code with deep programming language understanding"
      },
      searchMemories: {
        description: "Search development conversations and team decisions"
      },
      exploreRelationships: {
        description: "Navigate the knowledge graph to trace connections"
      },
      getRelatedItems: {
        description: "Find all items related to an entity through relationships or similarity"
      },
      inspectEntity: {
        description: "Get comprehensive details about any entity"
      }
    }
  };
}