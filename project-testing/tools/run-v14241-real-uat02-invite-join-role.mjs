#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateHandoffReadiness } from './build-v14241-real-env-handoff-pack.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.candidate.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultOutput = join(defaultReleaseDir, 'v14241-real-uat02-invite-join-role.execution.json')
const defaultAuditEnvFile = join(repoRoot, 'server', '.env')
const scenarioId = 'REAL-UAT-02'

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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? '').trim())
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
    id: data.id ?? data.projectId ?? null,
    accepted: data.accepted ?? null,
    created: data.created ?? null,
    permissionLevel: data.permissionLevel ?? data.permission_level ?? null,
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

function jsonHeaders(token, companyId = null) {
  return {
    ...authHeaders(token, companyId),
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

async function resolveExistingInvitedMember({ client, requestedUserId, requestedUsername, companyId, projectId }) {
  if (!client) return { status: 'service_client_unavailable' }

  let user = null
  if (isUuid(requestedUserId)) {
    const result = await client
      .from('users')
      .select('id, username')
      .eq('id', requestedUserId)
      .maybeSingle()
    if (result.error) return { status: 'user_lookup_failed', error: result.error.message }
    user = result.data ?? null
  }

  if (!user && requestedUsername) {
    const result = await client
      .from('users')
      .select('id, username')
      .eq('username', requestedUsername)
      .maybeSingle()
    if (result.error) return { status: 'user_lookup_failed', error: result.error.message }
    user = result.data ?? null
  }

  if (!user) return { status: 'user_not_found' }

  const companyMembership = await client
    .from('company_members')
    .select('role, status')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (companyMembership.error) return { status: 'company_membership_lookup_failed', user, error: companyMembership.error.message }

  const projectMembership = await client
    .from('project_members')
    .select('permission_level, is_active')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (projectMembership.error) return { status: 'project_membership_lookup_failed', user, error: projectMembership.error.message }

  const activeCompanyMember = companyMembership.data?.status === 'active'
  const activeProjectMember = projectMembership.data?.is_active === true
  if (!activeCompanyMember) {
    return { status: 'not_active_company_member', user, companyMembership: companyMembership.data ?? null, projectMembership: projectMembership.data ?? null }
  }
  if (activeProjectMember) {
    return { status: 'already_project_member', user, companyMembership: companyMembership.data ?? null, projectMembership: projectMembership.data ?? null }
  }

  return {
    status: 'usable_existing_member',
    userId: user.id,
    username: user.username ?? requestedUsername,
    companyMembership: companyMembership.data,
    projectMembership: projectMembership.data ?? null,
  }
}

async function registerDisposableUser({ apiBase, now, redactions }) {
  const stamp = now.toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 8)
  const username = `uat02_invited_${stamp}_${suffix}`
  const password = `Uat02_${stamp}_${suffix}_Aa1`
  const result = await request({
    url: joinApiPath(apiBase, '/api/auth/register'),
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: {
      username,
      password,
      display_name: `UAT02 invited ${stamp}`,
      email: `${username}@example.invalid`,
    },
    timeoutMs: 15000,
  })
  const userId = result.body?.data?.user?.id
  return {
    status: result.ok && userId ? 'pass' : 'blocked',
    username,
    password,
    userId,
    result: responseDigest(result, [...redactions, password]),
  }
}

async function ensureCompanyMembership({ client, companyId, userId, now }) {
  if (!client) return { status: 'blocked', reason: 'service_client_unavailable' }
  const result = await client
    .from('company_members')
    .upsert({
      company_id: companyId,
      user_id: userId,
      role: 'regular',
      status: 'active',
      updated_at: now.toISOString(),
    }, { onConflict: 'company_id,user_id' })
    .select('user_id, role, status')
    .maybeSingle()

  if (result.error) return { status: 'blocked', reason: result.error.message }
  return {
    status: result.data?.user_id === userId && result.data?.status === 'active' ? 'pass' : 'blocked',
    role: result.data?.role ?? null,
  }
}

async function selectInvitedMember({ report, apiBase, auditEnvFile, companyId, projectId, requestedUserId, requestedUsername, requestedPassword, redactions, now }) {
  const { client, source, queryError } = await createServiceClient(auditEnvFile)
  const existing = await resolveExistingInvitedMember({
    client,
    requestedUserId,
    requestedUsername,
    companyId,
    projectId,
  })

  report.checks.push({
    id: 'invited-member-candidate-preflight',
    status: existing.status === 'usable_existing_member' ? 'pass' : 'supporting',
    result: sanitize({
      status: existing.status,
      userIdPresent: Boolean(existing.userId ?? existing.user?.id),
      companyMembershipStatus: existing.companyMembership?.status ?? null,
      projectPermission: existing.projectMembership?.permission_level ?? null,
      projectActive: existing.projectMembership?.is_active ?? null,
      auditReadbackSource: source.report,
      queryError,
    }),
  })

  if (existing.status === 'usable_existing_member') {
    return {
      mode: 'handoff_existing_member',
      userId: existing.userId,
      username: requestedUsername,
      password: requestedPassword,
      cleanupDisposableUser: false,
      preflightStatus: existing.status,
    }
  }

  const register = await registerDisposableUser({ apiBase, now, redactions })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'disposable-invited-member-register',
    status: register.status,
    result: register.result,
  })
  if (register.status !== 'pass') {
    return {
      mode: 'blocked',
      status: 'blocked_disposable_invited_member_register_failed',
      blocker: 'disposable_invited_member_register_failed',
      preflightStatus: existing.status,
    }
  }

  const membership = await ensureCompanyMembership({
    client,
    companyId,
    userId: register.userId,
    now,
  })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'disposable-invited-member-company-membership',
    status: membership.status,
    result: sanitize({
      status: membership.status,
      role: membership.role ?? null,
      reason: membership.reason ?? null,
      auditReadbackSource: source.report,
    }),
  })
  if (membership.status !== 'pass') {
    return {
      mode: 'blocked',
      status: 'blocked_disposable_invited_member_company_membership_failed',
      blocker: 'disposable_invited_member_company_membership_failed',
      userId: register.userId,
      username: register.username,
      password: register.password,
      cleanupDisposableUser: true,
      preflightStatus: existing.status,
    }
  }

  report.createdRefs.disposableInvitedMember = {
    userId: register.userId,
    username: register.username,
    companyId,
    projectId,
    reason: `handoff_candidate_${existing.status}`,
  }

  return {
    mode: 'disposable_member',
    userId: register.userId,
    username: register.username,
    password: register.password,
    cleanupDisposableUser: true,
    preflightStatus: existing.status,
  }
}

