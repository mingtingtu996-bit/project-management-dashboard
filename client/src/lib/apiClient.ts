/**
 * 通用 API 客户端
 * 统一处理认证头、Cookie 凭证和响应解析。
 */

const TOKEN_STORAGE_KEYS = ['auth_token', 'access_token'] as const
const DEV_BACKEND_HINT = '接口服务暂不可用，请先启动本地后端（默认 3001，可使用 启动登录系统.bat）后重试。'
const SERVER_UNAVAILABLE_HINT = '接口服务暂不可用，请确认后端服务已启动后重试。'

export type ApiErrorCode = 'backend_unavailable' | 'network_error' | 'http_error'

export class ApiClientError extends Error {
  status: number | null
  url: string
  code: ApiErrorCode
  rawText: string

  constructor(message: string, options: { status?: number | null; url: string; code: ApiErrorCode; rawText?: string }) {
    super(message)
    this.name = 'ApiClientError'
    this.status = options.status ?? null
    this.url = options.url
    this.code = options.code
    this.rawText = options.rawText ?? ''
  }
}

function isApiPath(url: string): boolean {
  return /^\/api(\/|$)/.test(url)
}

function isLocalDevApi(url: string): boolean {
  if (typeof window === 'undefined') return false
  const isLocalHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
  return isApiPath(url) && isLocalHost && window.location.port === '5173'
}

function parseErrorText(errorText: string): string | null {
  const trimmed = errorText.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    const errorBlock = parsed?.error ?? parsed
    const message = typeof errorBlock?.message === 'string' ? errorBlock.message.trim() : ''
    const details = typeof errorBlock?.details === 'string' ? errorBlock.details.trim() : ''

    if (message && details && !details.includes(message)) {
      return `${message}：${details}`
    }

    return message || details || trimmed
  } catch {
    return trimmed.replace(/^Error:\s*/i, '')
  }
}

function inferServiceUnavailableMessage(url: string): string {
  return isLocalDevApi(url) ? DEV_BACKEND_HINT : SERVER_UNAVAILABLE_HINT
}

function buildHttpError(url: string, status: number, errorText: string): ApiClientError {
  const parsedMessage = parseErrorText(errorText)
  const isBackendUnavailable =
    isApiPath(url) &&
    status >= 500 &&
    (!parsedMessage || /ECONNREFUSED|connect ECONNREFUSED|proxy error/i.test(errorText))

  if (isBackendUnavailable) {
    return new ApiClientError(inferServiceUnavailableMessage(url), {
      status,
      url,
      code: 'backend_unavailable',
      rawText: errorText,
    })
  }

  return new ApiClientError(parsedMessage || `请求失败 ${status}`, {
    status,
    url,
    code: 'http_error',
    rawText: errorText,
  })
}

export function isBackendUnavailableError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.code === 'backend_unavailable'
}

export function getApiErrorMessage(error: unknown, fallback = '请稍后重试。'): string {
  if (error instanceof ApiClientError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null

  for (const key of TOKEN_STORAGE_KEYS) {
    const token = localStorage.getItem(key)
    if (token) return token
  }

  return null
}

export function persistAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return

  if (token) {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('access_token', token)
    return
  }

  for (const key of TOKEN_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
}

export function getAuthToken(): string {
  return getStoredToken() || ''
}

export function getAuthHeaders(): HeadersInit {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function authFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...getAuthHeaders(),
        ...(options?.headers || {}),
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw buildHttpError(url, response.status, errorText)
    }

    const data = await response.json()
    return (data.data ?? data) as T
  } catch (error) {
    if (error instanceof ApiClientError) throw error

    if (error instanceof TypeError && isApiPath(url)) {
      throw new ApiClientError(inferServiceUnavailableMessage(url), {
        status: null,
        url,
        code: 'network_error',
      })
    }

    throw error
  }
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  return authFetch<T>(url, { method: 'GET' })
}

export async function apiPost<T = unknown>(url: string, body?: unknown): Promise<T> {
  return authFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiPut<T = unknown>(url: string, body?: unknown): Promise<T> {
  return authFetch<T>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiDelete<T = unknown>(url: string): Promise<T> {
  return authFetch<T>(url, { method: 'DELETE' })
}
