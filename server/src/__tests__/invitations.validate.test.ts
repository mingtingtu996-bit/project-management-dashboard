import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const invitation = {
    id: 'invite-1',
    project_id: 'project-1',
    invitation_code: 'ABC12345',
    permission_level: 'viewer',
    expires_at: null,
    is_revoked: false,
    used_count: 1,
    max_uses: 1,
  }

  let memberData: Record<string, unknown> | null = {
    id: 'member-1',
    is_active: true,
  }

  const invitationSingle = vi.fn(async () => ({ data: invitation, error: null }))
  const invitationEq = vi.fn(() => ({ single: invitationSingle }))
  const invitationSelect = vi.fn(() => ({ eq: invitationEq }))

  const memberMaybeSingle = vi.fn(async () => ({ data: memberData, error: null }))
  const memberEqUser = vi.fn(() => ({ maybeSingle: memberMaybeSingle }))
  const memberEqProject = vi.fn(() => ({ eq: memberEqUser }))
  const memberSelect = vi.fn(() => ({ eq: memberEqProject }))

  const projectSingle = vi.fn(async () => ({ data: { name: '邀请码测试项目' }, error: null }))
  const projectEq = vi.fn(() => ({ single: projectSingle }))
  const projectSelect = vi.fn(() => ({ eq: projectEq }))

  const from = vi.fn((table: string) => {
    if (table === 'project_invitations') {
      return { select: invitationSelect }
    }
    if (table === 'project_members') {
      return { select: memberSelect }
    }
    if (table === 'projects') {
      return { select: projectSelect }
    }
    throw new Error(`unexpected table: ${table}`)
  })

  return {
    invitation,
    from,
    invitationSingle,
    invitationEq,
    invitationSelect,
    memberMaybeSingle,
    memberEqUser,
    memberEqProject,
    memberSelect,
    projectSingle,
    projectEq,
    projectSelect,
    get memberData() {
      return memberData
    },
    set memberData(value: Record<string, unknown> | null) {
      memberData = value
    },
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../auth/access.js', () => ({
  getProjectPermissionLevel: vi.fn(async () => 'owner'),
  normalizeProjectPermissionLevel: (value: string) => value,
}))

vi.mock('../auth/jwt.js', () => ({
  extractTokenFromRequest: vi.fn(() => 'token-1'),
  verifyToken: vi.fn(() => ({ userId: 'user-1' })),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: state.from,
  },
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/invitations', router)
  return app
}

describe('invitation validate route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.invitation.is_revoked = false
    state.memberData = {
      id: 'member-1',
      is_active: true,
    }
  })

  it('returns joined metadata for active members even when the invitation is exhausted and revoked', async () => {
    state.invitation.is_revoked = true
    const { default: router } = await import('../routes/invitations.js')

    const response = await request(buildApp(router))
      .get('/api/invitations/validate/ABC12345')
      .set('Authorization', 'Bearer token-1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: {
        projectId: 'project-1',
        projectName: '邀请码测试项目',
        alreadyJoined: true,
      },
    })
  })

  it('keeps exhausted invitations invalid for non-members', async () => {
    state.memberData = null
    state.invitation.is_revoked = true
    const { default: router } = await import('../routes/invitations.js')

    const response = await request(buildApp(router))
      .get('/api/invitations/validate/ABC12345')

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      message: '邀请码无效或已过期',
    })
  })
})
