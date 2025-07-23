'use client'

import { useMemo } from 'react'
import { Memory } from '@/lib/api/memories'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Line, LineChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { Activity, Calendar, TrendingUp } from 'lucide-react'

interface MemoryActivityChartsProps {
  memories: Memory[]
}

export function MemoryActivityCharts({ memories }: MemoryActivityChartsProps) {
  // Calculate daily activity for the last 7 days
  const dailyActivity = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - i))
      return date.toISOString().split('T')[0]
    })

    const activityMap = memories.reduce((acc, memory) => {
      const date = memory.metadata?.startTime 
        ? new Date(memory.metadata.startTime).toISOString().split('T')[0]
        : new Date(memory.created_at).toISOString().split('T')[0]
      
      if (last7Days.includes(date)) {
        acc[date] = (acc[date] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    return last7Days.map(date => ({
      date: new Date(date).toLocaleDateString('en', { weekday: 'short' }),
      count: activityMap[date] || 0
    }))
  }, [memories])

  // Calculate hourly distribution
  const hourlyDistribution = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i)
    const hourMap = memories.reduce((acc, memory) => {
      const hour = memory.metadata?.startTime 
        ? new Date(memory.metadata.startTime).getHours()
        : new Date(memory.created_at).getHours()
      
      acc[hour] = (acc[hour] || 0) + 1
      return acc
    }, {} as Record<number, number>)

    // Get peak hours (top 8 hours)
    const peakHours = Object.entries(hourMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([hour]) => parseInt(hour))

    return hours.filter(h => peakHours.includes(h)).map(hour => ({
      hour: `${hour}:00`,
      count: hourMap[hour] || 0
    }))
  }, [memories])

  // Calculate project activity trends
  const projectTrends = useMemo(() => {
    const projectDays = memories.reduce((acc, memory) => {
      const date = memory.metadata?.startTime 
        ? new Date(memory.metadata.startTime).toISOString().split('T')[0]
        : new Date(memory.created_at).toISOString().split('T')[0]
      
      const key = `${memory.project_name}:${date}`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Get top 3 projects
    const topProjects = Object.entries(
      memories.reduce((acc, m) => {
        acc[m.project_name] = (acc[m.project_name] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    )
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([project]) => project)

    return topProjects.map(project => ({
      project,
      activity: Object.entries(projectDays)
        .filter(([key]) => key.startsWith(project))
        .reduce((sum, [, count]) => sum + count, 0)
    }))
  }, [memories])

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Daily Activity Chart */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Daily Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-20">
            <ChartContainer
              config={{
                count: {
                  label: "Memories",
                  color: "hsl(var(--primary))",
                },
              }}
              className="h-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyActivity} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="var(--color-count)" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      {/* Peak Hours Chart */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Peak Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-20">
            <ChartContainer
              config={{
                count: {
                  label: "Activity",
                  color: "hsl(var(--primary))",
                },
              }}
              className="h-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyDistribution} margin={{ top: 5, right: 5, bottom: 15, left: 5 }}>
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fontSize: 10 }}
                    interval={0}
                  />
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

      {/* Project Activity */}
      <Card className="p-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Top Projects
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-20 flex items-center">
            <div className="w-full space-y-1">
              {projectTrends.map((project, i) => (
                <div key={project.project} className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[100px]">{project.project}</span>
                  <span className="font-mono text-muted-foreground">{project.activity}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}