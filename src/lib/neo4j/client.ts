import neo4j, { Driver, Session, ManagedTransaction } from 'neo4j-driver'

// Create a singleton driver instance
let driver: Driver | null = null

export function getDriver(): Driver {
  if (!driver) {
    // Get configuration at runtime
    const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://eb61aceb.databases.neo4j.io'
    const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
    const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD

    if (!NEO4J_PASSWORD) {
      throw new Error('NEO4J_PASSWORD environment variable is required')
    }

    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 60000,
        maxTransactionRetryTime: 30000,
        logging: {
          level: 'info',
          logger: (level, message) => {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[Neo4j ${level}]`, message)
            }
          }
        }
      }
    )
  }
  return driver
}

// Helper to run a read transaction
export async function readTransaction<T>(
  work: (tx: ManagedTransaction) => Promise<T>,
  database?: string
): Promise<T> {
  const driver = getDriver()
  const session = driver.session({ database })
  
  try {
    return await session.executeRead(work)
  } finally {
    await session.close()
  }
}

// Helper to run a write transaction
export async function writeTransaction<T>(
  work: (tx: ManagedTransaction) => Promise<T>,
  database?: string
): Promise<T> {
  const driver = getDriver()
  const session = driver.session({ database })
  
  try {
    return await session.executeWrite(work)
  } finally {
    await session.close()
  }
}

// Helper for simple queries (auto-commit transactions)
export async function executeQuery<T = any>(
  query: string,
  parameters?: Record<string, any>,
  database?: string
): Promise<{
  records: any[]
  summary: any
}> {
  const driver = getDriver()
  
  try {
    console.log('[Neo4j Query]:', query.substring(0, 100) + '...')
    console.log('[Neo4j Params]:', parameters ? Object.keys(parameters) : 'none')
    const result = await driver.executeQuery(query, parameters || {}, { database })
    return {
      records: result.records.map(record => record.toObject()),
      summary: result.summary
    }
  } catch (error) {
    console.error('Neo4j query error:', error)
    console.error('Failed query:', query)
    console.error('Failed params:', parameters)
    throw error
  }
}

// Verify connectivity on startup
export async function verifyConnectivity(): Promise<void> {
  const driver = getDriver()
  
  try {
    await driver.verifyConnectivity()
    const serverInfo = await driver.getServerInfo()
    console.log('Connected to Neo4j:', {
      address: serverInfo.address,
      version: serverInfo.protocolVersion,
    })
  } catch (error) {
    console.error('Failed to connect to Neo4j:', error)
    throw error
  }
}

// Close the driver connection
export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close()
    driver = null
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing Neo4j connection...')
  await closeDriver()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Closing Neo4j connection...')
  await closeDriver()
  process.exit(0)
})