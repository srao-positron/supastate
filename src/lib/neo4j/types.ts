// Neo4j node and relationship types

export interface MemoryNode {
  id: string
  content: string
  embedding: number[]
  project_name: string
  user_id?: string
  team_id?: string
  chunk_id?: string
  created_at: string
  occurred_at: string
  updated_at: string
  type?: string
  understanding_level?: number
  confidence?: number
  misconceptions?: string[]
  breakthroughs?: string[]
  metadata?: Record<string, any>
}

export interface CodeEntityNode {
  id: string
  name: string
  type: 'function' | 'class' | 'module' | 'interface' | 'method' | 'property'
  file_path: string
  embedding: number[]
  source_code?: string
  language: string
  signature?: string
  docstring?: string
  project_name: string
  metadata?: Record<string, any>
}

export interface ProjectNode {
  id: string
  name: string
  total_memories: number
  key_patterns?: string[]
  common_issues?: string[]
  architectural_decisions?: Record<string, any>
}

export interface InsightNode {
  id: string
  summary: string
  category: 'performance' | 'security' | 'architecture' | 'bug' | 'feature' | 'other'
  confidence: number
  evidence: string[] // Memory IDs that support this insight
  embedding?: number[]
}

export interface UserNode {
  id: string
  email: string
  github_username?: string
  team_id?: string
}

export interface TeamNode {
  id: string
  name: string
  github_org?: string
}

// Relationship types
export type MemoryRelationType = 
  | 'DISCUSSES'
  | 'MODIFIES' 
  | 'DEBUGS'
  | 'DOCUMENTS'
  | 'REFACTORS'
  | 'PRECEDED_BY'
  | 'EVOLVED_INTO'
  | 'LED_TO_UNDERSTANDING'
  | 'BUILT_UPON'
  | 'REFERENCES'
  | 'BELONGS_TO_PROJECT'
  | 'SUPPORTS'
  | 'DISCUSSES_API'

export type CodeRelationType =
  | 'CALLS'
  | 'IMPORTS'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'USES'
  | 'HAS_METHOD'
  | 'HAS_PROPERTY'
  | 'AFFECTED'

export type UserRelationType =
  | 'CREATED'
  | 'LEARNED_FROM'
  | 'MEMBER_OF'

// Search types
export interface VectorSearchOptions {
  embedding: number[]
  limit?: number
  threshold?: number
  projectFilter?: string
  userFilter?: string
  teamFilter?: string
}

export interface GraphSearchOptions {
  startNodeId: string
  relationshipTypes: string[]
  maxDepth: number
  direction?: 'OUTGOING' | 'INCOMING' | 'BOTH'
}

export interface HybridSearchOptions {
  embedding?: number[]
  graphPattern?: string // Cypher pattern
  filters: {
    projectName?: string
    timeRange?: {
      start: Date
      end: Date
    }
    entityTypes?: string[]
    minSimilarity?: number
  }
  includeRelated?: {
    types: string[]
    maxDepth: number
  }
}

// Result types
export interface SearchResult<T = any> {
  node: T
  score?: number
  path?: any[]
  relationships?: any[]
}

export interface KnowledgeGraph {
  nodes: Array<MemoryNode | CodeEntityNode | ProjectNode | InsightNode>
  relationships: Array<{
    startId: string
    endId: string
    type: string
    properties?: Record<string, any>
  }>
  stats: {
    totalNodes: number
    totalRelationships: number
    nodeTypes: Record<string, number>
    relationshipTypes: Record<string, number>
  }
}