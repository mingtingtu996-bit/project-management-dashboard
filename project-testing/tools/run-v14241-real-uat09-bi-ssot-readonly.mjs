#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolvePublicHttpsOrigin } from '../../scripts/public-origin.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultEnvFile = join(repoRoot, 'deploy', 'env', 'staging.env')
const defaultOutput = join(defaultReleaseDir, 'v14241-real-uat09-bi-ssot-readonly.json')
const DEFAULT_READ_TIMEOUT_MS = 30000
const DEFAULT_READ_WARNING_THRESHOLD_MS = 8000

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

function unwrapData(body) {
  if (body && typeof body === 'object' && 'data' in body) return body.data
  return body
}

function responseDigest(result, bodySummary = undefined) {
  return {
    ok: result.ok,
    httpStatus: result.httpStatus,
    elapsedMs: result.elapsedMs,
    errorCode: result.errorCode ?? null,
    ...(bodySummary === undefined ? {} : { bodySummary }),
  }
}

async function request({ url, method = 'GET', headers = {}, body = undefined, timeoutMs = 5000 }) {
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

function summarizeProjectSummary(body, selectedProjectId) {
  const data = unwrapData(body) ?? {}
  return {
    projectIdMatchesSelected: data.id === selectedProjectId,
    fieldsPresent: [
      'id',
      'name',
      'overallProgress',
      'healthScore',
      'riskCount',
      'issueCount',
      'snapshot',
      'trend',
      'remainingDurationForecast',
    ].filter((key) => data[key] !== undefined),
    hasSnapshotLikeField: Boolean(data.snapshot || data.projectLevelSnapshot || data.snapshots),
    hasSummaryMetricFields: ['overallProgress', 'healthScore'].some((key) => data[key] !== undefined),
  }
}

function summarizeProjectsSummary(body, selectedProjectId) {
  const data = toArray(unwrapData(body))
  return {
    projectCount: data.length,
    selectedProjectFound: data.some((item) => item?.id === selectedProjectId),
    firstProjectFields: Object.keys(data[0] ?? {}).slice(0, 12),
  }
}

function summarizeCompanySummary(body) {
  const data = unwrapData(body) ?? {}
  const projects = toArray(data.projects ?? data.projectSummaries ?? data.rankedProjects)
  const healthHistory = toArray(data.healthHistory)
  return {
    topLevelFields: Object.keys(data).slice(0, 16),
    projectLikeCount: projects.length,
    healthHistoryCount: healthHistory.length,
    hasStatusCounts: Boolean(data.statusCounts),
  }
}

function chooseMetric(metricsBody) {
  const metrics = toArray(unwrapData(metricsBody))
  const candidate = metrics.find((item) => item?.key || item?.id || item?.metric)
  const metric = candidate?.key ?? candidate?.id ?? candidate?.metric ?? null
  return {
    metric,
    metricCount: metrics.length,
    firstMetricFields: Object.keys(metrics[0] ?? {}).slice(0, 12),
  }
}

function summarizeTrend(body) {
  const data = unwrapData(body) ?? {}
  const points = toArray(data.points ?? data.rows ?? data.series ?? data.data)
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    pointCount: points.length,
    hasSnapshotOrWindowField: Boolean(data.window || data.from || data.to || data.granularity),
  }
}

function summarizeSCurve(body) {
  const points = toArray(unwrapData(body))
  return {
    pointCount: points.length,
    firstPointFields: Object.keys(points[0] ?? {}).slice(0, 12),
    hasPlannedAndActualFields: points.some((item) => (
      item?.planned_cumulative !== undefined && item?.actual_cumulative !== undefined
    )),
  }
}

function buildAuthHeaders(token) {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  }
}

async function getJsonCheck({
  id,
  url,
  token,
  bodySummary,
  timeoutMs = DEFAULT_READ_TIMEOUT_MS,
  warningThresholdMs = DEFAULT_READ_WARNING_THRESHOLD_MS,
}) {
  if (!url || !token) {
    return {
      id,
      status: 'skipped',
      reason: !url ? 'missing_url' : 'missing_token',
    }
  }
  const result = await request({
    url,
    headers: buildAuthHeaders(token),
    timeoutMs,
  })
  const slowReadWarning = result.ok && Number.isFinite(result.elapsedMs) && result.elapsedMs > warningThresholdMs
  return {
    id,
    status: result.ok ? 'pass' : 'blocked',
    urlRef: 'derived-from-env-and-selected-targets',
    result: responseDigest(result, result.ok ? bodySummary(result.body) : undefined),
    ...(slowReadWarning ? {
      warning: {
        code: 'READ_LATENCY_OVER_WARNING_THRESHOLD',
        thresholdMs: warningThresholdMs,
        boundary: 'warning-only-for-ssot-readiness; performance gating stays in REAL-UAT-11',
      },
    } : {}),
  }
}

