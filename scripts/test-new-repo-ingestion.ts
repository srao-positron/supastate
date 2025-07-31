#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { getDriver } from '../src/lib/neo4j/client'
import { execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Configuration
const TEST_REPO_NAME = 'supastate-test-repo'
const TEST_BRANCH_NAME = 'feature/async-parsing-test'
const CAMILLE_WATCHED_DIR = join(process.env.HOME!, '.camille', 'watched') // Camille's watched directory

async function deleteTestRepoData(repoFullName: string) {
  console.log(`🗑️  Deleting any existing data for ${repoFullName}...\n`)
  
  const driver = getDriver()
  const session = driver.session()
  
  try {
    // Delete code entities
    await session.run(`
      MATCH (ce:CodeEntity)
      WHERE ce.repository = $repo OR ce.file_path CONTAINS $repo
      DETACH DELETE ce
    `, { repo: repoFullName })
    
    // Delete repository nodes
    await session.run(`
      MATCH (r:Repository {full_name: $repo})
      DETACH DELETE r
    `, { repo: repoFullName })
    
    console.log('✓ Deleted existing Neo4j data')
    
    // Clean up Supabase records
    await supabase
      .from('github_repositories')
      .delete()
      .eq('full_name', repoFullName)
    
    await supabase
      .from('code_ingestion_queue')
      .delete()
      .eq('repository', repoFullName)
    
    console.log('✓ Deleted existing Supabase data\n')
    
  } finally {
    await session.close()
    await driver.close()
  }
}

async function createTestRepository() {
  console.log('🚀 Creating and setting up test repository...\n')
  
  try {
    // 1. Get user info
    console.log('1. Getting user with GitHub token...')
    const { data: users } = await supabase
      .from('users')
      .select('id, email, github_username')
      .not('github_access_token_encrypted', 'is', null)
      .limit(1)
    
    if (!users || users.length === 0) {
      console.error('No users with GitHub tokens found')
      return
    }
    
    const user = users[0]
    console.log(`User: ${user.email} (${user.github_username || 'unknown'})`)
    console.log(`User ID: ${user.id}\n`)
    
    // 2. Set up local test repository
    console.log('2. Creating local test repository...')
    const testRepoPath = join(CAMILLE_WATCHED_DIR, TEST_REPO_NAME)
    
    // Ensure Camille watched directory exists
    if (!existsSync(CAMILLE_WATCHED_DIR)) {
      mkdirSync(CAMILLE_WATCHED_DIR, { recursive: true })
      console.log(`✓ Created Camille watched directory: ${CAMILLE_WATCHED_DIR}`)
    }
    
    // Clean up if test repo already exists
    if (existsSync(testRepoPath)) {
      console.log('  Cleaning up existing test repository...')
      rmSync(testRepoPath, { recursive: true, force: true })
    }
    
    // Create new directory
    mkdirSync(testRepoPath, { recursive: true })
    console.log(`✓ Created test repository at: ${testRepoPath}`)
    
    // Initialize git repo
    console.log('\n3. Initializing git repository...')
    execSync('git init', { cwd: testRepoPath })
    execSync('git config user.name "Test User"', { cwd: testRepoPath })
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath })
    console.log('✓ Git repository initialized')
    
    // 4. Create test files with various code patterns
    console.log('\n4. Creating test files...')
    
    // TypeScript file with classes and functions
    const tsContent = `// Test TypeScript file for async parsing
export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  private users: Map<string, User> = new Map();
  
  async createUser(data: Omit<User, 'id'>): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      ...data
    };
    this.users.set(user.id, user);
    return user;
  }
  
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }
  
  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    
    const updated = { ...user, ...data };
    this.users.set(id, updated);
    return updated;
  }
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}

// Test async function
export async function processUsers(userIds: string[]): Promise<User[]> {
  const service = new UserService();
  const results = await Promise.all(
    userIds.map(id => service.getUser(id))
  );
  return results.filter((user): user is User => user !== undefined);
}
`;
    writeFileSync(join(testRepoPath, 'user-service.ts'), tsContent)
    console.log('  ✓ Created user-service.ts')
    
    // Python file
    const pyContent = `"""Test Python file for async parsing"""
import asyncio
from typing import List, Optional, Dict

class DataProcessor:
    """Process data asynchronously"""
    
    def __init__(self, name: str):
        self.name = name
        self.data: List[Dict] = []
    
    async def process_item(self, item: Dict) -> Dict:
        """Process a single item"""
        await asyncio.sleep(0.1)  # Simulate async work
        return {**item, 'processed': True}
    
    async def process_batch(self, items: List[Dict]) -> List[Dict]:
        """Process multiple items concurrently"""
        tasks = [self.process_item(item) for item in items]
        return await asyncio.gather(*tasks)

def calculate_average(numbers: List[float]) -> float:
    """Calculate the average of a list of numbers"""
    if not numbers:
        return 0.0
    return sum(numbers) / len(numbers)

async def main():
    """Main entry point"""
    processor = DataProcessor("test")
    items = [{'id': i, 'value': i * 10} for i in range(5)]
    results = await processor.process_batch(items)
    print(f"Processed {len(results)} items")

if __name__ == "__main__":
    asyncio.run(main())
`;
    writeFileSync(join(testRepoPath, 'data_processor.py'), pyContent)
    console.log('  ✓ Created data_processor.py')
    
    // JavaScript/React component
    const jsxContent = `import React, { useState, useEffect } from 'react';

interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
}

export const TodoList: React.FC = () => {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodo, setNewTodo] = useState('');
  
  useEffect(() => {
    // Load todos from localStorage
    const saved = localStorage.getItem('todos');
    if (saved) {
      setTodos(JSON.parse(saved));
    }
  }, []);
  
  const addTodo = () => {
    if (!newTodo.trim()) return;
    
    const todo: TodoItem = {
      id: Date.now(),
      text: newTodo,
      completed: false
    };
    
    setTodos([...todos, todo]);
    setNewTodo('');
  };
  
  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };
  
  return (
    <div className="todo-list">
      <h2>Todo List</h2>
      <input
        value={newTodo}
        onChange={(e) => setNewTodo(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && addTodo()}
        placeholder="Add a new todo..."
      />
      <button onClick={addTodo}>Add</button>
      <ul>
        {todos.map(todo => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
            />
            <span className={todo.completed ? 'completed' : ''}>
              {todo.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TodoList;
`;
    writeFileSync(join(testRepoPath, 'TodoList.tsx'), jsxContent)
    console.log('  ✓ Created TodoList.tsx')
    
    // README file
    const readmeContent = `# ${TEST_REPO_NAME}

This is a test repository for validating async code parsing functionality.

## Files

- \`user-service.ts\` - TypeScript service with classes and interfaces
- \`data_processor.py\` - Python async data processor
- \`TodoList.tsx\` - React component with hooks

## Purpose

This repository is used to test:
1. Async code parsing via Camille
2. Code entity extraction
3. Multi-language support
4. Branch handling

Created on: ${new Date().toISOString()}
`;
    writeFileSync(join(testRepoPath, 'README.md'), readmeContent)
    console.log('  ✓ Created README.md')
    
    // 5. Commit files to main branch
    console.log('\n5. Committing files to main branch...')
    execSync('git add .', { cwd: testRepoPath })
    execSync('git commit -m "Initial commit with test files"', { cwd: testRepoPath })
    console.log('✓ Committed to main branch')
    
    // 6. Create and switch to feature branch
    console.log('\n6. Creating feature branch...')
    execSync(`git checkout -b ${TEST_BRANCH_NAME}`, { cwd: testRepoPath })
    console.log(`✓ Created and switched to branch: ${TEST_BRANCH_NAME}`)
    
    // Add a file on the feature branch
    const featureContent = `// Feature branch specific code
export function featureBranchFunction() {
  return "This function only exists on the feature branch";
}

export class FeatureService {
  private enabled = true;
  
  toggle() {
    this.enabled = !this.enabled;
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
}
`;
    writeFileSync(join(testRepoPath, 'feature-code.ts'), featureContent)
    execSync('git add feature-code.ts', { cwd: testRepoPath })
    execSync('git commit -m "Add feature branch specific code"', { cwd: testRepoPath })
    console.log('✓ Added feature branch specific file')
    
    // 7. Clean up any existing data for this test repo
    const repoFullName = `local/${TEST_REPO_NAME}`
    await deleteTestRepoData(repoFullName)
    
    // 8. Trigger Camille to ingest this repository
    console.log('\n7. Repository setup complete!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📁 Repository location: ${testRepoPath}`)
    console.log(`🌿 Current branch: ${TEST_BRANCH_NAME}`)
    console.log(`👤 User ID: ${user.id}`)
    // console.log(`🏢 Workspace ID: ${user.workspace_id || 'None'}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    console.log('\n🔄 Next steps:')
    console.log('1. Camille should automatically detect and ingest this repository')
    console.log('2. Check the code_ingestion_queue for processing status')
    console.log('3. Verify CodeEntity nodes are created in Neo4j')
    console.log('\nTo manually trigger ingestion, you can:')
    console.log('- Restart Camille if it\'s running')
    console.log('- Or use Camille\'s file watcher to detect the new repository')
    
    // Wait a moment for file system events to propagate
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Check if files are queued
    console.log('\n8. Checking for queued files...')
    const { data: queuedFiles } = await supabase
      .from('code_ingestion_queue')
      .select('*')
      .eq('repository', repoFullName)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (queuedFiles && queuedFiles.length > 0) {
      console.log(`✓ Found ${queuedFiles.length} files queued for processing:`)
      queuedFiles.forEach(file => {
        console.log(`  - ${file.file_path} (${file.status})`)
      })
    } else {
      console.log('⚠️  No files queued yet. Camille may need to be triggered manually.')
    }
    
    return { testRepoPath, repoFullName, userId: user.id }
    
  } catch (error) {
    console.error('❌ Test setup failed:', error)
    throw error
  }
}

