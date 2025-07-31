'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Search, Loader2, X, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface UnifiedSearchBarProps {
  value: string
  onChange: (value: string) => void
  onSearch?: (value: string) => void
  loading?: boolean
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

export function UnifiedSearchBar({
  value,
  onChange,
  onSearch,
  loading = false,
  placeholder = "Search memories and code...",
  className,
  autoFocus = true
}: UnifiedSearchBarProps) {
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSearch?.(value)
    }
  }
  
  const handleClear = () => {
    onChange('')
    inputRef.current?.focus()
  }
  
  return (
    <div className={cn("relative", className)}>
      <div className={cn(
        "relative flex items-center transition-all duration-200",
        isFocused && "ring-2 ring-primary ring-offset-2 rounded-lg"
      )}>
        <div className="absolute left-3 pointer-events-none">
          {loading ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          ) : (
            <Search className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className={cn(
            "pl-10 pr-24 h-12 text-base",
            "border-muted focus:ring-0 focus:border-muted",
            "placeholder:text-muted-foreground/60"
          )}
          autoFocus={autoFocus}
        />
        
        <div className="absolute right-2 flex items-center gap-1">
          {value && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSearch?.(value)}
            disabled={!value || loading}
            className="h-8 px-3 gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-xs">Search</span>
          </Button>
        </div>
      </div>
      
      {/* Search hints */}
      <div className="absolute top-full mt-2 text-xs text-muted-foreground">
        <p>
          Try: "debugging sessions", "auth middleware", "what did I work on yesterday", or ask a question
        </p>
      </div>
    </div>
  )
}