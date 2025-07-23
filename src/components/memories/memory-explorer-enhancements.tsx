'use client'

import { useState } from 'react'
import { 
  BookOpen, 
  FileText, 
  Clock, 
  Tag, 
  GitBranch,
  User,
  Sparkles,
  Download,
  Copy,
  Link,
  MessageSquare
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Memory } from '@/lib/api/memories'
import { useToast } from '@/hooks/use-toast'

interface MemoryActionsProps {
  memory: Memory
}

export function MemoryActions({ memory }: MemoryActionsProps) {
  const { toast } = useToast()
  
  const handleCopyContent = () => {
    navigator.clipboard.writeText(memory.content)
    toast({
      title: 'Copied to clipboard',
      description: 'Memory content has been copied to your clipboard',
    })
  }
  
  const handleCopyLink = () => {
    const url = `${window.location.origin}/memories/${memory.id}`
    navigator.clipboard.writeText(url)
    toast({
      title: 'Link copied',
      description: 'Direct link to this memory has been copied',
    })
  }
  
  const handleExport = () => {
    const data = {
      id: memory.id,
      content: memory.content,
      metadata: memory.metadata,
      created_at: memory.created_at,
      project: memory.project_name,
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `memory-${memory.id.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Memory Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyContent}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Content
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyLink}>
          <Link className="mr-2 h-4 w-4" />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface TimelineViewProps {
  memories: Memory[]
}

export function TimelineView({ memories }: TimelineViewProps) {
  // Group memories by date
  const groupedByDate = memories.reduce((acc, memory) => {
    const date = memory.metadata?.startTime 
      ? new Date(memory.metadata.startTime).toLocaleDateString() 
      : new Date(memory.created_at).toLocaleDateString()
    
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(memory)
    return acc
  }, {} as Record<string, Memory[]>)
  
  return (
    <div className="space-y-6">
      {Object.entries(groupedByDate)
        .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
        .map(([date, memories]) => (
          <div key={date}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {date}
            </h3>
            <div className="space-y-2 border-l-2 border-muted pl-4">
              {memories.map((memory) => (
                <div key={memory.id} className="relative">
                  <div className="absolute -left-6 w-4 h-4 bg-background border-2 border-primary rounded-full" />
                  <div className="text-sm">
                    <span className="font-medium">{memory.project_name}</span>
                    <p className="text-muted-foreground line-clamp-2 mt-1">
                      {memory.content.slice(0, 100)}...
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}

// Memory Tags Component
interface MemoryTagsProps {
  memory: Memory
}

export function MemoryTags({ memory }: MemoryTagsProps) {
  const tags: string[] = []
  
  // Extract tags from metadata
  if (memory.metadata?.tools && Array.isArray(memory.metadata.tools)) {
    tags.push(...memory.metadata.tools)
  }
  
  if (memory.metadata?.topics && Array.isArray(memory.metadata.topics)) {
    tags.push(...memory.metadata.topics)
  }
  
  // Add message type if available in metadata
  if (memory.metadata?.messageType) {
    tags.push(memory.metadata.messageType)
  }
  
  if (tags.length === 0) return null
  
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {tags.map((tag, index) => (
        <span
          key={index}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded-full"
        >
          <Tag className="h-3 w-3" />
          {tag}
        </span>
      ))}
    </div>
  )
}

// Quick Actions Bar
interface QuickActionsBarProps {
  onViewChange: (view: 'grid' | 'list' | 'timeline') => void
  currentView: 'grid' | 'list' | 'timeline'
}

export function QuickActionsBar({ onViewChange, currentView }: QuickActionsBarProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex gap-2">
        <Button
          variant={currentView === 'grid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('grid')}
        >
          Grid View
        </Button>
        <Button
          variant={currentView === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('list')}
        >
          List View
        </Button>
        <Button
          variant={currentView === 'timeline' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('timeline')}
        >
          Timeline
        </Button>
      </div>
    </div>
  )
}

// Memory Insights Component
interface MemoryInsightsProps {
  memories: Memory[]
}

export function MemoryInsights({ memories }: MemoryInsightsProps) {
  // Calculate insights
  const totalWords = memories.reduce((acc, m) => acc + m.content.split(' ').length, 0)
  const avgWordsPerMemory = memories.length > 0 ? Math.round(totalWords / memories.length) : 0
  
  const messageTypes = memories.reduce((acc, m) => {
    // Check various possible locations for message type
    const type = m.metadata?.messageType || 
                 m.metadata?.type || 
                 m.metadata?.role ||
                 (m.content.toLowerCase().includes('user:') ? 'user' : 
                  m.content.toLowerCase().includes('assistant:') ? 'assistant' : 'unknown')
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const topProject = Object.entries(
    memories.reduce((acc, m) => {
      acc[m.project_name] = (acc[m.project_name] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).sort(([, a], [, b]) => b - a)[0]
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
      <div className="text-center">
        <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary" />
        <p className="text-2xl font-bold">{avgWordsPerMemory}</p>
        <p className="text-xs text-muted-foreground">Avg words/memory</p>
      </div>
      <div className="text-center">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 text-primary" />
        <p className="text-2xl font-bold">{messageTypes.user || 0}</p>
        <p className="text-xs text-muted-foreground">User messages</p>
      </div>
      <div className="text-center">
        <BookOpen className="h-8 w-8 mx-auto mb-2 text-primary" />
        <p className="text-2xl font-bold">{messageTypes.assistant || 0}</p>
        <p className="text-xs text-muted-foreground">Assistant responses</p>
      </div>
      <div className="text-center">
        <FileText className="h-8 w-8 mx-auto mb-2 text-primary" />
        <p className="text-2xl font-bold">{topProject?.[0] || 'N/A'}</p>
        <p className="text-xs text-muted-foreground">Most active project</p>
      </div>
    </div>
  )
}