import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface LogDetails {
  [key: string]: any
}

export class DatabaseLogger {
  private supabase: any
  private functionName: string
  private batchId?: string

  constructor(functionName: string, batchId?: string) {
    this.functionName = functionName
    this.batchId = batchId
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  }

  private async log(level: string, message: string, details?: LogDetails) {
    try {
      await this.supabase
        .from('pattern_processor_logs')
        .insert({
          batch_id: this.batchId,
          level,
          message,
          details: details || {},
          function_name: this.functionName,
          created_at: new Date().toISOString()
        })
    } catch (error) {
      // Fallback to console if DB logging fails
      console.error('Failed to log to database:', error)
      console.log(`[${level}] ${message}`, details)
    }
  }

  async info(message: string, details?: LogDetails) {
    console.log(`[${this.functionName}] ${message}`, details)
    await this.log('info', message, details)
  }

  async warn(message: string, details?: LogDetails) {
    console.warn(`[${this.functionName}] ${message}`, details)
    await this.log('warning', message, details)
  }

  async error(message: string, error?: any, details?: LogDetails) {
    console.error(`[${this.functionName}] ${message}`, error, details)
    await this.log('error', message, {
      ...details,
      error: error?.message || String(error),
      error_stack: error?.stack
    })
  }
}