async function writeAuditReadback({ auditReadbackFile, auditEnvFile, tier, paths, since, companyId, projectId, invitationId, invitedMemberUserId }) {
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
      .limit(80)
    if (result.error) queryError = result.error.message
    rows = result.data ?? []
  }
  const passedPaths = new Set(rows.filter((row) => Number(row.status_code) < 400).map((row) => row.path))
  const missingPaths = expectedPaths.filter((path) => !passedPaths.has(path))
  const doc = {
    schemaVersion: 'workbuddy/v14241-real-uat02-audit-readback/v1',
    generatedAt: new Date().toISOString(),
    environment: tier,
    scenarioId,
    companyId,
    projectId,
    invitationId,
    invitedMemberUserId,
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

async function cleanupDisposableInvitedMember({ auditEnvFile, companyId, projectId, invitedMemberUserId, invitationId, cleanupDisposableUser }) {
  if (!cleanupDisposableUser) {
    return {
      skipped: true,
      invitationDeleteCount: 0,
      projectMemberDeleteCount: 0,
      companyMemberDeleteCount: 0,
      userDeleteCount: 0,
      userStillPresent: null,
    }
  }

  const { client, source, queryError } = await createServiceClient(auditEnvFile)
  if (!client) {
    return {
      skipped: false,
      status: 'blocked',
      reason: queryError ?? 'service_client_unavailable',
      auditReadbackSource: source.report,
    }
  }

  const invitationDelete = await client
    .from('project_direct_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('project_id', projectId)
    .eq('company_id', companyId)
    .eq('recipient_user_id', invitedMemberUserId)
  const projectMemberDelete = await client
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', invitedMemberUserId)
  const companyMemberDelete = await client
    .from('company_members')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', invitedMemberUserId)
  const userDelete = await client
    .from('users')
    .delete()
    .eq('id', invitedMemberUserId)
  const userReadback = await client
    .from('users')
    .select('id')
    .eq('id', invitedMemberUserId)
    .maybeSingle()

  const errors = [
    invitationDelete.error?.message,
    projectMemberDelete.error?.message,
    companyMemberDelete.error?.message,
    userDelete.error?.message,
    userReadback.error?.message,
  ].filter(Boolean)

  return {
    skipped: false,
    status: errors.length === 0 && !userReadback.data ? 'pass' : 'blocked',
    errors,
    invitationDeleteCount: invitationDelete.count ?? null,
    projectMemberDeleteCount: projectMemberDelete.count ?? null,
    companyMemberDeleteCount: companyMemberDelete.count ?? null,
    userDeleteCount: userDelete.count ?? null,
    userStillPresent: Boolean(userReadback.data),
    auditReadbackSource: source.report,
  }
}

async function writeCleanupReadback({ cleanupReadbackFile, apiBase, token, auditEnvFile, companyId, projectId, invitedMemberUserId, invitationId, tier, redactions, cleanupDisposableUser }) {
  if (!cleanupReadbackFile) return null
  const remove = await request({
    url: joinApiPath(apiBase, `/api/members/${projectId}/${invitedMemberUserId}`),
    method: 'DELETE',
    headers: authHeaders(token, companyId),
    timeoutMs: 15000,
  })
  const memberListAfterCleanup = await request({
    url: joinApiPath(apiBase, `/api/members/${projectId}`),
    headers: authHeaders(token, companyId),
    timeoutMs: 15000,
  })
  const activeMemberAfterCleanup = findMemberByUserId(memberListAfterCleanup.body, invitedMemberUserId)
  const disposableCleanup = await cleanupDisposableInvitedMember({
    auditEnvFile,
    companyId,
    projectId,
    invitedMemberUserId,
    invitationId,
    cleanupDisposableUser,
  })
  const cleanupOk = (remove.ok || remove.status === 404)
    && memberListAfterCleanup.ok
    && !activeMemberAfterCleanup
    && (disposableCleanup.skipped || disposableCleanup.status === 'pass')
  const doc = {
    schemaVersion: 'workbuddy/v14241-real-uat02-cleanup-readback/v1',
    generatedAt: new Date().toISOString(),
    environment: tier,
    scenarioId,
    companyId,
    projectId,
    invitationId,
    invitedMemberUserId,
    status: cleanupOk ? 'pass' : 'blocked',
    removalStatusCode: remove.status,
    memberListStatusCode: memberListAfterCleanup.status,
    activeMemberAfterCleanup: Boolean(activeMemberAfterCleanup),
    disposableCleanup,
    removalResult: responseDigest(remove, redactions),
    memberListResult: responseDigest(memberListAfterCleanup, redactions),
    valueWrittenToReport: false,
  }
  assertNoSecretLikeText(doc)
  await mkdir(dirname(resolve(cleanupReadbackFile)), { recursive: true })
  await writeFile(resolve(cleanupReadbackFile), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
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

function scenarioRefs(handoff, tier) {
  return handoff.scenarios?.[scenarioId]?.tiers?.[tier] ?? {}
}

async function resolveExecutionRefs({ handoff, tier }) {
  const envTarget = handoff.environmentTargets?.[tier] ?? {}
  const scenarioTier = scenarioRefs(handoff, tier)
  const credentials = envTarget.credentialRefs ?? {}
  const actorRefs = scenarioTier.actorRefs ?? {}
  const targetRefs = scenarioTier.targetRefs ?? {}
  const refs = {
    apiBase: tier === 'staging' ? envTarget.apiBaseUrlRef : envTarget.apiBaseUrlRef || envTarget.baseUrlRef,
    clientBase: tier === 'staging' ? envTarget.clientBaseUrlRef : envTarget.clientBaseUrlRef || envTarget.baseUrlRef,
    companyId: targetRefs.companyIdRef,
    projectId: targetRefs.projectIdRef,
    invitedMemberUserId: actorRefs.invitedMemberRef,
    inviterUsername: credentials.testUserEmailRef || envTarget.roleAccountRefs?.project_admin || envTarget.roleAccountRefs?.company_admin || actorRefs.inviterRef,
    inviterPassword: credentials.testUserPasswordRef,
    invitedMemberUsername: credentials.invitedMemberEmailRef || actorRefs.invitedMemberEmailRef || actorRefs.invitedMemberAccountRef,
    invitedMemberPassword: credentials.invitedMemberPasswordRef || actorRefs.invitedMemberPasswordRef,
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
    schemaVersion: 'workbuddy/v14241-real-uat02-invite-join-role-execution/v1',
    generatedAt: now.toISOString(),
    scenarioId,
    tier,
    status: 'blocked',
    handoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    output: rel(resolve(output)),
    artifactRoot: rel(resolve(artifactRoot)),
    mutationBoundary: 'Creates and accepts a disposable project invitation only after tier handoff is ready and --include-<tier> --confirm-real-handoff --allow-write are supplied.',
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
    throw new Error('refusing_to_write_real_uat02_report_with_secret_like_text')
  }
}

async function writeReport(report, output) {
  assertNoSecretLikeText(report)
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

function memberList(body) {
  if (Array.isArray(body?.members)) return body.members
  const data = unwrapData(body)
  return Array.isArray(data) ? data : []
}

function findMemberByUserId(body, userId) {
  return memberList(body).find((member) => String(member.userId ?? member.user_id ?? '') === String(userId))
}

function checkPassesForCloseout(check) {
  return check.status === 'pass' || check.status === 'supporting'
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

async function captureBrowserEvidence({ clientBase, apiBase, token, companyId, projectId, screenshotPath }) {
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
    await page.addInitScript(({ tokenValue, companyValue, projectValue }) => {
      window.localStorage.setItem('auth_token', tokenValue)
      window.localStorage.setItem('access_token', tokenValue)
      window.localStorage.setItem('current_company_id', companyValue)
      window.localStorage.setItem('current_project_id', projectValue)
      window.localStorage.setItem('onboarding_workspace_completed', 'true')
      window.localStorage.setItem('onboarding_project_completed', 'true')
    }, { tokenValue: token, companyValue: companyId, projectValue: projectId })
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message))
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        diagnostics.apiFailures.push({ url: response.url(), status: response.status() })
      }
    })
    await page.goto(`${clientBase.replace(/\/+$/, '')}/#/projects/${projectId}/dashboard`, { waitUntil: 'domcontentloaded' })
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

async function executeScenario({ report, handoff, tier, resolvedRefs, artifactRoot, auditReadbackFile, auditEnvFile, cleanupReadbackFile, now }) {
  const redactions = [
    resolvedRefs.inviterUsername.value,
    resolvedRefs.inviterPassword.value,
    resolvedRefs.invitedMemberUsername.value,
    resolvedRefs.invitedMemberPassword.value,
  ]
  const apiBase = resolvedRefs.apiBase.value
  const clientBase = resolvedRefs.clientBase.value
  const companyId = resolvedRefs.companyId.value
  const projectId = resolvedRefs.projectId.value

  const inviterLogin = await login({
    apiBase,
    username: resolvedRefs.inviterUsername.value,
    password: resolvedRefs.inviterPassword.value,
    redactions,
  })
  report.commandsExecuted += 1
  report.checks.push({ id: 'inviter-login', status: inviterLogin.token ? 'pass' : 'blocked', result: inviterLogin.digest })
  if (!inviterLogin.token) {
    report.status = 'blocked_inviter_login_failed'
    report.blockers.push('inviter_login_failed')
    return report
  }

  const selectedInvitedMember = await selectInvitedMember({
    report,
    apiBase,
    auditEnvFile,
    companyId,
    projectId,
    requestedUserId: resolvedRefs.invitedMemberUserId.value,
    requestedUsername: resolvedRefs.invitedMemberUsername.value,
    requestedPassword: resolvedRefs.invitedMemberPassword.value,
    redactions,
    now,
  })
  if (selectedInvitedMember.mode === 'blocked') {
    report.status = selectedInvitedMember.status
    report.blockers.push(selectedInvitedMember.blocker)
    return report
  }

  redactions.push(selectedInvitedMember.username, selectedInvitedMember.password)
  const invitedMemberUserId = selectedInvitedMember.userId

  const invitedLogin = await login({
    apiBase,
    username: selectedInvitedMember.username,
    password: selectedInvitedMember.password,
    redactions,
  })
  report.commandsExecuted += 1
  report.checks.push({ id: 'invited-member-login', status: invitedLogin.token ? 'pass' : 'blocked', result: invitedLogin.digest })
  if (!invitedLogin.token) {
    report.status = 'blocked_invited_member_login_failed'
    report.blockers.push('invited_member_login_failed')
    return report
  }

  const invitation = await request({
    url: joinApiPath(apiBase, '/api/workspace/project-direct-invitations'),
    method: 'POST',
    headers: jsonHeaders(inviterLogin.token, companyId),
    body: {
      projectId,
      recipientUserId: invitedMemberUserId,
      permissionLevel: 'editor',
    },
    timeoutMs: 15000,
  })
  report.commandsExecuted += 1
  const invitationId = unwrapData(invitation.body)?.id
  report.checks.push({
    id: 'project-direct-invitation-create',
    status: invitation.ok && invitationId ? 'pass' : 'blocked',
    result: responseDigest(invitation, redactions),
  })
  if (!invitationId) {
    report.status = 'blocked_invitation_create_failed'
    report.blockers.push('invitation_create_failed')
    return report
  }
  report.createdRefs.invitationId = invitationId

  const accept = await request({
    url: joinApiPath(apiBase, `/api/workspace/invitations/${invitationId}/accept`),
    method: 'POST',
    headers: jsonHeaders(invitedLogin.token, companyId),
    body: {},
    timeoutMs: 15000,
  })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'project-direct-invitation-accept',
    status: accept.ok && unwrapData(accept.body)?.accepted === true ? 'pass' : 'blocked',
    result: responseDigest(accept, redactions),
  })

  const memberListRead = await request({
    url: joinApiPath(apiBase, `/api/members/${projectId}`),
    headers: authHeaders(inviterLogin.token, companyId),
    timeoutMs: 15000,
  })
  report.commandsExecuted += 1
  const invitedMemberAfterJoin = findMemberByUserId(memberListRead.body, invitedMemberUserId)
  report.checks.push({
    id: 'member-list-read-after-join',
    status: memberListRead.ok && invitedMemberAfterJoin?.permissionLevel === 'editor' ? 'pass' : 'blocked',
    result: responseDigest(memberListRead, redactions),
  })

  const roleUpdate = await request({
    url: joinApiPath(apiBase, `/api/members/${projectId}/${invitedMemberUserId}`),
    method: 'PATCH',
    headers: jsonHeaders(inviterLogin.token, companyId),
    body: { permission_level: 'editor' },
    timeoutMs: 15000,
  })
  report.commandsExecuted += 1
  report.checks.push({
    id: 'member-role-update-to-editor',
    status: roleUpdate.ok ? 'pass' : 'blocked',
    result: responseDigest(roleUpdate, redactions),
  })

  const memberPermissionRead = await request({
    url: joinApiPath(apiBase, `/api/members/${projectId}/me`),
    headers: authHeaders(invitedLogin.token, companyId),
    timeoutMs: 15000,
  })
  report.commandsExecuted += 1
  const permissionData = unwrapData(memberPermissionRead.body) ?? {}
  report.checks.push({
    id: 'invited-member-permission-readback',
    status: memberPermissionRead.ok && permissionData.permissionLevel === 'editor' && permissionData.canEdit === true ? 'pass' : 'blocked',
    result: responseDigest(memberPermissionRead, redactions),
  })

  const screenshotPath = join(artifactRoot, 'screenshots', 'invite-join-role', 'member-project-dashboard.png')
  const browserEvidence = await captureBrowserEvidence({
    clientBase,
    apiBase,
    token: invitedLogin.token,
    companyId,
    projectId,
    screenshotPath,
  })
  report.commandsExecuted += 1
  report.checks.push({ id: 'browser-member-project-screenshot', ...browserEvidence })

  const roleReadback = {
    schemaVersion: 'workbuddy/v14241-real-uat02-member-role-readback/v1',
    generatedAt: now.toISOString(),
    environment: tier,
    companyId,
    projectId,
    invitedMemberUserId,
    invitationId,
    roleBeforeUpdate: invitedMemberAfterJoin?.permissionLevel ?? null,
    roleAfterUpdate: permissionData.permissionLevel ?? null,
    canEditAfterUpdate: permissionData.canEdit === true,
    source: 'api-readback',
    status: permissionData.permissionLevel === 'editor' && permissionData.canEdit === true ? 'pass' : 'blocked',
  }
  const roleReadbackPath = join(artifactRoot, 'member-role-readback.json')
  assertNoSecretLikeText(roleReadback)
  await mkdir(dirname(roleReadbackPath), { recursive: true })
  await writeFile(roleReadbackPath, `${JSON.stringify(roleReadback, null, 2)}\n`, 'utf8')
  report.checks.push({
    id: 'member-role-readback-artifact',
    status: roleReadback.status === 'pass' ? 'pass' : 'blocked',
    artifact: rel(roleReadbackPath),
  })

  await writeCleanupReadback({
    cleanupReadbackFile,
    apiBase,
    token: inviterLogin.token,
    auditEnvFile,
    companyId,
    projectId,
    invitedMemberUserId,
    invitationId,
    tier,
    redactions,
    cleanupDisposableUser: selectedInvitedMember.cleanupDisposableUser,
  })
  await new Promise((resolve) => setTimeout(resolve, 500))
  await writeAuditReadback({
    auditReadbackFile,
    auditEnvFile,
    tier,
    paths: [
      '/api/workspace/project-direct-invitations',
      `/api/workspace/invitations/${invitationId}/accept`,
      `/api/members/${projectId}/${invitedMemberUserId}`,
    ],
    since: report.generatedAt,
    companyId,
    projectId,
    invitationId,
    invitedMemberUserId,
  })

  const auditReadback = await readJsonIfPresent(auditReadbackFile, null)
  const auditStatus = auditReadback?.status === 'pass' || auditReadback?.status === 'passed'
  report.checks.push({
    id: 'audit-readback',
    status: auditStatus ? 'pass' : 'blocked',
    artifact: auditReadbackFile ? rel(resolve(auditReadbackFile)) : null,
    reason: auditStatus ? null : 'audit_readback_file_required',
  })

  const cleanupReadback = await readJsonIfPresent(cleanupReadbackFile, null)
  const cleanupStatus = cleanupReadback?.status === 'pass' || cleanupReadback?.status === 'passed'
  report.checks.push({
    id: 'cleanup-readback',
    status: cleanupStatus ? 'pass' : 'blocked',
    artifact: cleanupReadbackFile ? rel(resolve(cleanupReadbackFile)) : null,
    reason: cleanupStatus ? null : 'cleanup_readback_file_required',
  })

  if (!auditStatus) {
    report.status = 'blocked_audit_readback_missing'
    report.blockers.push('audit_readback_file_required')
  }
  if (!cleanupStatus) {
    report.status = report.status === 'blocked_audit_readback_missing' ? report.status : 'blocked_cleanup_readback_missing'
    report.blockers.push('cleanup_readback_file_required')
  }
  if (auditStatus && cleanupStatus && report.checks.every(checkPassesForCloseout)) {
    report.status = 'passed'
    report.canCloseScenarioTier = true
    report.closesRealEnvironmentTier = true
  } else if (auditStatus && cleanupStatus) {
    report.status = 'blocked_execution_checks_failed'
    report.blockers.push('one_or_more_execution_checks_failed')
  }

  const evidence = {
    schemaVersion: 'workbuddy/v14241-real-uat02-invite-join-role-evidence/v1',
    generatedAt: now.toISOString(),
    environment: tier,
    baseUrl: apiBase,
    actorRefs: scenarioRefs(handoff, tier).actorRefs ?? {},
    companyId,
    projectId,
    invitedMemberMode: selectedInvitedMember.mode,
    invitedMemberPreflightStatus: selectedInvitedMember.preflightStatus,
    startedAt: report.generatedAt,
    finishedAt: new Date().toISOString(),
    commandOrManualScript: 'node project-testing/tools/run-v14241-real-uat02-invite-join-role.mjs',
    screenshotsOrTrace: [rel(screenshotPath)],
    apiFailureSummary: browserEvidence.diagnostics.apiFailures,
    consoleErrorSummary: browserEvidence.diagnostics.consoleErrors,
    cleanupOrRollbackReadback: cleanupStatus
      ? { status: 'pass', artifact: rel(resolve(cleanupReadbackFile)) }
      : { status: 'operator_cleanup_required', cleanupRef: scenarioRefs(handoff, tier).cleanupRef ?? '', invitationId, invitedMemberUserId },
    checks: report.checks.map((check) => ({ id: check.id, status: check.status })),
  }
  const evidencePath = join(artifactRoot, 'real-uat-02-invite-join-role.json')
  assertNoSecretLikeText(evidence)
  await mkdir(dirname(evidencePath), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  report.evidenceArtifacts = {
    main: rel(evidencePath),
    memberRoleReadback: rel(roleReadbackPath),
    audit: auditStatus && auditReadbackFile ? rel(resolve(auditReadbackFile)) : null,
    cleanup: cleanupStatus && cleanupReadbackFile ? rel(resolve(cleanupReadbackFile)) : null,
    screenshot: rel(screenshotPath),
  }
  return report
}

export async function runUat02InviteJoinRole({
  tier = 'staging',
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  releaseDir = defaultReleaseDir,
  output = defaultOutput,
  artifactRoot = null,
  auditReadbackFile = null,
  auditEnvFile = null,
  cleanupReadbackFile = null,
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
    cleanupReadbackFile,
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
  const cleanupReadbackFile = argValue('--cleanup-readback-file', '')
  const flags = {
    '--include-uat': hasFlag('--include-uat'),
    '--include-staging': hasFlag('--include-staging'),
    '--include-solo-live': hasFlag('--include-solo-live'),
    '--include-live': hasFlag('--include-live'),
    '--confirm-real-handoff': hasFlag('--confirm-real-handoff'),
    '--allow-write': hasFlag('--allow-write'),
  }
  const report = await runUat02InviteJoinRole({
    tier,
    handoffFile,
    matrixFile,
    releaseDir,
    output,
    artifactRoot,
    auditReadbackFile: auditReadbackFile ? resolve(auditReadbackFile) : null,
    auditEnvFile: auditEnvFile ? resolve(auditEnvFile) : null,
    cleanupReadbackFile: cleanupReadbackFile ? resolve(cleanupReadbackFile) : null,
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
