#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateHandoffReadiness } from './build-v14241-real-env-handoff-pack.mjs'
import { resolvePublicHttpsOrigin } from '../../scripts/public-origin.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.candidate.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultOutput = join(defaultReleaseDir, 'v14241-real-uat05-gantt-critical-path.execution.json')
const scenarioId = 'REAL-UAT-05'

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

async function readJsonIfPresent(path, fallback = null) {
  if (!path || !existsSync(path)) return fallback
  return readJson(path)
}

async function readTextIfPresent(path) {
  if (!existsSync(path)) return ''
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
}

function normalizeTier(value) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'UAT' || normalized === 'staging' || normalized === 'solo-live' || normalized === 'live') return normalized
  throw new Error(`Unsupported tier: ${value}. Expected UAT, staging, solo-live, or live.`)
}

function unwrapData(body) {
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

function readEnvText(text) {
  const values = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    values[key] = line.slice(line.indexOf('=') + 1).trim()
  }
  return values
}

async function resolveEnvRef(ref) {
  const value = String(ref ?? '').trim()
  const match = /^env:\/\/(.+)#([A-Z0-9_]+)$/i.exec(value)
  if (!match) return { status: 'unsupported_ref', ref }
  const envPath = resolve(repoRoot, match[1])
  const key = match[2]
  const env = readEnvText(await readTextIfPresent(envPath))
  const resolved = env[key] ?? ''
  return resolved
    ? { status: 'resolved', ref, value: resolved, path: rel(envPath), key }
    : { status: 'missing_env_value', ref, path: rel(envPath), key }
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

function summarizeBody(body) {
  const data = unwrapData(body)
  if (Array.isArray(data)) return { itemCount: data.length }
  if (!data || typeof data !== 'object') return { type: typeof data }
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    id: data.id ?? data.projectId ?? null,
    status: data.status ?? null,
    itemCount: Array.isArray(data.items) ? data.items.length : undefined,
  }
}

function responseDigest(result, redactions = []) {
  return {
    ok: result.ok,
    status: result.status,
    elapsedMs: result.elapsedMs,
    bodySummary: summarizeBody(sanitize(result.body, redactions)),
  }
}

async function request({ url, method = 'GET', headers = {}, body = undefined, timeoutMs = 30000 }) {
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
      parsed = { rawTextPreview: text.slice(0, 400) }
    }
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      body: parsed,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      body: { error: error instanceof Error ? error.message : String(error) },
    }
  } finally {
    clearTimeout(timer)
  }
}

function joinApiPath(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
}

function authHeaders(token, companyId = null) {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    ...(companyId ? { 'x-company-id': companyId } : {}),
  }
}

function tierUnlockIssues(tier, flags) {
  const requiredFlag = tier === 'UAT' ? '--include-uat' : tier === 'staging' ? '--include-staging' : tier === 'solo-live' ? '--include-solo-live' : '--include-live'
  return [
    flags[requiredFlag] ? null : `missing ${requiredFlag}`,
    flags['--confirm-real-handoff'] ? null : 'missing --confirm-real-handoff',
    flags['--allow-write'] ? null : 'missing --allow-write',
  ].filter(Boolean)
}

function selectTierReadiness(readiness, tier) {
  const scenario = readiness.scenarios.find((item) => item.id === scenarioId)
  const tierReadiness = scenario?.tiers.find((item) => item.name === tier)
  return { scenario, tier: tierReadiness }
}

function scenarioRefs(handoff, tier) {
  return handoff.scenarios?.[scenarioId]?.tiers?.[tier] ?? {}
}

