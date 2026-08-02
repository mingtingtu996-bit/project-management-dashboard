import type { Client } from 'pg'

import { parseStrictPostgresConnectionTarget } from '../utils/postgresConnectionTargetIdentity.js'

export const SECURITY_ADVISOR_SEARCH_PATH_FUNCTIONS = [
  'public.ensure_structured_cause_attribution_tenant()',
  'public.validate_risk_issue_closure_cause_attribution()',
] as const

export const SECURITY_ADVISOR_RESTRICTED_FUNCTIONS = [
  'public.archive_duration_learning_runtime_evidence_outbox_tombstone()',
  'public.cancel_duration_learning_runtime_evidence_before_subject_delete()',
  'public.persist_duration_learning_runtime_consumptions(jsonb)',
] as const

export const SECURITY_ADVISOR_API_ROLES = ['anon', 'authenticated'] as const
export const SECURITY_ADVISOR_RUNTIME_ROLES = ['service_role', 'workbuddy_runtime'] as const

export type SecurityAdvisorFunctionHardeningExpectedState = 'pending' | 'hardened'

export type SecurityAdvisorFunctionRoleReadback = {
  exists: boolean
  canExecute: boolean
  hasExplicitExecuteGrant: boolean
}

export type SecurityAdvisorFunctionReadback = {
  functionIdentity: string
  functionExists: boolean
  searchPathIsPublic: boolean
  publicCanExecute: boolean
  roles: Record<string, SecurityAdvisorFunctionRoleReadback>
}

export type SecurityAdvisorFunctionQueryRow = {
  function_identity: string
  function_exists: boolean
  search_path_is_public: boolean
  public_can_execute: boolean
  role_name: string
  role_exists: boolean
  role_can_execute: boolean
  role_has_explicit_execute: boolean
}

export const SECURITY_ADVISOR_FUNCTION_HARDENING_READBACK_SQL = `
  /* security_advisor_function_hardening_334_postcondition */
  WITH expected_functions(function_identity) AS (
    SELECT unnest($1::text[])
  ),
  expected_roles(role_name) AS (
    SELECT unnest($2::text[])
  )
  SELECT functions.function_identity,
         procedures.oid IS NOT NULL AS function_exists,
         CASE
           WHEN procedures.oid IS NULL THEN FALSE
           ELSE 'search_path=public' = ANY(COALESCE(procedures.proconfig, ARRAY[]::text[]))
         END AS search_path_is_public,
         CASE WHEN procedures.oid IS NULL THEN FALSE ELSE EXISTS (
           SELECT 1
             FROM aclexplode(COALESCE(procedures.proacl, acldefault('f', procedures.proowner))) acl
            WHERE acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
         ) END AS public_can_execute,
         roles.role_name,
         database_roles.oid IS NOT NULL AS role_exists,
         CASE
           WHEN procedures.oid IS NULL OR database_roles.oid IS NULL THEN FALSE
           ELSE has_function_privilege(database_roles.oid, procedures.oid, 'EXECUTE')
         END AS role_can_execute,
         CASE WHEN procedures.oid IS NULL OR database_roles.oid IS NULL THEN FALSE ELSE EXISTS (
           SELECT 1
             FROM aclexplode(COALESCE(procedures.proacl, acldefault('f', procedures.proowner))) acl
            WHERE acl.grantee = database_roles.oid
              AND acl.privilege_type = 'EXECUTE'
         ) END AS role_has_explicit_execute
    FROM expected_functions functions
    CROSS JOIN expected_roles roles
    LEFT JOIN pg_proc procedures ON procedures.oid = to_regprocedure(functions.function_identity)
    LEFT JOIN pg_roles database_roles ON database_roles.rolname::text = roles.role_name
   ORDER BY functions.function_identity, roles.role_name
`

type SecurityAdvisorFunctionHardeningTargetEnv = {
  SUPABASE_URL?: string
  SUPABASE_MIGRATION_URL?: string
}

