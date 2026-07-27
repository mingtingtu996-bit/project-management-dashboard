import { writeJsonFile } from './jsonEvidenceUtils.js'

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'

export type RlsPolicyAuditRow = {
  tablename: string
  rowsecurity: boolean
  force_rowsecurity: boolean
  policy_count: number
  policy_definition: string
}

export type CurrentRoleBypassRow = {
  rolname: string
  rolbypassrls: boolean
}

export type ExecuteSqlPrivilegeRow = {
  schema_name: string
  function_name: string
  public_can_execute: boolean
  anon_can_execute: boolean
  authenticated_can_execute: boolean
  proacl: string | null
}

export type RlsProaclCatalogReader = {
  readRlsPolicyRows: (tables: string[]) => Promise<RlsPolicyAuditRow[]>
  readCurrentRoleBypass: () => Promise<CurrentRoleBypassRow | null>
  readExecuteSqlPrivileges: () => Promise<ExecuteSqlPrivilegeRow[]>
}

export type PublicRlsDiagnosticCheck = {
  status: DiagnosticStatus
  tableCount: number
  disabledTables: string[]
  forceMissingTables: string[]
  tablesWithoutPolicies: string[]
  tablesWithoutTenantPredicate: string[]
  reason?: string
}

export type CurrentRoleBypassDiagnosticCheck = {
  status: DiagnosticStatus
  currentRole: string | null
  bypassRole: string | null
  reason?: string
}

export type ExecuteSqlPrivilegeDiagnosticCheck = {
  status: DiagnosticStatus
  functionCount: number
  executableByUntrustedRoles: string[]
  anonPocRequired: true
  anonPocRequiredReason: string
  reason?: string
}

export type RlsProaclLiveDiagnosticReport = {
  reportCode: 'c18_l01_l04_rls_proacl_live_diagnostic'
  evidenceKind: 'live_postgres_rls_policy_role_rpc_probe'
  generatedAt: string
  diagnosticRunId: string
  evidenceRef: string | null
  outputFile: string | null
  missingArchivedJson: boolean
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  status: DiagnosticStatus
  allowLive: boolean
  timeoutMs: number
  tables: string[]
  checks: {
    publicRls: PublicRlsDiagnosticCheck
    currentRoleBypass: CurrentRoleBypassDiagnosticCheck
    executeSqlPrivileges: ExecuteSqlPrivilegeDiagnosticCheck
  }
}

export type RlsProaclLiveDiagnosticOptions = {
  now?: Date
  diagnosticRunId?: string | null
  outputFile?: string | null
  allowLive?: boolean
  timeoutMs?: number | null
  tables?: string[] | null
  reader?: RlsProaclCatalogReader
}

export type RlsProaclLiveDiagnosticCliOptions = {
  args?: string[]
  now?: Date
  reader?: RlsProaclCatalogReader
  write?: (message: string) => void
  writeError?: (error: unknown) => void
  closeDatabasePool?: () => Promise<void> | void
}

