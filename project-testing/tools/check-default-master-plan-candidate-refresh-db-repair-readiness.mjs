#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_EXECUTION = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-execution.json')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'deploy', 'env', 'staging.env')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-db-repair-readiness.json')
const DEFAULT_MARKDOWN = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-db-repair-readiness.md')

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    execution: DEFAULT_EXECUTION,
    envFile: DEFAULT_ENV_FILE,
    output: DEFAULT_OUTPUT,
    markdown: DEFAULT_MARKDOWN,
    json: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }

    if (arg === '--execution') args.execution = path.resolve(nextValue())
    else if (arg === '--env-file') args.envFile = path.resolve(nextValue())
    else if (arg === '--output') args.output = path.resolve(nextValue())
    else if (arg === '--markdown') args.markdown = path.resolve(nextValue())
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

export async function checkDefaultMasterPlanCandidateRefreshDbRepairReadiness({
  argv = process.argv.slice(2),
  now = new Date(),
} = {}) {
  const args = parseArgs(argv)
  if (args.help) {
    return {
      status: 'help',
      productionReady: false,
      help: renderHelp(),
    }
  }

  const execution = await readJson(args.execution)
  const currentTarget = await summarizeEnvTarget(args.envFile)
  const failedTarget = normalizeTargetSummary(execution.target)
  const executionStatus = text(execution.status)
  const failureClass = text(execution.failureClass ?? execution.failure_class)
  const errorCode = text(execution.errorCode ?? execution.error_code)
  const executionBlockers = arrayOfStrings(execution.blockers)
  const authenticationFailure = failureClass === 'authentication_failed'
    || errorCode === '28P01'
    || executionBlockers.includes('candidate_refresh_db_connection_failed')
  const executionFailed = executionStatus === 'candidate_refresh_execution_failed'
    || executionBlockers.includes('candidate_refresh_db_execution_failed')
  const currentEnvChangedSinceFailedExecution = Boolean(currentTarget.envFileSha256)
    && Boolean(failedTarget.envFileSha256)
    && currentTarget.envFileSha256 !== failedTarget.envFileSha256
  const connectionCredentialChangedSinceFailedExecution = Boolean(currentTarget.connectionCredentialSha256)
    && Boolean(failedTarget.connectionCredentialSha256)
    && currentTarget.connectionCredentialSha256 !== failedTarget.connectionCredentialSha256
  const sameSupabaseProjectRef = Boolean(currentTarget.supabaseProjectRef)
    && Boolean(failedTarget.supabaseProjectRef)
    && currentTarget.supabaseProjectRef === failedTarget.supabaseProjectRef
  const sameDatabaseHost = Boolean(currentTarget.databaseHost)
    && Boolean(failedTarget.databaseHost)
    && currentTarget.databaseHost === failedTarget.databaseHost
  const sameDatabaseTarget = Boolean(currentTarget.targetFingerprint)
    && Boolean(failedTarget.targetFingerprint)
    && currentTarget.targetFingerprint === failedTarget.targetFingerprint
  const currentTargetUsable = currentTarget.envFileReadable
    && Boolean(currentTarget.connectionSource)
    && Boolean(currentTarget.databaseHost)
    && Boolean(currentTarget.databaseUser)
    && currentTarget.hasPassword
    && !currentTarget.parseError

  const blockers = unique([
    executionFailed ? null : 'candidate_refresh_execution_failed_report_required',
    authenticationFailure ? null : 'candidate_refresh_authentication_failure_required_for_db_repair_preflight',
    currentTargetUsable ? null : 'candidate_refresh_current_env_target_unusable',
    connectionCredentialChangedSinceFailedExecution ? null : 'candidate_refresh_db_credentials_unchanged_since_authentication_failure',
    connectionCredentialChangedSinceFailedExecution && !sameDatabaseTarget
      ? 'candidate_refresh_target_identity_changed_reconfirm_discovery_before_rerun'
      : null,
  ])

  const mayRerunCandidateRefreshExecution = blockers.length === 0
  const status = mayRerunCandidateRefreshExecution
    ? 'ready_for_candidate_refresh_rerun'
    : connectionCredentialChangedSinceFailedExecution && !sameDatabaseTarget
      ? 'target_reconfirmation_required'
      : 'blocked'

  const report = {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-db-repair-readiness/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-candidate-refresh-db-repair-readiness',
    status,
    productionReady: false,
    execution: args.execution,
    envFile: repoRelative(args.envFile),
    baselineId: text(execution.baselineId ?? execution.baseline_id),
    projectId: text(execution.projectId ?? execution.project_id),
    businessType: text(execution.businessType ?? execution.business_type),
    environment: text(execution.executionControl?.environment ?? execution.environment),
    executionStatus,
    failureClass,
    errorCode,
    failedTarget,
    currentTarget,
    summary: {
      authenticationFailure,
      executionFailed,
      currentTargetUsable,
      currentEnvChangedSinceFailedExecution,
      connectionCredentialChangedSinceFailedExecution,
      sameSupabaseProjectRef,
      sameDatabaseHost,
      sameDatabaseTarget,
      mayRerunCandidateRefreshExecution,
    },
    blockers,
    nextCommands: {
      confirmTargetIdentity: 'npm.cmd run evidence:default-master-plan:candidate-hygiene',
      rerunCandidateRefreshPreflight: 'npm.cmd run evidence:default-master-plan:candidate-refresh-preflight',
      rerunCandidateRefreshExecution: 'npm.cmd run evidence:default-master-plan:candidate-refresh-execution',
      refreshOperatorHandoff: 'npm.cmd run evidence:default-master-plan:operator-handoff',
      refreshOperatorHandoffPreflight: 'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
      refreshRealEvidenceGaps: 'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
    },
    evidenceBoundary: {
      evidenceTier: 'candidate_refresh_db_repair_preflight_only',
      canCloseProductionReadinessGates: false,
      nonClosingEvidenceBoundary: [
        'This preflight compares the failed execution target with the current connection credential hash and canonical database target fingerprint.',
        'It does not connect to the database, verify credentials, rerun candidate refresh, write task_baseline_items, import seeds, publish runtime, run smoke, perform rollback, or close production readiness gates.',
      ],
    },
    mutationBoundary: {
      readsCandidateRefreshExecutionReport: true,
      readsEnvFileFingerprint: true,
      doesNotConnectDatabase: true,
      commandsExecuted: 0,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTaskBaselineItems: false,
      writesCandidateBaselines: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
    jsonOutput: args.output,
    markdownOutput: args.markdown,
  }

  await mkdir(path.dirname(args.output), { recursive: true })
  await mkdir(path.dirname(args.markdown), { recursive: true })
  await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(args.markdown, renderMarkdown(report), 'utf8')
  return report
}

async function summarizeEnvTarget(envFile) {
  const envFilePath = path.resolve(envFile)
  const target = {
    envFileRef: repoRelative(envFilePath),
    envFileReadable: false,
    envFileSha256: null,
    connectionSource: null,
    connectionCredentialSha256: null,
    databaseHost: null,
    databasePort: null,
    databaseName: null,
    databaseUser: null,
    supabaseProjectRef: null,
    targetFingerprint: null,
    hasPassword: false,
    sslmode: null,
    parseError: null,
  }

  let raw = ''
  try {
    raw = await readFile(envFilePath, 'utf8')
  } catch (error) {
    return {
      ...target,
      parseError: `env_file_unreadable:${text(error?.code || error?.message || error)}`,
    }
  }

  const parsed = parseEnv(raw)
  const connectionSource = ['SUPABASE_MIGRATION_URL', 'DB_CONNECTION_STRING', 'DATABASE_URL']
    .find((key) => text(parsed[key]))
  const baseTarget = {
    ...target,
    envFileReadable: true,
    envFileSha256: createHash('sha256').update(raw).digest('hex'),
    connectionSource: connectionSource || null,
    connectionCredentialSha256: connectionSource
      ? createHash('sha256').update(text(parsed[connectionSource])).digest('hex')
      : null,
    sslmode: text(parsed.PGSSLMODE) || null,
  }

  if (!connectionSource) {
    return {
      ...baseTarget,
      parseError: 'db_connection_string_missing',
    }
  }

  try {
    const url = new URL(text(parsed[connectionSource]))
    const identity = {
      ...baseTarget,
      databaseHost: url.hostname || null,
      databasePort: url.port || '5432',
      databaseName: url.pathname.replace(/^\//, '') || null,
      databaseUser: decodeURIComponent(url.username || '') || null,
      supabaseProjectRef: deriveSupabaseProjectRef(url),
      hasPassword: Boolean(url.password),
    }
    return {
      ...identity,
      targetFingerprint: createTargetFingerprint(identity),
    }
  } catch (error) {
    return {
      ...baseTarget,
      parseError: `connection_url_parse_failed:${text(error?.message || error)}`,
    }
  }
}

function createTargetFingerprint(target) {
  const identity = {
    supabaseProjectRef: text(target.supabaseProjectRef).toLowerCase(),
    databaseHost: text(target.databaseHost).toLowerCase(),
    databasePort: text(target.databasePort),
    databaseName: text(target.databaseName),
    databaseUser: text(target.databaseUser),
  }
  if (Object.values(identity).some((value) => !value)) return null
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex')
}

function normalizeTargetSummary(value) {
  const record = readRecord(value)
  const normalized = {
    envFileRef: text(record.envFileRef ?? record.env_file_ref) || null,
    envFileReadable: record.envFileReadable === true || record.env_file_readable === true,
    envFileSha256: text(record.envFileSha256 ?? record.env_file_sha256) || null,
    connectionCredentialSha256: text(record.connectionCredentialSha256 ?? record.connection_credential_sha256) || null,
    connectionSource: text(record.connectionSource ?? record.connection_source) || null,
    databaseHost: text(record.databaseHost ?? record.database_host) || null,
    databasePort: text(record.databasePort ?? record.database_port) || null,
    databaseName: text(record.databaseName ?? record.database_name) || null,
    databaseUser: text(record.databaseUser ?? record.database_user) || null,
    supabaseProjectRef: text(record.supabaseProjectRef ?? record.supabase_project_ref) || null,
    hasPassword: record.hasPassword === true || record.has_password === true,
    sslmode: text(record.sslmode) || null,
    parseError: text(record.parseError ?? record.parse_error) || null,
  }
  return {
    ...normalized,
    targetFingerprint: text(record.targetFingerprint ?? record.target_fingerprint) || createTargetFingerprint(normalized),
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Candidate Refresh DB Repair Readiness',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady ? 'yes' : 'no'}`,
    `- executionStatus: ${report.executionStatus || 'unknown'}`,
    `- failureClass: ${report.failureClass || 'unknown'}`,
    `- errorCode: ${report.errorCode || 'unknown'}`,
    `- failedEnvSha256: ${report.failedTarget.envFileSha256 || 'not available'}`,
    `- currentEnvSha256: ${report.currentTarget.envFileSha256 || 'not available'}`,
    `- currentEnvChangedSinceFailedExecution: ${report.summary.currentEnvChangedSinceFailedExecution ? 'yes' : 'no'}`,
    `- connectionCredentialChangedSinceFailedExecution: ${report.summary.connectionCredentialChangedSinceFailedExecution ? 'yes' : 'no'}`,
    `- sameSupabaseProjectRef: ${report.summary.sameSupabaseProjectRef ? 'yes' : 'no'}`,
    `- sameDatabaseHost: ${report.summary.sameDatabaseHost ? 'yes' : 'no'}`,
    `- mayRerunCandidateRefreshExecution: ${report.summary.mayRerunCandidateRefreshExecution ? 'yes' : 'no'}`,
    `- does_not_connect_database: ${report.mutationBoundary.doesNotConnectDatabase ? 'yes' : 'no'}`,
    '',
    '## Blockers',
    '',
    ...(report.blockers.length ? report.blockers.map((blocker) => `- ${blocker}`) : ['- none']),
    '',
    '## Next Commands',
    '',
    ...Object.entries(report.nextCommands).map(([key, command]) => `- ${key}: ${command}`),
    '',
    '## Evidence Boundary',
    '',
    `- evidenceTier: ${report.evidenceBoundary.evidenceTier}`,
    `- canCloseProductionReadinessGates: ${report.evidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`,
    ...report.evidenceBoundary.nonClosingEvidenceBoundary.map((boundary) => `- nonClosingEvidenceBoundary: ${boundary}`),
    '',
  ]
  return `${lines.join('\n')}\n`
}

function parseEnv(raw) {
  const result = {}
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

function deriveSupabaseProjectRef(url) {
  const host = String(url.hostname ?? '')
  const directHostMatch = host.match(/^db\.([^.]+)\.supabase\.co$/)
  if (directHostMatch?.[1]) return directHostMatch[1]
  return null
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : []
}

function text(value) {
  return String(value ?? '').trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(text).filter(Boolean))]
}

function repoRelative(filePath) {
  const absolute = path.resolve(filePath)
  const relative = path.relative(REPO_ROOT, absolute)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.replace(/\\/g, '/')
    : absolute
}

function renderHelp() {
  return [
    'Usage: node project-testing/tools/check-default-master-plan-candidate-refresh-db-repair-readiness.mjs [options]',
    '',
    'Options:',
    '  --execution <json>  candidate-refresh-execution.json',
    '  --env-file <file>   env file to fingerprint without exposing secrets',
    '  --output <json>     output JSON path',
    '  --markdown <md>     output Markdown path',
    '  --json              print JSON report',
    '  --help              show help',
  ].join('\n')
}

async function main() {
  const args = parseArgs()
  const result = await checkDefaultMasterPlanCandidateRefreshDbRepairReadiness()
  if (result.help) {
    console.log(result.help)
    return
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Default master-plan candidate refresh DB repair readiness: ${result.status}`)
    console.log(`JSON: ${result.jsonOutput}`)
    console.log(`Markdown: ${result.markdownOutput}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
