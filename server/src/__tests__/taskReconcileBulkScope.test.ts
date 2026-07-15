import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const routeSource = readFileSync(join(__dirname, '../routes/taskReconcile.ts'), 'utf8')

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(async (_sql: string, _params: unknown[] = []) => []),
  rawQuery: vi.fn(async (sql: string, _params: unknown[] = []) => {
    if (sql.includes('SELECT DISTINCT project_id')) {
      return { rows: [{ project_id: 'project-1' }], rowCount: 1 }
    }
    return { rows: [], rowCount: 2 }
  }),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectMember: vi.fn((_getProjectId: (req: any) => string) => (_req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn((getProjectId: (req: any) => string | Promise<string | undefined> | undefined) => async (req: any, res: any, next: () => void) => {
    const projectId = await getProjectId(req)
    if (!projectId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } })
      return
    }
    req.authorizedProjectId = projectId
    next()
  }),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/wbsReconciliationService.js', () => ({
  buildReconcilePreview: vi.fn(() => ({ entries: [] })),
}))

const { default: taskReconcileRouter } = await import('../routes/taskReconcile.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(taskReconcileRouter)
  return app
}

describe('task reconcile bulk scope route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers project reconcile routes with project-id aware member middleware', () => {
    expect(routeSource).not.toMatch(/reconcile\/preview', authenticate, requireProjectMember,/)
    expect(routeSource).not.toMatch(/reconcile\/apply', authenticate, requireProjectMember,/)
    expect(routeSource).not.toMatch(/reconcile\/:batchId\/rollback', authenticate, requireProjectMember,/)
    expect(routeSource).toMatch(/reconcile\/preview', authenticate, requireProjectMember\(\(req\) => req\.params\.id\),/)
    expect(routeSource).toMatch(/reconcile\/apply', authenticate, requireProjectMember\(\(req\) => req\.params\.id\),/)
    expect(routeSource).toMatch(/reconcile\/:batchId\/rollback', authenticate, requireProjectMember\(\(req\) => req\.params\.id\),/)
  })

  it('requires project editor permission before applying bulk scope patches', () => {
    expect(routeSource).toContain('requireProjectEditor')
    expect(routeSource).toContain('resolveBulkScopeProjectId')
    expect(routeSource).toMatch(/router\.patch\('\/api\/tasks\/bulk-scope', authenticate, requireProjectEditor\(async \(req\) => resolveBulkScopeProjectId\(req\)\),/)
  })

  it('uses one fixed jsonb_to_recordset update for bulk scope patches', async () => {
    const response = await supertest(buildApp())
      .patch('/api/tasks/bulk-scope')
      .send({
        taskIds: ['task-1', 'task-2'],
        buildingObjectId: '11111111-1111-4111-8111-111111111111',
        floorObjectId: '',
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: { updated: 2 },
    })
    expect(mocks.executeSQL).not.toHaveBeenCalled()
    expect(mocks.rawQuery).toHaveBeenCalledTimes(2)

    const [lookupSql, lookupParams = []] = mocks.rawQuery.mock.calls[0] as [string, unknown[]]
    expect(String(lookupSql)).toContain('SELECT DISTINCT project_id')
    expect(lookupParams).toEqual([['task-1', 'task-2']])

    const [sql, params = []] = mocks.rawQuery.mock.calls[1] as [string, unknown[]]
    expect(String(sql)).toContain('jsonb_to_recordset($1::jsonb)')
    expect(String(sql)).toContain('UPDATE tasks AS t')
    expect(String(sql)).toContain('AND t.project_id::text = $3')
    expect(String(sql)).toContain('building_object_id_present')
    expect(String(sql)).not.toContain('${setClauses')
    expect(String(sql)).not.toContain('${placeholders')
    expect(params).toHaveLength(3)
    expect(JSON.parse(String(params[0]))).toEqual([
      expect.objectContaining({
        task_id: 'task-1',
        building_object_id: '11111111-1111-4111-8111-111111111111',
        building_object_id_present: true,
        floor_object_id: null,
        floor_object_id_present: true,
        basement_object_id_present: false,
      }),
      expect.objectContaining({
        task_id: 'task-2',
        building_object_id: '11111111-1111-4111-8111-111111111111',
        building_object_id_present: true,
        floor_object_id: null,
        floor_object_id_present: true,
        basement_object_id_present: false,
      }),
    ])
    expect(params[2]).toBe('project-1')
  })
})
