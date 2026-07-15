import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  getTask: vi.fn(),
  deleteTask: vi.fn(),
}))

const accessMocks = vi.hoisted(() => ({
  getCurrentCompanyMembership: vi.fn(),
  getVisibleProjectIds: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: accessMocks.getCurrentCompanyMembership,
  getVisibleProjectIds: accessMocks.getVisibleProjectIds,
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => null),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  requestLogger: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: dbMocks.executeSQL,
  executeSQLOne: dbMocks.executeSQLOne,
  createTask: dbMocks.createTask,
  updateTask: dbMocks.updateTask,
  getTask: dbMocks.getTask,
  deleteTask: dbMocks.deleteTask,
}))

const { default: wbsRouter } = await import('../routes/wbs.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/wbs-nodes', wbsRouter)
  return app
}

describe('wbs routes validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMocks.executeSQL.mockResolvedValue([])
    dbMocks.executeSQLOne.mockResolvedValue(null)
    dbMocks.createTask.mockResolvedValue({ id: 'task-1', title: 'WBS 节点' })
    dbMocks.updateTask.mockResolvedValue({ id: 'task-1', title: '更新后节点' })
    dbMocks.getTask.mockResolvedValue({ id: 'task-1', version: 1 })
    dbMocks.deleteTask.mockResolvedValue(undefined)
    accessMocks.getCurrentCompanyMembership.mockResolvedValue(null)
    accessMocks.getVisibleProjectIds.mockResolvedValue([])
  })

  it('accepts project_id alias when listing nodes', async () => {
    const response = await request(buildApp())
      .get('/api/wbs-nodes')
      .query({ project_id: 'project-1' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(dbMocks.executeSQL).toHaveBeenCalled()
  })

  it('rejects create requests without required title', async () => {
    const response = await request(buildApp())
      .post('/api/wbs-nodes')
      .send({
        project_id: 'project-1',
        wbs_level: 2,
      })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error?.code).toBe('VALIDATION_ERROR')
    expect(dbMocks.createTask).not.toHaveBeenCalled()
  })

  it('lists visible templates through fixed scope queries instead of a dynamic OR SQL shape', async () => {
    accessMocks.getCurrentCompanyMembership.mockResolvedValue({ companyId: 'company-1' })
    accessMocks.getVisibleProjectIds.mockResolvedValue(['project-1', 'project-2'])

    const response = await request(buildApp())
      .get('/api/wbs-nodes/templates')

    expect(response.status).toBe(200)
    const sqlTexts = dbMocks.executeSQL.mock.calls.map(([sql]) => String(sql))

    expect(sqlTexts.some((sql) => sql.includes('catalog_scope IN'))).toBe(true)
    expect(sqlTexts.some((sql) => sql.includes('is_builtin = ?'))).toBe(true)
    expect(sqlTexts.some((sql) => sql.includes('standard_catalog_code IS NOT NULL'))).toBe(true)
    expect(sqlTexts.some((sql) => sql.includes('company_id = ?'))).toBe(true)
    expect(sqlTexts.filter((sql) => /\bproject_id\s*=\s*\?/.test(sql))).toHaveLength(2)
    expect(sqlTexts.join('\n')).not.toMatch(/\bOR\b|COALESCE|WHERE 1=1|project_id IS NULL OR project_id IN/i)
  })
})
