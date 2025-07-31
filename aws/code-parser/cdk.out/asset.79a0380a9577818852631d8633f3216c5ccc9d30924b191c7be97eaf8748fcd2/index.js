"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const parser = __importStar(require("@babel/parser"));
const traverse_1 = __importDefault(require("@babel/traverse"));
const t = __importStar(require("@babel/types"));
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
            const match, [];
            2;
            match[2].trim();
            undefined;
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
                extends: ,
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
