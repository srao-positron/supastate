# GitHub OAuth Token Management - Recommendations for Supastate

## Current Status

✅ **Your GitHub token is now valid and working**
- Token was refreshed when you logged in again at localhost:3000
- The domain mismatch (localhost:3000 vs localhost:3002) was causing the initial auth issues

## Key Findings

### 1. GitHub OAuth Apps Don't Use Refresh Tokens
- **Why**: GitHub OAuth App tokens don't expire naturally
- **Duration**: Tokens remain valid until:
  - User manually revokes access
  - User changes their GitHub password
  - GitHub invalidates for security reasons
  - OAuth App credentials change

### 2. This is Why Services Like Vercel Work Seamlessly
Services like Vercel use the same OAuth App model and handle token invalidation gracefully:
- They detect 401 errors and prompt users to reconnect
- They provide clear UI indicators of connection status
- They make reconnection a one-click process

## Recommended Implementation

### 1. Add Token Health Monitoring
```typescript
// components/github/GitHubConnectionStatus.tsx
export function GitHubConnectionStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  
  useEffect(() => {
    checkGitHubConnection().then(isConnected => {
      setStatus(isConnected ? 'connected' : 'disconnected')
    })
  }, [])
  
  if (status === 'disconnected') {
    return (
      <Alert variant="warning">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          GitHub connection expired. 
          <Button size="sm" onClick={() => router.push('/auth/github')}>
            Reconnect
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  
  return null
}
```

### 2. Implement Graceful Error Handling
```typescript
// lib/github/client.ts
export async function githubApiCall(endpoint: string) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  })
  
  if (response.status === 401) {
    // Mark token as invalid in database
    await supabase.rpc('mark_github_token_invalid', { user_id })
    
    // Return user-friendly error
    throw new GitHubAuthError('Please reconnect your GitHub account')
  }
  
  return response
}
```

### 3. Add Proactive Token Checking
```typescript
// app/dashboard/page.tsx
export default async function Dashboard() {
  const githubConnected = await checkGitHubConnection()
  
  return (
    <div>
      {!githubConnected && (
        <GitHubConnectionBanner />
      )}
      {/* Rest of dashboard */}
    </div>
  )
}
```

### 4. Create One-Click Reconnection Flow
```typescript
// components/github/ReconnectButton.tsx
export function GitHubReconnectButton() {
  return (
    <Link href="/auth/github">
      <Button variant="outline">
        <Github className="mr-2 h-4 w-4" />
        Reconnect GitHub
      </Button>
    </Link>
  )
}
```

## Migration to GitHub Apps (Future Enhancement)

If you need more advanced features in the future, consider migrating to GitHub Apps:

### Benefits:
- Installation tokens with automatic refresh
- Fine-grained permissions
- Higher rate limits (5,000 vs 1,000 requests/hour)
- Webhook events included
- Better for SaaS applications

### Trade-offs:
- More complex implementation
- Requires app installation by users
- Different authentication flow

## Immediate Action Items

1. **Add Connection Status UI**: Show users their GitHub connection status on the dashboard
2. **Implement Error Boundaries**: Catch 401 errors and show reconnection prompts
3. **Add Token Validation**: Check token validity when users visit key pages
4. **Create Reconnection Flow**: Make it one-click to reconnect GitHub

## Database Schema Addition

Consider adding a token status field:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_token_status VARCHAR(50) DEFAULT 'active';
-- Values: 'active', 'invalid', 'expired', 'revoked'

ALTER TABLE users ADD COLUMN IF NOT EXISTS github_token_last_validated_at TIMESTAMP WITH TIME ZONE;
```

## Summary

The current OAuth App approach is standard and works well. The key is handling token invalidation gracefully with clear user communication and easy reconnection. This is exactly how successful services like Vercel handle it - they don't prevent disconnections, they just make reconnection seamless.