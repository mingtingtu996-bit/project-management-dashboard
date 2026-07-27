import { writeJsonFile } from './jsonEvidenceUtils.js'

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'
type DiagnosticSeverity = 'none' | 'major' | 'critical'

export type ExecuteSqlAnonPocCallRequest = {
  supabaseUrl: string
  anonKey: string
  probeSql: string
}

export type ExecuteSqlAnonPocCallResult = {
  success: boolean
  errorCode: string | null
  errorMessage?: string | null
  dataReturned: boolean
  rowCount: number | null
}

export type ExecuteSqlAnonPocCaller = (
  request: ExecuteSqlAnonPocCallRequest,
) => Promise<ExecuteSqlAnonPocCallResult>

export type ExecuteSqlAnonPocDiagnosticCheck = {
  status: DiagnosticStatus
  severity: DiagnosticSeverity
  denied: boolean
  success: boolean | null
  errorCode: string | null
  errorMessage: string | null
  dataReturned: boolean
  rowCount: number | null
  reason?: string
}

export type ExecuteSqlAnonPocLiveDiagnosticReport = {
  reportCode: 'c18_l04_execute_sql_anon_poc_live_diagnostic'
  evidenceKind: 'live_supabase_anon_execute_sql_rpc_probe'
  generatedAt: string
  diagnosticRunId: string
  evidenceRef: string | null
  outputFile: string | null
  missingArchivedJson: boolean
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  status: DiagnosticStatus
  allowLive: boolean
  supabaseUrl: string | null
  anonKeyProvided: boolean
  probeSql: string
  checks: {
    anonExecuteSqlPoc: ExecuteSqlAnonPocDiagnosticCheck
  }
}

export type ExecuteSqlAnonPocLiveDiagnosticOptions = {
  now?: Date
  diagnosticRunId?: string | null
  outputFile?: string | null
  allowLive?: boolean
  supabaseUrl?: string | null
  anonKey?: string | null
  probeSql?: string | null
  callExecuteSqlAsAnon?: ExecuteSqlAnonPocCaller
}

const DEFAULT_PROBE_SQL = 'select count(*)::int as leaked_row_count from public.companies'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function createDefaultDiagnosticRunId(now: Date) {
  return `c18-l04-anon-poc-${now.toISOString().replace(/[:.]/g, '-')}`
}

