'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { UnifiedSearchBar } from '@/components/search/unified-search-bar'
import { UnifiedSearchResults } from '@/components/search/unified-search-results'
import { UnifiedSearchFilters } from '@/components/search/unified-search-filters'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Brain, Code, Sparkles } from 'lucide-react'
import { UnifiedSearchRequest, UnifiedSearchResponse } from '@/lib/search/types'

export default function UnifiedSearchPage() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<UnifiedSearchRequest['filters']>({
    includeMemories: true,
    includeCode: true
  })
  const [options, setOptions] = useState<UnifiedSearchRequest['options']>({
    expandContext: true,
    includeRelated: true
  })
  const [results, setResults] = useState<UnifiedSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'all' | 'memories' | 'code'>('all')
  
  const debouncedQuery = useDebounce(query, 500)
  
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null)
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/search/unified', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: searchQuery,
          filters,
          options,
          pagination: {
            limit: 50
          }
        } as UnifiedSearchRequest)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Search failed')
      }
      
      const data: UnifiedSearchResponse = await response.json()
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [filters, options])
  
  useEffect(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery)
    }
  }, [debouncedQuery, performSearch])
  
  // Filter results based on view
  const filteredResults = results ? {
    ...results,
    results: view === 'all' 
      ? results.results 
      : results.results.filter(r => 
          view === 'memories' ? r.type === 'memory' : r.type === 'code'
        )
  } : null
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Unified Search</h1>
            <p className="text-muted-foreground">
              Search across your memories and code with AI-powered understanding
            </p>
          </div>
        </div>
        
        {/* Search Bar */}
        <UnifiedSearchBar
          value={query}
          onChange={setQuery}
          onSearch={(q) => {
            setQuery(q)
            performSearch(q)
          }}
          loading={loading}
          placeholder="Ask a question, find code, or explore your memories..."
        />
      </div>
      
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1">
          <UnifiedSearchFilters
            filters={filters}
            options={options}
            onFiltersChange={setFilters}
            onOptionsChange={setOptions}
            facets={results?.facets}
          />
        </div>
        
        {/* Results Area */}
        <div className="lg:col-span-3">
          {error && (
            <Card className="p-6 border-destructive">
              <p className="text-destructive">{error}</p>
            </Card>
          )}
          
          {results && !error && (
            <>
              {/* Search Interpretation */}
              {results.interpretation && (
                <Card className="p-4 mb-4 bg-muted/50">
                  <div className="flex items-start gap-3">
                    <Brain className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">Intent:</span>{' '}
                        {results.interpretation.intent.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Using strategies: {results.interpretation.searchStrategies.join(', ')}
                      </p>
                    </div>
                  </div>
                </Card>
              )}
              
              {/* View Tabs */}
              <Tabs value={view} onValueChange={(v) => setView(v as any)} className="mb-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all" className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    All Results ({results.results.length})
                  </TabsTrigger>
                  <TabsTrigger value="memories" className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Memories ({results.results.filter(r => r.type === 'memory').length})
                  </TabsTrigger>
                  <TabsTrigger value="code" className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Code ({results.results.filter(r => r.type === 'code').length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              
              {/* Results */}
              <UnifiedSearchResults
                results={filteredResults}
                loading={loading}
                query={query}
              />
            </>
          )}
          
          {!results && !loading && !error && query && (
            <Card className="p-12 text-center">
              <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Start typing to search across your memories and code
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}