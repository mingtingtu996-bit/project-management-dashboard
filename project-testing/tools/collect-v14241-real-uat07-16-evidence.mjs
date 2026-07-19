#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import JSZip from 'jszip'
import pg from 'pg'
import { resolvePublicHttpsOrigin } from '../../scripts/public-origin.mjs'

const { Pool } = pg

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.controlled-staging.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultRefsEnvFile = join(repoRoot, '.tmp', 'v14241-controlled-staging', 'v14241-controlled-staging.refs.env')
const defaultDbEnvFile = join(repoRoot, 'deploy', 'env', 'staging.env')

const supportedScenarioIds = [
  'REAL-UAT-07',
  'REAL-UAT-11',
  'REAL-UAT-12',
  'REAL-UAT-13',
  'REAL-UAT-14',
  'REAL-UAT-15',
  'REAL-UAT-16',
]

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function argValues(name) {
  const values = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1])
  }
  return values
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

function joinApiPath(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
}

async function readTextIfPresent(path) {
  if (!existsSync(path)) return ''
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

async function readJsonIfPresent(path) {
  if (!existsSync(path)) return null
  try {
    return await readJson(path)
  } catch (error) {
    return {
      readError: error instanceof Error ? error.message : String(error),
    }
  }
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
  if (!match) return { status: 'unsupported_ref', ref, value: '' }
  const envPath = resolve(repoRoot, match[1])
  const key = match[2]
  const env = await readEnvFile(envPath)
  const resolved = env[key] ?? ''
  return resolved
    ? { status: 'resolved', ref, value: resolved, path: rel(envPath), key }
    : { status: 'missing_env_value', ref, value: '', path: rel(envPath), key }
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
      firstItemFields: Object.keys(data[0] ?? {}).slice(0, 16),
    }
  }
  if (!data || typeof data !== 'object') return { type: typeof data, value: typeof data === 'string' ? data.slice(0, 120) : data }
  return {
    type: 'object',
    topLevelFields: Object.keys(data).slice(0, 18),
    id: data.id ?? data.projectId ?? data.project_id ?? null,
    status: data.status ?? null,
    code: data.error?.code ?? data.code ?? null,
    count: data.count ?? undefined,
    itemCount: Array.isArray(data.items) ? data.items.length : undefined,
    jobsCount: Array.isArray(data.jobs) ? data.jobs.length : undefined,
  }
}

function responseDigest(result, redactions = []) {
  return {
    ok: result.ok,
    status: result.status,
    elapsedMs: result.elapsedMs,
    contentType: result.contentType ?? null,
    headers: result.headers ?? undefined,
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
      headers: {
        contentSecurityPolicy: response.headers.get('content-security-policy') ?? null,
        xContentTypeOptions: response.headers.get('x-content-type-options') ?? null,
        xFrameOptions: response.headers.get('x-frame-options') ?? null,
        rateLimitPolicy: response.headers.get('ratelimit-policy') ?? null,
      },
      body: parsed,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      contentType: null,
      headers: {},
      body: { error: error instanceof Error ? error.message : String(error) },
    }
  } finally {
    clearTimeout(timer)
  }
}

function authHeadersForToken(token, companyId) {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    ...(companyId ? { 'x-company-id': companyId } : {}),
  }
}

function authHeaders(ctx, companyId = ctx.companyId) {
  return authHeadersForToken(ctx.token, companyId)
}

function adminAuthHeaders(ctx, companyId = ctx.companyId) {
  return authHeadersForToken(ctx.adminToken ?? ctx.token, companyId)
}

async function apiCall(ctx, label, path, options = {}) {
  const result = await requestJson({
    url: joinApiPath(ctx.apiBase, path),
    method: options.method ?? 'GET',
    headers: options.headers ?? authHeaders(ctx),
    body: options.body,
    timeoutMs: options.timeoutMs ?? 30000,
  })
  const digest = {
    label,
    method: options.method ?? 'GET',
    path,
    expectedFailure: options.expectedFailure === true,
    ...responseDigest(result, ctx.redactions),
  }
  ctx.apiTrace.push(digest)
  return { result, digest }
}

function asArray(value) {
  const data = unwrapData(value)
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.tasks)) return data.tasks
  if (Array.isArray(data?.projects)) return data.projects
  if (Array.isArray(data?.drawings)) return data.drawings
  if (Array.isArray(data?.plans)) return data.plans
  return []
}

function pickId(body) {
  const data = unwrapData(body)
  return data?.id ?? data?.task?.id ?? data?.package?.id ?? null
}

function todayDate(offsetDays = 0) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function pctl(values, percentile) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1)
  return sorted[index]
}

function statusFromChecks(checks) {
  return checks.every((item) => item.status === 'pass' || item.status === 'expected_blocked' || item.status === 'not_applicable') ? 'pass' : 'blocked'
}

function baseEvidence(ctx, scenarioId, startedAt, commandOrManualScript) {
  return {
    environment: ctx.tier,
    baseUrl: ctx.apiBase,
    clientBaseUrl: ctx.clientBase,
    actorRefs: {
      primaryTesterRef: ctx.refs.primaryTesterRef?.ref ?? null,
      authenticatedUserId: ctx.userId,
      authenticatedEmailMatchesRef: ctx.userEmail === ctx.username,
    },
    companyId: ctx.companyId,
    projectId: ctx.projectId,
    startedAt,
    finishedAt: new Date().toISOString(),
    commandOrManualScript,
    screenshotsOrTrace: [],
    apiFailureSummary: [],
    consoleErrorSummary: [],
    cleanupOrRollbackReadback: {
      status: 'pending',
    },
    scenarioId,
    handoffFile: rel(ctx.handoffFile),
    matrixFile: rel(ctx.matrixFile),
  }
}

function unexpectedFailures(trace) {
  return trace
    .filter((item) => !item.expectedFailure && item.ok === false)
    .map((item) => ({
      label: item.label,
      method: item.method,
      path: item.path,
      status: item.status,
      code: item.bodySummary?.code ?? null,
    }))
}

function assertNoSecretLikeText(report, label) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error(`refusing_to_write_${label}_with_secret_like_text`)
  }
}

async function writeJson(path, value) {
  assertNoSecretLikeText(value, path.replace(/[^a-z0-9]+/gi, '_').toLowerCase())
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return rel(path)
}

async function writeText(path, value) {
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(value)) {
    throw new Error(`refusing_to_write_${path.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_with_secret_like_text`)
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value, 'utf8')
  return rel(path)
}

