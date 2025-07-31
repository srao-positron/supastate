'use client'

import { useMemo } from 'react'
import { Memory } from '@/lib/api/memories'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Line, LineChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { 
  Activity, 
  Calendar, 
  TrendingUp, 
  Database,
  Brain,
  Sparkles,
  Clock,
  FolderOpen,
  MessageSquare,
  Code,
  GitBranch,
  Users
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface MemoryDashboardProps {
  memories: Memory[]
  allMemories?: Memory[]
  totalMemories: number
  projectCount: number
  stats?: {
    totalMemories: number
    projectCounts: Record<string, number>
    totalWords?: number
    avgWordsPerMemory?: number
    uniqueSessions?: number
    topProjects?: Array<[string, number]>
    typeDistribution?: Record<string, number>
  }
  codeStats?: {
    totalEntities: number
    totalFiles: number
    totalProjects: number
    linkedEntities: number
    entityTypes: Record<string, number>
    languageDistribution?: Record<string, number>
  }
  activityData?: {
    dailyActivity: Array<{ date: string; count: number }>
    hourlyDistribution: Array<{ hour: number; count: number }>
    weeklyPattern?: Array<{ day: string; count: number }>
    totalMemories: number
  }
}

export function MemoryDashboard({ 
  memories, 
  allMemories = memories,
  totalMemories, 
  projectCount,
  stats,
  codeStats,
  activityData 
}: MemoryDashboardProps) {
  
  // Use insights from server-side stats
  const insights = useMemo(() => {
    return {
      totalWords: stats?.totalWords || 0,
      avgWordsPerMemory: stats?.avgWordsPerMemory || 0,
      uniqueSessions: stats?.uniqueSessions || 0,
      topProjects: stats?.topProjects || [],
      typeDistribution: stats?.typeDistribution || {},
      projectCounts: stats?.projectCounts || {}
    }
  }, [stats])

  // Use daily activity from server-side calculation
  const dailyActivity = useMemo(() => {
    if (!activityData?.dailyActivity) {
      return []
    }
    
    return activityData.dailyActivity.map(item => {
      const date = new Date(item.date)
      return {
        date: date.getDate() === 1 ? date.toLocaleDateString('en', { month: 'short', day: 'numeric' }) : date.getDate().toString(),
        fullDate: item.date,
        count: item.count,
        dayOfWeek: date.toLocaleDateString('en', { weekday: 'short' })
      }
    })
  }, [activityData])

  // Use hourly distribution from server-side calculation
  const hourlyDistribution = useMemo(() => {
    if (!activityData?.hourlyDistribution) {
      return []
    }
    
    return activityData.hourlyDistribution.map(item => ({
      hour: item.hour.toString().padStart(2, '0'),
      count: item.count,
      label: `${item.hour}:00`
    }))
  }, [activityData])

  // Use weekly pattern from server-side calculation
  const weeklyPattern = useMemo(() => {
    if (!activityData?.weeklyPattern) {
      return []
    }
    
    return activityData.weeklyPattern
  }, [activityData])

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Total Memories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalMemories.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Across {insights.uniqueSessions} sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{projectCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Active codebases
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Avg. Length
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{insights.avgWordsPerMemory}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Words per memory
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {dailyActivity[dailyActivity.length - 1]?.count || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              New memories
            </p>
          </CardContent>
        </Card>

        {codeStats && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" />
                  Code Entities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{codeStats.totalEntities.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {codeStats.totalFiles} files
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  Linked Entities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{codeStats.linkedEntities.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connected to memories
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Activity Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 30-Day Activity Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              30-Day Activity Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ChartContainer
                config={{
                  count: {
                    label: "Memories",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyActivity} margin={{ top: 5, right: 5, bottom: 25, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke="var(--color-count)" 
                      strokeWidth={2}
                      dot={false}
                    />
                    <ChartTooltip 
                      content={<ChartTooltipContent />}
                      labelFormatter={(value, payload) => {
                        if (payload && payload[0]) {
                          return payload[0].payload.fullDate
                        }
                        return value
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        {/* Hourly Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Activity by Hour
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ChartContainer
                config={{
                  count: {
                    label: "Memories",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyDistribution} margin={{ top: 5, right: 5, bottom: 25, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="hour" 
                      tick={{ fontSize: 10 }}
                      interval={2}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Bar 
                      dataKey="count" 
                      fill="var(--color-count)" 
                      radius={[4, 4, 0, 0]}
                    />
                    <ChartTooltip 
                      content={<ChartTooltipContent />}
                      labelFormatter={(value) => `${value}:00`}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Distribution and Memory Types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Project Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.topProjects.map(([project, count], index) => {
                const percentage = Math.round((count / totalMemories) * 100)
                return (
                  <div key={project} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[200px]">{project}</span>
                      <span className="font-mono text-muted-foreground">{count}</span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Pattern Detection Results */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Detected Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Debugging Sessions</span>
                <span className="font-mono text-muted-foreground">11</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Learning Sessions</span>
                <span className="font-mono text-muted-foreground">10</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Memory-Code Links</span>
                <span className="font-mono text-muted-foreground">{codeStats?.linkedEntities || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Language Distribution */}
      {codeStats && codeStats.languageDistribution && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Code className="h-4 w-4" />
              Language Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(codeStats.languageDistribution)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([language, count]) => {
                  const percentage = Math.round((count / codeStats.totalFiles) * 100)
                  const languageDisplay = {
                    ts: 'TypeScript',
                    tsx: 'TypeScript (React)',
                    js: 'JavaScript',
                    jsx: 'JavaScript (React)',
                    py: 'Python',
                    sql: 'SQL',
                    json: 'JSON',
                    md: 'Markdown',
                    sh: 'Shell',
                    plaintext: 'Plain Text'
                  }[language] || language.toUpperCase()
                  
                  return (
                    <div key={language}>
                      <div className="flex items-center justify-between text-sm">
                        <span>{languageDisplay}</span>
                        <span className="font-mono text-muted-foreground">{count}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Pattern */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Weekly Pattern
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32">
            <ChartContainer
              config={{
                count: {
                  label: "Memories",
                  color: "hsl(var(--primary))",
                },
              }}
              className="h-full w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyPattern} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Bar 
                    dataKey="count" 
                    fill="var(--color-count)" 
                    radius={[4, 4, 0, 0]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}