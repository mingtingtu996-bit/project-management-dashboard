import process from 'node:process'

function requireText(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function parseUrl(value, label) {
  try {
    return new URL(requireText(value, label))
  } catch {
    throw new Error(`${label} must be a valid URL`)
  }
}

function databaseIdentity(value, label) {
  const parsed = parseUrl(value, label)
  const hostname = parsed.hostname.toLowerCase()
  const username = decodeURIComponent(parsed.username).trim()
  if (!username) throw new Error(`${label} must include a database role`)

  const directMatch = hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/)
  if (directMatch) {
    return {
      projectRef: directMatch[1],
      roleName: username.toLowerCase(),
    }
  }

  if (hostname.endsWith('.pooler.supabase.com') || hostname.endsWith('.pooler.supabase.co')) {
    const separator = username.lastIndexOf('.')
    const projectRef = separator >= 0 ? username.slice(separator + 1).trim().toLowerCase() : ''
    const roleName = separator >= 0 ? username.slice(0, separator).trim().toLowerCase() : ''
    if (projectRef && roleName && /^[a-z0-9-]+$/.test(projectRef)) {
      return { projectRef, roleName }
    }
  }

  throw new Error(`${label} must use a Supabase direct or pooler project identity`)
}

export function projectRefFromSupabaseUrl(value) {
  const hostname = parseUrl(value, 'SUPABASE_URL').hostname.toLowerCase()
  const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)
  if (!match) throw new Error('SUPABASE_URL must target a Supabase project host')
  return match[1]
}

export function projectRefFromMigrationUrl(value) {
  return databaseIdentity(value, 'SUPABASE_MIGRATION_URL').projectRef
}

export function verifyDeploymentTargetIdentity(env = process.env) {
  const deployTarget = requireText(env.DEPLOY_TARGET, 'DEPLOY_TARGET')
  if (deployTarget !== 'staging' && deployTarget !== 'production') {
    throw new Error('DEPLOY_TARGET must be staging or production')
  }

  const runtimeProjectRef = projectRefFromSupabaseUrl(env.SUPABASE_URL)
  const migrationIdentity = databaseIdentity(
    env.SUPABASE_MIGRATION_URL,
    'SUPABASE_MIGRATION_URL',
  )
  const runtimeDatabaseIdentity = databaseIdentity(
    env.RUNTIME_DATABASE_URL,
    'RUNTIME_DATABASE_URL',
  )
  let advisor
  try {
    advisor = JSON.parse(requireText(env.SUPABASE_ADVISOR_EXPORT_JSON, 'SUPABASE_ADVISOR_EXPORT_JSON'))
  } catch {
    throw new Error('SUPABASE_ADVISOR_EXPORT_JSON must be valid JSON')
  }
  if (!advisor || typeof advisor !== 'object' || Array.isArray(advisor)) {
    throw new Error('SUPABASE_ADVISOR_EXPORT_JSON must contain an object')
  }
  if (advisor.schemaVersion !== 'workbuddy-supabase-advisor-ui-or-api-export/v1') {
    throw new Error('Supabase advisor export schema version is invalid')
  }
  if (String(advisor.environment ?? '').trim() !== deployTarget) {
    throw new Error('Supabase advisor export environment does not match DEPLOY_TARGET')
  }
  const advisorProjectRef = requireText(advisor.projectRef, 'advisor projectRef').toLowerCase()
  if (
    runtimeProjectRef !== migrationIdentity.projectRef
    || runtimeProjectRef !== runtimeDatabaseIdentity.projectRef
    || runtimeProjectRef !== advisorProjectRef
  ) {
    throw new Error(
      'Runtime API, runtime database, migration, and advisor Supabase project identities do not match',
    )
  }
  if (
    runtimeDatabaseIdentity.roleName === migrationIdentity.roleName
    || ['postgres', 'service_role', 'supabase_admin'].includes(runtimeDatabaseIdentity.roleName)
  ) {
    throw new Error('Runtime and migration database roles must be separate')
  }

  return { deployTarget, projectRef: runtimeProjectRef }
}

try {
  const result = verifyDeploymentTargetIdentity()
  process.stdout.write(`Deployment target database identity verified for ${result.deployTarget}.\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
