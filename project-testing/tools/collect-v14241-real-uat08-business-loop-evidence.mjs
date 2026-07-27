#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { resolvePublicHttpsOrigin } from '../../scripts/public-origin.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.controlled-staging.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultRefsEnvFile = join(repoRoot, '.tmp', 'v14241-controlled-staging', 'v14241-controlled-staging.refs.env')
const scenarioId = 'REAL-UAT-08'

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

async function readTextIfPresent(path) {
  if (!existsSync(path)) return ''
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
}

function parseEnvText(text) {
  const values = {}
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    values[key] = line.slice(line.indexOf('=') + 1).trim()
  }
  return values
}

async function readEnvFile(path) {
  return parseEnvText(await readTextIfPresent(resolve(path)))
}

async function resolveEnvRef(ref) {
  const value = String(ref ?? '').trim()
  const match = /^env:\/\/(.+)#([A-Z0-9_]+)$/i.exec(value)
  if (!match) return { status: 'unsupported_ref', ref }
  const envPath = resolve(repoRoot, match[1])
  const key = match[2]
  const env = await readEnvFile(envPath)
  const resolved = env[key] ?? ''
  return resolved
    ? { status: 'resolved', ref, value: resolved, path: rel(envPath), key }
    : { status: 'missing_env_value', ref, path: rel(envPath), key }
}

function scenarioRefs(handoff, tier) {
  return handoff.scenarios?.[scenarioId]?.tiers?.[tier] ?? {}
}

async function resolveExecutionRefs(handoff, tier) {
  const envTarget = handoff.environmentTargets?.[tier] ?? {}
  const scenarioTier = scenarioRefs(handoff, tier)
  const credentials = envTarget.credentialRefs ?? {}
  const targetRefs = scenarioTier.targetRefs ?? {}
  const actorRefs = scenarioTier.actorRefs ?? {}
  const expectedEvidenceRefs = scenarioTier.expectedEvidenceRefs ?? {}
  const refs = {
    apiBase: tier === 'staging' ? envTarget.apiBaseUrlRef : envTarget.apiBaseUrlRef || envTarget.baseUrlRef,
    clientBase: tier === 'staging' ? envTarget.clientBaseUrlRef : envTarget.clientBaseUrlRef || envTarget.baseUrlRef,
    username: credentials.testUserEmailRef || envTarget.roleAccountRefs?.project_admin || envTarget.roleAccountRefs?.company_admin || actorRefs.primaryTesterRef,
    password: credentials.testUserPasswordRef,
    companyId: targetRefs.companyIdRef,
    projectId: targetRefs.projectIdRef,
    materialRiskIssueSeedRef: targetRefs.materialRiskIssueSeedRef,
    responsibleUserRef: actorRefs.responsibleUserRef,
    notificationChannelRef: expectedEvidenceRefs.notificationChannelRef,
  }
  const resolved = {}
  const issues = []
  for (const [key, ref] of Object.entries(refs)) {
    const result = await resolveEnvRef(ref)
    resolved[key] = result
    if (result.status !== 'resolved') issues.push(`${key}:${result.status}`)
  }
  return { resolved, issues }
}

function normalizeTier(value) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'UAT' || normalized === 'staging' || normalized === 'solo-live' || normalized === 'live') return normalized
  throw new Error(`Unsupported tier: ${value}. Expected UAT, staging, solo-live, or live.`)
}

function tierUnlockIssues(tier, flags) {
  const requiredFlag = tier === 'UAT' ? '--include-uat' : tier === 'staging' ? '--include-staging' : tier === 'solo-live' ? '--include-solo-live' : '--include-live'
  return [
    flags[requiredFlag] ? null : `missing ${requiredFlag}`,
    flags['--confirm-real-handoff'] ? null : 'missing --confirm-real-handoff',
    flags['--allow-write'] ? null : 'missing --allow-write',
  ].filter(Boolean)
}

function joinApiPath(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
}

