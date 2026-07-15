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
  const materials: Array<Record<string, unknown>> = []
  const participantUnits: Array<Record<string, unknown>> = []
  const authState = {
    userId: 'user-1',
    globalRole: 'regular',
    permissionLevel: 'owner' as 'owner' | 'editor' | null,
  }
  const changeLogs = {
    writeLog: vi.fn(async () => undefined),
    writeLifecycleLog: vi.fn(async () => undefined),
  }
  const executeSQL = vi.fn(async (_sql: string, _params: unknown[] = []) => [])

  const supabaseInstance = {
    query: vi.fn(async (table: string, conditions: Record<string, unknown> = {}) => {
      if (table === 'project_materials') {
        return materials.filter((material) => Object.entries(conditions).every(([key, value]) => material[key] === value))
      }
      if (table === 'participant_units') {
        return participantUnits.filter((unit) => Object.entries(conditions).every(([key, value]) => unit[key] === value))
      }
      return []
    }),
    create: vi.fn(async (table: string, data: Record<string, unknown>) => {
      if (table !== 'project_materials') return null
      materials.push({ ...data })
      return { ...data }
    }),
  }

  const supabaseDb = {
    from: vi.fn((table: string) => ({
      update: vi.fn((data: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {}
        return {
          eq: vi.fn(function eq(key: string, value: unknown) {
            filters[key] = value
            return this
          }),
          then: async (resolve: (value: unknown) => void) => {
            if (table === 'project_materials') {
              const index = materials.findIndex((item) => Object.entries(filters).every(([key, value]) => item[key] === value))
              if (index !== -1) materials[index] = { ...materials[index], ...data }
            }
            resolve({ error: null })
          },
        }
      }),
    })),
  }

  const materialReportsService = {
    listProjectMaterials: vi.fn(async (projectId: string) => materials
      .filter((row) => row.project_id === projectId)
      .filter((row) => row.record_status !== 'inactive')
      .map((row) => ({
        id: String(row.id),
        project_id: String(row.project_id),
        participant_unit_id: row.participant_unit_id ? String(row.participant_unit_id) : null,
        participant_unit_name: row.participant_unit_id ? 'Curtain wall contractor' : null,
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
    clearMaterialReportCache: vi.fn(() => undefined),
    buildMaterialReportSummary: vi.fn(async () => ({
      overview: { totalExpectedCount: 2, onTimeCount: 1, arrivalRate: 50 },
      byUnit: [
        {
          participantUnitId: 'unit-1',
          participantUnitName: 'Curtain wall contractor',
          specialtyTypes: ['facade'],
          totalExpectedCount: 2,
          onTimeCount: 1,
          arrivalRate: 50,
        },
      ],
      byCategory: [{ category: 'steel', count: 1, percentage: 50 }],
      monthlyTrend: [{ month: '2026-04', totalExpectedCount: 2, onTimeCount: 1, arrivalRate: 50 }],
    })),
  }

  return { materials, participantUnits, authState, supabaseInstance, supabaseDb, materialReportsService, changeLogs, executeSQL }
})

function joinedSql(calls: ReadonlyArray<ReadonlyArray<unknown>>) {
  return calls.map((call) => String(call[0]).toLowerCase()).join('\n')
}

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
  getProjectCompanyId: vi.fn(async (projectId: string) => (projectId ? 'company-1' : null)),
  isCompanyAdminRole: vi.fn((role?: string | null) => String(role ?? '').trim() === 'company_admin'),
}))

vi.mock('../services/dbService.js', () => ({
  SupabaseService: vi.fn(() => state.supabaseInstance),
  executeSQL: state.executeSQL,
  supabase: state.supabaseDb,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/materialReportsService.js', () => ({
  listProjectMaterials: state.materialReportsService.listProjectMaterials,
  clearMaterialReportCache: state.materialReportsService.clearMaterialReportCache,
  buildMaterialReportSummary: state.materialReportsService.buildMaterialReportSummary,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: state.changeLogs.writeLog,
  writeLifecycleLog: state.changeLogs.writeLifecycleLog,
}))

