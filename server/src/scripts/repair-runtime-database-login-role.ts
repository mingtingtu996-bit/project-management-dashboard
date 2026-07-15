import pg from 'pg'

import {
  resolveMigrationRuntimeConnectionConfig,
} from '../services/migrationRunner.js'
import { closeDatabasePool } from '../database.js'

const { Client } = pg

type RuntimeDatabaseLoginRoleRepairEnv = Record<string, string | undefined>

export type RuntimeDatabaseLoginRoleRepairConfig = {
  roleName: string
  rolePassword: string
  shouldVerifyRuntimeConnection: boolean
}

export type RuntimeDatabaseLoginRoleRepairFailureCategory =
  | 'migration_pooler_tenant_user_missing'
  | 'migration_database_connection_timeout'
  | 'migration_database_auth_failed'
  | 'migration_database_unreachable'
  | 'unknown_repair_failure'

export type SanitizedDatabaseConnectionSummary = {
  present: boolean
  source: string
  user: string | null
  host: string | null
  port: string | null
  database: string | null
  sslMode: string | null
  hasPassword: boolean
  connectionKind: 'supabase_direct' | 'supabase_pooler' | 'postgres_url' | 'host_config' | 'missing' | 'invalid_url'
}

const DEFAULT_RUNTIME_LOGIN_ROLE = 'workbuddy_runtime_login'
const RUNTIME_LOGIN_ROLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/i
const args = new Set(process.argv.slice(2))
const DEFAULT_CONNECTION_TIMEOUT_MS = 8000
const DEFAULT_QUERY_TIMEOUT_MS = 15000

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function quoteSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function readPositiveIntEnv(env: RuntimeDatabaseLoginRoleRepairEnv, name: string, fallback: number) {
  const parsed = Number(env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function parseConnectionString(value: string | undefined) {
  const text = normalizeText(value)
  if (!text) return null
  try {
    return new URL(text)
  } catch {
    return null
  }
}

function isPoolerClientConfig(config: Record<string, unknown>) {
  const connectionString = typeof config.connectionString === 'string' ? config.connectionString : ''
  const parsed = parseConnectionString(connectionString)
  if (parsed) {
    return parsed.port === '6543' || parsed.hostname.endsWith('.pooler.supabase.com')
  }

  return Number(config.port) === 6543
}

function roleNameFromRuntimeConnectionString(value: string | undefined) {
  const parsed = parseConnectionString(value)
  if (!parsed) return null
  const username = decodeURIComponent(parsed.username || '').trim()
  if (!username) return null
  return username.split('.')[0]?.trim() || null
}

function passwordFromRuntimeConnectionString(value: string | undefined) {
  const parsed = parseConnectionString(value)
  if (!parsed) return null
  const password = decodeURIComponent(parsed.password || '').trim()
  return password || null
}

function projectRefFromUrl(value: string | undefined) {
  const parsed = parseConnectionString(value)
  if (!parsed) return null
  const hostParts = parsed.hostname.split('.')
  if (hostParts[0] === 'db' && hostParts[1]) return hostParts[1]
  const username = decodeURIComponent(parsed.username || '').trim()
  const usernameParts = username.split('.')
  return usernameParts[1] || null
}

function projectRefFromSupabaseUrl(value: string | undefined) {
  const parsed = parseConnectionString(value)
  if (!parsed) return null
  return parsed.hostname.endsWith('.supabase.co') ? parsed.hostname.split('.')[0] || null : null
}

function summarizeConnectionUrl(source: string, value: string | undefined): SanitizedDatabaseConnectionSummary {
  const text = normalizeText(value)
  if (!text) {
    return {
      present: false,
      source,
      user: null,
      host: null,
      port: null,
      database: null,
      sslMode: null,
      hasPassword: false,
      connectionKind: 'missing',
    }
  }

  const parsed = parseConnectionString(text)
  if (!parsed) {
    return {
      present: true,
      source,
      user: null,
      host: null,
      port: null,
      database: null,
      sslMode: null,
      hasPassword: false,
      connectionKind: 'invalid_url',
    }
  }

  const host = parsed.hostname || null
  const user = decodeURIComponent(parsed.username || '').trim() || null
  const connectionKind: SanitizedDatabaseConnectionSummary['connectionKind'] = host?.endsWith('.pooler.supabase.com')
    ? 'supabase_pooler'
    : host?.startsWith('db.') && host.endsWith('.supabase.co')
      ? 'supabase_direct'
      : 'postgres_url'

  return {
    present: true,
    source,
    user,
    host,
    port: parsed.port || null,
    database: parsed.pathname.replace(/^\//, '') || null,
    sslMode: parsed.searchParams.get('sslmode'),
    hasPassword: Boolean(parsed.password),
    connectionKind,
  }
}

function hasPrivilegedMigrationConnection(env: RuntimeDatabaseLoginRoleRepairEnv) {
  const migrationUrl = normalizeText(env.SUPABASE_MIGRATION_URL)
  if (migrationUrl) return true

  const databaseUrl = parseConnectionString(env.DATABASE_URL)
  if (databaseUrl) {
    const username = decodeURIComponent(databaseUrl.username || '').split('.')[0]?.trim().toLowerCase()
    return username === 'postgres' || username === 'supabase_admin'
  }

  const user = normalizeText(env.PGUSER || env.SUPABASE_USER || 'postgres').toLowerCase()
  const password = normalizeText(env.PGPASSWORD || env.SUPABASE_PASSWORD || env.DB_PASSWORD)
  return Boolean(password) && (user === 'postgres' || user === 'supabase_admin')
}

export function resolveRuntimeDatabaseLoginRoleRepairConfig(
  env: RuntimeDatabaseLoginRoleRepairEnv = process.env,
): RuntimeDatabaseLoginRoleRepairConfig {
  if (!hasPrivilegedMigrationConnection(env)) {
    throw new Error(
      'Runtime login repair requires SUPABASE_MIGRATION_URL or privileged postgres migration credentials; do not run it through the runtime DB_CONNECTION_STRING.',
    )
  }

  const runtimeConnectionString = env.DB_CONNECTION_STRING || env.WORKBUDDY_RUNTIME_DATABASE_URL
  const roleName = normalizeText(
    env.WORKBUDDY_RUNTIME_LOGIN_ROLE
      || roleNameFromRuntimeConnectionString(runtimeConnectionString)
      || DEFAULT_RUNTIME_LOGIN_ROLE,
  )
  const rolePassword = normalizeText(
    env.WORKBUDDY_RUNTIME_LOGIN_PASSWORD
      || env.RUNTIME_DATABASE_PASSWORD
      || passwordFromRuntimeConnectionString(runtimeConnectionString),
  )

  if (!RUNTIME_LOGIN_ROLE_PATTERN.test(roleName)) {
    throw new Error(`invalid runtime login role: ${roleName}`)
  }

  if (!rolePassword) {
    throw new Error(
      'Missing runtime login password. Set WORKBUDDY_RUNTIME_LOGIN_PASSWORD or provide DB_CONNECTION_STRING with the runtime password.',
    )
  }

  return {
    roleName,
    rolePassword,
    shouldVerifyRuntimeConnection: normalizeText(env.SKIP_RUNTIME_LOGIN_VERIFY) !== '1',
  }
}

export function buildRepairRuntimeDatabaseLoginRoleSql(config: Pick<RuntimeDatabaseLoginRoleRepairConfig, 'roleName' | 'rolePassword'>) {
  const roleLiteral = quoteSqlLiteral(config.roleName)
  const passwordLiteral = quoteSqlLiteral(config.rolePassword)

  return `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${roleLiteral}) THEN
    EXECUTE format('CREATE ROLE %I LOGIN INHERIT NOBYPASSRLS PASSWORD %L', ${roleLiteral}, ${passwordLiteral});
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN INHERIT NOBYPASSRLS PASSWORD %L', ${roleLiteral}, ${passwordLiteral});
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'CREATE ROLE workbuddy_runtime NOLOGIN NOBYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE workbuddy_runtime WITH NOLOGIN NOBYPASSRLS';
  END IF;
END $$;

GRANT workbuddy_runtime TO ${config.roleName};
GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO ${config.roleName};
GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO ${config.roleName};
`.trim()
}

export function withRuntimeLoginRepairTimeouts<T extends Record<string, unknown>>(
  config: T,
  env: RuntimeDatabaseLoginRoleRepairEnv = process.env,
) {
  const queryTimeout = readPositiveIntEnv(env, 'RUNTIME_LOGIN_REPAIR_DB_QUERY_TIMEOUT_MS', DEFAULT_QUERY_TIMEOUT_MS)
  const baseConfig = {
    ...config,
    connectionTimeoutMillis: readPositiveIntEnv(
      env,
      'RUNTIME_LOGIN_REPAIR_DB_CONNECTION_TIMEOUT_MS',
      DEFAULT_CONNECTION_TIMEOUT_MS,
    ),
    query_timeout: queryTimeout,
  }

  if (isPoolerClientConfig(config)) {
    return baseConfig
  }

  return {
    ...baseConfig,
    statement_timeout: queryTimeout,
  }
}

export function classifyRuntimeLoginRepairFailure(error: unknown): RuntimeDatabaseLoginRoleRepairFailureCategory {
  const message = error instanceof Error ? error.message : String(error)
  const code = typeof error === 'object' && error && 'code' in error
    ? normalizeText((error as { code?: unknown }).code).toUpperCase()
    : ''
  const normalized = `${code} ${message}`.toLowerCase()

  if (normalized.includes('tenant/user')) {
    return 'migration_pooler_tenant_user_missing'
  }
  if (normalized.includes('timeout expired') || normalized.includes('etimedout')) {
    return 'migration_database_connection_timeout'
  }
  if (code === '28P01' || normalized.includes('password authentication failed')) {
    return 'migration_database_auth_failed'
  }
  if (normalized.includes('enotfound') || normalized.includes('eai_again') || normalized.includes('econnrefused')) {
    return 'migration_database_unreachable'
  }
  return 'unknown_repair_failure'
}

function runtimeLoginRepairOperatorActions(category: RuntimeDatabaseLoginRoleRepairFailureCategory) {
  const actionsByCategory: Record<RuntimeDatabaseLoginRoleRepairFailureCategory, string[]> = {
    migration_pooler_tenant_user_missing: [
      'replace_pooler_migration_url_with_valid_supabase_pooler_credentials_or_direct_postgres_connection',
      'rerun_repair_runtime_db_login_role',
    ],
    migration_database_connection_timeout: [
      'verify_direct_database_network_ipv6_vpn_or_use_supabase_sql_editor',
      'rerun_repair_runtime_db_login_role_with_reachable_migration_connection',
    ],
    migration_database_auth_failed: [
      'verify_postgres_database_password_or_supabase_migration_url_secret',
      'rerun_repair_runtime_db_login_role',
    ],
    migration_database_unreachable: [
      'verify_database_host_dns_firewall_and_supabase_project_status',
      'rerun_repair_runtime_db_login_role',
    ],
    unknown_repair_failure: [
      'inspect_runtime_login_repair_error_message',
      'rerun_repair_runtime_db_login_role_after_fixing_migration_connection',
    ],
  }
  return actionsByCategory[category]
}

export function buildRuntimeDatabaseLoginRoleRecoveryContext(
  env: RuntimeDatabaseLoginRoleRepairEnv = process.env,
  failureCategory: RuntimeDatabaseLoginRoleRepairFailureCategory | null = null,
) {
  const runtimeConnectionString = env.DB_CONNECTION_STRING || env.WORKBUDDY_RUNTIME_DATABASE_URL
  const roleName = normalizeText(
    env.WORKBUDDY_RUNTIME_LOGIN_ROLE
      || roleNameFromRuntimeConnectionString(runtimeConnectionString)
      || DEFAULT_RUNTIME_LOGIN_ROLE,
  ) || DEFAULT_RUNTIME_LOGIN_ROLE
  const projectRef = projectRefFromSupabaseUrl(env.SUPABASE_URL)
    || projectRefFromUrl(runtimeConnectionString)
    || projectRefFromUrl(env.SUPABASE_MIGRATION_URL)
    || projectRefFromUrl(env.DATABASE_URL)

  const checklist = [
    'copy_current_session_pooler_or_direct_database_connection_from_supabase_dashboard',
    'ensure_migration_connection_uses_privileged_postgres_credentials_not_runtime_role',
    'rerun_repair_runtime_db_login_role_with_the_privileged_migration_connection',
    'update_runtime_db_connection_string_to_the_runtime_login_role_after_repair',
    'rerun_live_construction_organization_closeout_diagnostic',
  ]

  return {
    source: 'runtime_database_login_role_recovery_context',
    safeToShare: true,
    secretsPrinted: false,
    failureCategory,
    runtimeConnection: summarizeConnectionUrl(
      env.DB_CONNECTION_STRING ? 'DB_CONNECTION_STRING' : 'WORKBUDDY_RUNTIME_DATABASE_URL',
      runtimeConnectionString,
    ),
    migrationConnection: summarizeConnectionUrl(
      env.SUPABASE_MIGRATION_URL ? 'SUPABASE_MIGRATION_URL' : 'DATABASE_URL',
      env.SUPABASE_MIGRATION_URL || env.DATABASE_URL,
    ),
    expectedRuntimePoolerUser: projectRef ? `${roleName}.${projectRef}` : `${roleName}.<project-ref>`,
    expectedRuntimeRoleName: roleName,
    operatorActions: failureCategory ? runtimeLoginRepairOperatorActions(failureCategory) : checklist,
    boundaryPolicy: [
      'recovery_context_is_offline_and_does_not_open_database_connections',
      'recovery_context_does_not_print_passwords_or_connection_strings',
      'recovery_context_is_not_runtime_closeout_evidence',
    ],
  }
}

export async function repairRuntimeDatabaseLoginRole(
  env: RuntimeDatabaseLoginRoleRepairEnv = process.env,
) {
  const config = resolveRuntimeDatabaseLoginRoleRepairConfig(env)
  const migrationConfig = await resolveMigrationRuntimeConnectionConfig()
  if (args.has('--print-config')) {
    return {
      repaired: false,
      roleName: config.roleName,
      migrationConnection: summarizeMigrationConnectionConfig(migrationConfig),
      recoveryContext: buildRuntimeDatabaseLoginRoleRecoveryContext(env),
      verifiedRuntimeConnection: false,
      nextAction: 'rerun_without_print_config_to_apply_runtime_login_role_repair',
    }
  }
  const client = new Client(withRuntimeLoginRepairTimeouts(migrationConfig, env))
  await client.connect()

  try {
    await client.query(buildRepairRuntimeDatabaseLoginRoleSql(config))
  } finally {
    await client.end()
  }

  if (config.shouldVerifyRuntimeConnection) {
    await closeDatabasePool()
  }

  return {
    repaired: true,
    roleName: config.roleName,
    verifiedRuntimeConnection: false,
    nextAction: config.shouldVerifyRuntimeConnection
      ? 'rerun_live_construction_organization_closeout_diagnostic'
      : 'runtime_login_role_repair_completed_without_runtime_connection_verify',
  }
}

function summarizeMigrationConnectionConfig(config: Awaited<ReturnType<typeof resolveMigrationRuntimeConnectionConfig>>) {
  if ('connectionString' in config && config.connectionString) {
    const parsed = new URL(config.connectionString)
    return {
      source: 'connection_string',
      user: decodeURIComponent(parsed.username || ''),
      host: parsed.hostname,
      port: parsed.port || null,
      database: parsed.pathname.replace(/^\//, '') || null,
    }
  }

  return {
    source: 'host_config',
    user: config.user ?? null,
    host: config.host ?? null,
    port: config.port ?? null,
    database: config.database ?? null,
  }
}

if (process.argv[1]?.includes('repair-runtime-database-login-role')) {
  repairRuntimeDatabaseLoginRole()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      const failureCategory = classifyRuntimeLoginRepairFailure(error)
      console.error(JSON.stringify({
        repaired: false,
        failureCategory,
        errorMessage: error instanceof Error ? error.message : String(error),
        operatorActions: runtimeLoginRepairOperatorActions(failureCategory),
        recoveryContext: buildRuntimeDatabaseLoginRoleRecoveryContext(process.env, failureCategory),
        boundaryPolicy: [
          'runtime_login_repair_does_not_write_application_data',
          'runtime_login_repair_requires_privileged_migration_connection',
          'runtime_login_repair_failure_is_not_product_closeout_evidence',
        ],
      }, null, 2))
      process.exitCode = 1
    })
}
