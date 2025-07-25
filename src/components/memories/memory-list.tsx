'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { MemoryCard } from './memory-card'
import { Memory } from '@/lib/api/memories'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

interface MemoryListProps {
  memories: Memory[]
  isLoading?: boolean
  error?: string | null
  hasMore?: boolean
  onLoadMore?: () => void
  showSimilarity?: boolean
  showRelated?: boolean
  currentPage?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  expandedMemoryId?: string | null
  onMemoryExpand?: (memoryId: string | null) => void
  onRelatedMemoryClick?: (memory: Memory) => void
}

export function MemoryList({
  memories,
  isLoading = false,
  error = null,
  hasMore = false,
  onLoadMore,
  showSimilarity = false,
  showRelated = false,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  expandedMemoryId,
  onMemoryExpand,
  onRelatedMemoryClick,
}: MemoryListProps) {
  const [localExpandedId, setLocalExpandedId] = useState<string | null>(null)
  const observerTarget = useRef<HTMLDivElement>(null)

  const expandedId = expandedMemoryId !== undefined ? expandedMemoryId : localExpandedId

  const handleExpand = (memoryId: string) => {
    const newExpandedId = expandedId === memoryId ? null : memoryId
    if (onMemoryExpand) {
      onMemoryExpand(newExpandedId)
    } else {
      setLocalExpandedId(newExpandedId)
    }
  }

  // Infinite scroll observer
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [onLoadMore, hasMore, isLoading])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (isLoading && memories.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </Card>
        ))}
      </div>
    )
  }

  if (!isLoading && memories.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="max-w-md mx-auto">
          <p className="text-lg font-medium text-muted-foreground">No memories found</p>
          <p className="text-sm text-muted-foreground mt-2">
            {error ? 
              'There was an issue connecting to the memory database. Please check that Neo4j is running and try again.' :
              'Start creating memories by using the Camille extension in VS Code while working on your projects.'
            }
          </p>
          {!error && (
            <p className="text-sm text-muted-foreground mt-4">
              Memories are automatically created when you:
              <br />• Have conversations about code in VS Code
              <br />• Debug issues and find solutions
              <br />• Learn new concepts and patterns
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {memories.map((memory) => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            expanded={expandedId === memory.id}
            onToggleExpand={() => handleExpand(memory.id)}
            showSimilarity={showSimilarity}
            showRelated={showRelated}
            onRelatedMemoryClick={onRelatedMemoryClick}
          />
        ))}
      </div>

      {/* Pagination controls */}
      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {[...Array(Math.min(totalPages, 5))].map((_, i) => {
              let pageNum
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }

              if (pageNum < 1 || pageNum > totalPages) return null

              return (
                <Button
                  key={pageNum}
                  variant={pageNum === currentPage ? 'default' : 'outline'}
                  size="sm"
                  className="w-8 h-8 p-0"
                  onClick={() => onPageChange(pageNum)}
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Infinite scroll trigger */}
      {onLoadMore && hasMore && (
        <div ref={observerTarget} className="flex justify-center py-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading more memories...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Missing Card import fix
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}