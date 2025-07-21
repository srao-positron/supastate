'use client';

import { useState } from 'react';
import { GraphFilter } from '@/types/graph';
import { Search, Filter, Layers, GitBranch, Hash, Package, FileCode } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { useEffect } from 'react';

interface GraphControlsProps {
  filter: GraphFilter;
  onFilterChange: (filter: GraphFilter) => void;
}

const ENTITY_TYPES = [
  { value: 'function', label: 'Functions', icon: Hash, color: 'text-blue-600' },
  { value: 'class', label: 'Classes', icon: Package, color: 'text-green-600' },
  { value: 'interface', label: 'Interfaces', icon: GitBranch, color: 'text-amber-600' },
  { value: 'type', label: 'Types', icon: FileCode, color: 'text-purple-600' },
];

const RELATIONSHIP_TYPES = [
  { value: 'calls', label: 'Calls', description: 'Function invocations' },
  { value: 'imports', label: 'Imports', description: 'Module dependencies' },
  { value: 'extends', label: 'Extends', description: 'Class inheritance' },
  { value: 'implements', label: 'Implements', description: 'Interface implementation' },
];

export default function GraphControls({ filter, onFilterChange }: GraphControlsProps) {
  const [searchQuery, setSearchQuery] = useState(filter.searchQuery);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    if (debouncedSearchQuery !== filter.searchQuery) {
      onFilterChange({ ...filter, searchQuery: debouncedSearchQuery });
    }
  }, [debouncedSearchQuery]);

  const handleEntityTypeToggle = (type: string) => {
    const newTypes = filter.entityTypes.includes(type)
      ? filter.entityTypes.filter(t => t !== type)
      : [...filter.entityTypes, type];
    onFilterChange({ ...filter, entityTypes: newTypes });
  };

  const handleRelationshipTypeToggle = (type: string) => {
    const newTypes = filter.relationshipTypes.includes(type)
      ? filter.relationshipTypes.filter(t => t !== type)
      : [...filter.relationshipTypes, type];
    onFilterChange({ ...filter, relationshipTypes: newTypes });
  };

  const selectAll = () => {
    onFilterChange({
      ...filter,
      entityTypes: ENTITY_TYPES.map(t => t.value),
      relationshipTypes: RELATIONSHIP_TYPES.map(t => t.value),
    });
  };

  const deselectAll = () => {
    onFilterChange({
      ...filter,
      entityTypes: [],
      relationshipTypes: [],
    });
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities by name..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Search through code entities. This search is powered by Supabase and integrated with Camille.
        </p>
      </div>

      {/* Entity Types */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Entity Types
          </h3>
        </div>
        <div className="space-y-2">
          {ENTITY_TYPES.map(type => {
            const Icon = type.icon;
            const isSelected = filter.entityTypes.includes(type.value);
            return (
              <button
                key={type.value}
                onClick={() => handleEntityTypeToggle(type.value)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isSelected ? type.color : 'text-gray-400'}`} />
                <span className={`flex-1 text-left ${isSelected ? 'font-medium' : ''}`}>
                  {type.label}
                </span>
                <div className={`w-5 h-5 rounded-full border-2 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300'
                }`}>
                  {isSelected && (
                    <svg className="w-full h-full text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Relationship Types */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Relationships
          </h3>
        </div>
        <div className="space-y-2">
          {RELATIONSHIP_TYPES.map(type => {
            const isSelected = filter.relationshipTypes.includes(type.value);
            return (
              <button
                key={type.value}
                onClick={() => handleRelationshipTypeToggle(type.value)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                      {type.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{type.description}</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {isSelected && (
                      <svg className="w-full h-full text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <button
          onClick={selectAll}
          className="flex-1 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          Select All
        </button>
        <button
          onClick={deselectAll}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* Advanced Options */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-between"
        >
          <span>Advanced Options</span>
          <svg
            className={`w-5 h-5 transition-transform ${showAdvanced ? 'transform rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {showAdvanced && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Max Nodes</label>
              <input
                type="number"
                defaultValue={500}
                min={50}
                max={1000}
                step={50}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Layout Algorithm</label>
              <select className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option value="force">Force-Directed</option>
                <option value="hierarchical">Hierarchical</option>
                <option value="circular">Circular</option>
              </select>
            </div>
            <div className="text-xs text-gray-500">
              These settings affect performance and visualization. Adjust based on your codebase size.
            </div>
          </div>
        )}
      </div>

      {/* Integration Notice */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
            <span className="text-lg">🤖</span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Camille Integration</h4>
            <p className="text-xs text-gray-600 mt-1">
              This code graph is fully searchable through Camille. Ask questions about your codebase, 
              find relationships between components, and get insights powered by Supabase vector search.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}