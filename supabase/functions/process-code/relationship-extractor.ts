import ts from 'https://esm.sh/typescript@5.3.3'

export interface ExtractedRelationship {
  fromId: string
  toName: string // Target name that needs to be resolved
  type: 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'INSTANTIATES' | 'USES_TYPE' | 'REFERENCES'
  properties?: Record<string, any>
}

export class RelationshipExtractor {
  private relationships: ExtractedRelationship[] = []
  private currentScope: { type: string; id: string } | null = null
  private importMap: Map<string, { source: string; items: string[] }> = new Map()
  
  constructor(private sourceFile: ts.SourceFile) {}
  
  extract(currentScope: { type: string; id: string } | null): ExtractedRelationship[] {
    this.relationships = []
    this.currentScope = currentScope
    return this.relationships
  }
  
  visitNode(node: ts.Node) {
    // Extract different types of relationships based on node type
    if (ts.isCallExpression(node)) {
      this.extractCallRelationship(node)
    } else if (ts.isNewExpression(node)) {
      this.extractInstantiationRelationship(node)
    } else if (ts.isPropertyAccessExpression(node)) {
      this.extractPropertyAccessRelationship(node)
    } else if (ts.isIdentifier(node) && this.currentScope) {
      // Check if this identifier references a type or variable
      const parent = node.parent
      if (ts.isTypeReferenceNode(parent) || ts.isHeritageClause(parent)) {
        this.extractTypeReference(node)
      }
    }
    
    // Continue traversing
    ts.forEachChild(node, child => this.visitNode(child))
  }
  
  private extractCallRelationship(node: ts.CallExpression) {
    if (!this.currentScope) return
    
    let targetName: string | null = null
    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
    
    // Extract the function being called
    if (ts.isIdentifier(node.expression)) {
      targetName = node.expression.getText()
    } else if (ts.isPropertyAccessExpression(node.expression)) {
      // Handle method calls like obj.method()
      const propAccess = node.expression
      if (ts.isIdentifier(propAccess.name)) {
        targetName = propAccess.name.getText()
        
        // Also track the object being accessed
        if (ts.isIdentifier(propAccess.expression)) {
          const objName = propAccess.expression.getText()
          this.relationships.push({
            fromId: this.currentScope.id,
            toName: objName,
            type: 'REFERENCES',
            properties: {
              line,
              accessType: 'property',
              propertyName: targetName
            }
          })
        }
      }
    }
    
    if (targetName) {
      this.relationships.push({
        fromId: this.currentScope.id,
        toName: targetName,
        type: 'CALLS',
        properties: {
          line,
          argumentCount: node.arguments.length
        }
      })
    }
  }
  
  private extractInstantiationRelationship(node: ts.NewExpression) {
    if (!this.currentScope) return
    
    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
    let className: string | null = null
    
    if (ts.isIdentifier(node.expression)) {
      className = node.expression.getText()
    } else if (ts.isPropertyAccessExpression(node.expression)) {
      // Handle namespaced constructors
      className = node.expression.getText()
    }
    
    if (className) {
      this.relationships.push({
        fromId: this.currentScope.id,
        toName: className,
        type: 'INSTANTIATES',
        properties: {
          line,
          argumentCount: node.arguments?.length || 0
        }
      })
    }
  }
  
  private extractPropertyAccessRelationship(node: ts.PropertyAccessExpression) {
    if (!this.currentScope) return
    
    // Skip if this is part of a larger expression we've already handled
    if (ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent)) {
      return
    }
    
    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
    
    if (ts.isIdentifier(node.expression)) {
      const objName = node.expression.getText()
      const propName = node.name.getText()
      
      this.relationships.push({
        fromId: this.currentScope.id,
        toName: objName,
        type: 'REFERENCES',
        properties: {
          line,
          accessType: 'property',
          propertyName: propName
        }
      })
    }
  }
  
  private extractTypeReference(node: ts.Identifier) {
    if (!this.currentScope) return
    
    const typeName = node.getText()
    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
    
    this.relationships.push({
      fromId: this.currentScope.id,
      toName: typeName,
      type: 'USES_TYPE',
      properties: {
        line,
        context: this.getTypeContext(node)
      }
    })
  }
  
  private getTypeContext(node: ts.Node): string {
    const parent = node.parent
    
    if (ts.isTypeReferenceNode(parent)) {
      return 'type_annotation'
    } else if (ts.isHeritageClause(parent)) {
      return parent.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements'
    } else if (ts.isParameter(parent)) {
      return 'parameter_type'
    } else if (ts.isPropertyDeclaration(parent)) {
      return 'property_type'
    }
    
    return 'other'
  }
  
  // Extract imports for later resolution
  extractImports(node: ts.ImportDeclaration): Map<string, { source: string; items: string[] }> {
    const importMap = new Map<string, { source: string; items: string[] }>()
    const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, '')
    
    if (node.importClause) {
      const clause = node.importClause
      
      // Default import
      if (clause.name) {
        const name = clause.name.getText()
        importMap.set(name, { source: moduleSpecifier, items: ['default'] })
      }
      
      // Named imports
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          // import * as name from 'module'
          const name = clause.namedBindings.name.getText()
          importMap.set(name, { source: moduleSpecifier, items: ['*'] })
        } else if (ts.isNamedImports(clause.namedBindings)) {
          // import { a, b as c } from 'module'
          clause.namedBindings.elements.forEach(element => {
            const importedName = element.propertyName?.getText() || element.name.getText()
            const localName = element.name.getText()
            importMap.set(localName, { source: moduleSpecifier, items: [importedName] })
          })
        }
      }
    }
    
    return importMap
  }
}