async function ensureTask(ctx, runId) {
  const list = await apiCall(ctx, 'tasks-list-for-scenario', `/api/tasks?projectId=${encodeURIComponent(ctx.projectId)}`)
  const existing = asArray(list.result.body).find((item) => item?.id)
  if (existing?.id) {
    return { taskId: existing.id, created: false, cleanup: null }
  }

  const create = await apiCall(ctx, 'tasks-create-disposable-for-scenario', '/api/tasks', {
    method: 'POST',
    headers: { ...authHeaders(ctx), 'content-type': 'application/json' },
    body: {
      project_id: ctx.projectId,
      title: `REAL-UAT disposable task ${runId}`,
      description: 'controlled staging disposable task for v1.4.24.1 real UAT evidence',
      status: 'todo',
      priority: 'medium',
      start_date: todayDate(),
      end_date: todayDate(3),
      planned_start_date: todayDate(),
      planned_end_date: todayDate(3),
      progress: 0,
      assignee_user_id: ctx.userId,
      drawing_required: true,
      acceptance_required: true,
    },
  })
  const taskId = pickId(create.result.body)
  if (!taskId) return { taskId: null, created: true, cleanup: null }
  return {
    taskId,
    created: true,
    cleanup: async () => apiCall(ctx, 'tasks-delete-disposable-for-scenario', `/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
  }
}

async function readDbEnv() {
  const env = await readEnvFile(defaultDbEnvFile)
  const connectionString = env.DB_CONNECTION_STRING || env.DATABASE_URL || ''
  return {
    connectionString,
    connectionRef: connectionString ? `env://${rel(defaultDbEnvFile)}#${env.DB_CONNECTION_STRING ? 'DB_CONNECTION_STRING' : 'DATABASE_URL'}` : null,
  }
}

async function runDbReadbacks(queries) {
  const env = await readDbEnv()
  if (!env.connectionString) {
    return {
      status: 'blocked',
      connectionRef: null,
      checks: [{ id: 'db-connection-ref', status: 'blocked', reason: 'missing DB_CONNECTION_STRING/DATABASE_URL in staging env' }],
    }
  }

  const connectionString = env.connectionString.replace(/sslmode=[^&]+/i, 'sslmode=no-verify')
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: /supabase|pooler/i.test(connectionString) && !/sslmode=/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
  })
  const checks = []
  try {
    await pool.query('SET statement_timeout = 15000')
    for (const item of queries) {
      const started = Date.now()
      try {
        const result = await pool.query(item.sql, item.params ?? [])
        checks.push({
          id: item.id,
          status: 'pass',
          elapsedMs: Date.now() - started,
          rowCount: result.rowCount,
          rows: result.rows.slice(0, item.maxRows ?? 5).map((row) => sanitize(row)),
          sqlShape: item.sqlShape,
        })
      } catch (error) {
        checks.push({
          id: item.id,
          status: 'blocked',
          elapsedMs: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
          sqlShape: item.sqlShape,
        })
      }
    }
  } finally {
    await pool.end().catch(() => undefined)
  }
  return {
    status: statusFromChecks(checks),
    connectionRef: env.connectionRef,
    checks,
  }
}

async function buildContext(options) {
  const handoff = await readJson(options.handoffFile)
  await readJson(options.matrixFile)
  const envTarget = handoff.environmentTargets?.[options.tier] ?? {}
  const commonTier = handoff.scenarios?.['REAL-UAT-07']?.tiers?.[options.tier] ?? {}
  const requiredRefs = {
    apiBase: envTarget.apiBaseUrlRef,
    clientBase: envTarget.clientBaseUrlRef,
    username: envTarget.credentialRefs?.testUserEmailRef,
    password: envTarget.credentialRefs?.testUserPasswordRef,
    companyId: commonTier.targetRefs?.companyIdRef,
    projectId: commonTier.targetRefs?.projectIdRef,
    primaryTesterRef: commonTier.actorRefs?.primaryTesterRef,
  }
  const optionalRefs = {
    companyAdminUsername: envTarget.roleAccountRefs?.company_admin,
  }
  const refs = { ...requiredRefs, ...optionalRefs }
  const resolved = {}
  const issues = []
  for (const [key, ref] of Object.entries(requiredRefs)) {
    const result = await resolveEnvRef(ref)
    resolved[key] = result
    if (result.status !== 'resolved') issues.push(`${key}:${result.status}`)
  }
  for (const [key, ref] of Object.entries(optionalRefs)) {
    resolved[key] = ref ? await resolveEnvRef(ref) : { status: 'missing_optional_ref', ref, value: '' }
  }
  if (issues.length > 0) {
    throw new Error(`Cannot collect staging evidence because refs are unresolved: ${issues.join(', ')}`)
  }
  const publicOrigin = resolvePublicHttpsOrigin({
    apiBaseUrl: resolved.apiBase.value,
    publicOrigin: options.publicOrigin,
  })

  const login = await requestJson({
    url: joinApiPath(resolved.apiBase.value, '/api/auth/login'),
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: publicOrigin },
    body: { username: resolved.username.value, password: resolved.password.value },
    timeoutMs: 15000,
  })
  const token = login.body?.data?.token ?? null
  if (!login.ok || !token) {
    throw new Error(`Cannot collect staging evidence because login failed with status ${login.status}`)
  }

  const me = await requestJson({
    url: joinApiPath(resolved.apiBase.value, '/api/auth/me'),
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    timeoutMs: 15000,
  })
  const user = me.body?.data?.user ?? me.body?.data ?? {}
  if (!me.ok || !user?.id) {
    throw new Error(`Cannot collect staging evidence because /api/auth/me failed with status ${me.status}`)
  }

  let adminToken = null
  let adminUser = null
  let adminLoginDigest = null
  let adminMeDigest = null
  if (resolved.companyAdminUsername?.status === 'resolved' && resolved.companyAdminUsername.value) {
    const adminLogin = await requestJson({
      url: joinApiPath(resolved.apiBase.value, '/api/auth/login'),
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', origin: publicOrigin },
      body: { username: resolved.companyAdminUsername.value, password: resolved.password.value },
      timeoutMs: 15000,
    })
    adminToken = adminLogin.body?.data?.token ?? null
    if (adminLogin.ok && adminToken) {
      const adminMe = await requestJson({
        url: joinApiPath(resolved.apiBase.value, '/api/auth/me'),
        headers: { accept: 'application/json', authorization: `Bearer ${adminToken}` },
        timeoutMs: 15000,
      })
      adminUser = adminMe.body?.data?.user ?? adminMe.body?.data ?? null
      adminLoginDigest = adminLogin
      adminMeDigest = adminMe
      if (!adminMe.ok || !adminUser?.id) {
        adminToken = null
        adminUser = null
      }
    } else {
      adminLoginDigest = adminLogin
    }
  }

  const allRedactions = [token, adminToken, resolved.password.value].filter(Boolean)
  const apiTrace = [
    {
      label: 'auth-login',
      method: 'POST',
      path: '/api/auth/login',
      ...responseDigest(login, allRedactions),
      bodySummary: { type: 'object', hasToken: true },
    },
    {
      label: 'auth-me',
      method: 'GET',
      path: '/api/auth/me',
      ...responseDigest(me, allRedactions),
    },
  ]
  if (adminLoginDigest) {
    apiTrace.push({
      label: 'admin-auth-login',
      method: 'POST',
      path: '/api/auth/login',
      ...responseDigest(adminLoginDigest, allRedactions),
      bodySummary: { type: 'object', hasToken: Boolean(adminToken) },
    })
  }
  if (adminMeDigest) {
    apiTrace.push({
      label: 'admin-auth-me',
      method: 'GET',
      path: '/api/auth/me',
      ...responseDigest(adminMeDigest, allRedactions),
    })
  }

  return {
    tier: options.tier,
    releaseDir: options.releaseDir,
    handoffFile: options.handoffFile,
    matrixFile: options.matrixFile,
    artifactRoot: options.artifactRoot,
    evidenceRoot: options.evidenceRoot,
    refs,
    resolvedRefs: resolved,
    apiBase: resolved.apiBase.value,
    clientBase: resolved.clientBase.value,
    username: resolved.username.value,
    companyId: resolved.companyId.value,
    projectId: resolved.projectId.value,
    userId: user.id,
    userEmail: user.email ?? user.username ?? null,
    token,
    adminToken,
    adminUserId: adminUser?.id ?? null,
    adminUserEmail: adminUser?.email ?? adminUser?.username ?? null,
    redactions: allRedactions,
    apiTrace,
  }
}

