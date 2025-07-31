#!/usr/bin/env npx tsx

import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const NEO4J_URI = process.env.NEO4J_URI!
const NEO4J_USER = process.env.NEO4J_USER!
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

async function checkGitHubData() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  )

  const session = driver.session()

  try {
    console.log('=== Checking GitHub Repository Nodes ===\n')
    
    // Check Repository nodes
    const repoResult = await session.run(`
      MATCH (r:Repository)
      RETURN r.full_name as full_name, 
             r.github_id as github_id,
             r.description as description,
             r.language as language,
             r.stars_count as stars_count,
             r.created_at as created_at,
             size(r.description_embedding) as embedding_size
      ORDER BY r.created_at DESC
      LIMIT 10
    `)
    
    console.log(`Found ${repoResult.records.length} Repository nodes:\n`)
    repoResult.records.forEach(record => {
      console.log(`Repository: ${record.get('full_name')}`)
      console.log(`  GitHub ID: ${record.get('github_id')}`)
      console.log(`  Language: ${record.get('language')}`)
      console.log(`  Stars: ${record.get('stars_count')}`)
      console.log(`  Description: ${record.get('description')?.substring(0, 100)}...`)
      console.log(`  Embedding size: ${record.get('embedding_size')}`)
      console.log(`  Created: ${record.get('created_at')}`)
      console.log()
    })

    // Check RepoIssue nodes
    console.log('\n=== Checking GitHub Issue Nodes ===\n')
    const issueResult = await session.run(`
      MATCH (i:RepoIssue)-[:HAS_ISSUE]-(r:Repository)
      RETURN i.id as id,
             i.number as number,
             i.title as title,
             i.state as state,
             i.author as author,
             size(i.title_embedding) as title_embedding_size,
             size(i.body_embedding) as body_embedding_size,
             r.full_name as repo_name
      ORDER BY i.created_at DESC
      LIMIT 10
    `)
    
    console.log(`Found ${issueResult.records.length} RepoIssue nodes:\n`)
    issueResult.records.forEach(record => {
      console.log(`Issue: ${record.get('repo_name')}#${record.get('number')}`)
      console.log(`  Title: ${record.get('title')}`)
      console.log(`  State: ${record.get('state')}`)
      console.log(`  Author: ${record.get('author')}`)
      console.log(`  Title embedding size: ${record.get('title_embedding_size')}`)
      console.log(`  Body embedding size: ${record.get('body_embedding_size')}`)
      console.log()
    })

    // Check RepoFile nodes
    console.log('\n=== Checking GitHub File Nodes ===\n')
    const fileResult = await session.run(`
      MATCH (f:RepoFile)
      RETURN f.id as id,
             f.path as path,
             f.language as language,
             f.size_bytes as size,
             size(f.content_embedding) as embedding_size
      LIMIT 10
    `)
    
    console.log(`Found ${fileResult.records.length} RepoFile nodes:\n`)
    fileResult.records.forEach(record => {
      console.log(`File: ${record.get('path')}`)
      console.log(`  Language: ${record.get('language')}`)
      console.log(`  Size: ${record.get('size')} bytes`)
      console.log(`  Embedding size: ${record.get('embedding_size')}`)
      console.log()
    })

    // Check RepoFunction nodes
    console.log('\n=== Checking GitHub Function Nodes ===\n')
    const functionResult = await session.run(`
      MATCH (fn:RepoFunction)-[:CONTAINS_FUNCTION]-(f:RepoFile)
      RETURN fn.name as name,
             fn.signature as signature,
             fn.start_line as start_line,
             fn.is_async as is_async,
             fn.is_exported as is_exported,
             size(fn.embedding) as embedding_size,
             f.path as file_path
      LIMIT 10
    `)
    
    console.log(`Found ${functionResult.records.length} RepoFunction nodes:\n`)
    functionResult.records.forEach(record => {
      console.log(`Function: ${record.get('name')}`)
      console.log(`  Signature: ${record.get('signature')}`)
      console.log(`  File: ${record.get('file_path')}`)
      console.log(`  Line: ${record.get('start_line')}`)
      console.log(`  Async: ${record.get('is_async')}`)
      console.log(`  Exported: ${record.get('is_exported')}`)
      console.log(`  Embedding size: ${record.get('embedding_size')}`)
      console.log()
    })

    // Check RepoClass nodes
    console.log('\n=== Checking GitHub Class Nodes ===\n')
    const classResult = await session.run(`
      MATCH (c:RepoClass)-[:CONTAINS_CLASS]-(f:RepoFile)
      RETURN c.name as name,
             c.extends as extends,
             c.method_count as method_count,
             c.property_count as property_count,
             size(c.embedding) as embedding_size,
             f.path as file_path
      LIMIT 10
    `)
    
    console.log(`Found ${classResult.records.length} RepoClass nodes:\n`)
    classResult.records.forEach(record => {
      console.log(`Class: ${record.get('name')}`)
      console.log(`  File: ${record.get('file_path')}`)
      console.log(`  Extends: ${record.get('extends')}`)
      console.log(`  Methods: ${record.get('method_count')}`)
      console.log(`  Properties: ${record.get('property_count')}`)
      console.log(`  Embedding size: ${record.get('embedding_size')}`)
      console.log()
    })

    // Check relationships
    console.log('\n=== Checking Relationships ===\n')
    const relResult = await session.run(`
      MATCH (r:Repository)-[rel]->()
      RETURN type(rel) as rel_type, count(*) as count
      ORDER BY count DESC
    `)
    
    console.log('Relationship counts:')
    relResult.records.forEach(record => {
      console.log(`  ${record.get('rel_type')}: ${record.get('count')}`)
    })

  } finally {
    await session.close()
    await driver.close()
  }
}

checkGitHubData().catch(console.error)