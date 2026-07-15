import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  configurePerformanceEvidenceReporting,
  reportApiPerformanceEvidence,
  reportPerformanceEvidence,
  resetPerformanceEvidenceReportingForTests,
} from '../performanceEvidenceReporter'

describe('performanceEvidenceReporter', () => {
  beforeEach(() => {
    resetPerformanceEvidenceReportingForTests()
  })

  afterEach(() => {
    resetPerformanceEvidenceReportingForTests()
    vi.unstubAllGlobals()
  })

  it('reports compact client performance evidence through keepalive fetch first', async () => {
    const sendBeacon = vi.fn((_url: string, _data?: BodyInit | null) => true)
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 202 })))
    configurePerformanceEvidenceReporting({ enabled: true, endpoint: '/api/performance-reports' })

    await expect(reportPerformanceEvidence({
      source: 'navigation',
      name: 'page_load',
      value: 2680.4,
      unit: 'ms',
      metadata: {
        ttfbMs: 420,
        huge: 'x'.repeat(800),
      },
    })).resolves.toBe(true)

    expect(fetch).toHaveBeenCalledWith('/api/performance-reports', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      credentials: 'include',
    }))
    expect(sendBeacon).not.toHaveBeenCalled()

    const [, fetchOptions] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(fetchOptions.body))
    expect(payload).toMatchObject({
      source: 'navigation',
      name: 'page_load',
      value: 2680.4,
      unit: 'ms',
    })
    expect(payload.metadata.huge).toHaveLength(500)
  })

  it('uses keepalive fetch when sendBeacon is unavailable', async () => {
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: undefined,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 202 })))
    configurePerformanceEvidenceReporting({ enabled: true, endpoint: '/api/performance-reports' })

    await expect(reportPerformanceEvidence({
      source: 'route',
      name: 'route_settled',
      value: 312,
      unit: 'ms',
    })).resolves.toBe(true)

    expect(fetch).toHaveBeenCalledWith('/api/performance-reports', expect.objectContaining({
      method: 'POST',
      keepalive: true,
      credentials: 'include',
    }))
  })

  it('falls back to sendBeacon when keepalive fetch fails', async () => {
    const sendBeacon = vi.fn((_url: string, _data?: BodyInit | null) => true)
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network interrupted')))
    configurePerformanceEvidenceReporting({ enabled: true, endpoint: '/api/performance-reports' })

    await expect(reportPerformanceEvidence({
      source: 'route',
      name: 'route_settled',
      value: 312,
      unit: 'ms',
    })).resolves.toBe(true)

    expect(sendBeacon).toHaveBeenCalledWith('/api/performance-reports', expect.any(Blob))
  })

  it('keeps normal api calls quiet but reports slow and failed api evidence', async () => {
    const sendBeacon = vi.fn((_url: string, _data?: BodyInit | null) => true)
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 202 })))
    configurePerformanceEvidenceReporting({ enabled: true, apiSlowThresholdMs: 1200 })

    await expect(reportApiPerformanceEvidence({
      url: '/api/projects',
      method: 'GET',
      statusCode: 200,
      durationMs: 80,
    })).resolves.toBe(false)

    await expect(reportApiPerformanceEvidence({
      url: '/api/dashboard',
      method: 'GET',
      statusCode: 200,
      durationMs: 1450,
    })).resolves.toBe(true)

    await expect(reportApiPerformanceEvidence({
      url: '/api/risks',
      method: 'GET',
      statusCode: 500,
      durationMs: 90,
      errorCode: 'http_error',
    })).resolves.toBe(true)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sendBeacon).not.toHaveBeenCalled()
  })
})
