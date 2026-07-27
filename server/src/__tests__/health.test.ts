import { describe, it, expect } from 'vitest'
import { request } from './testSetup.js'

describe('Liveness API', () => {
  it('returns liveness and build identity without claiming dependency readiness', async () => {
    const response = await request.get('/api/livez')
    
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('status', 'live')
    expect(response.body).toHaveProperty('timestamp')
    expect(response.body).toHaveProperty('build.releaseSha')
  })

  it('should return valid ISO timestamp', async () => {
    const response = await request.get('/api/livez')
    const timestamp = new Date(response.body.timestamp)
    
    expect(timestamp.getTime()).not.toBeNaN()
  })
})