vi.mock('../services/materialArrivalReminderService.js', () => ({
  materialArrivalReminderService: {
    handleMaterialArrived: vi.fn(async () => ({
      conditionUnlockCount: 0,
      conditionIds: [],
      taskIds: [],
      notificationId: null,
    })),
  },
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  enforceRetentionOrBlock: vi.fn(async () => ({ blocked: false, reason: null, result: { requiresUserConfirmation: false } })),
  buildRetentionBlockedApiError: vi.fn((message: string, details: unknown) => ({
    code: 'RETENTION_CONFIRMATION_REQUIRED',
    message,
    details,
  })),
  buildRetentionBlockedHttpStatus: vi.fn((result: Record<string, unknown>) => (
    result.requiresUserConfirmation ? 409 : 422
  )),
}))

const { default: projectMaterialsRouter } = await import('../routes/project-materials.js')

const serverRoot = fileURLToPath(new URL('../..', import.meta.url))

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
    state.participantUnits.splice(0, state.participantUnits.length)
    state.participantUnits.push({
      id: 'unit-1',
      project_id: 'project-1',
      unit_name: 'Curtain wall contractor',
    })
    state.participantUnits.push({
      id: 'unit-other-project',
      project_id: 'project-2',
      unit_name: 'Other project unit',
    })
    state.authState.userId = 'user-1'
    state.authState.globalRole = 'regular'
    state.authState.permissionLevel = 'owner'
    vi.clearAllMocks()
  })

  it('keeps the route registered before generic project routes', () => {
    const migration = readServerFile('migrations', '100a_create_project_materials.sql')
    const indexSource = readServerFile('src', 'index.ts')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.project_materials')
    expect(migration).toContain('participant_unit_id UUID NULL REFERENCES public.participant_units(id) ON DELETE SET NULL')
    expect(indexSource).toContain("import projectMaterialsRouter from './routes/project-materials.js'")
    expect(indexSource.indexOf("app.use('/api/projects/:projectId/materials', projectMaterialsRouter)")).toBeLessThan(
      indexSource.indexOf("app.use('/api/projects', projectsRouter)"),
    )
  })

  it('does not use JWT globalRole for material access decisions', () => {
    const routeSource = readServerFile('src', 'routes', 'project-materials.ts')
    const getAccessSource = routeSource.slice(
      routeSource.indexOf('async function getAccess'),
      routeSource.indexOf('function normalizeCreatePayload'),
    )

    expect(getAccessSource).not.toContain('globalRole')
    expect(getAccessSource).not.toContain('isCompanyAdminRole')
    expect(routeSource).not.toContain('req.user?.globalRole')
  })

  it('supports owner CRUD and summary access without professional object fields', async () => {
    const request = supertest(buildApp())

    const createRes = await request.post('/api/projects/project-1/materials').send({
      participant_unit_id: 'unit-1',
      material_name: 'aluminum profile',
      specialty_type: 'facade',
      requires_sample_confirmation: true,
      expected_arrival_date: '2026-04-25',
      requires_inspection: true,
    })

    expect(createRes.status).toBe(201)
    expect(createRes.body.data).toMatchObject({
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      material_name: 'aluminum profile',
      specialty_type: 'facade',
      requires_sample_confirmation: true,
      expected_arrival_date: '2026-04-25',
      requires_inspection: true,
    })
    expect(createRes.body.data).not.toHaveProperty('professional_object_id')

    const listRes = await request.get('/api/projects/project-1/materials')
    expect(listRes.status).toBe(200)
    expect(listRes.body.data).toHaveLength(1)
    expect(listRes.body.data[0]).not.toHaveProperty('professional_object_id')

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
  })

  it('allows editor reads but blocks writes after project permission is removed', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: null,
      material_name: 'Low-E glass',
      specialty_type: 'facade',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-28',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
    })
    state.authState.globalRole = 'company_admin'
    state.authState.permissionLevel = 'editor'

    const request = supertest(buildApp())

    const listRes = await request.get('/api/projects/project-1/materials')
    expect(listRes.status).toBe(200)
    expect(listRes.body.data).toHaveLength(1)

    state.authState.permissionLevel = null
    const writeRes = await request.post('/api/projects/project-1/materials').send({
      material_name: 'structural adhesive',
      specialty_type: 'facade',
      expected_arrival_date: '2026-04-26',
    })
    expect(writeRes.status).toBe(403)
  })

  it('rejects invalid create payloads', async () => {
    const request = supertest(buildApp())

    const missingName = await request.post('/api/projects/project-1/materials').send({
      specialty_type: 'facade',
      expected_arrival_date: '2026-04-25',
    })
    expect(missingName.status).toBe(400)

    const missingSpecialty = await request.post('/api/projects/project-1/materials').send({
      material_name: 'sprinkler head',
      expected_arrival_date: '2026-04-25',
    })
    expect(missingSpecialty.status).toBe(400)

    const missingDate = await request.post('/api/projects/project-1/materials').send({
      material_name: 'sprinkler head',
      specialty_type: 'fire',
    })
    expect(missingDate.status).toBe(400)
  })

  it('rejects participant units and deprecated professional object ids on new material writes', async () => {
    const request = supertest(buildApp())

    const invalidUnit = await request.post('/api/projects/project-1/materials').send({
      participant_unit_id: 'unit-other-project',
      material_name: 'cross-project material',
      specialty_type: 'facade',
      expected_arrival_date: '2026-04-25',
    })

    expect(invalidUnit.status).toBe(400)
    expect(invalidUnit.body.error.message).toContain('participant_unit_id')

    const deprecatedProfessionalObject = await request.post('/api/projects/project-1/materials').send({
      participant_unit_id: 'unit-1',
      material_name: 'legacy professional object material',
      specialty_type: 'facade',
      professional_object_id: 'legacy-prof-other-project',
      expected_arrival_date: '2026-04-25',
    })

    expect(deprecatedProfessionalObject.status).toBe(400)
    expect(deprecatedProfessionalObject.body.success).toBe(false)
  })

  it('clears completion flags when sample or inspection is not required', async () => {
    const request = supertest(buildApp())

    const createRes = await request.post('/api/projects/project-1/materials').send({
      material_name: 'cable tray',
      specialty_type: 'mep',
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
      material_name: 'aluminum profile',
      specialty_type: 'facade',
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
      change_reason: 'AI review',
    })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      material_name: 'aluminum profile',
      expected_arrival_date: '2026-04-23',
      version: 2,
    })
    expect(state.changeLogs.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      field_name: 'expected_arrival_date',
      new_value: '2026-04-23',
      change_reason: 'AI review',
    }))
  })

  it('records material arrival as sample health evidence without publishing runtime assets', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      material_name: 'aluminum profile',
      specialty_type: 'facade',
      requires_sample_confirmation: true,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-25',
      actual_arrival_date: null,
      requires_inspection: true,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
    })

    const request = supertest(buildApp())
    const response = await request.patch('/api/projects/project-1/materials/material-1').send({
      actual_arrival_date: '2026-04-24',
      sample_confirmed: true,
      inspection_done: true,
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)

    const sampleHealthInserts = state.executeSQL.mock.calls.filter(([sql]) =>
      String(sql).toLowerCase().includes('insert into public.algorithm_sample_health_events')
    )
    expect(sampleHealthInserts).toHaveLength(1)
    expect(sampleHealthInserts[0]?.[1]).toEqual(expect.arrayContaining([
      'material_handover:material-1',
      'business_completion.sample_health',
      'businessCompletionSampleHealthAdapterService',
      'company-1',
      'project-1',
      'governance_report',
      expect.objectContaining({
        workCode: 'material_handover:aluminum profile',
        benchmarkEligible: false,
        candidateEvidenceEligible: true,
        domain: 'material_handover',
        businessCode: 'aluminum profile',
        nonDurationBusinessCompletionSample: true,
        handoverId: 'material-1',
        materialId: 'material-1',
        handoverCode: 'aluminum profile',
        materialName: 'aluminum profile',
        specialtyType: 'facade',
        participantUnitId: 'unit-1',
        actualArrivalDate: '2026-04-24',
        sourceRoute: 'project-materials.patch',
      }),
    ]))

    const sqlText = joinedSql(state.executeSQL.mock.calls)
    expect(sqlText).not.toContain('standard_work_duration')
    expect(sqlText).not.toContain('algorithm_seed_records')
    expect(sqlText).not.toContain('algorithm_seed_overrides')
    expect(sqlText).not.toContain('algorithm_learnable_parameter_runtime_publications')
    expect(sqlText).not.toContain('policy_template_entity_runtime_publications')
  })
})
