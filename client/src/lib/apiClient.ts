import { safeJsonParse, safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browserStorage'
import { toast } from '@/hooks/use-toast'
import { reportApiPerformanceEvidence } from '@/lib/performanceEvidenceReporter'

/**
 * 通用 API 客户端
 * 统一处理认证头、Cookie 凭证和响应解析。
 */

const TOKEN_STORAGE_KEYS = ['auth_token', 'access_token'] as const
const DEV_BACKEND_HINT = '接口服务暂不可用，请先启动本地后端（默认 3001，可使用 启动登录系统.bat）后重试。'
const SERVER_UNAVAILABLE_HINT = '接口服务暂不可用，请确认后端服务已启动后重试。'
const OFFLINE_WRITE_BLOCK_MESSAGE = '当前处于离线状态，无法保存或提交内容，请恢复网络后重试。'
const API_ERROR_TOAST_EVENT = 'workbuddy:api-error'
const API_ERROR_TOAST_DEDUPE_MS = 4000
const DEFAULT_API_READ_CACHE_TTL_MS = 2500
const MAX_API_READ_CACHE_ENTRIES = 80

export type ApiErrorCode = 'backend_unavailable' | 'network_error' | 'http_error'
export type ApiRuntimeCacheMode = 'default' | 'off'

export interface AuthFetchOptions extends RequestInit {
  runtimeCache?: ApiRuntimeCacheMode
  runtimeCacheTtlMs?: number
  dedupe?: boolean
}

type ApiErrorToastDetail = {
  key: string
  title: string
  description: string
  url: string
  code: ApiErrorCode
  method: string
  status: number | null
}

declare global {
  interface WindowEventMap {
    [API_ERROR_TOAST_EVENT]: CustomEvent<ApiErrorToastDetail>
  }
}

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

const apiErrorToastTimestamps = new Map<string, number>()
const apiReadCache = new Map<string, { expiresAt: number; value: unknown }>()
const apiReadInflight = new Map<string, Promise<unknown>>()

function shouldDispatchApiErrorToast(key: string): boolean {
  const now = Date.now()
  const lastShownAt = apiErrorToastTimestamps.get(key) ?? 0
  if (now - lastShownAt < API_ERROR_TOAST_DEDUPE_MS) return false
  apiErrorToastTimestamps.set(key, now)
  return true
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

  const parsed = safeJsonParse<unknown>(trimmed, null, 'api error payload')
  if (parsed && typeof parsed === 'object') {
    const errorBlock: Record<string, unknown> =
      'error' in parsed && parsed.error && typeof parsed.error === 'object'
        ? (parsed.error as Record<string, unknown>)
        : (parsed as Record<string, unknown>)
    const message = typeof errorBlock.message === 'string' ? errorBlock.message.trim() : ''
    const details = typeof errorBlock.details === 'string' ? errorBlock.details.trim() : ''

    if (message && details && !details.includes(message)) {
      return `${message}：${details}`
    }

    return message || details || trimmed
  }

  return trimmed.replace(/^Error:\s*/i, '')
}

function inferServiceUnavailableMessage(url: string): string {
  return isLocalDevApi(url) ? DEV_BACKEND_HINT : SERVER_UNAVAILABLE_HINT
}

function getApiErrorToastPayload(error: ApiClientError, method: string): ApiErrorToastDetail | null {
  if (error.code === 'backend_unavailable') {
    return {
      key: `backend_unavailable:${error.url}`,
      title: '后端服务暂不可用',
      description: error.message || inferServiceUnavailableMessage(error.url),
      url: error.url,
      code: error.code,
      method,
      status: error.status,
    }
  }

  if (error.code === 'network_error') {
    const isOfflineWriteBlock = error.message === OFFLINE_WRITE_BLOCK_MESSAGE
    return {
      key: `network_error:${method}:${error.url}:${isOfflineWriteBlock ? 'offline' : 'request'}`,
      title: isOfflineWriteBlock ? '网络连接已断开' : '网络请求失败',
      description: error.message || '网络异常，请检查连接后重试。',
      url: error.url,
      code: error.code,
      method,
      status: error.status,
    }
  }

  if (error.code === 'http_error' && (error.status ?? 0) >= 500) {
    return {
      key: `http_error:${error.status}:${error.url}`,
      title: '服务暂时不可用',
      description: error.message || `请求失败 ${error.status}`,
      url: error.url,
      code: error.code,
      method,
      status: error.status,
    }
  }

  return null
}

function dispatchApiErrorToast(error: ApiClientError, method: string): void {
  if (typeof window === 'undefined') return

  const payload = getApiErrorToastPayload(error, method)
  if (!payload || !shouldDispatchApiErrorToast(payload.key)) return

  window.dispatchEvent(
    new CustomEvent<ApiErrorToastDetail>(API_ERROR_TOAST_EVENT, {
      detail: payload,
    }),
  )
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

let apiErrorToastListenerBound = false

export function bindApiErrorToToast(): void {
  if (typeof window === 'undefined' || apiErrorToastListenerBound) return

  window.addEventListener(API_ERROR_TOAST_EVENT, (event) => {
    toast({
      title: event.detail.title,
      description: event.detail.description,
      variant: 'destructive',
    })
  })

  apiErrorToastListenerBound = true
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null

  for (const key of TOKEN_STORAGE_KEYS) {
    const token = safeStorageGet(localStorage, key)
    if (token) return token
  }

  return null
}

export function persistAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return

  clearApiClientRuntimeCache()

  if (token) {
    safeStorageSet(localStorage, 'auth_token', token)
    safeStorageSet(localStorage, 'access_token', token)
    return
  }

  for (const key of TOKEN_STORAGE_KEYS) {
    safeStorageRemove(localStorage, key)
  }
}

export function getAuthToken(): string {
  return getStoredToken() || ''
}

export function getAuthHeaders(): HeadersInit {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function cloneApiPayload<T>(value: T): T {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value)
    }

    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

function getRequestStartedAt(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function getRequestDurationMs(startedAt: number): number {
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
  return Math.max(0, now - startedAt)
}

function normalizeHeadersForCache(headers: HeadersInit): Array<[string, string]> {
  const normalizedHeaders = new Headers(headers)
  const entries: Array<[string, string]> = []

  normalizedHeaders.forEach((value, key) => {
    entries.push([key.toLowerCase(), value])
  })

  return entries.sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
}

function mergeHeaders(baseHeaders: HeadersInit, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders)
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => {
      headers.set(key, value)
    })
  }
  return headers
}

