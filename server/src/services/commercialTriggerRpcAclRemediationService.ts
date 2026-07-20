import type { Client } from 'pg'

import { parseStrictPostgresConnectionTarget } from '../utils/postgresConnectionTargetIdentity.js'

export const COMMERCIAL_TRIGGER_RPC_IDENTITIES = [
  'public.workbuddy_initialize_company_commercial()',
  'public.workbuddy_meter_company_projects()',
] as const

export const COMMERCIAL_TRIGGER_API_ROLES = ['anon', 'authenticated'] as const
export const COMMERCIAL_TRIGGER_RUNTIME_ROLES = [
  'service_role',
  'workbuddy_runtime',
  'workbuddy_runtime_login',
] as const

export type CommercialTriggerRpcAclExpectedState = 'vulnerable' | 'hardened'

export type CommercialTriggerRpcRemediationTargetEnv = {
  SUPABASE_URL?: string
  SUPABASE_MIGRATION_URL?: string
}

export type CommercialTriggerRpcRoleReadback = {
  exists: boolean
  canExecute: boolean
}

export type CommercialTriggerRpcAclReadback = {
  functionIdentity: string
  functionExists: boolean
  publicCanExecute: boolean
  roles: Record<string, CommercialTriggerRpcRoleReadback>
}

export type CommercialTriggerRpcAclVerification = {
  state: CommercialTriggerRpcAclExpectedState
  functionCount: number
  advisorExposureCount: number
  runtimeGrantCount: number
}

export type CommercialTriggerRpcAclQueryRow = {
  function_identity: string
  function_exists: boolean
  public_can_execute: boolean
  role_name: string
  role_exists: boolean
  role_can_execute: boolean
}

export const COMMERCIAL_TRIGGER_RPC_ACL_READBACK_SQL = `
  /* commercial_trigger_rpc_acl_postcondition */
  WITH expected_functions(function_identity) AS (
    SELECT unnest($1::text[])
  ),
  expected_roles(role_name) AS (
    SELECT unnest($2::text[])
  )
  SELECT functions.function_identity,
         procedures.oid IS NOT NULL AS function_exists,
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
         END AS role_can_execute
    FROM expected_functions functions
    CROSS JOIN expected_roles roles
    LEFT JOIN pg_proc procedures ON procedures.oid = to_regprocedure(functions.function_identity)
    LEFT JOIN pg_roles database_roles ON database_roles.rolname::text = roles.role_name
   ORDER BY functions.function_identity, roles.role_name
`

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
  const username = target.user.trim().toLowerCase()
  const separator = username.lastIndexOf('.')
  if (separator <= 0) return null
  const projectRef = username.slice(separator + 1)
  return /^[a-z0-9]{20}$/.test(projectRef) ? projectRef : null
}

export function verifyCommercialTriggerRpcRemediationTargetIdentity(
  env: CommercialTriggerRpcRemediationTargetEnv = process.env,
) {
  const expectedProjectRef = projectRefFromSupabaseUrl(env.SUPABASE_URL)
  if (!expectedProjectRef) {
    throw new Error('Commercial trigger remediation expected project is unresolved')
  }
  const migrationProjectRef = projectRefFromMigrationUrl(env.SUPABASE_MIGRATION_URL)
  if (!migrationProjectRef) {
    throw new Error('Commercial trigger remediation migration project is unresolved')
  }
  if (migrationProjectRef !== expectedProjectRef) {
    throw new Error('Commercial trigger remediation target project mismatch')
  }
  return { projectRef: expectedProjectRef }
}

export function buildCommercialTriggerRpcAclReadbacks(
  rows: readonly CommercialTriggerRpcAclQueryRow[],
): CommercialTriggerRpcAclReadback[] {
  const byIdentity = new Map<string, CommercialTriggerRpcAclReadback>()
  for (const row of rows) {
    const readback = byIdentity.get(row.function_identity) ?? {
      functionIdentity: row.function_identity,
      functionExists: row.function_exists,
      publicCanExecute: row.public_can_execute,
      roles: {},
    }
    readback.roles[row.role_name] = {
      exists: row.role_exists,
      canExecute: row.role_can_execute,
    }
    byIdentity.set(row.function_identity, readback)
  }
  return [...byIdentity.values()]
}