function parseUrl(value: string | undefined) {
  const text = String(value ?? '').trim()
  if (!text) return null
  try {
    return new URL(text)
  } catch {
    return null
  }
}

function projectRefFromSupabaseUrl(value: string | undefined) {
  const parsed = parseUrl(value)
  if (!parsed || parsed.protocol !== 'https:') return null
  return /^([a-z0-9]{20})\.supabase\.co$/i.exec(parsed.hostname)?.[1]?.toLowerCase() ?? null
}

function projectRefFromMigrationUrl(value: string | undefined) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const target = parseStrictPostgresConnectionTarget(text)

  const directRef = /^db\.([a-z0-9]{20})\.supabase\.co$/i.exec(target.host)?.[1]
  if (directRef) return directRef.toLowerCase()

  if (!/(?:^|\.)pooler\.supabase\.(?:com|co)$/i.test(target.host)) return null
  const separator = target.user.trim().toLowerCase().lastIndexOf('.')
  if (separator <= 0) return null
  const projectRef = target.user.trim().toLowerCase().slice(separator + 1)
  return /^[a-z0-9]{20}$/.test(projectRef) ? projectRef : null
}

export function verifySecurityAdvisorFunctionHardeningTargetIdentity(
  env: SecurityAdvisorFunctionHardeningTargetEnv = process.env,
) {
  const expectedProjectRef = projectRefFromSupabaseUrl(env.SUPABASE_URL)
  if (!expectedProjectRef) {
    throw new Error('Security Advisor function hardening expected project is unresolved')
  }
  const migrationProjectRef = projectRefFromMigrationUrl(env.SUPABASE_MIGRATION_URL)
  if (!migrationProjectRef) {
    throw new Error('Security Advisor function hardening migration project is unresolved')
  }
  if (migrationProjectRef !== expectedProjectRef) {
    throw new Error('Security Advisor function hardening target project mismatch')
  }
  return { projectRef: expectedProjectRef }
}

export function buildSecurityAdvisorFunctionReadbacks(
  rows: readonly SecurityAdvisorFunctionQueryRow[],
): SecurityAdvisorFunctionReadback[] {
  const byIdentity = new Map<string, SecurityAdvisorFunctionReadback>()
  for (const row of rows) {
    const readback = byIdentity.get(row.function_identity) ?? {
      functionIdentity: row.function_identity,
      functionExists: row.function_exists,
      searchPathIsPublic: row.search_path_is_public,
      publicCanExecute: row.public_can_execute,
      roles: {},
    }
    readback.roles[row.role_name] = {
      exists: row.role_exists,
      canExecute: row.role_can_execute,
      hasExplicitExecuteGrant: row.role_has_explicit_execute,
    }
    byIdentity.set(row.function_identity, readback)
  }
  return [...byIdentity.values()]
}

export async function readSecurityAdvisorFunctionHardeningState(
  client: Pick<Client, 'query'>,
): Promise<SecurityAdvisorFunctionReadback[]> {
  const result = await client.query<SecurityAdvisorFunctionQueryRow>(
    SECURITY_ADVISOR_FUNCTION_HARDENING_READBACK_SQL,
    [
      [...SECURITY_ADVISOR_SEARCH_PATH_FUNCTIONS, ...SECURITY_ADVISOR_RESTRICTED_FUNCTIONS],
      [...SECURITY_ADVISOR_API_ROLES, ...SECURITY_ADVISOR_RUNTIME_ROLES],
    ],
  )
  return buildSecurityAdvisorFunctionReadbacks(result.rows)
}

function roleReadback(
  readback: SecurityAdvisorFunctionReadback,
  roleName: string,
): SecurityAdvisorFunctionRoleReadback {
  return readback.roles[roleName] ?? {
    exists: false,
    canExecute: false,
    hasExplicitExecuteGrant: false,
  }
}

