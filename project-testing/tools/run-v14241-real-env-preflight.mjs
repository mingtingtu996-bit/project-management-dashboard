#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultEnvFile = join(repoRoot, 'deploy', 'env', 'staging.env')
const defaultOutput = join(defaultReleaseDir, 'v14241-staging-connectivity-preflight.json')

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

function normalizeBaseUrl(value) {
  const text = String(value ?? '').trim().replace(/\/$/, '')
  return text || null
}

function joinApiPath(apiBase, path) {
  const base = normalizeBaseUrl(apiBase)
  if (!base) return null
  if (base.endsWith('/api')) return `${base}${path.replace(/^\/api/, '')}`
  return `${base}${path}`
}

function classifyTarget(apiBase, clientBase) {
  const hosts = []
  for (const value of [apiBase, clientBase]) {
    try {
      hosts.push(new URL(value).hostname)
    } catch {
      hosts.push('')
    }
  }
  return hosts.some((host) => host === '127.0.0.1' || host === 'localhost')
    ? 'local_runtime_with_staging_env_refs'
    : 'deployed_staging_or_uat'
}

function checkEnv(env) {
  const required = ['API_BASE_URL', 'CLIENT_BASE_URL', 'TEST_USER_PASSWORD']
  const usernamePresent = Boolean(env.TEST_USER_EMAIL || env.TEST_USERNAME)
  const missingKeys = required.filter((key) => !env[key])
  if (!usernamePresent) missingKeys.push('TEST_USER_EMAIL or TEST_USERNAME')
  return {
    status: missingKeys.length === 0 ? 'pass' : 'blocked',
    missingKeys,
    presentKeys: [
      ...required.filter((key) => Boolean(env[key])),
      ...(usernamePresent ? ['TEST_USER_EMAIL or TEST_USERNAME'] : []),
    ],
  }
}

async function request({ url, method = 'GET', headers = {}, body = undefined, timeoutMs = 3000 }) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { rawTextLength: text.length }
    }
    return {
      ok: response.ok,
      httpStatus: response.status,
      elapsedMs: Date.now() - startedAt,
      errorCode: json?.error?.code ?? null,
      body: json,
    }
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      elapsedMs: Date.now() - startedAt,
      errorCode: error?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'FETCH_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      body: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function sanitizeValue(value, redactedValues = []) {
  if (typeof value === 'string') {
    const tokenRedacted = value.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<redacted>')
    return redactedValues.reduce((current, secret) => (
      secret ? current.split(secret).join('<redacted>') : current
    ), tokenRedacted)
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, redactedValues))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, sanitizeValue(nested, redactedValues)]),
    )
  }
  return value
}

function sanitizeRequestResult(result, redactedValues = []) {
  return sanitizeValue(result, redactedValues)
}

