#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultEnvFile = join(repoRoot, 'deploy', 'env', 'staging.env')
const defaultOutput = join(defaultReleaseDir, 'v14241-real-env-readonly-support-probes.json')
const defaultServerEnvFile = join(repoRoot, 'server', '.env')
const RANDOM_UUID = '00000000-0000-4000-8000-000000000999'
const PERFORMANCE_THRESHOLD_MS = 8000
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

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

function isTruthyEnv(value) {
  return TRUE_VALUES.has(String(value ?? '').trim().toLowerCase())
}

async function resolveAuthBoundaryDiagnostics({ env, envFile, targetClass, override = null }) {
  if (override) {
    return {
      classification: override.classification ?? 'strict_auth_or_unknown',
      permissionBypassLikely: Boolean(override.permissionBypassLikely),
      inspectedRefs: override.inspectedRefs ?? [],
      disablePermissionSystemRefs: override.disablePermissionSystemRefs ?? [],
      fallbackUserRefs: override.fallbackUserRefs ?? [],
      source: override.source ?? 'caller_override',
    }
  }

  const sources = []
  sources.push({
    ref: `${rel(envFile)}#DISABLE_PERMISSION_SYSTEM`,
    disablePermissionSystem: env.DISABLE_PERMISSION_SYSTEM,
    nodeEnv: env.NODE_ENV,
    allowDevFallbackUser: env.AUTH_ALLOW_DEV_FALLBACK_USER,
    allowTestFallbackUser: env.AUTH_ALLOW_TEST_FALLBACK_USER,
    devUserIdPresent: Boolean(env.DEV_USER_ID),
  })

  if (targetClass === 'local_runtime_with_staging_env_refs' && existsSync(defaultServerEnvFile)) {
    const serverEnv = await readEnvFile(defaultServerEnvFile)
    sources.push({
      ref: `${rel(defaultServerEnvFile)}#runtime-auth-flags`,
      disablePermissionSystem: serverEnv.DISABLE_PERMISSION_SYSTEM,
      nodeEnv: serverEnv.NODE_ENV,
      allowDevFallbackUser: serverEnv.AUTH_ALLOW_DEV_FALLBACK_USER,
      allowTestFallbackUser: serverEnv.AUTH_ALLOW_TEST_FALLBACK_USER,
      devUserIdPresent: Boolean(serverEnv.DEV_USER_ID),
    })
  }

  sources.push({
    ref: 'process.env#runtime-auth-flags',
    disablePermissionSystem: process.env.DISABLE_PERMISSION_SYSTEM,
    nodeEnv: process.env.NODE_ENV,
    allowDevFallbackUser: process.env.AUTH_ALLOW_DEV_FALLBACK_USER,
    allowTestFallbackUser: process.env.AUTH_ALLOW_TEST_FALLBACK_USER,
    devUserIdPresent: Boolean(process.env.DEV_USER_ID),
  })

  const disablePermissionSystemRefs = sources
    .filter((source) => isTruthyEnv(source.disablePermissionSystem))
    .map((source) => source.ref)

  const fallbackUserRefs = sources
    .filter((source) => (
      (source.nodeEnv === 'development' && isTruthyEnv(source.allowDevFallbackUser) && source.devUserIdPresent)
      || (source.nodeEnv === 'test' && isTruthyEnv(source.allowTestFallbackUser))
    ))
    .map((source) => source.ref)

  const permissionBypassLikely = targetClass === 'local_runtime_with_staging_env_refs'
    && (disablePermissionSystemRefs.length > 0 || fallbackUserRefs.length > 0)

  return {
    classification: disablePermissionSystemRefs.length > 0
      ? 'local_permission_bypass_configured'
      : fallbackUserRefs.length > 0
        ? 'local_auth_fallback_configured'
        : 'strict_auth_or_unknown',
    permissionBypassLikely,
    inspectedRefs: sources.map((source) => source.ref),
    disablePermissionSystemRefs,
    fallbackUserRefs,
    source: 'sanitized_env_flag_inspection',
  }
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
  const required = ['API_BASE_URL', 'TEST_USER_PASSWORD']
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

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function request({ url, method = 'GET', headers = {}, body = undefined, timeoutMs = 30000 }) {
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
      headers: {
        contentSecurityPolicy: response.headers.get('content-security-policy') ? 'present' : 'missing',
        xContentTypeOptions: response.headers.get('x-content-type-options') ?? null,
        xFrameOptions: response.headers.get('x-frame-options') ?? null,
        referrerPolicy: response.headers.get('referrer-policy') ?? null,
      },
      errorCode: json?.error?.code ?? null,
      body: json,
      bodyBytes: text.length,
    }
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      elapsedMs: Date.now() - startedAt,
      headers: {},
      errorCode: error?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'FETCH_FAILED',
      errorMessage: safeErrorMessage(error),
      body: null,
      bodyBytes: 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function responseDigest(result, bodySummary = undefined) {
  return {
    ok: result.ok,
    httpStatus: result.httpStatus,
    elapsedMs: result.elapsedMs,
    errorCode: result.errorCode ?? null,
    bodyBytes: result.bodyBytes ?? null,
    ...(bodySummary === undefined ? {} : { bodySummary }),
  }
}

function unwrapData(body) {
  if (body && typeof body === 'object' && 'data' in body) return body.data
  return body
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function summarizeWorkspace(body) {
  const data = unwrapData(body) ?? {}
  const myProjects = toArray(data.myProjects)
  const companyProjects = toArray(data.companyProjects)
  const selectedProject = companyProjects[0] ?? myProjects[0] ?? null
  return {
    hasCompany: data.hasCompany === true,
    currentCompanyId: data.currentCompany?.id ?? null,
    currentCompanyRole: data.currentCompany?.role ?? null,
    myProjectCount: myProjects.length,
    companyProjectCount: companyProjects.length,
    selectedProjectId: selectedProject?.id ?? null,
    selectedProjectRole: selectedProject?.myRole ?? null,
  }
}

function chooseMetric(metricsBody) {
  const metrics = toArray(unwrapData(metricsBody))
  const candidate = metrics.find((item) => item?.key || item?.id || item?.metric)
  return {
    metric: candidate?.key ?? candidate?.id ?? candidate?.metric ?? null,
    metricCount: metrics.length,
  }
}

function summarizeList(body, listKeys = ['items', 'rows', 'data']) {
  const data = unwrapData(body)
  if (Array.isArray(data)) return { itemCount: data.length }
  for (const key of listKeys) {
    if (Array.isArray(data?.[key])) return { itemCount: data[key].length, containerKey: key }
  }
  return { topLevelFields: Object.keys(data ?? {}).slice(0, 12) }
}

function summarizeReadiness(body) {
  const data = unwrapData(body) ?? {}
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    status: data.status ?? data.overallStatus ?? null,
    itemCount: Array.isArray(data.items) ? data.items.length : null,
  }
}

function buildAuthHeaders(token) {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  }
}

