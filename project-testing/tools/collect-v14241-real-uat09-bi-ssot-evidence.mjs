#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as XLSX from '@e965/xlsx'
import pg from 'pg'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.controlled-staging.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultRefsEnvFile = join(repoRoot, '.tmp', 'v14241-controlled-staging', 'v14241-controlled-staging.refs.env')
const defaultDbEnvFile = join(repoRoot, 'deploy', 'env', 'staging.env')
const scenarioId = 'REAL-UAT-09'

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
    snapshotRef: targetRefs.snapshotRef,
    metricRegistryRef: targetRefs.metricRegistryRef,
    exportSampleRef: expectedEvidenceRefs.exportSampleRef,
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
    pointCount: Array.isArray(data.points) ? data.points.length : undefined,
    projectCount: Array.isArray(data.projects) ? data.projects.length : undefined,
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

async function downloadBinary({ url, headers = {}, timeoutMs = 30000 }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    const arrayBuffer = await response.arrayBuffer()
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      contentType: response.headers.get('content-type') ?? null,
      contentDisposition: response.headers.get('content-disposition') ?? null,
      buffer: Buffer.from(arrayBuffer),
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      contentType: null,
      contentDisposition: null,
      buffer: Buffer.alloc(0),
      error: error instanceof Error ? error.message : String(error),
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

async function login({ apiBase, username, password, redactions }) {
  const result = await requestJson({
    url: joinApiPath(apiBase, '/api/auth/login'),
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: { username, password },
    timeoutMs: 10000,
  })
  const token = result.body?.data?.token ?? null
  return { result, token, digest: responseDigest(result, [...redactions, token].filter(Boolean)) }
}

function metricKeyOf(metric) {
  return String(metric?.metricKey ?? metric?.key ?? metric?.id ?? metric?.metric ?? '').trim()
}

function chooseMetric(metricsBody) {
  const metrics = Array.isArray(unwrapData(metricsBody)) ? unwrapData(metricsBody) : []
  const preferred = metrics.find((item) => metricKeyOf(item) === 'overall_progress')
    ?? metrics.find((item) => metricKeyOf(item) === 'business_health_score')
    ?? metrics.find((item) => metricKeyOf(item))
  return {
    metric: metricKeyOf(preferred) || null,
    metricCount: metrics.length,
    firstMetricFields: Object.keys(metrics[0] ?? {}).slice(0, 12),
    preferredMetricFields: Object.keys(preferred ?? {}).slice(0, 12),
  }
}

function normalizeConnectionString(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const parsed = new URL(raw)
  parsed.searchParams.delete('sslmode')
  return parsed.toString()
}

function dbConnectionStringFromEnv(env) {
  return normalizeConnectionString(
    env.WORKBUDDY_RUNTIME_DATABASE_URL
    || env.DB_CONNECTION_STRING
    || env.DATABASE_URL
    || env.DIRECT_DATABASE_URL,
  )
}

async function withDbClient(dbEnvFile, fn) {
  const env = await readEnvFile(dbEnvFile)
  const connectionString = dbConnectionStringFromEnv(env)
  if (!connectionString) {
    return {
      status: 'blocked',
      reason: 'database_connection_ref_missing',
      connectionSourceRef: `${rel(resolve(dbEnvFile))}#WORKBUDDY_RUNTIME_DATABASE_URL|DB_CONNECTION_STRING|DATABASE_URL|DIRECT_DATABASE_URL`,
    }
  }
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    query_timeout: 8000,
  })
  try {
    await client.connect()
    return await fn(client)
  } finally {
    await client.end().catch(() => {})
  }
}

