import supertest from 'supertest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const { default: app } = await import('../index.js')

const request = supertest(app)

export { app, request }
