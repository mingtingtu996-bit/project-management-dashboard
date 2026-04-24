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

type PlanRow = {
  id: string
  project_id: string
  catalog_id?: string | null
  updated_at: string
}

type DependencyRow = {
  id: string
  project_id: string | null
  source_plan_id: string
  target_plan_id: string
  dependency_kind: string
  status: string
  created_at: string
  updated_at: string
}

type CatalogRow = {
  id: string
  project_id: string
  catalog_name: string
  updated_at: string
}

type RecordRow = {
  id: string
  project_id: string | null
  plan_id: string
  record_type: string
  content: string
  operator: string | null
  record_date: string | null
  attachments: unknown[] | null
  created_at: string
  updated_at: string
}

const state = vi.hoisted(() => {
  const plans: PlanRow[] = []
  const dependencies: DependencyRow[] = []
  const catalogs: CatalogRow[] = []
  const records: RecordRow[] = []
  let throwCatalogFkOnDelete = false

  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()
  const includesSql = (sql: string, fragment: string) => sql.includes(fragment)
  const clone = <T>(row: T | undefined) => (row ? { ...row } : null)

  const reset = () => {
    plans.splice(0, plans.length)
    dependencies.splice(0, dependencies.length)
    catalogs.splice(0, catalogs.length)
    records.splice(0, records.length)

    plans.push(
      { id: 'plan-a', project_id: 'project-1', updated_at: '2026-04-15T00:00:00.000Z' },
      { id: 'plan-b', project_id: 'project-1', updated_at: '2026-04-15T00:00:00.000Z' },
      { id: 'plan-c', project_id: 'project-1', updated_at: '2026-04-15T00:00:00.000Z' },
      { id: 'plan-d', project_id: 'project-1', updated_at: '2026-04-15T00:00:00.000Z' },
    )

    catalogs.push({
      id: 'catalog-1',
      project_id: 'project-1',
      catalog_name: '主验收目录',
      updated_at: '2026-04-15T00:00:00.000Z',
    })

    plans[0].catalog_id = 'catalog-1'
    throwCatalogFkOnDelete = false

    records.push({
      id: 'record-1',
      project_id: 'project-1',
      plan_id: 'plan-d',
      record_type: 'note',
      content: 'old content',
      operator: 'old-operator',
      record_date: '2026-04-10',
      attachments: [{ id: 'attachment-old' }],
      created_at: '2026-04-10T00:00:00.000Z',
      updated_at: '2026-04-10T00:00:00.000Z',
    })
  }

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized === 'select project_id from acceptance_plans where id = ? limit 1') {
      return clone(plans.find((row) => row.id === String(params[0] ?? '')))
    }

    if (includesSql(normalized, 'from acceptance_dependencies where source_plan_id = ? and target_plan_id = ? limit 1')) {
      return clone(
        dependencies.find(
          (row) =>
            row.source_plan_id === String(params[0] ?? '') &&
            row.target_plan_id === String(params[1] ?? ''),
        ),
      )
    }

    if (includesSql(normalized, 'from acceptance_dependencies where id = ? limit 1')) {
      return clone(dependencies.find((row) => row.id === String(params[0] ?? '')))
    }

    if (normalized === 'select id from acceptance_plans where catalog_id = ? limit 1') {
      const referencedPlan = plans.find((row) => row.catalog_id === String(params[0] ?? ''))
      return referencedPlan ? { id: referencedPlan.id } : null
    }

    if (includesSql(normalized, 'from acceptance_records where id = ? limit 1')) {
      return clone(records.find((row) => row.id === String(params[0] ?? '')))
    }

    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized === 'select source_plan_id, target_plan_id from acceptance_dependencies') {
      return dependencies.map((row) => ({ source_plan_id: row.source_plan_id, target_plan_id: row.target_plan_id }))
    }

    if (normalized === 'insert into acceptance_dependencies (id, project_id, source_plan_id, target_plan_id, dependency_kind, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)') {
      const [id, projectId, sourcePlanId, targetPlanId, dependencyKind, status, createdAt, updatedAt] = params
      dependencies.push({
        id: String(id ?? ''),
        project_id: projectId == null ? null : String(projectId),
        source_plan_id: String(sourcePlanId ?? ''),
        target_plan_id: String(targetPlanId ?? ''),
        dependency_kind: String(dependencyKind ?? 'hard'),
        status: String(status ?? 'active'),
        created_at: String(createdAt ?? ''),
        updated_at: String(updatedAt ?? ''),
      })
      return []
    }

    if (normalized === 'delete from acceptance_dependencies where id = ?') {
      const id = String(params[0] ?? '')
      const index = dependencies.findIndex((row) => row.id === id)
      if (index !== -1) dependencies.splice(index, 1)
      return []
    }

    if (normalized === 'delete from acceptance_catalog where id = ?') {
      if (throwCatalogFkOnDelete) {
        throw new Error('[executeSQL DELETE] insert or update on table "acceptance_plans" violates foreign key constraint "fk_acceptance_plans_catalog_id" | SQL: DELETE FROM acceptance_catalog WHERE id = ?')
      }
      const id = String(params[0] ?? '')
      const index = catalogs.findIndex((row) => row.id === id)
      if (index !== -1) catalogs.splice(index, 1)
      return []
    }

    if (normalized.startsWith('update acceptance_records set ') && normalized.endsWith(' where id = ?')) {
      const setClause = normalized.slice('update acceptance_records set '.length, -' where id = ?'.length)
      const fields = setClause.split(', ').map((fragment) => fragment.replace(' = ?', ''))
      const values = params.slice(0, -1)
      const id = String(params[params.length - 1] ?? '')
      const record = records.find((row) => row.id === id)

      if (record) {
        fields.forEach((field, index) => {
          const value = values[index]
          switch (field) {
            case 'project_id':
              record.project_id = value == null ? null : String(value)
              break
            case 'plan_id':
              record.plan_id = String(value ?? record.plan_id)
              break
            case 'record_type':
              record.record_type = String(value ?? record.record_type)
              break
            case 'content':
              record.content = String(value ?? record.content)
              break
            case 'operator':
              record.operator = value == null ? null : String(value)
              break
            case 'record_date':
              record.record_date = value == null ? null : String(value)
              break
            case 'attachments':
              record.attachments = value == null ? null : (value as unknown[])
              break
            case 'updated_at':
              record.updated_at = String(value ?? record.updated_at)
              break
            default:
              break
          }
        })
      }

      return []
    }

    return []
  })

  return {
    plans,
    dependencies,
    catalogs,
    records,
    get throwCatalogFkOnDelete() {
      return throwCatalogFkOnDelete
    },
    set throwCatalogFkOnDelete(value: boolean) {
      throwCatalogFkOnDelete = value
    },
    executeSQL,
    executeSQLOne,
    reset,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'test-user-id', role: 'owner', globalRole: 'company_admin' }
    next()
  }),
  optionalAuthenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  checkResourceAccess: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
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
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
}))

