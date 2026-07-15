type ExternalJsonHttpFailureReason =
  | 'timeout'
  | 'caller_aborted'
  | 'network_error'
  | 'http_status'
  | 'response_too_large'
  | 'invalid_json'

export class ExternalJsonHttpError extends Error {
  constructor(
    public readonly code: string,
    public readonly reason: ExternalJsonHttpFailureReason,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'ExternalJsonHttpError'
  }
}

type FetchJsonOptions = {
  headers?: HeadersInit
  signal?: AbortSignal
  timeoutMs?: number
  maxResponseBytes?: number
  errorCode?: string
  fetchImpl?: typeof fetch
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

async function readBoundedBody(response: Response, maxResponseBytes: number, errorCode: string) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new ExternalJsonHttpError(
      errorCode,
      'response_too_large',
      `External JSON response exceeded ${maxResponseBytes} bytes`,
      502,
    )
  }

  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxResponseBytes) {
        await reader.cancel().catch(() => undefined)
        throw new ExternalJsonHttpError(
          errorCode,
          'response_too_large',
          `External JSON response exceeded ${maxResponseBytes} bytes`,
          502,
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total).toString('utf8')
}

export async function fetchJsonWithLimits<T = unknown>(url: string | URL, options: FetchJsonOptions = {}) {
  const timeoutMs = positiveInteger(options.timeoutMs, 10_000)
  const maxResponseBytes = positiveInteger(options.maxResponseBytes, 1024 * 1024)
  const errorCode = options.errorCode ?? 'EXTERNAL_JSON_FETCH_FAILED'
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  let timedOut = false
  const onCallerAbort = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) onCallerAbort()
  else options.signal?.addEventListener('abort', onCallerAbort, { once: true })

  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error(`External JSON request timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  timeout.unref?.()

  try {
    const response = await fetchImpl(url, {
      headers: options.headers,
      signal: controller.signal,
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new ExternalJsonHttpError(
        errorCode,
        'http_status',
        `External JSON request failed with HTTP ${response.status}`,
        502,
      )
    }
    const body = await readBoundedBody(response, maxResponseBytes, errorCode)
    try {
      return JSON.parse(body) as T
    } catch {
      throw new ExternalJsonHttpError(
        errorCode,
        'invalid_json',
        'External JSON response was not valid JSON',
        502,
      )
    }
  } catch (error) {
    if (error instanceof ExternalJsonHttpError) throw error
    if (timedOut) {
      throw new ExternalJsonHttpError(
        errorCode,
        'timeout',
        `External JSON request timed out after ${timeoutMs}ms`,
        504,
      )
    }
    if (options.signal?.aborted) {
      throw new ExternalJsonHttpError(errorCode, 'caller_aborted', 'External JSON request was cancelled', 499)
    }
    throw new ExternalJsonHttpError(
      errorCode,
      'network_error',
      error instanceof Error ? error.message : String(error),
      502,
    )
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onCallerAbort)
  }
}
