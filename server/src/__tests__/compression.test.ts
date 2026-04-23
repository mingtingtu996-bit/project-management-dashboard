import supertest from 'supertest'
import { describe, expect, it } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key'

const { default: app } = await import('../index.js')

describe('response compression', () => {
  it('compresses health responses when gzip is accepted', async () => {
    const response = await supertest(app)
      .get('/api/health')
      .set('Accept-Encoding', 'gzip')

    expect(response.status).toBe(200)
    expect(response.headers['content-encoding']).toBe('gzip')
  })
})