function getApiReadCacheKey(url: string, method: string, options: RequestInit, headers: HeadersInit): string | null {
  if (method !== 'GET' || !isApiPath(url) || options.signal || options.body) return null
  return JSON.stringify(['api-read', url, normalizeHeadersForCache(headers)])
}

function pruneApiReadCache(now = Date.now()): void {
  for (const [key, entry] of apiReadCache.entries()) {
    if (entry.expiresAt <= now) {
      apiReadCache.delete(key)
    }
  }

  while (apiReadCache.size > MAX_API_READ_CACHE_ENTRIES) {
    const oldestKey = apiReadCache.keys().next().value
    if (!oldestKey) break
    apiReadCache.delete(oldestKey)
  }
}

export function clearApiClientRuntimeCache(): void {
  apiReadCache.clear()
  apiReadInflight.clear()
}

function readApiRuntimeCache<T>(key: string): { hit: true; value: T } | { hit: false } {
  const now = Date.now()
  const cached = apiReadCache.get(key)

  if (!cached) return { hit: false }
  if (cached.expiresAt <= now) {
    apiReadCache.delete(key)
    return { hit: false }
  }

  return { hit: true, value: cloneApiPayload(cached.value as T) }
}

function writeApiRuntimeCache<T>(key: string, value: T, ttlMs: number): void {
  pruneApiReadCache()
  apiReadCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value: cloneApiPayload(value),
  })
}

