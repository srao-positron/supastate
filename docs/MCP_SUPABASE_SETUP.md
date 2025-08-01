# MCP OAuth Setup for Supabase

## Required Redirect URLs

Add these URLs to your Supabase project's allowed redirect URLs:

### Production (supastate.ai)
```
https://www.supastate.ai/api/mcp/auth/callback
https://claude.ai/api/mcp/auth_callback
```

### Local Development (if needed)
```
http://localhost:3000/api/mcp/auth/callback
```

## How to Add Redirect URLs in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. Under **Redirect URLs**, add the URLs above
4. Click **Save**

## Important Notes

- The `https://www.supastate.ai/api/mcp/auth/callback` URL is our internal callback that processes the authentication
- The `https://claude.ai/api/mcp/auth_callback` URL is where Claude expects to receive the authorization code
- Both URLs are required for the OAuth flow to work properly

## Testing the MCP Server

Once you've added the redirect URLs:

1. **In Claude Desktop**:
   - Go to Settings → Developer → Edit Config
   - Add:
   ```json
   {
     "http": {
       "https://www.supastate.ai/sse": {
         "transport": "http+sse"
       }
     }
   }
   ```
   - Restart Claude Desktop
   - Try using the search tools

2. **In Claude Code**:
   - Run: `claude code --mcp-server https://www.supastate.ai/sse`
   - You should be prompted to authenticate
   - After auth, try: `search memories about supastate`

## Debug Logs

To see the OAuth flow debug logs in Vercel:
1. Go to your Vercel project dashboard
2. Navigate to the Functions tab
3. Look for logs with `[MCP Debug]` prefix

These will show:
- OAuth requests from Claude
- Token exchanges
- The final redirect URL with all parameters