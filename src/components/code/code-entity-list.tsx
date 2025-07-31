import { CodeEntity } from '@/lib/api/code'
import { Card, CardContent } from '@/components/ui/card'
import { FileCode2, FunctionSquare, Box, Component, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface CodeEntityListProps {
  entities: CodeEntity[]
  selectedEntity: CodeEntity | null
  onEntityClick: (entity: CodeEntity) => void
  isLoading?: boolean
}

export function CodeEntityList({ 
  entities, 
  selectedEntity, 
  onEntityClick,
  isLoading 
}: CodeEntityListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (entities.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            No code entities found. Try adjusting your search criteria.
          </p>
        </CardContent>
      </Card>
    )
  }

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'function':
        return FunctionSquare
      case 'class':
        return Box
      case 'component':
        return Component
      case 'file':
        return FileCode2
      default:
        return FileText
    }
  }

  return (
    <div className="space-y-2">
      {entities.map((entity) => {
        const Icon = getEntityIcon(entity.type)
        const isSelected = selectedEntity?.id === entity.id

        return (
          <Card
            key={entity.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              isSelected && "ring-2 ring-primary"
            )}
            onClick={() => onEntityClick(entity)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold truncate">{entity.name}</h4>
                  <p className="text-sm text-muted-foreground truncate">
                    {entity.file?.path || 'Unknown location'}
                  </p>
                  {entity.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {entity.summary}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}