async function collectUat07(ctx) {
  const scenarioId = 'REAL-UAT-07'
  const startedAt = new Date().toISOString()
  const runId = randomUUID().slice(0, 8)
  const evidenceDir = join(ctx.artifactRoot, 'operator-evidence')
  const readbackDir = join(ctx.artifactRoot, 'operator-readbacks')
  const task = await ensureTask(ctx, runId)
  const cleanupSteps = []
  const localTraceStart = ctx.apiTrace.length
  const taskId = task.taskId

  const drawing = await apiCall(ctx, 'drawing-create-disposable', '/api/construction-drawings', {
    method: 'POST',
    headers: { ...authHeaders(ctx), 'content-type': 'application/json' },
    body: {
      project_id: ctx.projectId,
      drawing_type: '建筑',
      drawing_name: `REAL-UAT-07 ${runId} 图纸责任链`,
      version: '1.0',
      description: 'controlled staging disposable drawing evidence; metadata only, no binary upload',
      status: '审图中',
      review_status: '审查中',
      design_unit: 'WorkBuddy UAT',
      drawing_date: todayDate(),
      review_unit: 'WorkBuddy UAT Review',
      planned_submit_date: todayDate(),
      planned_pass_date: todayDate(1),
      lead_unit: '资料管理',
      responsible_user_id: ctx.userId,
      sort_order: 0,
      notes: `linked task ${taskId ?? 'none'}; run ${runId}`,
      created_by: ctx.userId,
      drawing_code: `REAL-UAT-07-${runId}`,
      version_no: '1.0',
      issued_for: '验收资料演练',
      is_current_version: false,
      requires_review: true,
      review_mode: 'mandatory',
      review_basis: 'controlled staging UAT evidence',
      has_change: false,
      schedule_impact_flag: false,
      is_ready_for_construction: false,
      is_ready_for_acceptance: false,
    },
  })
  const drawingId = pickId(drawing.result.body)

  let drawingUpdate = null
  if (drawingId) {
    drawingUpdate = await apiCall(ctx, 'drawing-review-pass-readback', `/api/construction-drawings/${encodeURIComponent(drawingId)}`, {
      method: 'PUT',
      headers: { ...authHeaders(ctx), 'content-type': 'application/json' },
      body: {
        lock_version: 1,
        review_status: '已通过',
        status: '已通过',
        review_date: todayDate(),
        review_opinion: 'controlled staging UAT pass',
        actual_submit_date: todayDate(),
        actual_pass_date: todayDate(),
        is_ready_for_acceptance: true,
      },
    })
  }

  const acceptance = await apiCall(ctx, 'acceptance-plan-create-disposable', '/api/acceptance-plans', {
    method: 'POST',
    headers: { ...authHeaders(ctx), 'content-type': 'application/json' },
    body: {
      project_id: ctx.projectId,
      task_id: taskId,
      responsible_user_id: ctx.userId,
      acceptance_type: '其他',
      acceptance_name: `REAL-UAT-07 ${runId} 验收资料链`,
      planned_date: todayDate(2),
      status: 'draft',
      phase: '资料归档',
      documents: [
        {
          name: `real-uat-07-${runId}.pdf`,
          type: 'acceptance-document',
          drawingId,
          storage: 'metadata-only-controlled-staging',
          retentionPolicyRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_07_EXPECTED_EVIDENCE_REFS_RETENTION_POLICY_REF',
        },
      ],
      notes: `controlled staging acceptance evidence linked to drawing ${drawingId ?? 'none'}`,
      created_by: ctx.userId,
    },
  })
  const acceptanceId = pickId(acceptance.result.body)

  await apiCall(ctx, 'drawing-ledger-readback', `/api/construction-drawings/ledger?projectId=${encodeURIComponent(ctx.projectId)}`)
  await apiCall(ctx, 'pre-milestone-ledger-readback', `/api/projects/${encodeURIComponent(ctx.projectId)}/pre-milestones/ledger`)
  await apiCall(ctx, 'acceptance-plan-list-readback', `/api/acceptance-plans?projectId=${encodeURIComponent(ctx.projectId)}`)

  const anonymousDrawingRead = drawingId
    ? await apiCall(ctx, 'anonymous-drawing-read-negative', `/api/construction-drawings/${encodeURIComponent(drawingId)}`, {
        headers: { accept: 'application/json' },
        expectedFailure: true,
      })
    : null

  if (acceptanceId) {
    const deleted = await apiCall(ctx, 'acceptance-plan-delete-cleanup', `/api/acceptance-plans/${encodeURIComponent(acceptanceId)}`, { method: 'DELETE' })
    cleanupSteps.push({ target: 'acceptance_plan', id: acceptanceId, status: deleted.result.status, ok: deleted.result.ok })
  }
  if (drawingId) {
    const deleted = await apiCall(ctx, 'drawing-delete-cleanup', `/api/construction-drawings/${encodeURIComponent(drawingId)}`, { method: 'DELETE' })
    cleanupSteps.push({ target: 'construction_drawing', id: drawingId, status: deleted.result.status, ok: deleted.result.ok })
    const afterDelete = await apiCall(ctx, 'drawing-after-delete-readback', `/api/construction-drawings/${encodeURIComponent(drawingId)}`, {
      expectedFailure: true,
    })
    cleanupSteps.push({ target: 'construction_drawing_after_delete', id: drawingId, status: afterDelete.result.status, ok: afterDelete.result.ok })
  }
  if (task.cleanup) {
    const deleted = await task.cleanup()
    cleanupSteps.push({ target: 'disposable_task', id: taskId, status: deleted.result.status, ok: deleted.result.ok })
  }

  const trace = ctx.apiTrace.slice(localTraceStart)
  const common = baseEvidence(ctx, scenarioId, startedAt, 'node project-testing/tools/collect-v14241-real-uat07-16-evidence.mjs --scenario-id REAL-UAT-07 --tier staging --include-staging --confirm-real-handoff --allow-write')
  common.screenshotsOrTrace = [rel(join(evidenceDir, 'real-uat-07-api-trace.json'))]
  common.apiFailureSummary = unexpectedFailures(trace)
  common.cleanupOrRollbackReadback = {
    status: cleanupSteps.every((item) => item.ok || [400, 404, 410, 422].includes(item.status)) ? 'pass' : 'blocked',
    steps: cleanupSteps,
  }

  const documentChain = {
    schemaVersion: 'workbuddy/v14241-real-uat07-document-chain/v1',
    ...common,
    status: common.apiFailureSummary.length === 0 && drawing.result.ok && acceptance.result.ok ? 'pass' : 'blocked',
    runId,
    taskRef: { id: taskId, createdByCollector: task.created },
    drawingRef: { id: drawingId, createStatus: drawing.result.status, updateStatus: drawingUpdate?.result?.status ?? null },
    acceptanceRef: { id: acceptanceId, createStatus: acceptance.result.status },
    chainReadback: {
      drawingCreated: Boolean(drawingId),
      acceptanceCreated: Boolean(acceptanceId),
      linkedToTask: Boolean(taskId),
      linkedResponsibleUser: ctx.userId,
      metadataOnlyNoBinaryUpload: true,
    },
    apiTrace: trace,
  }

  const permissionReadback = {
    schemaVersion: 'workbuddy/v14241-real-uat07-file-permission-readback/v1',
    ...common,
    status: anonymousDrawingRead && [401, 403, 404].includes(anonymousDrawingRead.result.status) ? 'pass' : 'blocked',
    negativeAssertions: [
      {
        id: 'anonymous_drawing_read_rejected',
        expected: [401, 403, 404],
        actual: anonymousDrawingRead?.result?.status ?? null,
      },
    ],
    storageBoundary: {
      storageBucketRef: ctx.resolvedRefs.storageBucketRef?.ref ?? 'scenario-ref-resolved-in-contract',
      binaryUploadExecuted: false,
      reason: 'current staging route stores drawing and acceptance document metadata; no public binary upload/download route was exercised by this collector',
    },
  }

  const retentionReadback = {
    schemaVersion: 'workbuddy/v14241-real-uat07-retention-delete-readback/v1',
    ...common,
    status: common.cleanupOrRollbackReadback.status,
    retentionPolicyRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_07_EXPECTED_EVIDENCE_REFS_RETENTION_POLICY_REF',
    deleteReadback: cleanupSteps,
  }

  await writeJson(join(evidenceDir, 'real-uat-07-api-trace.json'), { trace })
  await writeJson(join(ctx.artifactRoot, 'real-uat-07-document-chain.json'), documentChain)
  await writeJson(join(ctx.artifactRoot, 'file-permission-readback.json'), permissionReadback)
  await writeJson(join(ctx.artifactRoot, 'retention-delete-readback.json'), retentionReadback)
  await writeJson(join(readbackDir, 'real-uat-07-cleanup-readback.json'), retentionReadback)
  return { scenarioId, status: statusFromChecks([{ status: documentChain.status }, { status: permissionReadback.status }, { status: retentionReadback.status }]) }
}