export async function runPreflight({
  envFile = defaultEnvFile,
  output = defaultOutput,
  now = new Date(),
} = {}) {
  const absoluteEnvFile = resolve(envFile)
  const env = await readEnvFile(absoluteEnvFile)
  const envCheck = checkEnv(env)
  const apiBase = normalizeBaseUrl(env.API_BASE_URL)
  const clientBase = normalizeBaseUrl(env.CLIENT_BASE_URL)
  const targetClass = classifyTarget(apiBase, clientBase)
  const checks = []

  if (clientBase) {
    checks.push({
      id: 'client-root',
      urlRef: 'env://deploy/env/staging.env#CLIENT_BASE_URL',
      result: sanitizeRequestResult(await request({ url: clientBase, timeoutMs: 3000 })),
    })
  }

  const healthUrl = joinApiPath(apiBase, '/api/readyz')
  if (healthUrl) {
    checks.push({
      id: 'api-health',
      urlRef: 'env://deploy/env/staging.env#API_BASE_URL + /api/readyz',
      result: sanitizeRequestResult(await request({ url: healthUrl, timeoutMs: 3000 })),
    })
  }

  let token = null
  const loginUrl = joinApiPath(apiBase, '/api/auth/login')
  const credentialRedactions = [env.TEST_USER_EMAIL, env.TEST_USERNAME, env.TEST_USER_PASSWORD].filter(Boolean)
  if (loginUrl && envCheck.status === 'pass') {
    const credentialCandidates = [
      env.TEST_USER_EMAIL ? { username: env.TEST_USER_EMAIL, ref: 'env://deploy/env/staging.env#TEST_USER_EMAIL' } : null,
      env.TEST_USERNAME && env.TEST_USERNAME !== env.TEST_USER_EMAIL ? { username: env.TEST_USERNAME, ref: 'env://deploy/env/staging.env#TEST_USERNAME' } : null,
    ].filter(Boolean)
    const attempts = []
    let loginResult = null
    for (const candidate of credentialCandidates) {
      loginResult = await request({
        url: loginUrl,
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: {
          username: candidate.username,
          password: env.TEST_USER_PASSWORD,
        },
        timeoutMs: 5000,
      })
      attempts.push({
        credentialRef: candidate.ref,
        result: sanitizeRequestResult(loginResult, credentialRedactions),
      })
      token = loginResult.body?.data?.token ?? null
      if (token) break
    }
    checks.push({
      id: 'auth-login',
      urlRef: 'env://deploy/env/staging.env#API_BASE_URL + /api/auth/login',
      credentialRefsTried: credentialCandidates.map((candidate) => candidate.ref),
      rawTokenWrittenToReport: false,
      result: sanitizeRequestResult(loginResult, credentialRedactions),
      attempts,
    })
  }

  const workspaceUrl = joinApiPath(apiBase, '/api/workspace')
  if (workspaceUrl && token) {
    checks.push({
      id: 'workspace-read',
      urlRef: 'env://deploy/env/staging.env#API_BASE_URL + /api/workspace',
      rawTokenWrittenToReport: false,
      result: sanitizeRequestResult(await request({
        url: workspaceUrl,
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        timeoutMs: 5000,
      }), credentialRedactions),
    })
  }

  const requiredCheckIds = ['client-root', 'api-health', 'auth-login', 'workspace-read']
  const passedChecks = checks.filter((check) => check.result.ok)
  const missingCheckIds = requiredCheckIds.filter((id) => !checks.some((check) => check.id === id))
  const failedChecks = checks.filter((check) => !check.result.ok)
  const status = envCheck.status === 'pass' && failedChecks.length === 0 && missingCheckIds.length === 0 ? 'pass' : 'blocked'
  const report = {
    schemaVersion: 'workbuddy/v14241-real-env-preflight/v1',
    generatedAt: now.toISOString(),
    status,
    environment: 'staging',
    targetClass,
    envFile: rel(absoluteEnvFile),
    mutationBoundary: 'read-only HTTP preflight; no create/update/delete/publish/drop operations executed',
    canCloseScenarioTier: false,
    canSupportScenarioIds: ['REAL-UAT-01', 'REAL-UAT-02', 'REAL-UAT-03'],
    envCheck,
    checks,
    summary: {
      requiredCheckCount: requiredCheckIds.length,
      executedCheckCount: checks.length,
      passedCheckCount: passedChecks.length,
      failedCheckCount: failedChecks.length,
      missingCheckIds,
      failedCheckIds: failedChecks.map((check) => check.id),
    },
    boundary: {
      localRuntimeWithStagingEnvRefsIsNotDeployedStaging: targetClass === 'local_runtime_with_staging_env_refs',
      scenarioEvidenceStillRequired: true,
      handoffStillRequired: true,
    },
  }

  const text = JSON.stringify(report)
  if (
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\//i.test(text)
    || credentialRedactions.some((value) => text.includes(value))
  ) {
    throw new Error('refusing_to_write_preflight_report_with_secret_like_text')
  }
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

async function main() {
  const envFile = resolve(argValue('--env-file', defaultEnvFile))
  const output = resolve(argValue('--output', defaultOutput))
  const report = await runPreflight({ envFile, output })
  console.log(JSON.stringify({
    status: report.status,
    environment: report.environment,
    targetClass: report.targetClass,
    passedCheckCount: report.summary.passedCheckCount,
    requiredCheckCount: report.summary.requiredCheckCount,
    failedCheckIds: report.summary.failedCheckIds,
    missingCheckIds: report.summary.missingCheckIds,
    output: rel(output),
  }, null, 2))
  process.exitCode = report.status === 'pass' ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
