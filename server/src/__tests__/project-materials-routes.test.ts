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
  let transactionActive = false
  const materials: Array<Record<string, unknown>> = []
  const participantUnits: Array<Record<string, unknown>> = []
  const factTransactionStates: boolean[] = []
  const authState = {
    userId: 'user-1',
    globalRole: 'regular',
    permissionLevel: 'owner' as 'owner' | 'editor' | null,
  }
  const changeLogs = {
    writeLog: vi.fn(async () => undefined),
    writeLifecycleLog: vi.fn(async () => undefined),
  }
  let failMaterialInsertAt: number | null = null
  let materialInsertCount = 0
  const recordChangedExecutionFacts = vi.fn(async () => {
    factTransactionStates.push(transactionActive)
    return []
  })
  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.trim().replace(/\s+/g, ' ').toLowerCase()
    if (normalized.startsWith('insert into project_materials')) {
      materialInsertCount++
      if (failMaterialInsertAt === materialInsertCount) {
        throw new Error('simulated material insert failure')
      }
      const [
        id,
        projectId,
        participantUnitId,
        materialName,
        specialtyType,
        requiresSampleConfirmation,
        sampleConfirmed,
        expectedArrivalDate,
        actualArrivalDate,
        requiresInspection,
        inspectionDone,
        version,
        createdAt,
        updatedAt,
      ] = params
      const row = {
        id,
        project_id: projectId,
        participant_unit_id: participantUnitId,
        material_name: materialName,
        specialty_type: specialtyType,
        requires_sample_confirmation: requiresSampleConfirmation,
        sample_confirmed: sampleConfirmed,
        expected_arrival_date: expectedArrivalDate,
        actual_arrival_date: actualArrivalDate,
        requires_inspection: requiresInspection,
        inspection_done: inspectionDone,
        version,
        created_at: createdAt,
        updated_at: updatedAt,
      }
      materials.push(row)
      return [row]
    }
    if (normalized.startsWith('select * from project_materials')) {
      const [materialId, projectId] = params
      const row = materials.find((material) => material.id === materialId && material.project_id === projectId)
      return row ? [{ ...row }] : []
    }
    if (normalized.startsWith('update project_materials set participant_unit_id')) {
      const [
        participantUnitId,
        materialName,
        specialtyType,
        requiresSampleConfirmation,
        sampleConfirmed,
        expectedArrivalDate,
        actualArrivalDate,
        requiresInspection,
        inspectionDone,
        version,
        updatedAt,
        materialId,
        projectId,
      ] = params
      const index = materials.findIndex((material) => material.id === materialId && material.project_id === projectId)
      if (index < 0) return []
      materials[index] = {
        ...materials[index],
        participant_unit_id: participantUnitId,
        material_name: materialName,
        specialty_type: specialtyType,
        requires_sample_confirmation: requiresSampleConfirmation,
        sample_confirmed: sampleConfirmed,
        expected_arrival_date: expectedArrivalDate,
        actual_arrival_date: actualArrivalDate,
        requires_inspection: requiresInspection,
        inspection_done: inspectionDone,
        version,
        updated_at: updatedAt,
      }
      return [{ ...materials[index] }]
    }
    return []
  })
  const withDatabaseTransaction = vi.fn(async (work: () => Promise<unknown>) => {
    const snapshot = materials.map((row) => ({ ...row }))
    const parentActive = transactionActive
    transactionActive = true
    try {
      return await work()
    } catch (error) {
      materials.splice(0, materials.length, ...snapshot)
      throw error
    } finally {
      transactionActive = parentActive
    }
  })

  const materialArrivalReminderService = {
    handleMaterialArrived: vi.fn(async () => ({
      conditionUnlockCount: 0,
      conditionIds: [],
      taskIds: [],
      notificationId: null,
    })),
  }

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

  return {
    materials,
    participantUnits,
    authState,
    supabaseInstance,
    supabaseDb,
    materialReportsService,
    changeLogs,
    executeSQL,
    withDatabaseTransaction,
    recordChangedExecutionFacts,
    factTransactionStates,
    isTransactionActive: () => transactionActive,
    materialArrivalReminderService,
    setFailMaterialInsertAt(value: number | null) {
      failMaterialInsertAt = value
      materialInsertCount = 0
    },
  }
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

vi.mock('../database.js', () => ({
  withDatabaseTransaction: state.withDatabaseTransaction,
}))

