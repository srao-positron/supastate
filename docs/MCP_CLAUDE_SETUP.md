# Setting Up Supastate MCP in Claude

## Overview

Supastate provides a Model Context Protocol (MCP) server that gives Claude direct access to your code knowledge graph. No installation required - just connect via OAuth!

## Quick Setup

### For Claude Desktop

1. **Open Claude Desktop Settings**
   - Go to Settings → Developer → MCP Servers

2. **Add Supastate Configuration**
   ```json
   {
     "supastate": {
       "type": "http",
       "url": "https://www.supastate.ai",
       "auth": {
         "type": "oauth",
         "client_id": "supastate-mcp",
         "auth_url": "https://zqlfxakbkwssxfynrmnk.supabase.co/auth/v1/authorize",
         "token_url": "https://zqlfxakbkwssxfynrmnk.supabase.co/auth/v1/token",
         "scopes": ["openid", "email", "profile"]
       }
     }
   }
   ```

3. **Save and Restart Claude Desktop**

4. **Connect to Supastate**
   - When you first use a Supastate tool, Claude will prompt for authentication
   - Log in with your Supastate account
   - Authorize Claude to access your data

### For Claude Web

Once registered with Anthropic, Supastate MCP will be available directly in Claude Web without any configuration needed.

## Available Tools

### 🔍 **search**
Search across all your data types with natural language.

Example: "Find all authentication implementations"

### 💻 **searchCode**
Language-aware code search with filters.

Example: "Find React hooks in the frontend folder"

### 💭 **searchMemories**
Search your development conversations by time and project.

Example: "What did we discuss about API design last week?"

### 🔗 **exploreRelationships**
Navigate connections in your knowledge graph.

Example: "Show what calls the login function"

### 🔎 **inspectEntity**
Get detailed information about any code, memory, or GitHub entity.

Example: "Tell me everything about the User model"

## Example Usage

### Finding and Understanding Code

```
You: Help me understand how authentication works in this project

Claude: I'll search for authentication-related code in your project.

[Uses search tool with query "authentication implementation"]

I found several authentication components:
- `auth/login.ts` - Main login function with JWT tokens
- `middleware/auth.ts` - Express middleware for route protection
- `components/LoginForm.tsx` - React login UI component

Let me inspect the main login function for more details...

[Uses inspectEntity tool on the login function]
```

### Exploring Code Relationships

```
You: What functions call the validateUser function?

Claude: I'll explore the relationships for the validateUser function.

[Uses exploreRelationships tool with the function URI]

The validateUser function is called by:
1. login() in auth/login.ts
2. register() in auth/register.ts  
3. resetPassword() in auth/password.ts

Each of these validates user credentials before proceeding.
```

### Finding Past Decisions

```
You: What did we decide about the database schema design?

Claude: I'll search your conversation history for database schema discussions.

[Uses searchMemories tool with query "database schema design decisions"]

I found several relevant conversations:
- 3 days ago: Discussion about normalizing user tables
- Last week: Decision to use PostgreSQL over MongoDB
- 2 weeks ago: Schema design for the permissions system

The key decision was to use a normalized relational schema...
```

## Tips for Best Results

1. **Be Specific**: More specific queries yield better results
   - ❌ "Find code"
   - ✅ "Find authentication middleware functions"

2. **Use Filters**: Take advantage of tool parameters
   - Filter by language: `searchCode` with `language: "typescript"`
   - Filter by date: `searchMemories` with date ranges
   - Filter by project: Both tools support project filtering

3. **Explore Relationships**: Use `exploreRelationships` to understand code structure
   - Find what calls a function
   - Find what a function calls
   - Discover class hierarchies

4. **Combine Tools**: Use multiple tools together for comprehensive understanding
   - Search for a concept
   - Inspect specific entities
   - Explore their relationships

## Security & Privacy

- **Workspace Isolation**: You only see data from your workspace
- **OAuth Security**: Standard OAuth 2.0 flow via Supabase
- **No Data Sharing**: Your code and memories stay private
- **Audit Trail**: All access is logged for security

## Troubleshooting

### "Authentication Required"
- Make sure you're logged in to Supastate
- Try disconnecting and reconnecting in Claude settings

### "No Results Found"
- Check if you have data in Supastate
- Try broader search terms
- Ensure Camille is indexing your projects

### Tools Not Appearing
- Restart Claude Desktop after adding configuration
- Verify the JSON configuration is valid
- Check Claude Desktop logs for errors

## Future Features

Coming soon:
- Real-time code updates as you work
- GitHub PR and issue integration  
- Team collaboration insights
- Custom query builders