async function readSnapshotLineage({ dbEnvFile, projectId }) {
  return withDbClient(dbEnvFile, async (client) => {
    const snapshotRows = await client.query(
      `SELECT count(*)::int AS count, max(snapshot_date)::text AS latest
       FROM public.project_daily_snapshot
       WHERE project_id::text = $1`,
      [projectId],
    )
    const metricRows = await client.query(
      `SELECT count(*)::int AS count, max(snapshot_date)::text AS latest
       FROM public.metric_value_snapshots
       WHERE project_id::text = $1`,
      [projectId],
    )
    const latestMetrics = await client.query(
      `SELECT metric_key, source_type, caliber_version, snapshot_date::text AS snapshot_date, availability_status
       FROM public.metric_value_snapshots
       WHERE project_id::text = $1
       ORDER BY snapshot_date DESC, metric_key ASC
       LIMIT 20`,
      [projectId],
    )
    return {
      status: 'pass',
      connectionSourceRef: `${rel(resolve(dbEnvFile))}#WORKBUDDY_RUNTIME_DATABASE_URL|DB_CONNECTION_STRING|DATABASE_URL|DIRECT_DATABASE_URL`,
      rawConnectionWrittenToReport: false,
      projectDailySnapshot: snapshotRows.rows[0] ?? { count: 0, latest: null },
      metricValueSnapshots: metricRows.rows[0] ?? { count: 0, latest: null },
      sampleMetricRows: latestMetrics.rows.map((row) => ({
        metricKey: row.metric_key,
        sourceType: row.source_type,
        caliberVersion: row.caliber_version,
        snapshotDate: row.snapshot_date,
        availabilityStatus: row.availability_status,
      })),
    }
  }).catch((error) => ({
    status: 'blocked',
    connectionSourceRef: `${rel(resolve(dbEnvFile))}#WORKBUDDY_RUNTIME_DATABASE_URL|DB_CONNECTION_STRING|DATABASE_URL|DIRECT_DATABASE_URL`,
    rawConnectionWrittenToReport: false,
    reason: error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://<redacted>') : String(error),
  }))
}

function hasSnapshotLineage(lineage) {
  return Number(lineage?.projectDailySnapshot?.count ?? 0) > 0
    && Number(lineage?.metricValueSnapshots?.count ?? 0) > 0
}

async function loginForSnapshotJob({ apiBase, refsEnvFile, fallbackUsername, fallbackPassword, redactions }) {
  const refsEnv = await readEnvFile(refsEnvFile)
  const candidates = [
    {
      id: 'owner',
      usernameKey: 'V14241_STAGING_OWNER_USERNAME',
      passwordKey: 'V14241_STAGING_OWNER_PASSWORD',
    },
    {
      id: 'editor',
      usernameKey: 'V14241_STAGING_EDITOR_USERNAME',
      passwordKey: 'V14241_STAGING_EDITOR_PASSWORD',
    },
    {
      id: 'test-user',
      username: fallbackUsername,
      password: fallbackPassword,
    },
  ].map((candidate) => ({
    ...candidate,
    username: candidate.username ?? refsEnv[candidate.usernameKey],
    password: candidate.password ?? refsEnv[candidate.passwordKey],
  })).filter((candidate) => candidate.username && candidate.password)

  const attempts = []
  for (const candidate of candidates) {
    const loginResult = await login({
      apiBase,
      username: candidate.username,
      password: candidate.password,
      redactions: [...redactions, candidate.username, candidate.password],
    })
    attempts.push({
      credentialRef: candidate.usernameKey
        ? `${rel(resolve(refsEnvFile))}#${candidate.usernameKey}+${candidate.passwordKey}`
        : 'handoff credential refs',
      tokenReceived: Boolean(loginResult.token),
      result: loginResult.digest,
      rawCredentialWrittenToReport: false,
    })
    if (loginResult.token) {
      return {
        token: loginResult.token,
        credentialRef: attempts.at(-1).credentialRef,
        attempts,
        redactions: [...redactions, candidate.username, candidate.password, loginResult.token],
      }
    }
  }

  return {
    token: null,
    credentialRef: null,
    attempts,
    redactions,
  }
}

