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
  const parsed = parseUrl(value)
  if (!parsed || !['postgres:', 'postgresql:'].includes(parsed.protocol)) return null

  const directRef = /^db\.([a-z0-9]{20})\.supabase\.co$/i.exec(parsed.hostname)?.[1]
  if (directRef) return directRef.toLowerCase()

  if (!/(?:^|\.)pooler\.supabase\.(?:com|co)$/i.test(parsed.hostname)) return null
  let username = ''
  try {
    username = decodeURIComponent(parsed.username).trim().toLowerCase()
  } catch {
    return null
  }
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