export async function readCommercialTriggerRpcAclState(
  client: Pick<Client, 'query'>,
): Promise<CommercialTriggerRpcAclReadback[]> {
  const result = await client.query<CommercialTriggerRpcAclQueryRow>(
    COMMERCIAL_TRIGGER_RPC_ACL_READBACK_SQL,
    [
      [...COMMERCIAL_TRIGGER_RPC_IDENTITIES],
      [...COMMERCIAL_TRIGGER_API_ROLES, ...COMMERCIAL_TRIGGER_RUNTIME_ROLES],
    ],
  )
  return buildCommercialTriggerRpcAclReadbacks(result.rows)
}

function roleReadback(
  readback: CommercialTriggerRpcAclReadback,
  roleName: string,
): CommercialTriggerRpcRoleReadback {
  return readback.roles[roleName] ?? { exists: false, canExecute: false }
}

export function verifyCommercialTriggerRpcAclState(
  readbacks: CommercialTriggerRpcAclReadback[],
  expectedState: CommercialTriggerRpcAclExpectedState,
): CommercialTriggerRpcAclVerification {
  const byIdentity = new Map(readbacks.map((readback) => [readback.functionIdentity, readback]))
  if (byIdentity.size !== COMMERCIAL_TRIGGER_RPC_IDENTITIES.length || readbacks.length !== byIdentity.size) {
    throw new Error('Commercial trigger ACL readback must contain each required function exactly once')
  }

  let advisorExposureCount = 0
  let runtimeGrantCount = 0
  for (const functionIdentity of COMMERCIAL_TRIGGER_RPC_IDENTITIES) {
    const readback = byIdentity.get(functionIdentity)
    if (!readback?.functionExists) {
      throw new Error(`Required commercial trigger function is missing: ${functionIdentity}`)
    }

    for (const roleName of COMMERCIAL_TRIGGER_API_ROLES) {
      const role = roleReadback(readback, roleName)
      if (!role.exists) {
        throw new Error(`Required Supabase API role is missing: ${roleName}`)
      }
      if (role.canExecute) advisorExposureCount += 1
    }

    for (const roleName of COMMERCIAL_TRIGGER_RUNTIME_ROLES) {
      const role = roleReadback(readback, roleName)
      if (!role.exists) continue
      if (!role.canExecute) {
        throw new Error(`Runtime execute grant is missing for ${roleName} on ${functionIdentity}`)
      }
      runtimeGrantCount += 1
    }

    if (expectedState === 'vulnerable' && !readback.publicCanExecute) {
      throw new Error(`Expected bootstrap PUBLIC execute exposure is missing for ${functionIdentity}`)
    }
    if (expectedState === 'hardened' && readback.publicCanExecute) {
      throw new Error(`PUBLIC execute remains on ${functionIdentity}`)
    }
  }

  if (expectedState === 'vulnerable' && advisorExposureCount !== 4) {
    throw new Error(`Bootstrap precondition requires exactly four anon/authenticated exposures; found ${advisorExposureCount}`)
  }
  if (expectedState === 'hardened' && advisorExposureCount !== 0) {
    throw new Error(`Anon/authenticated execute remains after migration 308; found ${advisorExposureCount} exposures`)
  }

  return {
    state: expectedState,
    functionCount: COMMERCIAL_TRIGGER_RPC_IDENTITIES.length,
    advisorExposureCount,
    runtimeGrantCount,
  }
}

export function verifyCommercialTriggerRpcAclRemediationState(
  readbacks: CommercialTriggerRpcAclReadback[],
  expectedState: CommercialTriggerRpcAclExpectedState,
  migrationApplied: boolean,
) {
  if (expectedState === 'vulnerable' && migrationApplied) {
    throw new Error('Migration 308 ledger is already applied; vulnerable remediation state is invalid')
  }
  if (expectedState === 'hardened' && !migrationApplied) {
    throw new Error('Migration 308 ledger is not applied; hardened remediation state is invalid')
  }
  return {
    ...verifyCommercialTriggerRpcAclState(readbacks, expectedState),
    migrationApplied,
  }
}