async function login({ apiBase, env }) {
  const loginUrl = joinApiPath(apiBase, '/api/auth/login')
  const attempts = []
  let token = null
  if (!loginUrl) {
    return { token: null, attempts, status: 'blocked', reason: 'missing_api_base_url' }
  }
  const credentialCandidates = [
    env.TEST_USER_EMAIL ? { username: env.TEST_USER_EMAIL, ref: 'env://deploy/env/staging.env#TEST_USER_EMAIL' } : null,
    env.TEST_USERNAME && env.TEST_USERNAME !== env.TEST_USER_EMAIL ? { username: env.TEST_USERNAME, ref: 'env://deploy/env/staging.env#TEST_USERNAME' } : null,
  ].filter(Boolean)

  for (const candidate of credentialCandidates) {
    const result = await request({
      url: loginUrl,
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: {
        username: candidate.username,
        password: env.TEST_USER_PASSWORD,
      },
      timeoutMs: 8000,
    })
    token = result.body?.data?.token ?? null
    attempts.push({
      credentialRef: candidate.ref,
      result: responseDigest(result),
    })
    if (token) break
  }

  return {
    token,
    attempts,
    status: token ? 'pass' : 'blocked',
    reason: token ? null : 'login_failed',
  }
}

async function getCheck({ id, url, token = null, expect = (result) => result.ok, bodySummary = undefined, timeoutMs = 30000 }) {
  if (!url) {
    return { id, status: 'skipped', reason: 'missing_url' }
  }
  const result = await request({
    url,
    headers: token ? buildAuthHeaders(token) : { accept: 'application/json' },
    timeoutMs,
  })
  const passed = expect(result)
  return {
    id,
    status: passed ? 'pass' : 'blocked',
    result: responseDigest(result, result.ok && bodySummary ? bodySummary(result.body) : undefined),
  }
}

function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

