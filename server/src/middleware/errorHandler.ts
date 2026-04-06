// 错误处理中间件

import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { logger } from './logger.js'
import type { ApiResponse } from '../types/index.js'

interface AppError extends Error {
  statusCode?: number
  code?: string
  details?: unknown
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  })

  // Zod 验证错误
  if (err instanceof ZodError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '数据验证失败',
        details: err.errors,
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 已知错误类型（检查 err.name 和 err.message，兼容两种抛出方式）
  if (err.name === 'VERSION_MISMATCH' || err.message === 'VERSION_MISMATCH') {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VERSION_MISMATCH',
        message: '数据版本冲突，请刷新后重试',
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(409).json(response)
  }

  if (err.code === 'CONFLICT' || err.name === 'CONFLICT') {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'CONFLICT',
        message: '数据已被其他用户修改',
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(409).json(response)
  }

  // 默认错误
  const statusCode = err.statusCode || 500
  const response: ApiResponse = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: statusCode === 500 ? '服务器内部错误' : err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    },
    timestamp: new Date().toISOString(),
  }

  res.status(statusCode).json(response)
}

// 404 处理
export function notFoundHandler(req: Request, res: Response) {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `路由 ${req.method} ${req.path} 不存在`,
    },
    timestamp: new Date().toISOString(),
  }
  res.status(404).json(response)
}

// 异步错误包装器
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
