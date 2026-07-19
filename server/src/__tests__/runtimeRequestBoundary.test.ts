import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { createRuntimeRequestBoundary } from '../middleware/runtimeRequestBoundary.js'

describe('runtime request boundary integration', () => {
  it('requires both trusted HTTPS forwarding and the exact environment origin before a production handler', async () => {
    const app = express()
    let handlerCalls = 0
    app.use(createRuntimeRequestBoundary({
      nodeEnv: 'production',
      expectedOrigin: 'https://staging.zhuxucloud.com',
    }))
    app.use(express.json())
    app.post('/api/auth/login', (_req, res) => {
      handlerCalls += 1
      res.status(200).json({ success: true })
    })

    const insecureTunnel = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://staging.zhuxucloud.com')
      .send({ username: 'operator', password: 'secret' })
    const wrongOrigin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://zhuxucloud.com')
      .send({ username: 'operator', password: 'secret' })
    const controlledTunnel = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://staging.zhuxucloud.com')
      .send({ username: 'operator', password: 'secret' })

    expect(insecureTunnel.status).toBe(426)
    expect(insecureTunnel.body.error?.code).toBe('HTTPS_REQUIRED')
    expect(wrongOrigin.status).toBe(403)
    expect(wrongOrigin.body.error?.code).toBe('CROSS_ENVIRONMENT_ORIGIN_FORBIDDEN')
    expect(controlledTunnel.status).toBe(200)
    expect(handlerCalls).toBe(1)
  })
})
