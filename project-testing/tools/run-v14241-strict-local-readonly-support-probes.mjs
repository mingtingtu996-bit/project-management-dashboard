#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { runReadonlySupportProbes } from './run-v14241-real-env-readonly-support-probes.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultEnvFile = join(repoRoot, 'deploy', 'env', 'staging.env')
const defaultOutput = join(defaultReleaseDir, 'v14241-real-env-readonly-support-probes.strict-auth-local.json')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readEnvFile(path) {
  const env = {}
  const text = existsSync(path) ? await readFile(path, 'utf8') : ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const separator = line.indexOf('=')
    env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return env
}

function dedupeWindowsEnv(source) {
  const byLowerKey = new Map()
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    const lower = key.toLowerCase()
    if (lower === 'path') {
      byLowerKey.set('path', ['Path', value])
      continue
    }
    if (!byLowerKey.has(lower)) byLowerKey.set(lower, [key, value])
  }
  return Object.fromEntries([...byLowerKey.values()])
}

export function buildStrictServerEnv({ baseEnv = process.env, envFileEnv = {}, host = '127.0.0.1', port = '3107' } = {}) {
  const merged = {
    ...baseEnv,
    ...envFileEnv,
    HOST: host,
    PORT: String(port),
    NODE_ENV: 'production',
    SKIP_SCHEDULER_BOOT: 'true',
    SKIP_DATABASE_VALIDATE: 'true',
    SKIP_REFERENCE_DATA_BOOTSTRAP: 'true',
    SKIP_READ_MODEL_WARMUP: 'true',
    AUTH_ALLOW_DEV_FALLBACK_USER: 'false',
    AUTH_ALLOW_TEST_FALLBACK_USER: 'false',
    DISABLE_PERMISSION_SYSTEM: 'false',
    API_RATE_LIMIT_MAX: '10000',
    AUTH_RATE_LIMIT_MAX: '10000',
  }
  delete merged.Path
  delete merged.PATH
  merged.Path = baseEnv.Path ?? baseEnv.PATH ?? ''
  return dedupeWindowsEnv(merged)
}

export function buildProbeEnvText({ sourceEnv, apiBaseUrl, clientBaseUrl = apiBaseUrl }) {
  const lines = [
    `API_BASE_URL=${apiBaseUrl}`,
    `CLIENT_BASE_URL=${clientBaseUrl}`,
  ]
  for (const key of ['TEST_USER_EMAIL', 'TEST_USERNAME', 'TEST_USER_PASSWORD']) {
    if (sourceEnv[key]) lines.push(`${key}=${sourceEnv[key]}`)
  }
  return `${lines.join('\n')}\n`
}

