import neo4j, { Driver, Session, ManagedTransaction } from 'neo4j-driver'
import { log } from '@/lib/logger'
import { serializeNeo4jData } from '@/lib/utils/neo4j-serializer'

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
              log.info(`[Neo4j ${level}] ${message}`)
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
    // Ensure numeric parameters for LIMIT, SKIP, etc. are integers
    const processedParams = parameters ? Object.entries(parameters).reduce((acc, [key, value]) => {
      // Convert numeric parameters that Neo4j expects as integers
      if ((key.toLowerCase() === 'limit' || key.toLowerCase() === 'skip' || key.toLowerCase() === 'offset') && typeof value === 'number') {
        acc[key] = neo4j.int(Math.floor(value))
      } else {
        acc[key] = value
      }
      return acc
    }, {} as Record<string, any>) : {}
    
    log.debug('Executing Neo4j query', {
      query: query.substring(0, 100) + '...',
      params: processedParams ? Object.keys(processedParams) : 'none',
      paramValues: processedParams
    })
    const result = await driver.executeQuery(query, processedParams, { database })
    return {
      records: result.records.map(record => serializeNeo4jData(record.toObject())),
      summary: result.summary
    }
  } catch (error) {
    log.error('Neo4j query error', error, {
      query,
      parameters
    })
    throw error
  }
}

// Verify connectivity on startup
export async function verifyConnectivity(): Promise<void> {
  const driver = getDriver()
  
  try {
    await driver.verifyConnectivity()
    const serverInfo = await driver.getServerInfo()
    log.info('Connected to Neo4j', {
      address: serverInfo.address,
      version: serverInfo.protocolVersion,
    })
  } catch (error) {
    log.error('Failed to connect to Neo4j', error)
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
  log.info('Closing Neo4j connection...')
  await closeDriver()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  log.info('Closing Neo4j connection...')
  await closeDriver()
  process.exit(0)
})