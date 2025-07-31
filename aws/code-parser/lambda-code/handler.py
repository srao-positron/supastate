import ast
import json
import re
from typing import Dict, List, Any

def parse_typescript_javascript(code: str, language: str) -> Dict[str, Any]:
    """
    Parse TypeScript/JavaScript code using regex patterns.
    This is a simplified parser but covers common patterns.
    """
    result = {
        "imports": [],
        "exports": [],
        "functions": [],
        "classes": [],
        "components": [],
        "types": [],
        "variables": [],
        "apiCalls": [],
        "errors": []
    }
    
    try:
        # Extract imports
        import_regex = r'import\s+(?:(\w+)|{([^}]+)}|\*\s+as\s+(\w+))\s+from\s+[\'"]([^\'"]+)[\'"]'
        for match in re.finditer(import_regex, code):
            default, named, namespace, source = match.groups()
            specifiers = []
            if default:
                specifiers.append(default)
            if named:
                specifiers.extend([s.strip() for s in named.split(',')])
            if namespace:
                specifiers.append(f"* as {namespace}")
            
            result["imports"].append({
                "source": source,
                "specifiers": specifiers
            })
        
        # Extract exports
        export_regex = r'export\s+(?:(default)\s+)?(?:(const|let|var|function|class|interface|type)\s+)?(\w+)'
        for match in re.finditer(export_regex, code):
            is_default, kind, name = match.groups()
            if name:
                result["exports"].append({
                    "name": "default" if is_default else name,
                    "type": kind or "default" if is_default else "variable"
                })
        
        # Extract functions (including arrow functions)
        function_regex = r'(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)'
        arrow_regex = r'(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>'
        
        for match in re.finditer(function_regex, code):
            name, params = match.groups()
            is_async = 'async' in code[max(0, match.start()-20):match.start()]
            param_list = [p.strip().split(':')[0].strip() for p in params.split(',')] if params else []
            
            result["functions"].append({
                "name": name,
                "async": is_async,
                "generator": False,
                "params": param_list
            })
        
        for match in re.finditer(arrow_regex, code):
            name = match.group(1)
            is_async = 'async' in match.group(0)
            result["functions"].append({
                "name": name,
                "async": is_async,
                "generator": False,
                "params": []  # Simplified - could parse params
            })
        
        # Extract classes
        class_regex = r'(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?'
        for match in re.finditer(class_regex, code):
            name, extends = match.groups()
            
            # Find methods in the class
            class_start = match.end()
            brace_count = 0
            class_end = class_start
            
            for i, char in enumerate(code[class_start:], class_start):
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        class_end = i
                        break
            
            class_body = code[class_start:class_end]
            method_regex = r'(?:async\s+)?(\w+)\s*\([^)]*\)'
            methods = [m.group(1) for m in re.finditer(method_regex, class_body) 
                      if m.group(1) not in ['if', 'for', 'while', 'switch', 'catch']]
            
            result["classes"].append({
                "name": name,
                "extends": extends,
                "methods": methods
            })
            
            # Check if it's a React component
            if extends in ['Component', 'React.Component', 'PureComponent']:
                result["components"].append({
                    "name": name,
                    "hooks": [],
                    "props": []
                })
        
        # Extract React function components and hooks
        component_regex = r'(?:export\s+)?(?:const|function)\s+([A-Z]\w*)\s*[=:]\s*(?:\([^)]*\)\s*=>\s*|function\s*\([^)]*\)\s*{)'
        for match in re.finditer(component_regex, code):
            name = match.group(1)
            
            # Find hooks used in this component
            component_start = match.start()
            component_end = len(code)
            
            # Find the end of the component
            brace_count = 0
            started = False
            for i, char in enumerate(code[match.end():], match.end()):
                if char == '{':
                    brace_count += 1
                    started = True
                elif char == '}' and started:
                    brace_count -= 1
                    if brace_count == 0:
                        component_end = i
                        break
            
            component_body = code[component_start:component_end]
            hook_regex = r'use[A-Z]\w*'
            hooks = list(set(re.findall(hook_regex, component_body)))
            
            if hooks:  # Only add if it uses hooks (likely a component)
                result["components"].append({
                    "name": name,
                    "hooks": hooks,
                    "props": []
                })
        
        # Extract TypeScript types/interfaces
        type_regex = r'(?:export\s+)?(?:type|interface)\s+(\w+)'
        for match in re.finditer(type_regex, code):
            result["types"].append({
                "name": match.group(1),
                "kind": "interface" if "interface" in match.group(0) else "type"
            })
        
        # Detect API calls
        if 'fetch(' in code:
            result["apiCalls"].append({"type": "fetch"})
        if 'axios.' in code or 'axios(' in code:
            result["apiCalls"].append({"type": "axios"})
            
    except Exception as e:
        result["errors"].append(str(e))
    
    return result

