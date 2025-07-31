import { SearchQuery, SearchResult, ISearchStrategy } from '../types'

export abstract class BaseSearchStrategy implements ISearchStrategy {
  abstract name: string
  
  abstract execute(query: SearchQuery): Promise<SearchResult[]>
  
  score(result: SearchResult, query: SearchQuery): number {
    // Default scoring logic
    let score = result.score || 0
    
    // Boost for exact matches
    if (result.entity?.content?.toLowerCase().includes(query.text.toLowerCase())) {
      score += 0.1
    }
    
    // Boost for recent items
    if (result.entity?.occurred_at || result.entity?.created_at) {
      const date = new Date(result.entity.occurred_at || result.entity.created_at)
      const now = new Date()
      const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
      
      if (hoursDiff < 24) score += 0.2
      else if (hoursDiff < 168) score += 0.1 // Last week
    }
    
    return Math.min(score, 1.0) // Cap at 1.0
  }
  
  // Helper to highlight search terms in text
  protected highlightTerms(text: string, searchTerms: string[]): string {
    let highlighted = text
    
    searchTerms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi')
      highlighted = highlighted.replace(regex, '<mark>$1</mark>')
    })
    
    return highlighted
  }
  
  // Extract search terms from query
  protected getSearchTerms(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2) // Skip short words
  }
  
  // Generate snippets around matches
  protected generateSnippet(content: string, searchTerms: string[], maxLength: number = 200): string {
    const lowerContent = content.toLowerCase()
    let bestStart = 0
    let bestScore = 0
    
    // Find the best window that contains the most search terms
    for (let i = 0; i < content.length - maxLength; i += 50) {
      const window = lowerContent.substring(i, i + maxLength)
      let score = 0
      
      searchTerms.forEach(term => {
        if (window.includes(term.toLowerCase())) {
          score++
        }
      })
      
      if (score > bestScore) {
        bestScore = score
        bestStart = i
      }
    }
    
    // Extract the snippet
    let snippet = content.substring(bestStart, bestStart + maxLength)
    
    // Clean up the edges
    if (bestStart > 0) {
      snippet = '...' + snippet.substring(snippet.indexOf(' ') + 1)
    }
    if (bestStart + maxLength < content.length) {
      snippet = snippet.substring(0, snippet.lastIndexOf(' ')) + '...'
    }
    
    return snippet
  }
  
  // Deduplicate highlights by removing similar ones
  protected deduplicateHighlights(highlights: string[]): string[] {
    if (highlights.length <= 1) return highlights
    
    const unique: string[] = []
    const seen = new Set<string>()
    
    for (const highlight of highlights) {
      // Normalize for comparison (remove HTML tags, extra spaces, lowercase)
      const normalized = highlight
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/\s+/g, ' ')    // Normalize spaces
        .toLowerCase()
        .trim()
      
      // Skip if we've seen this exact normalized text
      if (seen.has(normalized)) continue
      
      // Check if this is a substring of any existing highlight
      let isDuplicate = false
      for (const existing of seen) {
        if (existing.includes(normalized) || normalized.includes(existing)) {
          isDuplicate = true
          break
        }
      }
      
      if (!isDuplicate) {
        seen.add(normalized)
        unique.push(highlight)
      }
    }
    
    return unique
  }
}