export function strictRuntimeSummary({ host, port }) {
  return {
    status: 'strict_local_api_started',
    baseUrl: `http://${host}:${port}`,
    commandRef: 'npm run dev --workspace=server',
    strictAuth: {
      nodeEnv: 'production',
      disablePermissionSystem: 'false',
      allowDevFallbackUser: 'false',
      allowTestFallbackUser: 'false',
    },
    bootGuards: {
      scheduler: 'disabled',
      databaseValidation: 'disabled',
      referenceDataBootstrap: 'disabled',
      readModelWarmup: 'disabled',
    },
    mutationBoundary: 'server startup plus read-only HTTP probes; no create/update/delete/export/publish/drop operations executed',
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHealth({ baseUrl, timeoutMs }) {
  const startedAt = Date.now()
  let lastStatus = null
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/readyz`)
      lastStatus = response.status
      if (response.ok) {
        await response.arrayBuffer()
        return { status: 'pass', elapsedMs: Date.now() - startedAt, httpStatus: response.status }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(500)
  }
  return {
    status: 'blocked',
    elapsedMs: Date.now() - startedAt,
    httpStatus: lastStatus,
    errorCode: 'HEALTHCHECK_TIMEOUT',
    errorMessage: lastError,
  }
}

async function stopChildTree(child) {
  if (!child?.pid || child.exitCode !== null) return
  try {
    if (process.platform === 'win32') {
      await new Promise((resolve) => {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        })
        killer.on('close', resolve)
        killer.on('error', resolve)
      })
      return
    }
    child.kill('SIGTERM')
  } finally {
    child.unref?.()
  }
}

function assertNoSecretText(text, env) {
  const rawCredentialValues = [env.TEST_USER_PASSWORD, env.TEST_USER_EMAIL, env.TEST_USERNAME].filter(Boolean)
  if (
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)
    || rawCredentialValues.some((value) => text.includes(value))
  ) {
    throw new Error('refusing_to_write_strict_local_probe_report_with_secret_like_text')
  }
}

async function writeReport(output, report, env) {
  const text = `${JSON.stringify(report, null, 2)}\n`
  assertNoSecretText(text, env)
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), text, 'utf8')
}

export async function runStrictLocalReadonlySupportProbes({
  envFile = defaultEnvFile,
  output = defaultOutput,
  host = '127.0.0.1',
  port = '3107',
  startupTimeoutMs = 45000,
  now = new Date(),
} = {}) {
  const absoluteEnvFile = resolve(envFile)
  const sourceEnv = await readEnvFile(absoluteEnvFile)
  const baseUrl = `http://${host}:${port}`
  const runtimeSummary = strictRuntimeSummary({ host, port })
  const child = spawn('cmd.exe', ['/d', '/c', 'npm.cmd', 'run', 'dev', '--workspace=server'], {
    cwd: repoRoot,
    env: buildStrictServerEnv({ envFileEnv: sourceEnv, host, port }),
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  })

  try {
    let childExit = null
    child.once('exit', (code, signal) => {
      childExit = { code, signal }
    })

    const health = await waitForHealth({ baseUrl, timeoutMs: startupTimeoutMs })
    if (health.status !== 'pass') {
      const report = {
        schemaVersion: 'workbuddy/v14241-strict-local-readonly-support-probes/v1',
        generatedAt: now.toISOString(),
        status: 'support_blocked',
        environment: 'staging',
        targetClass: 'strict_auth_local_runtime_with_staging_env_refs',
        envFile: rel(absoluteEnvFile),
        canCloseScenarioTier: false,
        closesRealEnvironmentTier: false,
        strictLocalRuntime: {
          ...runtimeSummary,
          status: 'strict_local_api_start_blocked',
          health,
          childExit,
        },
        boundary: {
          localRuntimeWithStagingEnvRefsIsNotDeployedStaging: true,
          noBrowserScreenshotsOrTraceCaptured: true,
          noDbQueryLogCaptured: true,
          noLiveHandoffExecuted: true,
          scenarioEvidenceStillRequired: true,
        },
      }
      await writeReport(output, report, sourceEnv)
      return report
    }

    const tempRoot = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-strict-probe-'))
    const tempEnvFile = join(tempRoot, 'strict-probe.env')
    const tempProbeOutput = join(tempRoot, 'strict-probe.json')
    await writeFile(tempEnvFile, buildProbeEnvText({
      sourceEnv,
      apiBaseUrl: baseUrl,
      clientBaseUrl: sourceEnv.CLIENT_BASE_URL || baseUrl,
    }), 'utf8')

    const probeReport = await runReadonlySupportProbes({
      envFile: tempEnvFile,
      output: tempProbeOutput,
      now,
      authBoundaryDiagnostics: {
        classification: 'strict_auth_local_runtime',
        permissionBypassLikely: false,
        inspectedRefs: ['process.env#strict-local-runtime-auth-flags'],
        disablePermissionSystemRefs: [],
        fallbackUserRefs: [],
        source: 'strict_local_runner_override',
      },
    })

    await rm(tempRoot, { recursive: true, force: true })

    const report = {
      ...probeReport,
      schemaVersion: 'workbuddy/v14241-strict-local-readonly-support-probes/v1',
      targetClass: 'strict_auth_local_runtime_with_staging_env_refs',
      envFile: rel(absoluteEnvFile),
      strictLocalRuntime: {
        ...runtimeSummary,
        health,
      },
      boundary: {
        ...(probeReport.boundary ?? {}),
        localRuntimeWithStagingEnvRefsIsNotDeployedStaging: true,
        strictLocalAuthDoesNotEqualDeployedStaging: true,
        noLiveHandoffExecuted: true,
        scenarioEvidenceStillRequired: true,
      },
    }
    await writeReport(output, report, sourceEnv)
    return report
  } finally {
    await stopChildTree(child)
  }
}

async function main() {
  const envFile = resolve(argValue('--env-file', defaultEnvFile))
  const output = resolve(argValue('--output', defaultOutput))
  const host = String(argValue('--host', '127.0.0.1'))
  const port = String(argValue('--port', '3107'))
  const startupTimeoutMs = Number(argValue('--startup-timeout-ms', '45000'))
  const report = await runStrictLocalReadonlySupportProbes({ envFile, output, host, port, startupTimeoutMs })
  console.log(JSON.stringify({
    status: report.status,
    targetClass: report.targetClass,
    strictLocalRuntimeStatus: report.strictLocalRuntime?.status,
    scenarioStatuses: report.scenarioResults
      ? Object.fromEntries(Object.entries(report.scenarioResults).map(([id, result]) => [id, result.status]))
      : {},
    canCloseScenarioTier: report.canCloseScenarioTier,
    output: rel(output),
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