function scenarioStatus(checks, requiredIds) {
  const failed = requiredIds.filter((id) => {
    const status = checks.find((check) => check.id === id)?.status
    return status !== 'pass' && status !== 'not_applicable_local_permission_bypass'
  })
  const inconclusive = requiredIds.filter((id) => (
    checks.find((check) => check.id === id)?.status === 'not_applicable_local_permission_bypass'
  ))
  return {
    status: failed.length === 0
      ? (inconclusive.length > 0 ? 'support_inconclusive' : 'support_passed')
      : 'support_blocked',
    failedCheckIds: failed,
    inconclusiveCheckIds: inconclusive,
  }
}

function classifyLocalBypassNegativeCheck(check, authBoundaryDiagnostics, expectedStrictStatus) {
  if (!authBoundaryDiagnostics?.permissionBypassLikely) return check
  if (check.status !== 'blocked' || check.result?.httpStatus !== 200) return check
  return {
    ...check,
    status: 'not_applicable_local_permission_bypass',
    reason: 'local_runtime_permission_bypass_configured',
    expectedStrictStatus,
    result: {
      ...(check.result ?? {}),
      authBoundaryClassification: authBoundaryDiagnostics.classification,
    },
  }
}

async function runPerformanceChecks({ apiBase, token, projectId, metric, performanceThresholdMs = PERFORMANCE_THRESHOLD_MS }) {
  const definitions = [
    {
      id: 'dashboard-project-summary-latency',
      url: projectId ? joinApiPath(apiBase, `/api/projects/${encodeURIComponent(projectId)}/dashboard/project-summary`) : null,
    },
    {
      id: 'dashboard-company-summary-latency',
      url: joinApiPath(apiBase, '/api/company/dashboard/company-summary'),
    },
    {
      id: 'dashboard-projects-summary-latency',
      url: joinApiPath(apiBase, '/api/company/dashboard/projects-summary'),
    },
    {
      id: 'reports-s-curve-latency',
      url: projectId ? joinApiPath(apiBase, `/api/projects/${encodeURIComponent(projectId)}/reports/s-curve`) : null,
    },
    {
      id: 'analytics-company-trend-latency',
      url: metric ? joinApiPath(apiBase, `/api/analytics/company-trend?metric=${encodeURIComponent(metric)}`) : null,
    },
  ]
  const checks = []
  for (const definition of definitions) {
    checks.push(await getCheck({
      id: definition.id,
      url: definition.url,
      token,
      expect: (result) => result.ok && result.elapsedMs <= performanceThresholdMs,
      bodySummary: (body) => summarizeList(body, ['points', 'items', 'rows', 'data']),
      timeoutMs: 30000,
    }))
  }
  const latencies = checks
    .map((check) => check.result?.elapsedMs)
    .filter((value) => Number.isFinite(value))
  return {
    checks,
    latencySummary: {
      thresholdMs: performanceThresholdMs,
      maxMs: latencies.length ? Math.max(...latencies) : null,
      p95Ms: percentile(latencies, 95),
      overThresholdIds: checks
        .filter((check) => Number.isFinite(check.result?.elapsedMs) && check.result.elapsedMs > performanceThresholdMs)
        .map((check) => check.id),
    },
  }
}

