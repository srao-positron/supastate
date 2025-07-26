// Standalone test for the parser
import ts from 'https://esm.sh/typescript@5.3.3'

const testCode = `
export function hello() {
  return "world";
}
`

try {
  console.log('Creating source file...')
  const sourceFile = ts.createSourceFile(
    'test.ts',
    testCode,
    ts.ScriptTarget.Latest,
    true
  )
  
  console.log('Source file created successfully')
  
  // Test traversal
  const visit = (node: ts.Node, depth = 0) => {
    const indent = '  '.repeat(depth)
    console.log(`${indent}${ts.SyntaxKind[node.kind]}`)
    
    if (ts.isFunctionDeclaration(node)) {
      console.log(`${indent}  Name: ${node.name?.getText()}`)
      console.log(`${indent}  Modifiers: ${node.modifiers?.map(m => ts.SyntaxKind[m.kind]).join(', ')}`)
    }
    
    ts.forEachChild(node, child => visit(child, depth + 1))
  }
  
  visit(sourceFile)
  
} catch (error) {
  console.error('Error:', error)
  console.error('Stack:', error.stack)
}