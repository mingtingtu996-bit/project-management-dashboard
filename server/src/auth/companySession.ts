import { query } from '../database.js'

type CompanySessionQueryResult = {
  rows?: Array<{ session_revoked_at?: string | Date | null }>
}

type CompanySessionQuery = (
  sql: string,
  params?: unknown[],
) => Promise<CompanySessionQueryResult>

export async function isCompanySessionRevoked(input: {
  userId: string
  companyId: string
  tokenIssuedAtSeconds?: number
  queryExec?: CompanySessionQuery
}) {
  const issuedAtSeconds = Number(input.tokenIssuedAtSeconds)
  if (!Number.isFinite(issuedAtSeconds) || issuedAtSeconds <= 0) return true

  const queryExec = input.queryExec ?? (query as unknown as CompanySessionQuery)
  const result = await queryExec(
    `SELECT session_revoked_at
       FROM public.company_members
      WHERE user_id = $1
        AND company_id = $2
        AND COALESCE(status, 'active') = 'active'
      LIMIT 1`,
    [input.userId, input.companyId],
  )
  const revokedAtValue = result.rows?.[0]?.session_revoked_at
  if (!revokedAtValue) return false

  const revokedAtMs = new Date(revokedAtValue).getTime()
  if (!Number.isFinite(revokedAtMs)) return true
  return issuedAtSeconds * 1000 <= revokedAtMs
}
