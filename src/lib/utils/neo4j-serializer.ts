import { DateTime } from 'neo4j-driver'

/**
 * Converts Neo4j temporal objects to ISO strings for JSON serialization
 */
export function serializeNeo4jData(data: any): any {
  if (!data) return data
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => serializeNeo4jData(item))
  }
  
  // Handle Neo4j DateTime objects
  if (data instanceof DateTime || (data && typeof data === 'object' && 'year' in data && 'month' in data && 'day' in data)) {
    return neo4jDateTimeToISO(data)
  }
  
  // Handle plain objects
  if (data && typeof data === 'object' && data.constructor === Object) {
    const serialized: any = {}
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeNeo4jData(value)
    }
    return serialized
  }
  
  // Return primitive values as-is
  return data
}

/**
 * Converts a Neo4j DateTime object to ISO string
 */
function neo4jDateTimeToISO(dateTime: any): string {
  try {
    const { year, month, day, hour = 0, minute = 0, second = 0, nanosecond = 0 } = dateTime
    
    // Create a Date object
    const date = new Date(
      year,
      month - 1, // JavaScript months are 0-indexed
      day,
      hour,
      minute,
      second,
      Math.floor(nanosecond / 1000000) // Convert nanoseconds to milliseconds
    )
    
    // Handle timezone offset if present
    if (dateTime.timeZoneOffsetSeconds !== undefined) {
      const offsetMinutes = dateTime.timeZoneOffsetSeconds / 60
      date.setMinutes(date.getMinutes() - offsetMinutes)
    }
    
    return date.toISOString()
  } catch (error) {
    console.error('Error converting Neo4j DateTime:', error, dateTime)
    // Fallback: return a string representation
    return `${dateTime.year}-${String(dateTime.month).padStart(2, '0')}-${String(dateTime.day).padStart(2, '0')}`
  }
}

/**
 * Recursively processes Neo4j query results to serialize temporal objects
 */
export function serializeNeo4jResults(results: { records: any[], summary: any }): { records: any[], summary: any } {
  return {
    records: results.records.map(record => serializeNeo4jData(record)),
    summary: results.summary
  }
}