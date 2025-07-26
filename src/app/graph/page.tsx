'use client';

import { useState, useEffect } from 'react';
import GraphViewer from '@/components/graph/graph-viewer';
import EntityDetails from '@/components/graph/entity-details';
import GraphControls from '@/components/graph/graph-controls';
import { getGraphData } from '@/lib/api/graph';
import { GraphData, GraphNode, GraphFilter } from '@/types/graph';

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filter, setFilter] = useState<GraphFilter>({
    entityTypes: ['function', 'class', 'interface', 'type'],
    relationshipTypes: ['calls', 'imports', 'extends', 'implements'],
    searchQuery: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGraphData();
  }, []);

  const loadGraphData = async () => {
    try {
      setLoading(true);
      const data = await getGraphData();
      setGraphData(data);
    } catch (error) {
      console.error('Failed to load graph data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
  };

  const handleFilterChange = (newFilter: GraphFilter) => {
    setFilter(newFilter);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 via-blue-50/20 to-purple-50/20">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <p className="mt-4 text-gray-600 font-medium">Loading code graph...</p>
          <p className="text-sm text-gray-500 mt-1">Analyzing your codebase structure</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-gray-50">
      {/* Left sidebar - Controls */}
      <div className="w-80 bg-white shadow-lg overflow-y-auto">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Code Graph</h1>
              <p className="text-sm text-gray-600">Visualize your codebase structure</p>
            </div>
          </div>
          {graphData && (
            <div className="flex gap-4 mt-4 text-sm">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-gray-700">{graphData.nodes.length}</span>
                <span className="text-gray-500">nodes</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-gray-700">{graphData.edges.length}</span>
                <span className="text-gray-500">edges</span>
              </div>
            </div>
          )}
        </div>
        <div className="p-6">
          <GraphControls filter={filter} onFilterChange={handleFilterChange} />
        </div>
      </div>

      {/* Main graph area */}
      <div className="flex-1 relative">
        {graphData && (
          <GraphViewer
            data={graphData}
            filter={filter}
            onNodeClick={handleNodeClick}
            selectedNode={selectedNode}
          />
        )}
      </div>

      {/* Right sidebar - Entity details */}
      {selectedNode && (
        <div className="w-96 bg-white shadow-lg overflow-y-auto">
          <EntityDetails
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      )}
    </div>
  );
}