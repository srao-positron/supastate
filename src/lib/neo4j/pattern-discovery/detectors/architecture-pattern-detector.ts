/**
 * Architecture Pattern Detector
 * 
 * Discovers patterns in code organization and system design:
 * - Module dependency patterns
 * - Layered architecture patterns
 * - Design pattern usage
 * - Code organization patterns
 */

import { neo4jService } from '../../service'
import { log } from '@/lib/logger'
import { Pattern, PatternType, PatternDetector, ArchitecturePattern, Evidence } from '../types'
import { getNumericValue } from '../utils'

export class ArchitecturePatternDetector implements PatternDetector {
  
  async detectPatterns(options: {
    workspaceId?: string
    projectName?: string
    timeRange?: { start: Date, end: Date }
    minConfidence?: number
  } = {}): Promise<ArchitecturePattern[]> {
    log.info('Detecting architecture patterns', options)
    
    const patterns: ArchitecturePattern[] = []
    
    // Run different architecture pattern detections
    const [
      moduleDependencyPatterns,
      layeredArchitecturePatterns,
      designPatternUsage,
      codeOrganizationPatterns
    ] = await Promise.all([
      this.detectModuleDependencyPatterns(options),
      this.detectLayeredArchitecturePatterns(options),
      this.detectDesignPatternUsage(options),
      this.detectCodeOrganizationPatterns(options)
    ])
    
    patterns.push(...moduleDependencyPatterns)
    patterns.push(...layeredArchitecturePatterns)
    patterns.push(...designPatternUsage)
    patterns.push(...codeOrganizationPatterns)
    
    return patterns
  }
  
