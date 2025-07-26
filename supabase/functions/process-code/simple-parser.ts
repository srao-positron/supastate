import ts from 'https://esm.sh/typescript@5.3.3'

export interface CodeEntity {
  id: string
  type: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'import' | 'jsx_component'
  name: string
  signature?: string
  content: string
  lineStart: number
  lineEnd: number
  columnStart?: number
  columnEnd?: number
  metadata: any
}

export class SimpleTypeScriptParser {
  parse(content: string, filePath: string): { entities: CodeEntity[], relationships: any[] } {
    const entities: CodeEntity[] = []
    
    try {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      )
      
      const visit = (node: ts.Node) => {
        try {
          if (ts.isFunctionDeclaration(node) && node.name) {
            entities.push({
              id: crypto.randomUUID(),
              type: 'function',
              name: node.name.getText(),
              content: node.getText(),
              lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
              metadata: {}
            })
          } else if (ts.isClassDeclaration(node) && node.name) {
            entities.push({
              id: crypto.randomUUID(),
              type: 'class',
              name: node.name.getText(),
              content: node.getText(),
              lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
              metadata: {}
            })
          }
        } catch (e) {
          console.error(`[SimpleParser] Error processing node: ${e}`)
        }
        
        ts.forEachChild(node, visit)
      }
      
      visit(sourceFile)
    } catch (error) {
      console.error(`[SimpleParser] Parse error: ${error}`)
    }
    
    return { entities, relationships: [] }
  }
}