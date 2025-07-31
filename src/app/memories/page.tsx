'use client'

import { useState, useEffect } from 'react'
import { Brain } from 'lucide-react'
import { MemoryDashboard } from '@/components/memories/memory-dashboard'
import { memoriesAPI } from '@/lib/api/memories'
import { Card, CardContent } from '@/components/ui/card'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function MemoriesPage() {
  const [stats, setStats] = useState<{
    totalMemories: number
    projectCounts: Record<string, number>
    totalWords?: number
    avgWordsPerMemory?: number
    uniqueSessions?: number
    topProjects?: Array<[string, number]>
    typeDistribution?: Record<string, number>
  }>({
    totalMemories: 0,
    projectCounts: {}
  })
  const [projectSummaries, setProjectSummaries] = useState<any[]>([])
  const [loadingSummaries, setLoadingSummaries] = useState(false)
  const [codeStats, setCodeStats] = useState<any>(null)
  const [activityData, setActivityData] = useState<any>(null)

  // Load initial stats and data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load stats
        const memoryStats = await memoriesAPI.getMemoryStats()
        setStats(memoryStats)
        
        // Load project summaries
        await loadProjectSummaries()
        
        // Load code stats
        await loadCodeStats()
        
        // Load activity data
        await loadActivityData()
        
        // Load insights data
        await loadInsights()
      } catch (error) {
        console.error('Failed to load initial data:', error)
        // Set empty state so the UI still renders
        setStats({ totalMemories: 0, projectCounts: {} })
      }
    }
    loadInitialData()
  }, [])

  // Load code stats
  const loadCodeStats = async () => {
    try {
      const response = await fetch('/api/code/stats')
      if (response.ok) {
        const data = await response.json()
        setCodeStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to load code stats:', error)
    }
  }

  // Load activity data
  const loadActivityData = async () => {
    try {
      const response = await fetch('/api/memories/activity')
      if (response.ok) {
        const data = await response.json()
        setActivityData(data)
      }
    } catch (error) {
      console.error('Failed to load activity data:', error)
    }
  }

  // Load insights data
  const loadInsights = async () => {
    try {
      const response = await fetch('/api/memories/insights')
      if (response.ok) {
        const data = await response.json()
        setStats(prevStats => ({
          ...prevStats,
          ...data
        }))
      }
    } catch (error) {
      console.error('Failed to load insights:', error)
    }
  }

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

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="h-8 w-8" />
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Overview of your conversation memories and code insights
        </p>
      </div>

      {/* Dashboard */}
      <MemoryDashboard 
        memories={[]} 
        allMemories={[]}
        totalMemories={stats.totalMemories}
        projectCount={Object.keys(stats.projectCounts).length}
        stats={stats}
        codeStats={codeStats}
        activityData={activityData}
      />

      {/* Project Summaries */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Project Summaries</h2>
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
                <CardContent className="pt-6">
                  <h3 className="text-lg font-semibold mb-2">{summary.project_name}</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Updated {new Date(summary.updated_at).toLocaleString()} • 
                    {summary.memories_included} memories analyzed
                  </p>
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
      </div>
    </div>
  )
}