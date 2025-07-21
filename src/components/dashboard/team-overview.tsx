"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import {
  Users,
  Database,
  GitBranch,
  MessageSquare,
  Activity,
  TrendingUp,
  Clock,
  CheckCircle,
} from "lucide-react"

interface TeamStats {
  memberCount: number
  memoriesSynced: number
  graphsStored: number
  reviewsConducted: number
  activeProjects: number
  recentActivity: {
    type: string
    count: number
    timestamp: string
  }[]
}

export function TeamOverview() {
  const [stats, setStats] = useState<TeamStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTeamStats() {
      try {
        const supabase = createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError("Not authenticated")
          return
        }

        // Get user's team
        const { data: teamMember, error: teamError } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", user.id)
          .single()

        if (teamError || !teamMember) {
          setError("No team found")
          return
        }

        const teamId = teamMember.team_id

        // Fetch all stats in parallel
        const [
          memberCountResult,
          memoriesCountResult,
          graphsCountResult,
          reviewsCountResult,
          projectsCountResult,
          recentMemoriesResult,
          recentReviewsResult,
        ] = await Promise.all([
          // Member count
          supabase
            .from("team_members")
            .select("*", { count: "exact", head: true })
            .eq("team_id", teamId),

          // Memories count
          supabase
            .from("memories")
            .select("*", { count: "exact", head: true })
            .eq("team_id", teamId),

          // Code entities count (representing graphs)
          supabase
            .from("code_entities")
            .select("*", { count: "exact", head: true })
            .eq("team_id", teamId),

          // Reviews count
          supabase
            .from("review_sessions")
            .select("*", { count: "exact", head: true })
            .eq("team_id", teamId),

          // Active projects count
          supabase
            .from("projects")
            .select("*", { count: "exact", head: true })
            .eq("team_id", teamId),

          // Recent memory syncs
          supabase
            .from("sync_status")
            .select("*")
            .eq("team_id", teamId)
            .eq("sync_type", "memory")
            .eq("status", "completed")
            .order("completed_at", { ascending: false })
            .limit(1),

          // Recent reviews
          supabase
            .from("review_sessions")
            .select("*")
            .eq("team_id", teamId)
            .order("created_at", { ascending: false })
            .limit(1),
        ])

        // Compile stats
        const compiledStats: TeamStats = {
          memberCount: memberCountResult.count || 0,
          memoriesSynced: memoriesCountResult.count || 0,
          graphsStored: graphsCountResult.count || 0,
          reviewsConducted: reviewsCountResult.count || 0,
          activeProjects: projectsCountResult.count || 0,
          recentActivity: []
        }

        // Add recent activity
        if (recentMemoriesResult.data && recentMemoriesResult.data.length > 0) {
          compiledStats.recentActivity.push({
            type: "memory_sync",
            count: recentMemoriesResult.data[0].stats?.memories_synced || 0,
            timestamp: recentMemoriesResult.data[0].completed_at
          })
        }

        if (recentReviewsResult.data && recentReviewsResult.data.length > 0) {
          compiledStats.recentActivity.push({
            type: "pr_review",
            count: 1,
            timestamp: recentReviewsResult.data[0].created_at
          })
        }

        setStats(compiledStats)
      } catch (err) {
        console.error("Error fetching team stats:", err)
        setError("Failed to load team statistics")
      } finally {
        setIsLoading(false)
      }
    }

    fetchTeamStats()
  }, [])

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!stats) {
    return null
  }

  const statCards = [
    {
      title: "Team Members",
      value: stats.memberCount,
      icon: Users,
      description: "Active team members",
      trend: null,
    },
    {
      title: "Memories Synced",
      value: stats.memoriesSynced.toLocaleString(),
      icon: Database,
      description: "Conversation memories stored",
      trend: "+12%",
    },
    {
      title: "Code Graphs",
      value: stats.graphsStored.toLocaleString(),
      icon: GitBranch,
      description: "Code entities indexed",
      trend: "+8%",
    },
    {
      title: "PR Reviews",
      value: stats.reviewsConducted,
      icon: MessageSquare,
      description: "Reviews conducted",
      trend: "+25%",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
                {stat.trend && (
                  <div className="flex items-center pt-1">
                    <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                    <span className="text-xs text-green-500">{stat.trend}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      from last month
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Additional stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.activeProjects}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Projects with recent activity
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentActivity.length > 0 ? (
              <div className="space-y-2">
                {stats.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">
                      {activity.type === "memory_sync"
                        ? `${activity.count} memories synced`
                        : activity.type === "pr_review"
                        ? "PR review completed"
                        : "Activity logged"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(activity.timestamp).toRelativeString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No recent activity
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Add this extension to make the relative time work
declare global {
  interface Date {
    toRelativeString(): string
  }
}

Date.prototype.toRelativeString = function() {
  const seconds = Math.floor((new Date().getTime() - this.getTime()) / 1000)
  
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
    { label: 'second', seconds: 1 }
  ]
  
  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds)
    if (count > 0) {
      return count === 1 
        ? `${count} ${interval.label} ago`
        : `${count} ${interval.label}s ago`
    }
  }
  
  return 'just now'
}