const TENANT_POLICY_PATTERN = /\b(company_id|project_id|project_members|company_members|auth\.uid\s*\(|current_setting\s*\()/i

const DEFAULT_TABLES = [
  'companies',
  'company_members',
  'projects',
  'tasks',
  'task_dependencies',
  'engineering_objects',
  'acceptance_plans',
  'project_daily_snapshot',
]
const DEFAULT_TIMEOUT_MS = 30_000

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function createDefaultDiagnosticRunId(now: Date) {
  return `c18-l01-l04-${now.toISOString().replace(/[:.]/g, '-')}`
}

function normalizeOutputFile(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeTables(values: string[] | null | undefined) {
  const tables = (values && values.length > 0 ? values : DEFAULT_TABLES)
    .map(normalizeText)
    .filter(Boolean)
  return [...new Set(tables)]
}

function normalizeTimeoutMs(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIMEOUT_MS
}

function blockedPublicRlsCheck(reason: string): PublicRlsDiagnosticCheck {
  return {
    status: 'blocked',
    tableCount: 0,
    disabledTables: [],
    forceMissingTables: [],
    tablesWithoutPolicies: [],
    tablesWithoutTenantPredicate: [],
    reason,
  }
}

function failedPublicRlsCheck(reason: string): PublicRlsDiagnosticCheck {
  return {
    status: 'fail',
    tableCount: 0,
    disabledTables: [],
    forceMissingTables: [],
    tablesWithoutPolicies: [],
    tablesWithoutTenantPredicate: [],
    reason,
  }
}

function blockedCurrentRoleCheck(reason: string): CurrentRoleBypassDiagnosticCheck {
  return {
    status: 'blocked',
    currentRole: null,
    bypassRole: null,
    reason,
  }
}

function failedCurrentRoleCheck(reason: string): CurrentRoleBypassDiagnosticCheck {
  return {
    status: 'fail',
    currentRole: null,
    bypassRole: null,
    reason,
  }
}

function blockedExecuteSqlCheck(reason: string): ExecuteSqlPrivilegeDiagnosticCheck {
  return {
    status: 'blocked',
    functionCount: 0,
    executableByUntrustedRoles: [],
    anonPocRequired: true,
    anonPocRequiredReason: 'C-18.L04 still requires an external anon-key PoC against the live API surface even after catalog ACLs look safe.',
    reason,
  }
}

function failedExecuteSqlCheck(reason: string): ExecuteSqlPrivilegeDiagnosticCheck {
  return {
    status: 'fail',
    functionCount: 0,
    executableByUntrustedRoles: [],
    anonPocRequired: true,
    anonPocRequiredReason: 'C-18.L04 still requires an external anon-key PoC against the live API surface even after catalog ACLs look safe.',
    reason,
  }
}

function formatDiagnosticError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

function evaluatePublicRls(rows: RlsPolicyAuditRow[]): PublicRlsDiagnosticCheck {
  const disabledTables = rows.filter((row) => !row.rowsecurity).map((row) => row.tablename)
  const forceMissingTables = rows.filter((row) => row.rowsecurity && !row.force_rowsecurity).map((row) => row.tablename)
  const tablesWithoutPolicies = rows
    .filter((row) => row.rowsecurity && Number(row.policy_count ?? 0) === 0)
    .map((row) => row.tablename)
  const tablesWithoutTenantPredicate = rows
    .filter((row) => row.rowsecurity && Number(row.policy_count ?? 0) > 0)
    .filter((row) => !TENANT_POLICY_PATTERN.test(String(row.policy_definition ?? '')))
    .map((row) => row.tablename)
  const status: DiagnosticStatus = disabledTables.length === 0
    && forceMissingTables.length === 0
    && tablesWithoutPolicies.length === 0
    && tablesWithoutTenantPredicate.length === 0
    ? 'pass'
    : 'fail'

  return {
    status,
    tableCount: rows.length,
    disabledTables,
    forceMissingTables,
    tablesWithoutPolicies,
    tablesWithoutTenantPredicate,
    ...(status === 'pass'
      ? {}
      : { reason: 'Expected every target public table to have RLS enabled, FORCE RLS, at least one policy, and an obvious tenant predicate.' }),
  }
}

function evaluateCurrentRoleBypass(row: CurrentRoleBypassRow | null): CurrentRoleBypassDiagnosticCheck {
  const currentRole = normalizeText(row?.rolname) || null
  const bypassRole = row?.rolbypassrls ? currentRole : null
  const status: DiagnosticStatus = currentRole && !bypassRole ? 'pass' : 'fail'

  return {
    status,
    currentRole,
    bypassRole,
    ...(status === 'pass'
      ? {}
      : { reason: 'Expected the current backend database role to exist and not have rolbypassrls.' }),
  }
}

function evaluateExecuteSqlPrivileges(rows: ExecuteSqlPrivilegeRow[]): ExecuteSqlPrivilegeDiagnosticCheck {
  const executableByUntrustedRoles = rows
    .filter((row) => row.public_can_execute || row.anon_can_execute || row.authenticated_can_execute)
    .map((row) => `${row.schema_name}.${row.function_name}`)
  const status: DiagnosticStatus = executableByUntrustedRoles.length === 0 ? 'pass' : 'fail'

  return {
    status,
    functionCount: rows.length,
    executableByUntrustedRoles,
    anonPocRequired: true,
    anonPocRequiredReason: 'Catalog ACL checks do not replace the required anon-key PoC for C-18.L04.',
    ...(status === 'pass'
      ? {}
      : { reason: 'Expected execute_sql to be absent or revoked from PUBLIC, anon, and authenticated.' }),
  }
}

async function defaultCatalogReader(): Promise<RlsProaclCatalogReader> {
  const database = await import('../database.js')
  return {
    async readRlsPolicyRows(tables: string[]) {
      const result = await database.query(
        `
        with table_status as (
          select
            c.relname as tablename,
            c.relrowsecurity as rowsecurity,
            c.relforcerowsecurity as force_rowsecurity
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relkind = 'r'
            and ($1::text[] is null or c.relname = any($1::text[]))
        ),
        policies as (
          select
            tablename,
            count(*)::int as policy_count,
            string_agg(
              coalesce(qual, '') || ' ' || coalesce(with_check, ''),
              E'\n'
              order by policyname
            ) as policy_definition
          from pg_policies
          where schemaname = 'public'
            and ($1::text[] is null or tablename = any($1::text[]))
          group by tablename
        )
        select
          t.tablename,
          t.rowsecurity,
          t.force_rowsecurity,
          coalesce(p.policy_count, 0) as policy_count,
          coalesce(p.policy_definition, '') as policy_definition
        from table_status t
        left join policies p on p.tablename = t.tablename
        order by t.tablename
        `,
        [tables.length > 0 ? tables : null],
      )
      return result.rows as RlsPolicyAuditRow[]
    },
    async readCurrentRoleBypass() {
      const result = await database.query(
        `
        select rolname, rolbypassrls
        from pg_roles
        where rolname = current_user
        limit 1
        `,
      )
      return (result.rows[0] ?? null) as CurrentRoleBypassRow | null
    },
    async readExecuteSqlPrivileges() {
      const result = await database.query(
        `
        with funcs as (
          select
            p.oid,
            p.proowner,
            p.proacl,
            n.nspname as schema_name,
            p.proname as function_name
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'execute_sql'
        )
        select
          f.schema_name,
          f.function_name,
          bool_or(a.privilege_type = 'EXECUTE' and a.grantee = 0::oid) as public_can_execute,
          coalesce(bool_or(a.privilege_type = 'EXECUTE' and a.grantee = to_regrole('anon')::oid), false) as anon_can_execute,
          coalesce(bool_or(a.privilege_type = 'EXECUTE' and a.grantee = to_regrole('authenticated')::oid), false) as authenticated_can_execute,
          f.proacl::text as proacl
        from funcs f
        left join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a on true
        group by f.schema_name, f.function_name, f.proacl
        order by f.schema_name, f.function_name
        `,
      )
      return result.rows as ExecuteSqlPrivilegeRow[]
    },
  }
}

export async function buildRlsProaclLiveDiagnosticReport(
  options: RlsProaclLiveDiagnosticOptions = {},
): Promise<RlsProaclLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const allowLive = options.allowLive === true
  const outputFile = normalizeOutputFile(options.outputFile)
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs)
  const tables = normalizeTables(options.tables)
  const base = {
    reportCode: 'c18_l01_l04_rls_proacl_live_diagnostic' as const,
    evidenceKind: 'live_postgres_rls_policy_role_rpc_probe' as const,
    generatedAt: now.toISOString(),
    diagnosticRunId,
    evidenceRef: outputFile,
    outputFile,
    missingArchivedJson: !outputFile,
    liveEvidenceRequired: true as const,
    liveEvidenceRequiredReason: 'C-18.L01-L04 require live/staging PostgreSQL catalog evidence for RLS, policies, backend role bypass, and execute_sql ACLs; anon-key PoC remains a separate required artifact.',
    allowLive,
    timeoutMs,
    tables,
  }

  if (!allowLive) {
    const reason = 'Pass --allow-live to run read-only PostgreSQL catalog checks against the intended live/staging database.'
    return {
      ...base,
      status: 'blocked',
      checks: {
        publicRls: blockedPublicRlsCheck(reason),
        currentRoleBypass: blockedCurrentRoleCheck(reason),
        executeSqlPrivileges: blockedExecuteSqlCheck(reason),
      },
    }
  }

  const reader = options.reader ?? await defaultCatalogReader()
  const [rlsRowsResult, roleRowResult, executeSqlRowsResult] = await Promise.allSettled([
    withTimeout(reader.readRlsPolicyRows(tables), 'public RLS catalog check', timeoutMs),
    withTimeout(reader.readCurrentRoleBypass(), 'current role bypass check', timeoutMs),
    withTimeout(reader.readExecuteSqlPrivileges(), 'execute_sql privilege check', timeoutMs),
  ])
  const publicRls = rlsRowsResult.status === 'fulfilled'
    ? evaluatePublicRls(rlsRowsResult.value)
    : failedPublicRlsCheck(formatDiagnosticError(rlsRowsResult.reason))
  const currentRoleBypass = roleRowResult.status === 'fulfilled'
    ? evaluateCurrentRoleBypass(roleRowResult.value)
    : failedCurrentRoleCheck(formatDiagnosticError(roleRowResult.reason))
  const executeSqlPrivileges = executeSqlRowsResult.status === 'fulfilled'
    ? evaluateExecuteSqlPrivileges(executeSqlRowsResult.value)
    : failedExecuteSqlCheck(formatDiagnosticError(executeSqlRowsResult.reason))
  const checksStatus: DiagnosticStatus = [
    publicRls.status,
    currentRoleBypass.status,
    executeSqlPrivileges.status,
  ].every((item) => item === 'pass')
    ? 'pass'
    : 'fail'
  const status: DiagnosticStatus = checksStatus === 'pass' && outputFile ? 'pass' : 'fail'

  return {
    ...base,
    status,
    checks: {
      publicRls,
      currentRoleBypass,
      executeSqlPrivileges,
    },
  }
}

export function shouldFailRlsProaclLiveDiagnosticReport(
  report: RlsProaclLiveDiagnosticReport,
) {
  return report.status !== 'pass'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

export function parseRlsProaclLiveDiagnosticOptionsFromArgs(
  args: string[],
): Pick<RlsProaclLiveDiagnosticOptions, 'allowLive' | 'tables' | 'timeoutMs' | 'outputFile' | 'diagnosticRunId'> {
  const tablesArg = parseStringArg(args, 'tables')
  const timeoutArg = parseStringArg(args, 'timeout-ms')
  const parsed: Pick<RlsProaclLiveDiagnosticOptions, 'allowLive' | 'tables' | 'timeoutMs' | 'outputFile' | 'diagnosticRunId'> = {
    allowLive: args.includes('--allow-live'),
    tables: tablesArg
      ? tablesArg.split(',').map((item) => item.trim()).filter(Boolean)
      : undefined,
    outputFile: normalizeOutputFile(parseStringArg(args, 'output-file')) ?? undefined,
    diagnosticRunId: normalizeText(parseStringArg(args, 'diagnostic-run-id')) || undefined,
  }
  if (timeoutArg) {
    parsed.timeoutMs = normalizeTimeoutMs(timeoutArg)
  }
  return parsed
}

function writeReportIfRequested(report: RlsProaclLiveDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

export async function runRlsProaclLiveDiagnosticCli(
  options: RlsProaclLiveDiagnosticCliOptions = {},
) {
  const args = options.args ?? process.argv
  const write = options.write ?? console.log
  const writeError = options.writeError ?? console.error

  try {
    const report = await buildRlsProaclLiveDiagnosticReport({
      ...parseRlsProaclLiveDiagnosticOptionsFromArgs(args),
      ...(options.now ? { now: options.now } : {}),
      ...(options.reader ? { reader: options.reader } : {}),
    })
    writeReportIfRequested(report)
    write(JSON.stringify(report, null, 2))
    return shouldFailRlsProaclLiveDiagnosticReport(report) ? 1 : 0
  } catch (error) {
    writeError(error)
    return 1
  } finally {
    await options.closeDatabasePool?.()
  }
}

async function main() {
  const database = await import('../database.js')
  const exitCode = await runRlsProaclLiveDiagnosticCli({
    args: process.argv,
    write: console.log,
    writeError: console.error,
    closeDatabasePool: database.closeDatabasePool,
  })
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

if (process.argv[1]?.endsWith('diagnose-rls-proacl-live.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
