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
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MemoryActions, MemoryTags } from './memory-explorer-enhancements'

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

  // Extract first paragraph for preview
  const getPreview = (content: string) => {
    const firstParagraph = content.split('\n\n')[0]
    const preview = firstParagraph.slice(0, 150)
    return preview + (firstParagraph.length > 150 ? '...' : '')
  }

  const preview = getPreview(memory.content)

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
                <span>
                  {memory.metadata?.startTime 
                    ? new Date(memory.metadata.startTime).toLocaleDateString() 
                    : new Date(memory.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <MemoryTags memory={memory} />
          </div>
          <div className="flex items-center gap-2">
            <MemoryActions memory={memory} />
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
        </div>
      </CardHeader>
      <CardContent>
        {!isExpanded ? (
          <p className="text-sm text-muted-foreground line-clamp-3">{preview}</p>
        ) : (
          <div className="space-y-3">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '')
                    const language = match ? match[1] : 'plaintext'
                    
                    if (!inline) {
                      return (
                        <div className="relative my-4">
                          <div className="absolute top-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded z-10">
                            {language}
                          </div>
                          <SyntaxHighlighter
                            language={language}
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              borderRadius: '0.375rem',
                              fontSize: '0.875rem',
                            }}
                            showLineNumbers
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        </div>
                      )
                    }
                    
                    return (
                      <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    )
                  },
                  // Custom styling for other elements
                  p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-6 mb-4">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic my-4">
                      {children}
                    </blockquote>
                  ),
                  h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-semibold mb-3 mt-5">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 mt-4">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-base font-semibold mb-2 mt-3">{children}</h4>,
                  hr: () => <hr className="my-6 border-muted-foreground/30" />,
                  a: ({ href, children }) => (
                    <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full divide-y divide-border">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-2 text-left text-sm font-semibold">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 text-sm">{children}</td>
                  ),
                }}
              >
                {memory.content}
              </ReactMarkdown>
            </div>
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