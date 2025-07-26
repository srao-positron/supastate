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
  }
  codeStats?: {
    totalEntities: number
    totalFiles: number
    totalProjects: number
    linkedEntities: number
    entityTypes: Record<string, number>
  }
}

export function MemoryDashboard({ 
  memories, 
  allMemories = memories,
  totalMemories, 
  projectCount,
  stats,
  codeStats 
}: MemoryDashboardProps) {
  
  // Calculate insights from all memories for better stats
  const insights = useMemo(() => {
    const totalWords = allMemories.reduce((acc, m) => acc + m.content.split(' ').length, 0)
    const avgWordsPerMemory = allMemories.length > 0 ? Math.round(totalWords / allMemories.length) : 0
    
    // Get unique chunks (sessions)
    const uniqueSessions = new Set(allMemories.map(m => m.chunk_id)).size
    
    // Calculate project distribution
    const projectCounts = stats?.projectCounts || allMemories.reduce((acc, m) => {
      acc[m.project_name] = (acc[m.project_name] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const topProjects = Object.entries(projectCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
    
    // Calculate memory types distribution from metadata
    const typeDistribution = allMemories.reduce((acc, m) => {
      const type = m.metadata?.type || m.metadata?.messageType || 'general'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    return {
      totalWords,
      avgWordsPerMemory,
      uniqueSessions,
      topProjects,
      typeDistribution,
      projectCounts
    }
  }, [allMemories, stats])

  // Calculate daily activity for the last 30 days
  const dailyActivity = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      date.setHours(0, 0, 0, 0)
      return date
    })

    const activityMap = allMemories.reduce((acc, memory) => {
      const date = new Date(memory.created_at)
      date.setHours(0, 0, 0, 0)
      const dateStr = date.toISOString().split('T')[0]
      acc[dateStr] = (acc[dateStr] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return last30Days.map(date => {
      const dateStr = date.toISOString().split('T')[0]
      return {
        date: date.getDate() === 1 ? date.toLocaleDateString('en', { month: 'short', day: 'numeric' }) : date.getDate().toString(),
        fullDate: dateStr,
        count: activityMap[dateStr] || 0,
        dayOfWeek: date.toLocaleDateString('en', { weekday: 'short' })
      }
    })
  }, [allMemories])

  // Calculate hourly distribution with all hours
  const hourlyDistribution = useMemo(() => {
    const hourMap = allMemories.reduce((acc, memory) => {
      const hour = new Date(memory.created_at).getHours()
      acc[hour] = (acc[hour] || 0) + 1
      return acc
    }, {} as Record<number, number>)

    return Array.from({ length: 24 }, (_, hour) => ({
      hour: hour.toString().padStart(2, '0'),
      count: hourMap[hour] || 0,
      label: `${hour}:00`
    }))
  }, [allMemories])

  // Calculate weekly patterns
  const weeklyPattern = useMemo(() => {
    const dayMap = allMemories.reduce((acc, memory) => {
      const day = new Date(memory.created_at).getDay()
      acc[day] = (acc[day] || 0) + 1
      return acc
    }, {} as Record<number, number>)

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days.map((day, index) => ({
      day,
      count: dayMap[index] || 0
    }))
  }, [allMemories])

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

        {/* Memory Types Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Memory Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ChartContainer
                config={Object.keys(insights.typeDistribution).reduce((acc, type, index) => {
                  acc[type] = {
                    label: type.charAt(0).toUpperCase() + type.slice(1),
                    color: COLORS[index % COLORS.length],
                  }
                  return acc
                }, {} as any)}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Object.entries(insights.typeDistribution).map(([type, count]) => ({
                        name: type,
                        value: count
                      }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {Object.entries(insights.typeDistribution).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Code Entity Types Distribution */}
      {codeStats && Object.keys(codeStats.entityTypes).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Code className="h-4 w-4" />
              Code Entity Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ChartContainer
                config={Object.keys(codeStats.entityTypes).reduce((acc, type, index) => {
                  acc[type] = {
                    label: type.charAt(0).toUpperCase() + type.slice(1),
                    color: COLORS[index % COLORS.length],
                  }
                  return acc
                }, {} as any)}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Object.entries(codeStats.entityTypes).map(([type, count]) => ({
                        name: type,
                        value: count
                      }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {Object.entries(codeStats.entityTypes).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
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