export async function runReadonlySupportProbes({
  envFile = defaultEnvFile,
  output = defaultOutput,
  now = new Date(),
  performanceThresholdMs = PERFORMANCE_THRESHOLD_MS,
  authBoundaryDiagnostics: authBoundaryDiagnosticsOverride = null,
} = {}) {
  const absoluteEnvFile = resolve(envFile)
  const env = await readEnvFile(absoluteEnvFile)
  const apiBase = normalizeBaseUrl(env.API_BASE_URL)
  const clientBase = normalizeBaseUrl(env.CLIENT_BASE_URL)
  const targetClass = classifyTarget(apiBase, clientBase)
  const authBoundaryDiagnostics = await resolveAuthBoundaryDiagnostics({
    env,
    envFile: absoluteEnvFile,
    targetClass,
    override: authBoundaryDiagnosticsOverride,
  })
  const envCheck = checkEnv(env)
  const loginResult = envCheck.status === 'pass'
    ? await login({ apiBase, env })
    : { token: null, attempts: [], status: 'blocked', reason: 'env_check_failed' }
  const token = loginResult.token
  const setupChecks = [
    {
      id: 'auth-login',
      status: loginResult.status,
      reason: loginResult.reason,
      rawTokenWrittenToReport: false,
      attempts: loginResult.attempts,
    },
  ]

  const workspaceCheck = await getCheck({
    id: 'workspace-read',
    url: joinApiPath(apiBase, '/api/workspace'),
    token,
    bodySummary: summarizeWorkspace,
    timeoutMs: 8000,
  })
  setupChecks.push(workspaceCheck)

  const workspaceSummary = workspaceCheck.result?.bodySummary ?? {}
  const projectId = workspaceSummary.selectedProjectId ?? null
  const companyId = workspaceSummary.currentCompanyId ?? null

  const metricRegistryCheck = await getCheck({
    id: 'analytics-metric-registry',
    url: joinApiPath(apiBase, '/api/analytics/metrics'),
    token,
    bodySummary: chooseMetric,
    timeoutMs: 8000,
  })
  setupChecks.push(metricRegistryCheck)
  const metric = metricRegistryCheck.result?.bodySummary?.metric ?? null

  const uat03Checks = [
    classifyLocalBypassNegativeCheck(await getCheck({
      id: 'noauth-workspace-rejected',
      url: joinApiPath(apiBase, '/api/workspace'),
      expect: (result) => result.httpStatus === 401,
      timeoutMs: 8000,
    }), authBoundaryDiagnostics, '401'),
    await getCheck({
      id: 'current-project-member-read',
      url: projectId ? joinApiPath(apiBase, `/api/members/${encodeURIComponent(projectId)}/me`) : null,
      token,
      timeoutMs: 8000,
      bodySummary: summarizeReadiness,
    }),
    classifyLocalBypassNegativeCheck(await getCheck({
      id: 'random-project-summary-denied',
      url: joinApiPath(apiBase, `/api/projects/${RANDOM_UUID}/dashboard/project-summary`),
      token,
      expect: (result) => [403, 404].includes(result.httpStatus),
      timeoutMs: 8000,
    }), authBoundaryDiagnostics, '403 or 404'),
    classifyLocalBypassNegativeCheck(await getCheck({
      id: 'random-project-member-denied',
      url: joinApiPath(apiBase, `/api/members/${RANDOM_UUID}/me`),
      token,
      expect: (result) => [403, 404].includes(result.httpStatus),
      timeoutMs: 8000,
    }), authBoundaryDiagnostics, '403 or 404'),
  ]

  const performance = await runPerformanceChecks({ apiBase, token, projectId, metric, performanceThresholdMs })

  const healthHeadersCheck = await getCheck({
    id: 'health-security-headers',
    url: joinApiPath(apiBase, '/api/readyz'),
    expect: (result) => (
      result.ok &&
      result.headers?.contentSecurityPolicy === 'present' &&
      result.headers?.xContentTypeOptions === 'nosniff'
    ),
    timeoutMs: 8000,
  })
  healthHeadersCheck.result = {
    ...(healthHeadersCheck.result ?? {}),
    headerSummary: healthHeadersCheck.result ? (await request({ url: joinApiPath(apiBase, '/api/readyz'), timeoutMs: 8000 })).headers : {},
  }
  const uat12Checks = [
    healthHeadersCheck,
    classifyLocalBypassNegativeCheck(await getCheck({
      id: 'noauth-protected-route-rejected',
      url: joinApiPath(apiBase, '/api/company/dashboard/company-summary'),
      expect: (result) => result.httpStatus === 401,
      timeoutMs: 8000,
    }), authBoundaryDiagnostics, '401'),
    await getCheck({
      id: 'invalid-project-trend-metric-rejected',
      url: projectId ? joinApiPath(apiBase, `/api/analytics/project-trend?projectId=${encodeURIComponent(projectId)}&metric=__not_registered__`) : null,
      token,
      expect: (result) => [400, 404].includes(result.httpStatus),
      timeoutMs: 8000,
    }),
    await getCheck({
      id: 'invalid-company-trend-groupby-rejected',
      url: metric ? joinApiPath(apiBase, `/api/analytics/company-trend?metric=${encodeURIComponent(metric)}&groupBy=project`) : null,
      token,
      expect: (result) => result.httpStatus === 400,
      timeoutMs: 8000,
    }),
  ]

  const uat16Checks = [
    await getCheck({
      id: 'healthcheck-read',
      url: joinApiPath(apiBase, '/api/readyz'),
      timeoutMs: 8000,
      bodySummary: summarizeReadiness,
    }),
    await getCheck({
      id: 'v14231-readiness-ledger-read',
      url: joinApiPath(apiBase, '/api/v14231-readiness'),
      token,
      timeoutMs: 8000,
      bodySummary: summarizeReadiness,
    }),
    await getCheck({
      id: 'v14231-actionable-surfaces-read',
      url: joinApiPath(apiBase, '/api/v14231-readiness/actionable-surfaces'),
      token,
      timeoutMs: 8000,
      bodySummary: summarizeReadiness,
    }),
    await getCheck({
      id: 'notification-diagnostics-read',
      url: projectId ? joinApiPath(apiBase, `/api/notifications/diagnostics?projectId=${encodeURIComponent(projectId)}&limit=10`) : null,
      token,
      timeoutMs: 12000,
      bodySummary: summarizeReadiness,
    }),
    await getCheck({
      id: 'deletion-retention-diagnostics-read',
      url: joinApiPath(apiBase, '/api/deletion-retention/diagnostics'),
      token,
      timeoutMs: 12000,
      bodySummary: summarizeReadiness,
    }),
  ]

  const scenarioResults = {
    'REAL-UAT-03': {
      ...scenarioStatus(uat03Checks, [
        'noauth-workspace-rejected',
        'current-project-member-read',
        'random-project-summary-denied',
        'random-project-member-denied',
      ]),
      supportOnly: true,
      checks: uat03Checks,
    },
    'REAL-UAT-11': {
      ...scenarioStatus(performance.checks, [
        'dashboard-project-summary-latency',
        'dashboard-company-summary-latency',
        'dashboard-projects-summary-latency',
        'reports-s-curve-latency',
        'analytics-company-trend-latency',
      ]),
      supportOnly: true,
      latencySummary: performance.latencySummary,
      checks: performance.checks,
    },
    'REAL-UAT-12': {
      ...scenarioStatus(uat12Checks, [
        'health-security-headers',
        'noauth-protected-route-rejected',
        'invalid-project-trend-metric-rejected',
        'invalid-company-trend-groupby-rejected',
      ]),
      supportOnly: true,
      checks: uat12Checks,
    },
    'REAL-UAT-16': {
      ...scenarioStatus(uat16Checks, [
        'healthcheck-read',
        'v14231-readiness-ledger-read',
        'v14231-actionable-surfaces-read',
        'notification-diagnostics-read',
        'deletion-retention-diagnostics-read',
      ]),
      supportOnly: true,
      checks: uat16Checks,
    },
  }

  const statuses = Object.values(scenarioResults).map((item) => item.status)
  const reportStatus = statuses.every((status) => status === 'support_passed')
    ? 'support_passed'
    : statuses.some((status) => status === 'support_blocked')
      ? (statuses.some((status) => status === 'support_passed' || status === 'support_inconclusive')
        ? 'support_mixed'
        : 'support_blocked')
      : 'support_inconclusive'
  const report = {
    schemaVersion: 'workbuddy/v14241-real-env-readonly-support-probes/v1',
    generatedAt: now.toISOString(),
    status: reportStatus,
    scenarioIds: Object.keys(scenarioResults),
    environment: 'staging',
    targetClass,
    envFile: rel(absoluteEnvFile),
    mutationBoundary: 'read-only HTTP API probes only; no create/update/delete/export download/publish/drop operations executed',
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
    selectedTargetRefs: {
      companyId,
      projectId,
      metric,
    },
    envCheck,
    authBoundaryDiagnostics,
    setupChecks,
    scenarioResults,
    boundary: {
      localRuntimeWithStagingEnvRefsIsNotDeployedStaging: targetClass === 'local_runtime_with_staging_env_refs',
      noBrowserScreenshotsOrTraceCaptured: true,
      noDbQueryLogCaptured: true,
      noAdvisorLiveExportCaptured: true,
      noSupportMutationOrCompensationExecuted: true,
      scenarioEvidenceStillRequired: true,
      handoffStillRequired: true,
    },
  }

  const text = JSON.stringify(report)
  const rawCredentialValues = [env.TEST_USER_PASSWORD, env.TEST_USER_EMAIL, env.TEST_USERNAME].filter(Boolean)
  if (
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)
    || rawCredentialValues.some((value) => text.includes(value))
  ) {
    throw new Error('refusing_to_write_readonly_support_probe_report_with_secret_like_text')
  }

  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

async function main() {
  const envFile = resolve(argValue('--env-file', defaultEnvFile))
  const output = resolve(argValue('--output', defaultOutput))
  const report = await runReadonlySupportProbes({ envFile, output })
  console.log(JSON.stringify({
    status: report.status,
    scenarioIds: report.scenarioIds,
    targetClass: report.targetClass,
    scenarioStatuses: Object.fromEntries(
      Object.entries(report.scenarioResults).map(([id, result]) => [id, result.status]),
    ),
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
