# CLAUDE.md - Development Rules and Guidelines

This document contains specific instructions for Claude when working on the Supastate codebase.

## 🔴 CRITICAL Pre-Deployment Rules

### Rule 1: ALWAYS Build Before Pushing
**MANDATORY**: Run `npm run build` before pushing any changes that will trigger deployments.

```bash
# Before pushing to GitHub (triggers Vercel deployment)
npm run build
npm run lint
npm run typecheck

# Before pushing database migrations to Supabase
npx supabase db diff  # Check what will change
```

**Why**: This prevents broken deployments and saves time by catching errors locally.

## Project-Specific Rules

### 2. Database Migrations
- Always test migrations locally first
- Use `npx supabase db diff` to preview changes
- Keep migration files idempotent (use IF EXISTS/IF NOT EXISTS)
- Record manual production changes in the migrations table

### 3. Component Dependencies
- Verify all UI components exist before importing
- Check that required packages are installed in package.json
- Common missing components: Switch, Checkbox, Sheet, etc.

### 4. Environment Variables
- Never commit .env.local or production secrets
- Use .env.example for documentation
- Verify all required env vars are set in Vercel/Supabase dashboards

### 5. Type Safety
- Run `npm run typecheck` before commits
- Fix all TypeScript errors before pushing
- Use proper typing for Supabase responses

### 6. Authentication & Security
- Always check team/user context in API routes
- Use Row Level Security (RLS) policies
- Never expose service role keys to client

### 7. Semantic Search
- OpenAI API key required for semantic search
- Embedding dimension: 3072 (text-embedding-3-large)
- Fall back to text search if semantic search fails

## Pre-Push Checklist

```bash
# Run this sequence before EVERY push:
npm run build      # Catch build errors
npm run lint       # Fix code style issues  
npm run typecheck  # Ensure type safety
npm test          # Run tests if available

# For database changes:
npx supabase db diff
```

## Common Issues & Solutions

1. **Missing UI Component Error**
   - Check src/components/ui/ directory
   - Install missing @radix-ui packages
   - Create component if needed

2. **Vercel Build Failures**
   - Always run `npm run build` locally first
   - Check for missing dependencies
   - Verify environment variables

3. **Migration Conflicts**
   - Keep migrations idempotent
   - Record manual changes in schema_migrations
   - Use placeholder migrations for already-applied changes

## Quick Commands

```bash
# Development
npm run dev

# Pre-deployment checks (MANDATORY before push)
npm run build && npm run lint && npm run type-check

# Database
npx supabase db diff
npx supabase db push
npx supabase db reset  # Local only!

# Generate types
npx supabase gen types typescript --local > src/types/supabase.ts
```

## Development Workflow Checklist

### When You Receive: "Build feature X"

- [ ] 1. **Read CLAUDE.md first** (this file)
- [ ] 2. **Search existing code** for similar patterns
- [ ] 3. **Run build locally** before any implementation
- [ ] 4. **Write or update tests** if applicable
- [ ] 5. **Implement feature** following existing patterns
- [ ] 6. **Run full pre-push checks**:
  ```bash
  npm run build && npm run lint && npm run type-check
  ```
- [ ] 7. **Test locally** with `npm run dev`
- [ ] 8. **Commit with proper message** (fix:, feat:, etc.)
- [ ] 9. **Push only after** all checks pass

### Red Flags That Require STOP

**STOP and fix if:**
- Build fails locally
- TypeScript errors exist
- Missing UI components referenced
- Environment variables not documented
- Database migration not tested
- Pushing without running build first

## Memory Integration (Future)

When Camille memory tools are available, follow these patterns:
- Search for related past work before implementing
- Check for previous bug fixes
- Look for architectural decisions
- Review past discussions on similar features