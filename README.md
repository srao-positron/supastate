# Supastate

Cloud-based team collaboration service for [Camille](https://github.com/srao-positron/camille) code intelligence. Supastate enables teams to share Claude Code memories, code graphs, and conduct multi-agent code reviews of PRs.

## Overview

Supastate extends Camille's local code intelligence capabilities to the cloud, providing:

- **Memory Sync**: Share Claude Code conversations and insights across your team
- **Code Graphs**: Store and query code structure graphs in the cloud
- **Multi-Agent PR Reviews**: Automated PR reviews with specialized AI agents
- **Team Collaboration**: Centralized knowledge base for your development team

## Architecture

Built on modern cloud infrastructure:
- **Frontend**: Next.js 14 with App Router
- **Backend**: Vercel Edge Functions
- **Database**: Supabase (PostgreSQL + pgvector for embeddings)
- **Real-time**: Supabase Realtime for live updates
- **AI**: OpenAI for embeddings, Anthropic Claude for agent orchestration

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- OpenAI API key
- Anthropic API key (for multi-agent reviews)
- GitHub App (for PR integration)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/supastate.git
cd supastate
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

4. Run database migrations:
```bash
npx supabase db push
```

5. Start the development server:
```bash
npm run dev
```

## Configuration

### Supabase Setup

1. Create a new Supabase project
2. Enable the `vector` extension for pgvector support
3. Run the migrations in `supabase/migrations/`
4. Configure Row Level Security policies as needed

### GitHub App Setup

For PR review functionality:

1. Create a GitHub App with these permissions:
   - Repository: Pull requests (read/write)
   - Repository: Contents (read)
   - Repository: Metadata (read)
2. Set webhook URL to `https://your-domain.vercel.app/api/webhooks/github`
3. Subscribe to Pull Request events

## API Documentation

### Memory Sync API

```typescript
POST /api/memories/sync
Authorization: x-api-key: YOUR_API_KEY

{
  "teamId": "uuid",
  "projectName": "string",
  "chunks": [{
    "chunkId": "string",
    "content": "string",
    "embedding": number[1536],
    "metadata": object
  }]
}
```

### Memory Search API

```typescript
POST /api/memories/search
Authorization: x-api-key: YOUR_API_KEY

{
  "teamId": "uuid",
  "query": "string",
  "embedding": number[1536],
  "projectFilter": ["project1", "project2"],
  "limit": 10
}
```

### Create Review API

```typescript
POST /api/reviews/create
Authorization: x-api-key: YOUR_API_KEY

{
  "teamId": "uuid",
  "prUrl": "https://github.com/owner/repo/pull/123",
  "reviewConfig": {
    "style": "thorough" | "quick" | "security-focused",
    "autoMergeOnApproval": boolean,
    "customAgents": [{
      "name": "string",
      "role": "string", 
      "prompt": "string"
    }]
  }
}
```

## Camille Integration

To connect your local Camille instance to Supastate:

1. Get your team API key from Supastate dashboard
2. Configure Camille:
```bash
camille config set-supastate-url https://your-supastate.vercel.app
camille config set-supastate-key YOUR_API_KEY
camille config set-team-id YOUR_TEAM_ID
```

3. Enable sync:
```bash
camille supastate enable-sync
```

## Multi-Agent Review System

Supastate's review system uses multiple specialized AI agents to review PRs:

- **Security Auditor**: Checks for vulnerabilities and security issues
- **Performance Analyst**: Reviews efficiency and optimization
- **Architecture Guardian**: Ensures architectural consistency
- **Test Coverage Expert**: Validates testing adequacy
- **Documentation Reviewer**: Checks comments and docs

Reviews can be triggered automatically via GitHub webhooks or manually through the API.

## Development

### Project Structure

```
supastate/
├── src/
│   ├── app/           # Next.js app router pages
│   ├── components/    # React components
│   ├── lib/          # Utility functions and clients
│   └── types/        # TypeScript types
├── supabase/
│   └── migrations/   # Database migrations
└── public/          # Static assets
```

### Testing

```bash
npm run test        # Run tests
npm run test:watch  # Run tests in watch mode
npm run type-check  # TypeScript type checking
npm run lint        # ESLint
```

## Deployment

### Vercel Deployment

1. Push to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy

### Environment Variables

Required for production:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_WEBHOOK_SECRET`

## Security

- All API endpoints require authentication
- Team-based data isolation with RLS
- API keys are hashed before storage
- Sensitive operations use service role keys
- PR reviews run in isolated environments

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

- Documentation: See `/docs` folder
- Issues: GitHub Issues
- Discussions: GitHub Discussions