import { describe, expect, it } from 'vitest'

import { shouldRejectInsecureProductionRequest } from '../services/httpsRuntimeBoundary.js'

describe('production HTTPS request boundary', () => {
  it('rejects ordinary production API requests without trusted HTTPS forwarding', () => {
    expect(shouldRejectInsecureProductionRequest({
      nodeEnv: 'production',
      path: '/api/projects',
      secure: false,
      forwardedProto: 'http',
    })).toBe(true)
  })

  it('accepts HTTPS-forwarded traffic and internal readiness probes', () => {
    expect(shouldRejectInsecureProductionRequest({
      nodeEnv: 'production',
      path: '/api/projects',
      secure: false,
      forwardedProto: 'https',
    })).toBe(false)
    expect(shouldRejectInsecureProductionRequest({
      nodeEnv: 'production',
      path: '/api/readyz',
      secure: false,
      forwardedProto: 'http',
    })).toBe(false)
  })

  it('does not impose the production proxy contract on local tests', () => {
    expect(shouldRejectInsecureProductionRequest({
      nodeEnv: 'test',
      path: '/api/projects',
      secure: false,
      forwardedProto: null,
    })).toBe(false)
  })
})
