import express from 'express'
import supertest from 'supertest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  const materials: Array<Record<string, unknown>> = []
  const authState = {
    userId: 'user-1',
    globalRole: 'regular',
    permissionLevel: 'owner' as 'owner' | 'editor' | 'viewer' | null,
  }
  const changeLogs = {
    writeLog: vi.fn(async () => undefined),
    writeLifecycleLog: vi.fn(async () => undefined),
  }

  const supabaseInstance = {
    query: vi.fn(async (table: string, conditions: Record<string, unknown> = {}) => {
      if (table !== 'project_materials') return []
      return materials.filter((material) => Object.entries(conditions).every(([key, value]) => material[key] === value))
    }),
    create: vi.fn(async (table: string, data: Record<string, unknown>) => {
      if (table !== 'project_materials') return null
      materials.push({ ...data })
      return { ...data }
    }),
    update: vi.fn(async (table: string, id: string, data: Record<string, unknown>) => {
      if (table !== 'project_materials') return null
      const index = materials.findIndex((row) => row.id === id)
      if (index === -1) return null
      materials[index] = { ...materials[index], ...data }
      return { ...materials[index] }
    }),
    delete: vi.fn(async (table: string, id: string) => {
      if (table !== 'project_materials') return
      const index = materials.findIndex((row) => row.id === id)
      if (index !== -1) materials.splice(index, 1)
    }),
  }

  const materialReportsService = {
    listProjectMaterials: vi.fn(async (projectId: string) => materials
      .filter((row) => row.project_id === projectId)
      .map((row) => ({
        id: String(row.id),
        project_id: String(row.project_id),
        participant_unit_id: row.participant_unit_id ? String(row.participant_unit_id) : null,
        participant_unit_name: row.participant_unit_id ? '幕墙单位' : null,
        material_name: String(row.material_name ?? ''),
        specialty_type: row.specialty_type ? String(row.specialty_type) : null,
        requires_sample_confirmation: Boolean(row.requires_sample_confirmation),
        sample_confirmed: Boolean(row.sample_confirmed),
        expected_arrival_date: String(row.expected_arrival_date ?? ''),
        actual_arrival_date: row.actual_arrival_date ? String(row.actual_arrival_date) : null,
        requires_inspection: Boolean(row.requires_inspection),
        inspection_done: Boolean(row.inspection_done),
        version: Number(row.version ?? 1),
        created_at: String(row.created_at ?? '2026-04-19T00:00:00.000Z'),
        updated_at: String(row.updated_at ?? '2026-04-19T00:00:00.000Z'),
      }))),
    buildMaterialReportSummary: vi.fn(async () => ({
      overview: { totalExpectedCount: 2, onTimeCount: 1, arrivalRate: 50 },
      byUnit: [
        {
          participantUnitId: 'unit-1',
          participantUnitName: '幕墙单位',
          specialtyTypes: ['幕墙'],
          totalExpectedCount: 2,
          onTimeCount: 1,
          arrivalRate: 50,
        },
      ],
      monthlyTrend: [
        { month: '2026-04', totalExpectedCount: 2, onTimeCount: 1, arrivalRate: 50 },
      ],
    })),
  }

  return { materials, authState, supabaseInstance, materialReportsService, changeLogs }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = {
      id: state.authState.userId,
      globalRole: state.authState.globalRole,
    }
    next()
  }),
}))

vi.mock('../auth/access.js', () => ({
  getProjectPermissionLevel: vi.fn(async () => state.authState.permissionLevel),
  isCompanyAdminRole: vi.fn((role?: string | null) => String(role ?? '').trim() === 'company_admin'),
}))

vi.mock('../services/dbService.js', () => ({
  SupabaseService: vi.fn(() => state.supabaseInstance),
}))

vi.mock('../services/materialReportsService.js', () => ({
  listProjectMaterials: state.materialReportsService.listProjectMaterials,
  buildMaterialReportSummary: state.materialReportsService.buildMaterialReportSummary,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: state.changeLogs.writeLog,
  writeLifecycleLog: state.changeLogs.writeLifecycleLog,
}))

const { default: projectMaterialsRouter } = await import('../routes/project-materials.js')

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/materials', projectMaterialsRouter)
  return app
}