  /**
   * Detect module dependency patterns
   */
  private async detectModuleDependencyPatterns(options: any): Promise<ArchitecturePattern[]> {
    const query = `
      // Find import relationships between code entities
      MATCH (importer:CodeEntity)-[:USES_IMPORT]->(imported:CodeEntity)
      WHERE importer.type IN ['class', 'function', 'module']
        ${options.workspaceId ? 'AND importer.workspace_id = $workspaceId' : ''}
        ${options.projectName ? 'AND importer.project_name = $projectName' : ''}
      
      // Group by module patterns
      WITH importer.file_path as importerPath,
           imported.file_path as importedPath,
           COUNT(*) as importCount
      
      WITH CASE
             WHEN importedPath CONTAINS '/utils/' OR importedPath CONTAINS '/helpers/' THEN 'utility-pattern'
             WHEN importedPath CONTAINS '/services/' OR importedPath CONTAINS '/api/' THEN 'service-pattern'
             WHEN importedPath CONTAINS '/components/' OR importedPath CONTAINS '/views/' THEN 'ui-pattern'
             WHEN importedPath CONTAINS '/models/' OR importedPath CONTAINS '/entities/' THEN 'data-pattern'
             WHEN importerPath CONTAINS importedPath OR importedPath CONTAINS importerPath THEN 'cohesive-pattern'
             ELSE 'cross-module-pattern'
           END as dependencyPattern,
           AVG(importCount) as avgImports,
           COUNT(*) as frequency
      
      WHERE frequency > 5
      RETURN dependencyPattern, avgImports, frequency
      ORDER BY frequency DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: options.workspaceId,
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `architecture-dependency-${record.dependencyPattern}`,
      type: PatternType.ARCHITECTURE,
      name: `Module Dependency: ${record.dependencyPattern}`,
      description: `${record.dependencyPattern} with average ${getNumericValue(record.avgImports).toFixed(1)} imports per module`,
      confidence: Math.min(getNumericValue(record.frequency) / 50, 1), // More occurrences = higher confidence
      frequency: getNumericValue(record.frequency),
      evidence: [
        {
          type: 'structural',
          description: `Average imports: ${getNumericValue(record.avgImports).toFixed(1)}`,
          weight: 0.5,
          examples: []
        },
        {
          type: 'outcome',
          description: `Pattern found ${getNumericValue(record.frequency)} times`,
          weight: 0.5,
          examples: []
        }
      ],
      metadata: {
        patternName: record.dependencyPattern,
        components: [],
        dependencies: []
      }
    } as ArchitecturePattern))
  }
  
  /**
   * Detect layered architecture patterns
   */
  private async detectLayeredArchitecturePatterns(options: any): Promise<ArchitecturePattern[]> {
    const query = `
      // Analyze directory structure for layering
      MATCH (c:CodeEntity)
      WHERE c.file_path IS NOT NULL
        ${options.workspaceId ? 'AND c.workspace_id = $workspaceId' : ''}
        ${options.projectName ? 'AND c.project_name = $projectName' : ''}
      
      WITH c,
           CASE
             WHEN c.file_path CONTAINS '/controllers/' OR c.file_path CONTAINS '/routes/' THEN 'presentation'
             WHEN c.file_path CONTAINS '/services/' OR c.file_path CONTAINS '/business/' THEN 'business'
             WHEN c.file_path CONTAINS '/repositories/' OR c.file_path CONTAINS '/dao/' THEN 'data'
             WHEN c.file_path CONTAINS '/models/' OR c.file_path CONTAINS '/entities/' THEN 'domain'
             WHEN c.file_path CONTAINS '/utils/' OR c.file_path CONTAINS '/helpers/' THEN 'cross-cutting'
             ELSE 'other'
           END as layer
      
      WITH layer, COUNT(DISTINCT c.file_path) as fileCount, COUNT(c) as entityCount
      WHERE layer <> 'other'
      
      RETURN layer, fileCount, entityCount
      ORDER BY fileCount DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: options.workspaceId,
      projectName: options.projectName
    })
    
    if (result.records.length < 2) {
      return [] // Need at least 2 layers for a pattern
    }
    
    const layers = result.records.map((r: any) => r.layer)
    const totalFiles = result.records.reduce((sum: any, r: any) => sum + getNumericValue(r.fileCount), 0)
    
    return [{
      id: 'architecture-layered-structure',
      type: PatternType.ARCHITECTURE,
      name: 'Layered Architecture Pattern',
      description: `${layers.length}-layer architecture with ${totalFiles} files`,
      confidence: Math.min(layers.length / 4, 1), // 4+ layers = max confidence
      frequency: totalFiles,
      evidence: result.records.map((record: any) => ({
        type: 'structural',
        description: `${record.layer} layer: ${getNumericValue(record.fileCount)} files, ${getNumericValue(record.entityCount)} entities`,
        weight: 1.0 / result.records.length,
        examples: []
      })),
      metadata: {
        patternName: 'layered-architecture',
        components: layers,
        dependencies: []
      }
    } as ArchitecturePattern]
  }
  
  /**
   * Detect common design pattern usage
   */
  private async detectDesignPatternUsage(options: any): Promise<ArchitecturePattern[]> {
    const query = `
      // Look for common design pattern indicators in class/function names
      MATCH (c:CodeEntity)
      WHERE c.type IN ['class', 'interface']
        ${options.workspaceId ? 'AND c.workspace_id = $workspaceId' : ''}
        ${options.projectName ? 'AND c.project_name = $projectName' : ''}
      
      WITH c,
           CASE
             WHEN c.name =~ '.*Factory$' OR c.name =~ '.*Factory[A-Z].*' THEN 'factory'
             WHEN c.name =~ '.*Builder$' OR c.name =~ '.*Builder[A-Z].*' THEN 'builder'
             WHEN c.name =~ '.*Singleton$' OR c.name =~ '.*Singleton[A-Z].*' THEN 'singleton'
             WHEN c.name =~ '.*Observer$' OR c.name =~ '.*Listener$' THEN 'observer'
             WHEN c.name =~ '.*Strategy$' OR c.name =~ '.*Strategy[A-Z].*' THEN 'strategy'
             WHEN c.name =~ '.*Adapter$' OR c.name =~ '.*Wrapper$' THEN 'adapter'
             WHEN c.name =~ '.*Repository$' OR c.name =~ '.*Repo$' THEN 'repository'
             WHEN c.name =~ '.*Service$' OR c.name =~ '.*Manager$' THEN 'service'
             WHEN c.name =~ '.*Controller$' OR c.name =~ '.*Handler$' THEN 'controller'
             ELSE 'none'
           END as pattern
      
      WHERE pattern <> 'none'
      
      WITH pattern, COUNT(*) as usageCount, COLLECT(DISTINCT c.name)[0..5] as examples
      WHERE usageCount > 2
      
      RETURN pattern, usageCount, examples
      ORDER BY usageCount DESC
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: options.workspaceId,
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `architecture-design-pattern-${record.pattern}`,
      type: PatternType.ARCHITECTURE,
      name: `Design Pattern: ${record.pattern}`,
      description: `${record.pattern} pattern used ${getNumericValue(record.usageCount)} times`,
      confidence: 0.8, // High confidence for explicit naming
      frequency: getNumericValue(record.usageCount),
      evidence: [
        {
          type: 'structural',
          description: `Found in class/interface names`,
          weight: 0.7,
          examples: record.examples || []
        },
        {
          type: 'outcome',
          description: `Consistent naming convention`,
          weight: 0.3,
          examples: []
        }
      ],
      metadata: {
        patternName: record.pattern,
        components: record.examples || [],
        dependencies: []
      }
    } as ArchitecturePattern))
  }
  
  /**
   * Detect code organization patterns
   */
  private async detectCodeOrganizationPatterns(options: any): Promise<ArchitecturePattern[]> {
    const query = `
      // Analyze file organization patterns
      MATCH (c:CodeEntity)
      WHERE c.file_path IS NOT NULL
        ${options.workspaceId ? 'AND c.workspace_id = $workspaceId' : ''}
        ${options.projectName ? 'AND c.project_name = $projectName' : ''}
      
      WITH c.file_path as filePath,
           c.type as entityType,
           COUNT(*) as entityCount
      
      // Extract directory depth and structure
      WITH filePath,
           size(split(filePath, '/')) - 1 as depth,
           entityCount
      
      WITH AVG(depth) as avgDepth,
           STDEV(depth) as stdDevDepth,
           SUM(entityCount) as totalEntities,
           COUNT(DISTINCT filePath) as fileCount
      
      RETURN CASE
               WHEN avgDepth < 3 AND stdDevDepth < 1 THEN 'flat-structure'
               WHEN avgDepth > 5 AND stdDevDepth > 2 THEN 'deep-nesting'
               WHEN avgDepth BETWEEN 3 AND 5 AND stdDevDepth < 1.5 THEN 'balanced-structure'
               ELSE 'mixed-structure'
             END as organizationPattern,
             avgDepth,
             stdDevDepth,
             totalEntities,
             fileCount
    `
    
    const result = await neo4jService.executeQuery(query, {
      workspaceId: options.workspaceId,
      projectName: options.projectName
    })
    
    return result.records.map((record: any) => ({
      id: `architecture-organization-${record.organizationPattern}`,
      type: PatternType.ARCHITECTURE,
      name: `Code Organization: ${record.organizationPattern}`,
      description: `${record.organizationPattern} with average depth ${getNumericValue(record.avgDepth).toFixed(1)} (±${getNumericValue(record.stdDevDepth).toFixed(1)})`,
      confidence: record.organizationPattern === 'balanced-structure' ? 0.9 : 0.6,
      frequency: getNumericValue(record.fileCount),
      evidence: [
        {
          type: 'structural',
          description: `${getNumericValue(record.fileCount)} files, ${getNumericValue(record.totalEntities)} entities`,
          weight: 0.5,
          examples: []
        },
        {
          type: 'outcome',
          description: `Average nesting depth: ${getNumericValue(record.avgDepth).toFixed(1)}`,
          weight: 0.5,
          examples: []
        }
      ],
      metadata: {
        patternName: record.organizationPattern,
        components: [],
        dependencies: [],
        metrics: {
          avgDepth: getNumericValue(record.avgDepth),
          stdDevDepth: getNumericValue(record.stdDevDepth),
          fileCount: getNumericValue(record.fileCount),
          entityCount: getNumericValue(record.totalEntities)
        }
      }
    } as ArchitecturePattern))
  }
  
  async validatePattern(pattern: Pattern): Promise<{
    stillValid: boolean
    confidenceChange: number
  }> {
    // Check if architectural patterns still exist
    const query = `
      MATCH (c:CodeEntity)
      WHERE c.type IN ['class', 'interface', 'function', 'module']
      RETURN COUNT(c) as codeEntityCount
      LIMIT 1
    `
    
    const result = await neo4jService.executeQuery(query, {})
    const count = getNumericValue(result.records[0]?.codeEntityCount)
    
    return {
      stillValid: count > pattern.frequency * 0.5,
      confidenceChange: count > pattern.frequency ? 0.1 : -0.1
    }
  }
}