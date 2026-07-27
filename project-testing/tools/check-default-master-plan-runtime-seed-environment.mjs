#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')
const DEFAULT_PROFILE_REPORT = path.join(DEFAULT_REPORT_ROOT, 'default-master-plan-profile-samples.json')
const DEFAULT_RUNTIME_SEED_PREFLIGHT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-evidence-preflight.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-environment.json')
const DEFAULT_LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const DEFAULT_TCP_TIMEOUT_MS = 1200
const DEFAULT_ENV_FILES = [
  '.env.local',
  'server/.env',
  'server/.env.local',
  'deploy/env/staging.env',
  'deploy/env/server.production.env',
]

export function parseArgs(argv) {
  const args = {
    profileReport: DEFAULT_PROFILE_REPORT,
    runtimeSeedPreflight: DEFAULT_RUNTIME_SEED_PREFLIGHT,
    output: DEFAULT_OUTPUT,
    envFiles: [...DEFAULT_ENV_FILES],
    targetEnvFile: null,
    timeoutMs: DEFAULT_TCP_TIMEOUT_MS,
    skipTcp: false,
    failOnBlocker: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile-report') {
      args.profileReport = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--runtime-seed-preflight') {
      args.runtimeSeedPreflight = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--env-file') {
      const envFile = String(argv[index + 1] ?? '').trim()
      args.envFiles.push(envFile)
      args.targetEnvFile = envFile || null
      index += 1
      continue
    }
    if (arg === '--timeout-ms') {
      const parsed = Number(argv[index + 1])
      args.timeoutMs = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : args.timeoutMs
      index += 1
      continue
    }
    if (arg === '--skip-tcp') {
      args.skipTcp = true
      continue
    }
    if (arg === '--fail-on-blocker') {
      args.failOnBlocker = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/check-default-master-plan-runtime-seed-environment.mjs [--profile-report <json>] [--runtime-seed-preflight <json>] [--output <json>] [--env-file <path>] [--timeout-ms <ms>] [--skip-tcp] [--fail-on-blocker]')
      process.exit(0)
    }
  }

  args.envFiles = uniqueStrings(args.envFiles)
  return args
}

function uniqueStrings(items) {
  return [...new Set(items.map((item) => String(item ?? '').trim()).filter(Boolean))]
}

