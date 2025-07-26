/**
 * Extract a meaningful memory type from metadata
 */
export function getMemoryType(metadata: any): string {
  if (!metadata) return 'general'
  
  // Check for specific indicators in metadata
  const { hasCode, topics, tools, messageType } = metadata
  
  // If messageType is specified and meaningful, use it
  if (messageType && messageType !== 'general') {
    return messageType
  }
  
  // Determine type based on content indicators
  if (hasCode) {
    // Check for specific code-related topics
    if (topics?.includes('debugging') || topics?.includes('error') || topics?.includes('bug')) {
      return 'debugging'
    }
    if (topics?.includes('implementation') || topics?.includes('feature')) {
      return 'implementation'
    }
    if (topics?.includes('refactoring') || topics?.includes('optimization')) {
      return 'refactoring'
    }
    if (topics?.includes('architecture') || topics?.includes('design')) {
      return 'architecture'
    }
    return 'code_discussion'
  }
  
  // Check tools used
  if (tools?.includes('git') || tools?.includes('github')) {
    return 'version_control'
  }
  if (tools?.includes('test') || tools?.includes('jest') || tools?.includes('vitest')) {
    return 'testing'
  }
  if (tools?.includes('deploy') || tools?.includes('docker') || tools?.includes('kubernetes')) {
    return 'deployment'
  }
  
  // Check topics for non-code related types
  if (topics?.includes('planning') || topics?.includes('requirements')) {
    return 'planning'
  }
  if (topics?.includes('review') || topics?.includes('feedback')) {
    return 'code_review'
  }
  if (topics?.includes('documentation') || topics?.includes('readme')) {
    return 'documentation'
  }
  if (topics?.includes('question') || topics?.includes('help')) {
    return 'question'
  }
  
  return 'general'
}

/**
 * Format timestamp for consistent display
 */
export function formatMemoryTimestamp(timestamp: string | Date): Date {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  
  // Ensure valid date
  if (isNaN(date.getTime())) {
    return new Date()
  }
  
  return date
}