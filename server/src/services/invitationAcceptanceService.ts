import { getClient } from '../database.js'

type InvitationPermissionLevel = 'editor'

type InvitationCodeRow = {
  id: string
  project_id: string
  company_id?: string | null
  project_company_id?: string | null
  permission_level?: string | null
  expires_at?: string | Date | null
  is_revoked?: boolean | null
  used_count?: number | string | null
  max_uses?: number | string | null
}

type DirectInvitationRow = {
  id: string
  project_id: string
  company_id?: string | null
  project_company_id?: string | null
  recipient_user_id: string
  role?: string | null
  status?: string | null
}

export class InvitationAcceptanceError extends Error {
  code: string
  statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'InvitationAcceptanceError'
    this.code = code
    this.statusCode = statusCode
  }
}

function invitationError(code: string, message: string, statusCode = 400): never {
  throw new InvitationAcceptanceError(code, message, statusCode)
}

function normalizeInvitationPermission(value: unknown): InvitationPermissionLevel | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'editor' ? normalized : null
}

function resolveCompanyId(row: { company_id?: string | null; project_company_id?: string | null }) {
  const invitationCompanyId = String(row.company_id ?? '').trim()
  const projectCompanyId = String(row.project_company_id ?? '').trim()
  if (invitationCompanyId && projectCompanyId && invitationCompanyId !== projectCompanyId) {
    invitationError('INVITATION_COMPANY_SCOPE_MISMATCH', '邀请公司范围与项目不一致', 409)
  }
  const companyId = invitationCompanyId || projectCompanyId
  if (!companyId) {
    invitationError('INVITATION_COMPANY_SCOPE_MISSING', '邀请缺少公司范围', 409)
  }
  return companyId
}

async function lockMembershipSlot(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  projectId: string,
  userId: string,
) {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`invitation-membership:${projectId}:${userId}`],
  )
}

async function activateCompanyMembership(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  companyId: string,
  userId: string,
) {
  await client.query(
    `INSERT INTO public.company_members (company_id, user_id, role, status, created_at, updated_at)
     VALUES ($1, $2, 'regular', 'active', NOW(), NOW())
     ON CONFLICT (company_id, user_id)
     DO UPDATE SET status = 'active', updated_at = NOW()`,
    [companyId, userId],
  )
}

async function findProjectMembership(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ id: string; is_active?: boolean | null }> }> },
  projectId: string,
  userId: string,
) {
  const result = await client.query(
    `SELECT id, is_active
       FROM public.project_members
      WHERE project_id = $1
        AND user_id = $2
      ORDER BY joined_at ASC NULLS LAST, id ASC
      FOR UPDATE`,
    [projectId, userId],
  )
  return result.rows
}

async function activateProjectMembership(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    projectId: string
    userId: string
    permissionLevel: InvitationPermissionLevel
    invitationId: string
    existingMembershipIds: string[]
  },
) {
  if (input.existingMembershipIds.length > 0) {
    await client.query(
      `UPDATE public.project_members
          SET is_active = TRUE,
              permission_level = $3,
              invitation_code_id = $4,
              joined_at = NOW()
        WHERE project_id = $1
          AND user_id = $2`,
      [input.projectId, input.userId, input.permissionLevel, input.invitationId],
    )
    return
  }

  await client.query(
    `INSERT INTO public.project_members
       (project_id, user_id, permission_level, invitation_code_id, joined_at, is_active)
     VALUES ($1, $2, $3, $4, NOW(), TRUE)`,
    [input.projectId, input.userId, input.permissionLevel, input.invitationId],
  )
}

async function rollbackQuietly(client: { query: (sql: string) => Promise<unknown> }) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Preserve the original transaction failure.
  }
}

