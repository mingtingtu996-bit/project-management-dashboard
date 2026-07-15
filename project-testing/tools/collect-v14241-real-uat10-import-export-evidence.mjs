#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as XLSX from '@e965/xlsx'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.controlled-staging.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultRefsEnvFile = join(repoRoot, '.tmp', 'v14241-controlled-staging', 'v14241-controlled-staging.refs.env')
const scenarioId = 'REAL-UAT-10'

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
    importFileSetRef: targetRefs.importFileSetRef,
    exportValidatorRef: targetRefs.exportValidatorRef,
    permissionNegativeRef: expectedEvidenceRefs.permissionNegativeRef,
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
    totalRows: data.totalRows,
    validRows: data.validRows,
    invalidRowCount: Array.isArray(data.invalidRows) ? data.invalidRows.length : undefined,
    warningCount: Array.isArray(data.warnings) ? data.warnings.length : undefined,
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

export function buildUat10ImportRows() {
  return [
    {
      title: 'REAL-UAT-10 导入样本-土方开挖',
      start_date: '2026-07-01',
      end_date: '2026-07-05',
      duration: 5,
      progress: 10,
      assignee: 'owner',
    },
    {
      name: 'REAL-UAT-10 导入样本-基础钢筋',
      planned_start_date: '2026-07-06',
      planned_end_date: '2026-07-12',
      duration: 7,
      progress: 0,
      assignee: 'editor',
      unmapped_cost_code: 'UAT10-COST-001',
    },
    {
      任务名称: 'REAL-UAT-10 导入样本-模板安装',
      start_date: '2026-07-13',
      end_date: '2026-07-18',
      duration: 6,
      progress: 0,
      assignee: 'external-coordinator',
    },
    {
      start_date: '2026-07-19',
      end_date: '2026-07-20',
      duration: 2,
      progress: 0,
      assignee: 'missing-title-row',
    },
  ]
}

export function buildImportWorkbookBuffer(rows = buildUat10ImportRows()) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'UAT10 Import')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

export function validateWorkbookBuffer(buffer) {
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

export function validatePdfBuffer(buffer) {
  const header = Buffer.isBuffer(buffer) ? buffer.subarray(0, 8).toString('utf8') : ''
  return header.startsWith('%PDF-')
    ? { status: 'pass', byteLength: buffer.length, header: '%PDF-*' }
    : { status: 'blocked', byteLength: Buffer.isBuffer(buffer) ? buffer.length : 0, header: header.replace(/[^\x20-\x7E]/g, '.') }
}

function checkStatus(id, condition, extra = {}) {
  return { id, status: condition ? 'pass' : 'blocked', ...extra }
}

export function assertNoSecretLikeText(report, redactions = []) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_real_uat10_report_with_secret_like_text')
  }
  for (const redaction of redactions) {
    if (redaction && text.includes(redaction)) {
      throw new Error('refusing_to_write_real_uat10_report_with_raw_secret_or_credential_text')
    }
  }
}

