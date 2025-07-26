'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { CodeEntityDetails } from './code-entity-details'
import { 
  Code, 
  FileCode, 
  Search, 
  ChevronRight,
  FunctionSquare,
  Box,
  FileType,
  Braces,
  Component,
  Import,
  Link,
  Loader2
} from 'lucide-react'

interface CodeEntity {
  id: string
  name: string
  type: string
  signature?: string
  lineStart?: number
  lineEnd?: number
  metadata?: any
  file?: {
    id: string
    path: string
    language: string
  }
  projectName: string
}

interface CodeExplorerProps {
  projectName?: string
}

export function CodeExplorer({ projectName }: CodeExplorerProps) {
  const [entities, setEntities] = useState<CodeEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isLinking, setIsLinking] = useState(false)
  const [currentProject, setCurrentProject] = useState<string>('')
  const [selectedEntity, setSelectedEntity] = useState<CodeEntity | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const limit = 50
  const { toast } = useToast()

  useEffect(() => {
    fetchEntities()
  }, [projectName, selectedType, offset])

  const fetchEntities = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (projectName) params.append('projectName', projectName)
      if (selectedType !== 'all') params.append('entityType', selectedType)
      params.append('limit', limit.toString())
      params.append('offset', offset.toString())

      const response = await fetch(`/api/code?${params}`)
      if (!response.ok) throw new Error('Failed to fetch code entities')

      const data = await response.json()
      setEntities(data.entities)
      setTypeCounts(data.typeCounts)
      setTotal(data.total)
      
      // Extract project name from entities if available
      if (data.entities.length > 0 && data.entities[0].projectName) {
        setCurrentProject(data.entities[0].projectName)
      }
    } catch (error) {
      console.error('Error fetching code entities:', error)
      toast({
        title: 'Error',
        description: 'Failed to load code entities',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const linkMemoriesToCode = async () => {
    if (!currentProject) {
      toast({
        title: 'Error',
        description: 'No project selected',
        variant: 'destructive'
      })
      return
    }

    try {
      setIsLinking(true)
      const response = await fetch('/api/code/link-memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: currentProject,
          threshold: 0.7
        })
      })

      if (!response.ok) throw new Error('Failed to link memories')

      const result = await response.json()
      
      if (result.status === 'processing') {
        toast({
          title: 'Linking Started',
          description: 'Memory-code linking is running in the background. This may take a few minutes.'
        })
      } else {
        // Fallback for synchronous processing
        toast({
          title: 'Success',
          description: `Linked ${result.processed || 0} memories to code entities`
        })
      }
    } catch (error) {
      console.error('Error linking memories:', error)
      toast({
        title: 'Error',
        description: 'Failed to link memories to code',
        variant: 'destructive'
      })
    } finally {
      setIsLinking(false)
    }
  }

  const searchCode = async () => {
    if (!searchQuery.trim()) {
      fetchEntities()
      return
    }

    try {
      setLoading(true)
      const response = await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          mode: 'text',
          projectName,
          limit: 50
        })
      })

      if (!response.ok) throw new Error('Failed to search code')

      const data = await response.json()
      setEntities(data.results.map((r: any) => ({ ...r.entity, file: r.file })))
      setTotal(data.results.length)
    } catch (error) {
      console.error('Error searching code:', error)
      toast({
        title: 'Error',
        description: 'Failed to search code',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'function': return <FunctionSquare className="h-4 w-4" />
      case 'class': return <Box className="h-4 w-4" />
      case 'interface': return <FileType className="h-4 w-4" />
      case 'type': return <Braces className="h-4 w-4" />
      case 'jsx_component': return <Component className="h-4 w-4" />
      case 'import': return <Import className="h-4 w-4" />
      default: return <Code className="h-4 w-4" />
    }
  }

  const getEntityColor = (type: string) => {
    switch (type) {
      case 'function': return 'bg-blue-500/10 text-blue-600'
      case 'class': return 'bg-purple-500/10 text-purple-600'
      case 'interface': return 'bg-green-500/10 text-green-600'
      case 'type': return 'bg-yellow-500/10 text-yellow-600'
      case 'jsx_component': return 'bg-pink-500/10 text-pink-600'
      case 'import': return 'bg-gray-500/10 text-gray-600'
      default: return 'bg-gray-500/10 text-gray-600'
    }
  }

  const handleEntityClick = (entity: CodeEntity) => {
    setSelectedEntity(entity)
    setDetailsOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search code entities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchCode()}
              className="pl-10"
            />
          </div>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(typeCounts).map(([type, count]) => (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center gap-2">
                    {getEntityIcon(type)}
                    <span className="capitalize">{type}</span>
                    <span className="text-muted-foreground">({count})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={searchCode} size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </div>
        
        {currentProject && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Project: <span className="font-medium">{currentProject}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={linkMemoriesToCode}
              disabled={isLinking}
              title="Re-link memories to code entities (happens automatically during memory ingestion)"
            >
              {isLinking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link className="h-4 w-4 mr-2" />
                  Re-link Memories
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : entities.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No code entities found</p>
            {projectName && (
              <p className="text-sm text-muted-foreground mt-2">
                Start coding and the entities will appear here
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-2">
            {entities.map((entity) => (
              <Card 
                key={entity.id} 
                className="hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => handleEntityClick(entity)}
              >
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${getEntityColor(entity.type)}`}>
                      {getEntityIcon(entity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{entity.name}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {entity.type}
                        </Badge>
                      </div>
                      {entity.signature && (
                        <p className="text-sm text-muted-foreground font-mono truncate">
                          {entity.signature}
                        </p>
                      )}
                      {entity.file && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <FileCode className="h-3 w-3" />
                          <span className="truncate">{entity.file.path}</span>
                          {entity.lineStart && (
                            <>
                              <span>:</span>
                              <span>{entity.lineStart}</span>
                              {entity.lineEnd && entity.lineEnd !== entity.lineStart && (
                                <span>-{entity.lineEnd}</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {total > limit && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}-{Math.min(offset + limit, total)} of {total} entities
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <CodeEntityDetails
        entity={selectedEntity}
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  )
}