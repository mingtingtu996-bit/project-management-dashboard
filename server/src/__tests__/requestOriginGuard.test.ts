import express from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

const modulePath = resolve(import.meta.dirname, '..', 'middleware', 'requestOriginGuard.ts')

async function createGuardedApp(expectedOrigin: string) {
  expect(existsSync(modulePath), 'requestOriginGuard.ts must exist').toBe(true)
  const { createRequestOriginGuard } = await import(pathToFileURL(modulePath).href)
  const app = express()
  let mutationCount = 0
  app.use(createRequestOriginGuard({ enforce: true, expectedOrigin }))
  app.use(express.json())
  app.post('/api/tasks', (_req, res) => {
    mutationCount += 1
    res.status(201).json({ success: true })
  })
  app.post('/api/auth/login', (_req, res) => {
    mutationCount += 1
    res.status(200).json({ success: true, data: { token: 'test-token' } })
  })
  app.get('/api/readyz', (_req, res) => res.json({ ready: true }))
  return { app, mutationCount: () => mutationCount }
}

describe('request origin guard', () => {
  it('rejects staging origin at production before the mutation handler', async () => {
    const fixture = await createGuardedApp('https://124.222.54.190')

    const response = await request(fixture.app)
      .post('/api/tasks')
      .set('Origin', 'https://124.222.54.190:8443')
      .set('Cookie', 'workbuddy_production_auth_token=production-token')
      .send({ name: 'blocked' })

    expect(response.status).toBe(403)
    expect(response.body.error?.code).toBe('CROSS_ENVIRONMENT_ORIGIN_FORBIDDEN')
    expect(fixture.mutationCount()).toBe(0)
  })

  it('rejects production origin at staging before the mutation handler', async () => {
    const fixture = await createGuardedApp('https://124.222.54.190:8443')

    const response = await request(fixture.app)
      .post('/api/tasks')
      .set('Origin', 'https://124.222.54.190')
      .set('Cookie', 'workbuddy_staging_auth_token=staging-token')
      .send({ name: 'blocked' })

    expect(response.status).toBe(403)
    expect(fixture.mutationCount()).toBe(0)
  })

  it('accepts the exact origin or referer and rejects a missing browser origin', async () => {
    const fixture = await createGuardedApp('https://124.222.54.190:8443')

    const originResponse = await request(fixture.app)
      .post('/api/tasks')
      .set('Origin', 'https://124.222.54.190:8443')
      .set('Cookie', 'workbuddy_staging_auth_token=staging-token')
      .send({ name: 'origin' })
    const refererResponse = await request(fixture.app)
      .post('/api/tasks')
      .set('Referer', 'https://124.222.54.190:8443/planning')
      .set('Cookie', 'workbuddy_staging_auth_token=staging-token')
      .send({ name: 'referer' })
    const missingResponse = await request(fixture.app)
      .post('/api/tasks')
      .set('Cookie', 'workbuddy_staging_auth_token=staging-token')
      .send({ name: 'missing' })

    expect(originResponse.status).toBe(201)
    expect(refererResponse.status).toBe(201)
    expect(missingResponse.status).toBe(403)
    expect(fixture.mutationCount()).toBe(2)
  })

  it('allows safe methods and cookie-free bearer machine requests', async () => {
    const fixture = await createGuardedApp('https://124.222.54.190')

    const readyz = await request(fixture.app).get('/api/readyz')
    const machine = await request(fixture.app)
      .post('/api/tasks')
      .set('Authorization', 'Bearer machine-token')
      .send({ name: 'machine' })

    expect(readyz.status).toBe(200)
    expect(machine.status).toBe(201)
    expect(fixture.mutationCount()).toBe(1)
  })

  it('allows a loopback login only with the exact external public origin', async () => {
    const fixture = await createGuardedApp('https://124.222.54.190:8443')

    const missing = await request(fixture.app)
      .post('/api/auth/login')
      .send({ username: 'operator', password: 'secret' })
    const wrong = await request(fixture.app)
      .post('/api/auth/login')
      .set('Origin', 'https://124.222.54.190')
      .send({ username: 'operator', password: 'secret' })
    const exact = await request(fixture.app)
      .post('/api/auth/login')
      .set('Origin', 'https://124.222.54.190:8443')
      .send({ username: 'operator', password: 'secret' })

    expect(missing.status).toBe(403)
    expect(wrong.status).toBe(403)
    expect(exact.status).toBe(200)
    expect(fixture.mutationCount()).toBe(1)
  })
})
