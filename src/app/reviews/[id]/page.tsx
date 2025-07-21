'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ReviewSession } from '@/components/reviews/review-session'
import { AgentPanel } from '@/components/reviews/agent-panel'
import { ReviewTimeline } from '@/components/reviews/review-timeline'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { 
  getReviewSession, 
  getReviewEvents, 
  subscribeToReviewEvents,
  subscribeToSessionUpdates,
  cancelReview 
} from '@/lib/api/reviews'
import { ArrowLeft, ExternalLink, StopCircle, RefreshCw } from 'lucide-react'

export default function ReviewDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const sessionId = params.id as string
  
  const [session, setSession] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [activeTab, setActiveTab] = useState('timeline')

  useEffect(() => {
    loadSession()
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return

    // Subscribe to real-time events
    const unsubscribeEvents = subscribeToReviewEvents(sessionId, (event) => {
      setEvents(prev => [...prev, event])
    })

    const unsubscribeSession = subscribeToSessionUpdates(sessionId, (updatedSession) => {
      setSession(updatedSession)
    })

    return () => {
      unsubscribeEvents()
      unsubscribeSession()
    }
  }, [sessionId])

  async function loadSession() {
    try {
      setLoading(true)
      const [sessionData, eventsData] = await Promise.all([
        getReviewSession(sessionId),
        getReviewEvents(sessionId)
      ])
      setSession(sessionData)
      setEvents(eventsData)
    } catch (error) {
      console.error('Failed to load review session:', error)
      toast({
        title: 'Error',
        description: 'Failed to load review details',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Are you sure you want to cancel this review?')) return

    try {
      setCancelling(true)
      await cancelReview(sessionId)
      toast({
        title: 'Review Cancelled',
        description: 'The review has been cancelled'
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel review',
        variant: 'destructive'
      })
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertDescription>Review session not found</AlertDescription>
        </Alert>
      </div>
    )
  }

  const isActive = session.status === 'running' || session.status === 'pending'

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/reviews')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {session.repository} #{session.pr_number}
            </h1>
            <p className="text-muted-foreground">
              {session.pr_metadata?.title || 'Pull Request Review'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isActive && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={cancelling}
              className="gap-2"
            >
              <StopCircle className="w-4 h-4" />
              {cancelling ? 'Cancelling...' : 'Cancel Review'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(session.pr_url, '_blank')}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            View PR
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Review Session */}
        <div className="lg:col-span-2">
          <ReviewSession session={session} events={events} />
        </div>

        {/* Right Column - Agents & Timeline */}
        <div className="space-y-6">
          {/* Agent Panel */}
          <AgentPanel agents={session.review_agents} events={events} />

          {/* Timeline Tabs */}
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="discussion">Discussion</TabsTrigger>
                </TabsList>
                
                <TabsContent value="timeline" className="mt-4">
                  <ReviewTimeline events={events} />
                </TabsContent>
                
                <TabsContent value="discussion" className="mt-4">
                  <ReviewTimeline 
                    events={events.filter(e => 
                      e.event_type === 'discussion_turn' || 
                      e.event_type === 'agent_thought'
                    )} 
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}