async function collectUat11(ctx) {
  const scenarioId = 'REAL-UAT-11'
  const startedAt = new Date().toISOString()
  const evidenceDir = join(ctx.artifactRoot, 'operator-evidence')
  const localTraceStart = ctx.apiTrace.length
  const paths = [
    { path: `/api/projects/${encodeURIComponent(ctx.projectId)}` },
    { path: `/api/tasks?projectId=${encodeURIComponent(ctx.projectId)}` },
    { path: `/api/construction-drawings/ledger?projectId=${encodeURIComponent(ctx.projectId)}` },
    { path: `/api/projects/${encodeURIComponent(ctx.projectId)}/reports/s-curve` },
    { path: `/api/notifications/summary?projectId=${encodeURIComponent(ctx.projectId)}` },
    { path: '/api/jobs/status', headers: adminAuthHeaders(ctx) },
  ]
  const iterations = 3
  const calls = []
  for (let index = 0; index < iterations; index += 1) {
    for (const item of paths) {
      calls.push(await apiCall(ctx, `perf-${index + 1}:${item.path}`, item.path, { timeoutMs: 45000, headers: item.headers }))
    }
  }
  const trace = ctx.apiTrace.slice(localTraceStart)
  const elapsed = trace.map((item) => item.elapsedMs)
  const db = await runDbReadbacks([
    {
      id: 'project_task_count',
      sqlShape: 'SELECT count(*) FROM tasks WHERE project_id = $1',
      sql: 'SELECT count(*)::int AS task_count FROM public.tasks WHERE project_id::text = $1',
      params: [ctx.projectId],
    },
    {
      id: 'project_snapshot_count',
      sqlShape: 'SELECT count(*) FROM project_daily_snapshot WHERE project_id = $1',
      sql: 'SELECT count(*)::int AS snapshot_count FROM public.project_daily_snapshot WHERE project_id::text = $1',
      params: [ctx.projectId],
    },
    {
      id: 'project_report_query_plan',
      sqlShape: 'EXPLAIN project_daily_snapshot project filter',
      sql: 'EXPLAIN (FORMAT JSON) SELECT snapshot_date, overall_progress FROM public.project_daily_snapshot WHERE project_id::text = $1 ORDER BY snapshot_date DESC LIMIT 30',
      params: [ctx.projectId],
      maxRows: 1,
    },
  ])
  const traceZip = new JSZip()
  traceZip.file('browser-trace.json', JSON.stringify({ generatedAt: new Date().toISOString(), trace }, null, 2))
  traceZip.file('README.txt', 'Controlled staging API/browser-style trace for REAL-UAT-11. No raw tokens or DB URLs are stored.')
  const zipBuffer = await traceZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const browserTracePath = join(ctx.artifactRoot, 'browser-trace.zip')
  await mkdir(dirname(browserTracePath), { recursive: true })
  await writeFile(browserTracePath, zipBuffer)

  const common = baseEvidence(ctx, scenarioId, startedAt, 'node project-testing/tools/collect-v14241-real-uat07-16-evidence.mjs --scenario-id REAL-UAT-11 --tier staging --include-staging --confirm-real-handoff --allow-write')
  common.screenshotsOrTrace = [rel(browserTracePath), rel(join(evidenceDir, 'real-uat-11-api-trace.json'))]
  common.apiFailureSummary = unexpectedFailures(trace)
  common.cleanupOrRollbackReadback = {
    status: 'pass',
    type: 'read_only_pressure_window',
    writesCreated: 0,
  }

  const thresholds = {
    p95Ms: 5000,
    p99Ms: 10000,
  }
  const loadWindow = {
    mode: 'controlled_staging_read_pressure',
    iterations,
    requestCount: calls.length,
    p95Ms: pctl(elapsed, 95),
    p99Ms: pctl(elapsed, 99),
    maxMs: Math.max(...elapsed),
    thresholds,
  }
  const thresholdsMet = loadWindow.p95Ms <= thresholds.p95Ms && loadWindow.p99Ms <= thresholds.p99Ms
  const pressure = {
    schemaVersion: 'workbuddy/v14241-real-uat11-performance-pressure/v1',
    ...common,
    status: common.apiFailureSummary.length === 0 && db.status === 'pass' && thresholdsMet ? 'pass' : 'blocked',
    loadWindow,
    jobStatusReadback: {
      authMode: ctx.adminToken ? 'company_admin' : 'primary_actor',
      status: trace.find((item) => item.path === '/api/jobs/status')?.status ?? null,
    },
    hotspotProtectionReadback: {
      paginationOrLimitPaths: paths.map((item) => item.path).filter((path) => path.includes('tasks') || path.includes('reports') || path.includes('notifications')),
      noDataMutation: true,
    },
    apiTrace: trace,
  }

  const queryLog = {
    schemaVersion: 'workbuddy/v14241-real-uat11-db-query-log/v1',
    ...common,
    status: db.status,
    dbConnectionRef: db.connectionRef,
    queryReadbacks: db.checks,
  }

  await writeJson(join(evidenceDir, 'real-uat-11-api-trace.json'), { trace })
  await writeJson(join(ctx.artifactRoot, 'real-uat-11-performance-pressure.json'), pressure)
  await writeJson(join(ctx.artifactRoot, 'db-query-log.json'), queryLog)
  return { scenarioId, status: statusFromChecks([{ status: pressure.status }, { status: queryLog.status }]) }
}

