import { EventEmitter } from 'node:events'

import { describe, expect, it } from 'vitest'

import { logger, redactSensitiveData, requestLogger } from '../middleware/logger.js'

describe('logger redaction', () => {
  it('recursively redacts sensitive keys while retaining diagnostic structure', () => {
    expect(redactSensitiveData({
      title: 'safe title',
      authorization: 'Bearer secret-token',
      nested: {
        apiKey: 'secret-key',
        password: 'secret-password',
        rows: [{ temporaryPassword: 'temporary-secret', id: 'row-1' }],
      },
    })).toEqual({
      title: 'safe title',
      authorization: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        password: '[REDACTED]',
        rows: [{ temporaryPassword: '[REDACTED]', id: 'row-1' }],
      },
    })
  })

  it('records query key names without recording query values', () => {
    const req = {
      method: 'GET',
      path: '/api/projects',
      query: { token: 'query-secret', page: '2' },
      ip: '127.0.0.1',
      headers: {},
    } as any
    const res = new EventEmitter() as any
    res.statusCode = 200
    res.setHeader = () => undefined

    requestLogger(req, res, () => undefined)

    const entry = logger.getLogs().at(-1)
    expect(entry?.message).toBe('Incoming request')
    expect(entry?.context).toMatchObject({ queryKeys: ['page', 'token'] })
    expect(JSON.stringify(entry?.context)).not.toContain('query-secret')
  })

  it('redacts credentials embedded in generic diagnostic strings', () => {
    logger.error(
      'connection failed',
      'Bearer token-value postgresql://postgres:database-password@example.test/db',
    )

    const entry = logger.getLogs().at(-1)
    expect(JSON.stringify(entry?.context)).not.toContain('token-value')
    expect(JSON.stringify(entry?.context)).not.toContain('database-password')
    expect(entry?.context).toMatchObject({
      detail: 'Bearer [REDACTED] postgresql://postgres:[REDACTED]@example.test/db',
    })
  })
})
