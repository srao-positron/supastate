'use client'

import { useState, useEffect, useCallback } from 'react'
import { Brain } from 'lucide-react'
import { MemorySearch } from '@/components/memories/memory-search'
import { MemoryList } from '@/components/memories/memory-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { memoriesAPI, Memory, MemorySearchResponse } from '@/lib/api/memories'
import { useToast } from '@/hooks/use-toast'
import { MemoryFilters, type MemoryFilters as MemoryFiltersType } from '@/components/memories/memory-filters'

export default function MemorySearchPage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchResponse, setSearchResponse] = useState<MemorySearchResponse | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [projects, setProjects] = useState<string[]>([])
  const [activeFilters, setActiveFilters] = useState<MemoryFiltersType>({})
  const { toast } = useToast()

  const pageSize = 20

  // Load projects list
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projectList = await memoriesAPI.getProjects()
        setProjects(projectList)
      } catch (error) {
        console.error('Failed to load projects:', error)
        setProjects([])
      }
    }
    loadProjects()
  }, [])

  // Load initial memories
  useEffect(() => {
    handleSearch('', undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Search handler with filters
  const handleSearch = useCallback(async (query: string, projectFilter?: string[], filters?: MemoryFiltersType, useSemanticSearch?: boolean) => {
    setIsLoading(true)
    setError(null)
    setCurrentPage(1)

    try {
      // Apply filters to the query
      let filteredMemories = await memoriesAPI.searchMemories({
        query,
        projectFilter: filters?.selectedProjects || projectFilter,
        limit: pageSize * 10, // Get more results for client-side filtering
        offset: 0,
        useSemanticSearch,
      })

      // Ensure we have valid results before filtering
      if (!filteredMemories || !filteredMemories.results) {
        console.error('Invalid search response:', filteredMemories)
        setMemories([])
        setSearchResponse({
          results: [],
          total: 0,
          hasMore: false
        })
        return
      }

      // Apply date range filter if set
      if (filters?.dateRange?.from || filters?.dateRange?.to) {
        filteredMemories.results = filteredMemories.results.filter(memory => {
          try {
            const dateStr = memory.occurred_at || memory.created_at
            if (!dateStr) return true // Include if no date
            const memoryDate = new Date(dateStr)
            if (filters.dateRange?.from && memoryDate < filters.dateRange.from) return false
            if (filters.dateRange?.to && memoryDate > filters.dateRange.to) return false
            return true
          } catch (e) {
            console.warn('Failed to parse date for filtering:', e)
            return true // Include if date parsing fails
          }
        })
      }


      setMemories(filteredMemories.results.slice(0, pageSize))
      setSearchResponse({
        ...filteredMemories,
        results: filteredMemories.results,
        total: filteredMemories.results.length,
        hasMore: filteredMemories.results.length > pageSize
      })
    } catch (err) {
      console.error('Search error:', err)
      setError(err instanceof Error ? err.message : 'Failed to search memories')
      toast({
        title: 'Search failed',
        description: err instanceof Error ? err.message : 'Failed to search memories',
        variant: 'destructive',
      })
      setMemories([])
      setSearchResponse(null)
    } finally {
      setIsLoading(false)
    }
  }, [toast, pageSize])

  // Load more memories
  const loadMore = useCallback(() => {
    if (!searchResponse?.hasMore || isLoading) return

    const nextPage = currentPage + 1
    const startIndex = (nextPage - 1) * pageSize
    const nextBatch = searchResponse.results.slice(startIndex, startIndex + pageSize)

    if (nextBatch.length > 0) {
      setMemories(prev => [...prev, ...nextBatch])
      setCurrentPage(nextPage)
    }
  }, [searchResponse, currentPage, pageSize, isLoading])

  // Handle filter changes
  const handleFilterChange = useCallback((filters: MemoryFiltersType) => {
    setActiveFilters(filters)
    // Re-run the current search with new filters
    const currentQuery = (document.querySelector('input[type="search"]') as HTMLInputElement)?.value || ''
    handleSearch(currentQuery, undefined, filters)
  }, [handleSearch])

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-6 w-6" />
            Memory Search
          </CardTitle>
          <CardDescription>
            Search through your AI conversation history and knowledge base
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <MemorySearch 
            onSearch={(query, projectFilter, useSemanticSearch) => 
              handleSearch(query, projectFilter, activeFilters, useSemanticSearch)
            } 
            isSearching={isLoading}
          />
          
          {projects.length > 0 && (
            <MemoryFilters 
              projects={projects}
              onFiltersChange={handleFilterChange}
            />
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {searchResponse && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Found {searchResponse.total.toLocaleString()} memories
                  {searchResponse.results.length < searchResponse.total && 
                    ` (showing ${memories.length})`
                  }
                </span>
              </div>

              <MemoryList 
                memories={memories} 
                isLoading={isLoading}
                hasMore={searchResponse.hasMore && memories.length < searchResponse.results.length}
                onLoadMore={loadMore}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}