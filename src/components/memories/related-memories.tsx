'use client'

import { useState, useEffect } from 'react'
import { Link2, Loader2 } from 'lucide-react'
import { Memory, memoriesAPI } from '@/lib/api/memories'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface RelatedMemoriesProps {
  memoryId: string
  onMemoryClick?: (memory: Memory) => void
}

export function RelatedMemories({ memoryId, onMemoryClick }: RelatedMemoriesProps) {
  const [relatedMemories, setRelatedMemories] = useState<Memory[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)

  useEffect(() => {
    const loadRelatedMemories = async () => {
      setIsLoading(true)
      try {
        const memories = await memoriesAPI.getRelatedMemories(memoryId, 8)
        setRelatedMemories(memories)
        setHasChecked(true)
      } catch (error) {
        console.error('Failed to load related memories:', error)
        setHasChecked(true)
      } finally {
        setIsLoading(false)
      }
    }

    if (isExpanded) {
      loadRelatedMemories()
    }
  }, [memoryId, isExpanded])

  // Don't show the button if we've checked and found no related content
  if (!isExpanded && hasChecked && relatedMemories.length === 0) {
    return null
  }

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="w-full"
      >
        <Link2 className="h-4 w-4 mr-2" />
        Show Related Content
      </Button>
    )
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Related Content
          {relatedMemories.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({relatedMemories.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : relatedMemories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No related memories found</p>
        ) : (
          <div className="space-y-2">
            {relatedMemories.map((memory) => {
              // Extract first meaningful sentence or paragraph
              const preview = memory.content.split(/[.!?]\s/)[0] + 
                (memory.content.includes('.') ? '.' : '') || 
                memory.content.substring(0, 150) + '...'
              
              return (
                <button
                  key={memory.id}
                  onClick={() => onMemoryClick?.(memory)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{memory.chunk_id.slice(0, 8)}</span>
                      <span>•</span>
                      <span>{new Date(memory.created_at).toLocaleDateString()}</span>
                      {memory.similarity && (
                        <>
                          <span>•</span>
                          <span className="text-green-600 dark:text-green-400">
                            {(memory.similarity * 100).toFixed(0)}% similar
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm line-clamp-2">{preview}</p>
                    {memory.metadata?.sessionId && (
                      <p className="text-xs text-muted-foreground/70 italic">
                        From same conversation
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}