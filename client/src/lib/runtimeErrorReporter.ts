import { apiPost } from '@/lib/apiClient'

type RuntimeErrorPayload = {
  source: 'error_boundary' | 'window_error' | 'unhandled_rejection'
  message: string
  stack?: string | null
  componentStack?: string | null
  url?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

function trimText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

export async function reportRuntimeError(payload: RuntimeErrorPayload): Promise<void> {
  try {
    await apiPost('/api/client-errors', {
      source: payload.source,
      message: trimText(payload.message, 1000),
      stack: trimText(payload.stack, 6000),
      componentStack: trimText(payload.componentStack, 6000),
      url: trimText(payload.url || window.location.href, 1000),
      userAgent: trimText(payload.userAgent || window.navigator.userAgent, 1000),
      metadata: payload.metadata ?? {},
      happenedAt: new Date().toISOString(),
    })
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[runtime-error] failed to report client error', error)
    }
  }
}

let globalHandlersInstalled = false

export function installGlobalRuntimeErrorHandlers(): void {
  if (typeof window === 'undefined' || globalHandlersInstalled) return

  window.addEventListener('error', (event) => {
    void reportRuntimeError({
      source: 'window_error',
      message: event.message || 'Unknown window error',
      stack: event.error instanceof Error ? event.error.stack : null,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled promise rejection')
    const stack = reason instanceof Error ? reason.stack : null

    void reportRuntimeError({
      source: 'unhandled_rejection',
      message,
      stack,
      metadata: {
        reasonType: typeof reason,
      },
    })
  })

  globalHandlersInstalled = true
}