function text(value) {
  return String(value ?? '').trim()
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

export function parseEnvText(content) {
  const values = {}
  for (const rawLine of String(content ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

export function classifySupabaseTarget(supabaseUrl) {
  const raw = text(supabaseUrl)
  if (!raw) {
    return {
      present: false,
      targetClass: 'unknown',
      origin: null,
      host: null,
      port: null,
      protocol: null,
      supabaseProjectRef: null,
      targetFingerprint: null,
    }
  }

  try {
    const parsed = new URL(raw)
    const host = parsed.hostname
    const protocol = parsed.protocol.replace(':', '')
    const isLocal = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)
    const port = parsed.port
      ? Number(parsed.port)
      : isLocal
        ? 54321
        : protocol === 'https'
          ? 443
          : 80
    const supabaseProjectRef = /^([a-z0-9-]+)\.supabase\.co$/i.exec(host)?.[1] ?? null
    const targetFingerprint = createHash('sha256').update(JSON.stringify({
      targetClass: isLocal ? 'local_supabase' : 'remote_supabase',
      protocol,
      host: host.toLowerCase(),
      port,
      supabaseProjectRef,
    })).digest('hex')
    return {
      present: true,
      targetClass: isLocal ? 'local_supabase' : 'remote_supabase',
      origin: parsed.origin,
      host,
      port,
      protocol,
      supabaseProjectRef,
      targetFingerprint,
    }
  } catch {
    return {
      present: true,
      targetClass: 'unknown',
      origin: null,
      host: null,
      port: null,
      protocol: null,
      supabaseProjectRef: null,
      targetFingerprint: null,
    }
  }
}

export function summarizeEnvFileContent(filePath, content) {
  const values = parseEnvText(content)
  const supabaseTarget = classifySupabaseTarget(values.SUPABASE_URL)
  const redactsRemoteOrigin = supabaseTarget.targetClass === 'remote_supabase'
  return {
    path: repoRelative(path.resolve(filePath)),
    exists: true,
    byteLength: Buffer.byteLength(String(content ?? ''), 'utf8'),
    envFileSha256: createHash('sha256').update(String(content ?? '')).digest('hex'),
    hasSupabaseUrl: Boolean(text(values.SUPABASE_URL)),
    supabaseTargetClass: supabaseTarget.targetClass,
    supabaseUrlOrigin: redactsRemoteOrigin ? null : supabaseTarget.origin,
    supabaseUrlOriginRedacted: redactsRemoteOrigin,
    supabaseProjectRef: supabaseTarget.supabaseProjectRef,
    targetFingerprint: supabaseTarget.targetFingerprint,
    hasSupabaseAnonKey: Boolean(text(values.SUPABASE_ANON_KEY)),
    hasSupabaseServiceKey: Boolean(text(values.SUPABASE_SERVICE_KEY)),
    hasSupabaseServiceRoleKey: Boolean(text(values.SUPABASE_SERVICE_ROLE_KEY)),
    hasRemoteSeedSmokeUnlock: text(values.WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT) === '1',
  }
}

async function summarizeEnvFile(filePath) {
  const absolutePath = path.resolve(REPO_ROOT, filePath)
  try {
    const content = await fs.readFile(absolutePath, 'utf8')
    return summarizeEnvFileContent(absolutePath, content)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        path: repoRelative(absolutePath),
        exists: false,
      }
    }
    return {
      path: repoRelative(absolutePath),
      exists: false,
      error: error?.message ? String(error.message) : String(error),
    }
  }
}

export async function loadRuntimeSeedTargetEnv({ targetEnvFile = null, baseEnv = process.env } = {}) {
  if (!targetEnvFile) {
    return {
      source: 'process_env',
      env: { ...baseEnv },
      summary: null,
      readError: null,
    }
  }

  const absolutePath = path.resolve(REPO_ROOT, targetEnvFile)
  try {
    const content = await fs.readFile(absolutePath, 'utf8')
    const values = parseEnvText(content)
    return {
      source: 'explicit_env_file',
      env: {
        ...baseEnv,
        ...values,
        SUPABASE_URL: text(values.SUPABASE_URL),
      },
      summary: summarizeEnvFileContent(absolutePath, content),
      readError: null,
    }
  } catch (error) {
    return {
      source: 'explicit_env_file_unreadable',
      env: {
        ...baseEnv,
        SUPABASE_URL: '',
      },
      summary: {
        path: repoRelative(absolutePath),
        exists: false,
      },
      readError: text(error?.code || error?.message || error),
    }
  }
}

function executableLookupCommand() {
  return process.platform === 'win32'
    ? { command: 'where.exe', args: [] }
    : { command: 'which', args: [] }
}

export async function checkExecutable(name) {
  const lookup = executableLookupCommand()
  return new Promise((resolve) => {
    const child = spawn(lookup.command, [...lookup.args, name], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      resolve({
        name,
        available: false,
        paths: [],
        error: error.message,
      })
    })
    child.on('close', (code) => {
      const paths = stdout.split(/\r?\n/).map(text).filter(Boolean)
      resolve({
        name,
        available: code === 0 && paths.length > 0,
        paths,
        error: code === 0 ? null : text(stderr) || `${lookup.command} exited ${code}`,
      })
    })
  })
}

export async function checkTcpEndpoint({ host, port, timeoutMs = DEFAULT_TCP_TIMEOUT_MS }) {
  if (!host || !port) {
    return {
      checked: false,
      reachable: false,
      host: host || null,
      port: port || null,
      errorCode: 'TCP_TARGET_MISSING',
      errorMessage: 'TCP target host or port is missing',
      timeoutMs,
    }
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    let resolved = false
    const finish = (result) => {
      if (resolved) return
      resolved = true
      socket.destroy()
      resolve({
        checked: true,
        host,
        port,
        timeoutMs,
        ...result,
      })
    }
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => finish({ reachable: true, errorCode: null, errorMessage: null }))
    socket.on('timeout', () => finish({ reachable: false, errorCode: 'ETIMEDOUT', errorMessage: `TCP check timed out after ${timeoutMs}ms` }))
    socket.on('error', (error) => finish({
      reachable: false,
      errorCode: text(error?.code) || 'TCP_ERROR',
      errorMessage: error?.message ? String(error.message) : String(error),
    }))
  })
}

