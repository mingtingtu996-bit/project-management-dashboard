import { mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import pino, { type Logger as PinoLogger, type StreamEntry } from 'pino'
import type { Request, Response, NextFunction } from 'express'

import type { LogEntry } from '../types/index.js'

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

type LogContext = Record<string, unknown> | Error | string | undefined

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const LOG_DIR = process.env.LOG_DIR
  ? path.resolve(process.env.LOG_DIR)
  : path.resolve(__dirname, '../../../logs')
const LOG_FILE_PATH = process.env.LOG_FILE_PATH
  ? path.resolve(process.env.LOG_FILE_PATH)
  : path.join(LOG_DIR, 'server.log')
const MEMORY_LOG_LIMIT = Number(process.env.LOG_MEMORY_LIMIT ?? 1000)
const ENABLE_PERSISTED_LOGS =
  process.env.LOG_PERSIST === 'false'
    ? false
    : process.env.NODE_ENV !== 'test' || process.env.LOG_PERSIST_IN_TEST === 'true'

if (ENABLE_PERSISTED_LOGS) {
  mkdirSync(LOG_DIR, { recursive: true })
}

function createPinoLogger(): PinoLogger {
  const streams: StreamEntry[] = [{ stream: process.stdout }]

  if (ENABLE_PERSISTED_LOGS) {
    streams.push({
      stream: pino.destination({
        dest: LOG_FILE_PATH,
        mkdir: true,
        sync: process.env.NODE_ENV === 'test',
      }),
    })
  }

  return pino(
    {
      level: process.env.LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        service: 'project-management-api',
        env: process.env.NODE_ENV || 'development',
      },
    },
    pino.multistream(streams),
  )
}

function normalizeContext(context?: LogContext): Record<string, unknown> | undefined {
  if (context == null) return undefined
  if (context instanceof Error) {
    return {
      errorName: context.name,
      errorMessage: context.message,
      stack: context.stack,
    }
  }
  if (typeof context === 'string') {
    return { detail: context }
  }
  return context
}

class PersistentLogger {
  private readonly pino: PinoLogger

  private readonly logs: LogEntry[] = []

  private readonly maxLogs: number

  constructor() {
    this.pino = createPinoLogger()
    this.maxLogs = Number.isFinite(MEMORY_LOG_LIMIT) && MEMORY_LOG_LIMIT > 0 ? MEMORY_LOG_LIMIT : 1000
  }

  private pushLog(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      requestId: typeof context?.requestId === 'string' ? context.requestId : undefined,
      userId: typeof context?.userId === 'string' ? context.userId : undefined,
    }

    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  private write(level: LogLevel, message: string, context?: LogContext) {
    const normalizedContext = normalizeContext(context)
    this.pushLog(level, message, normalizedContext)
    this.pino[level](normalizedContext ?? {}, message)
  }

  error(message: string, context?: LogContext) {
    this.write('error', message, context)
  }

  warn(message: string, context?: LogContext) {
    this.write('warn', message, context)
  }

  info(message: string, context?: LogContext) {
    this.write('info', message, context)
  }

  debug(message: string, context?: LogContext) {
    this.write('debug', message, context)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((entry) => entry.level === level)
  }
}

export const logger = new PersistentLogger()

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  const requestId = req.headers['x-request-id']?.toString().trim() || crypto.randomUUID()

  res.setHeader('x-request-id', requestId)
  ;(req as Request & { requestId?: string }).requestId = requestId

  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || null,
  })

  res.on('finish', () => {
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    })
  })

  next()
}
