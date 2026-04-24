import express from 'express'
import supertest from 'supertest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  const units: Array<Record<string, unknown>> = []

  const supabaseInstance = {
    query: vi.fn(async (table: string, conditions: Record<string, unknown> = {}) => {
      if (table !== 'participant_units') return []
      return units.filter((unit) => Object.entries(conditions).every(([key, value]) => unit[key] === value))
    }),
    create: vi.fn(async (table: string, data: Record<string, unknown>) => {
      if (table !== 'participant_units') return null
      units.push({ ...data })
      return { ...data }
    }),
    update: vi.fn(async (table: string, id: string, data: Record<string, unknown>) => {
      if (table !== 'participant_units') return null
      const index = units.findIndex((unit) => unit.id === id)
      if (index === -1) return null
      units[index] = { ...units[index], ...data }
      return { ...units[index] }
    }),
    delete: vi.fn(async (table: string, id: string) => {
      if (table !== 'participant_units') return
      const index = units.findIndex((unit) => unit.id === id)
      if (index !== -1) units.splice(index, 1)
    }),
  }

  return { units, supabaseInstance }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  SupabaseService: vi.fn(() => state.supabaseInstance),
}))

const { default: participantUnitsRouter } = await import('../routes/participant-units.js')

const serverRoot = fileURLToPath(new URL('../..', import.meta.url))

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/participant-units', participantUnitsRouter)
  return app
}

describe('participant units', () => {
  beforeEach(() => {
    state.units.splice(0, state.units.length)
    vi.clearAllMocks()
  })

  it('keeps the migration additive and registers the route in index.ts', () => {
    const migration = readServerFile('migrations', '065_create_participant_units_table.sql')
    const indexSource = readServerFile('src', 'index.ts')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS participant_units')
    expect(migration).toContain('project_id')
    expect(migration).toContain('contact_name')
    expect(migration).toContain('contact_role')
    expect(migration).toContain('contact_phone')
    expect(migration).toContain('contact_email')
    expect(migration).not.toContain('DROP TABLE participant_units')

    expect(indexSource).toContain("import participantUnitsRouter from './routes/participant-units.js'")
    expect(indexSource).toContain("app.use('/api/participant-units', participantUnitsRouter)")
  })

  it('supports project-scoped CRUD with contact fields', async () => {
    const request = supertest(buildApp())

    const createRes = await request.post('/api/participant-units').send({
      project_id: 'project-1',
      unit_name: 'Curtain Wall Team',
      unit_type: 'Curtain Wall',
      contact_name: 'Zhang Gong',
      contact_role: 'Project Manager',
      contact_phone: '13800000000',
      contact_email: 'zhang@example.com',
    })

    expect(createRes.status).toBe(201)
    expect(createRes.body.success).toBe(true)
    expect(createRes.body.data).toMatchObject({
      project_id: 'project-1',
      unit_name: 'Curtain Wall Team',
      unit_type: 'Curtain Wall',
      contact_name: 'Zhang Gong',
      contact_role: 'Project Manager',
      contact_phone: '13800000000',
      contact_email: 'zhang@example.com',
      version: 1,
    })
    expect(createRes.body.data.id).toBeTruthy()

    const listRes = await request.get('/api/participant-units').query({ projectId: 'project-1' })
    expect(listRes.status).toBe(200)
    expect(listRes.body.data).toHaveLength(1)

    const unitId = createRes.body.data.id as string
    const updateRes = await request.put(`/api/participant-units/${unitId}`).send({
      project_id: 'project-1',
      unit_name: 'Curtain Wall Section A',
      unit_type: 'Curtain Wall / Aluminum Panel',
      contact_name: 'Li Gong',
      contact_role: 'Site Lead',
      contact_phone: '13900000000',
      contact_email: 'li@example.com',
      version: 1,
    })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data).toMatchObject({
      project_id: 'project-1',
      unit_name: 'Curtain Wall Section A',
      unit_type: 'Curtain Wall / Aluminum Panel',
      contact_name: 'Li Gong',
      contact_role: 'Site Lead',
      contact_phone: '13900000000',
      contact_email: 'li@example.com',
      version: 2,
    })

    const deleteRes = await request.delete(`/api/participant-units/${unitId}`)
    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.success).toBe(true)
    expect(state.units).toHaveLength(0)
  })

  it('rejects blank names, missing project_id, and version conflicts', async () => {
    const request = supertest(buildApp())

    const missingProject = await request.post('/api/participant-units').send({
      unit_name: 'General Contractor',
      unit_type: 'Civil',
    })
    expect(missingProject.status).toBe(400)

    const badCreate = await request.post('/api/participant-units').send({
      project_id: 'project-1',
      unit_name: '   ',
      unit_type: 'Civil',
    })
    expect(badCreate.status).toBe(400)

    const created = await request.post('/api/participant-units').send({
      project_id: 'project-1',
      unit_name: 'General Contractor',
      unit_type: 'Civil',
    })

    const conflict = await request.put(`/api/participant-units/${created.body.data.id}`).send({
      project_id: 'project-1',
      unit_name: 'General Contractor Updated',
      unit_type: 'Civil',
      version: 99,
    })
    expect(conflict.status).toBe(409)
  })
})
