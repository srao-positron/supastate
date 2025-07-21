'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { memoriesAPI } from '@/lib/api/memories'
import { useDebounce } from '@/hooks/use-debounce'

interface MemorySearchProps {
  onSearch: (query: string, projectFilter?: string[]) => void
  onProjectFilterChange?: (projects: string[]) => void
  isSearching?: boolean
}

export function MemorySearch({ 
  onSearch, 
  onProjectFilterChange,
  isSearching = false 
}: MemorySearchProps) {
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<string[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  
  const debouncedQuery = useDebounce(query, 300)

  // Load available projects
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projectList = await memoriesAPI.getProjects()
        setProjects(projectList)
      } catch (error) {
        console.error('Failed to load projects:', error)
      }
    }
    loadProjects()
  }, [])

  // Trigger search when query or filters change
  useEffect(() => {
    const projectFilter = selectedProject === 'all' ? undefined : [selectedProject]
    onSearch(debouncedQuery, projectFilter)
    if (onProjectFilterChange && projectFilter) {
      onProjectFilterChange(projectFilter)
    }
  }, [debouncedQuery, selectedProject, onSearch, onProjectFilterChange])

  const handleClearSearch = () => {
    setQuery('')
    setSelectedProject('all')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search memories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-10"
            disabled={isSearching}
          />
          {query && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className={showFilters ? 'bg-accent' : ''}
        >
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {showFilters && (
        <div className="flex items-end gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex-1 space-y-2">
            <Label htmlFor="project-filter">Project</Label>
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
            >
              <SelectTrigger id="project-filter">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project} value={project}>
                    {project}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProject !== 'all' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedProject('all')}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {isSearching && (
        <div className="text-sm text-muted-foreground text-center py-2">
          Searching memories...
        </div>
      )}
    </div>
  )
}