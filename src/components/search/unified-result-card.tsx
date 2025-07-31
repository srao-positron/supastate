'use client'

import { useState } from 'react'
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
  Hash
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ContentModal } from './content-modal'

interface UnifiedResultCardProps {
  result: UnifiedSearchResult
  query: string
}

export function UnifiedResultCard({ result, query }: UnifiedResultCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  
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
        
        {/* Relationships */}
        {result.relationships && (
          result.relationships.memories?.length > 0 || 
          result.relationships.code?.length > 0 || 
          result.relationships.patterns?.length > 0) && (
          <div className="space-y-3 pt-3 border-t">
            {result.relationships.memories?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Related Memories ({result.relationships.memories.length})
                </p>
                <div className="space-y-1">
                  {(result.relationships.memories || []).slice(0, expanded ? undefined : 2).map((mem, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Brain className="h-3 w-3 text-muted-foreground" />
                      <span className="line-clamp-1">{mem.snippet}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {result.relationships.code?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Related Code ({result.relationships.code.length})
                </p>
                <div className="space-y-1">
                  {(result.relationships.code || []).slice(0, expanded ? undefined : 2).map((code, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <FileCode className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-xs">{code.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {result.relationships.patterns?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(result.relationships.patterns || []).map((pattern, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {pattern.type}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Actions */}
        <div className="flex items-center justify-between mt-4">
          {/* Only show expand button if there are relationships to show */}
          {result.relationships && (
            (result.relationships.memories?.length > 2 || 
             result.relationships.code?.length > 2 || 
             result.relationships.patterns?.length > 0) && (
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
                  Show More Related
                </>
              )}
            </Button>
          ))}
          
          {/* Spacer when no Show More button */}
          {(!result.relationships || 
            (result.relationships.memories?.length <= 2 && 
             result.relationships.code?.length <= 2 && 
             result.relationships.patterns?.length === 0)) && (
            <div />
          )}
          
          {(result.type === 'memory' || result.type === 'code') && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs"
              onClick={() => {
                console.log('View Full clicked, contentUrl:', result.contentUrl)
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
      contentUrl={result.contentUrl}
      type={(result.type === 'memory' || result.type === 'code') ? result.type : null}
    />
  </>
  )
}