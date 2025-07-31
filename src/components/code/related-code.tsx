'use client'

import { useState, useEffect } from 'react'
import { Link2, Loader2, FileCode, FunctionSquare, Box } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

interface CodeEntity {
  id: string
  name: string
  type: string
  file_path: string
  line_start?: number
  line_end?: number
  content?: string
  summary?: string
}

interface RelatedCodeProps {
  entityId: string
  onEntityClick?: (entity: CodeEntity) => void
}

export function RelatedCode({ entityId, onEntityClick }: RelatedCodeProps) {
  const [relatedEntities, setRelatedEntities] = useState<{
    parent?: CodeEntity
    sameFile: { before: CodeEntity[], after: CodeEntity[] }
    dependencies: CodeEntity[]
    usages: CodeEntity[]
    memories: any[]
  }>({
    sameFile: { before: [], after: [] },
    dependencies: [],
    usages: [],
    memories: []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)

  useEffect(() => {
    const loadRelatedCode = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/code/${entityId}/related`)
        if (!response.ok) throw new Error('Failed to load related code')
        
        const { related } = await response.json()
        setRelatedEntities(related)
        setHasChecked(true)
      } catch (error) {
        console.error('Failed to load related code:', error)
        setHasChecked(true)
      } finally {
        setIsLoading(false)
      }
    }

    if (isExpanded) {
      loadRelatedCode()
    }
  }, [entityId, isExpanded])

  // Calculate total related items
  const totalRelated = 
    (relatedEntities.parent ? 1 : 0) +
    relatedEntities.sameFile.before.length +
    relatedEntities.sameFile.after.length +
    relatedEntities.dependencies.length +
    relatedEntities.usages.length +
    relatedEntities.memories.length

  // Don't show the button if we've checked and found no related content
  if (!isExpanded && hasChecked && totalRelated === 0) {
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
        Show Related Code
      </Button>
    )
  }

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'function':
        return <FunctionSquare className="h-3 w-3" />
      case 'class':
        return <Box className="h-3 w-3" />
      default:
        return <FileCode className="h-3 w-3" />
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Related Code
          {totalRelated > 0 && (
            <span className="text-xs text-muted-foreground">
              ({totalRelated})
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
        ) : totalRelated === 0 ? (
          <p className="text-sm text-muted-foreground">No related code found</p>
        ) : (
          <div className="space-y-4">
            {/* Parent class/module */}
            {relatedEntities.parent && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Parent</p>
                <button
                  onClick={() => onEntityClick?.(relatedEntities.parent!)}
                  className="w-full text-left p-2 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {getEntityIcon(relatedEntities.parent.type)}
                    <span className="font-medium text-sm">{relatedEntities.parent.name}</span>
                    <Badge variant="outline" className="text-xs ml-auto">
                      {relatedEntities.parent.type}
                    </Badge>
                  </div>
                </button>
              </div>
            )}

            {/* Same file context */}
            {(relatedEntities.sameFile.before.length > 0 || relatedEntities.sameFile.after.length > 0) && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">In Same File</p>
                <div className="space-y-1">
                  {relatedEntities.sameFile.before.map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => onEntityClick?.(entity)}
                      className="w-full text-left p-2 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {getEntityIcon(entity.type)}
                        <span>{entity.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          lines {entity.line_start}-{entity.line_end}
                        </span>
                      </div>
                    </button>
                  ))}
                  {relatedEntities.sameFile.after.map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => onEntityClick?.(entity)}
                      className="w-full text-left p-2 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {getEntityIcon(entity.type)}
                        <span>{entity.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          lines {entity.line_start}-{entity.line_end}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dependencies */}
            {relatedEntities.dependencies.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Dependencies</p>
                <div className="space-y-1">
                  {relatedEntities.dependencies.map((entity: any) => (
                    <button
                      key={entity.id}
                      onClick={() => onEntityClick?.(entity)}
                      className="w-full text-left p-2 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {getEntityIcon(entity.type)}
                        <span>{entity.name}</span>
                        <Badge variant="secondary" className="text-xs ml-auto">
                          {entity.relationshipType?.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {entity.file_path}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Usages */}
            {relatedEntities.usages.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Used By</p>
                <div className="space-y-1">
                  {relatedEntities.usages.map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => onEntityClick?.(entity)}
                      className="w-full text-left p-2 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {getEntityIcon(entity.type)}
                        <span>{entity.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {entity.file_path}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Related memories */}
            {relatedEntities.memories.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Related Memories ({relatedEntities.memories.length})
                </p>
                <div className="space-y-1">
                  {relatedEntities.memories.slice(0, 3).map((memory: any) => (
                    <div
                      key={memory.id}
                      className="p-2 rounded-lg border bg-muted/50"
                    >
                      <p className="text-xs text-muted-foreground">
                        {new Date(memory.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-sm line-clamp-2 mt-1">
                        {memory.content.substring(0, 150)}...
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}