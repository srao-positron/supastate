// Safe logger wrapper that falls back to console
import { DBLogger } from './db-logger.ts'

let dbLogger: DBLogger | null = null

export function setLogger(logger: DBLogger) {
  dbLogger = logger
}

export const logger = {
  async info(message: string, details?: any) {
    if (dbLogger) {
      await dbLogger.info(message, details)
    } else {
      console.log(`[INFO] ${message}`, details || '')
    }
  },
  
  async warn(message: string, details?: any) {
    if (dbLogger) {
      await dbLogger.warn(message, details)
    } else {
      console.warn(`[WARN] ${message}`, details || '')
    }
  },
  
  async error(message: string, error?: any, details?: any) {
    if (dbLogger) {
      await dbLogger.error(message, error, details)
    } else {
      console.error(`[ERROR] ${message}`, error, details || '')
    }
  },
  
  async debug(message: string, details?: any) {
    if (dbLogger) {
      await dbLogger.debug(message, details)
    } else {
      console.log(`[DEBUG] ${message}`, details || '')
    }
  },
  
  async close() {
    if (dbLogger) {
      await dbLogger.close()
    }
  }
}