export async function runBiSsotReadonlyProbe({
  envFile = defaultEnvFile,
  output = defaultOutput,
  now = new Date(),
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
  readWarningThresholdMs = DEFAULT_READ_WARNING_THRESHOLD_MS,
  publicOrigin = null,
} = {}) {
  const absoluteEnvFile = resolve(envFile)
  const env = await readEnvFile(absoluteEnvFile)
  const envCheck = checkEnv(env)
  const apiBase = normalizeBaseUrl(env.API_BASE_URL)
  const clientBase = normalizeBaseUrl(env.CLIENT_BASE_URL)
  const targetClass = classifyTarget(apiBase, clientBase)
  const checks = []
  const resolvedPublicOrigin = resolvePublicHttpsOrigin({ apiBaseUrl: apiBase, publicOrigin })

  let token = null
  const loginUrl = joinApiPath(apiBase, '/api/auth/login')
  if (loginUrl && envCheck.status === 'pass') {
    const credentialCandidates = [
      env.TEST_USER_EMAIL ? { username: env.TEST_USER_EMAIL, ref: 'env://deploy/env/staging.env#TEST_USER_EMAIL' } : null,
      env.TEST_USERNAME && env.TEST_USERNAME !== env.TEST_USER_EMAIL ? { username: env.TEST_USERNAME, ref: 'env://deploy/env/staging.env#TEST_USERNAME' } : null,
    ].filter(Boolean)
    const attempts = []
    for (const candidate of credentialCandidates) {
      const result = await request({
        url: loginUrl,
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', origin: resolvedPublicOrigin },
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
    checks.push({
      id: 'auth-login',
      status: token ? 'pass' : 'blocked',
      rawTokenWrittenToReport: false,
      credentialRefsTried: credentialCandidates.map((candidate) => candidate.ref),
      attempts,
    })
  } else {
    checks.push({
      id: 'auth-login',
      status: 'blocked',
      reason: loginUrl ? 'env_check_failed' : 'missing_api_base_url',
    })
  }

  const workspaceUrl = joinApiPath(apiBase, '/api/workspace')
  const workspaceResult = token && workspaceUrl
    ? await request({
        url: workspaceUrl,
        headers: buildAuthHeaders(token),
        timeoutMs: 8000,
      })
    : null
  const workspaceSummary = workspaceResult?.ok ? summarizeWorkspace(workspaceResult.body) : null
  checks.push({
    id: 'workspace-read',
    status: workspaceResult?.ok ? 'pass' : 'blocked',
    rawTokenWrittenToReport: false,
    urlRef: 'env://deploy/env/staging.env#API_BASE_URL + /api/workspace',
    result: workspaceResult ? responseDigest(workspaceResult, workspaceSummary) : null,
  })

  const selectedProjectId = workspaceSummary?.selectedProjectId ?? null
  const selectedCompanyId = workspaceSummary?.currentCompanyId ?? null
  const metricsResult = token
    ? await request({
        url: joinApiPath(apiBase, '/api/analytics/metrics'),
        headers: buildAuthHeaders(token),
        timeoutMs: 8000,
      })
    : null
  const metricChoice = metricsResult?.ok ? chooseMetric(metricsResult.body) : { metric: null, metricCount: 0, firstMetricFields: [] }
  checks.push({
    id: 'analytics-metric-registry',
    status: metricsResult?.ok ? 'pass' : 'blocked',
    urlRef: 'env://deploy/env/staging.env#API_BASE_URL + /api/analytics/metrics',
    result: metricsResult ? responseDigest(metricsResult, metricChoice) : null,
  })

  checks.push(await getJsonCheck({
    id: 'dashboard-project-summary',
    url: selectedProjectId
      ? joinApiPath(apiBase, `/api/projects/${encodeURIComponent(selectedProjectId)}/dashboard/project-summary`)
      : null,
    token,
    bodySummary: (body) => summarizeProjectSummary(body, selectedProjectId),
    timeoutMs: readTimeoutMs,
    warningThresholdMs: readWarningThresholdMs,
  }))
  checks.push(await getJsonCheck({
    id: 'dashboard-projects-summary',
    url: joinApiPath(apiBase, '/api/company/dashboard/projects-summary'),
    token,
    bodySummary: (body) => summarizeProjectsSummary(body, selectedProjectId),
    timeoutMs: readTimeoutMs,
    warningThresholdMs: readWarningThresholdMs,
  }))
  checks.push(await getJsonCheck({
    id: 'dashboard-company-summary',
    url: joinApiPath(apiBase, '/api/company/dashboard/company-summary'),
    token,
    bodySummary: summarizeCompanySummary,
    timeoutMs: readTimeoutMs,
    warningThresholdMs: readWarningThresholdMs,
  }))
  checks.push(await getJsonCheck({
    id: 'analytics-project-trend',
    url: selectedProjectId && metricChoice.metric
      ? joinApiPath(apiBase, `/api/analytics/project-trend?projectId=${encodeURIComponent(selectedProjectId)}&metric=${encodeURIComponent(metricChoice.metric)}`)
      : null,
    token,
    bodySummary: summarizeTrend,
    timeoutMs: readTimeoutMs,
    warningThresholdMs: readWarningThresholdMs,
  }))
  checks.push(await getJsonCheck({
    id: 'analytics-company-trend',
    url: metricChoice.metric
      ? joinApiPath(apiBase, `/api/analytics/company-trend?metric=${encodeURIComponent(metricChoice.metric)}`)
      : null,
    token,
    bodySummary: summarizeTrend,
    timeoutMs: readTimeoutMs,
    warningThresholdMs: readWarningThresholdMs,
  }))
  checks.push(await getJsonCheck({
    id: 'reports-s-curve',
    url: selectedProjectId
      ? joinApiPath(apiBase, `/api/projects/${encodeURIComponent(selectedProjectId)}/reports/s-curve`)
      : null,
    token,
    bodySummary: summarizeSCurve,
    timeoutMs: readTimeoutMs,
    warningThresholdMs: readWarningThresholdMs,
  }))

  const hardRequired = [
    'auth-login',
    'workspace-read',
    'analytics-metric-registry',
    'dashboard-project-summary',
    'dashboard-projects-summary',
    'dashboard-company-summary',
    'reports-s-curve',
  ]
  const failedRequired = hardRequired.filter((id) => checks.find((check) => check.id === id)?.status !== 'pass')
  const status = envCheck.status === 'pass' && failedRequired.length === 0
    ? 'support_passed'
    : 'support_blocked'
  const report = {
    schemaVersion: 'workbuddy/v14241-real-uat09-bi-ssot-readonly/v1',
    generatedAt: now.toISOString(),
    status,
    scenarioId: 'REAL-UAT-09',
    environment: 'staging',
    targetClass,
    envFile: rel(absoluteEnvFile),
    mutationBoundary: 'read-only HTTP API probe; no create/update/delete/export download/publish/drop operations executed',
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
    supportOnlyReason: 'REAL-UAT-09 full pass still requires browser screenshots/traces, metric-lineage readback, report export sample, target ids, and cleanup/readback under the scenario evidence contract.',
    selectedTargetRefs: {
      companyId: selectedCompanyId,
      projectId: selectedProjectId,
      metric: metricChoice.metric,
    },
    envCheck,
    checks,
    summary: {
      requiredCheckCount: hardRequired.length,
      passedRequiredCheckCount: hardRequired.length - failedRequired.length,
      failedRequiredCheckIds: failedRequired,
      totalCheckCount: checks.length,
      passedCheckCount: checks.filter((check) => check.status === 'pass').length,
      skippedCheckCount: checks.filter((check) => check.status === 'skipped').length,
      slowReadWarningIds: checks.filter((check) => check.warning?.code === 'READ_LATENCY_OVER_WARNING_THRESHOLD').map((check) => check.id),
      readWarningThresholdMs,
    },
    lineageHints: {
      dashboardProjectSummaryRoute: 'server/src/routes/dashboard.ts:/api/projects/:projectId/dashboard/project-summary -> projectExecutionSummaryService',
      dashboardCompanySummaryRoute: 'server/src/routes/dashboard.ts:/api/company/dashboard/company-summary -> projectExecutionSummaryService + project_daily_snapshot health history',
      analyticsMetricRegistryRoute: 'server/src/routes/analytics.ts:/api/analytics/metrics -> metricRegistryService',
      reportsSCurveRoute: 'server/src/routes/reports.ts:/api/projects/:projectId/reports/s-curve -> project_daily_snapshot + projectExecutionSummaryService fallback',
    },
    boundary: {
      localRuntimeWithStagingEnvRefsIsNotDeployedStaging: targetClass === 'local_runtime_with_staging_env_refs',
      noBrowserScreenshotsOrTraceCaptured: true,
      noReportExportSampleDownloaded: true,
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
    throw new Error('refusing_to_write_bi_ssot_probe_report_with_secret_like_text')
  }
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

async function main() {
  const envFile = resolve(argValue('--env-file', defaultEnvFile))
  const output = resolve(argValue('--output', defaultOutput))
  const report = await runBiSsotReadonlyProbe({
    envFile,
    output,
    publicOrigin: argValue('--public-origin', process.env.PUBLIC_HTTPS_ORIGIN ?? ''),
  })
  console.log(JSON.stringify({
    status: report.status,
    scenarioId: report.scenarioId,
    environment: report.environment,
    targetClass: report.targetClass,
    passedRequiredCheckCount: report.summary.passedRequiredCheckCount,
    requiredCheckCount: report.summary.requiredCheckCount,
    failedRequiredCheckIds: report.summary.failedRequiredCheckIds,
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
