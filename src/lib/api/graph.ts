import { createClient } from '@/lib/supabase/client';
import { GraphData, GraphNode, GraphEdge } from '@/types/graph';

// Mock data generator for demonstration
// In production, this would fetch from your actual code analysis backend
function generateMockGraphData(): GraphData {
  const nodes: GraphNode[] = [
    // Core modules
    {
      id: 'auth-module',
      name: 'AuthModule',
      type: 'module',
      filePath: '/src/modules/auth/index.ts',
      lineNumber: 1,
      description: 'Handles user authentication and authorization',
    },
    {
      id: 'user-service',
      name: 'UserService',
      type: 'class',
      filePath: '/src/services/user.service.ts',
      lineNumber: 15,
      description: 'Service for managing user operations',
      methods: [
        {
          name: 'findById',
          params: [{ name: 'id', type: 'string' }],
          returnType: 'Promise<User>',
          visibility: 'public',
        },
        {
          name: 'updateProfile',
          params: [
            { name: 'id', type: 'string' },
            { name: 'data', type: 'UpdateProfileDto' },
          ],
          returnType: 'Promise<User>',
          visibility: 'public',
        },
      ],
    },
    {
      id: 'auth-controller',
      name: 'AuthController',
      type: 'class',
      filePath: '/src/controllers/auth.controller.ts',
      lineNumber: 8,
      properties: [
        { name: 'authService', type: 'AuthService', visibility: 'private' },
      ],
      methods: [
        {
          name: 'login',
          params: [{ name: 'credentials', type: 'LoginDto' }],
          returnType: 'Promise<AuthResponse>',
          visibility: 'public',
        },
        {
          name: 'logout',
          params: [],
          returnType: 'Promise<void>',
          visibility: 'public',
        },
      ],
    },
    {
      id: 'validate-user',
      name: 'validateUser',
      type: 'function',
      filePath: '/src/utils/auth.utils.ts',
      lineNumber: 23,
      params: [
        { name: 'email', type: 'string' },
        { name: 'password', type: 'string' },
      ],
      returnType: 'Promise<boolean>',
    },
    {
      id: 'user-interface',
      name: 'IUser',
      type: 'interface',
      filePath: '/src/types/user.types.ts',
      lineNumber: 5,
      properties: [
        { name: 'id', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'createdAt', type: 'Date' },
      ],
    },
    {
      id: 'auth-guard',
      name: 'AuthGuard',
      type: 'class',
      filePath: '/src/guards/auth.guard.ts',
      lineNumber: 12,
    },
    {
      id: 'jwt-strategy',
      name: 'JwtStrategy',
      type: 'class',
      filePath: '/src/strategies/jwt.strategy.ts',
      lineNumber: 7,
    },
    {
      id: 'hash-password',
      name: 'hashPassword',
      type: 'function',
      filePath: '/src/utils/crypto.utils.ts',
      lineNumber: 5,
      params: [{ name: 'password', type: 'string' }],
      returnType: 'Promise<string>',
    },
    {
      id: 'memory-service',
      name: 'MemoryService',
      type: 'class',
      filePath: '/src/services/memory.service.ts',
      lineNumber: 20,
      methods: [
        {
          name: 'search',
          params: [{ name: 'query', type: 'string' }],
          returnType: 'Promise<Memory[]>',
          visibility: 'public',
        },
        {
          name: 'vectorSearch',
          params: [
            { name: 'embedding', type: 'number[]' },
            { name: 'limit', type: 'number' },
          ],
          returnType: 'Promise<Memory[]>',
          visibility: 'public',
        },
      ],
    },
    {
      id: 'graph-analyzer',
      name: 'GraphAnalyzer',
      type: 'class',
      filePath: '/src/analyzers/graph.analyzer.ts',
      lineNumber: 11,
      methods: [
        {
          name: 'analyzeCodebase',
          params: [{ name: 'path', type: 'string' }],
          returnType: 'Promise<GraphData>',
          visibility: 'public',
        },
      ],
    },
  ];

  const edges: GraphEdge[] = [
    // Module dependencies
    { source: 'auth-module', target: 'auth-controller', type: 'imports' },
    { source: 'auth-module', target: 'auth-guard', type: 'imports' },
    { source: 'auth-module', target: 'jwt-strategy', type: 'imports' },
    
    // Controller dependencies
    { source: 'auth-controller', target: 'user-service', type: 'calls', count: 3 },
    { source: 'auth-controller', target: 'validate-user', type: 'calls', count: 1 },
    { source: 'auth-controller', target: 'hash-password', type: 'calls', count: 2 },
    
    // Service dependencies
    { source: 'user-service', target: 'user-interface', type: 'implements' },
    { source: 'auth-guard', target: 'jwt-strategy', type: 'calls', count: 1 },
    { source: 'jwt-strategy', target: 'user-service', type: 'calls', count: 1 },
    
    // Cross-module dependencies
    { source: 'memory-service', target: 'user-service', type: 'calls', count: 2 },
    { source: 'graph-analyzer', target: 'memory-service', type: 'calls', count: 1 },
  ];

  // Add more random nodes for a richer graph
  for (let i = 0; i < 20; i++) {
    const types: Array<GraphNode['type']> = ['function', 'class', 'interface', 'type'];
    const type = types[Math.floor(Math.random() * types.length)];
    const node: GraphNode = {
      id: `node-${i}`,
      name: `${type}${i}`,
      type,
      filePath: `/src/generated/${type}s/${type}${i}.ts`,
      lineNumber: Math.floor(Math.random() * 100) + 1,
    };
    nodes.push(node);
    
    // Add random edges
    if (Math.random() > 0.3) {
      const targetIndex = Math.floor(Math.random() * nodes.length);
      const edgeTypes: Array<GraphEdge['type']> = ['calls', 'imports', 'extends', 'implements'];
      edges.push({
        source: node.id,
        target: nodes[targetIndex].id,
        type: edgeTypes[Math.floor(Math.random() * edgeTypes.length)],
        count: Math.floor(Math.random() * 5) + 1,
      });
    }
  }

  return {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function getGraphData(): Promise<GraphData> {
  try {
    // Fetch real code graph data from Neo4j
    const response = await fetch('/api/graph/code', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch graph data');
    }

    const data = await response.json();
    
    // If no data from Neo4j, use mock data as fallback
    if (!data.nodes || data.nodes.length === 0) {
      console.log('No code entities found, using mock data');
      return generateMockGraphData();
    }

    return data;
  } catch (error) {
    console.error('Error fetching graph data:', error);
    // Return mock data as fallback
    return generateMockGraphData();
  }
}

export async function searchGraphEntities(query: string): Promise<GraphNode[]> {
  const supabase = createClient();
  
  try {
    // Search in memories table using full-text search
    const { data: memories, error } = await supabase
      .from('memories')
      .select('*')
      .textSearch('content', query)
      .limit(10);

    if (error) throw error;

    // Convert memories to graph nodes
    const nodes: GraphNode[] = memories.map((memory, index) => ({
      id: `memory-${memory.id}`,
      name: memory.title || `Memory ${index + 1}`,
      type: 'function',
      filePath: memory.metadata?.filePath || 'unknown',
      lineNumber: memory.metadata?.lineNumber || 1,
      description: memory.content?.substring(0, 100) + '...',
    }));

    return nodes;
  } catch (error) {
    console.error('Error searching graph entities:', error);
    return [];
  }
}

export async function getEntityRelationships(entityId: string): Promise<GraphEdge[]> {
  const supabase = createClient();
  
  try {
    // Fetch relationships from Supabase
    const { data: relationships, error } = await supabase
      .from('code_relationships')
      .select('*')
      .or(`source.eq.${entityId},target.eq.${entityId}`)
      .limit(50);

    if (error) throw error;

    return relationships.map(rel => ({
      source: rel.source,
      target: rel.target,
      type: rel.type,
      count: rel.count || 1,
    }));
  } catch (error) {
    console.error('Error fetching entity relationships:', error);
    return [];
  }
}

export async function analyzeCodebase(repoPath: string): Promise<GraphData> {
  const supabase = createClient();
  
  try {
    // In a real implementation, this would trigger a code analysis job
    // For now, we'll simulate the process
    const analysisResult = generateMockGraphData();
    
    // Store the analysis result
    const { data, error } = await supabase
      .from('code_graphs')
      .insert({
        repository: repoPath,
        branch: 'main',
        data: analysisResult,
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Also create vector embeddings for entities
    for (const node of analysisResult.nodes) {
      await supabase.from('memories').insert({
        title: node.name,
        content: `${node.type}: ${node.name} at ${node.filePath}:${node.lineNumber}`,
        type: 'code_entity',
        metadata: {
          nodeId: node.id,
          entityType: node.type,
          filePath: node.filePath,
          lineNumber: node.lineNumber,
        },
      });
    }

    return analysisResult;
  } catch (error) {
    console.error('Error analyzing codebase:', error);
    throw error;
  }
}