async function resolveExecutionRefs({ handoff, tier }) {
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
    largeProjectId: targetRefs.largeProjectRef,
    criticalPathReadbackRef: targetRefs.criticalPathReadbackRef,
    performanceThreshold: expectedEvidenceRefs.performanceThresholdRef,
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

function buildBaseReport({ now, tier, handoffFile, matrixFile, output, artifactRoot, flags }) {
  return {
    schemaVersion: 'workbuddy/v14241-real-uat05-gantt-critical-path-execution/v1',
    generatedAt: now.toISOString(),
    scenarioId,
    tier,
    status: 'blocked',
    handoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    output: rel(resolve(output)),
    artifactRoot: rel(resolve(artifactRoot)),
    mutationBoundary: 'Runs Gantt task, dependency, critical-path, conflict, and performance evidence checks only after real-environment handoff and explicit execution unlock.',
    commandsExecuted: 0,
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
    unlockFlags: flags,
    blockers: [],
    checks: [],
  }
}

function assertNoSecretLikeText(report) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_real_uat05_report_with_secret_like_text')
  }
}

async function writeReport(report, output) {
  assertNoSecretLikeText(report)
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

async function login({ apiBase, username, password, redactions, publicOrigin }) {
  const resolvedPublicOrigin = resolvePublicHttpsOrigin({ apiBaseUrl: apiBase, publicOrigin })
  const result = await request({
    url: joinApiPath(apiBase, '/api/auth/login'),
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: resolvedPublicOrigin },
    body: { username, password },
    timeoutMs: 10000,
  })
  const token = result.body?.data?.token
  return { result, token, digest: responseDigest(result, [...redactions, token].filter(Boolean)) }
}

function evidenceStatus(doc) {
  return doc?.status === 'pass' || doc?.status === 'passed'
}

function idMatches(doc, key, expected) {
  if (!expected) return true
  const actual = doc?.[key] ?? doc?.metadata?.[key] ?? doc?.targetIds?.[key]
  return actual == null || String(actual) === String(expected)
}

function criticalPathEvidenceIsUsable(doc) {
  if (!doc) return false
  if (doc.criticalPathUpdated === true) return true
  if (Number(doc.criticalPathTaskCount ?? doc.taskCount ?? 0) > 0) return true
  if (Array.isArray(doc.criticalPathTasks) && doc.criticalPathTasks.length > 0) return true
  if (Array.isArray(doc.primaryChain) && doc.primaryChain.length > 0) return true
  return false
}

function traceEvidenceIsUsable(doc) {
  return Boolean(
    doc
      && evidenceStatus(doc)
      && (doc.taskEditReadback?.status === 'pass' || doc.taskEditReadback?.status === 'passed')
      && (doc.dependencyReadback?.status === 'pass' || doc.dependencyReadback?.status === 'passed')
      && (doc.conflictHandling?.status === 'pass' || doc.conflictHandling?.status === 'passed' || doc.conflictHandling?.status === 'expected_conflict'),
  )
}

function performanceEvidenceIsUsable(doc, thresholdMs) {
  const p95Ms = Number(doc?.p95Ms ?? doc?.metrics?.p95Ms ?? Number.NaN)
  return evidenceStatus(doc) && Number.isFinite(p95Ms) && p95Ms <= thresholdMs
}

async function checkJsonEvidenceFile({ id, file, projectId, largeProjectId, requiredKeys, validator }) {
  const doc = await readJsonIfPresent(file, null)
  const present = Boolean(doc)
  const missingKeys = present
    ? requiredKeys.filter((key) => doc?.[key] == null && doc?.metadata?.[key] == null)
    : requiredKeys
  const idMatch =
    present
    && idMatches(doc, 'projectId', projectId)
    && idMatches(doc, 'largeProjectId', largeProjectId)
  const validatorOk = present ? validator(doc) : false
  return {
    id,
    status: present && missingKeys.length === 0 && idMatch && validatorOk ? 'pass' : 'blocked',
    artifact: file ? rel(resolve(file)) : null,
    present,
    evidenceStatus: doc?.status ?? null,
    missingKeys,
    idMatch,
    validatorOk,
  }
}

