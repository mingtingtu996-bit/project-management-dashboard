import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { READ_ONLY_CACHE_HEADER, readOnlyCacheMiddleware } from '../middleware/httpCache.js'

function createApp() {
  const app = express()
  app.use(readOnlyCacheMiddleware)
  app.get('/api/tasks', (_req, res) => {
    res.json({ ok: true })
  })
  app.get('/api/tasks/123', (_req, res) => {
    res.json({ ok: true })
  })
  app.get('/api/auth/me', (_req, res) => {
    res.json({ ok: true })
  })
  app.post('/api/tasks', (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

describe('readOnlyCacheMiddleware', () => {
  it('adds short private cache headers for read-only list APIs', async () => {
    const app = createApp()
    const response = await request(app).get('/api/tasks')

    expect(response.headers['cache-control']).toBe(READ_ONLY_CACHE_HEADER)
    expect(response.headers.vary).toContain('Authorization')
    expect(response.headers.vary).toContain('Cookie')
  })

  it('does not cache likely detail reads or auth endpoints', async () => {
    const app = createApp()

    const detailResponse = await request(app).get('/api/tasks/123')
    const authResponse = await request(app).get('/api/auth/me')

    expect(detailResponse.headers['cache-control']).toBeUndefined()
    expect(authResponse.headers['cache-control']).toBeUndefined()
  })

  it('does not attach cache headers to write requests', async () => {
    const app = createApp()
    const response = await request(app).post('/api/tasks')

    expect(response.headers['cache-control']).toBeUndefined()
  })
})
