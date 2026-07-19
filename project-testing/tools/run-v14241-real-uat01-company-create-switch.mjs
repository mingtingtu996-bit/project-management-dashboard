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
const defaultOutput = join(defaultReleaseDir, 'v14241-real-uat01-company-create-switch.execution.json')
const defaultAuditEnvFile = join(repoRoot, 'server', '.env')
const scenarioId = 'REAL-UAT-01'

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

function getByPath(value, dottedPath) {
  let current = value
  for (const part of String(dottedPath).split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined
    current = current[part]
  }
  return current
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

function responseDigest(result, redactions = []) {
  return {
    ok: result.ok,
    status: result.status,
    elapsedMs: result.elapsedMs,
    bodySummary: summarizeBody(sanitize(result.body, redactions)),
  }
}

function summarizeBody(body) {
  const data = unwrapData(body)
  if (Array.isArray(data)) return { itemCount: data.length }
  if (!data || typeof data !== 'object') return { type: typeof data }
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    id: data.id ?? data.companyId ?? null,
    namePresent: typeof data.name === 'string' && data.name.length > 0,
    role: data.role ?? data.currentCompany?.role ?? null,
    hasCompany: data.hasCompany ?? null,
    currentCompanyIdPresent: Boolean(data.currentCompany?.id),
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
  if (!baseUrl) return ''
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
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

function parseEnvText(text) {
  const values = {}
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const separator = trimmed.indexOf('=')
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

async function resolveEnvRef(ref) {
  const match = /^env:\/\/(.+)#([A-Z0-9_]+)$/i.exec(String(ref ?? '').trim())
  if (!match) return { status: 'unsupported_ref', ref }
  const envPath = resolve(repoRoot, match[1])
  const key = match[2]
  const env = readEnvText(await readTextIfPresent(envPath))
  const value = env[key] ?? ''
  return value
    ? { status: 'resolved', ref, value, path: rel(envPath), key }
    : { status: 'missing_env_value', ref, path: rel(envPath), key }
}

function describeAuditEnvFile(auditEnvFile) {
  const explicit = Boolean(String(auditEnvFile ?? '').trim())
  const envFile = explicit ? resolve(repoRoot, String(auditEnvFile)) : defaultAuditEnvFile
  return {
    explicit,
    envFile,
    report: {
      envFile: rel(envFile),
      explicit,
      valueWrittenToReport: false,
    },
  }
}

function authHeaders(token) {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  }
}

function jsonHeaders(token = null) {
  return {
    ...authHeaders(token),
    'content-type': 'application/json',
  }
}

async function createServiceClient(auditEnvFile = null) {
  const source = describeAuditEnvFile(auditEnvFile)
  const env = parseEnvText(await readTextIfPresent(source.envFile))
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { client: null, source, queryError: 'service_client_unavailable' }
  const { createClient } = await import('@supabase/supabase-js')
  return { client: createClient(url, key, { auth: { persistSession: false } }), source, queryError: null }
}

async function writeAuditReadback({ auditReadbackFile, auditEnvFile, tier, paths, since, companyId }) {
  if (!auditReadbackFile) return null
  const { client, source, queryError: serviceClientError } = await createServiceClient(auditEnvFile)
  const expectedPaths = paths.map((path) => String(path))
  let rows = []
  let queryError = serviceClientError
  if (client) {
    const result = await client
      .from('operation_logs')
      .select('id, method, path, status_code, created_at')
      .in('path', expectedPaths)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)
    if (result.error) queryError = result.error.message
    rows = result.data ?? []
  }
  const passedPaths = new Set(rows.filter((row) => Number(row.status_code) < 400).map((row) => row.path))
  const missingPaths = expectedPaths.filter((path) => !passedPaths.has(path))
  const doc = {
    schemaVersion: 'workbuddy/v14241-real-uat01-audit-readback/v1',
    generatedAt: new Date().toISOString(),
    environment: tier,
    scenarioId,
    companyId,
    status: missingPaths.length === 0 && !queryError ? 'pass' : 'blocked',
    expectedPaths,
    observedOperationCount: rows.length,
    missingPaths,
    queryError,
    auditReadbackSource: source.report,
    valueWrittenToReport: false,
  }
  await mkdir(dirname(resolve(auditReadbackFile)), { recursive: true })
  await writeFile(resolve(auditReadbackFile), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return doc
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

function scenarioActorRefs(handoff, tier) {
  return handoff.scenarios?.[scenarioId]?.tiers?.[tier]?.actorRefs ?? {}
}

function scenarioTargetRefs(handoff, tier) {
  return handoff.scenarios?.[scenarioId]?.tiers?.[tier]?.targetRefs ?? {}
}

async function resolveExecutionRefs({ handoff, tier }) {
  const envTarget = handoff.environmentTargets?.[tier] ?? {}
  const credentials = envTarget.credentialRefs ?? {}
  const refs = {
    apiBase: tier === 'staging' ? envTarget.apiBaseUrlRef : envTarget.apiBaseUrlRef || envTarget.baseUrlRef,
    clientBase: tier === 'staging' ? envTarget.clientBaseUrlRef : envTarget.clientBaseUrlRef || envTarget.baseUrlRef,
    username: credentials.testUserEmailRef || envTarget.roleAccountRefs?.company_admin || scenarioActorRefs(handoff, tier).primaryTesterRef,
    password: credentials.testUserPasswordRef,
  }
  const resolved = {}
  const issues = []
  for (const [key, ref] of Object.entries(refs)) {
    const result = await resolveEnvRef(ref)
    resolved[key] = result
    if (result.status !== 'resolved') issues.push(`${key}:${result.status}`)
  }
  return { refs, resolved, issues }
}

function buildBaseReport({ now, tier, handoffFile, matrixFile, output, artifactRoot, auditEnvFile, flags }) {
  return {
    schemaVersion: 'workbuddy/v14241-real-uat01-company-create-switch-execution/v1',
    generatedAt: now.toISOString(),
    scenarioId,
    tier,
    status: 'blocked',
    handoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    output: rel(resolve(output)),
    artifactRoot: rel(resolve(artifactRoot)),
    mutationBoundary: 'Creates a disposable company only after tier handoff is ready and --include-<tier> --confirm-real-handoff --allow-write are supplied.',
    commandsExecuted: 0,
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
    unlockFlags: flags,
    auditReadbackSource: describeAuditEnvFile(auditEnvFile).report,
    blockers: [],
    checks: [],
    createdRefs: {},
  }
}

function assertNoSecretLikeText(report) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_real_uat01_report_with_secret_like_text')
  }
}

async function writeReport(report, output) {
  assertNoSecretLikeText(report)
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

async function routeApiRequestsToBase(page, apiBase, token, companyId) {
  await page.route('**/api/**', async (route) => {
    const source = new URL(route.request().url())
    const headers = {
      ...route.request().headers(),
      authorization: `Bearer ${token}`,
      'x-company-id': companyId,
    }
    await route.continue({
      url: joinApiPath(apiBase, `${source.pathname}${source.search}`),
      headers,
    })
  })
}

async function captureBrowserEvidence({ clientBase, apiBase, token, companyId, screenshotPath }) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    apiFailures: [],
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    page.setDefaultTimeout(30000)
    await routeApiRequestsToBase(page, apiBase, token, companyId)
    await page.addInitScript(({ tokenValue, companyValue }) => {
      window.localStorage.setItem('auth_token', tokenValue)
      window.localStorage.setItem('access_token', tokenValue)
      window.localStorage.setItem('current_company_id', companyValue)
      window.localStorage.setItem('onboarding_workspace_completed', 'true')
      window.localStorage.setItem('onboarding_project_completed', 'true')
    }, { tokenValue: token, companyValue: companyId })
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message))
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        diagnostics.apiFailures.push({ url: response.url(), status: response.status() })
      }
    })
    await page.goto(`${clientBase.replace(/\/+$/, '')}/#/workspace`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    await mkdir(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })
    return {
      status: diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0 && diagnostics.apiFailures.length === 0 ? 'pass' : 'blocked',
      screenshot: rel(screenshotPath),
      diagnostics: sanitize(diagnostics, [token]),
    }
  } finally {
    await browser.close()
  }
}