// Function to monitor ingestion progress
async function monitorIngestion(repoFullName: string, maxWaitSeconds: number = 30) {
  console.log(`\n⏳ Monitoring ingestion progress for ${repoFullName}...`)
  
  const startTime = Date.now()
  let lastStatus = { pending: 0, processing: 0, completed: 0, failed: 0 }
  
  while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
    const { data: queue } = await supabase
      .from('code_ingestion_queue')
      .select('status')
      .eq('repository', repoFullName)
    
    if (!queue || queue.length === 0) {
      console.log('No files in queue')
      break
    }
    
    const status = {
      pending: queue.filter(q => q.status === 'pending').length,
      processing: queue.filter(q => q.status === 'processing').length,
      completed: queue.filter(q => q.status === 'completed').length,
      failed: queue.filter(q => q.status === 'failed').length
    }
    
    // Only log if status changed
    if (JSON.stringify(status) !== JSON.stringify(lastStatus)) {
      console.log(`Status: ${status.completed} completed, ${status.processing} processing, ${status.pending} pending, ${status.failed} failed`)
      lastStatus = status
    }
    
    if (status.pending === 0 && status.processing === 0) {
      console.log('✅ All files processed!')
      break
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  // Check final results in Neo4j
  const driver = getDriver()
  const session = driver.session()
  
  try {
    const result = await session.run(`
      MATCH (ce:CodeEntity)
      WHERE ce.repository = $repo OR ce.file_path CONTAINS $repo
      RETURN ce.type as type, count(ce) as count
      ORDER BY count DESC
    `, { repo: repoFullName })
    
    if (result.records.length > 0) {
      console.log('\n📊 Code entities created:')
      result.records.forEach(record => {
        console.log(`  - ${record.get('type')}: ${record.get('count')}`)
      })
    } else {
      console.log('\n⚠️  No code entities found in Neo4j')
    }
    
  } finally {
    await session.close()
    await driver.close()
  }
}

// Main execution
async function main() {
  try {
    const { repoFullName } = await createTestRepository()
    
    // Give Camille a moment to detect the new repository
    console.log('\n⏰ Waiting 5 seconds for Camille to detect the repository...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Monitor the ingestion
    await monitorIngestion(repoFullName, 60) // Wait up to 60 seconds
    
    console.log('\n✅ Test completed! Check Camille logs for detailed ingestion info.')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Run the test
main()