#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

const defaultDbEnvFile = 'deploy/env/staging.env'
const defaultRefsEnvFile = '.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env'
const defaultTraceFile = 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-evidence/staging/operator-evidence/real-uat-05-gantt-trace.json'
const defaultOutput = 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-uat05-api-task-update-diagnostic.json'

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function parseEnv(text) {
  const env = {}
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const separator = line.indexOf('=')
    env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

function requireEnv(env, key) {
  const value = String(env[key] ?? '').trim()
  if (!value) throw new Error(`Missing required env key: ${key}`)
  return value
}

function installServerEnv(env) {
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = String(value)
  }
  process.env.SKIP_SCHEDULER_BOOT = 'true'
  process.env.SKIP_DATABASE_VALIDATE = 'true'
  process.env.SKIP_REFERENCE_DATA_BOOTSTRAP = 'true'
  process.env.SKIP_READ_MODEL_WARMUP = 'true'
  process.env.AUTH_ALLOW_DEV_FALLBACK_USER = 'false'
}

function rel(path) {
  const abs = resolve(path)
  const relativePath = relative(process.cwd(), abs)
  return relativePath.startsWith('..') ? abs.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

function joinApiPath(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
}

function decodeJwtPayload(token) {
  const payloadPart = String(token ?? '').split('.')[1]
  if (!payloadPart) return null
  const padded = `${payloadPart}${'='.repeat((4 - (payloadPart.length % 4)) % 4)}`
  try {
    return JSON.parse(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function summarizeBody(body) {
  const data = body && typeof body === 'object' && 'data' in body ? body.data : body
  if (Array.isArray(data)) return { itemCount: data.length }
  if (!data || typeof data !== 'object') return { type: typeof data }
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    id: data.id ?? data.projectId ?? null,
    status: data.status ?? null,
    errorCode: data.error?.code ?? data.code ?? null,
    errorMessage: data.error?.message ?? data.message ?? null,
  }
}

async function request({ url, method = 'GET', token, companyId, body, timeoutMs = 30000 }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(companyId ? { 'x-company-id': companyId } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
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
      bodySummary: summarizeBody(parsed),
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      bodySummary: { errorMessage: error instanceof Error ? error.message : String(error) },
    }
  } finally {
    clearTimeout(timer)
  }
}

function errorSummary(error) {
  return {
    name: error?.name ?? null,
    code: error?.code ?? null,
    statusCode: error?.statusCode ?? null,
    constraint: error?.constraint ?? null,
    table: error?.table ?? null,
    detail: error?.detail ?? null,
    message: error instanceof Error ? error.message : String(error),
    stackPreview: error instanceof Error && error.stack ? error.stack.slice(0, 1200) : null,
  }
}

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password\s*[=:]|service[_-]?role|StrongPass/i.test(text)) {
    throw new Error('refusing_to_write_api_task_update_diagnostic_with_secret_like_text')
  }
}

async function writeJson(path, payload) {
  assertNoSecretLikeText(payload)
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(resolve(path), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function readJson(path) {
  return JSON.parse((await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''))
}

async function login(apiBase, username, password) {
  const result = await request({
    url: joinApiPath(apiBase, '/api/auth/login'),
    method: 'POST',
    body: { username, password },
    timeoutMs: 30000,
  })
  const raw = await fetch(joinApiPath(apiBase, '/api/auth/login'), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await raw.json().catch(() => null)
  const token = body?.data?.token
  if (!token) throw new Error(`Login failed: ${JSON.stringify(result)}`)
  return { token, result }
}

async function getTask(apiBase, token, companyId, taskId) {
  return request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}`),
    token,
    companyId,
    timeoutMs: 15000,
  })
}

async function updateTaskTitle(apiBase, token, companyId, taskId, title, version) {
  return request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}`),
    method: 'PUT',
    token,
    companyId,
    body: {
      title,
      ...(Number.isFinite(Number(version)) ? { version: Number(version) } : {}),
    },
    timeoutMs: 20000,
  })
}

