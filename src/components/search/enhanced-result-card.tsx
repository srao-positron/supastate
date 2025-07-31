'use client'

import { useState, useEffect } from 'react'
import { UnifiedSearchResult } from '@/lib/search/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Brain, 
  Code, 
  Calendar, 
  ChevronDown, 
  ChevronUp,
  FileCode,
  Eye,
  Sparkles,
  Hash,
  Loader2,
  Clock,
  GitBranch,
  Link as LinkIcon,
  ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ContentModal } from './content-modal'

interface EnhancedResultCardProps {
  result: UnifiedSearchResult
  query: string
}

interface RelatedContent {
  memories: Array<{
    id: string
    title?: string
    content: string
    occurred_at?: string
    similarity_score?: number
    relationship_type?: string
  }>
  code: Array<{
    id: string
    path: string
    content?: string
    language?: string
    relationship_type?: string
    line_number?: number
  }>
}

export function EnhancedResultCard({ result, query }: EnhancedResultCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalContent, setModalContent] = useState<UnifiedSearchResult | null>(null)
  const [relatedContent, setRelatedContent] = useState<RelatedContent | null>(null)
  const [loadingRelated, setLoadingRelated] = useState(false)
  
  // Fetch related content when expanded
  useEffect(() => {
    if (expanded && !relatedContent && !loadingRelated) {
      fetchRelatedContent()
    }
  }, [expanded])
  
  const fetchRelatedContent = async () => {
    setLoadingRelated(true)
    try {
      const endpoint = result.type === 'memory' 
        ? `/api/memories/${result.id}/related`
        : `/api/code/${result.id}/related`
        
      const response = await fetch(endpoint)
      if (response.ok) {
        const data = await response.json()
        
        // Transform the data based on the type
        if (result.type === 'memory') {
          // Memory API returns nested structure under 'related'
          const related = data.related || {}
          const memories: RelatedContent['memories'] = []
          
          // Add temporal memories
          if (related.temporal) {
            memories.push(...related.temporal.map((m: any) => ({
              ...m,
              relationship_type: m.relationshipType || 'temporal'
            })))
          }
          
          // Add semantic memories
          if (related.semantic) {
            memories.push(...related.semantic.map((m: any) => ({
              ...m,
              similarity_score: m.similarity,
              relationship_type: 'semantic'
            })))
          }
          
          // Add conceptual memories
          if (related.conceptual) {
            memories.push(...related.conceptual.map((m: any) => ({
              ...m,
              relationship_type: 'conceptual'
            })))
          }
          
          setRelatedContent({
            memories: memories.slice(0, 10),
            code: related.code || []
          })
        } else {
          // Code API returns nested structure under 'related'
          const related = data.related || {}
          const transformedCode: RelatedContent['code'] = []
          
          // Add definitions if exist
          if (related.definitions && related.definitions.length > 0) {
            transformedCode.push(...related.definitions.map((d: any) => ({
              id: d.id || `${d.nodeType}-${d.name}`,
              path: d.displayName || d.name,
              content: d.signature || d.nodeType,
              language: d.nodeType?.toLowerCase(),
              relationship_type: d.nodeType === 'Function' ? 'defines_function' : 'defines_class',
              line_number: d.line_start
            })))
          }
          
          // Add same file entities
          if (related.sameFile) {
            const sameFileEntities = [
              ...(related.sameFile.before || []).map((e: any) => ({
                ...e,
                relationship_type: 'same_file'
              })),
              ...(related.sameFile.after || []).map((e: any) => ({
                ...e,
                relationship_type: 'same_file'
              }))
            ]
            transformedCode.push(...sameFileEntities.slice(0, 5))
          }
          
          // Add dependencies
          if (related.dependencies) {
            transformedCode.push(...related.dependencies.map((d: any) => ({
              id: d.id,
              path: d.path || d.file_path,
              content: d.name || d.content,
              language: d.language,
              relationship_type: d.relationshipType || 'dependency'
            })))
          }
          
          // Add usages
          if (related.usages) {
            transformedCode.push(...related.usages.map((u: any) => ({
              id: u.id,
              path: u.path || u.file_path,
              content: u.name || u.content,
              language: u.language,
              relationship_type: 'usage'
            })))
          }
          
          setRelatedContent({
            memories: related.memories || [],
            code: transformedCode
          })
        }
      }
    } catch (error) {
      console.error('Failed to fetch related content:', error)
    } finally {
      setLoadingRelated(false)
    }
  }
  
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a')
    } catch {
      return dateStr
    }
  }
  
  const getIcon = () => {
    switch (result.type) {
      case 'memory':
        return <Brain className="h-5 w-5" />
      case 'code':
        return <Code className="h-5 w-5" />
      default:
        return <Sparkles className="h-5 w-5" />
    }
  }
  
  const getMatchTypeBadge = () => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      semantic: 'default',
      keyword: 'secondary',
      relationship: 'outline',
      pattern: 'outline'
    }
    
    return (
      <Badge variant={variants[result.metadata.matchType] || 'secondary'} className="text-xs">
        {result.metadata.matchType}
      </Badge>
    )
  }
  
  const getRelationshipIcon = (type: string) => {
    switch (type) {
      case 'temporal':
      case 'PRECEDED_BY':
      case 'FOLLOWED_BY':
        return <Clock className="h-3 w-3" />
      case 'parent':
      case 'child':
      case 'same_file':
        return <GitBranch className="h-3 w-3" />
      case 'dependency':
      case 'usage':
        return <LinkIcon className="h-3 w-3" />
      case 'defines_function':
        return <Hash className="h-3 w-3" />
      case 'defines_class':
        return <FileCode className="h-3 w-3" />
      default:
        return <Brain className="h-3 w-3" />
    }
  }
  
  const hasRelatedContent = relatedContent && (
    (relatedContent.memories && relatedContent.memories.length > 0) || 
    (relatedContent.code && relatedContent.code.length > 0)
  );
  
  return (
    <>
      <Card className={cn(
        "transition-all duration-200 hover:shadow-md",
        expanded && "ring-2 ring-primary/20"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className={cn(
                "p-2 rounded-lg",
                result.type === 'memory' ? "bg-blue-500/10 text-blue-600" : "bg-green-500/10 text-green-600"
              )}>
                {getIcon()}
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base line-clamp-1">
                  {result.content.title}
                </h3>
                
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  {result.metadata.timestamp && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(result.metadata.timestamp)}</span>
                    </div>
                  )}
                  
                  {result.metadata.project && (
                    <div className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      <span>{result.metadata.project}</span>
                    </div>
                  )}
                  
                  {result.metadata.language && (
                    <Badge variant="outline" className="text-xs">
                      {result.metadata.language}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {getMatchTypeBadge()}
              <Badge variant="outline" className="text-xs">
                {(result.metadata.score * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Primary Highlight */}
          <div className="space-y-2 mb-4">
            {result.content.highlights && result.content.highlights[0] && (
              <p 
                className="text-sm text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: result.content.highlights[0] }}
              />
            )}
          </div>
          
          {/* Related Content - Expanded View */}
          {expanded && relatedContent && hasRelatedContent && (
            <div className="space-y-3 pt-3 border-t">
              {relatedContent.memories.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Related Memories ({relatedContent.memories.length})
                  </p>
                  <div className="space-y-2">
                    {relatedContent.memories.map((mem) => (
                      <button
                        key={mem.id}
                        className="w-full flex items-start gap-2 text-sm p-2 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors text-left"
                        onClick={() => {
                          // Create a synthetic search result for the memory and open it in modal
                          const memoryResult: UnifiedSearchResult = {
                            id: mem.id,
                            type: 'memory',
                            content: {
                              title: mem.title || 'Related Memory',
                              snippet: mem.content,
                              highlights: []
                            },
                            metadata: {
                              matchType: 'relationship',
                              timestamp: mem.occurred_at,
                              score: mem.similarity_score || 0
                            },
                            entity: mem,
                            relationships: {
                              memories: [],
                              code: [],
                              patterns: []
                            },
                            contentUrl: `/api/content/memory/${mem.id}`
                          }
                          setModalContent(memoryResult)
                          setModalOpen(true)
                        }}
                      >
                        {getRelationshipIcon(mem.relationship_type || 'semantic')}
                        <div className="flex-1">
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {mem.content}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {mem.similarity_score && (
                              <Badge variant="outline" className="text-xs">
                                {(mem.similarity_score * 100).toFixed(0)}% similar
                              </Badge>
                            )}
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {relatedContent.code.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Related Code ({relatedContent.code.length})
                  </p>
                  <div className="space-y-2">
                    {relatedContent.code.map((code) => (
                      <button
                        key={code.id}
                        className="w-full flex items-start gap-2 text-sm p-2 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors text-left"
                        onClick={() => {
                          // Create a synthetic search result for the code and open it in modal
                          const codeResult: UnifiedSearchResult = {
                            id: code.id,
                            type: 'code',
                            content: {
                              title: code.path,
                              snippet: code.content || 'Code entity',
                              highlights: []
                            },
                            metadata: {
                              matchType: 'relationship',
                              language: code.language,
                              score: 0.8
                            },
                            entity: code,
                            relationships: {
                              memories: [],
                              code: [],
                              patterns: []
                            },
                            contentUrl: `/api/content/code/${code.id}`
                          }
                          setModalContent(codeResult)
                          setModalOpen(true)
                        }}
                      >
                        {getRelationshipIcon(code.relationship_type || 'related')}
                        <div className="flex-1">
                          <div className="font-mono text-xs">{code.path}</div>
                          {code.line_number && (
                            <span className="text-xs text-muted-foreground">Line {code.line_number}</span>
                          )}
                          {code.content && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mt-1 font-mono">
                              {code.content}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {code.language && (
                            <Badge variant="outline" className="text-xs">
                              {code.language}
                            </Badge>
                          )}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Loading Related Content */}
          {expanded && loadingRelated && (
            <div className="flex items-center justify-center py-4 border-t">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Loading related content...</span>
            </div>
          )}
          
          {/* No Related Content Message */}
          {expanded && !loadingRelated && relatedContent && !hasRelatedContent && (
            <div className="flex items-center justify-center py-4 border-t text-sm text-muted-foreground">
              No related content found
            </div>
          )}
          
          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-xs"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show Related
                </>
              )}
            </Button>
            
            {(result.type === 'memory' || result.type === 'code') && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs"
                onClick={() => {
                  setModalContent(result)
                  setModalOpen(true)
                }}
              >
                <Eye className="h-3 w-3 mr-1" />
                View Full
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      
      <ContentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        contentUrl={modalContent?.contentUrl || result.contentUrl}
        type={(modalContent?.type || result.type) === 'pattern' ? null : (modalContent?.type || result.type) as 'memory' | 'code'}
      />
    </>
  )
}