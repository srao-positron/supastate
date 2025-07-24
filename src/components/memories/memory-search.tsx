'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, X, Sparkles } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { memoriesAPI } from '@/lib/api/memories'
import { useDebounce } from '@/hooks/use-debounce'

interface MemorySearchProps {
  onSearch: (query: string, projectFilter?: string[], useSemanticSearch?: boolean) => void
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
  const [useSemanticSearch, setUseSemanticSearch] = useState(true)
  
  const debouncedQuery = useDebounce(query, 1000) // Increased to 1 second for large datasets

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

  // Manual search handler
  const handleSearch = useCallback(() => {
    const projectFilter = selectedProject === 'all' ? undefined : [selectedProject]
    onSearch(query, projectFilter, useSemanticSearch)
    if (onProjectFilterChange && projectFilter) {
      onProjectFilterChange(projectFilter)
    }
  }, [query, selectedProject, useSemanticSearch, onSearch, onProjectFilterChange])

  // Auto-search on Enter key
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Optional auto-search (can be disabled for very large datasets)
  const [autoSearch, setAutoSearch] = useState(false)
  
  useEffect(() => {
    if (autoSearch && debouncedQuery !== undefined) {
      handleSearch()
    }
  }, [debouncedQuery, selectedProject, autoSearch, handleSearch])

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
            placeholder="Search memories... (Press Enter to search)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
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
          onClick={handleSearch}
          disabled={isSearching}
          variant="default"
        >
          Search
        </Button>
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
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-end gap-4">
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
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                id="semantic-search"
                checked={useSemanticSearch}
                onCheckedChange={setUseSemanticSearch}
              />
              <Label 
                htmlFor="semantic-search" 
                className="cursor-pointer flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Semantic Search
                <span className="text-xs text-muted-foreground">
                  (AI-powered search that understands meaning)
                </span>
              </Label>
            </div>
          </div>
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