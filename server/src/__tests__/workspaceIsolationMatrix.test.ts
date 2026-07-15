import express, { type Request, type Response, type NextFunction } from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const matrixState = vi.hoisted(() => ({
  calls: [] as Array<{ sql: string; params: unknown[] }>,
}))

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'

const USER_ADMIN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const USER_REGULAR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const USER_NON_MEMBER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
const USER_ADMIN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const USER_NO_COMPANY = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'

const PROJECT_A_OWNED = 'aaaa1111-1111-4111-8111-111111111111'
const PROJECT_A_MEMBER = 'aaaa2222-2222-4222-8222-222222222222'
const PROJECT_B_OWNED = 'bbbb1111-1111-4111-8111-111111111111'

type CompanyMemberRow = {
  company_id: string
  user_id: string
  role: 'company_admin' | 'regular'
  status?: string
  created_at: string
}

type ProjectRow = {
  id: string
  company_id: string
  owner_id: string
}

type ProjectMemberRow = {
  project_id: string
  user_id: string
  permission_level: 'owner' | 'editor'
  is_active?: boolean
}

const users = new Map([
  [USER_ADMIN_A, { last_active_company_id: COMPANY_A }],
  [USER_REGULAR_A, { last_active_company_id: COMPANY_A }],
  [USER_NON_MEMBER_A, { last_active_company_id: COMPANY_A }],
  [USER_ADMIN_B, { last_active_company_id: COMPANY_B }],
  [USER_NO_COMPANY, { last_active_company_id: null }],
])

const companyMembers: CompanyMemberRow[] = [
  { company_id: COMPANY_A, user_id: USER_ADMIN_A, role: 'company_admin', status: 'active', created_at: '2026-01-01T00:00:00Z' },
  { company_id: COMPANY_A, user_id: USER_REGULAR_A, role: 'regular', status: 'active', created_at: '2026-01-01T00:00:00Z' },
  { company_id: COMPANY_A, user_id: USER_NON_MEMBER_A, role: 'regular', status: 'active', created_at: '2026-01-01T00:00:00Z' },
  { company_id: COMPANY_B, user_id: USER_ADMIN_B, role: 'company_admin', status: 'active', created_at: '2026-01-01T00:00:00Z' },
]

const projects: ProjectRow[] = [
  { id: PROJECT_A_OWNED, company_id: COMPANY_A, owner_id: USER_ADMIN_A },
  { id: PROJECT_A_MEMBER, company_id: COMPANY_A, owner_id: USER_ADMIN_A },
  { id: PROJECT_B_OWNED, company_id: COMPANY_B, owner_id: USER_ADMIN_B },
]

const projectMembers: ProjectMemberRow[] = [
  { project_id: PROJECT_A_MEMBER, user_id: USER_REGULAR_A, permission_level: 'editor', is_active: true },
  // Deliberate stale/corrupt cross-company rows. Company membership must still block access.
  { project_id: PROJECT_B_OWNED, user_id: USER_REGULAR_A, permission_level: 'editor', is_active: true },
  { project_id: PROJECT_B_OWNED, user_id: USER_ADMIN_A, permission_level: 'owner', is_active: true },
]

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

function activeCompanyMember(userId: string, companyId: string) {
  return companyMembers.find((member) =>
    member.user_id === userId
    && member.company_id === companyId
    && (member.status ?? 'active') === 'active',
  ) ?? null
}

function projectById(projectId: string) {
  return projects.find((project) => project.id === projectId) ?? null
}

function result(rows: Array<Record<string, unknown>>) {
  return { rows, rowCount: rows.length }
}

