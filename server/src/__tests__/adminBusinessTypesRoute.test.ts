import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  getCurrentCompanyMembership: vi.fn(),
  rawQuery: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-admin', globalRole: 'company_admin', currentCompanyId: 'company-1' }
    next()
  }),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: mocks.getCurrentCompanyMembership,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

const { default: router } = await import('../routes/adminBusinessTypes.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(router)
  return app
}

describe('admin business type routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentCompanyMembership.mockResolvedValue({
      companyId: 'company-1',
      role: 'company_admin',
    })
    mocks.executeSQL.mockResolvedValue([])
    mocks.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      company_id: 'company-1',
      metadata: {
        business_type: 'hotel',
        sort_order: 4,
      },
    })
    mocks.rawQuery.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  it('aggregates custom business types only within the current company', async () => {
    const response = await request(buildApp())
      .get('/api/admin/custom-business-types')
      .set('x-company-id', 'company-1')

    expect(response.status).toBe(200)
    expect(mocks.rawQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE company_id = $1'),
      ['company-1'],
    )
    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })

  it('returns a field-limited public example catalog through parameterized PostgreSQL', async () => {
    mocks.rawQuery.mockResolvedValueOnce({
      rows: [{
        id: 'example-1',
        name: 'Hotel example',
        business_type: 'hotel',
        total_area: 12000,
        location: 'Shanghai',
        description: 'Public example',
      }],
      rowCount: 1,
    })

    const response = await request(buildApp()).get('/api/system/example-projects')

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual([{
      id: 'example-1',
      name: 'Hotel example',
      business_type: 'hotel',
      total_area: 12000,
      location: 'Shanghai',
      description: 'Public example',
    }])
    expect(mocks.rawQuery).toHaveBeenCalledWith(
      expect.stringContaining("metadata->>'is_system_example' = $1"),
      ['true', 20],
    )
  })

  it('marks a system example by merging metadata without COALESCE expression SQL', async () => {
    const response = await request(buildApp())
      .post('/api/admin/system/example-projects')
      .set('x-company-id', 'company-1')
      .send({
        projectId: 'project-1',
        description: 'Lobby sample',
        sortOrder: 9,
      })

    expect(response.status).toBe(200)
    expect(mocks.executeSQLOne).toHaveBeenCalledWith(
      'SELECT id, company_id, metadata FROM projects WHERE id = ? AND company_id = ? LIMIT 1',
      ['project-1', 'company-1'],
    )

    const updateCall = mocks.executeSQL.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE projects SET metadata = ?'))
    expect(updateCall).toBeTruthy()
    expect(String(updateCall?.[0] ?? '')).not.toMatch(/\bCOALESCE\b/i)
    expect(updateCall?.[1]).toEqual([
      JSON.stringify({
        business_type: 'hotel',
        sort_order: 9,
        is_system_example: true,
        description: 'Lobby sample',
      }),
      expect.any(String),
      'project-1',
      'company-1',
    ])
  })

  it('rejects non-admin business type administration before reading projects', async () => {
    mocks.getCurrentCompanyMembership.mockResolvedValueOnce({
      companyId: 'company-1',
      role: 'regular',
    })

    const response = await request(buildApp())
      .get('/api/admin/custom-business-types')
      .set('x-company-id', 'company-1')

    expect(response.status).toBe(403)
    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })
})