export function verifySecurityAdvisorFunctionHardeningState(
  readbacks: SecurityAdvisorFunctionReadback[],
  expectedState: SecurityAdvisorFunctionHardeningExpectedState,
) {
  const expectedFunctions = [
    ...SECURITY_ADVISOR_SEARCH_PATH_FUNCTIONS,
    ...SECURITY_ADVISOR_RESTRICTED_FUNCTIONS,
  ]
  const byIdentity = new Map(readbacks.map((readback) => [readback.functionIdentity, readback]))
  if (byIdentity.size !== expectedFunctions.length || readbacks.length !== byIdentity.size) {
    throw new Error('Security Advisor function readback must contain each required function exactly once')
  }

  let mutableSearchPathCount = 0
  for (const functionIdentity of SECURITY_ADVISOR_SEARCH_PATH_FUNCTIONS) {
    const readback = byIdentity.get(functionIdentity)
    if (!readback?.functionExists) {
      throw new Error(`Required security Advisor function is missing: ${functionIdentity}`)
    }
    if (!readback.searchPathIsPublic) mutableSearchPathCount += 1
    if (expectedState === 'hardened' && !readback.searchPathIsPublic) {
      throw new Error(`Function search_path remains mutable: ${functionIdentity}`)
    }
  }

  let advisorExecuteExposureCount = 0
  let runtimeGrantCount = 0
  for (const functionIdentity of SECURITY_ADVISOR_RESTRICTED_FUNCTIONS) {
    const readback = byIdentity.get(functionIdentity)
    if (!readback?.functionExists) {
      throw new Error(`Required security Advisor function is missing: ${functionIdentity}`)
    }

    for (const roleName of SECURITY_ADVISOR_API_ROLES) {
      const role = roleReadback(readback, roleName)
      if (!role.exists) throw new Error(`Required Supabase API role is missing: ${roleName}`)
      if (role.canExecute) advisorExecuteExposureCount += 1
    }
    for (const roleName of SECURITY_ADVISOR_RUNTIME_ROLES) {
      const role = roleReadback(readback, roleName)
      if (!role.exists || !role.canExecute || !role.hasExplicitExecuteGrant) {
        throw new Error(`Runtime execute grant is missing for ${roleName} on ${functionIdentity}`)
      }
      runtimeGrantCount += 1
    }

    if (expectedState === 'pending' && !readback.publicCanExecute) {
      throw new Error(`Expected bootstrap PUBLIC execute exposure is missing for ${functionIdentity}`)
    }
    if (expectedState === 'hardened' && readback.publicCanExecute) {
      throw new Error(`PUBLIC execute remains on ${functionIdentity}`)
    }
  }

  if (expectedState === 'pending' && mutableSearchPathCount !== 2) {
    throw new Error(`Bootstrap precondition requires exactly two mutable search paths; found ${mutableSearchPathCount}`)
  }
  if (expectedState === 'pending' && advisorExecuteExposureCount !== 6) {
    throw new Error(`Bootstrap precondition requires exactly six anon/authenticated exposures; found ${advisorExecuteExposureCount}`)
  }
  if (expectedState === 'hardened' && advisorExecuteExposureCount !== 0) {
    throw new Error(`Anon/authenticated execute remains after migration 334; found ${advisorExecuteExposureCount} exposures`)
  }

  return {
    state: expectedState,
    functionCount: expectedFunctions.length,
    mutableSearchPathCount,
    advisorExecuteExposureCount,
    runtimeGrantCount,
  }
}

export function verifySecurityAdvisorFunctionHardeningRemediationState(
  readbacks: SecurityAdvisorFunctionReadback[],
  expectedState: SecurityAdvisorFunctionHardeningExpectedState,
  migrationApplied: boolean,
) {
  if (expectedState === 'pending' && migrationApplied) {
    throw new Error('Migration 334 ledger is already applied; pending remediation state is invalid')
  }
  if (expectedState === 'hardened' && !migrationApplied) {
    throw new Error('Migration 334 ledger is not applied; hardened remediation state is invalid')
  }
  return {
    ...verifySecurityAdvisorFunctionHardeningState(readbacks, expectedState),
    migrationApplied,
  }
}