async function main() {
  const dbEnvFile = resolve(argValue('--db-env-file', defaultDbEnvFile))
  const refsEnvFile = resolve(argValue('--refs-env-file', defaultRefsEnvFile))
  const traceFile = resolve(argValue('--trace-file', defaultTraceFile))
  const output = resolve(argValue('--output', defaultOutput))
  const dbEnv = parseEnv(await readFile(dbEnvFile, 'utf8'))
  const refs = parseEnv(await readFile(refsEnvFile, 'utf8'))
  installServerEnv(dbEnv)

  const apiBase = requireEnv(refs, 'V14241_STAGING_API_BASE_URL')
  const companyId = requireEnv(refs, 'V14241_STAGING_COMPANY_ID')
  const username = requireEnv(refs, 'V14241_STAGING_TEST_USER_EMAIL_REF')
  const password = requireEnv(refs, 'V14241_STAGING_TEST_USER_PASSWORD_REF')
  const trace = await readJson(traceFile)
  const taskId = String(trace.targetTaskId ?? '').trim()
  if (!taskId) throw new Error('Trace file does not contain targetTaskId')

  const supabase = createClient(requireEnv(dbEnv, 'SUPABASE_URL'), requireEnv(dbEnv, 'SUPABASE_SERVICE_KEY'), {
    auth: { persistSession: false },
  })
  const { data: beforeTask, error: beforeTaskError } = await supabase
    .from('tasks')
    .select('id, project_id, title, version, updated_by')
    .eq('id', taskId)
    .maybeSingle()
  if (beforeTaskError) throw beforeTaskError
  if (!beforeTask?.id) throw new Error('diagnostic task not found')

  const loginResult = await login(apiBase, username, password)
  const tokenPayload = decodeJwtPayload(loginResult.token)
  const tokenUserId = String(tokenPayload?.userId ?? '').trim()
  const { data: userByToken } = tokenUserId
    ? await supabase.from('users').select('id, username, role, global_role').eq('id', tokenUserId).maybeSingle()
    : { data: null }
  const { data: userByUsername } = await supabase
    .from('users')
    .select('id, username, role, global_role')
    .eq('username', username)
    .maybeSingle()

  const originalTitle = String(beforeTask.title ?? '')
  const diagnosticTitle = `${originalTitle} [uat05-api-diagnostic-${Date.now()}]`
  const expectedVersion = Number.isFinite(Number(beforeTask.version)) ? Number(beforeTask.version) : undefined
  const apiUpdate = await updateTaskTitle(apiBase, loginResult.token, companyId, taskId, diagnosticTitle, expectedVersion)

  const { data: afterApiTask } = await supabase
    .from('tasks')
    .select('id, title, version, updated_by')
    .eq('id', taskId)
    .maybeSingle()
  const apiMutatedTitle = String(afterApiTask?.title ?? '') === diagnosticTitle

  let apiRestore = null
  if (apiMutatedTitle) {
    apiRestore = await updateTaskTitle(apiBase, loginResult.token, companyId, taskId, originalTitle, afterApiTask?.version)
  }

  const { updateTaskInMainChain } = await import('../../server/src/services/taskWriteChainService.ts')
  const { query, closeDatabasePool } = await import('../../server/src/database.ts')

  let serviceUpdate = null
  let serviceUpdateError = null
  let serviceRestore = null
  let serviceRestoreError = null
  const { data: beforeServiceTask } = await supabase
    .from('tasks')
    .select('id, title, version')
    .eq('id', taskId)
    .maybeSingle()
  const beforeServiceTitle = String(beforeServiceTask?.title ?? originalTitle)
  const serviceDiagnosticTitle = `${beforeServiceTitle} [uat05-service-diagnostic-${Date.now()}]`
  try {
    serviceUpdate = await updateTaskInMainChain(
      taskId,
      { title: serviceDiagnosticTitle, updated_by: tokenUserId || userByUsername?.id || null },
      Number.isFinite(Number(beforeServiceTask?.version)) ? Number(beforeServiceTask?.version) : undefined,
    )
  } catch (error) {
    serviceUpdateError = errorSummary(error)
  }
  if (serviceUpdate?.task?.id) {
    try {
      serviceRestore = await updateTaskInMainChain(
        taskId,
        { title: beforeServiceTitle, updated_by: tokenUserId || userByUsername?.id || null },
        Number(serviceUpdate.task.version ?? beforeServiceTask?.version),
      )
    } catch (error) {
      serviceRestoreError = errorSummary(error)
    }
  }

  const constraintRows = await query(
    `SELECT t.relname AS table_name, c.conname AS constraint_name, pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname IN ('tasks', 'change_logs', 'task_code_history', 'task_progress_snapshots', 'acceptance_plans')
        AND c.contype = 'f'
      ORDER BY t.relname, c.conname`,
  ).then((result) => result.rows).catch((error) => [{ error: errorSummary(error) }])

  await closeDatabasePool().catch(() => undefined)
  const { data: finalTask } = await supabase
    .from('tasks')
    .select('id, title, version, updated_by')
    .eq('id', taskId)
    .maybeSingle()
  const finalTitle = String(finalTask?.title ?? '')
  let finalDirectRestore = null
  if (finalTitle.includes('[uat05-api-diagnostic-') || finalTitle.includes('[uat05-service-diagnostic-')) {
    const { error } = await supabase
      .from('tasks')
      .update({ title: originalTitle, updated_at: new Date().toISOString() })
      .eq('id', taskId)
    finalDirectRestore = { attempted: true, succeeded: !error, error: error ? errorSummary(error) : null }
  }

  const report = {
    schemaVersion: 'workbuddy/v14241-uat05-api-task-update-diagnostic/v1',
    generatedAt: new Date().toISOString(),
    status: apiUpdate.ok
      ? 'api_update_succeeded'
      : serviceUpdate?.task?.id
        ? 'api_update_failed_but_service_update_succeeded'
        : 'api_and_service_update_failed',
    environment: 'controlled-staging-local',
    apiBaseRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_API_BASE_URL',
    taskId,
    projectId: beforeTask.project_id,
    actorRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_TEST_USER_EMAIL_REF',
    expectedVersion,
    auth: {
      login: loginResult.result,
      tokenPayloadUserIdPresent: Boolean(tokenUserId),
      tokenUserMatchesUsernameUser: Boolean(tokenUserId && userByUsername?.id && tokenUserId === userByUsername.id),
      userByTokenExists: Boolean(userByToken?.id),
      userByUsernameExists: Boolean(userByUsername?.id),
      tokenGlobalRole: tokenPayload?.globalRole ?? null,
    },
    apiUpdate: {
      result: apiUpdate,
      mutatedTitleDespiteError: apiMutatedTitle,
      restoreAttempted: Boolean(apiRestore),
      restoreResult: apiRestore,
    },
    serviceUpdate: {
      updateSucceeded: Boolean(serviceUpdate?.task?.id),
      updateError: serviceUpdateError,
      restoreAttempted: Boolean(serviceUpdate?.task?.id),
      restoreSucceeded: Boolean(serviceRestore?.task?.id),
      restoreError: serviceRestoreError,
    },
    constraints: constraintRows,
    before: {
      version: beforeTask.version ?? null,
      updatedByWasNull: beforeTask.updated_by == null,
      titleLength: originalTitle.length,
    },
    after: {
      version: finalTask?.version ?? null,
      titleRestoredOrClean: !String(finalTask?.title ?? '').includes('[uat05-'),
      updatedByPresent: Boolean(finalTask?.updated_by),
      finalDirectRestore,
    },
    mutationBoundary: 'Controlled staging diagnostic against one UAT05 fixture task. It logs in through the API, attempts one title edit, compares direct main-write-chain behavior with the same actor ref, restores the title when needed, and writes no raw secrets.',
  }
  await writeJson(output, report)
  console.log(JSON.stringify({
    status: report.status,
    apiUpdate: report.apiUpdate.result,
    auth: report.auth,
    serviceUpdateSucceeded: report.serviceUpdate.updateSucceeded,
    serviceUpdateError: report.serviceUpdate.updateError
      ? {
          code: report.serviceUpdate.updateError.code,
          constraint: report.serviceUpdate.updateError.constraint,
          table: report.serviceUpdate.updateError.table,
          message: report.serviceUpdate.updateError.message,
        }
      : null,
    output: rel(output),
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
