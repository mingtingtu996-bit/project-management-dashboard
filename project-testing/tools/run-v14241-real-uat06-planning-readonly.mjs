#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolvePublicHttpsOrigin } from '../../scripts/public-origin.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultEnvFile = join(repoRoot, 'deploy', 'env', 'staging.env')
const defaultOutput = join(defaultReleaseDir, 'v14241-real-uat06-planning-readonly.json')
const DEFAULT_MAX_PROJECT_CANDIDATES = 15

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

function toArray(value) {
  return Array.isArray(value) ? value : []
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

async function request({ url, method = 'GET', headers = {}, body = undefined, timeoutMs = 10000 }) {
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
      bodyBytes: text.length,
    }
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      elapsedMs: Date.now() - startedAt,
      errorCode: error?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'FETCH_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      body: null,
      bodyBytes: 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function buildAuthHeaders(token) {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  }
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

function workspaceProjectCandidates(body, limit = DEFAULT_MAX_PROJECT_CANDIDATES) {
  const data = unwrapData(body) ?? {}
  const seen = new Set()
  const candidates = []
  for (const source of ['companyProjects', 'myProjects']) {
    for (const item of toArray(data[source])) {
      const id = String(item?.id ?? '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      candidates.push({
        projectId: id,
        source,
        role: item?.myRole ?? item?.role ?? null,
      })
      if (candidates.length >= limit) return candidates
    }
  }
  return candidates
}

function summarizeFieldRegistry(body) {
  const data = unwrapData(body) ?? {}
  const fields = toArray(data.fields)
  const groups = toArray(data.groups)
  return {
    registryVersion: data.registryVersion ?? null,
    surface: data.surface ?? null,
    fieldCount: fields.length,
    groupCount: groups.length,
    requiredFieldCount: fields.filter((field) => toArray(field?.validators).some((validator) => validator?.severity === 'block_save')).length,
    editableFieldCount: fields.filter((field) => toArray(field?.editableIn).length > 0).length,
  }
}

function summarizeBaselineList(body) {
  const items = toArray(unwrapData(body))
  const first = items[0] ?? null
  return {
    baselineCount: items.length,
    statusCounts: countBy(items.map((item) => item?.status)),
    firstBaselineId: first?.id ?? null,
    firstBaselineStatus: first?.status ?? null,
    hasCurrentExecutionBaseline: items.some((item) => item?.is_current_execution === true),
  }
}

function summarizeBaselineDetail(body) {
  const data = unwrapData(body) ?? {}
  const items = toArray(data.items)
  return {
    id: data.id ?? null,
    status: data.status ?? null,
    version: data.version ?? null,
    itemCount: items.length,
    hasDiffSummary: Boolean(data.diffSummary || data.diff_summary),
  }
}

function summarizeMonthlyPlanList(body) {
  const items = toArray(unwrapData(body))
  const first = items[0] ?? null
  return {
    monthlyPlanCount: items.length,
    statusCounts: countBy(items.map((item) => item?.status)),
    firstPlanId: first?.id ?? null,
    firstPlanStatus: first?.status ?? null,
    pendingCloseoutTotal: items.reduce((sum, item) => sum + Number(item?.pending_closeout_count ?? 0), 0),
  }
}

function summarizeMonthlyPlanDetail(body) {
  const data = unwrapData(body) ?? {}
  const items = toArray(data.items)
  return {
    id: data.id ?? null,
    status: data.status ?? null,
    version: data.version ?? null,
    month: data.month ?? null,
    itemCount: items.length,
    pendingCloseoutCount: Number(data.pending_closeout_count ?? 0),
  }
}

function summarizeGovernance(body) {
  const data = unwrapData(body) ?? {}
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    hasHealth: Boolean(data.health || data.health_status || data.healthStatus),
    hasIntegrity: Boolean(data.mapping_integrity || data.mappingIntegrity || data.integrity),
    hasCloseout: Boolean(data.closeout || data.closeout_state || data.closeoutState),
    hasAnomaly: Boolean(data.anomaly || data.anomalies),
  }
}

