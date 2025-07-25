'use client'

import { useState } from 'react'
import { 
  FileText, 
  Clock, 
  Tag, 
  GitBranch,
  User,
  Sparkles,
  Download,
  Copy,
  Link,
  Database,
  TrendingUp,
  Brain
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
  
  // Parse metadata if it's a string
  let metadata = memory.metadata
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata)
    } catch (e) {
      metadata = {}
    }
  }
  
  // Extract tags from metadata
  if (metadata?.tools && Array.isArray(metadata.tools)) {
    tags.push(...metadata.tools)
  }
  
  if (metadata?.topics && Array.isArray(metadata.topics)) {
    tags.push(...metadata.topics)
  }
  
  // Add message type if available in metadata
  if (metadata?.messageType) {
    tags.push(metadata.messageType)
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

export function MemoryInsights({ memories, totalMemories, projectCount }: MemoryInsightsProps & { totalMemories: number; projectCount: number }) {
  // Calculate insights
  const totalWords = memories.reduce((acc, m) => acc + m.content.split(' ').length, 0)
  const avgWordsPerMemory = memories.length > 0 ? Math.round(totalWords / memories.length) : 0
  
  // Calculate top projects
  const projectCounts = memories.reduce((acc, m) => {
    acc[m.project_name] = (acc[m.project_name] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const topProjects = Object.entries(projectCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
  
  const topProject = topProjects[0]
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
      <div className="text-center">
        <Database className="h-6 w-6 mx-auto mb-1 text-primary" />
        <p className="text-xl font-bold">{totalMemories.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">Total Memories</p>
      </div>
      <div className="text-center">
        <TrendingUp className="h-6 w-6 mx-auto mb-1 text-primary" />
        <p className="text-xl font-bold">{projectCount}</p>
        <p className="text-xs text-muted-foreground">Projects</p>
      </div>
      <div className="text-center">
        <Brain className="h-6 w-6 mx-auto mb-1 text-primary" />
        <p className="text-xl font-bold">{topProject?.[0] || 'N/A'}</p>
        <p className="text-xs text-muted-foreground">Most Active</p>
      </div>
      <div className="text-center">
        <Sparkles className="h-6 w-6 mx-auto mb-1 text-primary" />
        <p className="text-xl font-bold">{avgWordsPerMemory}</p>
        <p className="text-xs text-muted-foreground">Avg Words</p>
      </div>
      {/* Top Projects List */}
      <div className="col-span-2 md:col-span-4 mt-2">
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Top Projects
        </h4>
        <div className="space-y-1">
          {topProjects.map(([project, count]) => (
            <div key={project} className="flex items-center justify-between text-sm">
              <span className="truncate">{project}</span>
              <span className="font-mono text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}