import type { Client } from 'pg'

export const SECURITY_ADVISOR_RETIREMENT_STATE_RLS_POLICY_NAME =
  'duration_learning_legacy_runtime_retirement_state_deny_all'

export type SecurityAdvisorRetirementStateRlsExpectedState = 'hardened'

export type SecurityAdvisorRetirementStateRlsReadback = {
  tableExists: boolean
  rlsEnabled: boolean
  forceRls: boolean
  policyExists: boolean
  policyName: string | null
  usingExpression: string | null
  withCheckExpression: string | null
}

export type SecurityAdvisorRetirementStateRlsQueryRow = {
  table_exists: boolean
  rls_enabled: boolean
  force_rls: boolean
  policy_exists: boolean
  policy_name: string | null
  using_expression: string | null
  with_check_expression: string | null
}

export const SECURITY_ADVISOR_RETIREMENT_STATE_RLS_READBACK_SQL = `
  /* security_advisor_retirement_state_rls_335_postcondition */
  WITH target_table AS (
    SELECT to_regclass('public.duration_learning_legacy_runtime_retirement_state') AS relation_oid
  ),
  relation_readback AS (
    SELECT relations.oid IS NOT NULL AS table_exists,
           COALESCE(relations.relrowsecurity, FALSE) AS rls_enabled,
           COALESCE(relations.relforcerowsecurity, FALSE) AS force_rls
      FROM target_table target
      LEFT JOIN pg_class relations ON relations.oid = target.relation_oid
  )
  SELECT relation_readback.table_exists,
         relation_readback.rls_enabled,
         relation_readback.force_rls,
         EXISTS (
           SELECT 1
             FROM pg_policies policies
            WHERE policies.schemaname = 'public'
              AND policies.tablename = 'duration_learning_legacy_runtime_retirement_state'
              AND policies.policyname = $1
         ) AS policy_exists,
         (
           SELECT policies.policyname
             FROM pg_policies policies
            WHERE policies.schemaname = 'public'
              AND policies.tablename = 'duration_learning_legacy_runtime_retirement_state'
              AND policies.policyname = $1
            LIMIT 1
         ) AS policy_name,
         (
           SELECT policies.qual::text
             FROM pg_policies policies
            WHERE policies.schemaname = 'public'
              AND policies.tablename = 'duration_learning_legacy_runtime_retirement_state'
              AND policies.policyname = $1
            LIMIT 1
         ) AS using_expression,
         (
           SELECT policies.with_check::text
             FROM pg_policies policies
            WHERE policies.schemaname = 'public'
              AND policies.tablename = 'duration_learning_legacy_runtime_retirement_state'
              AND policies.policyname = $1
            LIMIT 1
         ) AS with_check_expression
    FROM relation_readback
`

export function buildSecurityAdvisorRetirementStateRlsReadback(
  row: SecurityAdvisorRetirementStateRlsQueryRow,
): SecurityAdvisorRetirementStateRlsReadback {
  return {
    tableExists: row.table_exists,
    rlsEnabled: row.rls_enabled,
    forceRls: row.force_rls,
    policyExists: row.policy_exists,
    policyName: row.policy_name,
    usingExpression: row.using_expression,
    withCheckExpression: row.with_check_expression,
  }
}

export async function readSecurityAdvisorRetirementStateRls(
  client: Pick<Client, 'query'>,
): Promise<SecurityAdvisorRetirementStateRlsReadback> {
  const result = await client.query<SecurityAdvisorRetirementStateRlsQueryRow>(
    SECURITY_ADVISOR_RETIREMENT_STATE_RLS_READBACK_SQL,
    [SECURITY_ADVISOR_RETIREMENT_STATE_RLS_POLICY_NAME],
  )
  const row = result.rows[0]
  if (!row) throw new Error('Security Advisor retirement-state RLS readback returned no row')
  return buildSecurityAdvisorRetirementStateRlsReadback(row)
}

function isFalseExpression(value: string | null) {
  return String(value ?? '').replace(/[\s()]/g, '').toLowerCase() === 'false'
}

export function verifySecurityAdvisorRetirementStateRls(
  readback: SecurityAdvisorRetirementStateRlsReadback,
  expectedState: SecurityAdvisorRetirementStateRlsExpectedState,
  migrationApplied: boolean,
) {
  if (expectedState !== 'hardened') {
    throw new Error(`Unsupported retirement-state RLS expected state: ${expectedState}`)
  }
  if (!migrationApplied) {
    throw new Error('Migration 335 ledger is not applied; hardened retirement-state RLS state is invalid')
  }
  if (!readback.tableExists) {
    throw new Error('Retirement-state table is missing')
  }
  if (!readback.rlsEnabled || !readback.forceRls) {
    throw new Error('Retirement-state table must keep enabled and forced RLS')
  }
  if (!readback.policyExists || readback.policyName !== SECURITY_ADVISOR_RETIREMENT_STATE_RLS_POLICY_NAME) {
    throw new Error('Retirement-state deny-all policy is missing')
  }
  if (!isFalseExpression(readback.usingExpression) || !isFalseExpression(readback.withCheckExpression)) {
    throw new Error('Retirement-state RLS policy must be deny-all for reads and writes')
  }
  return {
    state: expectedState,
    migrationApplied,
    policyName: SECURITY_ADVISOR_RETIREMENT_STATE_RLS_POLICY_NAME,
  }
}
