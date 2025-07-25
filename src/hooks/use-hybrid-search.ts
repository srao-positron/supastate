import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type SearchType = 'vector' | 'graph' | 'hybrid'

export interface SearchFilters {
  projectName?: string
  minSimilarity?: number
  timeRange?: {
    start: string
    end: string
  }
  onlyMyContent?: boolean
  teamId?: string
  startNodeId?: string // For graph search
  relationshipTypes?: string[]
  maxDepth?: number
  direction?: 'INCOMING' | 'OUTGOING' | 'BOTH'
}

export interface SearchResult {
  node: any
  score?: number
  nodeType: string
  title: string
  summary: string
  key: string
  content?: string
  metadata?: any
  relatedNodes?: Array<{
    id: string
    type: string
    name: string
  }>
  relatedCount?: number
}

export interface HybridSearchResponse {
  success: boolean
  searchType: SearchType
  query?: string
  results: SearchResult[]
  totalResults: number
  filters: SearchFilters
}

export function useHybridSearch() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])

  const search = useCallback(async (
    query: string | null,
    searchType: SearchType = 'hybrid',
    filters: SearchFilters = {},
    includeRelated?: {
      types: string[]
      maxDepth: number
    }
  ) => {
    setLoading(true)
    setError(null)
    
    try {
      // Get the session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/neo4j/hybrid-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          query,
          searchType,
          filters,
          includeRelated,
          limit: 30
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Search failed')
      }

      const data: HybridSearchResponse = await response.json()
      setResults(data.results)
      
      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed'
      setError(message)
      setResults([])
      throw err
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const getSuggestions = useCallback(async (type: 'all' | 'projects' | 'concepts' | 'relationships' = 'all') => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/neo4j/hybrid-search?type=${type}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to get suggestions')
      }

      const data = await response.json()
      return data.suggestions
    } catch (err) {
      console.error('Failed to get suggestions:', err)
      return {}
    }
  }, [supabase])

  const clearResults = useCallback(() => {
    setResults([])
    setError(null)
  }, [])

  return {
    search,
    getSuggestions,
    clearResults,
    results,
    loading,
    error
  }
}