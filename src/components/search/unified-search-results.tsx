'use client'

import { UnifiedSearchResponse, UnifiedSearchResult } from '@/lib/search/types'
import { EnhancedResultCard } from './enhanced-result-card'
import { Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface UnifiedSearchResultsProps {
  results: UnifiedSearchResponse | null
  loading: boolean
  query: string
}

export function UnifiedSearchResults({
  results,
  loading,
  query
}: UnifiedSearchResultsProps) {
  if (loading) {
    return (
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Searching across memories and code...</p>
        </div>
      </Card>
    )
  }
  
  if (!results || results.results.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">No results found</p>
          <p className="text-muted-foreground">
            Try adjusting your search terms or filters
          </p>
        </div>
      </Card>
    )
  }
  
  return (
    <div className="space-y-4">
      {/* Results summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Found {results.results.length} result{results.results.length !== 1 ? 's' : ''} for "{query}"
        </p>
        {results.pagination.totalResults && results.pagination.totalResults > results.results.length && (
          <p>
            Showing top {results.results.length} of {results.pagination.totalResults}
          </p>
        )}
      </div>
      
      {/* Result cards */}
      <div className="space-y-3">
        {results.results.map((result, index) => (
          <EnhancedResultCard
            key={`${result.type}-${result.id}-${index}`}
            result={result}
            query={query}
          />
        ))}
      </div>
      
      {/* Load more */}
      {results.pagination.hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => {
              // TODO: Implement pagination
              console.log('Load more')
            }}
          >
            Load More Results
          </Button>
        </div>
      )}
    </div>
  )
}