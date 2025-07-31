# Code Search Migration Plan

## Current State Analysis

### Existing Code Search Features
Based on the codebase, we currently have:
- `/code-search` page for searching code entities
- Code entity details view
- Language filtering
- Project filtering
- Basic keyword search

### What We're Migrating To
A unified search system that:
- Combines code and memory search
- Shows relationships between code and memories
- Provides richer context
- Uses intelligent search strategies

## Migration Strategy

### Phase 1: Extend Current Code Search (Week 1)

#### 1.1 Add Relationship Data to Code Search Results
```typescript
// Enhance existing /api/code/search to include relationships
const enhancedCodeResult = {
  ...existingCodeResult,
  relationships: {
    memories: await getRelatedMemories(codeEntity.id),
    patterns: await getRelatedPatterns(codeEntity.id),
    similarCode: await getSimilarCode(codeEntity.embedding)
  }
}
```

#### 1.2 Add Semantic Search to Code
```typescript
// Add embedding-based search alongside keyword search
if (searchMode === 'semantic') {
  const embedding = await generateEmbedding(query)
  results = await searchCodeByEmbedding(embedding)
} else {
  results = await searchCodeByKeyword(query)
}
```

### Phase 2: Build Unified Search Backend (Week 2)

#### 2.1 Create Unified Search Service
```typescript
// src/lib/search/unified-search-service.ts
export class UnifiedSearchService {
  private codeSearcher: CodeSearcher
  private memorySearcher: MemorySearcher
  private relationshipSearcher: RelationshipSearcher
  
  async search(query: UnifiedSearchQuery): Promise<UnifiedResults> {
    // Parallel search execution
    const [codeResults, memoryResults, relationships] = await Promise.all([
      this.codeSearcher.search(query),
      this.memorySearcher.search(query),
      this.relationshipSearcher.findConnections(query)
    ])
    
    return this.mergeResults(codeResults, memoryResults, relationships)
  }
}
```

#### 2.2 Migrate Code Search Logic
```typescript
// Move existing code search logic to new structure
class CodeSearcher implements SearchStrategy {
  async search(query: SearchQuery): Promise<CodeSearchResult[]> {
    // Reuse existing code search logic
    const results = await this.existingCodeSearch(query)
    
    // Enhance with new capabilities
    return this.enhanceResults(results)
  }
}
```

### Phase 3: Create Transition UI (Week 3)

#### 3.1 Add "Try New Search" Banner
```tsx
// Add to existing code-search page
function CodeSearchPage() {
  return (
    <>
      <Banner>
        <p>🎉 Try our new unified search that finds both code and related conversations!</p>
        <Link href="/search">Try Unified Search</Link>
      </Banner>
      
      {/* Existing code search UI */}
    </>
  )
}
```

#### 3.2 Progressive Enhancement
```tsx
// Add relationship preview to existing code results
function CodeResultCard({ result }) {
  const { memories } = useRelatedMemories(result.id)
  
  return (
    <Card>
      {/* Existing code display */}
      
      {memories.length > 0 && (
        <div className="mt-4 p-3 bg-muted rounded">
          <p className="text-sm text-muted-foreground">
            Found {memories.length} related conversations
          </p>
          <Link href={`/search?code=${result.id}`}>
            View in unified search →
          </Link>
        </div>
      )}
    </Card>
  )
}
```

### Phase 4: Unified Search UI (Week 4)

#### 4.1 Create New Search Page
```tsx
// src/app/search/page.tsx
export default function UnifiedSearchPage() {
  // New unified search implementation
  // Can filter to show only code if needed
}
```

#### 4.2 Add Code-Specific Views
```tsx
function CodeSearchView({ results }: { results: UnifiedSearchResult[] }) {
  // Filter to show only code results
  const codeResults = results.filter(r => r.type === 'code')
  
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Code className="h-5 w-5" />
        <h2 className="text-xl font-semibold">
          Code Results ({codeResults.length})
        </h2>
      </div>
      
      {codeResults.map(result => (
        <UnifiedResultCard key={result.id} result={result} />
      ))}
    </div>
  )
}
```