function summarizeLock(body) {
  const data = unwrapData(body) ?? {}
  const lock = data.lock ?? data
  return {
    lockPresent: Boolean(lock?.id),
    lockStatus: lock?.status ?? null,
    lockedByRefPresent: Boolean(lock?.locked_by || lock?.lockedBy || lock?.actor_user_id),
  }
}

function summarizeCloseout(body) {
  const data = unwrapData(body) ?? {}
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    totalItems: data.totalItems ?? data.total_items ?? null,
    remainingCount: data.remainingCount ?? data.remaining_count ?? null,
    carryoverCount: data.carryoverCount ?? data.carryover_count ?? null,
  }
}

function countBy(values) {
  const counts = {}
  for (const value of values) {
    const key = String(value ?? 'unknown')
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

async function getJsonCheck({
  id,
  url,
  token,
  bodySummary,
  expect = (result) => result.ok,
  passOnNotFound = false,
  timeoutMs = 10000,
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
  const expected = expect(result) || (passOnNotFound && result.httpStatus === 404)
  return {
    id,
    status: expected ? 'pass' : 'blocked',
    urlRef: 'derived-from-env-and-selected-targets',
    result: responseDigest(result, result.ok && bodySummary ? bodySummary(result.body) : undefined),
    ...(passOnNotFound && result.httpStatus === 404 ? { boundary: 'not_found_is_valid_no_active_lock_readback' } : {}),
  }
}

async function readProjectPlanningCounts({ apiBase, token, projectId }) {
  const [baselineResult, monthlyResult] = await Promise.all([
    request({
      url: joinApiPath(apiBase, `/api/task-baselines?project_id=${encodeURIComponent(projectId)}`),
      headers: buildAuthHeaders(token),
      timeoutMs: 8000,
    }),
    request({
      url: joinApiPath(apiBase, `/api/monthly-plans?project_id=${encodeURIComponent(projectId)}`),
      headers: buildAuthHeaders(token),
      timeoutMs: 8000,
    }),
  ])
  const baselineSummary = baselineResult.ok ? summarizeBaselineList(baselineResult.body) : null
  const monthlySummary = monthlyResult.ok ? summarizeMonthlyPlanList(monthlyResult.body) : null
  return {
    projectId,
    baselineHttpStatus: baselineResult.httpStatus,
    monthlyHttpStatus: monthlyResult.httpStatus,
    baselineCount: baselineSummary?.baselineCount ?? null,
    monthlyPlanCount: monthlySummary?.monthlyPlanCount ?? null,
    baselineFirstId: baselineSummary?.firstBaselineId ?? null,
    monthlyFirstId: monthlySummary?.firstPlanId ?? null,
  }
}

async function choosePlanningProbeTarget({ apiBase, token, workspaceBody, fallbackProjectId, maxProjectCandidates }) {
  const candidates = workspaceProjectCandidates(workspaceBody, maxProjectCandidates)
  if (candidates.length === 0 && fallbackProjectId) {
    candidates.push({ projectId: fallbackProjectId, source: 'workspace-selected-fallback', role: null })
  }

  const probes = []
  for (const candidate of candidates) {
    const probe = await readProjectPlanningCounts({ apiBase, token, projectId: candidate.projectId })
    probes.push({ ...candidate, ...probe })
    if (Number(probe.baselineCount ?? 0) > 0 && Number(probe.monthlyPlanCount ?? 0) > 0) {
      return {
        selectedProjectId: candidate.projectId,
        reason: 'found_project_with_baseline_and_monthly_plan',
        candidatesScanned: probes,
      }
    }
  }

  const withAnyPlanningData = probes.find((probe) => (
    Number(probe.baselineCount ?? 0) > 0 || Number(probe.monthlyPlanCount ?? 0) > 0
  ))
  if (withAnyPlanningData) {
    return {
      selectedProjectId: withAnyPlanningData.projectId,
      reason: 'found_project_with_partial_planning_data',
      candidatesScanned: probes,
    }
  }

  return {
    selectedProjectId: candidates[0]?.projectId ?? fallbackProjectId ?? null,
    reason: probes.length > 0 ? 'no_project_with_readable_planning_data' : 'no_project_candidates_available',
    candidatesScanned: probes,
  }
}

async function login({ apiBase, env, publicOrigin }) {
  const loginUrl = joinApiPath(apiBase, '/api/auth/login')
  const resolvedPublicOrigin = resolvePublicHttpsOrigin({ apiBaseUrl: apiBase, publicOrigin })
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

  return {
    token,
    attempts,
    status: token ? 'pass' : 'blocked',
    reason: token ? null : 'login_failed',
  }
}

export async function runPlanningReadonlyProbe({
  envFile = defaultEnvFile,
  output = defaultOutput,
  now = new Date(),
  maxProjectCandidates = DEFAULT_MAX_PROJECT_CANDIDATES,
  publicOrigin = null,
} = {}) {
  const absoluteEnvFile = resolve(envFile)
  const env = await readEnvFile(absoluteEnvFile)
  const envCheck = checkEnv(env)
  const apiBase = normalizeBaseUrl(env.API_BASE_URL)
  const clientBase = normalizeBaseUrl(env.CLIENT_BASE_URL)
  const targetClass = classifyTarget(apiBase, clientBase)
  const loginResult = envCheck.status === 'pass'
    ? await login({ apiBase, env, publicOrigin })
    : { token: null, attempts: [], status: 'blocked', reason: 'env_check_failed' }
  const token = loginResult.token
  const checks = [
    {
      id: 'auth-login',
      status: loginResult.status,
      reason: loginResult.reason,
      rawTokenWrittenToReport: false,
      attempts: loginResult.attempts,
    },
  ]

  const workspaceUrl = joinApiPath(apiBase, '/api/workspace')
  const workspaceResult = token && workspaceUrl
    ? await request({ url: workspaceUrl, headers: buildAuthHeaders(token), timeoutMs: 8000 })
    : null
  const workspaceSummary = workspaceResult?.ok ? summarizeWorkspace(workspaceResult.body) : null
  checks.push({
    id: 'workspace-read',
    status: workspaceResult?.ok ? 'pass' : 'blocked',
    rawTokenWrittenToReport: false,
    urlRef: 'env://deploy/env/staging.env#API_BASE_URL + /api/workspace',
    result: workspaceResult ? responseDigest(workspaceResult, workspaceSummary) : null,
  })

  const initialProjectId = workspaceSummary?.selectedProjectId ?? null
  const targetSelection = token && workspaceResult?.ok
    ? await choosePlanningProbeTarget({
      apiBase,
      token,
      workspaceBody: workspaceResult.body,
      fallbackProjectId: initialProjectId,
      maxProjectCandidates,
    })
    : { selectedProjectId: initialProjectId, reason: 'workspace_unavailable', candidatesScanned: [] }
  const projectId = targetSelection.selectedProjectId ?? null
  const companyId = workspaceSummary?.currentCompanyId ?? null
  checks.push({
    id: 'planning-project-candidate-selection',
    status: projectId ? 'pass' : 'blocked',
    reason: targetSelection.reason,
    result: {
      bodySummary: {
        maxProjectCandidates,
        scannedCount: targetSelection.candidatesScanned.length,
        selectedProjectId: projectId,
        selectedReason: targetSelection.reason,
        candidates: targetSelection.candidatesScanned.map((candidate) => ({
          projectId: candidate.projectId,
          source: candidate.source,
          role: candidate.role,
          baselineHttpStatus: candidate.baselineHttpStatus,
          monthlyHttpStatus: candidate.monthlyHttpStatus,
          baselineCount: candidate.baselineCount,
          monthlyPlanCount: candidate.monthlyPlanCount,
        })),
      },
    },
  })

  checks.push(await getJsonCheck({
    id: 'planning-field-registry-baseline',
    url: projectId ? joinApiPath(apiBase, `/api/planning/field-registry?projectId=${encodeURIComponent(projectId)}&surface=baseline`) : null,
    token,
    bodySummary: summarizeFieldRegistry,
  }))
  checks.push(await getJsonCheck({
    id: 'planning-field-registry-monthly',
    url: projectId ? joinApiPath(apiBase, `/api/planning/field-registry?projectId=${encodeURIComponent(projectId)}&surface=monthly_plan`) : null,
    token,
    bodySummary: summarizeFieldRegistry,
  }))
  checks.push(await getJsonCheck({
    id: 'planning-governance-read',
    url: projectId ? joinApiPath(apiBase, `/api/planning-governance?projectId=${encodeURIComponent(projectId)}`) : null,
    token,
    bodySummary: summarizeGovernance,
    timeoutMs: 15000,
  }))
  const baselineListCheck = await getJsonCheck({
    id: 'task-baseline-list-read',
    url: projectId ? joinApiPath(apiBase, `/api/task-baselines?project_id=${encodeURIComponent(projectId)}`) : null,
    token,
    bodySummary: summarizeBaselineList,
    timeoutMs: 15000,
  })
  checks.push(baselineListCheck)
  const baselineId = baselineListCheck.result?.bodySummary?.firstBaselineId ?? null
  checks.push(await getJsonCheck({
    id: 'task-baseline-detail-read',
    url: baselineId ? joinApiPath(apiBase, `/api/task-baselines/${encodeURIComponent(baselineId)}?project_id=${encodeURIComponent(projectId)}`) : null,
    token,
    bodySummary: summarizeBaselineDetail,
    timeoutMs: 15000,
  }))
  checks.push(await getJsonCheck({
    id: 'task-baseline-lock-readback',
    url: baselineId ? joinApiPath(apiBase, `/api/task-baselines/${encodeURIComponent(baselineId)}/lock`) : null,
    token,
    bodySummary: summarizeLock,
    passOnNotFound: true,
  }))

  const monthlyListCheck = await getJsonCheck({
    id: 'monthly-plan-list-read',
    url: projectId ? joinApiPath(apiBase, `/api/monthly-plans?project_id=${encodeURIComponent(projectId)}`) : null,
    token,
    bodySummary: summarizeMonthlyPlanList,
    timeoutMs: 15000,
  })
  checks.push(monthlyListCheck)
  const monthlyPlanId = monthlyListCheck.result?.bodySummary?.firstPlanId ?? null
  checks.push(await getJsonCheck({
    id: 'monthly-plan-detail-read',
    url: monthlyPlanId ? joinApiPath(apiBase, `/api/monthly-plans/${encodeURIComponent(monthlyPlanId)}`) : null,
    token,
    bodySummary: summarizeMonthlyPlanDetail,
    timeoutMs: 15000,
  }))
  checks.push(await getJsonCheck({
    id: 'monthly-plan-lock-readback',
    url: monthlyPlanId ? joinApiPath(apiBase, `/api/monthly-plans/${encodeURIComponent(monthlyPlanId)}/lock`) : null,
    token,
    bodySummary: summarizeLock,
    passOnNotFound: true,
  }))
  checks.push(await getJsonCheck({
    id: 'monthly-plan-closeout-summary-read',
    url: monthlyPlanId ? joinApiPath(apiBase, `/api/monthly-plans/${encodeURIComponent(monthlyPlanId)}/closeout-summary`) : null,
    token,
    bodySummary: summarizeCloseout,
    timeoutMs: 15000,
  }))

  const hardRequired = [
    'auth-login',
    'workspace-read',
    'planning-project-candidate-selection',
    'planning-field-registry-baseline',
    'planning-field-registry-monthly',
    'planning-governance-read',
    'task-baseline-list-read',
    'monthly-plan-list-read',
  ]
  const dataPresenceRequired = [
    { id: 'task-baseline-list-read', countPath: ['result', 'bodySummary', 'baselineCount'], reason: 'no_readable_baseline_versions' },
    { id: 'monthly-plan-list-read', countPath: ['result', 'bodySummary', 'monthlyPlanCount'], reason: 'no_readable_monthly_plans' },
  ]
  const failedRequired = hardRequired.filter((id) => checks.find((check) => check.id === id)?.status !== 'pass')
  const missingData = dataPresenceRequired.filter((requirement) => {
    const check = checks.find((item) => item.id === requirement.id)
    const count = requirement.countPath.reduce((current, key) => current?.[key], check)
    return !Number.isFinite(Number(count)) || Number(count) <= 0
  })
  const status = envCheck.status === 'pass' && failedRequired.length === 0 && missingData.length === 0
    ? 'support_passed'
    : 'support_blocked'

  const report = {
    schemaVersion: 'workbuddy/v14241-real-uat06-planning-readonly/v1',
    generatedAt: now.toISOString(),
    status,
    scenarioId: 'REAL-UAT-06',
    environment: 'staging',
    targetClass,
    envFile: rel(absoluteEnvFile),
    mutationBoundary: 'read-only HTTP API probe; no create/update/delete/commit/publish/confirm/close/reorder/lock acquisition executed',
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
    supportOnlyReason: 'REAL-UAT-06 full pass still requires writable UAT/staging/solo-live/live scenario replay for draft creation, concurrent edit, approval, confirm/publish, revision rollback, closeout readback, audit, target ids, and cleanup/rollback.',
    selectedTargetRefs: {
      companyId,
      projectId,
      baselineId,
      monthlyPlanId,
    },
    envCheck,
    checks,
    summary: {
      requiredCheckCount: hardRequired.length,
      passedRequiredCheckCount: hardRequired.length - failedRequired.length,
      failedRequiredCheckIds: failedRequired,
      missingDataReasons: missingData.map((item) => item.reason),
      totalCheckCount: checks.length,
      passedCheckCount: checks.filter((check) => check.status === 'pass').length,
      skippedCheckCount: checks.filter((check) => check.status === 'skipped').length,
    },
    lineageHints: {
      fieldRegistryRoute: 'server/src/routes/planningFieldRegistry.ts:/api/planning/field-registry -> planningFieldRegistryService',
      governanceRoute: 'server/src/routes/planning-governance.ts:/api/planning-governance -> planningGovernanceService.scanProjectGovernance',
      baselineRoutes: 'server/src/routes/task-baselines.ts -> planningStateMachine baseline endpoints and draft lock routes',
      monthlyRoutes: 'server/src/routes/monthly-plans.ts -> planningStateMachine monthly_plan endpoints, closeout, and draft lock routes',
      stateMachineContract: 'server/src/services/planningStateMachine.ts',
    },
    boundary: {
      localRuntimeWithStagingEnvRefsIsNotDeployedStaging: targetClass === 'local_runtime_with_staging_env_refs',
      noBrowserScreenshotsOrTraceCaptured: true,
      noConcurrentDraftMutationExecuted: true,
      noApprovalConfirmRollbackExecuted: true,
      noAuditRowReadbackCaptured: true,
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
    throw new Error('refusing_to_write_planning_probe_report_with_secret_like_text')
  }
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

async function main() {
  const envFile = resolve(argValue('--env-file', defaultEnvFile))
  const output = resolve(argValue('--output', defaultOutput))
  const maxProjectCandidates = Number(argValue('--max-project-candidates', String(DEFAULT_MAX_PROJECT_CANDIDATES)))
  const report = await runPlanningReadonlyProbe({
    envFile,
    output,
    maxProjectCandidates,
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
    missingDataReasons: report.summary.missingDataReasons,
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
