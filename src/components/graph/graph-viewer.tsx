'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { GraphData, GraphNode, GraphEdge, GraphFilter } from '@/types/graph';

interface GraphViewerProps {
  data: GraphData;
  filter: GraphFilter;
  onNodeClick: (node: GraphNode) => void;
  selectedNode: GraphNode | null;
}

interface Position {
  x: number;
  y: number;
}

interface NodePosition extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const NODE_COLORS: Record<string, string> = {
  function: '#3B82F6', // blue
  class: '#10B981', // green
  interface: '#F59E0B', // amber
  type: '#8B5CF6', // purple
  module: '#EF4444', // red
};

const EDGE_COLORS: Record<string, string> = {
  calls: '#6B7280',
  imports: '#9CA3AF',
  extends: '#10B981',
  implements: '#F59E0B',
};

export default function GraphViewer({
  data,
  filter,
  onNodeClick,
  selectedNode,
}: GraphViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, zoom: 1 });
  const [showMinimap, setShowMinimap] = useState(true);

  // Filter nodes and edges based on current filter
  const filteredNodes = data.nodes.filter(node => {
    if (!filter.entityTypes.includes(node.type)) return false;
    if (filter.searchQuery && !node.name.toLowerCase().includes(filter.searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = data.edges.filter(edge => {
    return filteredNodeIds.has(edge.source) && 
           filteredNodeIds.has(edge.target) &&
           filter.relationshipTypes.includes(edge.type);
  });

  // Initialize node positions with force-directed layout
  useEffect(() => {
    const positions = new Map<string, NodePosition>();
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const radius = Math.min(centerX, centerY) * 0.8;

    filteredNodes.forEach((node, index) => {
      const angle = (index / filteredNodes.length) * 2 * Math.PI;
      positions.set(node.id, {
        ...node,
        x: centerX + radius * Math.cos(angle) + (Math.random() - 0.5) * 50,
        y: centerY + radius * Math.sin(angle) + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
      });
    });

    setNodePositions(positions);
  }, [filteredNodes, dimensions]);

  // Force-directed simulation
  useEffect(() => {
    if (isDragging) return;

    const interval = setInterval(() => {
      setNodePositions(prevPositions => {
        const newPositions = new Map<string, NodePosition>();
        const nodes = Array.from(prevPositions.values());

        // Apply forces
        nodes.forEach(node => {
          let fx = 0;
          let fy = 0;

          // Repulsion between nodes
          nodes.forEach(other => {
            if (node.id !== other.id) {
              const dx = node.x - other.x;
              const dy = node.y - other.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < 100) {
                const force = 100 / (distance * distance);
                fx += (dx / distance) * force;
                fy += (dy / distance) * force;
              }
            }
          });

          // Attraction along edges
          filteredEdges.forEach(edge => {
            let other: NodePosition | undefined;
            if (edge.source === node.id) {
              other = prevPositions.get(edge.target);
            } else if (edge.target === node.id) {
              other = prevPositions.get(edge.source);
            }

            if (other) {
              const dx = other.x - node.x;
              const dy = other.y - node.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              const force = distance * 0.001;
              fx += (dx / distance) * force;
              fy += (dy / distance) * force;
            }
          });

          // Center gravity
          const centerX = dimensions.width / 2;
          const centerY = dimensions.height / 2;
          fx += (centerX - node.x) * 0.0001;
          fy += (centerY - node.y) * 0.0001;

          // Update velocity with damping
          node.vx = (node.vx + fx) * 0.8;
          node.vy = (node.vy + fy) * 0.8;

          // Update position
          newPositions.set(node.id, {
            ...node,
            x: node.x + node.vx,
            y: node.y + node.vy,
          });
        });

        return newPositions;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [filteredEdges, isDragging, dimensions]);

  // Handle window resize
  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    setIsDragging(true);
    setDraggedNode(nodeId);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !draggedNode || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / viewBox.zoom + viewBox.x;
    const y = (e.clientY - rect.top) / viewBox.zoom + viewBox.y;

    setNodePositions(prev => {
      const newPositions = new Map(prev);
      const node = prev.get(draggedNode);
      if (node) {
        newPositions.set(draggedNode, { ...node, x, y, vx: 0, vy: 0 });
      }
      return newPositions;
    });
  }, [isDragging, draggedNode, viewBox]);

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedNode(null);
  };

  // Zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewBox(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(5, prev.zoom * delta)),
    }));
  };

  // Calculate viewBox bounds
  const bounds = {
    minX: Math.min(...Array.from(nodePositions.values()).map(n => n.x - 50)),
    maxX: Math.max(...Array.from(nodePositions.values()).map(n => n.x + 50)),
    minY: Math.min(...Array.from(nodePositions.values()).map(n => n.y - 50)),
    maxY: Math.max(...Array.from(nodePositions.values()).map(n => n.y + 50)),
  };

  const viewBoxString = `${viewBox.x} ${viewBox.y} ${dimensions.width / viewBox.zoom} ${dimensions.height / viewBox.zoom}`;

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-gray-50 via-blue-50/20 to-purple-50/20">
      <svg
        ref={svgRef}
        className="w-full h-full cursor-move"
        viewBox={viewBoxString}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          {/* Gradient definitions for nodes */}
          <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
          <linearGradient id="greenGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
          <linearGradient id="amberGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
          <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          
          {/* Shadow filter */}
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feFlood floodColor="#000000" floodOpacity="0.1"/>
            <feComposite in2="offsetblur" operator="in"/>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Arrow markers for directed edges */}
          {Object.entries(EDGE_COLORS).map(([type, color]) => (
            <marker
              key={type}
              id={`arrow-${type}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>

        {/* Edges */}
        <g className="edges">
          {filteredEdges.map(edge => {
            const source = nodePositions.get(edge.source);
            const target = nodePositions.get(edge.target);
            if (!source || !target) return null;

            const isConnectedToSelected = selectedNode && 
              (selectedNode.id === edge.source || selectedNode.id === edge.target);

            return (
              <g key={`${edge.source}-${edge.target}-${edge.type}`}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={EDGE_COLORS[edge.type] || '#999'}
                  strokeWidth={isConnectedToSelected ? "3" : "2"}
                  markerEnd={`url(#arrow-${edge.type})`}
                  opacity={isConnectedToSelected ? "0.8" : "0.4"}
                  className="transition-all duration-200"
                />
                {edge.count && edge.count > 1 && (
                  <text
                    x={(source.x + target.x) / 2}
                    y={(source.y + target.y) / 2}
                    textAnchor="middle"
                    className="text-xs font-semibold"
                    fill={EDGE_COLORS[edge.type] || '#999'}
                  >
                    {edge.count}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Nodes */}
        <g className="nodes">
          {Array.from(nodePositions.values()).map(node => {
            const isSelected = selectedNode?.id === node.id;
            const gradientMap: Record<string, string> = {
              function: 'url(#blueGradient)',
              class: 'url(#greenGradient)',
              interface: 'url(#amberGradient)',
              type: 'url(#purpleGradient)',
            };
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer"
                onMouseDown={(e) => handleMouseDown(e, node.id)}
                onClick={() => onNodeClick(node)}
              >
                {/* Node shadow */}
                <circle
                  r={isSelected ? 25 : 20}
                  fill={gradientMap[node.type] || NODE_COLORS[node.type] || '#999'}
                  filter="url(#shadow)"
                  className="transition-all duration-200"
                />
                {/* Node ring effect when selected */}
                {isSelected && (
                  <circle
                    r="30"
                    fill="none"
                    stroke={NODE_COLORS[node.type] || '#999'}
                    strokeWidth="2"
                    opacity="0.3"
                    className="animate-pulse"
                  />
                )}
                <circle
                  r={isSelected ? 25 : 20}
                  fill={gradientMap[node.type] || NODE_COLORS[node.type] || '#999'}
                  stroke={isSelected ? '#1F2937' : 'white'}
                  strokeWidth={isSelected ? 3 : 2}
                  className="transition-all duration-200 hover:r-[22]"
                />
                <text
                  y="35"
                  textAnchor="middle"
                  className="text-xs font-medium pointer-events-none select-none"
                  fill="#374151"
                >
                  {node.name.length > 15 ? node.name.slice(0, 15) + '...' : node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Minimap */}
      {showMinimap && (
        <div className="absolute bottom-4 right-4 w-48 h-36 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-purple-50/50" />
          <svg viewBox={`${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`} className="w-full h-full relative">
            {/* Edges in minimap */}
            {filteredEdges.map(edge => {
              const source = nodePositions.get(edge.source);
              const target = nodePositions.get(edge.target);
              if (!source || !target) return null;

              return (
                <line
                  key={`mini-${edge.source}-${edge.target}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="#E5E7EB"
                  strokeWidth="0.5"
                  opacity="0.5"
                />
              );
            })}

            {/* Nodes in minimap */}
            {Array.from(nodePositions.values()).map(node => (
              <circle
                key={`mini-${node.id}`}
                cx={node.x}
                cy={node.y}
                r="2"
                fill={NODE_COLORS[node.type] || '#999'}
                opacity="0.8"
              />
            ))}

            {/* Viewport indicator */}
            <rect
              x={viewBox.x}
              y={viewBox.y}
              width={dimensions.width / viewBox.zoom}
              height={dimensions.height / viewBox.zoom}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="2"
              strokeDasharray="5 5"
              className="animate-pulse"
            />
          </svg>
          <div className="absolute top-1 left-1 text-xs font-medium text-gray-600">Minimap</div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => setShowMinimap(!showMinimap)}
          className="px-4 py-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2 border border-gray-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          {showMinimap ? 'Hide' : 'Show'} Minimap
        </button>
        <button
          onClick={() => setViewBox({ x: 0, y: 0, zoom: 1 })}
          className="px-4 py-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2 border border-gray-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset View
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-xl border border-gray-200">
        <h3 className="font-semibold mb-3 text-gray-800 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          Entity Types
        </h3>
        <div className="space-y-2">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-3 group">
              <div className="relative">
                <div 
                  className="w-5 h-5 rounded-full shadow-sm group-hover:scale-110 transition-transform" 
                  style={{ backgroundColor: color }} 
                />
                <div 
                  className="absolute inset-0 w-5 h-5 rounded-full animate-ping opacity-20" 
                  style={{ backgroundColor: color }} 
                />
              </div>
              <span className="text-sm capitalize font-medium text-gray-700">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}