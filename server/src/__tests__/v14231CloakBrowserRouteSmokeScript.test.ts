import { describe, expect, it } from 'vitest'

import {
  isBlockingConsoleMessage,
  isBlockingHttpResponseStatus,
} from '../../../scripts/verify-v14231-cloakbrowser-route-smoke.mjs'

describe('v1.4.23.1 CloakBrowser route smoke script', () => {
  it('fails closed on browser console 5xx resource errors', () => {
    expect(isBlockingConsoleMessage({
      type: 'error',
      text: 'Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
    })).toBe(true)
    expect(isBlockingConsoleMessage('GET /api/company/dashboard/company-summary 502 Bad Gateway')).toBe(true)
  })

  it('does not block on common missing static assets by itself', () => {
    expect(isBlockingConsoleMessage({
      type: 'error',
      text: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
    })).toBe(false)
  })

  it('classifies 5xx HTTP responses as blocking route smoke evidence', () => {
    expect(isBlockingHttpResponseStatus(500)).toBe(true)
    expect(isBlockingHttpResponseStatus(502)).toBe(true)
    expect(isBlockingHttpResponseStatus(404)).toBe(false)
  })
})
