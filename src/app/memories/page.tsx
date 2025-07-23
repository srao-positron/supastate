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
        
        // Load project summaries
        await loadProjectSummaries()
      } catch (error) {
        console.error('Failed to load initial data:', error)
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
            onSearch={handleSearch}
            isSearching={isLoading}
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