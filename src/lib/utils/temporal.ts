/**
 * Utility functions for handling Neo4j temporal objects
 */

/**
 * Convert a Neo4j temporal object to ISO string format
 * Handles both direct Date objects and Neo4j temporal objects
 */
export function temporalToISOString(temporal: any): string | undefined {
  if (!temporal) return undefined
  
  // If it's already a string, return it
  if (typeof temporal === 'string') {
    return temporal
  }
  
  // If it's a Date object, convert to ISO string
  if (temporal instanceof Date) {
    return temporal.toISOString()
  }
  
  // Handle Neo4j temporal objects
  if (temporal && typeof temporal === 'object') {
    // Neo4j DateTime object has year, month, day, hour, minute, second properties
    if ('year' in temporal && 'month' in temporal && 'day' in temporal) {
      try {
        const { year, month, day, hour = 0, minute = 0, second = 0, nanosecond = 0 } = temporal
        // Create a Date object from the components
        const date = new Date(
          year.toNumber ? year.toNumber() : year,
          (month.toNumber ? month.toNumber() : month) - 1, // JavaScript months are 0-indexed
          day.toNumber ? day.toNumber() : day,
          hour.toNumber ? hour.toNumber() : hour,
          minute.toNumber ? minute.toNumber() : minute,
          second.toNumber ? second.toNumber() : second,
          nanosecond ? Math.floor((nanosecond.toNumber ? nanosecond.toNumber() : Number(nanosecond)) / 1000000) : 0
        )
        return date.toISOString()
      } catch (error) {
        console.error('Error converting temporal object:', error, temporal)
        return undefined
      }
    }
    
    // Neo4j Date object (just year, month, day)
    if ('year' in temporal && 'month' in temporal && 'day' in temporal && !('hour' in temporal)) {
      try {
        const { year, month, day } = temporal
        const date = new Date(
          year.toNumber ? year.toNumber() : year,
          (month.toNumber ? month.toNumber() : month) - 1,
          day.toNumber ? day.toNumber() : day
        )
        return date.toISOString()
      } catch (error) {
        console.error('Error converting date object:', error, temporal)
        return undefined
      }
    }
  }
  
  // If we can't convert it, log it and return undefined
  console.warn('Unable to convert temporal object:', temporal)
  return undefined
}

/**
 * Recursively process an object to convert all temporal fields to ISO strings
 */
export function serializeTemporalFields(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => serializeTemporalFields(item))
  }
  
  // Handle objects
  const result: any = {}
  
  for (const [key, value] of Object.entries(obj)) {
    // Check if this is a date field
    if (key.endsWith('_at') || key === 'occurred_at' || key === 'created_at' || key === 'updated_at' || key === 'timestamp') {
      result[key] = temporalToISOString(value) || value
    } else if (value && typeof value === 'object') {
      // Recursively process nested objects
      result[key] = serializeTemporalFields(value)
    } else {
      result[key] = value
    }
  }
  
  return result
}