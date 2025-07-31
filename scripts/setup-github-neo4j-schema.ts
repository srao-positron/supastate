import { config } from 'dotenv'
import neo4j from 'neo4j-driver'

config({ path: '.env.local' })

const NEO4J_URI = process.env.NEO4J_URI!
const NEO4J_USER = process.env.NEO4J_USER!
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD!

async function setupGitHubSchema() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD))
  const session = driver.session()

  try {
    console.log('Setting up GitHub repository schema in Neo4j...\n')

    // Create constraints
    const constraints = [
      // Repository constraint
      `CREATE CONSTRAINT github_repo_unique IF NOT EXISTS
       FOR (r:Repository) REQUIRE r.github_id IS UNIQUE`,
      
      // Issue constraint
      `CREATE CONSTRAINT github_issue_unique IF NOT EXISTS
       FOR (i:RepoIssue) REQUIRE i.id IS UNIQUE`,
      
      // Pull Request constraint
      `CREATE CONSTRAINT github_pr_unique IF NOT EXISTS
       FOR (pr:RepoPullRequest) REQUIRE pr.id IS UNIQUE`,
      
      // Comment constraint
      `CREATE CONSTRAINT github_comment_unique IF NOT EXISTS
       FOR (c:RepoComment) REQUIRE c.id IS UNIQUE`,
      
      // Commit constraint
      `CREATE CONSTRAINT github_commit_unique IF NOT EXISTS
       FOR (c:RepoCommit) REQUIRE c.sha IS UNIQUE`,
      
      // File constraint
      `CREATE CONSTRAINT github_file_unique IF NOT EXISTS
       FOR (f:RepoFile) REQUIRE f.id IS UNIQUE`,
      
      // Function constraint
      `CREATE CONSTRAINT github_function_unique IF NOT EXISTS
       FOR (fn:RepoFunction) REQUIRE fn.id IS UNIQUE`,
      
      // Class constraint
      `CREATE CONSTRAINT github_class_unique IF NOT EXISTS
       FOR (c:RepoClass) REQUIRE c.id IS UNIQUE`,
      
      // Interface constraint
      `CREATE CONSTRAINT github_interface_unique IF NOT EXISTS
       FOR (i:RepoInterface) REQUIRE i.id IS UNIQUE`,
      
      // Wiki constraint
      `CREATE CONSTRAINT github_wiki_unique IF NOT EXISTS
       FOR (w:RepoWiki) REQUIRE w.id IS UNIQUE`
    ]

    console.log('Creating constraints...')
    for (const constraint of constraints) {
      try {
        await session.run(constraint)
        console.log('✓ Created constraint:', constraint.match(/FOR \(.*?\)/)?.[0])
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log('⚠ Constraint already exists:', constraint.match(/FOR \(.*?\)/)?.[0])
        } else {
          throw error
        }
      }
    }

    // Create vector indexes
    const vectorIndexes = [
      {
        name: 'github_repo_description_embedding',
        label: 'Repository',
        property: 'description_embedding',
        dimensions: 3072
      },
      {
        name: 'github_issue_title_embedding',
        label: 'RepoIssue',
        property: 'title_embedding',
        dimensions: 3072
      },
      {
        name: 'github_issue_body_embedding',
        label: 'RepoIssue',
        property: 'body_embedding',
        dimensions: 3072
      },
      {
        name: 'github_pr_title_embedding',
        label: 'RepoPullRequest',
        property: 'title_embedding',
        dimensions: 3072
      },
      {
        name: 'github_pr_body_embedding',
        label: 'RepoPullRequest',
        property: 'body_embedding',
        dimensions: 3072
      },
      {
        name: 'github_comment_body_embedding',
        label: 'RepoComment',
        property: 'body_embedding',
        dimensions: 3072
      },
      {
        name: 'github_commit_message_embedding',
        label: 'RepoCommit',
        property: 'message_embedding',
        dimensions: 3072
      },
      {
        name: 'github_function_signature_embedding',
        label: 'RepoFunction',
        property: 'signature_embedding',
        dimensions: 3072
      },
      {
        name: 'github_function_content_embedding',
        label: 'RepoFunction',
        property: 'content_embedding',
        dimensions: 3072
      },
      {
        name: 'github_function_docstring_embedding',
        label: 'RepoFunction',
        property: 'docstring_embedding',
        dimensions: 3072
      },
      {
        name: 'github_class_signature_embedding',
        label: 'RepoClass',
        property: 'signature_embedding',
        dimensions: 3072
      },
      {
        name: 'github_class_content_embedding',
        label: 'RepoClass',
        property: 'content_embedding',
        dimensions: 3072
      },
      {
        name: 'github_file_content_embedding',
        label: 'RepoFile',
        property: 'content_embedding',
        dimensions: 3072
      },
      {
        name: 'github_wiki_title_embedding',
        label: 'RepoWiki',
        property: 'title_embedding',
        dimensions: 3072
      },
      {
        name: 'github_wiki_content_embedding',
        label: 'RepoWiki',
        property: 'content_embedding',
        dimensions: 3072
      }
    ]

    console.log('\nCreating vector indexes...')
    for (const index of vectorIndexes) {
      const query = `
        CREATE VECTOR INDEX ${index.name} IF NOT EXISTS
        FOR (n:${index.label}) ON (n.${index.property})
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: ${index.dimensions},
          \`vector.similarity_function\`: 'cosine'
        }}
      `
      
      try {
        await session.run(query)
        console.log(`✓ Created vector index: ${index.name}`)
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`⚠ Vector index already exists: ${index.name}`)
        } else {
          console.error(`✗ Failed to create ${index.name}:`, error.message)
        }
      }
    }

    // Create regular indexes for performance
    const regularIndexes = [
      'CREATE INDEX github_repo_full_name IF NOT EXISTS FOR (r:Repository) ON (r.full_name)',
      'CREATE INDEX github_repo_owner IF NOT EXISTS FOR (r:Repository) ON (r.owner)',
      'CREATE INDEX github_repo_language IF NOT EXISTS FOR (r:Repository) ON (r.language)',
      'CREATE INDEX github_issue_number IF NOT EXISTS FOR (i:RepoIssue) ON (i.number)',
      'CREATE INDEX github_issue_state IF NOT EXISTS FOR (i:RepoIssue) ON (i.state)',
      'CREATE INDEX github_pr_number IF NOT EXISTS FOR (pr:RepoPullRequest) ON (pr.number)',
      'CREATE INDEX github_pr_state IF NOT EXISTS FOR (pr:RepoPullRequest) ON (pr.state)',
      'CREATE INDEX github_file_path IF NOT EXISTS FOR (f:RepoFile) ON (f.path)',
      'CREATE INDEX github_file_language IF NOT EXISTS FOR (f:RepoFile) ON (f.language)',
      'CREATE INDEX github_function_name IF NOT EXISTS FOR (fn:RepoFunction) ON (fn.name)',
      'CREATE INDEX github_class_name IF NOT EXISTS FOR (c:RepoClass) ON (c.name)'
    ]

    console.log('\nCreating regular indexes...')
    for (const index of regularIndexes) {
      try {
        await session.run(index)
        console.log('✓ Created index:', index.match(/FOR \(.*?\)/)?.[0])
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log('⚠ Index already exists:', index.match(/FOR \(.*?\)/)?.[0])
        } else {
          console.error('✗ Failed to create index:', error.message)
        }
      }
    }

    console.log('\n✅ GitHub Neo4j schema setup complete!')

  } catch (error) {
    console.error('Error setting up GitHub schema:', error)
    throw error
  } finally {
    await session.close()
    await driver.close()
  }
}

// Run the setup
setupGitHubSchema().catch(console.error)