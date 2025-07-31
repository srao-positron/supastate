"use client"

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Loader2, FileCode, Brain, Calendar, FolderOpen } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface ContentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentUrl: string | null
  type: 'memory' | 'code' | null
}

interface ContentData {
  id: string
  type: string
  content: string
  title?: string
  occurred_at?: string
  created_at: string
  path?: string
  language?: string
  project?: string
  relationships: Array<{
    id: string
    type: string
    relationship: string
    title: string | null
    snippet: string | null
  }>
  session?: {
    id: string
    started_at: string
    ended_at: string
  }
}

export function ContentModal({ open, onOpenChange, contentUrl, type }: ContentModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ContentData | null>(null)

  useEffect(() => {
    if (open && contentUrl) {
      fetchContent()
    }
  }, [open, contentUrl])

  const fetchContent = async () => {
    if (!contentUrl) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(contentUrl)
      if (!response.ok) {
        throw new Error('Failed to fetch content')
      }
      const contentData = await response.json()
      setData(contentData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString // Return original string if invalid
      }
      return formatDistanceToNow(date, { addSuffix: true })
    } catch (error) {
      console.error('Date formatting error:', error, dateString)
      return dateString
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">
            Error: {error}
          </div>
        ) : data ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {data.type === 'memory' ? (
                  <Brain className="h-5 w-5" />
                ) : (
                  <FileCode className="h-5 w-5" />
                )}
                {data.title || (data.type === 'code' ? data.path : 'Untitled')}
              </DialogTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {data.type === 'memory' && data.occurred_at && (
                  <>
                    <Calendar className="h-3 w-3" />
                    {formatDate(data.occurred_at)}
                  </>
                )}
                {data.type === 'code' && data.project && (
                  <>
                    <FolderOpen className="h-3 w-3" />
                    {data.project}
                  </>
                )}
                {data.language && (
                  <Badge variant="secondary">{data.language}</Badge>
                )}
              </div>
            </DialogHeader>

            <ScrollArea className="mt-4 max-h-[60vh]">
              <div className="space-y-4">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-lg">
                    {data.content}
                  </pre>
                </div>

                {data.relationships.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-2">Related Items</h3>
                    <div className="space-y-2">
                      {data.relationships.map((rel) => (
                        <div key={rel.id} className="flex items-start gap-2 text-sm">
                          <Badge variant="outline" className="shrink-0">
                            {rel.type}
                          </Badge>
                          <div className="flex-1">
                            <div className="font-medium">{rel.title || 'Untitled'}</div>
                            {rel.snippet && (
                              <div className="text-muted-foreground line-clamp-2 mt-1">
                                {rel.snippet}
                              </div>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {rel.relationship}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.session && (
                  <div className="mt-6 p-3 bg-muted rounded-lg">
                    <h3 className="text-sm font-semibold mb-2">Session Info</h3>
                    <div className="text-sm text-muted-foreground">
                      <div>Started: {formatDate(data.session.started_at)}</div>
                      {data.session.ended_at && (
                        <div>Ended: {formatDate(data.session.ended_at)}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}