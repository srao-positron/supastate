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
const child_process_1 = require("child_process");
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
            plugins
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
        // Use Python's AST module via subprocess
        const pythonScript = `
import ast
import json

code = '''${code.replace(/'/g, "\\'")}'''

tree = ast.parse(code)

result = {
    "imports": [],
    "functions": [],
    "classes": [],
    "variables": [],
    "api_calls": []
}

for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            result["imports"].append({
                "source": alias.name,
                "specifiers": [alias.asname if alias.asname else alias.name]
            })
    elif isinstance(node, ast.ImportFrom):
        result["imports"].append({
            "source": node.module or "",
            "specifiers": [alias.name for alias in node.names]
        })
    elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
        result["functions"].append({
            "name": node.name,
            "async": isinstance(node, ast.AsyncFunctionDef),
            "params": [arg.arg for arg in node.args.args],
            "decorators": [d.id if isinstance(d, ast.Name) else "" for d in node.decorator_list]
        })
    elif isinstance(node, ast.ClassDef):
        methods = []
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                methods.append(item.name)
        
        bases = []
        for base in node.bases:
            if isinstance(base, ast.Name):
                bases.append(base.id)
        
        result["classes"].append({
            "name": node.name,
            "methods": methods,
            "extends": bases[0] if bases else None
        })

print(json.dumps(result))
`;
        const output = (0, child_process_1.execSync)(`python3 -c "${pythonScript}"`, { encoding: 'utf-8' });
        const pythonResult = JSON.parse(output);
        // Map Python results to our format
        result.imports = pythonResult.imports;
        result.functions = pythonResult.functions.map((f) => ({
            name: f.name,
            async: f.async,
            generator: false,
            params: f.params
        }));
        result.classes = pythonResult.classes;
    }
    catch (error) {
        result.errors.push(error.message || 'Failed to parse Python');
    }
    return result;
}
