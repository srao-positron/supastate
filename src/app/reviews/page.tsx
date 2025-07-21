'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReviewList } from '@/components/reviews/review-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { getReviewSessions, getReviewMetrics, getRepositories, triggerManualReview, ReviewFilters } from '@/lib/api/reviews'
import { createBrowserClient } from '@/lib/supabase/client'
import { GitPullRequest, Plus, Filter, TrendingUp, Clock, CheckCircle2, XCircle, Activity, RefreshCw } from 'lucide-react'

export default function ReviewsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [sessions, setSessions] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [repositories, setRepositories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<ReviewFilters>({})
  const [showNewReview, setShowNewReview] = useState(false)
  const [newReviewUrl, setNewReviewUrl] = useState('')
  const [newReviewStyle, setNewReviewStyle] = useState<'thorough' | 'quick' | 'security-focused'>('thorough')
  const [submitting, setSubmitting] = useState(false)
  const [teamId, setTeamId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTeamId() {
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const { data: teamMember } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)
          .single()
        
        if (teamMember) {
          setTeamId(teamMember.team_id)
        }
      }
    }
    
    fetchTeamId()
  }, [])

  useEffect(() => {
    if (teamId) {
      loadData()
    }
  }, [filters, teamId])

  async function loadData() {
    if (!teamId) return
    
    try {
      setLoading(true)
      const [sessionsData, metricsData, reposData] = await Promise.all([
        getReviewSessions(teamId, filters),
        getReviewMetrics(teamId),
        getRepositories(teamId)
      ])
      setSessions(sessionsData)
      setMetrics(metricsData)
      setRepositories(reposData)
    } catch (error) {
      console.error('Failed to load reviews:', error)
      toast({
        title: 'Error',
        description: 'Failed to load review data',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateReview() {
    if (!newReviewUrl) {
      toast({
        title: 'Error',
        description: 'Please enter a GitHub PR URL',
        variant: 'destructive'
      })
      return
    }

    if (!teamId) {
      toast({
        title: 'Error',
        description: 'Team not found',
        variant: 'destructive'
      })
      return
    }

    try {
      setSubmitting(true)
      const result = await triggerManualReview(teamId, newReviewUrl, {
        style: newReviewStyle
      })
      
      toast({
        title: 'Review Created',
        description: 'PR review has been queued for processing'
      })
      
      setShowNewReview(false)
      setNewReviewUrl('')
      
      // Navigate to the new review
      router.push(`/reviews/${result.sessionId}`)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create review',
        variant: 'destructive'
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PR Reviews</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered pull request reviews with multi-agent analysis
          </p>
        </div>
        
        <Dialog open={showNewReview} onOpenChange={setShowNewReview}>
          <DialogTrigger asChild>
            <Button size="lg" className="gap-2">
              <Plus className="w-4 h-4" />
              New Review
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New PR Review</DialogTitle>
              <DialogDescription>
                Enter a GitHub pull request URL to start an AI-powered review
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="pr-url">Pull Request URL</Label>
                <Input
                  id="pr-url"
                  placeholder="https://github.com/owner/repo/pull/123"
                  value={newReviewUrl}
                  onChange={(e) => setNewReviewUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="review-style">Review Style</Label>
                <Select value={newReviewStyle} onValueChange={(v: any) => setNewReviewStyle(v)}>
                  <SelectTrigger id="review-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quick">Quick Review (2 agents)</SelectItem>
                    <SelectItem value="thorough">Thorough Review (5 agents)</SelectItem>
                    <SelectItem value="security-focused">Security Focused (3 agents)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewReview(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateReview} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Review'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalReviews}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Reviews</CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.activeReviews}</div>
              <p className="text-xs text-muted-foreground">Currently running</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.totalReviews > 0 
                  ? Math.round((metrics.completedReviews / metrics.totalReviews) * 100)
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics.completedReviews} completed
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.averageDuration}m</div>
              <p className="text-xs text-muted-foreground">Per review</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="status-filter">Status</Label>
              <Select 
                value={filters.status || 'all'} 
                onValueChange={(v) => setFilters({...filters, status: v === 'all' ? undefined : v as any})}
              >
                <SelectTrigger id="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="repo-filter">Repository</Label>
              <Select 
                value={filters.repository || 'all'} 
                onValueChange={(v) => setFilters({...filters, repository: v === 'all' ? undefined : v})}
              >
                <SelectTrigger id="repo-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Repositories</SelectItem>
                  {repositories.map(repo => (
                    <SelectItem key={repo} value={repo}>{repo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Review List */}
      <ReviewList 
        sessions={sessions} 
        loading={loading}
        onRefresh={loadData}
      />
    </div>
  )
}