async function executeScenario({ report, handoff, tier, resolvedRefs, artifactRoot, auditReadbackFile, auditEnvFile, publicOrigin, now }) {
  const redactions = [resolvedRefs.username.value, resolvedRefs.password.value]
  const apiBase = resolvedRefs.apiBase.value
  const clientBase = resolvedRefs.clientBase.value
  const resolvedPublicOrigin = resolvePublicHttpsOrigin({ apiBaseUrl: apiBase, publicOrigin })
  const login = await request({
    url: joinApiPath(apiBase, '/api/auth/login'),
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: resolvedPublicOrigin },
    body: { username: resolvedRefs.username.value, password: resolvedRefs.password.value },
    timeoutMs: 10000,
  })
  report.commandsExecuted += 1
  report.checks.push({ id: 'auth-login', status: login.body?.data?.token ? 'pass' : 'blocked', result: responseDigest(login, redactions) })
  const token = login.body?.data?.token
  if (!token) {
    report.status = 'blocked_login_failed'
    report.blockers.push('auth_login_failed')
    return report
  }

  const targetRefs = scenarioTargetRefs(handoff, tier)
  const companyName = `UAT01 ${tier} ${now.toISOString().replace(/[:.]/g, '-')}`
  const beforeWorkspace = await request({
    url: joinApiPath(apiBase, '/api/workspace'),
    headers: authHeaders(token),
    timeoutMs: 10000,
  })
  report.commandsExecuted += 1
  report.checks.push({ id: 'workspace-before', status: beforeWorkspace.ok ? 'pass' : 'blocked', result: responseDigest(beforeWorkspace, redactions) })

  const createCompany = await request({
    url: joinApiPath(apiBase, '/api/workspace/companies'),
    method: 'POST',
    headers: jsonHeaders(token),
    body: {
      name: companyName,
      discoverability: 'hidden',
      join_policy: 'invite_only',
    },
    timeoutMs: 15000,
  })
  report.commandsExecuted += 1
  const createdCompany = unwrapData(createCompany.body) ?? {}
  const companyId = createdCompany.id
  report.checks.push({
    id: 'company-create',
    status: createCompany.ok && companyId ? 'pass' : 'blocked',
    result: responseDigest(createCompany, redactions),
  })
  if (!companyId) {
    report.status = 'blocked_company_create_failed'
    report.blockers.push('company_create_failed')
    return report
  }
  report.createdRefs.companyId = companyId
  report.createdRefs.companyName = companyName

  const switchCompany = await request({
    url: joinApiPath(apiBase, '/api/workspace/companies/switch'),
    method: 'POST',
    headers: jsonHeaders(token),
    body: { companyId },
    timeoutMs: 10000,
  })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'company-switch',
    status: switchCompany.ok && unwrapData(switchCompany.body)?.companyId === companyId ? 'pass' : 'blocked',
    result: responseDigest(switchCompany, redactions),
  })

  const afterWorkspace = await request({
    url: joinApiPath(apiBase, '/api/workspace'),
    headers: {
      ...authHeaders(token),
      'x-company-id': companyId,
    },
    timeoutMs: 15000,
  })
  report.commandsExecuted += 1
  const afterData = unwrapData(afterWorkspace.body) ?? {}
  report.checks.push({
    id: 'workspace-after',
    status: afterWorkspace.ok && afterData.currentCompany?.id === companyId ? 'pass' : 'blocked',
    result: responseDigest(afterWorkspace, redactions),
  })

  const screenshotPath = join(artifactRoot, 'screenshots', 'company-create-switch', 'after-switch.png')
  const browserEvidence = await captureBrowserEvidence({ clientBase, apiBase, token, companyId, screenshotPath })
  report.commandsExecuted += 1
  report.checks.push({ id: 'browser-workspace-screenshot', ...browserEvidence })

  await new Promise((resolve) => setTimeout(resolve, 500))
  await writeAuditReadback({
    auditReadbackFile,
    auditEnvFile,
    tier,
    paths: ['/api/workspace/companies', '/api/workspace/companies/switch'],
    since: report.generatedAt,
    companyId,
  })
  const auditReadback = await readJsonIfPresent(auditReadbackFile, null)
  const auditStatus = auditReadback?.status === 'pass' || auditReadback?.status === 'passed'
  report.checks.push({
    id: 'audit-readback',
    status: auditStatus ? 'pass' : 'blocked',
    artifact: auditReadbackFile ? rel(resolve(auditReadbackFile)) : null,
    reason: auditStatus ? null : 'audit_readback_file_required',
  })
  if (!auditStatus) {
    report.status = 'blocked_audit_readback_missing'
    report.blockers.push('audit_readback_file_required')
  } else if (report.checks.every((check) => check.status === 'pass')) {
    report.status = 'passed'
    report.canCloseScenarioTier = true
    report.closesRealEnvironmentTier = true
  } else {
    report.status = 'blocked_execution_checks_failed'
    report.blockers.push('one_or_more_execution_checks_failed')
  }

  const evidence = {
    schemaVersion: 'workbuddy/v14241-real-uat01-company-create-switch-evidence/v1',
    generatedAt: now.toISOString(),
    environment: tier,
    baseUrl: tier,
    actorRefs: scenarioActorRefs(handoff, tier),
    companyId,
    projectId: targetRefs.projectIdRef,
    startedAt: report.generatedAt,
    finishedAt: new Date().toISOString(),
    commandOrManualScript: 'node project-testing/tools/run-v14241-real-uat01-company-create-switch.mjs',
    screenshotsOrTrace: [rel(screenshotPath)],
    apiFailureSummary: browserEvidence.diagnostics.apiFailures,
    consoleErrorSummary: browserEvidence.diagnostics.consoleErrors,
    cleanupOrRollbackReadback: {
      cleanupRef: handoff.scenarios?.[scenarioId]?.tiers?.[tier]?.cleanupRef ?? '',
      status: 'operator_cleanup_required',
      createdCompanyId: companyId,
    },
    checks: report.checks.map((check) => ({ id: check.id, status: check.status })),
  }
  const evidencePath = join(artifactRoot, 'real-uat-01-company-create-switch.json')
  assertNoSecretLikeText(evidence)
  await mkdir(dirname(evidencePath), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  report.evidenceArtifacts = {
    main: rel(evidencePath),
    screenshot: rel(screenshotPath),
    audit: auditStatus && auditReadbackFile ? rel(resolve(auditReadbackFile)) : null,
  }
  return report
}

export async function runUat01CompanyCreateSwitch({
  tier = 'staging',
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  releaseDir = defaultReleaseDir,
  output = defaultOutput,
  artifactRoot = null,
  auditReadbackFile = null,
  auditEnvFile = null,
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
    auditEnvFile,
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
    auditReadbackFile,
    auditEnvFile,
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
  const auditReadbackFile = argValue('--audit-readback-file', '')
  const auditEnvFile = argValue('--audit-env-file', '')
  const flags = {
    '--include-uat': hasFlag('--include-uat'),
    '--include-staging': hasFlag('--include-staging'),
    '--include-solo-live': hasFlag('--include-solo-live'),
    '--include-live': hasFlag('--include-live'),
    '--confirm-real-handoff': hasFlag('--confirm-real-handoff'),
    '--allow-write': hasFlag('--allow-write'),
  }
  const report = await runUat01CompanyCreateSwitch({
    tier,
    handoffFile,
    matrixFile,
    releaseDir,
    output,
    artifactRoot,
    auditReadbackFile: auditReadbackFile ? resolve(auditReadbackFile) : null,
    auditEnvFile: auditEnvFile ? resolve(auditEnvFile) : null,
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
