interface ParseRequest {
    code: string;
    language: string;
    filename?: string;
}
interface ParsedAttributes {
    imports: Array<{
        source: string;
        specifiers: string[];
    }>;
    exports: Array<{
        name: string;
        type: 'function' | 'class' | 'variable' | 'type' | 'default';
    }>;
    functions: Array<{
        name: string;
        async: boolean;
        generator: boolean;
        params: string[];
        returnType?: string;
    }>;
    classes: Array<{
        name: string;
        extends?: string;
        implements?: string[];
        methods: string[];
    }>;
    components: Array<{
        name: string;
        props?: string[];
        hooks: string[];
    }>;
    types: Array<{
        name: string;
        kind: 'interface' | 'type' | 'enum';
    }>;
    variables: Array<{
        name: string;
        kind: 'const' | 'let' | 'var';
        type?: string;
    }>;
    apiCalls: Array<{
        type: 'fetch' | 'axios' | 'other';
        url?: string;
        method?: string;
    }>;
    errors: string[];
}
export declare function handler(event: ParseRequest): Promise<ParsedAttributes>;
export {};
