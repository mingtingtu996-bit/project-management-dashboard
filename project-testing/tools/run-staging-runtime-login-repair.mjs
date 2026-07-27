#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = path.join(
  repoRoot,
  'project-testing',
  'reports',
  'release-v1.4.24-20260702-125254',
)

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: path.join(repoRoot, 'deploy', 'env', 'staging.env'),
    releaseDir: defaultReleaseDir,
    output: '',
    allowWrite: false,
    confirmStagingRuntimeLoginRepair: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }
    if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue())
    } else if (arg === '--release-dir') {
      options.releaseDir = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--allow-write') {
      options.allowWrite = true
    } else if (arg === '--confirm-staging-runtime-login-repair') {
      options.confirmStagingRuntimeLoginRepair = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!options.output) {
    options.output = path.join(options.releaseDir, 'runtime-login-role-repair-execution.json')
  }
  return options
}

function repoRel(filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replace(/\\/g, '/')
}

function loadEnvFile(filePath) {
  return import('node:fs').then(({ readFileSync }) => {
    const env = {}
    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const separator = trimmed.indexOf('=')
      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key) env[key] = value
    }
    return env
  })
}

function redactedEnvSummary(env) {
  const projectRef = (() => {
    try {
      const url = new URL(env.SUPABASE_URL || env.DB_CONNECTION_STRING || env.SUPABASE_MIGRATION_URL)
      if (url.hostname.endsWith('.supabase.co')) return url.hostname.split('.')[0] === 'db' ? url.hostname.split('.')[1] : url.hostname.split('.')[0]
      return null
    } catch {
      return null
    }
  })()
  return {
    projectRef,
    hasRuntimeConnection: Boolean(env.DB_CONNECTION_STRING || env.WORKBUDDY_RUNTIME_DATABASE_URL),
    hasMigrationConnection: Boolean(env.SUPABASE_MIGRATION_URL || env.DIRECT_DATABASE_URL || env.DATABASE_URL),
    hasRuntimePassword: Boolean(env.WORKBUDDY_RUNTIME_LOGIN_PASSWORD || env.RUNTIME_DATABASE_PASSWORD || env.DB_CONNECTION_STRING),
  }
}

function sanitizeText(value, limit = 240) {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://<redacted>')
    .replace(/(password authentication failed for user\s+"?)([^"\s]+)("?)/gi, '$1<redacted-user>$3')
    .replace(/(PGPASSWORD|SUPABASE_PASSWORD|DB_PASSWORD|WORKBUDDY_RUNTIME_LOGIN_PASSWORD|RUNTIME_DATABASE_PASSWORD)=\S+/gi, '$1=<redacted>')
    .slice(0, limit)
}

function parseJsonObject(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace < 0 || lastBrace <= firstBrace) return null
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
    } catch {
      return null
    }
  }
}