async function writeJsonEvidence(path, doc, redactions) {
  assertNoSecretLikeText(doc, redactions)
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(resolve(path), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
}

function artifactResult(download, artifactPath, validation) {
  return {
    ok: download.ok,
    status: download.status,
    elapsedMs: download.elapsedMs,
    contentType: download.contentType,
    contentDispositionPresent: Boolean(download.contentDisposition),
    byteLength: download.buffer.length,
    artifact: download.ok ? rel(artifactPath) : null,
    validation,
  }
}

function failedCheckIds(checks) {
  return checks.filter((check) => check.status !== 'pass').map((check) => check.id)
}

export async function collectUat10ImportExportEvidence({
  tier = 'staging',
  releaseDir = defaultReleaseDir,
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  refsEnvFile = defaultRefsEnvFile,
  artifactRoot = null,
  flags = {},
  now = new Date(),
} = {}) {
  const normalizedTier = normalizeTier(tier)
  const startedAt = now.toISOString()
  const resolvedReleaseDir = resolve(releaseDir)
  const resolvedRefsEnvFile = resolve(refsEnvFile)
  const resolvedArtifactRoot = resolve(artifactRoot ?? join(resolvedReleaseDir, 'v14241-real-env-evidence', normalizedTier.toLowerCase()))
  const evidenceDir = join(resolvedArtifactRoot, 'operator-evidence')
  const mainPath = join(evidenceDir, 'real-uat-10-import-export.json')
  const exportValidationPath = join(evidenceDir, 'export-open-validation.json')
  const permissionNegativePath = join(evidenceDir, 'permission-negative-download.json')
  const tracePath = join(evidenceDir, 'real-uat-10-api-trace.json')
  const importSamplePath = join(evidenceDir, 'real-uat-10-import-sample.xlsx')
  const xlsxExportPath = join(evidenceDir, 'real-uat-10-report-export.xlsx')
  const pdfExportPath = join(evidenceDir, 'real-uat-10-report-export.pdf')
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
      schemaVersion: 'workbuddy/v14241-real-uat10-import-export-evidence/v1',
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
  apiTrace.push({ id: 'auth-login', path: '/api/auth/login', result: loginResult.digest })
  if (!loginResult.token) {
    const blocked = {
      schemaVersion: 'workbuddy/v14241-real-uat10-import-export-evidence/v1',
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
  const rows = buildUat10ImportRows()
  const importWorkbook = buildImportWorkbookBuffer(rows)
  const importWorkbookValidation = validateWorkbookBuffer(importWorkbook)
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(importSamplePath, importWorkbook)
  checks.push(checkStatus('import-sample-workbook-open', importWorkbookValidation.status === 'pass', {
    artifact: rel(importSamplePath),
    validation: importWorkbookValidation,
    rowCount: rows.length,
  }))

  const importResult = await requestJson({
    url: joinApiPath(apiBase, '/api/projects/import/excel'),
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: { projectId, fileType: 'xlsx', rows },
    timeoutMs: 30000,
  })
  commands.push({ id: 'project-import-precheck', method: 'POST', path: '/api/projects/import/excel' })
  const importData = unwrapData(importResult.body) ?? {}
  checks.push(checkStatus(
    'project-import-precheck',
    importResult.ok
      && importData.fileType === 'xlsx'
      && importData.totalRows === rows.length
      && importData.validRows === 3
      && Array.isArray(importData.invalidRows)
      && importData.invalidRows.length === 1
      && Array.isArray(importData.warnings)
      && importData.warnings.length >= 2,
    { result: responseDigest(importResult, redactionsWithToken) },
  ))
  apiTrace.push({ id: 'project-import-precheck', path: '/api/projects/import/excel', result: responseDigest(importResult, redactionsWithToken) })

  const xlsxExport = await downloadBinary({
    url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(projectId)}/reports/export?format=xlsx&view=progress`),
    headers,
    timeoutMs: 60000,
  })
  commands.push({ id: 'report-export-xlsx', method: 'GET', path: '/api/projects/:projectId/reports/export?format=xlsx&view=progress' })
  const xlsxValidation = xlsxExport.ok ? validateWorkbookBuffer(xlsxExport.buffer) : { status: 'blocked' }
  if (xlsxExport.ok) await writeFile(xlsxExportPath, xlsxExport.buffer)
  checks.push(checkStatus('report-export-xlsx-open', xlsxExport.ok && xlsxValidation.status === 'pass', {
    result: artifactResult(xlsxExport, xlsxExportPath, xlsxValidation),
  }))
  apiTrace.push({ id: 'report-export-xlsx', path: '/api/projects/:projectId/reports/export?format=xlsx&view=progress', result: sanitize(artifactResult(xlsxExport, xlsxExportPath, xlsxValidation), redactionsWithToken) })

  const pdfExport = await downloadBinary({
    url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(projectId)}/reports/export?format=pdf&view=progress`),
    headers,
    timeoutMs: 90000,
  })
  commands.push({ id: 'report-export-pdf', method: 'GET', path: '/api/projects/:projectId/reports/export?format=pdf&view=progress' })
  const pdfValidation = pdfExport.ok ? validatePdfBuffer(pdfExport.buffer) : { status: 'blocked' }
  if (pdfExport.ok) await writeFile(pdfExportPath, pdfExport.buffer)
  checks.push(checkStatus('report-export-pdf-open', pdfExport.ok && pdfValidation.status === 'pass', {
    result: artifactResult(pdfExport, pdfExportPath, pdfValidation),
  }))
  apiTrace.push({ id: 'report-export-pdf', path: '/api/projects/:projectId/reports/export?format=pdf&view=progress', result: sanitize(artifactResult(pdfExport, pdfExportPath, pdfValidation), redactionsWithToken) })

  const noAuthDownload = await downloadBinary({
    url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(projectId)}/reports/export?format=xlsx&view=progress`),
    headers: { accept: 'application/json' },
    timeoutMs: 30000,
  })
  commands.push({ id: 'permission-negative-no-auth-download', method: 'GET', path: '/api/projects/:projectId/reports/export?format=xlsx&view=progress' })
  checks.push(checkStatus('permission-negative-no-auth-download', noAuthDownload.status === 401, {
    result: {
      ok: noAuthDownload.ok,
      status: noAuthDownload.status,
      elapsedMs: noAuthDownload.elapsedMs,
      contentType: noAuthDownload.contentType,
      byteLength: noAuthDownload.buffer.length,
    },
  }))

  const wrongCompanyId = '00000000-0000-4000-8000-000000000010'
  const wrongCompanyDownload = await downloadBinary({
    url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(projectId)}/reports/export?format=xlsx&view=progress`),
    headers: authHeaders(token, wrongCompanyId),
    timeoutMs: 30000,
  })
  commands.push({ id: 'permission-negative-cross-company-download', method: 'GET', path: '/api/projects/:projectId/reports/export?format=xlsx&view=progress' })
  checks.push(checkStatus('permission-negative-cross-company-download', wrongCompanyDownload.status === 403, {
    wrongCompanyId,
    result: {
      ok: wrongCompanyDownload.ok,
      status: wrongCompanyDownload.status,
      elapsedMs: wrongCompanyDownload.elapsedMs,
      contentType: wrongCompanyDownload.contentType,
      byteLength: wrongCompanyDownload.buffer.length,
    },
  }))

  const finishedAt = new Date().toISOString()
  const failedChecks = failedCheckIds(checks)
  const status = failedChecks.length === 0 ? 'pass' : 'blocked'
  const common = {
    environment: normalizedTier,
    baseUrl: apiBase,
    actorRefs: scenarioRefs(handoff, normalizedTier).actorRefs ?? {},
    companyId,
    projectId,
    startedAt,
    finishedAt,
    commandOrManualScript: 'node project-testing/tools/collect-v14241-real-uat10-import-export-evidence.mjs',
    screenshotsOrTrace: [rel(tracePath)],
    apiFailureSummary: checks
      .filter((check) => check.status !== 'pass')
      .map((check) => ({ id: check.id, status: check.status })),
    consoleErrorSummary: [],
    cleanupOrRollbackReadback: {
      status: 'pass',
      cleanupRequired: false,
      mutationBoundary: 'import precheck validates rows only; report exports and permission negatives are read-only; generated local evidence files retained under project-testing/reports',
    },
  }

  const exportValidationDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat10-export-open-validation/v1',
    generatedAt: finishedAt,
    status: checks.find((check) => check.id === 'import-sample-workbook-open')?.status === 'pass'
      && checks.find((check) => check.id === 'report-export-xlsx-open')?.status === 'pass'
      && checks.find((check) => check.id === 'report-export-pdf-open')?.status === 'pass'
      ? 'pass'
      : 'blocked',
    ...common,
    importSample: {
      artifact: rel(importSamplePath),
      rowCount: rows.length,
      validation: importWorkbookValidation,
    },
    xlsxExport: artifactResult(xlsxExport, xlsxExportPath, xlsxValidation),
    pdfExport: artifactResult(pdfExport, pdfExportPath, pdfValidation),
    rawTokenWrittenToReport: false,
    rawCredentialWrittenToReport: false,
  }

  const permissionDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat10-permission-negative-download/v1',
    generatedAt: finishedAt,
    status: checks.find((check) => check.id === 'permission-negative-no-auth-download')?.status === 'pass'
      && checks.find((check) => check.id === 'permission-negative-cross-company-download')?.status === 'pass'
      ? 'pass'
      : 'blocked',
    ...common,
    permissionNegativeRef: refs.resolved.permissionNegativeRef.ref,
    negativeCases: {
      noAuthDownload: {
        expectedStatus: 401,
        actualStatus: noAuthDownload.status,
        passed: noAuthDownload.status === 401,
      },
      crossCompanyDownload: {
        expectedStatus: 403,
        actualStatus: wrongCompanyDownload.status,
        wrongCompanyId,
        passed: wrongCompanyDownload.status === 403,
      },
    },
    rawTokenWrittenToReport: false,
    rawCredentialWrittenToReport: false,
  }

  const traceDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat10-api-trace/v1',
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

  const mainDoc = {
    schemaVersion: 'workbuddy/v14241-real-uat10-import-export-evidence/v1',
    generatedAt: finishedAt,
    status,
    ...common,
    selectedTargetRefs: {
      importFileSetRef: refs.resolved.importFileSetRef.ref,
      exportValidatorRef: refs.resolved.exportValidatorRef.ref,
      permissionNegativeRef: refs.resolved.permissionNegativeRef.ref,
      valuesWrittenToReport: false,
    },
    evidenceArtifacts: {
      importSample: rel(importSamplePath),
      xlsxExport: xlsxExport.ok ? rel(xlsxExportPath) : null,
      pdfExport: pdfExport.ok ? rel(pdfExportPath) : null,
      exportOpenValidation: rel(exportValidationPath),
      permissionNegativeDownload: rel(permissionNegativePath),
      apiTrace: rel(tracePath),
    },
    checks: checks.map((check) => ({ id: check.id, status: check.status })),
    summary: {
      failedChecks,
      commandsExecuted: commands.length,
      importPrecheck: {
        ok: importResult.ok,
        totalRows: importData.totalRows ?? null,
        validRows: importData.validRows ?? null,
        invalidRowCount: Array.isArray(importData.invalidRows) ? importData.invalidRows.length : null,
        warningCount: Array.isArray(importData.warnings) ? importData.warnings.length : null,
      },
      xlsxExportByteLength: xlsxExport.buffer.length,
      pdfExportByteLength: pdfExport.buffer.length,
      noAuthStatus: noAuthDownload.status,
      crossCompanyStatus: wrongCompanyDownload.status,
    },
    productionReadyClaim: false,
    mutationBoundary: {
      environment: normalizedTier,
      writesProduction: false,
      stagingWrites: false,
      importRouteWriteBehavior: 'precheck only; rows are not persisted by /api/projects/import/excel',
      rawSecretsForbidden: true,
    },
  }

  await writeJsonEvidence(exportValidationPath, exportValidationDoc, redactionsWithToken)
  await writeJsonEvidence(permissionNegativePath, permissionDoc, redactionsWithToken)
  await writeJsonEvidence(tracePath, traceDoc, redactionsWithToken)
  await writeJsonEvidence(mainPath, mainDoc, redactionsWithToken)

  return {
    status,
    scenarioId,
    tier: normalizedTier,
    commandsExecuted: commands.length,
    canCloseScenarioTier: status === 'pass',
    blockers: failedChecks,
    outputs: [rel(mainPath), rel(exportValidationPath), rel(permissionNegativePath), rel(importSamplePath), rel(xlsxExportPath), rel(pdfExportPath), rel(tracePath)],
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
  const report = await collectUat10ImportExportEvidence({
    tier,
    releaseDir,
    handoffFile: resolve(argValue('--handoff-file', defaultHandoffFile)),
    matrixFile: resolve(argValue('--matrix-file', defaultMatrixFile)),
    refsEnvFile: resolve(argValue('--refs-env-file', defaultRefsEnvFile)),
    artifactRoot,
    flags,
  })
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
