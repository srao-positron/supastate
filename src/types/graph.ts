export interface GraphNode {
  id: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'module';
  filePath: string;
  lineNumber: number;
  description?: string;
  params?: Array<{
    name: string;
    type: string;
  }>;
  returnType?: string;
  properties?: Array<{
    name: string;
    type: string;
    visibility?: 'public' | 'private' | 'protected';
  }>;
  methods?: Array<{
    name: string;
    params: Array<{ name: string; type: string }>;
    returnType: string;
    visibility?: 'public' | 'private' | 'protected';
  }>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'calls' | 'imports' | 'extends' | 'implements';
  count?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: {
    totalNodes: number;
    totalEdges: number;
    generatedAt: string;
  };
}

export interface GraphFilter {
  entityTypes: string[];
  relationshipTypes: string[];
  searchQuery: string;
}