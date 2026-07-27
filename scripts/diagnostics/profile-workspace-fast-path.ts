import { query } from '../../server/src/database'
import { getCurrentCompanyMembership } from '../../server/src/auth/access'

const userId = process.env.DEV_USER_ID ?? '9e4a5570-0032-43bd-8f17-0bc415a1eb70'

async function timed<T>(label: string, run: () => Promise<T>) {
  const startedAt = Date.now()
  try {
    const result = await run()
    const rows = Array.isArray((result as any)?.rows) ? (result as any).rows.length : undefined
    console.log(JSON.stringify({ label, ok: true, ms: Date.now() - startedAt, rows, result: rows === undefined ? result : undefined }))
    return result
  } catch (error) {
    console.log(JSON.stringify({ label, ok: false, ms: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }))
    throw error
  }
}

async function main() {
  const membership = await timed('membership', () => getCurrentCompanyMembership(userId))
  const companyId = membership?.companyId

  if (companyId) {
    await timed('company', () => query('SELECT id, name FROM public.companies WHERE id = $1 LIMIT 1', [companyId]))
    await timed('switchable', () => query(
      `
        SELECT cm.company_id, cm.role, c.name AS company_name
          FROM public.company_members cm
          LEFT JOIN public.companies c ON c.id = cm.company_id
         WHERE cm.user_id = $1
           AND COALESCE(cm.status, 'active') = 'active'
         ORDER BY cm.created_at ASC NULLS LAST
         LIMIT 50
      `,
      [userId],
    ))
    await timed('projects', () => query(
      `
        SELECT p.id,
               p.name,
               p.project_type,
               p.current_phase,
               p.health_score,
               p.location,
               p.created_at,
               pm.permission_level
          FROM public.project_members pm
          JOIN public.projects p ON p.id = pm.project_id
         WHERE pm.user_id = $1
           AND COALESCE(pm.is_active, true) = true
           AND p.company_id = $2
         ORDER BY p.created_at DESC NULLS LAST
         LIMIT 50
      `,
      [userId, companyId],
    ))
    await timed('invitations', () => query(
      `
        SELECT inv.id,
               inv.project_id,
               inv.company_id,
               inv.created_at,
               inv.role,
               p.name AS project_name,
               u.display_name AS inviter_name
          FROM public.project_direct_invitations inv
          LEFT JOIN public.projects p
            ON p.id = inv.project_id
           AND p.company_id = inv.company_id
          LEFT JOIN public.users u ON u.id = inv.invited_by
         WHERE inv.recipient_user_id = $1
           AND inv.company_id = $2
           AND inv.status = 'pending'
         ORDER BY inv.created_at DESC NULLS LAST
         LIMIT 10
      `,
      [userId, companyId],
    ))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