describe('project materials routes', () => {
  beforeEach(() => {
    state.materials.splice(0, state.materials.length)
    state.authState.userId = 'user-1'
    state.authState.globalRole = 'regular'
    state.authState.permissionLevel = 'owner'
    vi.clearAllMocks()
  })

  it('adds the migration and route registration hooks', () => {
    const migration = readServerFile('migrations', '100a_create_project_materials.sql')
    const indexSource = readServerFile('src', 'index.ts')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.project_materials')
    expect(migration).toContain('participant_unit_id UUID NULL REFERENCES public.participant_units(id) ON DELETE SET NULL')
    expect(indexSource).toContain("import projectMaterialsRouter from './routes/project-materials.js'")
    expect(indexSource).toContain("app.use('/api/projects/:projectId/materials', projectMaterialsRouter)")
    expect(indexSource.indexOf("app.use('/api/projects/:projectId/materials', projectMaterialsRouter)")).toBeLessThan(
      indexSource.indexOf("app.use('/api/projects', projectsRouter)"),
    )
  })

  it('supports owner CRUD and summary access', async () => {
    const request = supertest(buildApp())

    const createRes = await request.post('/api/projects/project-1/materials').send({
      participant_unit_id: 'unit-1',
      material_name: '铝合金型材',
      specialty_type: '幕墙',
      requires_sample_confirmation: true,
      expected_arrival_date: '2026-04-25',
      requires_inspection: true,
    })

    expect(createRes.status).toBe(201)
    expect(createRes.body.success).toBe(true)
    expect(createRes.body.data).toMatchObject({
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      material_name: '铝合金型材',
      specialty_type: '幕墙',
      requires_sample_confirmation: true,
      expected_arrival_date: '2026-04-25',
      requires_inspection: true,
    })
    expect(state.changeLogs.writeLifecycleLog).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      entity_type: 'project_material',
      entity_id: createRes.body.data.id,
      action: 'created',
    }))

    const listRes = await request.get('/api/projects/project-1/materials')
    expect(listRes.status).toBe(200)
    expect(listRes.body.data).toHaveLength(1)

    const updateRes = await request.patch(`/api/projects/project-1/materials/${createRes.body.data.id}`).send({
      actual_arrival_date: '2026-04-24',
      sample_confirmed: true,
      inspection_done: true,
    })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data).toMatchObject({
      actual_arrival_date: '2026-04-24',
      sample_confirmed: true,
      inspection_done: true,
      version: 2,
    })
    expect(state.changeLogs.writeLog).toHaveBeenCalled()

    const summaryRes = await request.get('/api/projects/project-1/materials/summary')
    expect(summaryRes.status).toBe(200)
    expect(summaryRes.body.data.overview.arrivalRate).toBe(50)

    const deleteRes = await request.delete(`/api/projects/project-1/materials/${createRes.body.data.id}`)
    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.success).toBe(true)
    expect(state.changeLogs.writeLifecycleLog).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      entity_type: 'project_material',
      entity_id: createRes.body.data.id,
      action: 'deleted',
    }))
  })

  it('allows company admins to read without project membership but still blocks writes', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: null,
      material_name: 'Low-E 玻璃',
      specialty_type: '幕墙',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-28',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
    })
    state.authState.globalRole = 'company_admin'
    state.authState.permissionLevel = null

    const request = supertest(buildApp())

    const listRes = await request.get('/api/projects/project-1/materials')
    expect(listRes.status).toBe(200)
    expect(listRes.body.data).toHaveLength(1)

    const writeRes = await request.post('/api/projects/project-1/materials').send({
      material_name: '结构胶',
      expected_arrival_date: '2026-04-26',
    })
    expect(writeRes.status).toBe(403)
  })

  it('rejects invalid create payloads', async () => {
    const request = supertest(buildApp())

    const missingName = await request.post('/api/projects/project-1/materials').send({
      expected_arrival_date: '2026-04-25',
    })
    expect(missingName.status).toBe(400)

    const missingDate = await request.post('/api/projects/project-1/materials').send({
      material_name: '消防喷淋头',
    })
    expect(missingDate.status).toBe(400)
  })

  it('clears completion flags when sample or inspection is not required', async () => {
    const request = supertest(buildApp())

    const createRes = await request.post('/api/projects/project-1/materials').send({
      material_name: '电缆桥架',
      expected_arrival_date: '2026-04-27',
      requires_sample_confirmation: false,
      sample_confirmed: true,
      requires_inspection: false,
      inspection_done: true,
    })

    expect(createRes.status).toBe(201)
    expect(createRes.body.data).toMatchObject({
      requires_sample_confirmation: false,
      sample_confirmed: false,
      requires_inspection: false,
      inspection_done: false,
    })

    const updateRes = await request.patch(`/api/projects/project-1/materials/${createRes.body.data.id}`).send({
      requires_sample_confirmation: true,
      sample_confirmed: true,
      requires_inspection: true,
      inspection_done: true,
    })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data).toMatchObject({
      requires_sample_confirmation: true,
      sample_confirmed: true,
      requires_inspection: true,
      inspection_done: true,
    })

    const clearRes = await request.patch(`/api/projects/project-1/materials/${createRes.body.data.id}`).send({
      requires_sample_confirmation: false,
      sample_confirmed: true,
      requires_inspection: false,
      inspection_done: true,
    })

    expect(clearRes.status).toBe(200)
    expect(clearRes.body.data).toMatchObject({
      requires_sample_confirmation: false,
      sample_confirmed: false,
      requires_inspection: false,
      inspection_done: false,
    })
  })

  it('falls back to the updated payload when material reread fails after patch', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      material_name: '铝型材',
      specialty_type: '幕墙',
      requires_sample_confirmation: true,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-24',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
    })
    state.materialReportsService.listProjectMaterials.mockRejectedValueOnce(new Error('list failed'))

    const request = supertest(buildApp())
    const response = await request.patch('/api/projects/project-1/materials/material-1').send({
      expected_arrival_date: '2026-04-23',
      change_reason: '采纳 AI 排程建议',
    })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      material_name: '铝型材',
      expected_arrival_date: '2026-04-23',
      version: 2,
    })
    expect(state.changeLogs.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      field_name: 'expected_arrival_date',
      new_value: '2026-04-23',
      change_reason: '采纳 AI 排程建议',
    }))
  })
})
