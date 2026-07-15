import { describe, expect, it, vi } from 'vitest'

import { fetchJsonWithLimits } from '../services/externalJsonHttpClient.js'

describe('external JSON HTTP client', () => {
  it('aborts a provider that never returns within the configured deadline', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      await new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
      return new Response()
    }) as typeof fetch

    await expect(fetchJsonWithLimits('https://weather.example.test/data', {
      fetchImpl,
      timeoutMs: 20,
      maxResponseBytes: 1024,
      errorCode: 'WEATHER_FETCH_FAILED',
    })).rejects.toMatchObject({
      code: 'WEATHER_FETCH_FAILED',
      reason: 'timeout',
    })
  })

  it('rejects a response body larger than the configured byte limit', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ payload: 'x'.repeat(200) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch

    await expect(fetchJsonWithLimits('https://weather.example.test/data', {
      fetchImpl,
      timeoutMs: 100,
      maxResponseBytes: 64,
      errorCode: 'WEATHER_FETCH_FAILED',
    })).rejects.toMatchObject({
      code: 'WEATHER_FETCH_FAILED',
      reason: 'response_too_large',
    })
  })

  it('forwards caller cancellation and parses a bounded JSON response', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch

    await expect(fetchJsonWithLimits('https://weather.example.test/data', {
      fetchImpl,
      signal: controller.signal,
      timeoutMs: 100,
      maxResponseBytes: 1024,
      errorCode: 'WEATHER_FETCH_FAILED',
    })).resolves.toEqual({ ok: true })
  })
})