function summarizeProfileReport(profileReport) {
  const record = readRecord(profileReport)
  const businessTypes = readArray(record.businessTypes)
  return {
    source: text(record.source) || null,
    businessTypeCount: businessTypes.length,
    productionReady: record.productionReady === true,
    failedBusinessTypeCount: readArray(record.failedBusinessTypes).length,
    blockers: uniqueStrings(readArray(record.blockers)),
  }
}

function summarizeRuntimeSeedPreflight(preflight) {
  const record = readRecord(preflight)
  const runtimeSeedEvidence = readRecord(record.runtimeSeedEvidence)
  const seedSmokeImport = readRecord(record.seedSmokeImport)
  return {
    status: text(record.status) || 'missing',
    blockers: uniqueStrings(readArray(record.blockers)),
    readyBusinessTypeCount: Number(runtimeSeedEvidence.readyBusinessTypeCount ?? 0),
    missingBusinessTypeCount: Number(runtimeSeedEvidence.missingBusinessTypeCount ?? 0),
    requiredRuntimeSeedStableCodeCount: readArray(runtimeSeedEvidence.requiredRuntimeSeedStableCodes).length,
    requiredRuntimeSeedStableCodes: readArray(runtimeSeedEvidence.requiredRuntimeSeedStableCodes).map(text).filter(Boolean),
    seedSmokeImport: {
      status: text(seedSmokeImport.status) || 'missing',
      mode: text(seedSmokeImport.mode) || 'missing',
      targetClass: text(seedSmokeImport.targetClass) || 'unknown',
      blockedReason: text(seedSmokeImport.blockedReason) || null,
      blockers: uniqueStrings(readArray(seedSmokeImport.blockers)),
    },
  }
}

function normalizeToolChecks(toolChecks) {
  const checks = readArray(toolChecks)
  const byName = new Map(checks.map((item) => [text(item.name), readRecord(item)]))
  return {
    supabase: {
      name: 'supabase',
      available: byName.get('supabase')?.available === true,
      paths: readArray(byName.get('supabase')?.paths).map(text).filter(Boolean),
      error: text(byName.get('supabase')?.error) || null,
    },
    docker: {
      name: 'docker',
      available: byName.get('docker')?.available === true,
      paths: readArray(byName.get('docker')?.paths).map(text).filter(Boolean),
      error: text(byName.get('docker')?.error) || null,
    },
  }
}

function repairStep({
  id,
  status,
  blockerCodes = [],
  title,
  commands = [],
  verificationCommands = [],
  notes = [],
}) {
  return {
    id,
    status,
    blockerCodes: uniqueStrings(blockerCodes),
    title,
    commands: uniqueStrings(commands),
    verificationCommands: uniqueStrings(verificationCommands),
    notes: uniqueStrings(notes),
  }
}