function runRuntimeLoginRepairCommand(env) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm'
  const args = process.platform === 'win32'
    ? ['/d', '/c', 'npm', 'run', 'repair:runtime-db-login-role', '--workspace=server']
    : ['run', 'repair:runtime-db-login-role', '--workspace=server']
  return spawnSync(command, args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function guardedBlockedReport(options, reasonCode, detail) {
  return {
    schemaVersion: 'workbuddy-v1424-runtime-login-repair-execution/v1',
    generatedAt: new Date().toISOString(),
    status: 'blocked',
    reasonCode,
    detail,
    allowWrite: options.allowWrite,
    confirmStagingRuntimeLoginRepair: options.confirmStagingRuntimeLoginRepair,
    envFile: repoRel(options.envFile),
    safeToShare: true,
    secretsPrinted: false,
    boundary: {
      environment: 'staging',
      dbMutation: false,
      liveMutation: false,
      writesApplicationData: false,
      writesRolePassword: false,
    },
  }
}

async function buildRuntimeLoginRepairExecution(options) {
  if (!options.allowWrite || !options.confirmStagingRuntimeLoginRepair) {
    return guardedBlockedReport(
      options,
      'explicit_staging_write_confirmation_required',
      'Pass --allow-write and --confirm-staging-runtime-login-repair to ALTER the staging runtime login role password.',
    )
  }

  const fileEnv = await loadEnvFile(options.envFile)
  const env = {
    ...process.env,
    ...fileEnv,
    DOTENV_CONFIG_PATH: options.envFile,
    SKIP_RUNTIME_LOGIN_VERIFY: '1',
  }
  const originalEnv = { ...process.env }
  Object.assign(process.env, env)
  try {
    const execution = runRuntimeLoginRepairCommand(env)
    const parsedStdout = parseJsonObject(execution.stdout)
    const parsedStderr = parseJsonObject(execution.stderr)
    if (execution.status !== 0) {
      return {
        schemaVersion: 'workbuddy-v1424-runtime-login-repair-execution/v1',
        generatedAt: new Date().toISOString(),
        status: 'failed',
        failureCategory: parsedStderr?.failureCategory ?? 'runtime_login_repair_execution_failed',
        safeErrorSummary: sanitizeText(
          parsedStderr?.errorMessage
            ?? parsedStderr?.message
            ?? parsedStdout?.errorMessage
            ?? execution.stderr
            ?? execution.stdout,
        ),
        commandStatus: execution.status,
        commandError: sanitizeText(execution.error?.message ?? ''),
        stdoutSummary: sanitizeText(execution.stdout ?? ''),
        stderrSummary: sanitizeText(execution.stderr ?? ''),
        operatorActions: parsedStderr?.operatorActions ?? [],
        envFile: repoRel(options.envFile),
        environmentSummary: redactedEnvSummary(env),
        safeToShare: true,
        secretsPrinted: false,
        boundary: {
          environment: 'staging',
          dbMutation: true,
          liveMutation: true,
          writesApplicationData: false,
          writesRolePassword: false,
        },
        releaseImpact: [
          'Runtime login repair command failed before confirmed repair evidence.',
          'It does not close G5 until runtime-login-role-readback and C18 L07 diagnostics pass.',
        ],
      }
    }
    const result = parsedStdout ?? {}
    return {
      schemaVersion: 'workbuddy-v1424-runtime-login-repair-execution/v1',
      generatedAt: new Date().toISOString(),
      status: result.repaired ? 'repaired' : 'not-repaired',
      roleName: result.roleName,
      verifiedRuntimeConnection: Boolean(result.verifiedRuntimeConnection),
      nextAction: result.nextAction,
      envFile: repoRel(options.envFile),
      environmentSummary: redactedEnvSummary(env),
      safeToShare: true,
      secretsPrinted: false,
      boundary: {
        environment: 'staging',
        dbMutation: true,
        liveMutation: true,
        writesApplicationData: false,
        writesRolePassword: true,
      },
      releaseImpact: [
        'This only repairs the staging runtime login role password and grants.',
        'It does not close G5 until runtime-login-role-readback and C18 L07 diagnostics pass.',
      ],
    }
  } catch (error) {
    return {
      schemaVersion: 'workbuddy-v1424-runtime-login-repair-execution/v1',
      generatedAt: new Date().toISOString(),
      status: 'failed',
      failureCategory: 'runtime_login_repair_execution_failed',
      safeErrorSummary: sanitizeText(error?.message ?? error),
      envFile: repoRel(options.envFile),
      environmentSummary: redactedEnvSummary(env),
      safeToShare: true,
      secretsPrinted: false,
      boundary: {
        environment: 'staging',
        dbMutation: true,
        liveMutation: true,
        writesApplicationData: false,
        writesRolePassword: false,
      },
    }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  }
}

async function writeRuntimeLoginRepairExecution(options) {
  const report = await buildRuntimeLoginRepairExecution(options)
  await mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
  await writeFile(path.resolve(options.output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

function printHelp() {
  console.log('Usage: node project-testing/tools/run-staging-runtime-login-repair.mjs --allow-write --confirm-staging-runtime-login-repair [--env-file <env>] [--release-dir <dir>] [--output <json>]')
}

function isMainModule(importMetaUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false
  return fileURLToPath(importMetaUrl) === path.resolve(argv1)
}

if (isMainModule()) {
  try {
    const options = parseArgs()
    const report = await writeRuntimeLoginRepairExecution(options)
    console.log(JSON.stringify({
      status: report.status,
      reasonCode: report.reasonCode ?? null,
      roleName: report.roleName ?? null,
      safeToShare: report.safeToShare,
      secretsPrinted: report.secretsPrinted,
      output: repoRel(options.output),
    }, null, 2))
    process.exitCode = report.status === 'repaired' ? 0 : 1
  } catch (error) {
    console.error(JSON.stringify({
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2))
    process.exitCode = 1
  }
}

export {
  buildRuntimeLoginRepairExecution,
  parseArgs,
  writeRuntimeLoginRepairExecution,
}
