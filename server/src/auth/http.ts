import type { Response } from 'express'

import type { ApiResponse } from '../types/index.js'
import { JWT_CONFIG } from './config.js'

export function authSuccess<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
}

export function authError(code: string, message: string, details?: unknown): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
  }
}

export function setAuthTokenCookie(res: Response, token: string): void {
  res.cookie(JWT_CONFIG.cookie.name, token, {
    httpOnly: JWT_CONFIG.cookie.httpOnly,
    secure: JWT_CONFIG.cookie.secure,
    sameSite: JWT_CONFIG.cookie.sameSite,
    maxAge: JWT_CONFIG.cookie.maxAge,
    path: JWT_CONFIG.cookie.path,
  })
}

export function clearAuthTokenCookie(res: Response): void {
  res.clearCookie(JWT_CONFIG.cookie.name, {
    httpOnly: JWT_CONFIG.cookie.httpOnly,
    secure: JWT_CONFIG.cookie.secure,
    sameSite: JWT_CONFIG.cookie.sameSite,
    path: JWT_CONFIG.cookie.path,
  })
}
