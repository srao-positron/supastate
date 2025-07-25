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
import { MemoryActivityCharts } from '@/components/memories/memory-activity-charts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MemoryFilters, type MemoryFilters as MemoryFiltersType } from '@/components/memories/memory-filters'

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchResponse, setSearchResponse] = useState<MemorySearchResponse | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'timeline'>('list')
  const [showInsights, setShowInsights] = useState(true) // Show insights by default
  const [projectSummaries, setProjectSummaries] = useState<any[]>([])
  const [loadingSummaries, setLoadingSummaries] = useState(false)
  const [stats, setStats] = useState({
    totalMemories: 0,
    projectCounts: {} as Record<string, number>,
  })
  const [projects, setProjects] = useState<string[]>([])
  const [activeFilters, setActiveFilters] = useState<MemoryFiltersType>({})
  const { toast } = useToast()

  const pageSize = 20

  // Load initial stats and memories
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load stats
        const memoryStats = await memoriesAPI.getMemoryStats()
        setStats(memoryStats)
        
        // Load projects list
        const projectList = await memoriesAPI.getProjects()
        setProjects(projectList)
        
        // Load initial memories
        await handleSearch('', undefined)
        
        // Load project summaries
        await loadProjectSummaries()
      } catch (error) {
        console.error('Failed to load initial data:', error)
        // Set empty state so the UI still renders
        setStats({ totalMemories: 0, projectCounts: {} })
        setProjects([])
        setMemories([])
        setSearchResponse({
          results: [],
          total: 0,
          hasMore: false
        })
      }
    }
    loadInitialData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load project summaries
  const loadProjectSummaries = async () => {
    setLoadingSummaries(true)
    try {
      const response = await fetch('/api/memories/summaries')
      if (response.ok) {
        const data = await response.json()
        setProjectSummaries(data.summaries || [])
      }
    } catch (error) {
      console.error('Failed to load summaries:', error)
    } finally {
      setLoadingSummaries(false)
    }
  }

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

      // Apply date and time filters client-side
      if (filters?.dateRange?.from || filters?.dateRange?.to || filters?.timeRange?.startHour !== undefined || filters?.timeRange?.endHour !== undefined) {
        filteredMemories.results = filteredMemories.results.filter(memory => {
          const memoryDate = new Date(memory.created_at)
          const memoryHour = memoryDate.getHours()

          // Date range filter
          if (filters?.dateRange?.from && memoryDate < filters.dateRange.from) return false
          if (filters?.dateRange?.to && memoryDate > filters.dateRange.to) return false

          // Time range filter
          if (filters?.timeRange?.startHour !== undefined && memoryHour < filters.timeRange.startHour) return false
          if (filters?.timeRange?.endHour !== undefined && memoryHour > filters.timeRange.endHour) return false

          return true
        })
        filteredMemories.total = filteredMemories.results.length
      }

      // Paginate results
      const paginatedResults = filteredMemories.results.slice(0, pageSize)
      
      setMemories(paginatedResults)
      setSearchResponse({
        ...filteredMemories,
        results: paginatedResults,
        hasMore: filteredMemories.results.length > pageSize
      })
    } catch (err) {
      console.error('Search error:', err)
      // Don't show error for empty results
      if (err instanceof Error && err.message.includes('empty')) {
        setMemories([])
        setSearchResponse({
          results: [],
          total: 0,
          hasMore: false
        })
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error('Memory search error details:', errorMessage)
        
        if (errorMessage.includes('Failed to connect to Neo4j')) {
          setError('Unable to connect to Neo4j database. The connection may be initializing.')
          toast({
            title: 'Database Connection',
            description: 'Neo4j is initializing. Please try again in a moment.',
            variant: 'destructive',
          })
        } else {
          setError('Failed to search memories. Please try again.')
          toast({
            title: 'Search Error',
            description: errorMessage,
            variant: 'destructive',
          })
        }
      }
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


      {/* Insights (shown by default) */}
      <div className="space-y-4">
        {showInsights && memories.length > 0 && (
          <>
            <MemoryInsights 
              memories={memories} 
              totalMemories={stats.totalMemories}
              projectCount={Object.keys(stats.projectCounts).length}
            />
            <MemoryActivityCharts memories={memories} />
          </>
        )}
      </div>

      {/* Tabbed Interface */}
      <Tabs defaultValue="summaries" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="summaries">Project Summaries</TabsTrigger>
          <TabsTrigger value="details">Detailed Memories</TabsTrigger>
        </TabsList>

        {/* Project Summaries Tab */}
        <TabsContent value="summaries" className="space-y-4">
          {loadingSummaries ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading project summaries...</p>
            </div>
          ) : projectSummaries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">
                  No project summaries available yet. Summaries are generated automatically every 5 minutes.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {projectSummaries.map((summary) => (
                <Card key={summary.id} className="overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-lg">{summary.project_name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(summary.updated_at).toLocaleString()} • 
                      {summary.memories_included} memories analyzed
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {summary.summary_markdown}
                      </ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Detailed Memories Tab */}
        <TabsContent value="details" className="space-y-6">
          <MemorySearch
            onSearch={(query, projectFilter, useSemanticSearch) => handleSearch(query, projectFilter, activeFilters, useSemanticSearch)}
            isSearching={isLoading}
          />

          {/* Filters */}
          <MemoryFilters
            projects={projects}
            onFiltersChange={(filters) => {
              setActiveFilters(filters)
              handleSearch('', undefined, filters, true)
            }}
            isLoading={isLoading}
          />

          {/* Quick Actions and View Toggle */}
          <QuickActionsBar 
            currentView={viewMode}
            onViewChange={setViewMode}
          />

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
        </TabsContent>
      </Tabs>
    </div>
  )
}