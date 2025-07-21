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
  const [isLoading, setIsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    const loadRelatedMemories = async () => {
      setIsLoading(true)
      try {
        const memories = await memoriesAPI.getRelatedMemories(memoryId, 5)
        setRelatedMemories(memories)
      } catch (error) {
        console.error('Failed to load related memories:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (isExpanded) {
      loadRelatedMemories()
    }
  }, [memoryId, isExpanded])

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="w-full"
      >
        <Link2 className="h-4 w-4 mr-2" />
        Show Related Memories
      </Button>
    )
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Related Memories
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
            {relatedMemories.map((memory) => (
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
                  </div>
                  <p className="text-sm line-clamp-2">{memory.content}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}