async function executeScenario({
  report,
  handoff,
  tier,
  resolvedRefs,
  artifactRoot,
  ganttTraceFile,
  criticalPathReadbackFile,
  performanceGanttP95File,
  cleanupReadbackFile,
  publicOrigin,
  now,
}) {
  const redactions = [resolvedRefs.username.value, resolvedRefs.password.value]
  const apiBase = resolvedRefs.apiBase.value
  const companyId = resolvedRefs.companyId.value
  const projectId = resolvedRefs.projectId.value
  const largeProjectId = resolvedRefs.largeProjectId.value
  const thresholdMs = Number(resolvedRefs.performanceThreshold.value || 2500)
  const loginResult = await login({
    apiBase,
    username: resolvedRefs.username.value,
    password: resolvedRefs.password.value,
    redactions,
    publicOrigin,
  })
  report.commandsExecuted += 1
  report.checks.push({ id: 'auth-login', status: loginResult.token ? 'pass' : 'blocked', result: loginResult.digest })
  if (!loginResult.token) {
    report.status = 'blocked_login_failed'
    report.blockers.push('auth_login_failed')
    return report
  }

  const projectRead = await request({
    url: joinApiPath(apiBase, `/api/projects/${largeProjectId}`),
    headers: authHeaders(loginResult.token, companyId),
    timeoutMs: 10000,
  })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'large-project-readback',
    status: projectRead.ok ? 'pass' : 'blocked',
    result: responseDigest(projectRead, redactions),
  })

  const tasksRead = await request({
    url: joinApiPath(apiBase, `/api/tasks?projectId=${encodeURIComponent(largeProjectId)}`),
    headers: authHeaders(loginResult.token, companyId),
    timeoutMs: 15000,
  })
  report.commandsExecuted += 1
  const taskRows = Array.isArray(unwrapData(tasksRead.body)) ? unwrapData(tasksRead.body) : []
  report.checks.push({
    id: 'large-project-task-readback',
    status: tasksRead.ok && taskRows.length > 0 ? 'pass' : 'blocked',
    result: responseDigest(tasksRead, redactions),
  })

  const criticalPathApiRead = await request({
    url: joinApiPath(apiBase, `/api/projects/${largeProjectId}/critical-path`),
    headers: authHeaders(loginResult.token, companyId),
    timeoutMs: 15000,
  })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'critical-path-api-readback',
    status: criticalPathApiRead.ok ? 'pass' : 'blocked',
    result: responseDigest(criticalPathApiRead, redactions),
  })

  const traceEvidence = await checkJsonEvidenceFile({
    id: 'gantt-edit-dependency-conflict-trace',
    file: ganttTraceFile,
    projectId,
    largeProjectId,
    requiredKeys: ['environment', 'projectId', 'status', 'taskEditReadback', 'dependencyReadback', 'conflictHandling', 'screenshotsOrTrace'],
    validator: traceEvidenceIsUsable,
  })
  const criticalPathEvidence = await checkJsonEvidenceFile({
    id: 'critical-path-readback',
    file: criticalPathReadbackFile,
    projectId,
    largeProjectId,
    requiredKeys: ['environment', 'projectId', 'status'],
    validator: (doc) => evidenceStatus(doc) && criticalPathEvidenceIsUsable(doc),
  })
  const performanceEvidence = await checkJsonEvidenceFile({
    id: 'performance-gantt-p95',
    file: performanceGanttP95File,
    projectId,
    largeProjectId,
    requiredKeys: ['environment', 'projectId', 'status', 'p95Ms'],
    validator: (doc) => performanceEvidenceIsUsable(doc, thresholdMs),
  })
  const cleanupEvidence = await checkJsonEvidenceFile({
    id: 'cleanup-readback',
    file: cleanupReadbackFile,
    projectId,
    largeProjectId,
    requiredKeys: ['environment', 'projectId', 'status'],
    validator: evidenceStatus,
  })
  report.checks.push(traceEvidence, criticalPathEvidence, performanceEvidence, cleanupEvidence)

  if (report.checks.every((check) => check.status === 'pass')) {
    report.status = 'passed'
    report.canCloseScenarioTier = true
    report.closesRealEnvironmentTier = true
  } else {
    report.status = 'blocked_required_gantt_critical_path_or_performance_evidence_missing'
    for (const check of [traceEvidence, criticalPathEvidence, performanceEvidence, cleanupEvidence]) {
      if (check.status !== 'pass') report.blockers.push(`${check.id}_required`)
    }
    if (!projectRead.ok) report.blockers.push('large_project_readback_failed')
    if (!(tasksRead.ok && taskRows.length > 0)) report.blockers.push('large_project_task_readback_failed')
    if (!criticalPathApiRead.ok) report.blockers.push('critical_path_api_readback_failed')
  }

  const evidence = {
    schemaVersion: 'workbuddy/v14241-real-uat05-gantt-critical-path-evidence/v1',
    generatedAt: now.toISOString(),
    environment: tier,
    baseUrl: apiBase,
    actorRefs: scenarioRefs(handoff, tier).actorRefs ?? {},
    companyId,
    projectId,
    largeProjectId,
    startedAt: report.generatedAt,
    finishedAt: new Date().toISOString(),
    commandOrManualScript: 'node project-testing/tools/run-v14241-real-uat05-gantt-critical-path.mjs',
    screenshotsOrTrace: traceEvidence.status === 'pass' ? [traceEvidence.artifact] : [],
    apiFailureSummary: report.checks.filter((check) => check.result && check.status !== 'pass').map((check) => ({ id: check.id, status: check.result.status })),
    consoleErrorSummary: [],
    cleanupOrRollbackReadback: cleanupEvidence.status === 'pass'
      ? { status: 'pass', artifact: cleanupEvidence.artifact }
      : { status: 'operator_cleanup_or_rollback_required', cleanupRef: scenarioRefs(handoff, tier).cleanupRef ?? '' },
    checks: report.checks.map((check) => ({ id: check.id, status: check.status })),
  }
  const evidencePath = join(artifactRoot, 'real-uat-05-gantt-critical-path.json')
  assertNoSecretLikeText(evidence)
  await mkdir(dirname(evidencePath), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  report.evidenceArtifacts = {
    main: rel(evidencePath),
    ganttTrace: ganttTraceFile ? rel(resolve(ganttTraceFile)) : null,
    criticalPathReadback: criticalPathReadbackFile ? rel(resolve(criticalPathReadbackFile)) : null,
    performanceGanttP95: performanceGanttP95File ? rel(resolve(performanceGanttP95File)) : null,
    cleanupReadback: cleanupReadbackFile ? rel(resolve(cleanupReadbackFile)) : null,
  }
  return report
}

