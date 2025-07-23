'use client'

import { useState, useEffect } from 'react'
import { Calendar, Clock, Filter, X, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'

interface MemoryFiltersProps {
  projects: string[]
  onFiltersChange: (filters: MemoryFilters) => void
  isLoading?: boolean
}

export interface MemoryFilters {
  dateRange?: {
    from?: Date
    to?: Date
  }
  timeRange?: {
    startHour?: number
    endHour?: number
  }
  selectedProjects?: string[]
}

export function MemoryFilters({ projects, onFiltersChange, isLoading }: MemoryFiltersProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [timeRange, setTimeRange] = useState<{ startHour?: number; endHour?: number }>({})
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [activeFiltersCount, setActiveFiltersCount] = useState(0)

  // Calculate active filters
  useEffect(() => {
    let count = 0
    if (dateRange.from || dateRange.to) count++
    if (timeRange.startHour !== undefined || timeRange.endHour !== undefined) count++
    if (selectedProjects.length > 0) count++
    setActiveFiltersCount(count)
  }, [dateRange, timeRange, selectedProjects])

  const handleDateChange = (type: 'from' | 'to', date?: Date) => {
    const newDateRange = { ...dateRange, [type]: date }
    setDateRange(newDateRange)
    applyFilters({ dateRange: newDateRange })
  }

  const handleTimeChange = (type: 'startHour' | 'endHour', hour?: string) => {
    const newTimeRange = { 
      ...timeRange, 
      [type]: hour === 'any' ? undefined : hour ? parseInt(hour) : undefined 
    }
    setTimeRange(newTimeRange)
    applyFilters({ timeRange: newTimeRange })
  }

  const handleProjectToggle = (project: string) => {
    const newProjects = selectedProjects.includes(project)
      ? selectedProjects.filter(p => p !== project)
      : [...selectedProjects, project]
    setSelectedProjects(newProjects)
    applyFilters({ selectedProjects: newProjects })
  }

  const handleSelectAllProjects = () => {
    if (selectedProjects.length === projects.length) {
      setSelectedProjects([])
      applyFilters({ selectedProjects: [] })
    } else {
      setSelectedProjects(projects)
      applyFilters({ selectedProjects: projects })
    }
  }

  const applyFilters = (updates: Partial<MemoryFilters> = {}) => {
    onFiltersChange({
      dateRange: updates.dateRange ?? dateRange,
      timeRange: updates.timeRange ?? timeRange,
      selectedProjects: updates.selectedProjects ?? selectedProjects,
    })
  }

  const clearFilters = () => {
    setDateRange({})
    setTimeRange({})
    setSelectedProjects([])
    onFiltersChange({})
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>

        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="grid gap-6 p-6 bg-muted/50 rounded-lg border">
          {/* Date Range Filter */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4" />
              Date Range
            </Label>
            <div className="flex gap-2 items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      format(dateRange.from, "PP")
                    ) : (
                      "From date"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => handleDateChange('from', date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <span className="text-muted-foreground">to</span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !dateRange.to && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateRange.to ? (
                      format(dateRange.to, "PP")
                    ) : (
                      "To date"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => handleDateChange('to', date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Time Range Filter */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              Time Range (Hours)
            </Label>
            <div className="flex gap-2 items-center">
              <Select
                value={timeRange.startHour?.toString() || 'any'}
                onValueChange={(hour) => handleTimeChange('startHour', hour)}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Start hour" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any time</SelectItem>
                  {hours.map((hour) => (
                    <SelectItem key={hour} value={hour.toString()}>
                      {hour.toString().padStart(2, '0')}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-muted-foreground">to</span>

              <Select
                value={timeRange.endHour?.toString() || 'any'}
                onValueChange={(hour) => handleTimeChange('endHour', hour)}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="End hour" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any time</SelectItem>
                  {hours.map((hour) => (
                    <SelectItem key={hour} value={hour.toString()}>
                      {hour.toString().padStart(2, '0')}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Project Filter */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <FolderOpen className="h-4 w-4" />
                Projects ({selectedProjects.length}/{projects.length})
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAllProjects}
                className="text-xs"
              >
                {selectedProjects.length === projects.length ? 'Deselect all' : 'Select all'}
              </Button>
            </div>
            
            <ScrollArea className="h-[200px] rounded-md border p-4">
              <div className="space-y-2">
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No projects found</p>
                ) : (
                  projects.map((project) => (
                    <div key={project} className="flex items-center space-x-2">
                      <Checkbox
                        id={project}
                        checked={selectedProjects.includes(project)}
                        onCheckedChange={() => handleProjectToggle(project)}
                        disabled={isLoading}
                      />
                      <label
                        htmlFor={project}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                      >
                        {project}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            
            {selectedProjects.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedProjects.slice(0, 3).map((project) => (
                  <Badge key={project} variant="secondary" className="text-xs">
                    {project}
                  </Badge>
                ))}
                {selectedProjects.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedProjects.length - 3} more
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}