function normalizeOutputFile(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function redactUrl(value: string) {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}`
  } catch {
    return value ? '<invalid-url>' : null
  }
}

function blockedCheck(reason: string): ExecuteSqlAnonPocDiagnosticCheck {
  return {
    status: 'blocked',
    severity: 'none',
    denied: false,
    success: null,
    errorCode: null,
    errorMessage: null,
    dataReturned: false,
    rowCount: null,
    reason,
  }
}

function isExpectedExecuteSqlDenial(result: ExecuteSqlAnonPocCallResult) {
  if (result.success) return false
  const code = normalizeText(result.errorCode).toUpperCase()
  const message = normalizeText(result.errorMessage)
  return code === '42501'
    || code === '42883'
    || code === 'PGRST202'
    || /permission denied|not find the function|function .*execute_sql.* does not exist|could not find.*execute_sql/i.test(message)
}

function countRows(data: unknown): number | null {
  if (Array.isArray(data)) return data.length
  if (data && typeof data === 'object') {
    const rows = (data as { rows?: unknown }).rows
    if (Array.isArray(rows)) return rows.length
  }
  return data == null ? 0 : 1
}

async function defaultCallExecuteSqlAsAnon(
  request: ExecuteSqlAnonPocCallRequest,
): Promise<ExecuteSqlAnonPocCallResult> {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(request.supabaseUrl, request.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  const response = await client.rpc('execute_sql', {
    sql: request.probeSql,
    params: [],
  })
  const rowCount = countRows(response.data)

  return {
    success: !response.error,
    errorCode: normalizeText(response.error?.code) || null,
    errorMessage: normalizeText(response.error?.message) || null,
    dataReturned: !response.error && rowCount !== null && rowCount > 0,
    rowCount,
  }
}

function evaluateAnonPocResult(
  result: ExecuteSqlAnonPocCallResult,
): ExecuteSqlAnonPocDiagnosticCheck {
  const denied = isExpectedExecuteSqlDenial(result)
  if (denied) {
    return {
      status: 'pass',
      severity: 'none',
      denied: true,
      success: false,
      errorCode: normalizeText(result.errorCode) || null,
      errorMessage: normalizeText(result.errorMessage) || null,
      dataReturned: false,
      rowCount: result.rowCount,
    }
  }

  const severity: DiagnosticSeverity = result.success ? 'critical' : 'major'
  return {
    status: 'fail',
    severity,
    denied: false,
    success: result.success,
    errorCode: normalizeText(result.errorCode) || null,
    errorMessage: normalizeText(result.errorMessage) || null,
    dataReturned: result.dataReturned,
    rowCount: result.rowCount,
    reason: result.success
      ? 'The anon key executed public.execute_sql; this is a critical arbitrary SQL exposure until revoked/dropped and re-tested.'
      : 'The anon PoC did not prove execute_sql is absent or denied. Re-run with a valid anon key and archive the exact failure response.',
  }
}

export async function buildExecuteSqlAnonPocLiveDiagnosticReport(
  options: ExecuteSqlAnonPocLiveDiagnosticOptions = {},
): Promise<ExecuteSqlAnonPocLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const outputFile = normalizeOutputFile(options.outputFile)
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const allowLive = options.allowLive === true
  const supabaseUrl = normalizeText(options.supabaseUrl)
  const anonKey = normalizeText(options.anonKey)
  const probeSql = normalizeText(options.probeSql) || DEFAULT_PROBE_SQL
  const base = {
    reportCode: 'c18_l04_execute_sql_anon_poc_live_diagnostic' as const,
    evidenceKind: 'live_supabase_anon_execute_sql_rpc_probe' as const,
    generatedAt: now.toISOString(),
    diagnosticRunId,
    evidenceRef: outputFile,
    outputFile,
    missingArchivedJson: !outputFile,
    liveEvidenceRequired: true as const,
    liveEvidenceRequiredReason: 'C-18.L04 requires an archived live/staging anon-key PoC proving public.execute_sql is absent or denied, not only catalog ACL evidence.',
    allowLive,
    supabaseUrl: supabaseUrl ? redactUrl(supabaseUrl) : null,
    anonKeyProvided: Boolean(anonKey),
    probeSql,
  }

  if (!allowLive || !supabaseUrl || !anonKey) {
    const missing = [
      !allowLive ? '--allow-live' : null,
      !supabaseUrl ? '--supabase-url=<url>' : null,
      !anonKey ? '--anon-key=<anon-key>' : null,
    ].filter(Boolean).join(', ')
    return {
      ...base,
      status: 'blocked',
      checks: {
        anonExecuteSqlPoc: blockedCheck(`Missing ${missing}; anon execute_sql PoC is intentionally blocked.`),
      },
    }
  }

  let check: ExecuteSqlAnonPocDiagnosticCheck
  try {
    const callExecuteSqlAsAnon = options.callExecuteSqlAsAnon ?? defaultCallExecuteSqlAsAnon
    check = evaluateAnonPocResult(await callExecuteSqlAsAnon({
      supabaseUrl,
      anonKey,
      probeSql,
    }))
  } catch (error) {
    check = {
      status: 'fail',
      severity: 'major',
      denied: false,
      success: false,
      errorCode: 'REQUEST_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      dataReturned: false,
      rowCount: null,
      reason: 'The anon PoC request failed before proving execute_sql is absent or denied.',
    }
  }

  return {
    ...base,
    status: check.status === 'pass' && outputFile ? 'pass' : 'fail',
    checks: {
      anonExecuteSqlPoc: check,
    },
  }
}

export function shouldFailExecuteSqlAnonPocLiveDiagnosticReport(
  report: ExecuteSqlAnonPocLiveDiagnosticReport,
) {
  return report.status !== 'pass' || report.checks.anonExecuteSqlPoc.status !== 'pass'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

export function parseExecuteSqlAnonPocLiveDiagnosticOptionsFromArgs(
  args: string[],
): Pick<ExecuteSqlAnonPocLiveDiagnosticOptions, 'allowLive' | 'supabaseUrl' | 'anonKey' | 'probeSql' | 'outputFile' | 'diagnosticRunId'> {
  return {
    allowLive: args.includes('--allow-live'),
    supabaseUrl: parseStringArg(args, 'supabase-url') ?? process.env.SUPABASE_URL,
    anonKey: parseStringArg(args, 'anon-key') ?? process.env.SUPABASE_ANON_KEY,
    probeSql: parseStringArg(args, 'probe-sql'),
    outputFile: normalizeOutputFile(parseStringArg(args, 'output-file')) ?? undefined,
    diagnosticRunId: normalizeText(parseStringArg(args, 'diagnostic-run-id')) || undefined,
  }
}

function writeReportIfRequested(report: ExecuteSqlAnonPocLiveDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildExecuteSqlAnonPocLiveDiagnosticReport(
    parseExecuteSqlAnonPocLiveDiagnosticOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailExecuteSqlAnonPocLiveDiagnosticReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('diagnose-execute-sql-anon-poc-live.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
