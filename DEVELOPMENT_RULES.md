# Supastate Development Rules
## Adapted from Camille's Development Standards

### 🔴 CRITICAL: These Rules Are Non-Negotiable

These rules ensure consistency with Camille's patterns and maintain code quality across the Supastate project.

---

## Rule 1: Type Safety (From Camille)

```typescript
// ✅ CORRECT - Explicit types
interface MemorySyncRequest {
  teamId: string;
  projectName: string;
  chunks: MemoryChunk[];
}

// ❌ WRONG - Using any
function processData(data: any) { }
```

**Requirements:**
- No `any` types except when interfacing with untyped libraries
- All function parameters and return types must be explicitly typed
- Use strict TypeScript configuration

---

## Rule 2: API Response Consistency

**All API routes must return consistent responses:**

```typescript
// Success response
return NextResponse.json({
  success: true,
  data: {
    // Structured data here
  },
  message: 'Human-readable success message'
});

// Error response
return NextResponse.json({
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Detailed error message',
    details: {} // Optional additional context
  }
}, { status: 400 });
```

---

## Rule 3: Secure API Key Handling

```typescript
// ✅ CORRECT - Hash and mask
import { createHash } from 'crypto';

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function maskApiKey(key: string): string {
  if (key.length < 8) return '***';
  return `***${key.slice(-4)}`;
}

// ❌ WRONG - Never store or log plain keys
console.log('API Key:', apiKey);
```

---

## Rule 4: Database Query Patterns

```typescript
// ✅ CORRECT - Team-scoped queries
const { data, error } = await supabase
  .from('memories')
  .select('*')
  .eq('team_id', teamId) // Always scope by team
  .order('created_at', { ascending: false });

// ❌ WRONG - Unscoped queries
const { data } = await supabase
  .from('memories')
  .select('*'); // Missing team scope!
```

---

## Rule 5: Error Handling

```typescript
// ✅ CORRECT - Descriptive errors with context
try {
  const result = await operation();
} catch (error) {
  console.error('Memory sync failed:', {
    teamId,
    projectName,
    error: error.message
  });
  
  return NextResponse.json({
    success: false,
    error: {
      code: 'SYNC_FAILED',
      message: 'Failed to sync memories',
      details: { teamId, projectName }
    }
  }, { status: 500 });
}

// ❌ WRONG - Silent failures
try {
  await operation();
} catch (error) {
  // Don't silently ignore!
}
```

---

## Rule 6: JSDoc Documentation

```typescript
/**
 * Syncs memory chunks from Camille to Supastate
 * @param request - Contains teamId, projectName, and memory chunks
 * @returns Success with sync stats or error with details
 * @throws Never - All errors are caught and returned as JSON
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Implementation
}
```

---

## Rule 7: Component Organization

```typescript
// ✅ CORRECT - Single responsibility
// components/memories/memory-card.tsx
export function MemoryCard({ memory }: { memory: Memory }) {
  // Only handles display of a single memory
}

// ❌ WRONG - Multiple responsibilities
export function MemoryComponent() {
  // Fetches data AND displays AND handles search
}
```

---

## Rule 8: Real-time Subscriptions

```typescript
// ✅ CORRECT - Cleanup subscriptions
useEffect(() => {
  const subscription = supabase
    .channel('reviews')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'review_events' 
    }, handleChange)
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, []);
```

---

## Rule 9: GitHub Integration

```typescript
// ✅ CORRECT - Verify webhook signatures
import { createHmac } from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;
  return signature === expectedSignature;
}
```

---

## Rule 10: Multi-Dimensional Search

```typescript
// ✅ CORRECT - Rich metadata for search
interface EnhancedMemory {
  // Dimensional data
  conversation_id: string;
  user_id: string;
  project_name: string;
  branch_name: string;
  
  // Temporal data
  created_at: Date;
  
  // Semantic data
  topics: string[];
  entities_mentioned: string[];
  
  // Search optimization
  search_text: string; // Generated column
}
```

---

## Testing Requirements

1. **Unit Tests**: All utility functions must have tests
2. **API Tests**: All routes must have success/error tests
3. **Component Tests**: All components must have render tests
4. **Integration Tests**: Critical flows must have e2e tests

---

## Performance Rules

1. **Pagination**: All list endpoints must support pagination
2. **Caching**: Use SWR for client-side data fetching
3. **Debouncing**: Search inputs must debounce (300ms)
4. **Lazy Loading**: Large components must lazy load

---

## Security Checklist

- [ ] All API routes check authentication
- [ ] All database queries are team-scoped
- [ ] No sensitive data in logs
- [ ] Input validation on all endpoints
- [ ] CORS properly configured
- [ ] Rate limiting implemented

---

## MCP Server Rules (When Implemented)

Following Camille's pattern:
1. Tools prefixed with `supastate_`
2. Consistent response format
3. Named pipes for communication
4. Never throw to MCP client