vi.mock('../services/executionFactGovernanceService.js', () => ({
  recordChangedExecutionFacts: state.recordChangedExecutionFacts,
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
  materialArrivalReminderService: state.materialArrivalReminderService,
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
    state.setFailMaterialInsertAt(null)
    vi.clearAllMocks()
    state.factTransactionStates.splice(0, state.factTransactionStates.length)
    state.recordChangedExecutionFacts.mockImplementation(async () => {
      state.factTransactionStates.push(state.isTransactionActive())
      return []
    })
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

  it('rolls back the whole material batch when a later insert fails', async () => {
    state.setFailMaterialInsertAt(2)

    const response = await supertest(buildApp())
      .post('/api/projects/project-1/materials')
      .send([
        {
          participant_unit_id: 'unit-1',
          material_name: 'first material',
          specialty_type: 'facade',
          expected_arrival_date: '2026-04-25',
        },
        {
          participant_unit_id: 'unit-1',
          material_name: 'second material',
          specialty_type: 'facade',
          expected_arrival_date: '2026-04-26',
        },
      ])

    expect(response.status).toBe(500)
    expect(state.withDatabaseTransaction).toHaveBeenCalledTimes(1)
    expect(state.materials).toHaveLength(0)
    expect(state.supabaseInstance.create).not.toHaveBeenCalled()
  })

  it('records a forced initial arrival fact for every created material inside the batch transaction', async () => {
    const response = await supertest(buildApp())
      .post('/api/projects/project-1/materials')
      .send([
        {
          material_name: 'pending cable',
          specialty_type: 'mep',
          expected_arrival_date: '2026-04-25',
        },
        {
          material_name: 'delivered glass',
          specialty_type: 'facade',
          expected_arrival_date: '2026-04-24',
          actual_arrival_date: '2026-04-23',
        },
      ])

    expect(response.status).toBe(201)
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledTimes(2)
    expect(state.recordChangedExecutionFacts).toHaveBeenNthCalledWith(1, expect.objectContaining({
      projectId: 'project-1',
      entityType: 'material_batch',
      sourceModule: 'project-materials',
      sourceMutationId: expect.stringMatching(/^material_batch:.+:version:1$/),
      changes: [expect.objectContaining({
        factType: 'material_batch.actual_arrival_date',
        previousValue: null,
        nextValue: null,
        force: true,
      })],
    }))
    expect(state.recordChangedExecutionFacts).toHaveBeenNthCalledWith(2, expect.objectContaining({
      changes: [expect.objectContaining({
        factType: 'material_batch.actual_arrival_date',
        previousValue: null,
        nextValue: '2026-04-23',
        force: true,
        effectiveAt: '2026-04-23T00:00:00.000Z',
      })],
    }))
    expect(state.factTransactionStates).toEqual([true, true])
  })

  it('rolls back a material arrival projection when execution-fact persistence fails', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      material_name: 'arrival rollback',
      specialty_type: 'facade',
      expected_arrival_date: '2026-04-25',
      actual_arrival_date: null,
      requires_sample_confirmation: false,
      sample_confirmed: false,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
    })
    state.recordChangedExecutionFacts.mockRejectedValueOnce(new Error('simulated execution fact failure'))

    const response = await supertest(buildApp())
      .patch('/api/projects/project-1/materials/material-1')
      .send({ actual_arrival_date: '2026-04-24' })

    expect(response.status).toBe(500)
    expect(state.materials[0]?.actual_arrival_date).toBeNull()
    expect(state.materialArrivalReminderService.handleMaterialArrived).not.toHaveBeenCalled()
    expect(state.materialReportsService.clearMaterialReportCache).not.toHaveBeenCalled()
  })

  it('records a changed arrival fact before the material patch transaction commits', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      material_name: 'arrival fact',
      specialty_type: 'facade',
      expected_arrival_date: '2026-04-25',
      actual_arrival_date: null,
      requires_sample_confirmation: false,
      sample_confirmed: false,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .patch('/api/projects/project-1/materials/material-1')
      .send({ actual_arrival_date: '2026-04-24' })

    expect(response.status).toBe(200)
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'material_batch',
      entityId: 'material-1',
      sourceMutationId: 'material_batch:material-1:version:2',
      changes: [expect.objectContaining({
        factType: 'material_batch.actual_arrival_date',
        previousValue: null,
        nextValue: '2026-04-24',
        effectiveAt: '2026-04-24T00:00:00.000Z',
      })],
    }))
    expect(state.factTransactionStates).toEqual([true])
    expect(state.materialArrivalReminderService.handleMaterialArrived).toHaveBeenCalledTimes(1)
  })

  it('requires an explicit reason before correcting an established material arrival date', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      material_name: 'corrected arrival',
      specialty_type: 'facade',
      expected_arrival_date: '2026-04-25',
      actual_arrival_date: '2026-04-23',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .patch('/api/projects/project-1/materials/material-1')
      .send({ actual_arrival_date: '2026-04-24' })

    expect(response.status).toBe(400)
    expect(state.materials[0]?.actual_arrival_date).toBe('2026-04-23')
    expect(state.recordChangedExecutionFacts).not.toHaveBeenCalled()
  })

  it('records the supplied reason when correcting an established material arrival date', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      material_name: 'corrected arrival',
      specialty_type: 'facade',
      expected_arrival_date: '2026-04-25',
      actual_arrival_date: '2026-04-23',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .patch('/api/projects/project-1/materials/material-1')
      .send({
        actual_arrival_date: '2026-04-24',
        change_reason: 'Corrected against the signed delivery receipt.',
      })

    expect(response.status).toBe(200)
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      correctionReason: 'Corrected against the signed delivery receipt.',
      changes: [expect.objectContaining({
        previousValue: '2026-04-23',
        nextValue: '2026-04-24',
      })],
    }))
    expect(state.factTransactionStates).toEqual([true])
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
