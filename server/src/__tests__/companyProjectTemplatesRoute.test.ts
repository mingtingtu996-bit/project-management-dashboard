import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  getCurrentCompanyMembership: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'regular' }
    next()
  }),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: mocks.getCurrentCompanyMembership,
}))

const { default: companyProjectTemplatesRouter } = await import('../routes/companyProjectTemplates.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(companyProjectTemplatesRouter)
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error?.statusCode ?? 500).json({
      success: false,
      error: {
        code: error?.code ?? 'TEST_ERROR',
        message: error?.message ?? String(error),
      },
    })
  })
  return app
}

describe('company project templates route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.executeSQL.mockResolvedValue([])
    mocks.executeSQLOne.mockResolvedValue(null)
    mocks.getCurrentCompanyMembership.mockResolvedValue({ companyId: 'company-1', role: 'regular' })
  })

  it('rejects template reads when the requested company is outside actor membership scope', async () => {
    mocks.getCurrentCompanyMembership.mockResolvedValueOnce(null)

    const response = await request(buildApp())
      .get('/api/companies/company-foreign/project-templates')
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getCurrentCompanyMembership).toHaveBeenCalledWith('user-1', 'company-foreign')
    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })

  it('rejects template writes when the requested company is outside actor membership scope', async () => {
    mocks.getCurrentCompanyMembership.mockResolvedValueOnce(null)

    const response = await request(buildApp())
      .post('/api/companies/company-foreign/project-templates')
      .send({
        name: '标准住宅模板',
        businessType: 'residential',
        snapshot: {},
      })
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getCurrentCompanyMembership).toHaveBeenCalledWith('user-1', 'company-foreign')
    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })

  it('allows template reads for active members of the requested company', async () => {
    mocks.executeSQL.mockResolvedValueOnce([{ id: 'template-1', name: '标准住宅模板' }])

    const response = await request(buildApp())
      .get('/api/companies/company-1/project-templates')
      .expect(200)

    expect(response.body.data).toEqual([{ id: 'template-1', name: '标准住宅模板' }])
    expect(mocks.getCurrentCompanyMembership).toHaveBeenCalledWith('user-1', 'company-1')
    expect(mocks.executeSQL).toHaveBeenCalledTimes(1)
  })

  it('rejects template mutations for non-admin company members', async () => {
    await request(buildApp())
      .post('/api/companies/company-1/project-templates')
      .send({
        name: '标准住宅模板',
        businessType: 'residential',
        snapshot: {},
      })
      .expect(403)

    await request(buildApp())
      .patch('/api/companies/company-1/project-templates/template-1')
      .send({ name: '住宅模板 v2' })
      .expect(403)

    await request(buildApp())
      .delete('/api/companies/company-1/project-templates/template-1')
      .expect(403)

    expect(mocks.executeSQL).not.toHaveBeenCalled()
    expect(mocks.executeSQLOne).not.toHaveBeenCalled()
  })

  it('allows template creation for company administrators', async () => {
    mocks.getCurrentCompanyMembership.mockResolvedValueOnce({ companyId: 'company-1', role: 'company_admin' })

    await request(buildApp())
      .post('/api/companies/company-1/project-templates')
      .send({
        name: '标准住宅模板',
        businessType: 'residential',
        snapshot: {},
      })
      .expect(201)

    expect(mocks.executeSQL).toHaveBeenCalledTimes(1)
    expect(mocks.executeSQL.mock.calls[0][1]).toEqual(expect.arrayContaining([
      'company-1',
      '标准住宅模板',
      'residential',
    ]))
  })
})