### Phase 5: Feature Parity & Migration (Week 5)

#### 5.1 Ensure Feature Parity
- [x] Keyword search
- [x] Language filtering  
- [x] Project filtering
- [ ] Add: Semantic search
- [ ] Add: Related memories
- [ ] Add: Pattern detection
- [ ] Add: Time-based filtering

#### 5.2 Update Navigation
```tsx
// Update navigation to point to unified search
const navItems = [
  {
    href: "/search",
    label: "Search",
    icon: Search,
  },
  // Remove separate code-search and memory-search items
]
```

#### 5.3 Add Redirects
```typescript
// middleware.ts
if (request.nextUrl.pathname === '/code-search') {
  return NextResponse.redirect(new URL('/search?view=code', request.url))
}
```

### Phase 6: Deprecation (Week 6)

#### 6.1 Monitor Usage
```typescript
// Track usage of old vs new endpoints
analytics.track('search_usage', {
  endpoint: 'legacy_code_search',
  user_id: userId,
  migrated_to_unified: false
})
```

#### 6.2 Sunset Timeline
1. Week 1-4: Build and test
2. Week 5: Soft launch with banner
3. Week 6-8: Monitor adoption
4. Week 9: Make unified search default
5. Week 12: Remove old code search

## Technical Migration Details

### API Endpoint Migration
```typescript
// Old endpoint
GET /api/code/search?q=auth&language=ts

// New unified endpoint (with code filter)
POST /api/search/unified
{
  "query": "auth",
  "filters": {
    "includeMemories": false,
    "includeCode": true,
    "languages": ["ts"]
  }
}
```

### Database Query Migration
```cypher
// Old: Simple code search
MATCH (c:CodeEntity)
WHERE c.content CONTAINS $query
RETURN c

// New: Rich code search with relationships
MATCH (c:CodeEntity)
WHERE c.content CONTAINS $query
OPTIONAL MATCH (c)<-[:REFERENCES_CODE]-(m:Memory)
OPTIONAL MATCH (c)<-[:FOUND_IN]-(p:Pattern)
RETURN c, collect(DISTINCT m) as memories, collect(DISTINCT p) as patterns
```

### State Management Migration
```typescript
// Old: Separate code search state
const useCodeSearch = () => {
  const [codeResults, setCodeResults] = useState([])
  // ...
}

// New: Unified search state with filters
const useUnifiedSearch = () => {
  const [results, setResults] = useState<UnifiedSearchResult[]>([])
  const [filters, setFilters] = useState({ includeCode: true, includeMemories: true })
  
  const codeResults = useMemo(
    () => results.filter(r => r.type === 'code'),
    [results]
  )
  // ...
}
```

## Benefits for Users

1. **Find Related Context**: See conversations about the code they're looking at
2. **Better Understanding**: Understand why code was written by seeing the discussions
3. **Faster Debugging**: Find both the problem discussion and the solution code
4. **Single Search**: No need to search in multiple places

## Rollback Plan

If issues arise:
1. Keep old endpoints active (don't delete immediately)
2. Feature flag for unified search
3. Quick toggle to revert navigation
4. Database queries remain compatible

## Success Criteria

1. **Adoption**: 80% of code searches use unified search within 4 weeks
2. **Performance**: Unified search no slower than current code search
3. **User Satisfaction**: Positive feedback on related memories feature
4. **Zero Downtime**: Migration causes no service interruption

## Communication Plan

1. **Announcement**: Blog post about unified search benefits
2. **In-App**: Progressive disclosure with banners and tooltips
3. **Documentation**: Update all references to code search
4. **Support**: FAQ for common questions

This migration plan ensures a smooth transition from separate code search to unified search while maintaining all existing functionality and adding powerful new features.