function unwrapData(body) {
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

function sanitize(value, redactions = []) {
  if (typeof value === 'string') {
    let output = value
    for (const redaction of redactions) {
      if (redaction && redaction.length > 0) output = output.split(redaction).join('<redacted>')
    }
    return output
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<redacted-jwt>')
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://<redacted>')
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, redactions))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitize(child, redactions)]))
  }
  return value
}

function summarizeBody(body, redactions = []) {
  const data = sanitize(unwrapData(body), redactions)
  if (Array.isArray(data)) {
    return {
      type: 'array',
      itemCount: data.length,
      firstItemFields: Object.keys(data[0] ?? {}).slice(0, 12),
    }
  }
  if (!data || typeof data !== 'object') return { type: typeof data }
  return {
    type: 'object',
    topLevelFields: Object.keys(data).slice(0, 16),
    id: data.id ?? data.projectId ?? null,
    status: data.status ?? null,
    title: data.title ?? null,
    count: data.count ?? undefined,
  }
}

function responseDigest(result, redactions = []) {
  return {
    ok: result.ok,
    status: result.status,
    elapsedMs: result.elapsedMs,
    contentType: result.contentType ?? null,
    bodySummary: result.body === undefined ? undefined : summarizeBody(result.body, redactions),
  }
}

async function requestJson({ url, method = 'GET', headers = {}, body = undefined, timeoutMs = 30000 }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = { rawTextLength: text.length }
    }
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      contentType: response.headers.get('content-type') ?? null,
      body: parsed,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      contentType: null,
      body: { error: error instanceof Error ? error.message : String(error) },
    }
  } finally {
    clearTimeout(timer)
  }
}

function authHeaders(token, companyId = null) {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    ...(companyId ? { 'x-company-id': companyId } : {}),
  }
}

async function login({ apiBase, username, password, redactions, publicOrigin }) {
  const result = await requestJson({
    url: joinApiPath(apiBase, '/api/auth/login'),
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: publicOrigin },
    body: { username, password },
    timeoutMs: 10000,
  })
  const token = result.body?.data?.token ?? null
  return { result, token, digest: responseDigest(result, [...redactions, token].filter(Boolean)) }
}

export function buildRiskPayload({ projectId, taskId, runId }) {
  return {
    project_id: projectId,
    task_id: taskId,
    title: `REAL-UAT-08 ${runId} 材料到场进度风险`,
    description: 'controlled staging UAT business-loop risk linked to material readiness and a task responsibility chain',
    level: 'medium',
    status: 'identified',
    probability: 70,
    impact: 60,
    mitigation: '责任人复核材料到场时间并同步任务计划。',
    risk_category: 'progress',
    source_type: 'manual',
  }
}

export function buildRiskSourcedIssuePayload({ projectId, taskId, riskId, runId }) {
  return {
    project_id: projectId,
    task_id: taskId,
    title: `REAL-UAT-08 ${runId} 风险转问题闭环`,
    description: 'controlled staging UAT issue converted from the created risk; expected to emit a dashboard_todo notification',
    source_type: 'risk_converted',
    source_id: riskId,
    source_entity_type: 'risk',
    source_entity_id: riskId,
    severity: 'high',
    priority: 80,
    pending_manual_close: false,
    status: 'open',
  }
}

export function buildMaterialConditionPayload({ projectId, taskId, runId }) {
  return {
    project_id: projectId,
    task_id: taskId,
    condition_name: `REAL-UAT-08 ${runId} 材料到场条件`,
    condition_type: 'material',
    description: 'controlled staging UAT material readiness condition linked to the selected task',
    is_satisfied: false,
    target_date: '2026-07-31',
  }
}

function checkStatus(id, condition, extra = {}) {
  return { id, status: condition ? 'pass' : 'blocked', ...extra }
}

export function assertNoSecretLikeText(report, redactions = []) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_real_uat08_report_with_secret_like_text')
  }
  for (const redaction of redactions) {
    if (redaction && text.includes(redaction)) {
      throw new Error('refusing_to_write_real_uat08_report_with_raw_secret_or_credential_text')
    }
  }
}

