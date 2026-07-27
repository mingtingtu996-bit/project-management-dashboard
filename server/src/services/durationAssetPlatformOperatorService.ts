import { executeSQL } from './dbService.js'

type DurationAssetOperatorQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export async function isDurationAssetGovernanceOperator(
  userId: string | null | undefined,
  queryExec: DurationAssetOperatorQueryExec = executeSQL,
) {
  const normalizedUserId = String(userId ?? '').trim()
  if (!normalizedUserId) return false
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedUserId)) return false
  const rows = await queryExec<{ is_operator: boolean }>(
    `select exists (
       select 1
         from public.users
        where id = $1::uuid
          and platform_role = 'duration_governance_operator'
          and coalesce(status, 'active') = 'active'
          and deleted_at is null
     ) as is_operator`,
    [normalizedUserId],
  )
  return rows[0]?.is_operator === true
}
