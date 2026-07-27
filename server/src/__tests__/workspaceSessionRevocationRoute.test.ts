import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  currentUserId: 'admin-1',
  currentCompanyId: 'company-1',
  membership: { companyId: 'company-1', role: 'company_admin' as 'company_admin' | 'regular' },
  rawQuery: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: mocks.currentUserId, globalRole: 'company_admin' }
    next()
  }),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => mocks.currentCompanyId),
}))

vi.mock('../auth/access.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/access.js')>('../auth/access.js')
  return {
    ...actual,
    getCurrentCompanyMembership: vi.fn(() => Promise.resolve(mocks.membership)),
    getProjectPermissionLevel: vi.fn(),
    normalizeProjectPermissionLevel: actual.normalizeProjectPermissionLevel,
  }
})

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {},
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { default: workspaceRouter } = await import('../routes/workspace.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/workspace', workspaceRouter)
  return app
}

function mockSuccessfulRevocation() {
  mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/WITH revoked_member AS/i.test(sql)) {
      expect(sql).toMatch(/UPDATE public\.company_members/i)
      expect(sql).toMatch(/session_revoked_at = NOW\(\)/i)
      expect(sql).not.toMatch(/auth_token_version/i)
      expect(sql).toMatch(/INSERT INTO public\.operation_logs/i)
      expect(params).toEqual([
        'company-1',
        'user-2',
        'admin-1',
        '/api/workspace/company-members/user-2/revoke-sessions',
        'role changed',
      ])
      return { rows: [{ id: 'user-2', session_revoked_at: '2026-07-11T10:00:00.000Z' }], rowCount: 1 }
    }
    throw new Error(`unexpected query: ${sql}`)
  })
}

