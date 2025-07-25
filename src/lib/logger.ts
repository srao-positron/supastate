import winston from 'winston'

const { combine, timestamp, printf, colorize, errors } = winston.format

// Custom format for logs
const logFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let log = `${timestamp} [${level}]: ${message}`
  
  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    log += ` ${JSON.stringify(metadata)}`
  }
  
  // Add stack trace for errors
  if (stack) {
    log += `\n${stack}`
  }
  
  return log
})

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug', // Always use debug level for now
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // Always log to console
    new winston.transports.Console({
      format: combine(
        colorize({ all: process.env.NODE_ENV !== 'production' }),
        logFormat
      )
    })
  ]
})

// Helper functions for structured logging
export const log = {
  info: (message: string, meta?: any) => logger.info(message, meta),
  error: (message: string, error?: any, meta?: any) => {
    if (error instanceof Error) {
      logger.error(message, { error: error.message, stack: error.stack, ...meta })
    } else {
      logger.error(message, { error, ...meta })
    }
  },
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta),
}

export default logger