// workspace-isolation-capability-write-approved: a random invitation code is the pre-membership capability; every resulting write is bound to the locked invitation project and authenticated user.
export async function acceptProjectInvitationCode(input: { code: string; userId: string }) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const invitationResult = await client.query<InvitationCodeRow>(
      `SELECT inv.id,
              inv.project_id,
              inv.company_id,
              p.company_id AS project_company_id,
              inv.permission_level,
              inv.expires_at,
              inv.is_revoked,
              inv.used_count,
              inv.max_uses
         FROM public.project_invitations inv
         JOIN public.projects p ON p.id = inv.project_id
        WHERE UPPER(inv.invitation_code) = UPPER($1)
        FOR UPDATE OF inv`,
      [input.code],
    )
    const invitation = invitationResult.rows[0]
    if (!invitation || invitation.is_revoked) {
      invitationError('INVITATION_INVALID', '邀请码无效或已过期')
    }
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) {
      invitationError('INVITATION_EXPIRED', '邀请码无效或已过期')
    }

    const usedCount = Number(invitation.used_count ?? 0)
    const maxUses = invitation.max_uses == null ? null : Number(invitation.max_uses)
    if (maxUses !== null && usedCount >= maxUses) {
      invitationError('INVITATION_EXHAUSTED', '邀请码已达到使用上限')
    }

    const permissionLevel = normalizeInvitationPermission(invitation.permission_level)
    if (!permissionLevel) {
      invitationError('INVITATION_PERMISSION_INVALID', '邀请码权限无效', 409)
    }
    const companyId = resolveCompanyId(invitation)
    await lockMembershipSlot(client, invitation.project_id, input.userId)
    const memberships = await findProjectMembership(client, invitation.project_id, input.userId)
    if (memberships.some((membership) => membership.is_active !== false)) {
      await client.query('COMMIT')
      return {
        invitationId: invitation.id,
        projectId: invitation.project_id,
        companyId,
        permissionLevel,
        alreadyMember: true,
      }
    }

    await activateCompanyMembership(client, companyId, input.userId)
    await activateProjectMembership(client, {
      projectId: invitation.project_id,
      userId: input.userId,
      permissionLevel,
      invitationId: invitation.id,
      existingMembershipIds: memberships.map((membership) => membership.id),
    })

    const nextUsedCount = usedCount + 1
    const invitationUpdate = await client.query(
      `UPDATE public.project_invitations
          SET used_count = $2,
              is_revoked = CASE WHEN $3::integer IS NULL THEN FALSE ELSE $2 >= $3 END
        WHERE id = $1
        RETURNING used_count`,
      [invitation.id, nextUsedCount, maxUses],
    )
    if (invitationUpdate.rowCount !== 1) {
      invitationError('INVITATION_CLAIM_FAILED', '邀请码占用失败', 409)
    }

    await client.query('COMMIT')
    return {
      invitationId: invitation.id,
      projectId: invitation.project_id,
      companyId,
      permissionLevel,
      alreadyMember: false,
    }
  } catch (error) {
    await rollbackQuietly(client)
    throw error
  } finally {
    client.release()
  }
}

// workspace-isolation-capability-write-approved: a direct invitation is readable and claimable only by its authenticated recipient; project/company scope comes from the locked invitation row.
export async function acceptDirectProjectInvitation(input: { invitationId: string; userId: string }) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const invitationResult = await client.query<DirectInvitationRow>(
      `SELECT inv.id,
              inv.project_id,
              inv.company_id,
              p.company_id AS project_company_id,
              inv.recipient_user_id,
              inv.role,
              inv.status
         FROM public.project_direct_invitations inv
         JOIN public.projects p ON p.id = inv.project_id
        WHERE inv.id = $1
          AND inv.recipient_user_id = $2
        FOR UPDATE OF inv`,
      [input.invitationId, input.userId],
    )
    const invitation = invitationResult.rows[0]
    if (!invitation) {
      invitationError('DIRECT_INVITATION_NOT_FOUND', '邀请不存在', 404)
    }
    if (invitation.status !== 'pending') {
      invitationError('DIRECT_INVITATION_NOT_PENDING', '邀请已处理或撤销', 409)
    }

    const permissionLevel = normalizeInvitationPermission(invitation.role)
    if (!permissionLevel) {
      invitationError('DIRECT_INVITATION_PERMISSION_INVALID', '邀请权限无效', 409)
    }
    const companyId = resolveCompanyId(invitation)
    await lockMembershipSlot(client, invitation.project_id, input.userId)
    await activateCompanyMembership(client, companyId, input.userId)
    const memberships = await findProjectMembership(client, invitation.project_id, input.userId)
    await activateProjectMembership(client, {
      projectId: invitation.project_id,
      userId: input.userId,
      permissionLevel,
      invitationId: invitation.id,
      existingMembershipIds: memberships.map((membership) => membership.id),
    })

    const invitationUpdate = await client.query(
      `UPDATE public.project_direct_invitations
          SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
        WHERE id = $1
          AND recipient_user_id = $2
          AND status = 'pending'
        RETURNING id`,
      [invitation.id, input.userId],
    )
    if (invitationUpdate.rowCount !== 1) {
      invitationError('DIRECT_INVITATION_CLAIM_FAILED', '邀请状态更新失败', 409)
    }

    await client.query('COMMIT')
    return {
      projectId: invitation.project_id,
      companyId,
      permissionLevel,
    }
  } catch (error) {
    await rollbackQuietly(client)
    throw error
  } finally {
    client.release()
  }
}
