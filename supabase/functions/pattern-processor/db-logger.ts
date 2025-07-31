// Database logger for pattern processor
export class DBLogger {
  private supabase: any
  private batchId: string | null = null
  private buffer: any[] = []
  private flushInterval: any
  
  constructor(supabase: any, batchId?: string) {
    this.supabase = supabase
    this.batchId = batchId || null
    
    // Flush logs every 5 seconds
    this.flushInterval = setInterval(() => {
      this.flush()
    }, 5000)
  }
  
  async log(level: 'info' | 'warn' | 'error' | 'debug', message: string, details?: any) {
    const entry = {
      batch_id: this.batchId,
      level,
      message,
      details: details || {},
      function_name: details?.functionName,
      pattern_type: details?.patternType,
      entity_count: details?.entityCount,
      error_stack: details?.error?.stack,
      created_at: new Date().toISOString()
    }
    
    // Also log to console
    console.log(`[${level.toUpperCase()}] ${message}`, details || '')
    
    // Buffer the log entry
    this.buffer.push(entry)
    
    // Flush if buffer is getting large
    if (this.buffer.length >= 10) {
      await this.flush()
    }
  }
  
  async flush() {
    if (this.buffer.length === 0) return
    
    const toFlush = [...this.buffer]
    this.buffer = []
    
    try {
      const { error } = await this.supabase
        .from('pattern_processor_logs')
        .insert(toFlush)
      
      if (error) {
        console.error('Failed to flush logs:', error)
        // Re-add to buffer if failed
        this.buffer.unshift(...toFlush)
      }
    } catch (e) {
      console.error('Failed to flush logs:', e)
      // Re-add to buffer if failed
      this.buffer.unshift(...toFlush)
    }
  }
  
  async info(message: string, details?: any) {
    await this.log('info', message, details)
  }
  
  async warn(message: string, details?: any) {
    await this.log('warn', message, details)
  }
  
  async error(message: string, error?: any, details?: any) {
    await this.log('error', message, { ...details, error })
  }
  
  async debug(message: string, details?: any) {
    await this.log('debug', message, details)
  }
  
  setBatchId(batchId: string) {
    this.batchId = batchId
  }
  
  async close() {
    // Final flush
    await this.flush()
    
    // Clear interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
  }
}