'use client'

import { useState, useEffect, useCallback } from 'react'
import { Brain, Database, TrendingUp } from 'lucide-react'
import { MemorySearch } from '@/components/memories/memory-search'
import { MemoryList } from '@/components/memories/memory-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { memoriesAPI, Memory, MemorySearchResponse } from '@/lib/api/memories'
import { useToast } from '@/hooks/use-toast'
import { 
  QuickActionsBar, 
  TimelineView, 
  MemoryInsights 
} from '@/components/memories/memory-explorer-enhancements'

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchResponse, setSearchResponse] = useState<MemorySearchResponse | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'timeline'>('list')
  const [showInsights, setShowInsights] = useState(false)
  const [stats, setStats] = useState({
    totalMemories: 0,
    projectCounts: {} as Record<string, number>,
  })
  const { toast } = useToast()

  const pageSize = 20

  // Load initial stats and memories
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load stats
        const memoryStats = await memoriesAPI.getMemoryStats()
        setStats(memoryStats)
        
        // Load initial memories
        await handleSearch('', undefined)
      } catch (error) {
        console.error('Failed to load initial data:', error)
      }
    }
    loadInitialData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Search handler
  const handleSearch = useCallback(async (query: string, projectFilter?: string[]) => {
    setIsLoading(true)
    setError(null)
    setCurrentPage(1)

    try {
      const response = await memoriesAPI.searchMemories({
        query,
        projectFilter,
        limit: pageSize,
        offset: 0,
      })

      setMemories(response.results)
      setSearchResponse(response)
    } catch (err) {
      setError('Failed to search memories. Please try again.')
      toast({
        title: 'Search Error',
        description: 'Failed to search memories. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  // Pagination handler
  const handlePageChange = async (page: number) => {
    if (!searchResponse) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await memoriesAPI.searchMemories({
        query: '',
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })

      setMemories(response.results)
      setSearchResponse(response)
      setCurrentPage(page)
    } catch (err) {
      setError('Failed to load page. Please try again.')
      toast({
        title: 'Load Error',
        description: 'Failed to load page. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const totalPages = searchResponse ? Math.ceil(searchResponse.total / pageSize) : 1

  // Handle related memory click - scroll to memory or open it
  const handleRelatedMemoryClick = (memory: Memory) => {
    // Find if memory is already in the list
    const existingIndex = memories.findIndex(m => m.id === memory.id)
    if (existingIndex !== -1) {
      // Scroll to the memory
      const element = document.getElementById(`memory-${memory.id}`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      // Add the memory to the list and expand it
      setMemories([memory, ...memories])
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="h-8 w-8" />
          Memory Explorer
        </h1>
        <p className="text-muted-foreground mt-2">
          Search and explore conversation memories from your codebase
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Memories</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMemories.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across all projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(stats.projectCounts).length}</div>
            <p className="text-xs text-muted-foreground">
              Active projects with memories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Active</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(stats.projectCounts).length > 0
                ? Object.entries(stats.projectCounts)
                    .sort(([, a], [, b]) => b - a)[0][0]
                : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Project with most memories
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Search and Results */}
      <div className="space-y-6">
        <MemorySearch
          onSearch={handleSearch}
          isSearching={isLoading}
        />

        {/* Quick Actions and View Toggle */}
        <QuickActionsBar 
          currentView={viewMode}
          onViewChange={setViewMode}
        />

        {/* Memory Insights (toggleable) */}
        {memories.length > 0 && (
          <div className="space-y-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInsights(!showInsights)}
            >
              {showInsights ? 'Hide' : 'Show'} Insights
            </Button>
            
            {showInsights && <MemoryInsights memories={memories} />}
          </div>
        )}

        {/* Memory Display based on view mode */}
        {viewMode === 'timeline' ? (
          <TimelineView memories={memories} />
        ) : (
          <MemoryList
            memories={memories}
            isLoading={isLoading}
            error={error}
            hasMore={searchResponse?.hasMore || false}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            showSimilarity={true}
            showRelated={true}
            onRelatedMemoryClick={handleRelatedMemoryClick}
          />
        )}
      </div>
    </div>
  )
}