#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateHandoffReadiness } from './build-v14241-real-env-handoff-pack.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.candidate.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultOutput = join(defaultReleaseDir, 'v14241-real-uat03-rls-role-matrix.execution.json')
const scenarioId = 'REAL-UAT-03'

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

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''))
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

function parseEnvText(text) {
  return readEnvText(text)
}

function describeAuditEnvFile(auditEnvFile = null) {
  const envFile = resolve(auditEnvFile || join(repoRoot, 'deploy', 'env', 'staging.env'))
  return {
    envFile,
    envFileRel: rel(envFile),
    valueWrittenToReport: false,
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

async function resolveJsonRef(ref) {
  const value = String(ref ?? '').trim()
  const fileMatch = /^file:\/\/(.+)$/i.exec(value)
  if (fileMatch) {
    const path = resolve(repoRoot, fileMatch[1])
    if (!existsSync(path)) return { status: 'missing_file', ref, path: rel(path) }
    return { status: 'resolved', ref, value: await readJson(path), path: rel(path) }
  }
  const envValue = await resolveEnvRef(value)
  if (envValue.status !== 'resolved') return envValue
  try {
    return { ...envValue, value: JSON.parse(envValue.value) }
  } catch {
    return { ...envValue, status: 'invalid_json' }
  }
}

async function cleanupDisposableForeignTarget(target) {
  if (target?.cleanup?.status === 'pass' || target?.cleanup?.status === 'passed') return target.cleanup
  if (!target?.client || !target?.companyId || !target?.projectId) {
    return { status: 'blocked', reason: 'cleanup_client_or_ids_missing' }
  }

  const projectDelete = await target.client
    .from('projects')
    .delete()
    .eq('id', target.projectId)
  const companyDelete = await target.client
    .from('companies')
    .delete()
    .eq('id', target.companyId)

  const pass = !projectDelete.error && !companyDelete.error
  return {
    status: pass ? 'pass' : 'blocked',
    projectDeleted: !projectDelete.error,
    companyDeleted: !companyDelete.error,
    projectDeleteError: projectDelete.error?.message ?? null,
    companyDeleteError: companyDelete.error?.message ?? null,
  }
}

async function provisionDisposableForeignTarget({ auditEnvFile, now }) {
  const { client, source, queryError } = await createServiceClient(auditEnvFile)
  if (!client) return { status: 'blocked', reason: queryError, source }

  const stamp = now.toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const companyId = randomUUID()
  const projectId = randomUUID()
  const companyInsert = await client
    .from('companies')
    .insert({
      id: companyId,
      name: `v14241-uat03-foreign-${stamp}`,
      status: 'active',
      is_active: true,
      discoverability: 'invite_only',
      join_policy: 'invite_only',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select('id')
    .maybeSingle()

  if (companyInsert.error) {
    return {
      status: 'blocked',
      reason: 'company_insert_failed',
      error: companyInsert.error.message,
      source,
    }
  }

  const projectInsert = await client
    .from('projects')
    .insert({
      id: projectId,
      name: `v14241 UAT03 foreign project ${stamp}`,
      company_id: companyId,
      project_visibility: 'private',
      status: '未开始',
      metadata: {
        disposable: true,
        scenarioId,
        generatedAt: now.toISOString(),
      },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select('id')
    .maybeSingle()

  if (projectInsert.error) {
    await client.from('companies').delete().eq('id', companyId)
    return {
      status: 'blocked',
      reason: 'project_insert_failed',
      error: projectInsert.error.message,
      source,
      companyId,
    }
  }

  return {
    status: 'pass',
    companyId,
    projectId,
    source,
    client,
    evidence: {
      companyId,
      projectId,
      source: {
        envFile: source.envFileRel,
        valueWrittenToReport: false,
      },
      seededVia: 'supabase_service_client',
    },
  }
}

async function maybeProvisionDisposableForeignTarget({
  secondCompanyId,
  secondProjectId,
  auditEnvFile,
  foreignTargetProvisioner,
  now,
}) {
  const needsExecutableForeignTarget = !isUuidLike(secondCompanyId) || !isUuidLike(secondProjectId)
  if (!needsExecutableForeignTarget) return null
  if (!auditEnvFile && foreignTargetProvisioner === provisionDisposableForeignTarget) return null
  return foreignTargetProvisioner({ auditEnvFile, now, secondCompanyId, secondProjectId })
}

async function resolveRefOrLiteral(value) {
  const source = String(value ?? '').trim()
  if (!source) return { status: 'missing_value', ref: value ?? null }
  if (/^env:\/\//i.test(source)) return resolveEnvRef(source)
  return { status: 'resolved', ref: null, value: source, literal: true }
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
  if (body?.members && Array.isArray(body.members)) return { memberCount: body.members.length }
  if (!data || typeof data !== 'object') return { type: typeof data }
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    projectId: data.projectId ?? null,
    permissionLevel: data.permissionLevel ?? null,
    canEdit: data.canEdit ?? null,
    canManageTeam: data.canManageTeam ?? null,
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

function authHeaders(token = null, companyId = null) {
  return {
    accept: 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(companyId ? { 'x-company-id': companyId } : {}),
  }
}

function jsonHeaders(token, companyId = null) {
  return {
    ...authHeaders(token, companyId),
    'content-type': 'application/json',
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

function buildBaseReport({ now, tier, handoffFile, matrixFile, output, artifactRoot, flags }) {
  return {
    schemaVersion: 'workbuddy/v14241-real-uat03-rls-role-matrix-execution/v1',
    generatedAt: now.toISOString(),
    scenarioId,
    tier,
    status: 'blocked',
    handoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    output: rel(resolve(output)),
    artifactRoot: rel(resolve(artifactRoot)),
    mutationBoundary: 'Runs owner/editor project access, same-company outsider denial, cross-tenant negative, and anon-deny checks only after real-environment handoff and explicit execution unlock.',
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
    throw new Error('refusing_to_write_real_uat03_report_with_secret_like_text')
  }
}

async function writeReport(report, output) {
  assertNoSecretLikeText(report)
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

async function login({ apiBase, username, password, redactions }) {
  const result = await request({
    url: joinApiPath(apiBase, '/api/auth/login'),
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: { username, password },
    timeoutMs: 10000,
  })
  const token = result.body?.data?.token
  return { result, token, digest: responseDigest(result, [...redactions, token].filter(Boolean)) }
}

async function resolveRoleAccount(roleName, account, issues, redactions, defaults = {}) {
  const username = await resolveRefOrLiteral(account?.usernameRef ?? account?.username)
  const password = await resolveRefOrLiteral(account?.passwordRef ?? account?.password ?? defaults.passwordRef)
  const userId = await resolveRefOrLiteral(account?.userIdRef ?? account?.userId)
  if (username.status !== 'resolved') issues.push(`${roleName}.username:${username.status}`)
  if (password.status !== 'resolved') issues.push(`${roleName}.password:${password.status}`)
  if (username.status === 'resolved') redactions.push(username.value)
  if (password.status === 'resolved') redactions.push(password.value)
  return {
    userIdRef: userId.status === 'resolved' ? userId.value : account?.userIdRef ?? account?.userId ?? null,
    username,
    password,
    userId,
  }
}

async function resolveExecutionRefs({ handoff, tier }) {
  const envTarget = handoff.environmentTargets?.[tier] ?? {}
  const scenarioTier = scenarioRefs(handoff, tier)
  const actorRefs = scenarioTier.actorRefs ?? {}
  const targetRefs = scenarioTier.targetRefs ?? {}
  const credentials = envTarget.credentialRefs ?? {}
  const refs = {
    apiBase: tier === 'staging' ? envTarget.apiBaseUrlRef : envTarget.apiBaseUrlRef || envTarget.baseUrlRef,
    clientBase: tier === 'staging' ? envTarget.clientBaseUrlRef : envTarget.clientBaseUrlRef || envTarget.baseUrlRef,
    companyId: targetRefs.companyIdRef,
    projectId: targetRefs.projectIdRef,
    secondCompanyId: targetRefs.secondCompanyRef,
    secondProjectId: targetRefs.secondProjectRef,
  }
  const resolved = {}
  const issues = []
  const redactions = []
  for (const [key, ref] of Object.entries(refs)) {
    const result = await resolveEnvRef(ref)
    resolved[key] = result
    if (result.status !== 'resolved') issues.push(`${key}:${result.status}`)
  }
  const roleMatrix = await resolveJsonRef(actorRefs.roleMatrixAccountRefsRef)
  resolved.roleMatrixAccountRefs = {
    status: roleMatrix.status,
    ref: roleMatrix.ref,
    path: roleMatrix.path ?? null,
    valueWrittenToReport: false,
  }
  if (roleMatrix.status !== 'resolved') {
    issues.push(`roleMatrixAccountRefs:${roleMatrix.status}`)
  } else {
    const matrix = roleMatrix.value ?? {}
    const projectAdminAccount = matrix.project_admin ?? matrix.projectAdmin ?? matrix.owner ?? matrix.company_admin ?? matrix.companyAdmin
    resolved.accounts = {
      project_admin: await resolveRoleAccount('project_admin', projectAdminAccount, issues, redactions, {
        passwordRef: credentials.testUserPasswordRef,
      }),
      editor: await resolveRoleAccount('editor', matrix.editor, issues, redactions, {
        passwordRef: credentials.testUserPasswordRef,
      }),
      outsider: await resolveRoleAccount('outsider', matrix.outsider, issues, redactions, {
        passwordRef: credentials.testUserPasswordRef,
      }),
    }
  }
  return { resolved, issues, redactions }
}

function publicResolvedRefs(resolved) {
  const output = {}
  for (const [key, value] of Object.entries(resolved)) {
    if (key === 'accounts') {
      output.accounts = Object.fromEntries(Object.entries(value).map(([role, account]) => [
        role,
        {
          userIdRef: account.userIdRef,
          username: {
            status: account.username.status,
            ref: account.username.ref,
            path: account.username.path ?? null,
            key: account.username.key ?? null,
            literal: account.username.literal === true,
            valueWrittenToReport: false,
          },
          password: {
            status: account.password.status,
            ref: account.password.ref,
            path: account.password.path ?? null,
            key: account.password.key ?? null,
            literal: account.password.literal === true,
            valueWrittenToReport: false,
          },
          userId: {
            status: account.userId.status,
            ref: account.userId.ref,
            path: account.userId.path ?? null,
            key: account.userId.key ?? null,
            literal: account.userId.literal === true,
            valueWrittenToReport: false,
          },
        },
      ]))
    } else if (value && typeof value === 'object') {
      output[key] = {
        status: value.status,
        ref: value.ref,
        path: value.path ?? null,
        key: value.key ?? null,
        valueWrittenToReport: false,
      }
    }
  }
  return output
}

function expectedDenied(result) {
  return [401, 403, 404].includes(Number(result.status))
}

async function executeScenario({
  report,
  handoff,
  tier,
  resolvedRefs,
  artifactRoot,
  cleanupReadbackFile,
  auditEnvFile,
  foreignTargetProvisioner,
  now,
}) {
  const redactions = resolvedRefs.redactions
  const apiBase = resolvedRefs.resolved.apiBase.value
  const companyId = resolvedRefs.resolved.companyId.value
  const projectId = resolvedRefs.resolved.projectId.value
  let secondCompanyId = resolvedRefs.resolved.secondCompanyId.value
  let secondProjectId = resolvedRefs.resolved.secondProjectId.value
  const accounts = resolvedRefs.resolved.accounts
  const tokens = {}
  let disposableForeignTarget = null

  const provisionedForeignTarget = await maybeProvisionDisposableForeignTarget({
    secondCompanyId,
    secondProjectId,
    auditEnvFile,
    foreignTargetProvisioner,
    now,
  })
  if (provisionedForeignTarget) {
    report.checks.push({
      id: 'disposable-foreign-target',
      status: provisionedForeignTarget.status === 'pass' ? 'pass' : 'blocked',
      result: {
        status: provisionedForeignTarget.status,
        reason: provisionedForeignTarget.reason ?? null,
        source: provisionedForeignTarget.source
          ? {
              envFile: provisionedForeignTarget.source.envFileRel ?? provisionedForeignTarget.source.envFile ?? null,
              valueWrittenToReport: false,
            }
          : null,
      },
    })
    if (provisionedForeignTarget.status !== 'pass') {
      report.status = 'blocked_disposable_foreign_target_failed'
      report.blockers.push(provisionedForeignTarget.reason ?? 'disposable_foreign_target_failed')
      return report
    }
    disposableForeignTarget = provisionedForeignTarget
    secondCompanyId = provisionedForeignTarget.companyId
    secondProjectId = provisionedForeignTarget.projectId
  }

  for (const [role, account] of Object.entries(accounts)) {
    const loginResult = await login({
      apiBase,
      username: account.username.value,
      password: account.password.value,
      redactions,
    })
    report.commandsExecuted += 1
    tokens[role] = loginResult.token
    report.checks.push({ id: `${role}-login`, status: loginResult.token ? 'pass' : 'blocked', result: loginResult.digest })
    if (!loginResult.token) {
      report.status = `blocked_${role}_login_failed`
      report.blockers.push(`${role}_login_failed`)
      return report
    }
  }

  const roleChecks = []
  for (const role of ['project_admin', 'editor']) {
    const result = await request({
      url: joinApiPath(apiBase, `/api/members/${projectId}/me`),
      headers: authHeaders(tokens[role], companyId),
      timeoutMs: 10000,
    })
    report.commandsExecuted += 1
    const data = unwrapData(result.body) ?? {}
    const expected = role === 'project_admin' ? ['owner', 'editor'] : [role]
    const pass = result.ok && expected.includes(String(data.permissionLevel ?? ''))
    const check = { role, expectedPermission: expected, actualPermission: data.permissionLevel ?? null, status: pass ? 'pass' : 'blocked' }
    roleChecks.push(check)
    report.checks.push({ id: `${role}-same-project-access`, status: check.status, result: responseDigest(result, redactions) })
  }

  const outsiderRead = await request({
    url: joinApiPath(apiBase, `/api/members/${projectId}/me`),
    headers: authHeaders(tokens.outsider, companyId),
    timeoutMs: 10000,
  })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'outsider-same-project-read-denied',
    status: expectedDenied(outsiderRead) ? 'pass' : 'blocked',
    result: responseDigest(outsiderRead, redactions),
  })

  const crossTenantChecks = []
  for (const role of ['project_admin', 'editor', 'outsider']) {
    const result = await request({
      url: joinApiPath(apiBase, `/api/members/${secondProjectId}/me`),
      headers: authHeaders(tokens[role], secondCompanyId),
      timeoutMs: 10000,
    })
    report.commandsExecuted += 1
    const check = { role, expectedDenied: true, statusCode: result.status, status: expectedDenied(result) ? 'pass' : 'blocked' }
    crossTenantChecks.push(check)
    report.checks.push({ id: `${role}-cross-tenant-denied`, status: check.status, result: responseDigest(result, redactions) })
  }

  const outsiderWrite = await request({
    url: joinApiPath(apiBase, `/api/members/${projectId}/${accounts.outsider.userIdRef ?? 'outsider-user-id-ref'}`),
    method: 'PATCH',
    headers: jsonHeaders(tokens.outsider, companyId),
    body: { permission_level: 'editor' },
    timeoutMs: 10000,
  })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'outsider-write-denied',
    status: expectedDenied(outsiderWrite) ? 'pass' : 'blocked',
    result: responseDigest(outsiderWrite, redactions),
  })

  const anonRead = await request({
    url: joinApiPath(apiBase, `/api/members/${projectId}/me`),
    headers: authHeaders(null, companyId),
    timeoutMs: 10000,
  })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'anon-read-denied',
    status: expectedDenied(anonRead) ? 'pass' : 'blocked',
    result: responseDigest(anonRead, redactions),
  })

  let disposableForeignTargetCleanup = null
  if (disposableForeignTarget) {
    disposableForeignTargetCleanup = await cleanupDisposableForeignTarget(disposableForeignTarget)
    report.checks.push({
      id: 'disposable-foreign-target-cleanup',
      status: disposableForeignTargetCleanup.status === 'pass' || disposableForeignTargetCleanup.status === 'passed' ? 'pass' : 'blocked',
      result: {
        status: disposableForeignTargetCleanup.status,
        projectDeleted: disposableForeignTargetCleanup.projectDeleted ?? null,
        companyDeleted: disposableForeignTargetCleanup.companyDeleted ?? null,
        reason: disposableForeignTargetCleanup.reason ?? null,
      },
    })
  }

  const roleMatrixEvidence = {
    schemaVersion: 'workbuddy/v14241-real-uat03-rls-role-matrix/v1',
    generatedAt: now.toISOString(),
    environment: tier,
    companyId,
    projectId,
    roleChecks,
    outsiderReadDenied: expectedDenied(outsiderRead),
    outsiderWriteDenied: expectedDenied(outsiderWrite),
    anonReadDenied: expectedDenied(anonRead),
    status: roleChecks.every((check) => check.status === 'pass') && expectedDenied(outsiderRead) && expectedDenied(outsiderWrite) && expectedDenied(anonRead) ? 'pass' : 'blocked',
  }
  const roleMatrixPath = join(artifactRoot, 'real-uat-03-rls-role-matrix.json')
  assertNoSecretLikeText(roleMatrixEvidence)
  await mkdir(dirname(roleMatrixPath), { recursive: true })
  await writeFile(roleMatrixPath, `${JSON.stringify(roleMatrixEvidence, null, 2)}\n`, 'utf8')

  const crossTenantEvidence = {
    schemaVersion: 'workbuddy/v14241-real-uat03-cross-tenant-negative-readback/v1',
    generatedAt: now.toISOString(),
    environment: tier,
    companyId,
    projectId,
    secondCompanyId,
    secondProjectId,
    crossTenantChecks,
    status: crossTenantChecks.every((check) => check.status === 'pass') ? 'pass' : 'blocked',
  }
  const crossTenantPath = join(artifactRoot, 'cross-tenant-negative-readback.json')
  assertNoSecretLikeText(crossTenantEvidence)
  await writeFile(crossTenantPath, `${JSON.stringify(crossTenantEvidence, null, 2)}\n`, 'utf8')

  const cleanupReadback = await readJsonIfPresent(cleanupReadbackFile, null)
  const cleanupStatus = cleanupReadback?.status === 'pass' || cleanupReadback?.status === 'passed'
  report.checks.push({
    id: 'cleanup-readback',
    status: cleanupStatus ? 'pass' : 'blocked',
    artifact: cleanupReadbackFile ? rel(resolve(cleanupReadbackFile)) : null,
    reason: cleanupStatus ? null : 'cleanup_readback_file_required',
  })
  if (!cleanupStatus) {
    report.status = 'blocked_cleanup_readback_missing'
    report.blockers.push('cleanup_readback_file_required')
  } else if (report.checks.every((check) => check.status === 'pass')) {
    report.status = 'passed'
    report.canCloseScenarioTier = true
    report.closesRealEnvironmentTier = true
  } else {
    report.status = 'blocked_execution_checks_failed'
    report.blockers.push('one_or_more_execution_checks_failed')
  }

  report.evidenceArtifacts = {
    roleMatrix: rel(roleMatrixPath),
    crossTenantNegativeReadback: rel(crossTenantPath),
    cleanup: cleanupStatus && cleanupReadbackFile ? rel(resolve(cleanupReadbackFile)) : null,
    disposableForeignTarget: disposableForeignTarget
      ? {
          status: disposableForeignTargetCleanup?.status ?? disposableForeignTarget.cleanup?.status ?? 'unknown',
          companyId: disposableForeignTarget.companyId,
          projectId: disposableForeignTarget.projectId,
          seededVia: disposableForeignTarget.evidence?.seededVia ?? 'custom_provisioner',
        }
      : null,
  }
  return report
}

export async function runUat03RlsRoleMatrix({
  tier = 'staging',
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  releaseDir = defaultReleaseDir,
  output = defaultOutput,
  artifactRoot = null,
  cleanupReadbackFile = null,
  auditEnvFile = null,
  foreignTargetProvisioner = provisionDisposableForeignTarget,
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
  report.resolvedRefs = publicResolvedRefs(resolvedRefs.resolved)
  if (resolvedRefs.issues.length > 0) {
    report.status = 'blocked_unresolvable_execution_refs'
    report.blockers.push(...resolvedRefs.issues)
    return writeReport(report, output)
  }

  const executed = await executeScenario({
    report,
    handoff,
    tier: normalizedTier,
    resolvedRefs,
    artifactRoot: resolvedArtifactRoot,
    cleanupReadbackFile,
    auditEnvFile,
    foreignTargetProvisioner,
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
  const cleanupReadbackFile = argValue('--cleanup-readback-file', '')
  const auditEnvFile = argValue('--audit-env-file', '')
  const flags = {
    '--include-uat': hasFlag('--include-uat'),
    '--include-staging': hasFlag('--include-staging'),
    '--include-solo-live': hasFlag('--include-solo-live'),
    '--include-live': hasFlag('--include-live'),
    '--confirm-real-handoff': hasFlag('--confirm-real-handoff'),
    '--allow-write': hasFlag('--allow-write'),
  }
  const report = await runUat03RlsRoleMatrix({
    tier,
    handoffFile,
    matrixFile,
    releaseDir,
    output,
    artifactRoot,
    cleanupReadbackFile: cleanupReadbackFile ? resolve(cleanupReadbackFile) : null,
    auditEnvFile: auditEnvFile ? resolve(auditEnvFile) : null,
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
