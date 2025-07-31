'use client'

import { useState, useEffect, useCallback } from 'react'
import { Code2, Search } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CodeEntityList } from '@/components/code/code-entity-list'
import { useToast } from '@/hooks/use-toast'
import { codeAPI, type CodeEntity } from '@/lib/api/code'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

export default function CodeSearchPage() {
  const [entities, setEntities] = useState<CodeEntity[]>([])
  const [selectedEntity, setSelectedEntity] = useState<CodeEntity | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [entityType, setEntityType] = useState<string>('all')
  const [projects, setProjects] = useState<string[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const { toast } = useToast()

  // Load initial data
  useEffect(() => {
    loadProjects()
    searchEntities()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadProjects = async () => {
    try {
      const projectList = await codeAPI.getProjects()
      setProjects(projectList)
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  const searchEntities = useCallback(async () => {
    setIsLoading(true)
    setSelectedEntity(null)
    
    try {
      const results = await codeAPI.searchEntities({
        query: searchQuery,
        type: entityType === 'all' ? undefined : entityType,
        project: selectedProject === 'all' ? undefined : selectedProject,
        limit: 100
      })
      setEntities(results)
    } catch (error) {
      console.error('Failed to search entities:', error)
      toast({
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Failed to search code entities',
        variant: 'destructive',
      })
      setEntities([])
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, entityType, selectedProject, toast])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    searchEntities()
  }

  const handleEntityClick = (entity: CodeEntity) => {
    setSelectedEntity(entity)
  }

  const getEntityStats = () => {
    const stats = {
      total: entities.length,
      functions: 0,
      classes: 0,
      components: 0,
      files: 0,
      other: 0
    }

    entities.forEach(entity => {
      if (entity.type === 'function') stats.functions++
      else if (entity.type === 'class') stats.classes++
      else if (entity.type === 'component') stats.components++
      else if (entity.type === 'file') stats.files++
      else stats.other++
    })

    return stats
  }

  const stats = getEntityStats()

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-6 w-6" />
            Code Search
          </CardTitle>
          <CardDescription>
            Search and explore code entities across your projects
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search Form */}
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="search"
                placeholder="Search functions, classes, components..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading}>
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="entity-type">Entity Type</Label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger id="entity-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="function">Functions</SelectItem>
                    <SelectItem value="class">Classes</SelectItem>
                    <SelectItem value="component">Components</SelectItem>
                    <SelectItem value="file">Files</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {projects.length > 0 && (
                <div className="flex-1">
                  <Label htmlFor="project">Project</Label>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger id="project">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projects.map(project => (
                        <SelectItem key={project} value={project}>
                          {project}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </form>

          {/* Results Stats */}
          {entities.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Found {stats.total} entities:</span>
              {stats.functions > 0 && <span>{stats.functions} functions</span>}
              {stats.classes > 0 && <span>{stats.classes} classes</span>}
              {stats.components > 0 && <span>{stats.components} components</span>}
              {stats.files > 0 && <span>{stats.files} files</span>}
              {stats.other > 0 && <span>{stats.other} other</span>}
            </div>
          )}

          {/* Results and Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Search Results</h3>
              <CodeEntityList
                entities={entities}
                selectedEntity={selectedEntity}
                onEntityClick={handleEntityClick}
                isLoading={isLoading}
              />
            </div>

            {selectedEntity && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Entity Details</h3>
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-lg">{selectedEntity.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {selectedEntity.type} • {selectedEntity.file?.path || 'Unknown location'}
                        </p>
                      </div>
                      {selectedEntity.summary && (
                        <div>
                          <h5 className="font-medium mb-1">Summary</h5>
                          <p className="text-sm text-muted-foreground">{selectedEntity.summary}</p>
                        </div>
                      )}
                      {selectedEntity.content && (
                        <div>
                          <h5 className="font-medium mb-2">Code</h5>
                          <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                            <code className="text-sm">{selectedEntity.content}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}