export async function runUat05GanttCriticalPath({
  tier = 'staging',
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  releaseDir = defaultReleaseDir,
  output = defaultOutput,
  artifactRoot = null,
  ganttTraceFile = null,
  criticalPathReadbackFile = null,
  performanceGanttP95File = null,
  cleanupReadbackFile = null,
  publicOrigin = null,
  flags = {},
  now = new Date(),
} = {}) {
  const normalizedTier = normalizeTier(tier)
  const resolvedReleaseDir = resolve(releaseDir)
  const resolvedArtifactRoot = resolve(artifactRoot ?? join(resolvedReleaseDir, 'v14241-real-env-evidence', normalizedTier.toLowerCase()))
  const report = buildBaseReport({
    now,
    tier: normalizedTier,
    handoffFile,
    matrixFile,
    output,
    artifactRoot: resolvedArtifactRoot,
    flags,
  })

  const [handoff, matrix] = await Promise.all([readJson(resolve(handoffFile)), readJson(resolve(matrixFile))])
  const readiness = evaluateHandoffReadiness({ handoff, matrix, now })
  const selected = selectTierReadiness(readiness, normalizedTier)
  report.handoffReadiness = {
    status: readiness.status,
    readyToExecuteMatrix: readiness.readyToExecuteMatrix,
    scenarioReadyToRun: selected.scenario?.readyToRun === true,
    tierReadyToRun: selected.tier?.readyToRun === true,
    tierMissingEnvironmentFields: selected.tier?.missingEnvironmentFields ?? [],
    tierMissingScenarioFields: selected.tier?.missingScenarioFields ?? [],
    tierMissingOwnerFields: selected.tier?.missingOwnerFields ?? [],
  }

  if (!selected.tier?.readyToRun) {
    report.status = 'blocked_missing_real_handoff_inputs'
    report.blockers.push(
      ...report.handoffReadiness.tierMissingEnvironmentFields.map((field) => `environment:${field}`),
      ...report.handoffReadiness.tierMissingScenarioFields.map((field) => `scenario:${field}`),
      ...report.handoffReadiness.tierMissingOwnerFields.map((field) => `owner:${field}`),
    )
    return writeReport(report, output)
  }

  const unlockIssues = tierUnlockIssues(normalizedTier, flags)
  if (unlockIssues.length > 0) {
    report.status = 'blocked_missing_execution_unlock'
    report.blockers.push(...unlockIssues)
    return writeReport(report, output)
  }

  const resolvedRefs = await resolveExecutionRefs({ handoff, tier: normalizedTier })
  report.resolvedRefs = Object.fromEntries(Object.entries(resolvedRefs.resolved).map(([key, value]) => [
    key,
    {
      status: value.status,
      ref: value.ref,
      path: value.path ?? null,
      key: value.key ?? null,
      valueWrittenToReport: false,
    },
  ]))
  if (resolvedRefs.issues.length > 0) {
    report.status = 'blocked_unresolvable_execution_refs'
    report.blockers.push(...resolvedRefs.issues)
    return writeReport(report, output)
  }

  const executed = await executeScenario({
    report,
    handoff,
    tier: normalizedTier,
    resolvedRefs: Object.fromEntries(Object.entries(resolvedRefs.resolved).map(([key, value]) => [key, value])),
    artifactRoot: resolvedArtifactRoot,
    ganttTraceFile,
    criticalPathReadbackFile,
    performanceGanttP95File,
    cleanupReadbackFile,
    publicOrigin,
    now,
  })
  return writeReport(executed, output)
}