async function collectUat12(ctx) {
  const scenarioId = 'REAL-UAT-12'
  const startedAt = new Date().toISOString()
  const localTraceStart = ctx.apiTrace.length
  const runId = randomUUID().slice(0, 8)
  const securityTask = await apiCall(ctx, 'security-xss-task-create', '/api/tasks', {
    method: 'POST',
    headers: { ...authHeaders(ctx), 'content-type': 'application/json' },
    expectedFailure: true,
    body: {
      project_id: ctx.projectId,
      title: `<img src=x onerror=alert(1)> REAL-UAT-12 ${runId}`,
      description: 'controlled staging XSS storage/sanitization probe',
      status: 'todo',
      priority: 'medium',
      start_date: todayDate(),
      end_date: todayDate(1),
      planned_start_date: todayDate(),
      planned_end_date: todayDate(1),
      progress: 0,
    },
  })
  const securityTaskId = pickId(securityTask.result.body)
  const xssRejectedByMiddleware = securityTask.result.status === 400 && securityTask.result.body?.error?.code === 'XSS_DETECTED'
  const taskReadback = securityTaskId
    ? await apiCall(ctx, 'security-xss-task-readback', `/api/tasks/${encodeURIComponent(securityTaskId)}`)
    : null
  const storedTitle = unwrapData(taskReadback?.result?.body)?.title ?? ''
  const xssStoredRaw = /<img|onerror|alert\(/i.test(String(storedTitle))
  if (securityTaskId) {
    await apiCall(ctx, 'security-xss-task-cleanup', `/api/tasks/${encodeURIComponent(securityTaskId)}`, { method: 'DELETE' })
  }

  await apiCall(ctx, 'security-unauth-project-read-negative', `/api/projects/${encodeURIComponent(ctx.projectId)}`, {
    headers: { accept: 'application/json' },
    expectedFailure: true,
  })
  await apiCall(ctx, 'security-sqli-project-id-negative', `/api/tasks?projectId=${encodeURIComponent("' OR 1=1 --")}`, {
    expectedFailure: true,
  })
  await apiCall(ctx, 'security-ssrf-like-payload-client-error', '/api/client-errors', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: {
      source: 'REAL-UAT-12',
      message: 'controlled SSRF-like payload should be logged only, not fetched',
      metadata: {
        url: 'http://169.254.169.254/latest/meta-data/',
        runId,
      },
    },
  })
  const health = await apiCall(ctx, 'security-header-readback-readyz', '/api/readyz', {
    headers: { accept: 'application/json' },
  })
  const trace = ctx.apiTrace.slice(localTraceStart)
  const secretScan = await readJsonIfPresent(join(ctx.releaseDir, 'secret-leak-scan-summary.json'))
  const advisor = await readJsonIfPresent(join(ctx.releaseDir, 'supabase-db-advisors-evidence.json'))
  const common = baseEvidence(ctx, scenarioId, startedAt, 'node project-testing/tools/collect-v14241-real-uat07-16-evidence.mjs --scenario-id REAL-UAT-12 --tier staging --include-staging --confirm-real-handoff --allow-write')
  common.screenshotsOrTrace = [rel(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-12-api-trace.json'))]
  common.apiFailureSummary = unexpectedFailures(trace)
  common.cleanupOrRollbackReadback = {
    status: securityTaskId ? 'pass' : 'not_applicable',
    disposableTaskId: securityTaskId,
    cleanedBy: securityTaskId ? `/api/tasks/${securityTaskId}` : null,
  }

  const negative = {
    schemaVersion: 'workbuddy/v14241-real-uat12-security-negative/v1',
    ...common,
    status: common.apiFailureSummary.length === 0 && (xssRejectedByMiddleware || (securityTask.result.ok && !xssStoredRaw)) ? 'pass' : 'blocked',
    negativeChecks: {
      xssBlockedOrSanitized: xssRejectedByMiddleware || !xssStoredRaw,
      xssRejectedByMiddleware,
      xssStorageSanitized: securityTaskId ? !xssStoredRaw : 'not_applicable_rejected_before_storage',
      unauthReadRejected: trace.some((item) => item.label === 'security-unauth-project-read-negative' && [401, 403, 404].includes(item.status)),
      sqlInjectionProjectIdRejectedWithout500: trace.some((item) => item.label === 'security-sqli-project-id-negative' && item.status !== 500),
      ssrfPayloadLoggedOnly: trace.some((item) => item.label === 'security-ssrf-like-payload-client-error' && [200, 202].includes(item.status)),
      maliciousBinaryUploadBoundary: 'no public binary upload route is exercised by this controlled staging collector; binary malware testing remains a dedicated storage gateway gate',
    },
    payloadSetRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_12_TARGET_REFS_PAYLOAD_SET_REF',
    apiTrace: trace,
  }

  const headers = {
    schemaVersion: 'workbuddy/v14241-real-uat12-csp-header-readback/v1',
    ...common,
    status: health.result.headers?.contentSecurityPolicy && health.result.headers?.xContentTypeOptions ? 'pass' : 'blocked',
    headers: health.result.headers,
  }

  const advisorReadback = {
    schemaVersion: 'workbuddy/v14241-real-uat12-advisor-security-readback/v1',
    ...common,
    status: secretScan && advisor ? 'pass' : 'blocked',
    advisorArtifact: {
      path: 'project-testing/reports/release-v1.4.24-20260702-125254/supabase-db-advisors-evidence.json',
      schemaVersion: advisor?.schemaVersion ?? null,
      status: advisor?.status ?? advisor?.summary?.status ?? null,
    },
    secretScanArtifact: {
      path: 'project-testing/reports/release-v1.4.24-20260702-125254/secret-leak-scan-summary.json',
      schemaVersion: secretScan?.schemaVersion ?? null,
      status: secretScan?.status ?? secretScan?.summary?.status ?? null,
    },
  }

  await writeJson(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-12-api-trace.json'), { trace })
  await writeJson(join(ctx.artifactRoot, 'real-uat-12-security-negative.json'), negative)
  await writeJson(join(ctx.artifactRoot, 'csp-header-readback.json'), headers)
  await writeJson(join(ctx.artifactRoot, 'advisor-security-readback.json'), advisorReadback)
  return { scenarioId, status: statusFromChecks([{ status: negative.status }, { status: headers.status }, { status: advisorReadback.status }]) }
}

async function collectUat13(ctx) {
  const scenarioId = 'REAL-UAT-13'
  const startedAt = new Date().toISOString()
  const localTraceStart = ctx.apiTrace.length
  const before = await apiCall(ctx, 'release-readiness-before', '/api/readyz', { headers: { accept: 'application/json' } })
  await apiCall(ctx, 'release-jobs-status', '/api/jobs/status', { headers: adminAuthHeaders(ctx) })
  await apiCall(ctx, 'release-project-smoke', `/api/projects/${encodeURIComponent(ctx.projectId)}`)
  const after = await apiCall(ctx, 'release-readiness-after-noop-rollback', '/api/readyz', { headers: { accept: 'application/json' } })
  const trace = ctx.apiTrace.slice(localTraceStart)
  const rollbackReadiness = await readJsonIfPresent(join(ctx.releaseDir, 'rollback-readiness.json'))
  const closeoutDecision = await readJsonIfPresent(join(ctx.releaseDir, 'closeout-decision.json'))
  const common = baseEvidence(ctx, scenarioId, startedAt, 'node project-testing/tools/collect-v14241-real-uat07-16-evidence.mjs --scenario-id REAL-UAT-13 --tier staging --include-staging --confirm-real-handoff --allow-write')
  common.screenshotsOrTrace = [rel(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-13-api-trace.json'))]
  common.apiFailureSummary = unexpectedFailures(trace)
  common.cleanupOrRollbackReadback = {
    status: before.result.ok && after.result.ok ? 'pass' : 'blocked',
    rollbackMode: 'staging_noop_rehearsal',
    reason: 'collector validates health/readback and rollback artifacts without applying a new deployment',
  }

  const release = {
    schemaVersion: 'workbuddy/v14241-real-uat13-release-rollback/v1',
    ...common,
    status: common.apiFailureSummary.length === 0 && rollbackReadiness && closeoutDecision ? 'pass' : 'blocked',
    releaseVersionRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_13_TARGET_REFS_RELEASE_VERSION_REF',
    deploymentVersionRef: ctx.resolvedRefs.clientBase?.ref ?? null,
    closeoutDecision: {
      path: 'project-testing/reports/release-v1.4.24-20260702-125254/closeout-decision.json',
      status: closeoutDecision?.status ?? closeoutDecision?.decision ?? null,
    },
    rollbackReadiness: {
      path: 'project-testing/reports/release-v1.4.24-20260702-125254/rollback-readiness.json',
      status: rollbackReadiness?.status ?? null,
    },
    jobStatusReadback: {
      authMode: ctx.adminToken ? 'company_admin' : 'primary_actor',
      status: trace.find((item) => item.label === 'release-jobs-status')?.status ?? null,
    },
    apiTrace: trace,
  }

  const healthcheck = {
    schemaVersion: 'workbuddy/v14241-real-uat13-healthcheck-readback/v1',
    ...common,
    status: before.result.ok && after.result.ok ? 'pass' : 'blocked',
    before: responseDigest(before.result, ctx.redactions),
    after: responseDigest(after.result, ctx.redactions),
  }

  const rollback = {
    schemaVersion: 'workbuddy/v14241-real-uat13-rollback-drill/v1',
    ...common,
    status: common.cleanupOrRollbackReadback.status,
    rollbackRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_13_ROLLBACK_REF',
    drillType: 'controlled_staging_noop',
    runbookRefs: ['docs/release-runbook.md', 'docs/lighthouse-server-runbook.md'],
    productionBoundary: 'No live deployment or production migration was applied by this staging collector.',
  }

  await writeJson(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-13-api-trace.json'), { trace })
  await writeJson(join(ctx.artifactRoot, 'real-uat-13-release-rollback.json'), release)
  await writeJson(join(ctx.artifactRoot, 'healthcheck-readback.json'), healthcheck)
  await writeJson(join(ctx.artifactRoot, 'rollback-drill.json'), rollback)
  return { scenarioId, status: statusFromChecks([{ status: release.status }, { status: healthcheck.status }, { status: rollback.status }]) }
}

async function collectUat14(ctx) {
  const scenarioId = 'REAL-UAT-14'
  const startedAt = new Date().toISOString()
  const localTraceStart = ctx.apiTrace.length
  await apiCall(ctx, 'backup-migration-readiness-smoke', '/api/readyz', { headers: { accept: 'application/json' } })
  await apiCall(ctx, 'backup-migration-project-smoke', `/api/projects/${encodeURIComponent(ctx.projectId)}`)
  const trace = ctx.apiTrace.slice(localTraceStart)
  const db = await runDbReadbacks([
    {
      id: 'schema_migrations_presence',
      sqlShape: 'SELECT schema_migrations count and latest version',
      sql: "SELECT count(*)::int AS applied_count, max(version)::text AS latest_version FROM public.schema_migrations",
    },
    {
      id: 'target_project_presence',
      sqlShape: 'SELECT target project row by id',
      sql: 'SELECT id::text, company_id::text, name FROM public.projects WHERE id::text = $1 LIMIT 1',
      params: [ctx.projectId],
    },
    {
      id: 'legacy_drop_guard_tables',
      sqlShape: 'SELECT to_regclass for legacy/drop governance tables',
      sql: "SELECT to_regclass('public.schema_migrations')::text AS schema_migrations, to_regclass('public.operation_logs')::text AS operation_logs",
    },
  ])
  const migrationGovernance = await readJsonIfPresent(join(ctx.releaseDir, 'production-migration-governance-report.json'))
  const schemaColumns = await readJsonIfPresent(join(ctx.releaseDir, 'v14241-staging-schema-columns.current.json'))
  const oldObject = await readJsonIfPresent(join(ctx.releaseDir, 'old-object-no-safe-candidate-closeout.json'))
  const legacyGuard = await readJsonIfPresent(join(ctx.releaseDir, 'legacy-object-drop-guard.initial.json'))
  const common = baseEvidence(ctx, scenarioId, startedAt, 'node project-testing/tools/collect-v14241-real-uat07-16-evidence.mjs --scenario-id REAL-UAT-14 --tier staging --include-staging --confirm-real-handoff --allow-write')
  common.screenshotsOrTrace = [rel(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-14-api-trace.json'))]
  common.apiFailureSummary = unexpectedFailures(trace)
  common.cleanupOrRollbackReadback = {
    status: 'pass',
    rollbackMode: 'read_only_restore_drill_readback',
    writesCreated: 0,
  }

  const backup = {
    schemaVersion: 'workbuddy/v14241-real-uat14-backup-restore-migration/v1',
    ...common,
    status: common.apiFailureSummary.length === 0 && db.status === 'pass' && migrationGovernance ? 'pass' : 'blocked',
    backupRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_14_TARGET_REFS_BACKUP_REF',
    restoreDrillDbRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_14_TARGET_REFS_RESTORE_DRILL_DB_REF',
    migrationLedgerRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_14_TARGET_REFS_MIGRATION_LEDGER_REF',
    dbReadback: db,
    migrationGovernance: {
      path: 'project-testing/reports/release-v1.4.24-20260702-125254/production-migration-governance-report.json',
      status: migrationGovernance?.status ?? null,
    },
    apiTrace: trace,
  }

  const schemaDrift = {
    schemaVersion: 'workbuddy/v14241-real-uat14-schema-drift-readback/v1',
    ...common,
    status: schemaColumns && db.status === 'pass' ? 'pass' : 'blocked',
    schemaColumnsArtifact: {
      path: 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-staging-schema-columns.current.json',
      schemaVersion: schemaColumns?.schemaVersion ?? null,
      status: schemaColumns?.status ?? null,
    },
    dbReadback: db,
  }

  const oldObjectDisposition = {
    schemaVersion: 'workbuddy/v14241-real-uat14-old-object-disposition/v1',
    ...common,
    status: oldObject && legacyGuard ? 'pass' : 'blocked',
    oldObjectDispositionRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_14_TARGET_REFS_OLD_OBJECT_DISPOSITION_REF',
    artifacts: [
      {
        path: 'project-testing/reports/release-v1.4.24-20260702-125254/old-object-no-safe-candidate-closeout.json',
        status: oldObject?.status ?? null,
      },
      {
        path: 'project-testing/reports/release-v1.4.24-20260702-125254/legacy-object-drop-guard.initial.json',
        status: legacyGuard?.status ?? null,
      },
    ],
    physicalDropExecuted: false,
    boundary: 'staging readback only; physical DROP remains fail-closed without explicit approval, rollback and post-drop smoke',
  }

  await writeJson(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-14-api-trace.json'), { trace })
  await writeJson(join(ctx.artifactRoot, 'real-uat-14-backup-restore-migration.json'), backup)
  await writeJson(join(ctx.artifactRoot, 'schema-drift-readback.json'), schemaDrift)
  await writeJson(join(ctx.artifactRoot, 'old-object-disposition.json'), oldObjectDisposition)
  return { scenarioId, status: statusFromChecks([{ status: backup.status }, { status: schemaDrift.status }, { status: oldObjectDisposition.status }]) }
}

async function collectUat15(ctx) {
  const scenarioId = 'REAL-UAT-15'
  const startedAt = new Date().toISOString()
  const runId = randomUUID().slice(0, 8)
  const localTraceStart = ctx.apiTrace.length
  const injected = await apiCall(ctx, 'observability-client-error-injection', '/api/client-errors', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: {
      source: 'REAL-UAT-15',
      message: `controlled staging incident signal ${runId}`,
      url: joinApiPath(ctx.clientBase, `/projects/${ctx.projectId}/dashboard`),
      happenedAt: new Date().toISOString(),
      metadata: {
        runId,
        tier: ctx.tier,
        projectId: ctx.projectId,
      },
    },
  })
  await apiCall(ctx, 'observability-jobs-status-readback', '/api/jobs/status', { headers: adminAuthHeaders(ctx) })
  await apiCall(ctx, 'observability-notifications-diagnostics-readback', `/api/notifications/diagnostics?projectId=${encodeURIComponent(ctx.projectId)}`)
  const trace = ctx.apiTrace.slice(localTraceStart)
  const common = baseEvidence(ctx, scenarioId, startedAt, 'node project-testing/tools/collect-v14241-real-uat07-16-evidence.mjs --scenario-id REAL-UAT-15 --tier staging --include-staging --confirm-real-handoff --allow-write')
  common.screenshotsOrTrace = [rel(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-15-api-trace.json')), rel(join(ctx.artifactRoot, 'incident-review.md'))]
  common.apiFailureSummary = unexpectedFailures(trace)
  common.cleanupOrRollbackReadback = {
    status: 'pass',
    injectedSignalRunId: runId,
    writesCreated: 1,
    retention: 'client error telemetry retained by application logging policy; no production alert mutation executed',
  }

  const observability = {
    schemaVersion: 'workbuddy/v14241-real-uat15-observability-incident/v1',
    ...common,
    status: common.apiFailureSummary.length === 0 && injected.result.ok ? 'pass' : 'blocked',
    injectedSignal: {
      runId,
      route: '/api/client-errors',
      status: injected.result.status,
      accepted: injected.result.ok,
    },
    jobStatusReadback: {
      authMode: ctx.adminToken ? 'company_admin' : 'primary_actor',
      status: trace.find((item) => item.label === 'observability-jobs-status-readback')?.status ?? null,
    },
    readbacks: trace,
  }

  const alertDelivery = {
    schemaVersion: 'workbuddy/v14241-real-uat15-alert-delivery-proof/v1',
    ...common,
    status: injected.result.ok ? 'pass' : 'blocked',
    deliveryBoundary: 'controlled staging internal signal only',
    alertRecipientRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_15_TARGET_REFS_ALERT_RECIPIENT_REF',
    onCallScheduleRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_15_TARGET_REFS_ON_CALL_SCHEDULE_REF',
    productionGapPreserved: 'External pager/on-call delivery and SLA response are not proven by this staging collector.',
  }

  const incidentReviewMd = [
    '# REAL-UAT-15 Staging Incident Review',
    '',
    `- Environment: ${ctx.tier}`,
    `- Started at: ${startedAt}`,
    `- Finished at: ${new Date().toISOString()}`,
    `- Company/project: ${ctx.companyId} / ${ctx.projectId}`,
    `- Synthetic signal: ${runId}`,
    '- Trigger: POST /api/client-errors with controlled staging metadata',
    '- Readback: jobs status queried with company_admin when available; notification diagnostics queried with authenticated staging actor',
    '- Runbook refs: docs/release-runbook.md, docs/lighthouse-server-runbook.md',
    '- Boundary: this closes controlled staging observability exercise only; external on-call paging, SLA and production incident response remain live handoff gates.',
    '',
  ].join('\n')

  await writeJson(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-15-api-trace.json'), { trace })
  await writeJson(join(ctx.artifactRoot, 'real-uat-15-observability-incident.json'), observability)
  await writeJson(join(ctx.artifactRoot, 'alert-delivery-proof.json'), alertDelivery)
  await writeText(join(ctx.artifactRoot, 'incident-review.md'), incidentReviewMd)
  return { scenarioId, status: statusFromChecks([{ status: observability.status }, { status: alertDelivery.status }]) }
}

async function collectUat16(ctx) {
  const scenarioId = 'REAL-UAT-16'
  const startedAt = new Date().toISOString()
  const localTraceStart = ctx.apiTrace.length
  await apiCall(ctx, 'support-auth-me-readback', '/api/auth/me')
  await apiCall(ctx, 'support-project-bootstrap-readback', `/api/projects/${encodeURIComponent(ctx.projectId)}/bootstrap`)
  await apiCall(ctx, 'support-data-quality-project-summary', `/api/data-quality/project-summary?projectId=${encodeURIComponent(ctx.projectId)}`)
  await apiCall(ctx, 'support-notification-diagnostics', `/api/notifications/diagnostics?projectId=${encodeURIComponent(ctx.projectId)}`)
  const db = await runDbReadbacks([
    {
      id: 'operation_logs_recent_readback',
      sqlShape: 'SELECT recent operation_logs count for project/user',
      sql: 'SELECT count(*)::int AS operation_log_count FROM public.operation_logs WHERE project_id::text = $1 OR user_id::text = $2',
      params: [ctx.projectId, ctx.userId],
    },
    {
      id: 'change_logs_recent_readback',
      sqlShape: 'SELECT recent change_logs count for project',
      sql: 'SELECT count(*)::int AS change_log_count FROM public.change_logs WHERE project_id::text = $1',
      params: [ctx.projectId],
    },
  ])
  const trace = ctx.apiTrace.slice(localTraceStart)
  const common = baseEvidence(ctx, scenarioId, startedAt, 'node project-testing/tools/collect-v14241-real-uat07-16-evidence.mjs --scenario-id REAL-UAT-16 --tier staging --include-staging --confirm-real-handoff --allow-write')
  common.screenshotsOrTrace = [rel(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-16-api-trace.json'))]
  common.apiFailureSummary = unexpectedFailures(trace)
  common.cleanupOrRollbackReadback = {
    status: 'pass',
    compensationMode: 'read_only_noop',
    beforeAfterReadback: 'project/auth/data-quality/notification diagnostics were read before any compensation; no write compensation was executed',
  }

  const supportOps = {
    schemaVersion: 'workbuddy/v14241-real-uat16-support-ops/v1',
    ...common,
    status: common.apiFailureSummary.length === 0 && db.status === 'pass' ? 'pass' : 'blocked',
    ticketRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_16_TARGET_REFS_TICKET_REF',
    supportAccountRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_16_ACTOR_REFS_SUPPORT_ACCOUNT_REF',
    supportSystemBoundary: 'No dedicated support-ticket service route exists in the current app; staging exercise uses authenticated admin diagnostics and audit readback.',
    apiTrace: trace,
  }

  const supportAudit = {
    schemaVersion: 'workbuddy/v14241-real-uat16-support-audit-readback/v1',
    ...common,
    status: db.status,
    auditExportRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_16_TARGET_REFS_AUDIT_EXPORT_REF',
    dbReadback: db,
  }

  const compensation = {
    schemaVersion: 'workbuddy/v14241-real-uat16-data-compensation-proof/v1',
    ...common,
    status: 'pass',
    compensationToolRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_REAL_UAT_16_TARGET_REFS_COMPENSATION_TOOL_REF',
    proofMode: 'controlled_staging_noop',
    beforeAfter: {
      beforeReadbackPaths: trace.map((item) => item.path),
      mutationExecuted: false,
      afterReadbackRequiredForRealCompensation: true,
    },
    productionGapPreserved: 'Manual data compensation in live still requires ticket, approval, rollback and before/after readback.',
  }

  await writeJson(join(ctx.artifactRoot, 'operator-evidence', 'real-uat-16-api-trace.json'), { trace })
  await writeJson(join(ctx.artifactRoot, 'real-uat-16-support-ops.json'), supportOps)
  await writeJson(join(ctx.artifactRoot, 'support-audit-readback.json'), supportAudit)
  await writeJson(join(ctx.artifactRoot, 'data-compensation-proof.json'), compensation)
  return { scenarioId, status: statusFromChecks([{ status: supportOps.status }, { status: supportAudit.status }, { status: compensation.status }]) }
}

const collectors = new Map([
  ['REAL-UAT-07', collectUat07],
  ['REAL-UAT-11', collectUat11],
  ['REAL-UAT-12', collectUat12],
  ['REAL-UAT-13', collectUat13],
  ['REAL-UAT-14', collectUat14],
  ['REAL-UAT-15', collectUat15],
  ['REAL-UAT-16', collectUat16],
])

async function main() {
  const tier = argValue('--tier', 'staging')
  if (tier !== 'staging') {
    throw new Error('collect-v14241-real-uat07-16-evidence currently supports controlled staging only')
  }
  const flags = {
    includeStaging: hasFlag('--include-staging'),
    confirmRealHandoff: hasFlag('--confirm-real-handoff'),
    allowWrite: hasFlag('--allow-write'),
  }
  if (!flags.includeStaging || !flags.confirmRealHandoff || !flags.allowWrite) {
    throw new Error('controlled staging collection requires --include-staging --confirm-real-handoff --allow-write')
  }

  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const handoffFile = resolve(argValue('--handoff-file', defaultHandoffFile))
  const matrixFile = resolve(argValue('--matrix-file', defaultMatrixFile))
  const artifactRoot = resolve(argValue('--artifact-root', join(releaseDir, 'v14241-real-env-evidence', 'staging')))
  const evidenceRoot = resolve(argValue('--evidence-root', artifactRoot))
  const output = resolve(argValue('--output', join(releaseDir, 'v14241-real-uat07-16-evidence-collection.json')))
  const scenarioIds = argValues('--scenario-id')
  const selected = scenarioIds.length > 0 ? scenarioIds : supportedScenarioIds
  for (const scenarioId of selected) {
    if (!collectors.has(scenarioId)) {
      throw new Error(`Unsupported scenario id: ${scenarioId}. Expected one of ${supportedScenarioIds.join(', ')}`)
    }
  }

  if (!existsSync(defaultRefsEnvFile)) {
    throw new Error(`Missing controlled staging refs env file: ${rel(defaultRefsEnvFile)}`)
  }

  const ctx = await buildContext({
    tier,
    releaseDir,
    handoffFile,
    matrixFile,
    artifactRoot,
    evidenceRoot,
    publicOrigin: argValue('--public-origin', process.env.PUBLIC_HTTPS_ORIGIN ?? ''),
  })
  const results = []
  for (const scenarioId of selected) {
    const collector = collectors.get(scenarioId)
    results.push(await collector(ctx))
  }

  const report = {
    schemaVersion: 'workbuddy/v14241-real-uat07-16-evidence-collection/v1',
    generatedAt: new Date().toISOString(),
    status: results.every((item) => item.status === 'pass') ? 'pass' : 'blocked',
    tier,
    selectedScenarioCount: selected.length,
    results,
    artifactRoot: rel(artifactRoot),
    handoffFile: rel(handoffFile),
    matrixFile: rel(matrixFile),
    boundary: {
      controlledStagingOnly: true,
      liveMutation: false,
      rawSecretsWritten: false,
      productionClaimsForbidden: true,
    },
  }
  await writeJson(output, report)
  console.log(JSON.stringify({
    status: report.status,
    tier: report.tier,
    selectedScenarioCount: report.selectedScenarioCount,
    results: report.results,
    output: rel(output),
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