export async function authFetch<T = unknown>(
  url: string,
  options?: AuthFetchOptions
): Promise<T> {
  const requestStartedAt = getRequestStartedAt()
  const {
    runtimeCache = 'default',
    runtimeCacheTtlMs = DEFAULT_API_READ_CACHE_TTL_MS,
    dedupe = true,
    ...fetchOptions
  } = options ?? {}
  const method = (fetchOptions.method || 'GET').toUpperCase()

  try {
    if (typeof window !== 'undefined' && !window.navigator.onLine && method !== 'GET' && method !== 'HEAD') {
      throw new ApiClientError(OFFLINE_WRITE_BLOCK_MESSAGE, {
        status: null,
        url,
        code: 'network_error',
      })
    }

    if (method !== 'GET' && method !== 'HEAD') {
      clearApiClientRuntimeCache()
    }

    const headers = mergeHeaders(getAuthHeaders(), fetchOptions.headers)
    const cacheKey =
      runtimeCache === 'off' || runtimeCacheTtlMs <= 0
        ? null
        : getApiReadCacheKey(url, method, fetchOptions, headers)

    if (cacheKey) {
      const cached = readApiRuntimeCache<T>(cacheKey)
      if (cached.hit) {
        void reportApiPerformanceEvidence({
          url,
          method,
          statusCode: 200,
          durationMs: getRequestDurationMs(requestStartedAt),
          cacheStatus: 'runtime_cache',
        })
        return cached.value
      }

      const inflight = apiReadInflight.get(cacheKey) as Promise<T> | undefined
      if (inflight && dedupe) {
        const payload = cloneApiPayload(await inflight)
        void reportApiPerformanceEvidence({
          url,
          method,
          statusCode: 200,
          durationMs: getRequestDurationMs(requestStartedAt),
          cacheStatus: 'inflight',
        })
        return payload
      }
    }

    const request = (async () => {
      const response = await fetch(url, {
        ...fetchOptions,
        cache: fetchOptions.cache ?? (isApiPath(url) ? 'no-store' : undefined),
        credentials: 'include',
        headers,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw buildHttpError(url, response.status, errorText)
      }

      const data = await response.json()
      const payload = (data.data ?? data) as T

      void reportApiPerformanceEvidence({
        url,
        method,
        statusCode: response.status,
        durationMs: getRequestDurationMs(requestStartedAt),
        cacheStatus: 'network',
      })

      if (cacheKey) {
        writeApiRuntimeCache(cacheKey, payload, runtimeCacheTtlMs)
      }

      return payload
    })()

    if (cacheKey && dedupe) {
      apiReadInflight.set(cacheKey, request)
      request.then(
        () => apiReadInflight.delete(cacheKey),
        () => apiReadInflight.delete(cacheKey),
      )
    }

    return await request
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }

    if (error instanceof ApiClientError) {
      if (error.message !== OFFLINE_WRITE_BLOCK_MESSAGE) {
        void reportApiPerformanceEvidence({
          url,
          method,
          statusCode: error.status,
          durationMs: getRequestDurationMs(requestStartedAt),
          cacheStatus: 'network',
          errorCode: error.code,
        })
      }
      dispatchApiErrorToast(error, method)
      throw error
    }

    if (error instanceof TypeError && isApiPath(url)) {
      const wrappedError = new ApiClientError(inferServiceUnavailableMessage(url), {
        status: null,
        url,
        code: 'network_error',
      })
      void reportApiPerformanceEvidence({
        url,
        method,
        statusCode: null,
        durationMs: getRequestDurationMs(requestStartedAt),
        cacheStatus: 'network',
        errorCode: wrappedError.code,
      })
      dispatchApiErrorToast(wrappedError, method)
      throw wrappedError
    }

    throw error
  }
}

export async function apiGet<T = unknown>(url: string, options?: AuthFetchOptions): Promise<T> {
  return authFetch<T>(url, {
    ...options,
    method: 'GET',
  })
}

export async function apiPost<T = unknown>(url: string, body?: unknown, options?: RequestInit): Promise<T> {
  return authFetch<T>(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiPut<T = unknown>(url: string, body?: unknown, options?: RequestInit): Promise<T> {
  return authFetch<T>(url, {
    ...options,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiPatch<T = unknown>(url: string, body?: unknown, options?: RequestInit): Promise<T> {
  return authFetch<T>(url, {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiDelete<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  return authFetch<T>(url, {
    ...options,
    method: 'DELETE',
  })
}
