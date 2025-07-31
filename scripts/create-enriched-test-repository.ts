#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface TestData {
  issues: Array<{
    title: string
    body: string
    labels?: string[]
    assignees?: string[]
  }>
  pullRequests: Array<{
    title: string
    body: string
    branch: string
    files: Array<{
      path: string
      content: string
    }>
  }>
  milestones: Array<{
    title: string
    description: string
    due_on?: string
  }>
  labels: Array<{
    name: string
    color: string
    description: string
  }>
}

async function createEnrichedTestRepository() {
  console.log('🚀 Creating Enriched Test Repository')
  console.log('===================================\n')

  try {
    // Step 1: Get user with GitHub token
    console.log('1️⃣ Finding user with GitHub access...')
    
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .limit(1)
    
    if (!users || users.length === 0) {
      throw new Error('No users found')
    }
    
    const userId = users[0].id
    console.log(`✅ Using user: ${users[0].email}`)

    // Get GitHub token
    const { data: tokenData } = await supabase.rpc('get_github_token', {
      user_id: userId
    })

    if (!tokenData) {
      throw new Error('No GitHub token found. Please connect your GitHub account first.')
    }

    // Get current user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    
    const githubUser = await userResponse.json()
    const username = githubUser.login

    // Step 2: Fork TypeScript starter repository
    console.log('\n2️⃣ Forking TypeScript repository...')
    
    const repoToFork = {
      owner: 'microsoft',
      repo: 'TypeScript-Node-Starter'
    }
    
    // Check if already forked
    const existingForkResponse = await fetch(`https://api.github.com/repos/${username}/${repoToFork.repo}`, {
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })

    let fork: any
    
    if (existingForkResponse.ok) {
      fork = await existingForkResponse.json()
      console.log(`✅ Using existing fork: ${fork.full_name}`)
    } else {
      // Create fork
      const forkResponse = await fetch(`https://api.github.com/repos/${repoToFork.owner}/${repoToFork.repo}/forks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!forkResponse.ok) {
        throw new Error(`Failed to fork repository: ${await forkResponse.text()}`)
      }

      fork = await forkResponse.json()
      console.log(`✅ Successfully forked to: ${fork.full_name}`)
      
      // Wait for fork to be ready
      console.log('   ⏳ Waiting for fork to be ready...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    // Step 3: Create labels
    console.log('\n3️⃣ Creating labels...')
    
    const testData: TestData = {
      labels: [
        { name: 'bug', color: 'd73a4a', description: 'Something isn\'t working' },
        { name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
        { name: 'documentation', color: '0075ca', description: 'Improvements or additions to documentation' },
        { name: 'performance', color: 'ffd700', description: 'Performance improvements' },
        { name: 'security', color: 'ee0000', description: 'Security issues' },
        { name: 'typescript', color: '3178c6', description: 'TypeScript specific issues' },
        { name: 'async', color: '5319e7', description: 'Async/await related' },
        { name: 'memory-leak', color: 'f9d0c4', description: 'Memory leak issues' }
      ],
      milestones: [
        {
          title: 'v1.0.0 - Initial Release',
          description: 'First stable release with core features',
          due_on: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          title: 'v1.1.0 - Performance Update',
          description: 'Major performance improvements and bug fixes',
          due_on: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
        }
      ],
      issues: [
        {
          title: 'Memory leak in async worker pool',
          body: `## Description
There appears to be a memory leak in the async worker pool implementation.

### Steps to Reproduce
1. Start the application with \`npm start\`
2. Run the stress test: \`npm run test:stress\`
3. Monitor memory usage with \`node --inspect\`

### Expected Behavior
Memory usage should remain stable

### Actual Behavior
Memory usage increases continuously

### Environment
- Node.js: v18.17.0
- TypeScript: 5.0.4
- OS: macOS 13.4

### Related Code
\`\`\`typescript
// src/async/worker-pool.ts
export class WorkerPool {
  private workers: Worker[] = []
  
  async process(task: Task) {
    // Potential memory leak here
    this.workers.push(new Worker(task))
  }
}
\`\`\`

@${username} Can you take a look at this?`,
          labels: ['bug', 'memory-leak', 'async'],
          assignees: [username]
        },
        {
          title: 'Add TypeScript 5.0 decorators support',
          body: `## Feature Request
Support for TypeScript 5.0 decorators in the codebase.

### Use Case
We need to use the new decorator syntax for:
- Dependency injection
- Method validation
- Performance monitoring

### Proposed Implementation
Update tsconfig.json and add decorator examples

### References
- [TypeScript 5.0 Release Notes](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/)
- [TC39 Decorators Proposal](https://github.com/tc39/proposal-decorators)`,
          labels: ['enhancement', 'typescript']
        },
        {
          title: 'Improve async error handling documentation',
          body: `The current documentation doesn't explain error handling in async contexts well enough.

### Areas to improve:
- [ ] Add examples of try-catch with async/await
- [ ] Document Promise rejection handling
- [ ] Add section on error boundaries
- [ ] Include testing strategies for async errors

See: https://github.com/${fork.full_name}/blob/main/docs/async-guide.md`,
          labels: ['documentation', 'async']
        },
        {
          title: 'Security: Update dependencies with known vulnerabilities',
          body: `## Security Alert
npm audit found 3 high severity vulnerabilities:

\`\`\`
│ High          │ Prototype Pollution in lodash                        │
├───────────────┼──────────────────────────────────────────────────────┤
│ Package       │ lodash                                               │
├───────────────┼──────────────────────────────────────────────────────┤
│ Dependency of │ lodash                                               │
├───────────────┼──────────────────────────────────────────────────────┤
│ Path          │ lodash                                               │
├───────────────┼──────────────────────────────────────────────────────┤
│ More info     │ https://npmjs.com/advisories/1523                    │
\`\`\`

### Action Required
- Update lodash to latest version
- Run security audit
- Update CI/CD to fail on security issues`,
          labels: ['security', 'bug']
        },
        {
          title: 'Performance: Optimize build times',
          body: `Current build times are too slow for development workflow.

### Current metrics:
- Cold build: 45s
- Hot rebuild: 12s
- Type checking: 30s

### Target metrics:
- Cold build: < 20s
- Hot rebuild: < 3s
- Type checking: < 15s

### Suggestions:
1. Enable incremental compilation
2. Use esbuild for development
3. Parallelize type checking
4. Implement build caching`,
          labels: ['performance', 'enhancement']
        }
      ],
      pullRequests: [
        {
          title: 'feat: Add async worker pool implementation',
          body: `## Description
This PR adds a new async worker pool for better concurrency handling.

### Changes
- Added WorkerPool class with configurable size
- Implemented task queuing and distribution
- Added comprehensive tests
- Updated documentation

### Performance Impact
- 3x improvement in concurrent task processing
- Reduced memory usage by 40%

### Testing
- [x] Unit tests pass
- [x] Integration tests pass
- [x] Performance benchmarks improved

Fixes #1 (Memory leak in async worker pool)

### Screenshots
![Performance Graph](https://via.placeholder.com/600x400)

### Checklist
- [x] Code follows style guidelines
- [x] Self-reviewed code
- [x] Added tests
- [x] Updated documentation
- [x] No breaking changes`,
          branch: 'feature/async-worker-pool',
          files: [
            {
              path: 'src/async/worker-pool.ts',
              content: `import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';

export interface Task {
  id: string;
  data: any;
  priority: number;
}

export class WorkerPool extends EventEmitter {
  private workers: Map<string, Worker> = new Map();
  private taskQueue: Task[] = [];
  private maxWorkers: number;
  
  constructor(maxWorkers: number = 4) {
    super();
    this.maxWorkers = maxWorkers;
    this.initialize();
  }
  
  private initialize(): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker(\`worker-\${i}\`);
    }
  }
  
  private createWorker(id: string): void {
    const worker = new Worker('./worker.js');
    worker.on('message', (result) => {
      this.emit('taskComplete', result);
      this.processNextTask(id);
    });
    worker.on('error', (error) => {
      this.emit('error', { workerId: id, error });
    });
    this.workers.set(id, worker);
  }
  
  async addTask(task: Task): Promise<void> {
    this.taskQueue.push(task);
    this.taskQueue.sort((a, b) => b.priority - a.priority);
    this.processQueue();
  }
  
  private processQueue(): void {
    // Implementation details...
  }
  
  private processNextTask(workerId: string): void {
    if (this.taskQueue.length === 0) return;
    
    const task = this.taskQueue.shift();
    const worker = this.workers.get(workerId);
    
    if (worker && task) {
      worker.postMessage(task);
    }
  }
  
  async shutdown(): Promise<void> {
    const promises = Array.from(this.workers.values()).map(
      worker => worker.terminate()
    );
    await Promise.all(promises);
    this.workers.clear();
  }
}
`
            },
            {
              path: 'tests/async/worker-pool.test.ts',
              content: `import { WorkerPool, Task } from '../../src/async/worker-pool';

describe('WorkerPool', () => {
  let pool: WorkerPool;
  
  beforeEach(() => {
    pool = new WorkerPool(2);
  });
  
  afterEach(async () => {
    await pool.shutdown();
  });
  
  it('should process tasks in priority order', async () => {
    const results: any[] = [];
    
    pool.on('taskComplete', (result) => {
      results.push(result);
    });
    
    await pool.addTask({ id: '1', data: 'low', priority: 1 });
    await pool.addTask({ id: '2', data: 'high', priority: 10 });
    await pool.addTask({ id: '3', data: 'medium', priority: 5 });
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    expect(results[0].data).toBe('high');
    expect(results[1].data).toBe('medium');
    expect(results[2].data).toBe('low');
  });
  
  it('should handle worker errors gracefully', async () => {
    const errors: any[] = [];
    
    pool.on('error', (error) => {
      errors.push(error);
    });
    
    await pool.addTask({ id: 'error', data: null, priority: 1 });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    expect(errors.length).toBe(1);
    expect(errors[0].workerId).toBeDefined();
  });
});
`
            }
          ]
        },
        {
          title: 'fix: Resolve TypeScript 5.0 compatibility issues',
          body: `## Description
Updates the codebase to be fully compatible with TypeScript 5.0.

### Changes
- Updated tsconfig.json with new compiler options
- Fixed decorator syntax
- Updated type definitions
- Resolved breaking changes

### Breaking Changes
None - all changes are backwards compatible

Related to #2`,
          branch: 'fix/typescript-5-compatibility',
          files: [
            {
              path: 'tsconfig.json',
              content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowJs": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
`
            }
          ]
        }
      ]
    }

    // Create labels
    for (const label of testData.labels) {
      try {
        await fetch(`https://api.github.com/repos/${fork.full_name}/labels`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(label)
        })
        console.log(`   ✅ Created label: ${label.name}`)
      } catch (error) {
        console.log(`   ℹ️  Label ${label.name} may already exist`)
      }
    }

    // Step 4: Create milestones
    console.log('\n4️⃣ Creating milestones...')
    
    for (const milestone of testData.milestones) {
      const response = await fetch(`https://api.github.com/repos/${fork.full_name}/milestones`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(milestone)
      })
      
      if (response.ok) {
        console.log(`   ✅ Created milestone: ${milestone.title}`)
      }
    }

    // Step 5: Create issues
    console.log('\n5️⃣ Creating issues...')
    
    const createdIssues = []
    for (const issue of testData.issues) {
      const response = await fetch(`https://api.github.com/repos/${fork.full_name}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(issue)
      })
      
      if (response.ok) {
        const createdIssue = await response.json()
        createdIssues.push(createdIssue)
        console.log(`   ✅ Created issue #${createdIssue.number}: ${issue.title}`)
      }
      
      // Rate limit pause
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Step 6: Create branches and pull requests
    console.log('\n6️⃣ Creating branches and pull requests...')
    
    // Get default branch SHA
    const defaultBranchResponse = await fetch(`https://api.github.com/repos/${fork.full_name}/git/refs/heads/${fork.default_branch}`, {
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    
    const defaultBranchRef = await defaultBranchResponse.json()
    const baseSha = defaultBranchRef.object.sha

    for (const pr of testData.pullRequests) {
      try {
        // Create branch
        await fetch(`https://api.github.com/repos/${fork.full_name}/git/refs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: `refs/heads/${pr.branch}`,
            sha: baseSha
          })
        })
        
        console.log(`   ✅ Created branch: ${pr.branch}`)
        
        // Add files to branch
        for (const file of pr.files) {
          // Create or update file
          const fileContent = Buffer.from(file.content).toString('base64')
          
          await fetch(`https://api.github.com/repos/${fork.full_name}/contents/${file.path}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${tokenData}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `Add ${file.path}`,
              content: fileContent,
              branch: pr.branch
            })
          })
          
          console.log(`      ✅ Added file: ${file.path}`)
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
        // Create pull request
        const prResponse = await fetch(`https://api.github.com/repos/${fork.full_name}/pulls`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: pr.title,
            body: pr.body,
            head: pr.branch,
            base: fork.default_branch
          })
        })
        
        if (prResponse.ok) {
          const createdPR = await prResponse.json()
          console.log(`   ✅ Created PR #${createdPR.number}: ${pr.title}`)
        }
        
      } catch (error) {
        console.error(`   ❌ Error creating PR: ${pr.title}`, error)
      }
      
      // Rate limit pause
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // Step 7: Import repository into Supastate
    console.log('\n7️⃣ Importing repository into Supastate...')
    
    const importResponse = await fetch(`http://localhost:3002/api/github/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'x-supabase-auth': JSON.stringify({ sub: userId })
      },
      body: JSON.stringify({
        owner: fork.owner.login,
        name: fork.name,
        crawl_scope: 'full'
      })
    })

    if (!importResponse.ok) {
      throw new Error(`Failed to import repository: ${await importResponse.text()}`)
    }

    const importResult = await importResponse.json()
    console.log('✅ Repository imported:', importResult)

    // Step 8: Create test code that references the fork
    console.log('\n8️⃣ Creating Camille code with GitHub references...')
    
    const testCode = `
// Testing GitHub integration with enriched repository
import { WorkerPool } from 'github:${fork.full_name}#feature/async-worker-pool/src/async/worker-pool.ts'
import { tsconfig } from 'github:${fork.full_name}#fix/typescript-5-compatibility/tsconfig.json'

// Reference to issues
// See memory leak issue: https://github.com/${fork.full_name}/issues/1
// TypeScript 5.0 feature request: https://github.com/${fork.full_name}/issues/2

// Clone specific branches
// git clone https://github.com/${fork.full_name}.git -b feature/async-worker-pool

export async function testEnrichedRepository() {
  // Initialize worker pool from the PR branch
  const pool = new WorkerPool(4);
  
  try {
    await pool.addTask({
      id: 'test-1',
      data: { enriched: true },
      priority: 10
    });
  } finally {
    await pool.shutdown();
  }
}
`

    const codeEntityId = crypto.randomUUID()
    
    await supabase
      .from('code_entities')
      .insert({
        id: codeEntityId,
        user_id: userId,
        team_id: null,
        project_name: 'github-enriched-test',
        file_path: 'test/enriched-integration.ts',
        name: 'enriched-integration.ts',
        entity_type: 'module',
        language: 'typescript',
        source_code: testCode
      })

    console.log('✅ Created test code entity with enriched references')

    console.log('\n🎉 Enriched test repository created successfully!')
    console.log('\n📊 Summary:')
    console.log(`   Repository: ${fork.full_name}`)
    console.log(`   Issues: ${testData.issues.length}`)
    console.log(`   Pull Requests: ${testData.pullRequests.length}`)
    console.log(`   Labels: ${testData.labels.length}`)
    console.log(`   Milestones: ${testData.milestones.length}`)
    console.log('\n🔍 Test Scenarios:')
    console.log('   1. Import and crawl the entire repository')
    console.log('   2. Process issues and pull requests')
    console.log('   3. Parse code from PR branches')
    console.log('   4. Detect GitHub references in Camille code')
    console.log('   5. Build relationships between entities')
    console.log('   6. Test semantic search across all entity types')
    console.log('\n📝 Next Steps:')
    console.log(`   - Visit: https://github.com/${fork.full_name}`)
    console.log('   - Monitor crawl queue progress')
    console.log('   - Check Neo4j for imported entities')
    console.log('   - Test webhook integration')

    return { fork, userId, importResult }

  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

// Run the enrichment
createEnrichedTestRepository()
  .then(result => {
    console.log('\n✨ Enriched test environment ready!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Setup failed:', error)
    process.exit(1)
  })