async function writeJsonEvidence(path, doc, redactions) {
  assertNoSecretLikeText(doc, redactions)
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(resolve(path), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
}

function arrayData(result) {
  const data = unwrapData(result.body)
  return Array.isArray(data) ? data : []
}

function firstId(body) {
  return String(unwrapData(body)?.id ?? '').trim()
}

function failedCheckIds(checks) {
  return checks.filter((check) => check.status !== 'pass').map((check) => check.id)
}

export function entityCleanupStatus(deleteResult, readResult, retainedStatusSet = new Set(['closed', 'resolved', '已确认'])) {
  const data = unwrapData(readResult.body)
  const status = String(data?.status ?? '').trim().toLowerCase()
  const absent = readResult.status === 404
  const retainedClosed = readResult.ok && (retainedStatusSet.has(status) || data?.is_satisfied === true)
  return {
    status: absent || retainedClosed ? 'pass' : 'blocked',
    deleteResult: {
      ok: deleteResult.ok,
      status: deleteResult.status,
      elapsedMs: deleteResult.elapsedMs,
    },
    readback: {
      ok: readResult.ok,
      status: readResult.status,
      retainedStatus: status || null,
      absent,
      retainedClosed,
      retainedSatisfied: data?.is_satisfied === true,
    },
  }
}

export async function collectUat08BusinessLoopEvidence({
  tier = 'staging',
  releaseDir = defaultReleaseDir,
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  refsEnvFile = defaultRefsEnvFile,
  artifactRoot = null,
  flags = {},
  publicOrigin = null,
  now = new Date(),
} = {}) {
  const normalizedTier = normalizeTier(tier)
  const startedAt = now.toISOString()
  const resolvedReleaseDir = resolve(releaseDir)
  const resolvedRefsEnvFile = resolve(refsEnvFile)
  const resolvedArtifactRoot = resolve(artifactRoot ?? join(resolvedReleaseDir, 'v14241-real-env-evidence', normalizedTier.toLowerCase()))
  const evidenceDir = join(resolvedArtifactRoot, 'operator-evidence')
  const readbackDir = join(resolvedArtifactRoot, 'operator-readbacks')
  const mainPath = join(evidenceDir, 'real-uat-08-business-loop.json')
  const notificationPath = join(evidenceDir, 'notification-readback.json')
  const responsibilityPath = join(evidenceDir, 'responsibility-chain-readback.json')
  const tracePath = join(evidenceDir, 'real-uat-08-api-trace.json')
  const cleanupPath = join(readbackDir, 'real-uat-08-cleanup-readback.json')
  const handoff = await readJson(resolve(handoffFile))
  const checks = []
  const commands = []
  const apiTrace = []

  const flagsIssues = tierUnlockIssues(normalizedTier, flags)
  checks.push(checkStatus('execution-unlock', flagsIssues.length === 0, { blockers: flagsIssues }))

  const refs = await resolveExecutionRefs(handoff, normalizedTier)
  checks.push(checkStatus('execution-refs-resolved', refs.issues.length === 0, { issues: refs.issues }))
  if (flagsIssues.length > 0 || refs.issues.length > 0) {
    const blocked = {
      schemaVersion: 'workbuddy/v14241-real-uat08-business-loop-evidence/v1',
      generatedAt: startedAt,
      status: 'blocked',
      environment: normalizedTier,
      blockers: [...flagsIssues, ...refs.issues],
      refsEnvFile: rel(resolvedRefsEnvFile),
      rawCredentialWrittenToReport: false,
    }
    await writeJsonEvidence(mainPath, blocked, [])
    return {
      status: 'blocked',
      scenarioId,
      tier: normalizedTier,
      commandsExecuted: 0,
      canCloseScenarioTier: false,
      blockers: blocked.blockers,
      outputs: [rel(mainPath)],
    }
  }

  const resolved = Object.fromEntries(Object.entries(refs.resolved).map(([key, value]) => [key, value.value]))
  const redactions = [resolved.username, resolved.password]
  const apiBase = resolved.apiBase
  const resolvedPublicOrigin = resolvePublicHttpsOrigin({ apiBaseUrl: apiBase, publicOrigin })
  const companyId = resolved.companyId
  const projectId = resolved.projectId

  const loginResult = await login({
    apiBase,
    username: resolved.username,
    password: resolved.password,
    redactions,
    publicOrigin: resolvedPublicOrigin,
  })
  commands.push({ id: 'auth-login', method: 'POST', path: '/api/auth/login' })
  checks.push(checkStatus('auth-login', Boolean(loginResult.token), { result: loginResult.digest }))
  apiTrace.push({ id: 'auth-login', path: '/api/auth/login', result: loginResult.digest })
  if (!loginResult.token) {
    const blocked = {
      schemaVersion: 'workbuddy/v14241-real-uat08-business-loop-evidence/v1',
      generatedAt: startedAt,
      status: 'blocked',
      environment: normalizedTier,
      baseUrl: apiBase,
      companyId,
      projectId,
      blockers: ['auth_login_failed'],
      checks,
      rawCredentialWrittenToReport: false,
    }
    await writeJsonEvidence(mainPath, blocked, redactions)
    return {
      status: 'blocked',
      scenarioId,
      tier: normalizedTier,
      commandsExecuted: commands.length,
      canCloseScenarioTier: false,
      blockers: blocked.blockers,
      outputs: [rel(mainPath)],
    }
  }

  const token = loginResult.token
  const redactionsWithToken = [...redactions, token]
  const headers = authHeaders(token, companyId)
  const jsonHeaders = { ...headers, 'content-type': 'application/json' }
  const runId = `run-${Date.now()}-${randomUUID().slice(0, 8)}`

  async function getApi(id, path, timeoutMs = 30000) {
    const result = await requestJson({ url: joinApiPath(apiBase, path), headers, timeoutMs })
    commands.push({ id, method: 'GET', path })
    apiTrace.push({ id, path, result: responseDigest(result, redactionsWithToken) })
    return result
  }

  async function mutateApi(id, method, path, body, timeoutMs = 30000) {
    const result = await requestJson({ url: joinApiPath(apiBase, path), method, headers: jsonHeaders, body, timeoutMs })
    commands.push({ id, method, path })
    apiTrace.push({ id, path, result: responseDigest(result, redactionsWithToken) })
    return result
  }

  const me = await getApi('auth-me', '/api/auth/me', 10000)
  const actorUserId = String(unwrapData(me.body)?.user?.id ?? unwrapData(me.body)?.id ?? '').trim() || null
  checks.push(checkStatus('auth-me', me.ok && Boolean(actorUserId), { result: responseDigest(me, redactionsWithToken), actorUserIdPresent: Boolean(actorUserId) }))

  const tasks = await getApi('tasks-list', `/api/tasks?projectId=${encodeURIComponent(projectId)}&surface=task_list`, 30000)
  const task = arrayData(tasks).find((item) => String(item?.id ?? '').trim()) ?? null
  const taskId = String(task?.id ?? '').trim()
  checks.push(checkStatus('task-selected-for-business-loop', tasks.ok && Boolean(taskId), {
    result: responseDigest(tasks, redactionsWithToken),
    taskId,
    taskTitle: task?.title ?? task?.name ?? null,
  }))

  let risk = null
  let issue = null
  let condition = null
  if (taskId) {
    const riskCreate = await mutateApi('risk-create', 'POST', '/api/risks', buildRiskPayload({ projectId, taskId, runId }), 30000)
    risk = unwrapData(riskCreate.body)
    const riskId = firstId(riskCreate.body)
    checks.push(checkStatus('risk-created', riskCreate.ok && Boolean(riskId), { result: responseDigest(riskCreate, redactionsWithToken), riskId }))

    const issueCreate = riskId
      ? await mutateApi('risk-sourced-issue-create', 'POST', '/api/issues', buildRiskSourcedIssuePayload({ projectId, taskId, riskId, runId }), 30000)
      : { ok: false, status: null, body: { skipped: 'risk_id_missing' }, elapsedMs: 0, contentType: null }
    issue = unwrapData(issueCreate.body)
    const issueId = firstId(issueCreate.body)
    checks.push(checkStatus('risk-sourced-issue-created', issueCreate.ok && Boolean(issueId), { result: responseDigest(issueCreate, redactionsWithToken), issueId }))

    const conditionCreate = await mutateApi('material-condition-create', 'POST', '/api/task-conditions', buildMaterialConditionPayload({ projectId, taskId, runId }), 30000)
    condition = unwrapData(conditionCreate.body)
    const conditionId = firstId(conditionCreate.body)
    checks.push(checkStatus('material-condition-created', conditionCreate.ok && Boolean(conditionId), { result: responseDigest(conditionCreate, redactionsWithToken), conditionId }))
  }

  const riskId = String(risk?.id ?? '').trim()
  const issueId = String(issue?.id ?? '').trim()
  const conditionId = String(condition?.id ?? '').trim()

  const [riskList, issueList, conditionList, notifications, notificationSummary, responsibility, responsibilityTrends, taskReadback, focusTasks] = await Promise.all([
    getApi('risks-readback', `/api/risks?projectId=${encodeURIComponent(projectId)}`, 30000),
    getApi('issues-readback', `/api/issues?projectId=${encodeURIComponent(projectId)}`, 30000),
    getApi('material-conditions-readback', `/api/task-conditions?projectId=${encodeURIComponent(projectId)}&limit=500`, 30000),
    getApi('notifications-readback', `/api/notifications?projectId=${encodeURIComponent(projectId)}&touchpointType=all&limit=100`, 30000),
    getApi('notifications-summary', `/api/notifications/summary?projectId=${encodeURIComponent(projectId)}`, 30000),
    getApi('responsibility-insights', `/api/projects/${encodeURIComponent(projectId)}/responsibility`, 30000),
    getApi('responsibility-trends', `/api/projects/${encodeURIComponent(projectId)}/responsibility/trends?days=30&groupBy=person`, 30000),
    taskId ? getApi('task-readback', `/api/tasks/${encodeURIComponent(taskId)}`, 30000) : Promise.resolve({ ok: false, status: null, body: { skipped: 'task_id_missing' }, elapsedMs: 0, contentType: null }),
    getApi('dashboard-focus-tasks', `/api/projects/${encodeURIComponent(projectId)}/dashboard/focus-tasks?filter=today&limit=20`, 30000),
  ])

  const riskFound = riskId && arrayData(riskList).some((item) => String(item?.id ?? '') === riskId)
  const issueFound = issueId && arrayData(issueList).some((item) => String(item?.id ?? '') === issueId)
  const conditionFound = conditionId && arrayData(conditionList).some((item) => String(item?.id ?? '') === conditionId)
  const notificationRows = arrayData(notifications)
  const issueNotification = notificationRows.find((item) => (
    String(item?.source_entity_type ?? '') === 'issue' && String(item?.source_entity_id ?? '') === issueId
  )) ?? notificationRows.find((item) => String(item?.title ?? '').includes(runId))

  checks.push(checkStatus('risk-readback-found', Boolean(riskFound), { riskId, result: responseDigest(riskList, redactionsWithToken) }))
  checks.push(checkStatus('issue-readback-found', Boolean(issueFound), { issueId, result: responseDigest(issueList, redactionsWithToken) }))
  checks.push(checkStatus('material-condition-readback-found', Boolean(conditionFound), { conditionId, result: responseDigest(conditionList, redactionsWithToken) }))
  checks.push(checkStatus('issue-notification-readback-found', notifications.ok && Boolean(issueNotification), {
    notificationId: issueNotification?.id ?? null,
    notificationSourceEntityType: issueNotification?.source_entity_type ?? null,
    notificationTouchpointType: issueNotification?.touchpoint_type ?? null,
    result: responseDigest(notifications, redactionsWithToken),
  }))
  checks.push(checkStatus('notification-summary-readback', notificationSummary.ok, { result: responseDigest(notificationSummary, redactionsWithToken) }))
  checks.push(checkStatus('responsibility-insights-readback', responsibility.ok, { result: responseDigest(responsibility, redactionsWithToken) }))
  checks.push(checkStatus('responsibility-trends-readback', responsibilityTrends.ok, { result: responseDigest(responsibilityTrends, redactionsWithToken) }))
  checks.push(checkStatus('task-responsibility-chain-readback', taskReadback.ok && String(unwrapData(taskReadback.body)?.id ?? '') === taskId, {
    taskId,
    issueTaskId: issue?.task_id ?? null,
    conditionTaskId: condition?.task_id ?? null,
    result: responseDigest(taskReadback, redactionsWithToken),
  }))
  checks.push(checkStatus('dashboard-focus-tasks-readback', focusTasks.ok, { result: responseDigest(focusTasks, redactionsWithToken) }))

  const cleanupResults = {}
  if (conditionId) {
    const completeCondition = await mutateApi('cleanup-material-condition-complete', 'PUT', `/api/task-conditions/${encodeURIComponent(conditionId)}/complete`, { confirmed_by: actorUserId }, 30000)
    cleanupResults.conditionComplete = {
      ok: completeCondition.ok,
      status: completeCondition.status,
      elapsedMs: completeCondition.elapsedMs,
    }
    const deleteCondition = await mutateApi('cleanup-material-condition-delete', 'DELETE', `/api/task-conditions/${encodeURIComponent(conditionId)}`, undefined, 30000)
    const readCondition = await getApi('cleanup-material-condition-readback', `/api/task-conditions/${encodeURIComponent(conditionId)}`, 30000)
    cleanupResults.condition = entityCleanupStatus(deleteCondition, readCondition)
    checks.push(checkStatus('cleanup-material-condition', cleanupResults.condition.status === 'pass', cleanupResults.condition))
  }
  if (issueId) {
    const issueTransitions = []
    let issueCleanupRead = await getApi('cleanup-issue-state-before', `/api/issues/${encodeURIComponent(issueId)}`, 30000)
    let issueCleanupState = String(unwrapData(issueCleanupRead.body)?.status ?? '').trim()
    let issueCleanupVersion = Number(unwrapData(issueCleanupRead.body)?.version ?? 0)
    if (issueCleanupState === 'open' && issueCleanupVersion > 0) {
      const investigating = await mutateApi('cleanup-issue-to-investigating', 'PUT', `/api/issues/${encodeURIComponent(issueId)}`, { status: 'investigating', version: issueCleanupVersion }, 30000)
      issueTransitions.push({ step: 'open_to_investigating', ok: investigating.ok, status: investigating.status })
      issueCleanupRead = await getApi('cleanup-issue-state-after-investigating', `/api/issues/${encodeURIComponent(issueId)}`, 30000)
      issueCleanupState = String(unwrapData(issueCleanupRead.body)?.status ?? '').trim()
      issueCleanupVersion = Number(unwrapData(issueCleanupRead.body)?.version ?? issueCleanupVersion)
    }
    if (issueCleanupState === 'investigating' && issueCleanupVersion > 0) {
      const resolved = await mutateApi('cleanup-issue-to-resolved', 'PUT', `/api/issues/${encodeURIComponent(issueId)}`, { status: 'resolved', version: issueCleanupVersion }, 30000)
      issueTransitions.push({ step: 'investigating_to_resolved', ok: resolved.ok, status: resolved.status })
    }
    cleanupResults.issueTransitions = issueTransitions
    const deleteIssue = await mutateApi('cleanup-issue-delete', 'DELETE', `/api/issues/${encodeURIComponent(issueId)}`, undefined, 30000)
    const readIssue = await getApi('cleanup-issue-readback', `/api/issues/${encodeURIComponent(issueId)}`, 30000)
    cleanupResults.issue = entityCleanupStatus(deleteIssue, readIssue)
    checks.push(checkStatus('cleanup-issue', cleanupResults.issue.status === 'pass', cleanupResults.issue))
  }
  if (riskId) {
    const deleteRisk = await mutateApi('cleanup-risk-delete', 'DELETE', `/api/risks/${encodeURIComponent(riskId)}`, undefined, 30000)
    const readRisk = await getApi('cleanup-risk-readback', `/api/risks/${encodeURIComponent(riskId)}`, 30000)
    cleanupResults.risk = entityCleanupStatus(deleteRisk, readRisk)
    checks.push(checkStatus('cleanup-risk', cleanupResults.risk.status === 'pass', cleanupResults.risk))
  }

  const finishedAt = new Date().toISOString()
  const failedChecks = failedCheckIds(checks)
  const status = failedChecks.length === 0 ? 'pass' : 'blocked'
  const cleanupOrRollbackReadback = {
    status: ['condition', 'issue', 'risk']
      .filter((key) => cleanupResults[key])
      .every((key) => cleanupResults[key]?.status === 'pass')
      ? 'pass'
      : 'blocked',
    cleanupRequired: true,
    cleanupEvidence: rel(cleanupPath),
    details: cleanupResults,
  }
  const common = {
    environment: normalizedTier,
    baseUrl: apiBase,
    actorRefs: scenarioRefs(handoff, normalizedTier).actorRefs ?? {},
    companyId,
    projectId,
    startedAt,
    finishedAt,
    commandOrManualScript: 'node project-testing/tools/collect-v14241-real-uat08-business-loop-evidence.mjs',
    screenshotsOrTrace: [rel(tracePath)],
    apiFailureSummary: checks
      .filter((check) => check.status !== 'pass')
      .map((check) => ({ id: check.id, status: check.status })),
    consoleErrorSummary: [],
    cleanupOrRollbackReadback,
  }

  const notificationDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat08-notification-readback/v1',
    generatedAt: finishedAt,
    status: checks.find((check) => check.id === 'issue-notification-readback-found')?.status === 'pass'
      && checks.find((check) => check.id === 'notification-summary-readback')?.status === 'pass'
      ? 'pass'
      : 'blocked',
    ...common,
    notificationChannelRef: refs.resolved.notificationChannelRef.ref,
    notificationReadback: {
      issueNotificationId: issueNotification?.id ?? null,
      issueNotificationFound: Boolean(issueNotification),
      sourceEntityType: issueNotification?.source_entity_type ?? null,
      sourceEntityIdMatchesIssue: String(issueNotification?.source_entity_id ?? '') === issueId,
      touchpointType: issueNotification?.touchpoint_type ?? null,
      summary: responseDigest(notificationSummary, redactionsWithToken),
    },
    rawTokenWrittenToReport: false,
    rawCredentialWrittenToReport: false,
  }

  const responsibilityDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat08-responsibility-chain-readback/v1',
    generatedAt: finishedAt,
    status: checks.find((check) => check.id === 'responsibility-insights-readback')?.status === 'pass'
      && checks.find((check) => check.id === 'responsibility-trends-readback')?.status === 'pass'
      && checks.find((check) => check.id === 'task-responsibility-chain-readback')?.status === 'pass'
      ? 'pass'
      : 'blocked',
    ...common,
    responsibleUserRef: refs.resolved.responsibleUserRef.ref,
    actorUserIdPresent: Boolean(actorUserId),
    chain: {
      taskId,
      riskId,
      issueId,
      conditionId,
      issueTaskId: issue?.task_id ?? null,
      conditionTaskId: condition?.task_id ?? null,
      sameTaskChain: Boolean(taskId && issue?.task_id === taskId && condition?.task_id === taskId),
    },
    responsibilityApi: {
      insights: responseDigest(responsibility, redactionsWithToken),
      trends: responseDigest(responsibilityTrends, redactionsWithToken),
      focusTasks: responseDigest(focusTasks, redactionsWithToken),
    },
    rawTokenWrittenToReport: false,
    rawCredentialWrittenToReport: false,
  }

  const traceDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat08-api-trace/v1',
    generatedAt: finishedAt,
    status,
    ...common,
    rawTokenWrittenToReport: false,
    rawCredentialWrittenToReport: false,
    commandsExecuted: commands.length,
    commands,
    checks: checks.map((check) => sanitize(check, redactionsWithToken)),
    apiTrace,
  }

  const cleanupDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat08-cleanup-readback/v1',
    generatedAt: finishedAt,
    status: cleanupOrRollbackReadback.status,
    environment: normalizedTier,
    baseUrl: apiBase,
    companyId,
    projectId,
    createdEntityIds: { taskId, riskId, issueId, conditionId },
    cleanupResults,
    rawTokenWrittenToReport: false,
    rawCredentialWrittenToReport: false,
  }

  const mainDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat08-business-loop-evidence/v1',
    generatedAt: finishedAt,
    status,
    ...common,
    runId,
    selectedTargetRefs: {
      materialRiskIssueSeedRef: refs.resolved.materialRiskIssueSeedRef.ref,
      responsibleUserRef: refs.resolved.responsibleUserRef.ref,
      notificationChannelRef: refs.resolved.notificationChannelRef.ref,
      valuesWrittenToReport: false,
    },
    createdEntityIds: {
      taskId,
      riskId,
      issueId,
      conditionId,
      notificationId: issueNotification?.id ?? null,
    },
    evidenceArtifacts: {
      notificationReadback: rel(notificationPath),
      responsibilityChainReadback: rel(responsibilityPath),
      cleanupReadback: rel(cleanupPath),
      apiTrace: rel(tracePath),
    },
    checks: checks.map((check) => ({ id: check.id, status: check.status })),
    summary: {
      failedChecks,
      commandsExecuted: commands.length,
      riskFound: Boolean(riskFound),
      issueFound: Boolean(issueFound),
      materialConditionFound: Boolean(conditionFound),
      notificationFound: Boolean(issueNotification),
      cleanupStatus: cleanupOrRollbackReadback.status,
    },
    productionReadyClaim: false,
    mutationBoundary: {
      environment: normalizedTier,
      writesProduction: false,
      stagingWrites: true,
      writeScope: 'controlled staging disposable risk, issue, material condition, notification side effect, followed by cleanup/readback',
      rawSecretsForbidden: true,
    },
  }

  await writeJsonEvidence(notificationPath, notificationDoc, redactionsWithToken)
  await writeJsonEvidence(responsibilityPath, responsibilityDoc, redactionsWithToken)
  await writeJsonEvidence(tracePath, traceDoc, redactionsWithToken)
  await writeJsonEvidence(cleanupPath, cleanupDoc, redactionsWithToken)
  await writeJsonEvidence(mainPath, mainDoc, redactionsWithToken)

  return {
    status,
    scenarioId,
    tier: normalizedTier,
    commandsExecuted: commands.length,
    canCloseScenarioTier: status === 'pass',
    blockers: failedChecks,
    outputs: [rel(mainPath), rel(notificationPath), rel(responsibilityPath), rel(cleanupPath), rel(tracePath)],
  }
}

async function main() {
  const tier = argValue('--tier', 'staging')
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const artifactRoot = resolve(argValue('--artifact-root', join(releaseDir, 'v14241-real-env-evidence', String(tier).toLowerCase())))
  const flags = {
    '--include-uat': hasFlag('--include-uat'),
    '--include-staging': hasFlag('--include-staging'),
    '--include-solo-live': hasFlag('--include-solo-live'),
    '--include-live': hasFlag('--include-live'),
    '--confirm-real-handoff': hasFlag('--confirm-real-handoff'),
    '--allow-write': hasFlag('--allow-write'),
  }
  const report = await collectUat08BusinessLoopEvidence({
    tier,
    releaseDir,
    handoffFile: resolve(argValue('--handoff-file', defaultHandoffFile)),
    matrixFile: resolve(argValue('--matrix-file', defaultMatrixFile)),
    refsEnvFile: resolve(argValue('--refs-env-file', defaultRefsEnvFile)),
    artifactRoot,
    flags,
    publicOrigin: argValue('--public-origin', process.env.PUBLIC_HTTPS_ORIGIN ?? ''),
  })
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