vi.mock('../database.js', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    matrixState.calls.push({ sql, params })
    const normalized = normalizeSql(sql)

    if (normalized === 'select 1 from public.company_members limit 1') {
      return result([{ '?column?': 1 }])
    }

    if (normalized.includes('select company_id, role from public.company_members')
      && normalized.includes('user_id = $1')
      && normalized.includes('company_id = $2')) {
      const [userId, companyId] = params.map(String)
      const member = activeCompanyMember(userId, companyId)
      return result(member ? [{ company_id: member.company_id, role: member.role }] : [])
    }

    if (normalized.includes('from public.company_members cm')
      && normalized.includes('left join public.users')
      && normalized.includes('order by')) {
      const [userId] = params.map(String)
      const user = users.get(userId)
      const memberships = companyMembers
        .filter((member) => member.user_id === userId && (member.status ?? 'active') === 'active')
        .sort((left, right) => {
          if (left.company_id === user?.last_active_company_id) return -1
          if (right.company_id === user?.last_active_company_id) return 1
          return left.created_at.localeCompare(right.created_at)
        })
      return result(memberships.slice(0, 1).map((member) => ({ company_id: member.company_id, role: member.role })))
    }

    if (normalized.includes('select company_id from public.projects where id = $1 limit 1')) {
      const project = projectById(String(params[0]))
      return result(project ? [{ company_id: project.company_id }] : [])
    }

    if (normalized.includes('select id from public.projects where id = $1 limit 1')) {
      const project = projectById(String(params[0]))
      return result(project ? [{ id: project.id }] : [])
    }

    if (normalized.includes('select 1 from public.company_members')
      && normalized.includes('user_id = $1')
      && normalized.includes('company_id = $2')) {
      const [userId, companyId] = params.map(String)
      return result(activeCompanyMember(userId, companyId) ? [{ '?column?': 1 }] : [])
    }

    if (normalized.includes('from public.projects p')
      && normalized.includes('join public.company_members cm')
      && normalized.includes("cm.role = 'company_admin'")) {
      const [userId, projectId, requestedCompanyId] = params.map(String)
      const project = projectById(projectId)
      const requestedCompanyMatches = params.length < 3 || project?.company_id === requestedCompanyId
      const isAdmin = Boolean(project && requestedCompanyMatches && activeCompanyMember(userId, project.company_id)?.role === 'company_admin')
      return result(isAdmin ? [{ '?column?': 1 }] : [])
    }

    if (normalized.includes('select 1 from public.projects where id = $1 and company_id = $2 limit 1')) {
      const [projectId, companyId] = params.map(String)
      const project = projectById(projectId)
      return result(project?.company_id === companyId ? [{ '?column?': 1 }] : [])
    }

    if (normalized.includes('select owner_id from public.projects where id = $1 limit 1')) {
      const project = projectById(String(params[0]))
      return result(project ? [{ owner_id: project.owner_id }] : [])
    }

    if (normalized.includes('select permission_level from public.project_members')) {
      const [projectId, userId] = params.map(String)
      const member = projectMembers.find((row) =>
        row.project_id === projectId
        && row.user_id === userId
        && row.is_active !== false,
      )
      return result(member ? [{ permission_level: member.permission_level }] : [])
    }

    if (normalized.includes('select id from public.projects where company_id = $1')) {
      const [companyId] = params.map(String)
      return result(projects.filter((project) => project.company_id === companyId).map((project) => ({ id: project.id })))
    }

    if (normalized.includes('select distinct id from') && normalized.includes('visible_projects')) {
      const [userId, companyId] = params.map(String)
      const owned = projects
        .filter((project) => project.company_id === companyId && project.owner_id === userId)
        .map((project) => project.id)
      const memberProjectIds = projectMembers
        .filter((member) => member.user_id === userId && member.is_active !== false)
        .map((member) => projectById(member.project_id))
        .filter((project): project is ProjectRow => Boolean(project) && project.company_id === companyId)
        .map((project) => project.id)
      return result(Array.from(new Set([...owned, ...memberProjectIds])).map((id) => ({ id })))
    }

    throw new Error(`Unhandled matrix query: ${sql}`)
  }),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  supabase: {},
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('../auth/permissionBypass.js', () => ({
  isPermissionSystemDisabled: () => false,
}))

function buildProjectAccessApp(userId: string, globalRole = 'regular') {
  const app = express()
  app.use(express.json())
  app.get(
    '/projects/:projectId',
    (req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: userId, globalRole }
      next()
    },
    requireProjectMember((req) => req.params.projectId),
    (req, res) => res.json({
      success: true,
      authorizedProjectId: getAuthorizedRequestProjectId(req),
    }),
  )
  return app
}