describe('workspace company member session revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentUserId = 'admin-1'
    mocks.currentCompanyId = 'company-1'
    mocks.membership = { companyId: 'company-1', role: 'company_admin' }
    mocks.rawQuery.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  it('creates a company, member row, and active-company pointer in one governed SQL write', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      expect(sql).toMatch(/WITH created_company AS/i)
      expect(sql).toMatch(/INSERT INTO public\.companies/i)
      expect(sql).toMatch(/INSERT INTO public\.company_members/i)
      expect(sql).toMatch(/UPDATE public\.users/i)
      expect(sql).toMatch(/SELECT cc\.id AS company_id,\s*cc\.name AS company_name,\s*cm\.role AS member_role/i)
      expect(sql).not.toContain('joined_at')
      expect(params).toEqual([
        '新公司',
        'admin-1',
        'searchable',
        'approval_required',
      ])
      return {
        rows: [{
          company_id: 'company-created',
          company_name: '新公司',
          member_role: 'company_admin',
        }],
        rowCount: 1,
      }
    })

    const response = await supertest(buildApp())
      .post('/api/workspace/companies')
      .send({
        name: '新公司',
        discoverability: 'searchable',
        join_policy: 'approval_required',
      })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      id: 'company-created',
      name: '新公司',
      role: 'company_admin',
      nextStep: 'create_first_project',
    })
  })

  it('does not report company creation success when the transactional write returns no row', async () => {
    mocks.rawQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const response = await supertest(buildApp())
      .post('/api/workspace/companies')
      .send({ name: '新公司' })

    expect(response.status).toBe(500)
    expect(response.body.error).toMatchObject({
      code: 'COMPANY_CREATE_FAILED',
    })
  })

  it('shows company projects on the workspace for current company admins without requiring project_members rows', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/SELECT id, name FROM public\.companies/i.test(sql)) {
        expect(params).toEqual(['company-1'])
        return { rows: [{ id: 'company-1', name: '默认公司' }], rowCount: 1 }
      }
      if (/SELECT cm\.company_id, cm\.role, c\.name AS company_name/i.test(sql)) {
        expect(params).toEqual(['admin-1'])
        return {
          rows: [{ company_id: 'company-1', role: 'company_admin', company_name: '默认公司' }],
          rowCount: 1,
        }
      }
      if (/FROM public\.project_members pm\s+JOIN public\.projects p/i.test(sql)) {
        expect(params).toEqual(['admin-1', 'company-1'])
        return { rows: [], rowCount: 0 }
      }
      if (/FROM public\.projects p\s+WHERE p\.company_id = \$1/i.test(sql)) {
        expect(params).toEqual(['company-1'])
        return {
          rows: [
            {
              id: 'project-1',
              name: '三栋住宅样板项目',
              project_type: '住宅',
              current_phase: '主体结构',
              health_score: 88,
              location: '南京',
              created_at: '2026-06-30T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        }
      }
      if (/FROM public\.project_direct_invitations inv/i.test(sql)) {
        expect(params).toEqual(['admin-1', 'company-1'])
        return { rows: [], rowCount: 0 }
      }
      throw new Error(`unexpected query: ${sql}`)
    })

    const response = await supertest(buildApp())
      .get('/api/workspace')
      .set('X-Company-Id', 'company-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.emptyStateReason).toBeNull()
    expect(response.body.data.companyProjects).toEqual([
      expect.objectContaining({
        id: 'project-1',
        name: '三栋住宅样板项目',
        myRole: 'company_admin',
      }),
    ])
    expect(response.body.data.recentProjects).toEqual([
      expect.objectContaining({ id: 'project-1' }),
    ])
  })

  it('allows a current company admin to revoke another member only in the current company', async () => {
    mockSuccessfulRevocation()

    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/user-2/revoke-sessions')
      .send({ reason: 'role changed' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual({
      revoked: true,
      userId: 'user-2',
      sessionRevokedAt: '2026-07-11T10:00:00.000Z',
    })

    expect(mocks.rawQuery).toHaveBeenCalledTimes(1)
  })

  it('blocks non-admin current company members before updating a target user', async () => {
    mocks.membership = { companyId: 'company-1', role: 'regular' }

    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/user-2/revoke-sessions')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('does not update users when the target is not an active member of the current company', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (/WITH revoked_member AS/i.test(sql)) {
        return { rows: [], rowCount: 0 }
      }
      throw new Error(`unexpected query: ${sql}`)
    })

    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/user-2/revoke-sessions')
      .expect(404)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('TARGET_MEMBER_NOT_FOUND')
    expect(mocks.rawQuery).toHaveBeenCalledTimes(1)
    expect(String(mocks.rawQuery.mock.calls[0]?.[0])).toMatch(/UPDATE public\.company_members/i)
  })

  it('rejects self revocation through the admin endpoint', async () => {
    mocks.currentUserId = 'admin-1'

    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/admin-1/revoke-sessions')
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('SELF_SESSION_REVOCATION_FORBIDDEN')
    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('allows a current company admin to batch revoke active member sessions in the current company', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/WITH requested AS/i.test(sql)) {
        expect(sql).toMatch(/UPDATE public\.company_members/i)
        expect(sql).toMatch(/session_revoked_at = NOW\(\)/i)
        expect(sql).not.toMatch(/auth_token_version/i)
        expect(sql).toMatch(/INSERT INTO public\.operation_logs/i)
        expect(params).toEqual([
          'company-1',
          ['user-2', 'user-3'],
          'admin-1',
          '/api/workspace/company-members/revoke-sessions',
          'incident response',
        ])
        return {
          rows: [
            { id: 'user-2', session_revoked_at: '2026-07-11T10:00:00.000Z' },
            { id: 'user-3', session_revoked_at: '2026-07-11T10:00:01.000Z' },
          ],
          rowCount: 2,
        }
      }
      throw new Error(`unexpected query: ${sql}`)
    })

    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/revoke-sessions')
      .send({ userIds: ['user-2', 'user-3', 'user-2'], reason: 'incident response' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual({
      revoked: true,
      revokedCount: 2,
      revokedUserIds: ['user-2', 'user-3'],
      skippedUserIds: [],
      sessionRevokedAtByUser: {
        'user-2': '2026-07-11T10:00:00.000Z',
        'user-3': '2026-07-11T10:00:01.000Z',
      },
    })
  })

  it('reports batch targets outside the current company without updating them', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (/WITH requested AS/i.test(sql)) {
        return {
          rows: [{ id: 'user-2', session_revoked_at: '2026-07-11T10:00:00.000Z' }],
          rowCount: 1,
        }
      }
      throw new Error(`unexpected query: ${sql}`)
    })

    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/revoke-sessions')
      .send({ userIds: ['user-2', 'outside-user'] })
      .expect(200)

    expect(response.body.data.revokedUserIds).toEqual(['user-2'])
    expect(response.body.data.skippedUserIds).toEqual(['outside-user'])
  })

  it('rejects batch session revocation that includes the acting admin', async () => {
    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/revoke-sessions')
      .send({ userIds: ['user-2', 'admin-1'] })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('SELF_SESSION_REVOCATION_FORBIDDEN')
    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('allows a current company admin to disable a company member and revoke their sessions', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/WITH disabled_member AS/i.test(sql)) {
        expect(sql).toMatch(/UPDATE public\.company_members/i)
        expect(sql).toMatch(/status = 'inactive'/i)
        expect(sql).toMatch(/UPDATE public\.users/i)
        expect(sql).not.toMatch(/auth_token_version/i)
        expect(sql).toMatch(/last_active_company_id = CASE/i)
        expect(sql).toMatch(/INSERT INTO public\.operation_logs/i)
        expect(params).toEqual([
          'company-1',
          'user-2',
          'admin-1',
          '/api/workspace/company-members/user-2/disable',
          'left company',
        ])
        return { rows: [{ id: 'user-2', session_revoked_at: '2026-07-11T10:00:00.000Z' }], rowCount: 1 }
      }
      throw new Error(`unexpected query: ${sql}`)
    })

    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/user-2/disable')
      .send({ reason: 'left company' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual({
      disabled: true,
      userId: 'user-2',
      sessionRevokedAt: '2026-07-11T10:00:00.000Z',
    })
  })

  it('does not disable users outside the current company', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (/WITH disabled_member AS/i.test(sql)) {
        return { rows: [], rowCount: 0 }
      }
      throw new Error(`unexpected query: ${sql}`)
    })

    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/outside-user/disable')
      .expect(404)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('TARGET_MEMBER_NOT_FOUND')
    expect(mocks.rawQuery).toHaveBeenCalledTimes(1)
  })

  it('rejects self disable through the company admin endpoint', async () => {
    const response = await supertest(buildApp())
      .post('/api/workspace/company-members/admin-1/disable')
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('SELF_DISABLE_FORBIDDEN')
    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })
})
