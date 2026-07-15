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
const SLOW_API_REQUEST_THRESHOLD_MS = Number(process.env.SLOW_API_REQUEST_THRESHOLD_MS ?? 1200)
const PERSISTED_LOGS_REQUESTED =
  process.env.LOG_PERSIST === 'false'
    ? false
    : process.env.NODE_ENV !== 'test' || process.env.LOG_PERSIST_IN_TEST === 'true'
const PERSISTED_LOG_ROTATION_MANAGED = process.env.LOG_PERSIST_ROTATION_MANAGED === 'true'
const ENABLE_PERSISTED_LOGS = PERSISTED_LOGS_REQUESTED
  && (process.env.NODE_ENV !== 'production' || PERSISTED_LOG_ROTATION_MANAGED)

if (ENABLE_PERSISTED_LOGS) {
  mkdirSync(LOG_DIR, { recursive: true })
}

function createPinoLogger(): PinoLogger {
  const streams: StreamEntry[] = [{ stream: process.stdout }]
  const defaultLogLevel = process.env.NODE_ENV === 'test' ? 'warn' : 'info'

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
      level: process.env.LOG_LEVEL || defaultLogLevel,
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        service: 'project-management-api',
        env: process.env.NODE_ENV || 'development',
      },
    },
    pino.multistream(streams),
  )
}

function isSensitiveLogKey(key: string) {
  const compact = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return /password|passphrase|secret|token|authorization|cookie|apikey|privatekey|servicekey|credential|connectionstring|databaseurl/.test(compact)
}

function redactSensitiveString(value: string) {
  return value
    .replace(/(bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:password|passphrase|secret|token|api[_-]?key|service[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1[REDACTED]@')
}

export function redactSensitiveData(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (key && isSensitiveLogKey(key)) return '[REDACTED]'
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return redactSensitiveString(value)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return {
      errorName: value.name,
      errorMessage: value.message,
    }
  }
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, '', seen))
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([entryKey, entryValue]) => [entryKey, redactSensitiveData(entryValue, entryKey, seen)]),
  )
}

function normalizeContext(context?: LogContext): Record<string, unknown> | undefined {
  if (context == null) return undefined
  if (context instanceof Error) {
    return redactSensitiveData({
      errorName: context.name,
      errorMessage: context.message,
    }) as Record<string, unknown>
  }
  if (typeof context === 'string') {
    return { detail: redactSensitiveString(context) }
  }
  return redactSensitiveData(context) as Record<string, unknown>
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
    queryKeys: Object.keys(req.query ?? {}).sort().slice(0, 50),
    ip: req.ip,
    userAgent: req.headers['user-agent'] || null,
  })

  res.on('finish', () => {
    const durationMs = Date.now() - start
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
    })

    if (req.path.startsWith('/api/') && durationMs >= SLOW_API_REQUEST_THRESHOLD_MS) {
      logger.warn('Slow API request detected', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        thresholdMs: SLOW_API_REQUEST_THRESHOLD_MS,
      })
    }
  })

  next()
}
