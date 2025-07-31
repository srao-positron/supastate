/**
 * Utility functions for pattern discovery
 */

/**
 * Safely extract numeric value from Neo4j result
 * Handles both direct values and Neo4j Integer objects
 */
export function getNumericValue(value: any): number {
  if (value === null || value === undefined) return 0
  
  // Check if it's a Neo4j Integer with toNumber method
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber()
  }
  
  // Already a number
  if (typeof value === 'number') {
    return value
  }
  
  // Try to parse as number
  const parsed = parseFloat(value)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Safely get value from Neo4j record
 */
export function getRecordValue(record: any, field: string): any {
  // Try direct access first
  if (field in record) {
    return record[field]
  }
  
  // Try get method if available
  if (typeof record.get === 'function') {
    try {
      return record.get(field)
    } catch {
      return undefined
    }
  }
  
  return undefined
}