function buildRuntimeSeedEnvironmentRepairPlan({
  target,
  tools,
  localTcp,
  environmentBlockers,
  upstreamEvidenceBlockers,
  manualActions,
}) {
  const targetClass = text(target.targetClass) || 'unknown'
  const blockers = uniqueStrings(environmentBlockers)
  const upstreamBlockers = uniqueStrings(upstreamEvidenceBlockers)
  const localEndpointReachable = localTcp.reachable === true
  const steps = []

  if (targetClass === 'unknown') {
    steps.push(repairStep({
      id: 'provide_supabase_url',
      status: 'required',
      blockerCodes: ['supabase_url_required_for_runtime_seed_evidence'],
      title: 'Provide a classified Supabase target before runtime seed evidence can continue.',
      verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-env'],
    }))
  }

  if (targetClass === 'local_supabase') {
    steps.push(repairStep({
      id: 'install_or_start_docker',
      status: tools.docker.available ? 'satisfied' : localEndpointReachable ? 'optional' : 'required',
      blockerCodes: tools.docker.available ? [] : ['docker_cli_missing_for_local_supabase'],
      title: 'Docker must be available before local Supabase can be started or repaired.',
      commands: ['docker version'],
      verificationCommands: ['docker version'],
      notes: ['Install or start Docker Desktop outside this script if this command is unavailable.'],
    }))
    steps.push(repairStep({
      id: 'install_supabase_cli',
      status: tools.supabase.available ? 'satisfied' : localEndpointReachable ? 'optional' : 'required',
      blockerCodes: tools.supabase.available ? [] : ['supabase_cli_missing_for_local_seed_setup'],
      title: 'Supabase CLI must be available before local Supabase can be started or inspected.',
      commands: ['supabase --version'],
      verificationCommands: ['supabase --version'],
      notes: ['Install Supabase CLI outside this script; do not commit tokens or local secrets.'],
    }))
    steps.push(repairStep({
      id: 'start_local_supabase',
      status: localEndpointReachable ? 'satisfied' : 'required',
      blockerCodes: localEndpointReachable ? [] : ['local_supabase_endpoint_unreachable', 'local_supabase_must_be_reachable_before_seed_import'],
      title: 'Start local Supabase and make 127.0.0.1:54321 reachable.',
      commands: ['supabase status', 'supabase start'],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-env'],
      notes: ['This is local-only setup evidence; it is not production runtime evidence.'],
    }))
    steps.push(repairStep({
      id: 'rerun_runtime_seed_pipeline',
      status: blockers.length === 0 ? 'ready' : 'blocked_by_previous_steps',
      blockerCodes: blockers,
      title: 'Rerun runtime seed evidence pipeline after the local environment is reachable.',
      commands: ['npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'],
    }))
    steps.push(repairStep({
      id: 'unlock_local_seed_import_after_review',
      status: blockers.length === 0 ? 'manual_review_required' : 'deferred_until_environment_ready',
      blockerCodes: ['local_duration_asset_seed_import_unlock_required'],
      title: 'Only after reviewing runtime-seed-import-gate.json, unlock the local duration-asset seed smoke import and attach an auditable operator id.',
      commands: [
        '$env:WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT="1"',
        'npm.cmd run evidence:default-master-plan:runtime-seed-import-execution -- --allow-import --seed-smoke-user-id <auditable-operator-id>',
      ],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-post-import'],
      notes: ['This remains a local seed smoke import path; it must not be treated as production seed publication.'],
    }))
  }

  if (targetClass === 'remote_supabase') {
    steps.push(repairStep({
      id: 'remote_operator_authorization',
      status: 'manual_review_required',
      blockerCodes: ['remote_runtime_seed_target_requires_operator_authorization'],
      title: 'Remote runtime seed targets require explicit operator authorization and a separate approval reference.',
      commands: ['npm.cmd run evidence:default-master-plan:runtime-seed-import-gate -- --operator-approval-ref <approval-ref>'],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-import-gate'],
      notes: ['Remote seed import must stay behind dual unlock flags and approval; do not infer approval from env files.'],
    }))
  }

  const requiredStepIds = steps
    .filter((step) => ['required', 'manual_review_required'].includes(step.status))
    .map((step) => step.id)
  const blockedStepIds = steps
    .filter((step) => step.status === 'blocked_by_previous_steps')
    .map((step) => step.id)

  return {
    status: blockers.length > 0
      ? 'blocked'
      : targetClass === 'remote_supabase'
        ? 'manual_authorization_required'
        : 'ready_for_runtime_seed_pipeline',
    targetClass,
    noAutoInstall: true,
    requiredStepIds,
    blockedStepIds,
    upstreamEvidenceBlockers: upstreamBlockers,
    manualActions: uniqueStrings(manualActions),
    orderedSteps: steps,
    mutationBoundary: {
      readsLocalEnvironmentOnly: true,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
}

function resolveRuntimeSeedTarget({ env, preflightSummary, envSource = 'process_env' }) {
  const envTarget = classifySupabaseTarget(env?.SUPABASE_URL)
  if (envTarget.present && envTarget.targetClass !== 'unknown') {
    return {
      ...envTarget,
      source: envSource,
    }
  }

  const preflightTargetClass = text(preflightSummary.seedSmokeImport.targetClass)
  if (preflightTargetClass === 'local_supabase') {
    return {
      ...classifySupabaseTarget(DEFAULT_LOCAL_SUPABASE_URL),
      source: 'profile_report_default_local_supabase',
    }
  }

  return {
    ...envTarget,
    targetClass: preflightTargetClass || envTarget.targetClass,
    source: envTarget.present ? 'process_env_unclassified' : 'missing',
  }
}

export function buildRuntimeSeedEnvironmentReport({
  profileReport = {},
  runtimeSeedPreflight = {},
  profileReportPath = null,
  runtimeSeedPreflightPath = null,
  profileReportSha256 = null,
  runtimeSeedPreflightSha256 = null,
  env = {},
  envSource = 'process_env',
  targetEnvSummary = null,
  envFileSummaries = [],
  toolChecks = [],
  tcpCheck = null,
  generatedAt = new Date().toISOString(),
}) {
  const profileSummary = summarizeProfileReport(profileReport)
  const preflightSummary = summarizeRuntimeSeedPreflight(runtimeSeedPreflight)
  const target = resolveRuntimeSeedTarget({ env, preflightSummary, envSource })
  const tools = normalizeToolChecks(toolChecks)
  const localTcp = readRecord(tcpCheck)
  const environmentBlockers = []
  const manualActions = []

  if (!target.present && target.source === 'missing' && target.targetClass === 'unknown') {
    environmentBlockers.push('supabase_url_required_for_runtime_seed_evidence')
  }

  if (target.targetClass === 'local_supabase') {
    if (localTcp.checked && localTcp.reachable !== true) {
      environmentBlockers.push('local_supabase_endpoint_unreachable')
      if (!tools.supabase.available) environmentBlockers.push('supabase_cli_missing_for_local_seed_setup')
      if (!tools.docker.available) environmentBlockers.push('docker_cli_missing_for_local_supabase')
    }
    if (!localTcp.checked) {
      environmentBlockers.push('local_supabase_tcp_check_required')
      manualActions.push('run_local_supabase_tcp_check')
    }
  }

  if (target.targetClass === 'remote_supabase') {
    manualActions.push('remote_runtime_seed_target_requires_operator_authorization')
    if (String(env.WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT ?? '').trim() !== '1') {
      manualActions.push('remote_standard_duration_seed_smoke_unlock_not_set')
    }
  }

  const status = environmentBlockers.length > 0
    ? 'blocked'
    : target.targetClass === 'remote_supabase'
      ? 'manual_authorization_required'
      : 'ready_for_runtime_seed_preflight_or_import'
  const upstreamEvidenceBlockers = uniqueStrings([
    ...profileSummary.blockers,
    ...preflightSummary.blockers,
    ...preflightSummary.seedSmokeImport.blockers,
  ])

  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-environment/v1',
    source: 'check-default-master-plan-runtime-seed-environment',
    generatedAt,
    status,
    profileReport: {
      path: profileReportPath ? repoRelative(profileReportPath) : null,
      sha256: profileReportSha256 || null,
      ...profileSummary,
    },
    runtimeSeedPreflight: {
      path: runtimeSeedPreflightPath ? repoRelative(runtimeSeedPreflightPath) : null,
      sha256: runtimeSeedPreflightSha256 || null,
      ...preflightSummary,
    },
    currentRuntimeTarget: {
      source: target.source,
      targetClass: target.targetClass,
      supabaseUrlPresent: target.present,
      supabaseUrlOrigin: target.targetClass === 'remote_supabase' ? null : target.origin,
      supabaseUrlOriginRedacted: target.targetClass === 'remote_supabase',
      host: target.host,
      port: target.port,
      protocol: target.protocol,
      supabaseProjectRef: target.supabaseProjectRef,
      targetFingerprint: target.targetFingerprint,
      envFileRef: text(targetEnvSummary?.path) || null,
      envFileSha256: text(targetEnvSummary?.envFileSha256) || null,
    },
    localSupabaseTcp: {
      checked: localTcp.checked === true,
      reachable: localTcp.reachable === true,
      host: localTcp.host ?? target.host ?? null,
      port: localTcp.port ?? target.port ?? null,
      timeoutMs: localTcp.timeoutMs ?? null,
      errorCode: text(localTcp.errorCode) || null,
      errorMessage: text(localTcp.errorMessage) || null,
    },
    localTooling: tools,
    envFiles: envFileSummaries,
    environmentBlockers: uniqueStrings(environmentBlockers),
    upstreamEvidenceBlockers,
    manualActions: uniqueStrings(manualActions),
    repairPlan: buildRuntimeSeedEnvironmentRepairPlan({
      target,
      tools,
      localTcp,
      environmentBlockers,
      upstreamEvidenceBlockers,
      manualActions,
    }),
    nextActions: {
      whenLocalEndpointUnreachable: [
        'start local Supabase at 127.0.0.1:54321, or install Docker Desktop and Supabase CLI before local seed import',
        'rerun npm.cmd run evidence:default-master-plan:runtime-seed-env',
      ],
      whenEnvironmentReady: [
        'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --preflight-standard-duration-seed-smoke',
        'npm.cmd run evidence:default-master-plan:runtime-seed-preflight',
      ],
      importStillRequiresExplicitUnlock: [
        'WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT=1 for local import',
        'WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT=1 plus operator approval for remote target',
      ],
    },
    productionReady: false,
    mutationBoundary: {
      readsProfileReport: true,
      readsRuntimeSeedPreflightReport: true,
      readsEnvFilesWithoutWritingSecrets: true,
      performsTcpConnectivityCheckOnly: true,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
    },
  }
}

async function sha256FileIfExists(filePath) {
  try {
    const content = await fs.readFile(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return null
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return {}
  }
}

async function buildReportFromFiles(args) {
  const profileReport = await readJsonIfExists(args.profileReport)
  const runtimeSeedPreflight = await readJsonIfExists(args.runtimeSeedPreflight)
  const selectedTargetEnv = await loadRuntimeSeedTargetEnv({
    targetEnvFile: args.targetEnvFile,
    baseEnv: process.env,
  })
  const preflightSummary = summarizeRuntimeSeedPreflight(runtimeSeedPreflight)
  const target = resolveRuntimeSeedTarget({
    env: selectedTargetEnv.env,
    preflightSummary,
    envSource: selectedTargetEnv.source,
  })
  const tcpCheck = args.skipTcp || target.targetClass !== 'local_supabase'
    ? {
        checked: false,
        reachable: false,
        host: target.host,
        port: target.port,
        timeoutMs: args.timeoutMs,
        errorCode: args.skipTcp ? 'TCP_CHECK_SKIPPED' : null,
        errorMessage: args.skipTcp ? 'TCP check skipped by CLI flag' : null,
      }
    : await checkTcpEndpoint({
        host: target.host,
        port: target.port,
        timeoutMs: args.timeoutMs,
      })
  const [supabaseTool, dockerTool] = await Promise.all([
    checkExecutable('supabase'),
    checkExecutable('docker'),
  ])
  const envFileSummaries = await Promise.all(args.envFiles.map(summarizeEnvFile))
  return buildRuntimeSeedEnvironmentReport({
    profileReport,
    runtimeSeedPreflight,
    profileReportPath: args.profileReport,
    runtimeSeedPreflightPath: args.runtimeSeedPreflight,
    profileReportSha256: await sha256FileIfExists(args.profileReport),
    runtimeSeedPreflightSha256: await sha256FileIfExists(args.runtimeSeedPreflight),
    env: selectedTargetEnv.env,
    envSource: selectedTargetEnv.source,
    targetEnvSummary: selectedTargetEnv.summary,
    envFileSummaries,
    toolChecks: [supabaseTool, dockerTool],
    tcpCheck,
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = await buildReportFromFiles(args)
  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    output: repoRelative(args.output),
    targetClass: report.currentRuntimeTarget.targetClass,
    localSupabaseReachable: report.localSupabaseTcp.reachable,
    environmentBlockers: report.environmentBlockers,
    upstreamEvidenceBlockers: report.upstreamEvidenceBlockers,
    productionReady: false,
  }, null, 2))
  if (args.failOnBlocker && report.environmentBlockers.length > 0) process.exitCode = 1
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
