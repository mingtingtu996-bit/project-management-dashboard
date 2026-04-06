// API 类型定义

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  pagination?: {
    total: number
    limit: number
    offset: number
    hasMore?: boolean
    page?: number
    pageSize?: number
    totalPages?: number
  }
  timestamp: string
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    limit: number
    offset: number
    hasMore?: boolean
  }
}

// CRUD 操作类型
export type CreateOperation<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>
export type UpdateOperation<T> = Partial<Omit<T, 'id' | 'created_at'>> & { version: number }

// 错误代码
export const ErrorCodes = {
  // 通用错误
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  
  // 业务错误
  CONFLICT: 'CONFLICT',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  INVALID_INVITATION: 'INVALID_INVITATION',
  EXPIRED_INVITATION: 'EXPIRED_INVITATION',
  
  // 资源错误
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  RISK_NOT_FOUND: 'RISK_NOT_FOUND',
  MILESTONE_NOT_FOUND: 'MILESTONE_NOT_FOUND',
} as const

// 日志级别
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
  requestId?: string
  userId?: string
}