def parse_python(code: str) -> Dict[str, Any]:
    """
    Parse Python code using the built-in AST module.
    """
    result = {
        "imports": [],
        "exports": [],
        "functions": [],
        "classes": [],
        "components": [],
        "types": [],
        "variables": [],
        "apiCalls": [],
        "errors": []
    }
    
    try:
        tree = ast.parse(code)
        
        for node in ast.walk(tree):
            # Extract imports
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
            
            # Extract functions
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # Skip methods inside classes
                is_method = False
                for parent in ast.walk(tree):
                    if isinstance(parent, ast.ClassDef) and node in parent.body:
                        is_method = True
                        break
                
                if not is_method:
                    result["functions"].append({
                        "name": node.name,
                        "async": isinstance(node, ast.AsyncFunctionDef),
                        "generator": any(isinstance(n, ast.Yield) for n in ast.walk(node)),
                        "params": [arg.arg for arg in node.args.args]
                    })
            
            # Extract classes
            elif isinstance(node, ast.ClassDef):
                methods = []
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        methods.append(item.name)
                
                bases = []
                for base in node.bases:
                    if isinstance(base, ast.Name):
                        bases.append(base.id)
                    elif isinstance(base, ast.Attribute):
                        bases.append(f"{base.value.id if isinstance(base.value, ast.Name) else '?'}.{base.attr}")
                
                result["classes"].append({
                    "name": node.name,
                    "extends": bases[0] if bases else None,
                    "implements": bases[1:] if len(bases) > 1 else [],
                    "methods": methods
                })
            
            # Extract type aliases (Python 3.10+)
            elif hasattr(ast, 'TypeAlias') and isinstance(node, ast.TypeAlias):
                if isinstance(node.name, ast.Name):
                    result["types"].append({
                        "name": node.name.id,
                        "kind": "type"
                    })
        
        # Detect API calls
        code_lower = code.lower()
        if 'requests.' in code or 'import requests' in code_lower:
            result["apiCalls"].append({"type": "other", "library": "requests"})
        if 'httpx.' in code or 'import httpx' in code_lower:
            result["apiCalls"].append({"type": "other", "library": "httpx"})
        if 'aiohttp.' in code or 'import aiohttp' in code_lower:
            result["apiCalls"].append({"type": "other", "library": "aiohttp"})
        if 'urllib' in code_lower:
            result["apiCalls"].append({"type": "other", "library": "urllib"})
            
    except SyntaxError as e:
        result["errors"].append(f"Syntax error: {e}")
    except Exception as e:
        result["errors"].append(str(e))
    
    return result

def main(event, context):
    """
    Lambda handler for code parsing.
    """
    try:
        # Handle Lambda Function URL invocation
        # Function URLs pass the body as a string in event['body']
        if 'body' in event and isinstance(event['body'], str):
            import json
            body = json.loads(event['body'])
            code = body.get('code', '')
            language = body.get('language', '').lower()
            filename = body.get('filename', '')
        else:
            # Direct invocation (for testing)
            code = event.get('code', '')
            language = event.get('language', '').lower()
            filename = event.get('filename', '')
        
        # Route to appropriate parser
        if language in ['typescript', 'ts', 'javascript', 'js', 'jsx', 'tsx']:
            result = parse_typescript_javascript(code, language)
        elif language in ['python', 'py']:
            result = parse_python(code)
        else:
            result = {
                "imports": [],
                "exports": [],
                "functions": [],
                "classes": [],
                "components": [],
                "types": [],
                "variables": [],
                "apiCalls": [],
                "errors": [f"Unsupported language: {language}"]
            }
        
        # Add metadata
        result["metadata"] = {
            "language": language,
            "filename": filename,
            "lineCount": len(code.split('\n')),
            "size": len(code)
        }
        
        # If invoked via Function URL, return HTTP response format
        if 'body' in event and isinstance(event['body'], str):
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json'
                },
                'body': json.dumps(result)
            }
        else:
            return result
        
    except Exception as e:
        error_response = {
            "imports": [],
            "exports": [],
            "functions": [],
            "classes": [],
            "components": [],
            "types": [],
            "variables": [],
            "apiCalls": [],
            "errors": [str(e)],
            "metadata": {
                "language": language if 'language' in locals() else 'unknown',
                "filename": filename if 'filename' in locals() else '',
                "error": str(e)
            }
        }
        
        # If invoked via Function URL, return HTTP response format  
        if 'body' in event and isinstance(event['body'], str):
            return {
                'statusCode': 500,
                'headers': {
                    'Content-Type': 'application/json'
                },
                'body': json.dumps(error_response)
            }
        else:
            return error_response