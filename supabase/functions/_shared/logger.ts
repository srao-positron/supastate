export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  functionName: string;
  requestId?: string;
  [key: string]: any;
}

export class EdgeLogger {
  constructor(
    private functionName: string,
    private requestId?: string
  ) {}

  private log(level: LogEntry['level'], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      functionName: this.functionName,
      requestId: this.requestId,
      ...data,
    };
    
    // Supabase Edge Functions capture console.log output
    console.log(JSON.stringify(entry));
  }

  debug(message: string, data?: any) {
    if (Deno.env.get('LOG_LEVEL') === 'debug') {
      this.log('debug', message, data);
    }
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | any, data?: any) {
    this.log('error', message, {
      ...data,
      error: error instanceof Error ? {
        message: error.message,
        stack: Deno.env.get('LOG_LEVEL') === 'debug' ? error.stack : undefined,
        name: error.name,
      } : error,
    });
  }
}