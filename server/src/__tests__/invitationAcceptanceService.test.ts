import { beforeEach, describe, expect, it, vi } from 'vitest'

const databaseMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
}))

vi.mock('../database.js', () => ({ getClient: databaseMocks.getClient }))

import {
  acceptDirectProjectInvitation,
  acceptProjectInvitationCode,
} from '../services/invitationAcceptanceService.js'

function createClient(queryImpl: (sql: string, params?: unknown[]) => Promise<unknown>) {
  return {
    query: vi.fn(queryImpl),
    release: vi.fn(),
  }
}

describe('invitation acceptance service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claims a limited invitation and grants memberships in one transaction', async () => {
    const client = createClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM public.project_invitations') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: 'invite-1',
            project_id: 'project-1',
            company_id: 'company-1',
            permission_level: 'editor',
            expires_at: null,
            is_revoked: false,
            used_count: 0,
            max_uses: 1,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 }
      if (sql.includes('FROM public.project_members') && sql.includes('FOR UPDATE')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('INSERT INTO public.company_members')) return { rows: [], rowCount: 1 }
      if (sql.includes('INSERT INTO public.project_members')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE public.project_invitations')) return { rows: [{ used_count: 1 }], rowCount: 1 }
      throw new Error(`unexpected query: ${sql}`)
    })
    databaseMocks.getClient.mockResolvedValue(client)

    await expect(acceptProjectInvitationCode({ code: 'ABC12345', userId: 'user-1' })).resolves.toEqual({
      invitationId: 'invite-1',
      projectId: 'project-1',
      companyId: 'company-1',
      permissionLevel: 'editor',
      alreadyMember: false,
    })

    const sql = client.query.mock.calls.map(([statement]) => String(statement))
    expect(sql[0]).toBe('BEGIN')
    expect(sql.at(-1)).toBe('COMMIT')
    expect(sql.find((statement) => statement.includes('INSERT INTO public.company_members')))
      .toContain("DO UPDATE SET status = 'active'")
    expect(sql.find((statement) => statement.includes('INSERT INTO public.company_members')))
      .not.toMatch(/DO UPDATE SET[\s\S]*role\s*=/)
    expect(sql.indexOf(sql.find((statement) => statement.includes('UPDATE public.project_invitations'))!))
      .toBeGreaterThan(sql.indexOf(sql.find((statement) => statement.includes('INSERT INTO public.project_members'))!))
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rejects an exhausted invitation before any membership write', async () => {
    const client = createClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM public.project_invitations')) {
        return {
          rows: [{
            id: 'invite-1',
            project_id: 'project-1',
            company_id: 'company-1',
            permission_level: 'editor',
            expires_at: null,
            is_revoked: false,
            used_count: 1,
            max_uses: 1,
          }],
          rowCount: 1,
        }
      }
      throw new Error(`unexpected query: ${sql}`)
    })
    databaseMocks.getClient.mockResolvedValue(client)

    await expect(acceptProjectInvitationCode({ code: 'ABC12345', userId: 'user-2' }))
      .rejects.toMatchObject({ code: 'INVITATION_EXHAUSTED', statusCode: 400 })

    const sql = client.query.mock.calls.map(([statement]) => String(statement))
    expect(sql).toContain('ROLLBACK')
    expect(sql.some((statement) => statement.includes('INSERT INTO public.company_members'))).toBe(false)
  })

  it('rolls back company membership when a later project membership write fails', async () => {
    const client = createClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM public.project_invitations')) {
        return {
          rows: [{
            id: 'invite-1', project_id: 'project-1', company_id: 'company-1',
            permission_level: 'editor', expires_at: null, is_revoked: false, used_count: 0, max_uses: null,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 }
      if (sql.includes('FROM public.project_members')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO public.company_members')) return { rows: [], rowCount: 1 }
      if (sql.includes('INSERT INTO public.project_members')) throw new Error('project member write failed')
      throw new Error(`unexpected query: ${sql}`)
    })
    databaseMocks.getClient.mockResolvedValue(client)

    await expect(acceptProjectInvitationCode({ code: 'ABC12345', userId: 'user-2' }))
      .rejects.toThrow('project member write failed')
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
  })

  it('locks a direct invitation before granting access and commits accepted status atomically', async () => {
    const client = createClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM public.project_direct_invitations') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: 'direct-1', project_id: 'project-1', company_id: 'company-1',
            project_company_id: 'company-1', recipient_user_id: 'user-1', role: 'editor', status: 'pending',
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 }
      if (sql.includes('INSERT INTO public.company_members')) return { rows: [], rowCount: 1 }
      if (sql.includes('FROM public.project_members')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO public.project_members')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE public.project_direct_invitations')) return { rows: [{ id: 'direct-1' }], rowCount: 1 }
      throw new Error(`unexpected query: ${sql}`)
    })
    databaseMocks.getClient.mockResolvedValue(client)

    await expect(acceptDirectProjectInvitation({ invitationId: 'direct-1', userId: 'user-1' }))
      .resolves.toEqual({ projectId: 'project-1', companyId: 'company-1', permissionLevel: 'editor' })

    const sql = client.query.mock.calls.map(([statement]) => String(statement))
    expect(sql.indexOf(sql.find((statement) => statement.includes('FOR UPDATE'))!))
      .toBeLessThan(sql.indexOf(sql.find((statement) => statement.includes('INSERT INTO public.company_members'))!))
    expect(sql.at(-1)).toBe('COMMIT')
  })

  it('does not grant access when a direct invitation is no longer pending', async () => {
    const client = createClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM public.project_direct_invitations')) {
        return {
          rows: [{
            id: 'direct-1', project_id: 'project-1', company_id: 'company-1',
            project_company_id: 'company-1', recipient_user_id: 'user-1', role: 'editor', status: 'revoked',
          }],
          rowCount: 1,
        }
      }
      throw new Error(`unexpected query: ${sql}`)
    })
    databaseMocks.getClient.mockResolvedValue(client)

    await expect(acceptDirectProjectInvitation({ invitationId: 'direct-1', userId: 'user-1' }))
      .rejects.toMatchObject({ code: 'DIRECT_INVITATION_NOT_PENDING', statusCode: 409 })
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.company_members'))).toBe(false)
  })
})