function validateWorkbook(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const firstSheetName = workbook.SheetNames[0] ?? null
    const rows = firstSheetName ? XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1 }) : []
    return {
      status: firstSheetName && rows.length > 0 ? 'pass' : 'blocked',
      sheetCount: workbook.SheetNames.length,
      firstSheetName,
      firstSheetRowCount: rows.length,
      firstRowColumnCount: Array.isArray(rows[0]) ? rows[0].length : 0,
    }
  } catch (error) {
    return {
      status: 'blocked',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function checkStatus(id, condition, extra = {}) {
  return { id, status: condition ? 'pass' : 'blocked', ...extra }
}

function assertNoSecretLikeText(report, redactions = []) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_real_uat09_report_with_secret_like_text')
  }
  for (const redaction of redactions) {
    if (redaction && text.includes(redaction)) {
      throw new Error('refusing_to_write_real_uat09_report_with_raw_secret_or_credential_text')
    }
  }
}

async function writeJsonEvidence(path, doc, redactions) {
  assertNoSecretLikeText(doc, redactions)
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(resolve(path), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
}

export async function collectUat09BiSsotEvidence({
  tier = 'staging',
  releaseDir = defaultReleaseDir,
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  refsEnvFile = defaultRefsEnvFile,
  dbEnvFile = defaultDbEnvFile,
  artifactRoot = null,
  flags = {},
  allowSnapshotGeneration = false,
  now = new Date(),
} = {}) {
  const normalizedTier = normalizeTier(tier)
  const startedAt = now.toISOString()
  const resolvedReleaseDir = resolve(releaseDir)
  const resolvedRefsEnvFile = resolve(refsEnvFile)
  const resolvedArtifactRoot = resolve(artifactRoot ?? join(resolvedReleaseDir, 'v14241-real-env-evidence', normalizedTier.toLowerCase()))
  const evidenceDir = join(resolvedArtifactRoot, 'operator-evidence')
  const exportPath = join(evidenceDir, 'report-export-sample.xlsx')
  const tracePath = join(evidenceDir, 'real-uat-09-api-trace.json')
  const mainPath = join(evidenceDir, 'real-uat-09-bi-ssot.json')
  const lineagePath = join(evidenceDir, 'metric-lineage-readback.json')
  const handoff = await readJson(resolve(handoffFile))
  const checks = []
  const commands = []
  const flagsIssues = tierUnlockIssues(normalizedTier, flags)
  if (flagsIssues.length > 0) {
    checks.push(checkStatus('execution-unlock', false, { blockers: flagsIssues }))
  } else {
    checks.push(checkStatus('execution-unlock', true))
  }

  const refs = await resolveExecutionRefs(handoff, normalizedTier)
  checks.push(checkStatus('execution-refs-resolved', refs.issues.length === 0, { issues: refs.issues }))
  if (flagsIssues.length > 0 || refs.issues.length > 0) {
    const blocked = {
      schemaVersion: 'workbuddy/v14241-real-uat09-bi-ssot-evidence/v1',
      generatedAt: startedAt,
      status: 'blocked',
      environment: normalizedTier,
      blockers: [...flagsIssues, ...refs.issues],
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
  const companyId = resolved.companyId
  const projectId = resolved.projectId

  const loginResult = await login({
    apiBase,
    username: resolved.username,
    password: resolved.password,
    redactions,
  })
  commands.push({ id: 'auth-login', method: 'POST', path: '/api/auth/login' })
  checks.push(checkStatus('auth-login', Boolean(loginResult.token), { result: loginResult.digest }))
  if (!loginResult.token) {
    const blocked = {
      schemaVersion: 'workbuddy/v14241-real-uat09-bi-ssot-evidence/v1',
      generatedAt: startedAt,
      status: 'blocked',
      environment: normalizedTier,
      baseUrl: apiBase,
      companyId,
      projectId,
      blockers: ['auth_login_failed'],
      checks,
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
  const headers = authHeaders(token, companyId)
  const dbBefore = await readSnapshotLineage({ dbEnvFile, projectId })
  commands.push({ id: 'db-snapshot-lineage-before', method: 'READ', path: 'project_daily_snapshot + metric_value_snapshots' })
  let snapshotJobResult = null
  let snapshotGenerationAttempted = false
  if (!hasSnapshotLineage(dbBefore) && allowSnapshotGeneration) {
    snapshotGenerationAttempted = true
    const snapshotLogin = await loginForSnapshotJob({
      apiBase,
      refsEnvFile: resolvedRefsEnvFile,
      fallbackUsername: resolved.username,
      fallbackPassword: resolved.password,
      redactions,
    })
    commands.push({ id: 'snapshot-job-admin-login', method: 'POST', path: '/api/auth/login' })
    checks.push(checkStatus('snapshot-job-admin-login', Boolean(snapshotLogin.token), {
      credentialRef: snapshotLogin.credentialRef,
      attempts: snapshotLogin.attempts,
      rawCredentialWrittenToReport: false,
    }))
    snapshotJobResult = await requestJson({
      url: joinApiPath(apiBase, '/api/jobs/projectDailySnapshotJob/execute'),
      method: 'POST',
      headers: {
        ...authHeaders(snapshotLogin.token ?? token, companyId),
        'content-type': 'application/json',
      },
      body: {},
      timeoutMs: 60000,
    })
    commands.push({ id: 'project-daily-snapshot-job', method: 'POST', path: '/api/jobs/projectDailySnapshotJob/execute' })
  }
  const dbAfter = await readSnapshotLineage({ dbEnvFile, projectId })
  commands.push({ id: 'db-snapshot-lineage-after', method: 'READ', path: 'project_daily_snapshot + metric_value_snapshots' })

  checks.push(checkStatus('snapshot-lineage-db-readback', hasSnapshotLineage(dbAfter), {
    before: dbBefore,
    after: dbAfter,
    snapshotGenerationAttempted,
    snapshotJobResult: snapshotJobResult ? responseDigest(snapshotJobResult, redactions) : null,
  }))

  const apiChecks = []
  async function getApi(id, path, timeoutMs = 30000) {
    const result = await requestJson({ url: joinApiPath(apiBase, path), headers, timeoutMs })
    commands.push({ id, method: 'GET', path })
    const check = checkStatus(id, result.ok, { result: responseDigest(result, redactions) })
    checks.push(check)
    apiChecks.push({ id, path, result })
    return result
  }

  const me = await getApi('auth-me', '/api/auth/me', 10000)
  const workspace = await getApi('workspace-read', '/api/workspace', 10000)
  const metrics = await getApi('metric-registry-read', '/api/analytics/metrics', 10000)
  const metricChoice = chooseMetric(metrics.body)
  checks.push(checkStatus('metric-choice', Boolean(metricChoice.metric), metricChoice))
  const projectSummary = await getApi('dashboard-project-summary', `/api/projects/${encodeURIComponent(projectId)}/dashboard/project-summary`, 30000)
  const projectsSummary = await getApi('dashboard-projects-summary', '/api/company/dashboard/projects-summary', 30000)
  const companySummary = await getApi('dashboard-company-summary', '/api/company/dashboard/company-summary', 30000)
  const projectTrend = metricChoice.metric
    ? await getApi('analytics-project-trend', `/api/analytics/project-trend?projectId=${encodeURIComponent(projectId)}&metric=${encodeURIComponent(metricChoice.metric)}`, 30000)
    : null
  const companyTrend = metricChoice.metric
    ? await getApi('analytics-company-trend', `/api/analytics/company-trend?metric=${encodeURIComponent(metricChoice.metric)}`, 30000)
    : null
  const sCurve = await getApi('reports-s-curve', `/api/projects/${encodeURIComponent(projectId)}/reports/s-curve`, 30000)

  const exportDownload = await downloadBinary({
    url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(projectId)}/reports/export?format=xlsx&view=progress`),
    headers,
    timeoutMs: 60000,
  })
  commands.push({ id: 'report-export-xlsx', method: 'GET', path: '/api/projects/:projectId/reports/export?format=xlsx&view=progress' })
  const workbookValidation = exportDownload.ok ? validateWorkbook(exportDownload.buffer) : { status: 'blocked' }
  if (exportDownload.ok) {
    await mkdir(dirname(exportPath), { recursive: true })
    await writeFile(exportPath, exportDownload.buffer)
  }
  checks.push(checkStatus('report-export-download-and-open', exportDownload.ok && workbookValidation.status === 'pass', {
    result: {
      ok: exportDownload.ok,
      status: exportDownload.status,
      elapsedMs: exportDownload.elapsedMs,
      contentType: exportDownload.contentType,
      byteLength: exportDownload.buffer.length,
      artifact: exportDownload.ok ? rel(exportPath) : null,
    },
    workbookValidation,
  }))

  const projectSummaryData = unwrapData(projectSummary.body) ?? {}
  const projectsSummaryData = Array.isArray(unwrapData(projectsSummary.body)) ? unwrapData(projectsSummary.body) : []
  const selectedProjectInSummary = projectsSummaryData.find((item) => String(item?.id ?? '') === String(projectId)) ?? null
  checks.push(checkStatus('dashboard-project-id-consistency', Boolean(projectSummaryData?.id === projectId && selectedProjectInSummary), {
    projectSummaryId: projectSummaryData?.id ?? null,
    selectedProjectFoundInProjectsSummary: Boolean(selectedProjectInSummary),
  }))

  const finishedAt = new Date().toISOString()
  const failedChecks = checks.filter((check) => check.status !== 'pass').map((check) => check.id)
  const status = failedChecks.length === 0 ? 'pass' : 'blocked'
  const common = {
    environment: normalizedTier,
    baseUrl: apiBase,
    actorRefs: scenarioRefs(handoff, normalizedTier).actorRefs ?? {},
    companyId,
    projectId,
    startedAt,
    finishedAt,
    commandOrManualScript: 'node project-testing/tools/collect-v14241-real-uat09-bi-ssot-evidence.mjs',
    screenshotsOrTrace: [rel(tracePath)],
    apiFailureSummary: checks
      .filter((check) => check.status !== 'pass')
      .map((check) => ({ id: check.id, status: check.status })),
    consoleErrorSummary: [],
    cleanupOrRollbackReadback: {
      status: 'pass',
      mutationBoundary: snapshotGenerationAttempted
        ? 'controlled staging snapshot generation through /api/jobs/projectDailySnapshotJob/execute; no manual cleanup required because snapshot rows are retained as BI lineage evidence'
        : 'read-only API/DB/export probe; no cleanup required',
      cleanupRequired: false,
    },
  }

  const traceDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat09-bi-ssot-api-trace/v1',
    generatedAt: finishedAt,
    status,
    ...common,
    rawTokenWrittenToReport: false,
    rawCredentialWrittenToReport: false,
    commandsExecuted: commands.length,
    commands,
    checks: checks.map((check) => sanitize(check, redactions)),
    apiTrace: apiChecks.map((item) => ({
      id: item.id,
      path: item.path,
      result: responseDigest(item.result, redactions),
    })),
  }
  const lineageDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat09-metric-lineage-readback/v1',
    generatedAt: finishedAt,
    status: hasSnapshotLineage(dbAfter) && metrics.ok && Boolean(metricChoice.metric) && sCurve.ok ? 'pass' : 'blocked',
    ...common,
    snapshotRef: refs.resolved.snapshotRef.ref,
    metricRegistryRef: refs.resolved.metricRegistryRef.ref,
    selectedMetric: metricChoice.metric,
    dbReadback: dbAfter,
    lineageHints: {
      dashboardProjectSummaryRoute: 'server/src/routes/dashboard.ts:/api/projects/:projectId/dashboard/project-summary -> projectExecutionSummaryService',
      dashboardCompanySummaryRoute: 'server/src/routes/dashboard.ts:/api/company/dashboard/company-summary -> projectExecutionSummaryService + project_daily_snapshot health history',
      analyticsMetricRegistryRoute: 'server/src/routes/analytics.ts:/api/analytics/metrics -> metricRegistryService',
      reportsSCurveRoute: 'server/src/routes/reports.ts:/api/projects/:projectId/reports/s-curve -> project_daily_snapshot + projectExecutionSummaryService fallback',
      snapshotWriter: snapshotGenerationAttempted
        ? '/api/jobs/projectDailySnapshotJob/execute -> recordProjectDailySnapshots -> projectDailySnapshotService'
        : 'existing project_daily_snapshot / metric_value_snapshots rows',
    },
    apiReadback: {
      metricRegistry: responseDigest(metrics, redactions),
      projectTrend: projectTrend ? responseDigest(projectTrend, redactions) : null,
      companyTrend: companyTrend ? responseDigest(companyTrend, redactions) : null,
      sCurve: responseDigest(sCurve, redactions),
    },
  }
  const mainDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat09-bi-ssot-evidence/v1',
    generatedAt: finishedAt,
    status,
    ...common,
    snapshotGeneration: {
      attempted: snapshotGenerationAttempted,
      allowedByFlag: allowSnapshotGeneration,
      result: snapshotJobResult ? responseDigest(snapshotJobResult, redactions) : null,
    },
    selectedMetric: metricChoice.metric,
    selectedTargetRefs: {
      snapshotRef: refs.resolved.snapshotRef.ref,
      metricRegistryRef: refs.resolved.metricRegistryRef.ref,
      exportSampleRef: refs.resolved.exportSampleRef.ref,
      valuesWrittenToReport: false,
    },
    evidenceArtifacts: {
      apiTrace: rel(tracePath),
      metricLineageReadback: rel(lineagePath),
      reportExportSample: exportDownload.ok ? rel(exportPath) : null,
    },
    checks: checks.map((check) => ({ id: check.id, status: check.status })),
    summary: {
      failedChecks,
      commandsExecuted: commands.length,
      projectDailySnapshotCount: Number(dbAfter?.projectDailySnapshot?.count ?? 0),
      metricValueSnapshotCount: Number(dbAfter?.metricValueSnapshots?.count ?? 0),
      exportByteLength: exportDownload.buffer.length,
      workbookValidation,
      dashboardProjectSummaryOk: projectSummary.ok,
      dashboardProjectsSummaryOk: projectsSummary.ok,
      dashboardCompanySummaryOk: companySummary.ok,
      metricRegistryOk: metrics.ok,
      projectTrendOk: projectTrend?.ok ?? false,
      companyTrendOk: companyTrend?.ok ?? false,
      sCurveOk: sCurve.ok,
      authMeOk: me.ok,
      workspaceOk: workspace.ok,
    },
    productionReadyClaim: false,
    mutationBoundary: {
      environment: normalizedTier,
      writesSnapshotOnlyWhenMissingAndExplicitlyAllowed: snapshotGenerationAttempted,
      writesProduction: false,
      rawSecretsForbidden: true,
    },
  }

  await writeJsonEvidence(tracePath, traceDoc, redactions)
  await writeJsonEvidence(lineagePath, lineageDoc, redactions)
  await writeJsonEvidence(mainPath, mainDoc, redactions)

  return {
    status,
    scenarioId,
    tier: normalizedTier,
    commandsExecuted: commands.length,
    canCloseScenarioTier: status === 'pass',
    blockers: failedChecks,
    outputs: [rel(mainPath), rel(lineagePath), rel(exportPath), rel(tracePath)],
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
  const report = await collectUat09BiSsotEvidence({
    tier,
    releaseDir,
    handoffFile: resolve(argValue('--handoff-file', defaultHandoffFile)),
    matrixFile: resolve(argValue('--matrix-file', defaultMatrixFile)),
    refsEnvFile: resolve(argValue('--refs-env-file', defaultRefsEnvFile)),
    dbEnvFile: resolve(argValue('--db-env-file', defaultDbEnvFile)),
    artifactRoot,
    flags,
    allowSnapshotGeneration: hasFlag('--allow-snapshot-generation'),
  })
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
