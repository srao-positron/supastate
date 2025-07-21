'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Code, Calendar, Hash, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Memory } from '@/lib/api/memories'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { RelatedMemories } from './related-memories'

interface MemoryCardProps {
  memory: Memory
  expanded?: boolean
  onToggleExpand?: () => void
  showSimilarity?: boolean
  showRelated?: boolean
  onRelatedMemoryClick?: (memory: Memory) => void
}

export function MemoryCard({ 
  memory, 
  expanded: controlledExpanded, 
  onToggleExpand,
  showSimilarity = false,
  showRelated = false,
  onRelatedMemoryClick
}: MemoryCardProps) {
  const [localExpanded, setLocalExpanded] = useState(false)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : localExpanded

  const handleToggle = () => {
    if (onToggleExpand) {
      onToggleExpand()
    } else {
      setLocalExpanded(!localExpanded)
    }
  }

  // Extract code blocks from content
  const extractCodeBlocks = (content: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
    const blocks: Array<{ language: string; code: string; index: number }> = []
    let match
    let lastIndex = 0
    const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = []

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        })
      }

      // Add code block
      parts.push({
        type: 'code',
        content: match[2].trim(),
        language: match[1] || 'plaintext'
      })

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex)
      })
    }

    return parts.length > 0 ? parts : [{ type: 'text' as const, content }]
  }

  const contentParts = extractCodeBlocks(memory.content)
  const preview = memory.content.slice(0, 150) + (memory.content.length > 150 ? '...' : '')

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span className="font-medium">{memory.project_name}</span>
              {showSimilarity && memory.similarity && (
                <>
                  <span>•</span>
                  <span className="text-green-600 dark:text-green-400">
                    {(memory.similarity * 100).toFixed(1)}% match
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                <span className="font-mono">{memory.chunk_id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{new Date(memory.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="ml-2"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!isExpanded ? (
          <p className="text-sm text-muted-foreground line-clamp-3">{preview}</p>
        ) : (
          <div className="space-y-3">
            {contentParts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <p key={index} className="text-sm whitespace-pre-wrap">
                    {part.content}
                  </p>
                )
              } else {
                return (
                  <div key={index} className="relative">
                    <div className="absolute top-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                      {part.language}
                    </div>
                    <SyntaxHighlighter
                      language={part.language}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                      }}
                      showLineNumbers
                    >
                      {part.content}
                    </SyntaxHighlighter>
                  </div>
                )
              }
            })}
            {memory.metadata && Object.keys(memory.metadata).length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Metadata</h4>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify(memory.metadata, null, 2)}
                </pre>
              </div>
            )}
            {showRelated && isExpanded && (
              <RelatedMemories 
                memoryId={memory.id} 
                onMemoryClick={onRelatedMemoryClick}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}