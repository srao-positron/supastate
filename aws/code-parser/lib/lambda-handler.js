"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const parser = require("@babel/parser");
const traverse_1 = require("@babel/traverse");
const t = require("@babel/types");
async function handler(event) {
    const { code, language, filename } = event;
    // Route to appropriate parser based on language
    switch (language.toLowerCase()) {
        case 'typescript':
        case 'tsx':
        case 'javascript':
        case 'jsx':
        case 'js':
        case 'ts':
            return parseJavaScriptTypeScript(code, language);
        case 'python':
        case 'py':
            return parsePython(code);
        default:
            return {
                imports: [],
                exports: [],
                functions: [],
                classes: [],
                components: [],
                types: [],
                variables: [],
                apiCalls: [],
                errors: [`Unsupported language: ${language}`]
            };
    }
}
function parseJavaScriptTypeScript(code, language) {
    const result = {
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        components: [],
        types: [],
        variables: [],
        apiCalls: [],
        errors: []
    };
    try {
        // Determine parser plugins based on file type
        const plugins = ['decorators-legacy'];
        if (language.includes('typescript') || language.includes('ts')) {
            plugins.push('typescript');
        }
        else {
            plugins.push('flow');
        }
        if (language.includes('x')) {
            plugins.push('jsx');
        }
        const ast = parser.parse(code, {
            sourceType: 'module',
            plugins,
            errorRecovery: true
        });
        (0, traverse_1.default)(ast, {
            // Imports
            ImportDeclaration(path) {
                const specifiers = path.node.specifiers.map(spec => {
                    if (t.isImportDefaultSpecifier(spec)) {
                        return 'default';
                    }
                    else if (t.isImportNamespaceSpecifier(spec)) {
                        return `* as ${spec.local.name}`;
                    }
                    else if (t.isImportSpecifier(spec)) {
                        return spec.imported.type === 'Identifier' ? spec.imported.name : 'unknown';
                    }
                    return 'unknown';
                });
                result.imports.push({
                    source: path.node.source.value,
                    specifiers
                });
            },
            // Exports
            ExportNamedDeclaration(path) {
                if (path.node.declaration) {
                    if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
                        result.exports.push({
                            name: path.node.declaration.id.name,
                            type: 'function'
                        });
                    }
                    else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
                        result.exports.push({
                            name: path.node.declaration.id.name,
                            type: 'class'
                        });
                    }
                    else if (t.isVariableDeclaration(path.node.declaration)) {
                        path.node.declaration.declarations.forEach(decl => {
                            if (t.isIdentifier(decl.id)) {
                                result.exports.push({
                                    name: decl.id.name,
                                    type: 'variable'
                                });
                            }
                        });
                    }
                }
            },
            ExportDefaultDeclaration(path) {
                result.exports.push({
                    name: 'default',
                    type: 'default'
                });
            },
            // Functions
            FunctionDeclaration(path) {
                if (path.node.id) {
                    result.functions.push({
                        name: path.node.id.name,
                        async: path.node.async || false,
                        generator: path.node.generator || false,
                        params: path.node.params.map(param => {
                            if (t.isIdentifier(param)) {
                                return param.name;
                            }
                            return 'complex';
                        }),
                        returnType: path.node.returnType ? 'typed' : undefined
                    });
                }
            },
            // Arrow functions assigned to variables
            VariableDeclarator(path) {
                if (t.isIdentifier(path.node.id) && t.isArrowFunctionExpression(path.node.init)) {
                    result.functions.push({
                        name: path.node.id.name,
                        async: path.node.init.async || false,
                        generator: false,
                        params: path.node.init.params.map(param => {
                            if (t.isIdentifier(param)) {
                                return param.name;
                            }
                            return 'complex';
                        })
                    });
                }
                // Track all variables
                if (t.isIdentifier(path.node.id) && path.parent.type === 'VariableDeclaration') {
                    const parent = path.parent;
                    result.variables.push({
                        name: path.node.id.name,
                        kind: parent.kind
                    });
                }
            },
            // Classes
            ClassDeclaration(path) {
                if (path.node.id) {
                    const methods = [];
                    path.node.body.body.forEach(member => {
                        if (t.isClassMethod(member) && t.isIdentifier(member.key)) {
                            methods.push(member.key.name);
                        }
                    });
                    result.classes.push({
                        name: path.node.id.name,
                        extends: path.node.superClass && t.isIdentifier(path.node.superClass)
                            ? path.node.superClass.name
                            : undefined,
                        methods
                    });
                    // Check if it's a React component
                    if (path.node.superClass &&
                        ((t.isIdentifier(path.node.superClass) && path.node.superClass.name === 'Component') ||
                            (t.isMemberExpression(path.node.superClass) &&
                                t.isIdentifier(path.node.superClass.object) &&
                                path.node.superClass.object.name === 'React'))) {
                        result.components.push({
                            name: path.node.id.name,
                            hooks: [],
                            props: []
                        });
                    }
                }
            },
            // TypeScript types
            TSTypeAliasDeclaration(path) {
                result.types.push({
                    name: path.node.id.name,
                    kind: 'type'
                });
            },
            TSInterfaceDeclaration(path) {
                result.types.push({
                    name: path.node.id.name,
                    kind: 'interface'
                });
            },
            TSEnumDeclaration(path) {
                result.types.push({
                    name: path.node.id.name,
                    kind: 'enum'
                });
            },
            // API Calls
            CallExpression(path) {
                // Detect fetch calls
                if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'fetch') {
                    const apiCall = { type: 'fetch' };
                    if (path.node.arguments[0] && t.isStringLiteral(path.node.arguments[0])) {
                        apiCall.url = path.node.arguments[0].value;
                    }
                    result.apiCalls.push(apiCall);
                }
                // Detect axios calls
                if (t.isMemberExpression(path.node.callee) &&
                    t.isIdentifier(path.node.callee.object) &&
                    path.node.callee.object.name === 'axios') {
                    const apiCall = { type: 'axios' };
                    if (t.isIdentifier(path.node.callee.property)) {
                        apiCall.method = path.node.callee.property.name;
                    }
                    result.apiCalls.push(apiCall);
                }
                // Detect React hooks in function components
                if (t.isIdentifier(path.node.callee) && path.node.callee.name.startsWith('use')) {
                    // Find the containing function component
                    let functionParent = path.getFunctionParent();
                    if (functionParent && functionParent.node) {
                        const node = functionParent.node;
                        let componentName = null;
                        // Check different function types
                        if (t.isFunctionDeclaration(node) && node.id) {
                            componentName = node.id.name;
                        }
                        else if (t.isVariableDeclarator(functionParent.parent) && t.isIdentifier(functionParent.parent.id)) {
                            componentName = functionParent.parent.id.name;
                        }
                        // Check if it starts with uppercase (React component convention)
                        if (componentName && componentName[0] === componentName[0].toUpperCase()) {
                            let component = result.components.find(c => c.name === componentName);
                            if (!component) {
                                component = {
                                    name: componentName,
                                    hooks: [],
                                    props: []
                                };
                                result.components.push(component);
                            }
                            if (!component.hooks.includes(path.node.callee.name)) {
                                component.hooks.push(path.node.callee.name);
                            }
                        }
                    }
                }
            }
        });
    }
    catch (error) {
        result.errors.push(error.message || 'Failed to parse JavaScript/TypeScript');
    }
    return result;
}
function parsePython(code) {
    const result = {
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        components: [],
        types: [],
        variables: [],
        apiCalls: [],
        errors: []
    };
    try {
        // Simple regex-based Python parser since we can't use subprocess in Lambda
        // This is a simplified parser but covers most common patterns
        // Extract imports
        const importRegex = /^import\s+(\S+)(?:\s+as\s+(\S+))?/gm;
        const fromImportRegex = /^from\s+(\S+)\s+import\s+(.+)/gm;
        let match;
        while ((match = importRegex.exec(code)) !== null) {
            result.imports.push({
                source: match[1],
                specifiers: [match[2] || match[1]]
            });
        }
        while ((match = fromImportRegex.exec(code)) !== null) {
            const specifiers = match[2].split(',').map(s => s.trim());
            result.imports.push({
                source: match[1],
                specifiers
            });
        }
        // Extract functions
        const functionRegex = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/gm;
        while ((match = functionRegex.exec(code)) !== null) {
            const isAsync = code.substring(match.index - 6, match.index).includes('async');
            const params = match[2] ? match[2].split(',').map(p => p.trim().split(':')[0].trim()) : [];
            result.functions.push({
                name: match[1],
                async: isAsync,
                generator: false,
                params: params.filter(p => p && p !== 'self')
            });
        }
        // Extract classes
        const classRegex = /^class\s+(\w+)(?:\s*\(([^)]*)\))?:/gm;
        while ((match = classRegex.exec(code)) !== null) {
            const className = match[1];
            const extendsClass = match[2] ? match[2].trim() : undefined;
            // Find methods in the class
            const classStart = match.index;
            let classEnd = code.length;
            // Find next class or end of file
            const nextClassMatch = classRegex.exec(code);
            if (nextClassMatch) {
                classEnd = nextClassMatch.index;
                classRegex.lastIndex = match.index + 1; // Reset to continue
            }
            const classCode = code.substring(classStart, classEnd);
            const methodRegex = /^\s{4,}(?:async\s+)?def\s+(\w+)\s*\(/gm;
            const methods = [];
            let methodMatch;
            while ((methodMatch = methodRegex.exec(classCode)) !== null) {
                methods.push(methodMatch[1]);
            }
            result.classes.push({
                name: className,
                extends: extendsClass,
                methods
            });
        }
        // Extract type hints (simple detection)
        const typeAliasRegex = /^(\w+)\s*:\s*Type\[/gm;
        while ((match = typeAliasRegex.exec(code)) !== null) {
            result.types.push({
                name: match[1],
                kind: 'type'
            });
        }
        // Detect API calls
        if (code.includes('requests.') || code.includes('httpx.') || code.includes('aiohttp.')) {
            result.apiCalls.push({ type: 'other' });
        }
    }
    catch (error) {
        result.errors.push(error.message || 'Failed to parse Python');
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFtYmRhLWhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9sYW1iZGEtaGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQXNEQSwwQkE4QkM7QUFwRkQsd0NBQXdDO0FBQ3hDLDhDQUF1QztBQUN2QyxrQ0FBa0M7QUFvRDNCLEtBQUssVUFBVSxPQUFPLENBQUMsS0FBbUI7SUFDL0MsTUFBTSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEdBQUcsS0FBSyxDQUFDO0lBRTNDLGdEQUFnRDtJQUNoRCxRQUFRLFFBQVEsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDO1FBQy9CLEtBQUssWUFBWSxDQUFDO1FBQ2xCLEtBQUssS0FBSyxDQUFDO1FBQ1gsS0FBSyxZQUFZLENBQUM7UUFDbEIsS0FBSyxLQUFLLENBQUM7UUFDWCxLQUFLLElBQUksQ0FBQztRQUNWLEtBQUssSUFBSTtZQUNQLE9BQU8seUJBQXlCLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRW5ELEtBQUssUUFBUSxDQUFDO1FBQ2QsS0FBSyxJQUFJO1lBQ1AsT0FBTyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFM0I7WUFDRSxPQUFPO2dCQUNMLE9BQU8sRUFBRSxFQUFFO2dCQUNYLE9BQU8sRUFBRSxFQUFFO2dCQUNYLFNBQVMsRUFBRSxFQUFFO2dCQUNiLE9BQU8sRUFBRSxFQUFFO2dCQUNYLFVBQVUsRUFBRSxFQUFFO2dCQUNkLEtBQUssRUFBRSxFQUFFO2dCQUNULFNBQVMsRUFBRSxFQUFFO2dCQUNiLFFBQVEsRUFBRSxFQUFFO2dCQUNaLE1BQU0sRUFBRSxDQUFDLHlCQUF5QixRQUFRLEVBQUUsQ0FBQzthQUM5QyxDQUFDO0lBQ04sQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLHlCQUF5QixDQUFDLElBQVksRUFBRSxRQUFnQjtJQUMvRCxNQUFNLE1BQU0sR0FBcUI7UUFDL0IsT0FBTyxFQUFFLEVBQUU7UUFDWCxPQUFP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QkFDckIsT0FBTzthQUNSLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCx3Q0FBd0M7UUFDeEMsTUFBTSxjQUFjLEdBQUcsdUJBQXVCLENBQUM7UUFDL0MsT0FBTyxDQUFDLEtBQUssR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDcEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUNkLElBQUksRUFBRSxNQUFNO2FBQ2IsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDdkYsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUMxQyxDQUFDO0lBRUgsQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sSUFBSSx3QkFBd0IsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGFyc2VyIGZyb20gJ0BiYWJlbC9wYXJzZXInO1xuaW1wb3J0IHRyYXZlcnNlIGZyb20gJ0BiYWJlbC90cmF2ZXJzZSc7XG5pbXBvcnQgKiBhcyB0IGZyb20gJ0BiYWJlbC90eXBlcyc7XG5cbmludGVyZmFjZSBQYXJzZVJlcXVlc3Qge1xuICBjb2RlOiBzdHJpbmc7XG4gIGxhbmd1YWdlOiBzdHJpbmc7XG4gIGZpbGVuYW1lPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGFyc2VkQXR0cmlidXRlcyB7XG4gIGltcG9ydHM6IEFycmF5PHtcbiAgICBzb3VyY2U6IHN0cmluZztcbiAgICBzcGVjaWZpZXJzOiBzdHJpbmdbXTtcbiAgfT47XG4gIGV4cG9ydHM6IEFycmF5PHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgdHlwZTogJ2Z1bmN0aW9uJyB8ICdjbGFzcycgfCAndmFyaWFibGUnIHwgJ3R5cGUnIHwgJ2RlZmF1bHQnO1xuICB9PjtcbiAgZnVuY3Rpb25zOiBBcnJheTx7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGFzeW5jOiBib29sZWFuO1xuICAgIGdlbmVyYXRvcjogYm9vbGVhbjtcbiAgICBwYXJhbXM6IHN0cmluZ1tdO1xuICAgIHJldHVyblR5cGU/OiBzdHJpbmc7XG4gIH0+O1xuICBjbGFzc2VzOiBBcnJheTx7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGV4dGVuZHM/OiBzdHJpbmc7XG4gICAgaW1wbGVtZW50cz86IHN0cmluZ1tdO1xuICAgIG1ldGhvZHM6IHN0cmluZ1tdO1xuICB9PjtcbiAgY29tcG9uZW50czogQXJyYXk8e1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBwcm9wcz86IHN0cmluZ1tdO1xuICAgIGhvb2tzOiBzdHJpbmdbXTtcbiAgfT47XG4gIHR5cGVzOiBBcnJheTx7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGtpbmQ6ICdpbnRlcmZhY2UnIHwgJ3R5cGUnIHwgJ2VudW0nO1xuICB9PjtcbiAgdmFyaWFibGVzOiBBcnJheTx7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGtpbmQ6ICdjb25zdCcgfCAnbGV0JyB8ICd2YXInO1xuICAgIHR5cGU/OiBzdHJpbmc7XG4gIH0+O1xuICBhcGlDYWxsczogQXJyYXk8e1xuICAgIHR5cGU6ICdmZXRjaCcgfCAnYXhpb3MnIHwgJ290aGVyJztcbiAgICB1cmw/OiBzdHJpbmc7XG4gICAgbWV0aG9kPzogc3RyaW5nO1xuICB9PjtcbiAgZXJyb3JzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQ6IFBhcnNlUmVxdWVzdCk6IFByb21pc2U8UGFyc2VkQXR0cmlidXRlcz4ge1xuICBjb25zdCB7IGNvZGUsIGxhbmd1YWdlLCBmaWxlbmFtZSB9ID0gZXZlbnQ7XG4gIFxuICAvLyBSb3V0ZSB0byBhcHByb3ByaWF0ZSBwYXJzZXIgYmFzZWQgb24gbGFuZ3VhZ2VcbiAgc3dpdGNoIChsYW5ndWFnZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAndHlwZXNjcmlwdCc6XG4gICAgY2FzZSAndHN4JzpcbiAgICBjYXNlICdqYXZhc2NyaXB0JzpcbiAgICBjYXNlICdqc3gnOlxuICAgIGNhc2UgJ2pzJzpcbiAgICBjYXNlICd0cyc6XG4gICAgICByZXR1cm4gcGFyc2VKYXZhU2NyaXB0VHlwZVNjcmlwdChjb2RlLCBsYW5ndWFnZSk7XG4gICAgXG4gICAgY2FzZSAncHl0aG9uJzpcbiAgICBjYXNlICdweSc6XG4gICAgICByZXR1cm4gcGFyc2VQeXRob24oY29kZSk7XG4gICAgXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGltcG9ydHM6IFtdLFxuICAgICAgICBleHBvcnRzOiBbXSxcbiAgICAgICAgZnVuY3Rpb25zOiBbXSxcbiAgICAgICAgY2xhc3NlczogW10sXG4gICAgICAgIGNvbXBvbmVudHM6IFtdLFxuICAgICAgICB0eXBlczogW10sXG4gICAgICAgIHZhcmlhYmxlczogW10sXG4gICAgICAgIGFwaUNhbGxzOiBbXSxcbiAgICAgICAgZXJyb3JzOiBbYFVuc3VwcG9ydGVkIGxhbmd1YWdlOiAke2xhbmd1YWdlfWBdXG4gICAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlSmF2YVNjcmlwdFR5cGVTY3JpcHQoY29kZTogc3RyaW5nLCBsYW5ndWFnZTogc3RyaW5nKTogUGFyc2VkQXR0cmlidXRlcyB7XG4gIGNvbnN0IHJlc3VsdDogUGFyc2VkQXR0cmlidXRlcyA9IHtcbiAgICBpbXBvcnRzOiBbXSxcbiAgICBleHBvcnRzOiBbXSxcbiAgICBmdW5jdGlvbnM6IFtdLFxuICAgIGNsYXNzZXM6IFtdLFxuICAgIGNvbXBvbmVudHM6IFtdLFxuICAgIHR5cGVzOiBbXSxcbiAgICB2YXJpYWJsZXM6IFtdLFxuICAgIGFwaUNhbGxzOiBbXSxcbiAgICBlcnJvcnM6IFtdXG4gIH07XG5cbiAgdHJ5IHtcbiAgICAvLyBEZXRlcm1pbmUgcGFyc2VyIHBsdWdpbnMgYmFzZWQgb24gZmlsZSB0eXBlXG4gICAgY29uc3QgcGx1Z2luczogcGFyc2VyLlBhcnNlclBsdWdpbltdID0gWydkZWNvcmF0b3JzLWxlZ2FjeSddO1xuICAgIFxuICAgIGlmIChsYW5ndWFnZS5pbmNsdWRlcygndHlwZXNjcmlwdCcpIHx8IGxhbmd1YWdlLmluY2x1ZGVzKCd0cycpKSB7XG4gICAgICBwbHVnaW5zLnB1c2goJ3R5cGVzY3JpcHQnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGx1Z2lucy5wdXNoKCdmbG93Jyk7XG4gICAgfVxuICAgIFxuICAgIGlmIChsYW5ndWFnZS5pbmNsdWRlcygneCcpKSB7XG4gICAgICBwbHVnaW5zLnB1c2goJ2pzeCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGFzdCA9IHBhcnNlci5wYXJzZShjb2RlLCB7XG4gICAgICBzb3VyY2VUeXBlOiAnbW9kdWxlJyxcbiAgICAgIHBsdWdpbnMsXG4gICAgICBlcnJvclJlY292ZXJ5OiB0cnVlXG4gICAgfSk7XG5cbiAgICB0cmF2ZXJzZShhc3QsIHtcbiAgICAgIC8vIEltcG9ydHNcbiAgICAgIEltcG9ydERlY2xhcmF0aW9uKHBhdGgpIHtcbiAgICAgICAgY29uc3Qgc3BlY2lmaWVycyA9IHBhdGgubm9kZS5zcGVjaWZpZXJzLm1hcChzcGVjID0+IHtcbiAgICAgICAgICBpZiAodC5pc0ltcG9ydERlZmF1bHRTcGVjaWZpZXIoc3BlYykpIHtcbiAgICAgICAgICAgIHJldHVybiAnZGVmYXVsdCc7XG4gICAgICAgICAgfSBlbHNlIGlmICh0LmlzSW1wb3J0TmFtZXNwYWNlU3BlY2lmaWVyKHNwZWMpKSB7XG4gICAgICAgICAgICByZXR1cm4gYCogYXMgJHtzcGVjLmxvY2FsLm5hbWV9YDtcbiAgICAgICAgICB9IGVsc2UgaWYgKHQuaXNJbXBvcnRTcGVjaWZpZXIoc3BlYykpIHtcbiAgICAgICAgICAgIHJldHVybiBzcGVjLmltcG9ydGVkLnR5cGUgPT09ICdJZGVudGlmaWVyJyA/IHNwZWMuaW1wb3J0ZWQubmFtZSA6ICd1bmtub3duJztcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuICd1bmtub3duJztcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXN1bHQuaW1wb3J0cy5wdXNoKHtcbiAgICAgICAgICBzb3VyY2U6IHBhdGgubm9kZS5zb3VyY2UudmFsdWUsXG4gICAgICAgICAgc3BlY2lmaWVyc1xuICAgICAgICB9KTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIEV4cG9ydHNcbiAgICAgIEV4cG9ydE5hbWVkRGVjbGFyYXRpb24ocGF0aCkge1xuICAgICAgICBpZiAocGF0aC5ub2RlLmRlY2xhcmF0aW9uKSB7XG4gICAgICAgICAgaWYgKHQuaXNGdW5jdGlvbkRlY2xhcmF0aW9uKHBhdGgubm9kZS5kZWNsYXJhdGlvbikgJiYgcGF0aC5ub2RlLmRlY2xhcmF0aW9uLmlkKSB7XG4gICAgICAgICAgICByZXN1bHQuZXhwb3J0cy5wdXNoKHtcbiAgICAgICAgICAgICAgbmFtZTogcGF0aC5ub2RlLmRlY2xhcmF0aW9uLmlkLm5hbWUsXG4gICAgICAgICAgICAgIHR5cGU6ICdmdW5jdGlvbidcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAodC5pc0NsYXNzRGVjbGFyYXRpb24ocGF0aC5ub2RlLmRlY2xhcmF0aW9uKSAmJiBwYXRoLm5vZGUuZGVjbGFyYXRpb24uaWQpIHtcbiAgICAgICAgICAgIHJlc3VsdC5leHBvcnRzLnB1c2goe1xuICAgICAgICAgICAgICBuYW1lOiBwYXRoLm5vZGUuZGVjbGFyYXRpb24uaWQubmFtZSxcbiAgICAgICAgICAgICAgdHlwZTogJ2NsYXNzJ1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBlbHNlIGlmICh0LmlzVmFyaWFibGVEZWNsYXJhdGlvbihwYXRoLm5vZGUuZGVjbGFyYXRpb24pKSB7XG4gICAgICAgICAgICBwYXRoLm5vZGUuZGVjbGFyYXRpb24uZGVjbGFyYXRpb25zLmZvckVhY2goZGVjbCA9PiB7XG4gICAgICAgICAgICAgIGlmICh0LmlzSWRlbnRpZmllcihkZWNsLmlkKSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5leHBvcnRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgbmFtZTogZGVjbC5pZC5uYW1lLFxuICAgICAgICAgICAgICAgICAgdHlwZTogJ3ZhcmlhYmxlJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIEV4cG9ydERlZmF1bHREZWNsYXJhdGlvbihwYXRoKSB7XG4gICAgICAgIHJlc3VsdC5leHBvcnRzLnB1c2goe1xuICAgICAgICAgIG5hbWU6ICdkZWZhdWx0JyxcbiAgICAgICAgICB0eXBlOiAnZGVmYXVsdCdcbiAgICAgICAgfSk7XG4gICAgICB9LFxuXG4gICAgICAvLyBGdW5jdGlvbnNcbiAgICAgIEZ1bmN0aW9uRGVjbGFyYXRpb24ocGF0aCkge1xuICAgICAgICBpZiAocGF0aC5ub2RlLmlkKSB7XG4gICAgICAgICAgcmVzdWx0LmZ1bmN0aW9ucy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IHBhdGgubm9kZS5pZC5uYW1lLFxuICAgICAgICAgICAgYXN5bmM6IHBhdGgubm9kZS5hc3luYyB8fCBmYWxzZSxcbiAgICAgICAgICAgIGdlbmVyYXRvcjogcGF0aC5ub2RlLmdlbmVyYXRvciB8fCBmYWxzZSxcbiAgICAgICAgICAgIHBhcmFtczogcGF0aC5ub2RlLnBhcmFtcy5tYXAocGFyYW0gPT4ge1xuICAgICAgICAgICAgICBpZiAodC5pc0lkZW50aWZpZXIocGFyYW0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcmFtLm5hbWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuICdjb21wbGV4JztcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgcmV0dXJuVHlwZTogcGF0aC5ub2RlLnJldHVyblR5cGUgPyAndHlwZWQnIDogdW5kZWZpbmVkXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIC8vIEFycm93IGZ1bmN0aW9ucyBhc3NpZ25lZCB0byB2YXJpYWJsZXNcbiAgICAgIFZhcmlhYmxlRGVjbGFyYXRvcihwYXRoKSB7XG4gICAgICAgIGlmICh0LmlzSWRlbnRpZmllcihwYXRoLm5vZGUuaWQpICYmIHQuaXNBcnJvd0Z1bmN0aW9uRXhwcmVzc2lvbihwYXRoLm5vZGUuaW5pdCkpIHtcbiAgICAgICAgICByZXN1bHQuZnVuY3Rpb25zLnB1c2goe1xuICAgICAgICAgICAgbmFtZTogcGF0aC5ub2RlLmlkLm5hbWUsXG4gICAgICAgICAgICBhc3luYzogcGF0aC5ub2RlLmluaXQuYXN5bmMgfHwgZmFsc2UsXG4gICAgICAgICAgICBnZW5lcmF0b3I6IGZhbHNlLFxuICAgICAgICAgICAgcGFyYW1zOiBwYXRoLm5vZGUuaW5pdC5wYXJhbXMubWFwKHBhcmFtID0+IHtcbiAgICAgICAgICAgICAgaWYgKHQuaXNJZGVudGlmaWVyKHBhcmFtKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBwYXJhbS5uYW1lO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiAnY29tcGxleCc7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBUcmFjayBhbGwgdmFyaWFibGVzXG4gICAgICAgIGlmICh0LmlzSWRlbnRpZmllcihwYXRoLm5vZGUuaWQpICYmIHBhdGgucGFyZW50LnR5cGUgPT09ICdWYXJpYWJsZURlY2xhcmF0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHBhdGgucGFyZW50IGFzIHQuVmFyaWFibGVEZWNsYXJhdGlvbjtcbiAgICAgICAgICByZXN1bHQudmFyaWFibGVzLnB1c2goe1xuICAgICAgICAgICAgbmFtZTogcGF0aC5ub2RlLmlkLm5hbWUsXG4gICAgICAgICAgICBraW5kOiBwYXJlbnQua2luZCBhcyAnY29uc3QnIHwgJ2xldCcgfCAndmFyJ1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICAvLyBDbGFzc2VzXG4gICAgICBDbGFzc0RlY2xhcmF0aW9uKHBhdGgpIHtcbiAgICAgICAgaWYgKHBhdGgubm9kZS5pZCkge1xuICAgICAgICAgIGNvbnN0IG1ldGhvZHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgXG4gICAgICAgICAgcGF0aC5ub2RlLmJvZHkuYm9keS5mb3JFYWNoKG1lbWJlciA9PiB7XG4gICAgICAgICAgICBpZiAodC5pc0NsYXNzTWV0aG9kKG1lbWJlcikgJiYgdC5pc0lkZW50aWZpZXIobWVtYmVyLmtleSkpIHtcbiAgICAgICAgICAgICAgbWV0aG9kcy5wdXNoKG1lbWJlci5rZXkubmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICByZXN1bHQuY2xhc3Nlcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IHBhdGgubm9kZS5pZC5uYW1lLFxuICAgICAgICAgICAgZXh0ZW5kczogcGF0aC5ub2RlLnN1cGVyQ2xhc3MgJiYgdC5pc0lkZW50aWZpZXIocGF0aC5ub2RlLnN1cGVyQ2xhc3MpIFxuICAgICAgICAgICAgICA/IHBhdGgubm9kZS5zdXBlckNsYXNzLm5hbWUgXG4gICAgICAgICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgbWV0aG9kc1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyBhIFJlYWN0IGNvbXBvbmVudFxuICAgICAgICAgIGlmIChwYXRoLm5vZGUuc3VwZXJDbGFzcyAmJiBcbiAgICAgICAgICAgICAgKCh0LmlzSWRlbnRpZmllcihwYXRoLm5vZGUuc3VwZXJDbGFzcykgJiYgcGF0aC5ub2RlLnN1cGVyQ2xhc3MubmFtZSA9PT0gJ0NvbXBvbmVudCcpIHx8XG4gICAgICAgICAgICAgICAodC5pc01lbWJlckV4cHJlc3Npb24ocGF0aC5ub2RlLnN1cGVyQ2xhc3MpICYmIFxuICAgICAgICAgICAgICAgIHQuaXNJZGVudGlmaWVyKHBhdGgubm9kZS5zdXBlckNsYXNzLm9iamVjdCkgJiYgXG4gICAgICAgICAgICAgICAgcGF0aC5ub2RlLnN1cGVyQ2xhc3Mub2JqZWN0Lm5hbWUgPT09ICdSZWFjdCcpKSkge1xuICAgICAgICAgICAgcmVzdWx0LmNvbXBvbmVudHMucHVzaCh7XG4gICAgICAgICAgICAgIG5hbWU6IHBhdGgubm9kZS5pZC5uYW1lLFxuICAgICAgICAgICAgICBob29rczogW10sXG4gICAgICAgICAgICAgIHByb3BzOiBbXVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICAvLyBUeXBlU2NyaXB0IHR5cGVzXG4gICAgICBUU1R5cGVBbGlhc0RlY2xhcmF0aW9uKHBhdGg6IGFueSkge1xuICAgICAgICByZXN1bHQudHlwZXMucHVzaCh7XG4gICAgICAgICAgbmFtZTogcGF0aC5ub2RlLmlkLm5hbWUsXG4gICAgICAgICAga2luZDogJ3R5cGUnXG4gICAgICAgIH0pO1xuICAgICAgfSxcblxuICAgICAgVFNJbnRlcmZhY2VEZWNsYXJhdGlvbihwYXRoOiBhbnkpIHtcbiAgICAgICAgcmVzdWx0LnR5cGVzLnB1c2goe1xuICAgICAgICAgIG5hbWU6IHBhdGgubm9kZS5pZC5uYW1lLFxuICAgICAgICAgIGtpbmQ6ICdpbnRlcmZhY2UnXG4gICAgICAgIH0pO1xuICAgICAgfSxcblxuICAgICAgVFNFbnVtRGVjbGFyYXRpb24ocGF0aDogYW55KSB7XG4gICAgICAgIHJlc3VsdC50eXBlcy5wdXNoKHtcbiAgICAgICAgICBuYW1lOiBwYXRoLm5vZGUuaWQubmFtZSxcbiAgICAgICAgICBraW5kOiAnZW51bSdcbiAgICAgICAgfSk7XG4gICAgICB9LFxuXG4gICAgICAvLyBBUEkgQ2FsbHNcbiAgICAgIENhbGxFeHByZXNzaW9uKHBhdGgpIHtcbiAgICAgICAgLy8gRGV0ZWN0IGZldGNoIGNhbGxzXG4gICAgICAgIGlmICh0LmlzSWRlbnRpZmllcihwYXRoLm5vZGUuY2FsbGVlKSAmJiBwYXRoLm5vZGUuY2FsbGVlLm5hbWUgPT09ICdmZXRjaCcpIHtcbiAgICAgICAgICBjb25zdCBhcGlDYWxsOiBhbnkgPSB7IHR5cGU6ICdmZXRjaCcgfTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAocGF0aC5ub2RlLmFyZ3VtZW50c1swXSAmJiB0LmlzU3RyaW5nTGl0ZXJhbChwYXRoLm5vZGUuYXJndW1lbnRzWzBdKSkge1xuICAgICAgICAgICAgYXBpQ2FsbC51cmwgPSBwYXRoLm5vZGUuYXJndW1lbnRzWzBdLnZhbHVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXN1bHQuYXBpQ2FsbHMucHVzaChhcGlDYWxsKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gRGV0ZWN0IGF4aW9zIGNhbGxzXG4gICAgICAgIGlmICh0LmlzTWVtYmVyRXhwcmVzc2lvbihwYXRoLm5vZGUuY2FsbGVlKSAmJiBcbiAgICAgICAgICAgIHQuaXNJZGVudGlmaWVyKHBhdGgubm9kZS5jYWxsZWUub2JqZWN0KSAmJiBcbiAgICAgICAgICAgIHBhdGgubm9kZS5jYWxsZWUub2JqZWN0Lm5hbWUgPT09ICdheGlvcycpIHtcbiAgICAgICAgICBjb25zdCBhcGlDYWxsOiBhbnkgPSB7IHR5cGU6ICdheGlvcycgfTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAodC5pc0lkZW50aWZpZXIocGF0aC5ub2RlLmNhbGxlZS5wcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgIGFwaUNhbGwubWV0aG9kID0gcGF0aC5ub2RlLmNhbGxlZS5wcm9wZXJ0eS5uYW1lO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXN1bHQuYXBpQ2FsbHMucHVzaChhcGlDYWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVjdCBSZWFjdCBob29rcyBpbiBmdW5jdGlvbiBjb21wb25lbnRzXG4gICAgICAgIGlmICh0LmlzSWRlbnRpZmllcihwYXRoLm5vZGUuY2FsbGVlKSAmJiBwYXRoLm5vZGUuY2FsbGVlLm5hbWUuc3RhcnRzV2l0aCgndXNlJykpIHtcbiAgICAgICAgICAvLyBGaW5kIHRoZSBjb250YWluaW5nIGZ1bmN0aW9uIGNvbXBvbmVudFxuICAgICAgICAgIGxldCBmdW5jdGlvblBhcmVudCA9IHBhdGguZ2V0RnVuY3Rpb25QYXJlbnQoKTtcbiAgICAgICAgICBpZiAoZnVuY3Rpb25QYXJlbnQgJiYgZnVuY3Rpb25QYXJlbnQubm9kZSkge1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZ1bmN0aW9uUGFyZW50Lm5vZGU7XG4gICAgICAgICAgICBsZXQgY29tcG9uZW50TmFtZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIENoZWNrIGRpZmZlcmVudCBmdW5jdGlvbiB0eXBlc1xuICAgICAgICAgICAgaWYgKHQuaXNGdW5jdGlvbkRlY2xhcmF0aW9uKG5vZGUpICYmIG5vZGUuaWQpIHtcbiAgICAgICAgICAgICAgY29tcG9uZW50TmFtZSA9IG5vZGUuaWQubmFtZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodC5pc1ZhcmlhYmxlRGVjbGFyYXRvcihmdW5jdGlvblBhcmVudC5wYXJlbnQpICYmIHQuaXNJZGVudGlmaWVyKGZ1bmN0aW9uUGFyZW50LnBhcmVudC5pZCkpIHtcbiAgICAgICAgICAgICAgY29tcG9uZW50TmFtZSA9IGZ1bmN0aW9uUGFyZW50LnBhcmVudC5pZC5uYW1lO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBpdCBzdGFydHMgd2l0aCB1cHBlcmNhc2UgKFJlYWN0IGNvbXBvbmVudCBjb252ZW50aW9uKVxuICAgICAgICAgICAgaWYgKGNvbXBvbmVudE5hbWUgJiYgY29tcG9uZW50TmFtZVswXSA9PT0gY29tcG9uZW50TmFtZVswXS50b1VwcGVyQ2FzZSgpKSB7XG4gICAgICAgICAgICAgIGxldCBjb21wb25lbnQgPSByZXN1bHQuY29tcG9uZW50cy5maW5kKGMgPT4gYy5uYW1lID09PSBjb21wb25lbnROYW1lKTtcbiAgICAgICAgICAgICAgaWYgKCFjb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnQgPSB7XG4gICAgICAgICAgICAgICAgICBuYW1lOiBjb21wb25lbnROYW1lLFxuICAgICAgICAgICAgICAgICAgaG9va3M6IFtdLFxuICAgICAgICAgICAgICAgICAgcHJvcHM6IFtdXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXN1bHQuY29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFjb21wb25lbnQuaG9va3MuaW5jbHVkZXMocGF0aC5ub2RlLmNhbGxlZS5uYW1lKSkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5ob29rcy5wdXNoKHBhdGgubm9kZS5jYWxsZWUubmFtZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgcmVzdWx0LmVycm9ycy5wdXNoKGVycm9yLm1lc3NhZ2UgfHwgJ0ZhaWxlZCB0byBwYXJzZSBKYXZhU2NyaXB0L1R5cGVTY3JpcHQnKTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUHl0aG9uKGNvZGU6IHN0cmluZyk6IFBhcnNlZEF0dHJpYnV0ZXMge1xuICBjb25zdCByZXN1bHQ6IFBhcnNlZEF0dHJpYnV0ZXMgPSB7XG4gICAgaW1wb3J0czogW10sXG4gICAgZXhwb3J0czogW10sXG4gICAgZnVuY3Rpb25zOiBbXSxcbiAgICBjbGFzc2VzOiBbXSxcbiAgICBjb21wb25lbnRzOiBbXSxcbiAgICB0eXBlczogW10sXG4gICAgdmFyaWFibGVzOiBbXSxcbiAgICBhcGlDYWxsczogW10sXG4gICAgZXJyb3JzOiBbXVxuICB9O1xuXG4gIHRyeSB7XG4gICAgLy8gU2ltcGxlIHJlZ2V4LWJhc2VkIFB5dGhvbiBwYXJzZXIgc2luY2Ugd2UgY2FuJ3QgdXNlIHN1YnByb2Nlc3MgaW4gTGFtYmRhXG4gICAgLy8gVGhpcyBpcyBhIHNpbXBsaWZpZWQgcGFyc2VyIGJ1dCBjb3ZlcnMgbW9zdCBjb21tb24gcGF0dGVybnNcbiAgICBcbiAgICAvLyBFeHRyYWN0IGltcG9ydHNcbiAgICBjb25zdCBpbXBvcnRSZWdleCA9IC9eaW1wb3J0XFxzKyhcXFMrKSg/Olxccythc1xccysoXFxTKykpPy9nbTtcbiAgICBjb25zdCBmcm9tSW1wb3J0UmVnZXggPSAvXmZyb21cXHMrKFxcUyspXFxzK2ltcG9ydFxccysoLispL2dtO1xuICAgIFxuICAgIGxldCBtYXRjaDtcbiAgICB3aGlsZSAoKG1hdGNoID0gaW1wb3J0UmVnZXguZXhlYyhjb2RlKSkgIT09IG51bGwpIHtcbiAgICAgIHJlc3VsdC5pbXBvcnRzLnB1c2goe1xuICAgICAgICBzb3VyY2U6IG1hdGNoWzFdLFxuICAgICAgICBzcGVjaWZpZXJzOiBbbWF0Y2hbMl0gfHwgbWF0Y2hbMV1dXG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgd2hpbGUgKChtYXRjaCA9IGZyb21JbXBvcnRSZWdleC5leGVjKGNvZGUpKSAhPT0gbnVsbCkge1xuICAgICAgY29uc3Qgc3BlY2lmaWVycyA9IG1hdGNoWzJdLnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkpO1xuICAgICAgcmVzdWx0LmltcG9ydHMucHVzaCh7XG4gICAgICAgIHNvdXJjZTogbWF0Y2hbMV0sXG4gICAgICAgIHNwZWNpZmllcnNcbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBFeHRyYWN0IGZ1bmN0aW9uc1xuICAgIGNvbnN0IGZ1bmN0aW9uUmVnZXggPSAvXig/OmFzeW5jXFxzKyk/ZGVmXFxzKyhcXHcrKVxccypcXCgoW14pXSopXFwpL2dtO1xuICAgIHdoaWxlICgobWF0Y2ggPSBmdW5jdGlvblJlZ2V4LmV4ZWMoY29kZSkpICE9PSBudWxsKSB7XG4gICAgICBjb25zdCBpc0FzeW5jID0gY29kZS5zdWJzdHJpbmcobWF0Y2guaW5kZXggLSA2LCBtYXRjaC5pbmRleCkuaW5jbHVkZXMoJ2FzeW5jJyk7XG4gICAgICBjb25zdCBwYXJhbXMgPSBtYXRjaFsyXSA/IG1hdGNoWzJdLnNwbGl0KCcsJykubWFwKHAgPT4gcC50cmltKCkuc3BsaXQoJzonKVswXS50cmltKCkpIDogW107XG4gICAgICByZXN1bHQuZnVuY3Rpb25zLnB1c2goe1xuICAgICAgICBuYW1lOiBtYXRjaFsxXSxcbiAgICAgICAgYXN5bmM6IGlzQXN5bmMsXG4gICAgICAgIGdlbmVyYXRvcjogZmFsc2UsXG4gICAgICAgIHBhcmFtczogcGFyYW1zLmZpbHRlcihwID0+IHAgJiYgcCAhPT0gJ3NlbGYnKVxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgY2xhc3Nlc1xuICAgIGNvbnN0IGNsYXNzUmVnZXggPSAvXmNsYXNzXFxzKyhcXHcrKSg/OlxccypcXCgoW14pXSopXFwpKT86L2dtO1xuICAgIHdoaWxlICgobWF0Y2ggPSBjbGFzc1JlZ2V4LmV4ZWMoY29kZSkpICE9PSBudWxsKSB7XG4gICAgICBjb25zdCBjbGFzc05hbWUgPSBtYXRjaFsxXTtcbiAgICAgIGNvbnN0IGV4dGVuZHNDbGFzcyA9IG1hdGNoWzJdID8gbWF0Y2hbMl0udHJpbSgpIDogdW5kZWZpbmVkO1xuICAgICAgXG4gICAgICAvLyBGaW5kIG1ldGhvZHMgaW4gdGhlIGNsYXNzXG4gICAgICBjb25zdCBjbGFzc1N0YXJ0ID0gbWF0Y2guaW5kZXg7XG4gICAgICBsZXQgY2xhc3NFbmQgPSBjb2RlLmxlbmd0aDtcbiAgICAgIFxuICAgICAgLy8gRmluZCBuZXh0IGNsYXNzIG9yIGVuZCBvZiBmaWxlXG4gICAgICBjb25zdCBuZXh0Q2xhc3NNYXRjaCA9IGNsYXNzUmVnZXguZXhlYyhjb2RlKTtcbiAgICAgIGlmIChuZXh0Q2xhc3NNYXRjaCkge1xuICAgICAgICBjbGFzc0VuZCA9IG5leHRDbGFzc01hdGNoLmluZGV4O1xuICAgICAgICBjbGFzc1JlZ2V4Lmxhc3RJbmRleCA9IG1hdGNoLmluZGV4ICsgMTsgLy8gUmVzZXQgdG8gY29udGludWVcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgY2xhc3NDb2RlID0gY29kZS5zdWJzdHJpbmcoY2xhc3NTdGFydCwgY2xhc3NFbmQpO1xuICAgICAgY29uc3QgbWV0aG9kUmVnZXggPSAvXlxcc3s0LH0oPzphc3luY1xccyspP2RlZlxccysoXFx3KylcXHMqXFwoL2dtO1xuICAgICAgY29uc3QgbWV0aG9kczogc3RyaW5nW10gPSBbXTtcbiAgICAgIFxuICAgICAgbGV0IG1ldGhvZE1hdGNoO1xuICAgICAgd2hpbGUgKChtZXRob2RNYXRjaCA9IG1ldGhvZFJlZ2V4LmV4ZWMoY2xhc3NDb2RlKSkgIT09IG51bGwpIHtcbiAgICAgICAgbWV0aG9kcy5wdXNoKG1ldGhvZE1hdGNoWzFdKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmVzdWx0LmNsYXNzZXMucHVzaCh7XG4gICAgICAgIG5hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgZXh0ZW5kczogZXh0ZW5kc0NsYXNzLFxuICAgICAgICBtZXRob2RzXG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gRXh0cmFjdCB0eXBlIGhpbnRzIChzaW1wbGUgZGV0ZWN0aW9uKVxuICAgIGNvbnN0IHR5cGVBbGlhc1JlZ2V4ID0gL14oXFx3KylcXHMqOlxccypUeXBlXFxbL2dtO1xuICAgIHdoaWxlICgobWF0Y2ggPSB0eXBlQWxpYXNSZWdleC5leGVjKGNvZGUpKSAhPT0gbnVsbCkge1xuICAgICAgcmVzdWx0LnR5cGVzLnB1c2goe1xuICAgICAgICBuYW1lOiBtYXRjaFsxXSxcbiAgICAgICAga2luZDogJ3R5cGUnXG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gRGV0ZWN0IEFQSSBjYWxsc1xuICAgIGlmIChjb2RlLmluY2x1ZGVzKCdyZXF1ZXN0cy4nKSB8fCBjb2RlLmluY2x1ZGVzKCdodHRweC4nKSB8fCBjb2RlLmluY2x1ZGVzKCdhaW9odHRwLicpKSB7XG4gICAgICByZXN1bHQuYXBpQ2FsbHMucHVzaCh7IHR5cGU6ICdvdGhlcicgfSk7XG4gICAgfVxuICAgIFxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgcmVzdWx0LmVycm9ycy5wdXNoKGVycm9yLm1lc3NhZ2UgfHwgJ0ZhaWxlZCB0byBwYXJzZSBQeXRob24nKTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59Il19