'use client'

import { useState, useEffect } from 'react'
import { X, FileCode, FunctionSquare, Box, FileType, Braces, Component, Import, Code, Brain, Link } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'

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

interface LinkedMemory {
  id: string
  chunkId: string
  content: string
  metadata?: any
  similarity?: number
  relationshipType?: string
  referenceText?: string
  linkedAt?: string
  createdAt?: string
  type?: string
  isNameMatch?: boolean
}

interface CodeEntityDetailsProps {
  entity: CodeEntity | null
  isOpen: boolean
  onClose: () => void
}

export function CodeEntityDetails({ entity, isOpen, onClose }: CodeEntityDetailsProps) {
  const [linkedMemories, setLinkedMemories] = useState<LinkedMemory[]>([])
  const [loadingMemories, setLoadingMemories] = useState(false)

  useEffect(() => {
    if (entity && isOpen) {
      fetchLinkedMemories()
    }
  }, [entity, isOpen])

  const fetchLinkedMemories = async () => {
    if (!entity) return
    
    try {
      setLoadingMemories(true)
      const response = await fetch(`/api/code/${entity.id}/linked-memories`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch linked memories')
      }
      
      const data = await response.json()
      setLinkedMemories(data.memories || [])
    } catch (error) {
      console.error('Failed to fetch linked memories:', error)
      setLinkedMemories([])
    } finally {
      setLoadingMemories(false)
    }
  }

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'function': return <FunctionSquare className="h-5 w-5" />
      case 'class': return <Box className="h-5 w-5" />
      case 'interface': return <FileType className="h-5 w-5" />
      case 'type': return <Braces className="h-5 w-5" />
      case 'jsx_component': return <Component className="h-5 w-5" />
      case 'import': return <Import className="h-5 w-5" />
      default: return <Code className="h-5 w-5" />
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

  if (!entity) return null

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[500px] sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getEntityColor(entity.type)}`}>
              {getEntityIcon(entity.type)}
            </div>
            <div className="flex-1">
              <div className="font-mono text-lg">{entity.name}</div>
              <div className="text-sm text-muted-foreground font-normal">
                {entity.file?.path}
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="details" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="memories">
              Linked Memories
              {linkedMemories.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1">
                  {linkedMemories.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Type</h3>
              <Badge variant="secondary" className="capitalize">
                {entity.type}
              </Badge>
            </div>

            {entity.signature && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Signature</h3>
                <code className="text-sm bg-muted p-2 rounded block overflow-x-auto">
                  {entity.signature}
                </code>
              </div>
            )}

            {entity.file && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Location</h3>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <FileCode className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono">{entity.file.path}</span>
                  </div>
                  {entity.lineStart && (
                    <div className="text-sm text-muted-foreground ml-6">
                      Lines {entity.lineStart}
                      {entity.lineEnd && entity.lineEnd !== entity.lineStart && (
                        <span>-{entity.lineEnd}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {entity.metadata && Object.keys(entity.metadata).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Metadata</h3>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify(entity.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Project</h3>
              <p className="text-sm">{entity.projectName}</p>
            </div>
          </TabsContent>

          <TabsContent value="memories" className="mt-4">
            {loadingMemories ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : linkedMemories.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {linkedMemories.map((memory) => (
                    <div
                      key={memory.id}
                      className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Brain className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          {memory.relationshipType && (
                            <Badge variant="secondary" className="text-xs">
                              {memory.relationshipType === 'REFERENCES_CODE' ? 'Code Ref' :
                               memory.relationshipType === 'REFERENCES_FILE' ? 'File Ref' :
                               memory.relationshipType === 'NAME_MATCH' ? 'Name Match' :
                               'Semantic'}
                            </Badge>
                          )}
                        </div>
                        {memory.similarity !== undefined && (
                          <Badge variant="outline" className="text-xs">
                            {Math.round(memory.similarity * 100)}% match
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-foreground line-clamp-4 mb-2">
                        {memory.content}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {memory.referenceText && (
                          <span className="font-mono bg-muted px-1 rounded">
                            {memory.referenceText}
                          </span>
                        )}
                        {memory.createdAt && (
                          <span>
                            {new Date(memory.createdAt).toLocaleDateString()}
                          </span>
                        )}
                        {memory.type && (
                          <Badge variant="outline" className="text-xs">
                            {memory.type}
                          </Badge>
                        )}
                      </div>
                      
                      {memory.isNameMatch && (
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          This memory mentions "{entity.name}" but hasn't been explicitly linked yet
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8">
                <Link className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No memories linked to this code entity yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use "Link Memories to Code" to find related memories
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}