async function main() {
  const tier = argValue('--tier', 'staging')
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const handoffFile = resolve(argValue('--handoff-file', join(releaseDir, 'v14241-real-env-handoff.candidate.json')))
  const matrixFile = resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json')))
  const output = resolve(argValue('--output', defaultOutput))
  const artifactRoot = resolve(argValue('--artifact-root', join(releaseDir, 'v14241-real-env-evidence', String(tier).toLowerCase())))
  const flags = {
    '--include-uat': hasFlag('--include-uat'),
    '--include-staging': hasFlag('--include-staging'),
    '--include-solo-live': hasFlag('--include-solo-live'),
    '--include-live': hasFlag('--include-live'),
    '--confirm-real-handoff': hasFlag('--confirm-real-handoff'),
    '--allow-write': hasFlag('--allow-write'),
  }
  const report = await runUat05GanttCriticalPath({
    tier,
    handoffFile,
    matrixFile,
    releaseDir,
    output,
    artifactRoot,
    ganttTraceFile: argValue('--gantt-trace-file', null),
    criticalPathReadbackFile: argValue('--critical-path-readback-file', null),
    performanceGanttP95File: argValue('--performance-gantt-p95-file', null),
    cleanupReadbackFile: argValue('--cleanup-readback-file', null),
    publicOrigin: argValue('--public-origin', process.env.PUBLIC_HTTPS_ORIGIN ?? ''),
    flags,
  })
  console.log(JSON.stringify({
    status: report.status,
    scenarioId: report.scenarioId,
    tier: report.tier,
    commandsExecuted: report.commandsExecuted,
    canCloseScenarioTier: report.canCloseScenarioTier,
    blockers: report.blockers,
    output: rel(output),
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