const { default: acceptancePlansRouter } = await import('../routes/acceptance-plans.js')
const { default: acceptanceCatalogRouter } = await import('../routes/acceptance-catalog.js')
const { default: acceptanceDependenciesRouter } = await import('../routes/acceptance-dependencies.js')
const { default: acceptanceRecordsRouter } = await import('../routes/acceptance-records.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { deleteAcceptanceCatalog } = await import('../services/acceptanceFlowService.js')

const serverRoot = fileURLToPath(new URL('../..', import.meta.url))

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/acceptance-plans', acceptancePlansRouter)
  app.use('/api/acceptance-catalog', acceptanceCatalogRouter)
  app.use('/api/acceptance-dependencies', acceptanceDependenciesRouter)
  app.use('/api/acceptance-records', acceptanceRecordsRouter)
  app.use(errorHandler)
  return app
}

describe('acceptance flow hardening batch', () => {
  beforeEach(() => {
    state.reset()
    vi.clearAllMocks()
  })

  it('locks the route contract and the new FK migration', () => {
    const plansRoute = readServerFile('src', 'routes', 'acceptance-plans.ts')
    const indexSource = readServerFile('src', 'index.ts')
    const migration = readServerFile('migrations', '074_add_acceptance_catalog_fk.sql')

    expect(indexSource).toContain("app.use('/api/acceptance-plans', acceptancePlansRouter)")
    expect(indexSource).toContain("app.use('/api/acceptance-catalog', acceptanceCatalogRouter)")
    expect(indexSource).toContain("app.use('/api/acceptance-dependencies', acceptanceDependenciesRouter)")
    expect(indexSource).toContain("app.use('/api/acceptance-requirements', acceptanceRequirementsRouter)")
    expect(indexSource).toContain("app.use('/api/acceptance-records', acceptanceRecordsRouter)")
    expect(plansRoute).not.toContain("router.use('/catalog', acceptanceCatalogRouter)")
    expect(plansRoute).not.toContain("router.use('/dependencies', acceptanceDependenciesRouter)")
    expect(plansRoute).not.toContain("router.use('/requirements', acceptanceRequirementsRouter)")
    expect(plansRoute).not.toContain("router.use('/records', acceptanceRecordsRouter)")
    expect(migration).toContain('UPDATE acceptance_plans ap')
    expect(migration).toContain('catalog_id = NULL')
    expect(migration).toContain('FOREIGN KEY (catalog_id)')
    expect(migration).toContain('REFERENCES acceptance_catalog(id)')
    expect(migration).toContain('ON DELETE RESTRICT')
  })

  it('rejects dependency cycles before any dependency row is written', async () => {
    const request = supertest(buildApp())
    state.dependencies.push(
      {
        id: 'dep-a-b',
        project_id: 'project-1',
        source_plan_id: 'plan-a',
        target_plan_id: 'plan-b',
        dependency_kind: 'hard',
        status: 'active',
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'dep-b-c',
        project_id: 'project-1',
        source_plan_id: 'plan-b',
        target_plan_id: 'plan-c',
        dependency_kind: 'hard',
        status: 'active',
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
    )

    const response = await request.post('/api/acceptance-dependencies').send({
      project_id: 'project-1',
      source_plan_id: 'plan-c',
      target_plan_id: 'plan-a',
      dependency_kind: 'hard',
    })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('DEPENDENCY_CYCLE_DETECTED')
    expect(response.body.error.message).toContain('循环')
    expect(state.dependencies).toHaveLength(2)
  })

  it('creates dependency edges through acceptance_dependencies only', async () => {
    const request = supertest(buildApp())

    const response = await request.post('/api/acceptance-dependencies').send({
      project_id: 'project-1',
      source_plan_id: 'plan-a',
      target_plan_id: 'plan-d',
      dependency_kind: 'hard',
    })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      source_plan_id: 'plan-a',
      target_plan_id: 'plan-d',
      dependency_kind: 'hard',
    })
    expect(state.dependencies).toHaveLength(1)
  })

  it('updates acceptance records through PUT and PATCH with the same response shape', async () => {
    const request = supertest(buildApp())

    const putResponse = await request.put('/api/acceptance-records/record-1').send({
      content: 'updated content',
      operator: 'alice',
      attachments: [{ id: 'attachment-new' }],
    })

    expect(putResponse.status).toBe(200)
    expect(putResponse.body.success).toBe(true)
    expect(putResponse.body.data).toMatchObject({
      id: 'record-1',
      plan_id: 'plan-d',
      record_type: 'note',
      content: 'updated content',
      operator: 'alice',
    })
    expect(putResponse.body.data.attachments).toEqual([{ id: 'attachment-new' }])

    const patchResponse = await request.patch('/api/acceptance-records/record-1').send({
      record_type: 'meeting_note',
      record_date: '2026-04-15',
    })

    expect(patchResponse.status).toBe(200)
    expect(patchResponse.body.success).toBe(true)
    expect(patchResponse.body.data).toMatchObject({
      id: 'record-1',
      record_type: 'meeting_note',
      record_date: '2026-04-15',
      content: 'updated content',
    })
  })

  it('blocks catalog deletion when acceptance_plans still reference the catalog', async () => {
    const request = supertest(buildApp())

    const response = await request.delete('/api/acceptance-catalog/catalog-1')

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('CATALOG_IN_USE')
    expect(response.body.error.message).toContain('不能删除')
    expect(state.catalogs).toHaveLength(1)
  })

  it('maps a late FK violation back to CATALOG_IN_USE instead of leaking 500', async () => {
    state.plans[0].catalog_id = null
    state.throwCatalogFkOnDelete = true

    await expect(deleteAcceptanceCatalog('catalog-1')).rejects.toMatchObject({
      code: 'CATALOG_IN_USE',
      statusCode: 422,
    })
  })
})