import {
  getCurrentCompanyMembership,
  getProjectPermissionLevel,
  getVisibleProjectIds,
} from '../auth/access.js'
import { getAuthorizedRequestProjectId, requireProjectMember } from '../middleware/auth.js'

describe('v1.4.20 automated multi-company isolation matrix', () => {
  beforeEach(() => {
    matrixState.calls = []
  })

  it('isolates project permission checks by company membership before project_members', async () => {
    await expect(getProjectPermissionLevel(USER_ADMIN_A, PROJECT_A_OWNED, COMPANY_A)).resolves.toBe('owner')
    await expect(getProjectPermissionLevel(USER_REGULAR_A, PROJECT_A_MEMBER, COMPANY_A)).resolves.toBe('editor')
    await expect(getProjectPermissionLevel(USER_NON_MEMBER_A, PROJECT_A_MEMBER, COMPANY_A)).resolves.toBeNull()
    await expect(getProjectPermissionLevel(USER_ADMIN_B, PROJECT_B_OWNED, COMPANY_B)).resolves.toBe('owner')

    await expect(getProjectPermissionLevel(USER_REGULAR_A, PROJECT_B_OWNED, COMPANY_A)).resolves.toBeNull()
    await expect(getProjectPermissionLevel(USER_ADMIN_A, PROJECT_B_OWNED, COMPANY_A)).resolves.toBeNull()
    await expect(getProjectPermissionLevel(USER_NO_COMPANY, PROJECT_A_OWNED, COMPANY_A)).resolves.toBeNull()
  })

  it('scopes visible projects to the requested/current company', async () => {
    await expect(getVisibleProjectIds(USER_ADMIN_A, 'company_admin', COMPANY_A)).resolves.toEqual([
      PROJECT_A_OWNED,
      PROJECT_A_MEMBER,
    ])
    await expect(getVisibleProjectIds(USER_REGULAR_A, 'regular', COMPANY_A)).resolves.toEqual([
      PROJECT_A_MEMBER,
    ])
    // An explicit but unauthorized company scope must fail closed. Falling back
    // to COMPANY_A would make a request targeting B operate on the wrong tenant.
    await expect(getVisibleProjectIds(USER_REGULAR_A, 'regular', COMPANY_B)).resolves.toEqual([])
    await expect(getVisibleProjectIds(USER_NO_COMPANY, 'regular')).resolves.toEqual([])
  })

  it('does not let requested company context be spoofed', async () => {
    await expect(getCurrentCompanyMembership(USER_REGULAR_A, COMPANY_B)).resolves.toBeNull()
    await expect(getProjectPermissionLevel(USER_REGULAR_A, PROJECT_A_MEMBER, COMPANY_B)).resolves.toBeNull()
  })

  it('enforces the same matrix through requireProjectMember middleware', async () => {
    const allowed = await supertest(buildProjectAccessApp(USER_REGULAR_A))
      .get(`/projects/${PROJECT_A_MEMBER}`)
      .set('X-Company-Id', COMPANY_A)
      .expect(200)
    expect(allowed.body.authorizedProjectId).toBe(PROJECT_A_MEMBER)

    await supertest(buildProjectAccessApp(USER_NON_MEMBER_A))
      .get(`/projects/${PROJECT_A_MEMBER}`)
      .set('X-Company-Id', COMPANY_A)
      .expect(403)

    await supertest(buildProjectAccessApp(USER_REGULAR_A))
      .get(`/projects/${PROJECT_B_OWNED}`)
      .set('X-Company-Id', COMPANY_A)
      .expect(403)

    await supertest(buildProjectAccessApp(USER_ADMIN_A, 'company_admin'))
      .get(`/projects/${PROJECT_A_OWNED}`)
      .set('X-Company-Id', COMPANY_A)
      .expect(200)

    await supertest(buildProjectAccessApp(USER_ADMIN_A, 'company_admin'))
      .get(`/projects/${PROJECT_B_OWNED}`)
      .set('X-Company-Id', COMPANY_A)
      .expect(403)
  })
})
