'use client'

import { UnifiedSearchRequest, UnifiedSearchResponse } from '@/lib/search/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Code, Brain, Filter, RotateCcw } from 'lucide-react'
import { DatePickerWithRange } from '@/components/ui/date-range-picker'
import { DateRange } from 'react-day-picker'

interface UnifiedSearchFiltersProps {
  filters: UnifiedSearchRequest['filters']
  options: UnifiedSearchRequest['options']
  onFiltersChange: (filters: UnifiedSearchRequest['filters']) => void
  onOptionsChange: (options: UnifiedSearchRequest['options']) => void
  facets?: UnifiedSearchResponse['facets']
}

export function UnifiedSearchFilters({
  filters = {},
  options = {},
  onFiltersChange,
  onOptionsChange,
  facets
}: UnifiedSearchFiltersProps) {
  const handleReset = () => {
    onFiltersChange({
      includeMemories: true,
      includeCode: true
    })
    onOptionsChange({
      expandContext: true,
      includeRelated: true
    })
  }
  
  const handleDateRangeChange = (range: DateRange | undefined) => {
    if (range?.from || range?.to) {
      onFiltersChange({
        ...filters,
        dateRange: {
          start: range.from?.toISOString(),
          end: range.to?.toISOString()
        }
      })
    } else {
      const { dateRange, ...rest } = filters
      onFiltersChange(rest)
    }
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-8 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Content Types */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Content Types</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="include-memories" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  Memories
                </Label>
                <Switch
                  id="include-memories"
                  checked={filters.includeMemories !== false}
                  onCheckedChange={(checked) => 
                    onFiltersChange({ ...filters, includeMemories: checked })
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="include-code" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  Code
                </Label>
                <Switch
                  id="include-code"
                  checked={filters.includeCode !== false}
                  onCheckedChange={(checked) => 
                    onFiltersChange({ ...filters, includeCode: checked })
                  }
                />
              </div>
            </div>
          </div>
          
          {/* Date Range */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Date Range
            </Label>
            <DatePickerWithRange
              date={{
                from: filters.dateRange?.start ? new Date(filters.dateRange.start) : undefined,
                to: filters.dateRange?.end ? new Date(filters.dateRange.end) : undefined
              }}
              onDateChange={handleDateRangeChange}
            />
          </div>
          
          {/* Projects */}
          {facets?.projects && facets.projects.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Projects</Label>
              <div className="space-y-2">
                {facets.projects.slice(0, 5).map((project) => (
                  <div key={project.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`project-${project.value}`}
                      checked={filters.projects?.includes(project.value)}
                      onCheckedChange={(checked) => {
                        const projects = filters.projects || []
                        onFiltersChange({
                          ...filters,
                          projects: checked 
                            ? [...projects, project.value]
                            : projects.filter(p => p !== project.value)
                        })
                      }}
                    />
                    <Label
                      htmlFor={`project-${project.value}`}
                      className="text-sm font-normal cursor-pointer flex items-center justify-between flex-1"
                    >
                      <span>{project.value}</span>
                      <Badge variant="secondary" className="text-xs">
                        {project.count}
                      </Badge>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Languages */}
          {facets?.languages && facets.languages.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Languages</Label>
              <div className="space-y-2">
                {facets.languages.map((lang) => (
                  <div key={lang.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`lang-${lang.value}`}
                      checked={filters.languages?.includes(lang.value)}
                      onCheckedChange={(checked) => {
                        const languages = filters.languages || []
                        onFiltersChange({
                          ...filters,
                          languages: checked 
                            ? [...languages, lang.value]
                            : languages.filter(l => l !== lang.value)
                        })
                      }}
                    />
                    <Label
                      htmlFor={`lang-${lang.value}`}
                      className="text-sm font-normal cursor-pointer flex items-center justify-between flex-1"
                    >
                      <span>{lang.value}</span>
                      <Badge variant="secondary" className="text-xs">
                        {lang.count}
                      </Badge>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Search Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="expand-context" className="text-sm font-normal cursor-pointer">
              Expand Context
            </Label>
            <Switch
              id="expand-context"
              checked={options.expandContext !== false}
              onCheckedChange={(checked) => 
                onOptionsChange({ ...options, expandContext: checked })
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="include-related" className="text-sm font-normal cursor-pointer">
              Include Related Items
            </Label>
            <Switch
              id="include-related"
              checked={options.includeRelated !== false}
              onCheckedChange={(checked) => 
                onOptionsChange({ ...options, includeRelated: checked })
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="must-have-relationships" className="text-sm font-normal cursor-pointer">
              Only Connected Items
            </Label>
            <Switch
              id="must-have-relationships"
              checked={filters.mustHaveRelationships === true}
              onCheckedChange={(checked) => 
                onFiltersChange({ ...filters, mustHaveRelationships: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}