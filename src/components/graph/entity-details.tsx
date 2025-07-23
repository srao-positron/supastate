'use client';

import { GraphNode } from '@/types/graph';
import { X, FileCode, GitBranch, Package, Hash } from 'lucide-react';
import { useState, useEffect } from 'react';
import { searchMemories } from '@/lib/api/memories';

interface EntityDetailsProps {
  node: GraphNode;
  onClose: () => void;
}

export default function EntityDetails({ node, onClose }: EntityDetailsProps) {
  const [relatedMemories, setRelatedMemories] = useState<any[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  useEffect(() => {
    loadRelatedMemories();
  }, [node]);

  const loadRelatedMemories = async () => {
    try {
      setLoadingMemories(true);
      // Search memories related to this entity
      const memories = await searchMemories({
        query: `${node.name} ${node.type}`,
        limit: 5,
      });
      setRelatedMemories(memories.results);
    } catch (error) {
      console.error('Failed to load related memories:', error);
    } finally {
      setLoadingMemories(false);
    }
  };

  const getIcon = () => {
    switch (node.type) {
      case 'function':
        return <Hash className="w-5 h-5" />;
      case 'class':
        return <Package className="w-5 h-5" />;
      case 'interface':
        return <GitBranch className="w-5 h-5" />;
      default:
        return <FileCode className="w-5 h-5" />;
    }
  };

  const getTypeColor = () => {
    switch (node.type) {
      case 'function':
        return 'bg-blue-100 text-blue-800';
      case 'class':
        return 'bg-green-100 text-green-800';
      case 'interface':
        return 'bg-amber-100 text-amber-800';
      case 'type':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${getTypeColor()}`}>
              {getIcon()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{node.name}</h2>
              <p className="text-sm text-gray-500 mt-1">{node.filePath}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Basic Info */}
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Details
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Type</span>
              <span className={`text-sm px-2 py-1 rounded-full ${getTypeColor()}`}>
                {node.type}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Line</span>
              <span className="text-sm font-mono text-gray-900">{node.lineNumber}</span>
            </div>
            {node.description && (
              <div className="mt-4">
                <span className="text-sm text-gray-500">Description</span>
                <p className="text-sm text-gray-900 mt-1">{node.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Parameters */}
        {node.params && node.params.length > 0 && (
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Parameters
            </h3>
            <div className="space-y-2">
              {node.params.map((param, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-sm font-mono text-gray-900">{param.name}</span>
                  <span className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
                    {param.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Return Type */}
        {node.returnType && (
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Return Type
            </h3>
            <span className="text-sm font-mono bg-gray-100 px-3 py-1 rounded">
              {node.returnType}
            </span>
          </div>
        )}

        {/* Properties */}
        {node.properties && node.properties.length > 0 && (
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Properties
            </h3>
            <div className="space-y-2">
              {node.properties.map((prop, index) => (
                <div key={index} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {prop.visibility && (
                      <span className="text-xs text-gray-500">{prop.visibility}</span>
                    )}
                    <span className="text-sm font-mono text-gray-900">{prop.name}</span>
                  </div>
                  <span className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
                    {prop.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Methods */}
        {node.methods && node.methods.length > 0 && (
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Methods
            </h3>
            <div className="space-y-3">
              {node.methods.map((method, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono font-semibold text-gray-900">
                      {method.name}
                    </span>
                    {method.visibility && (
                      <span className="text-xs text-gray-500">{method.visibility}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600">
                    <span>({method.params.map(p => `${p.name}: ${p.type}`).join(', ')})</span>
                    <span className="mx-1">→</span>
                    <span className="font-mono bg-gray-100 px-1 rounded">{method.returnType}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Memories */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Related Memories
          </h3>
          {loadingMemories ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : relatedMemories.length > 0 ? (
            <div className="space-y-3">
              {relatedMemories.map((memory) => (
                <div
                  key={memory.id}
                  className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="text-sm font-medium text-gray-900">{memory.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(memory.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No related memories found</p>
          )}
        </div>
      </div>
    </div>
  );
}