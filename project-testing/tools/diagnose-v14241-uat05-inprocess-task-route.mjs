#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const defaultDbEnvFile = 'deploy/env/staging.env'
const defaultRefsEnvFile = '.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env'
const defaultTraceFile = 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-evidence/staging/operator-evidence/real-uat-05-gantt-trace.json'
const defaultOutput = 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-uat05-inprocess-task-route-diagnostic.json'

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
  process.env.NODE_ENV = 'test'
  process.env.LOG_PERSIST = 'false'
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn'
  process.env.SKIP_SCHEDULER_BOOT = 'true'
  process.env.SKIP_DATABASE_VALIDATE = 'true'
  process.env.SKIP_REFERENCE_DATA_BOOTSTRAP = 'true'
  process.env.SKIP_READ_MODEL_WARMUP = 'true'
  process.env.DISABLE_PERMISSION_SYSTEM = 'false'
  process.env.AUTH_ALLOW_DEV_FALLBACK_USER = 'false'
  process.env.AUTH_ALLOW_TEST_FALLBACK_USER = 'false'
}

function rel(path) {
  const abs = resolve(path)
  const relativePath = relative(process.cwd(), abs)
  return relativePath.startsWith('..') ? abs.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

function joinApiPath(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
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
    detailsType: data.error?.details ? typeof data.error.details : undefined,
  }
}

function summarizeIdentifier(value) {
  const text = String(value ?? '').trim()
  if (!text) return { present: false }
  return {
    present: true,
    length: text.length,
    uuidLike: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text),
    prefix: text.slice(0, 8),
    suffix: text.slice(-4),
  }
}

function installPgTaskUpdateProbe() {
  const captured = []
  const originalQuery = pg.Client?.prototype?.query
  if (typeof originalQuery !== 'function') {
    return { captured, restore() {} }
  }

  pg.Client.prototype.query = function patchedQuery(queryConfig, values, callback) {
    const text = typeof queryConfig === 'string' ? queryConfig : String(queryConfig?.text ?? '')
    const params = Array.isArray(values)
      ? values
      : Array.isArray(queryConfig?.values)
        ? queryConfig.values
        : []
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (/^UPDATE\s+tasks\s+SET\s+/i.test(normalized)) {
      const updatedByMatch = normalized.match(/\bupdated_by\s*=\s*\$(\d+)/i)
      const updatedByIndex = updatedByMatch ? Number(updatedByMatch[1]) - 1 : -1
      captured.push({
        statementPreview: normalized.slice(0, 500),
        paramCount: params.length,
        updatedByParamIndex: updatedByIndex >= 0 ? updatedByIndex : null,
        updatedByParam: updatedByIndex >= 0 ? params[updatedByIndex] : null,
      })
    }
    return originalQuery.call(this, queryConfig, values, callback)
  }

  return {
    captured,
    restore() {
      pg.Client.prototype.query = originalQuery
    },
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

async function readJson(path) {
  return JSON.parse((await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''))
}

function safeLogEntry(entry) {
  const context = entry?.context && typeof entry.context === 'object' ? entry.context : {}
  const error = context.error && typeof context.error === 'object' ? context.error : null
  return {
    level: entry?.level ?? null,
    message: entry?.message ?? null,
    path: context.path ?? null,
    method: context.method ?? null,
    errorMessage: context.errorMessage ?? error?.message ?? context.error ?? null,
    errorCode: error?.code ?? context.code ?? null,
    errorConstraint: error?.constraint ?? context.constraint ?? null,
    errorTable: error?.table ?? context.table ?? null,
    errorDetail: error?.detail ?? context.detail ?? null,
    stackPreview: typeof context.stack === 'string'
      ? context.stack.slice(0, 1200)
      : typeof error?.stack === 'string'
        ? error.stack.slice(0, 1200)
        : null,
  }
}

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password\s*[=:]|service[_-]?role|StrongPass/i.test(text)) {
    throw new Error('refusing_to_write_inprocess_route_diagnostic_with_secret_like_text')
  }
}

async function writeJson(path, payload) {
  assertNoSecretLikeText(payload)
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(resolve(path), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function listen(app) {
  return new Promise((resolveListen, rejectListen) => {
    const server = app.listen(0, '127.0.0.1')
    server.once('error', rejectListen)
    server.once('listening', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        rejectListen(new Error('inprocess server did not expose a TCP address'))
        return
      }
      resolveListen({ server, baseUrl: `http://127.0.0.1:${address.port}` })
    })
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
    .select('id, project_id, title, version')
    .eq('id', taskId)
    .maybeSingle()
  if (beforeTaskError) throw beforeTaskError
  if (!beforeTask?.id) throw new Error('diagnostic task not found')

  const [{ default: app }, { logger }, { closeDatabasePool }] = await Promise.all([
    import('../../server/src/index.ts'),
    import('../../server/src/middleware/logger.ts'),
    import('../../server/src/database.ts'),
  ])

  const pgProbe = installPgTaskUpdateProbe()
  const { server, baseUrl } = await listen(app)
  const originalTitle = String(beforeTask.title ?? '')
  const diagnosticTitle = `${originalTitle} [uat05-inprocess-diagnostic-${Date.now()}]`
  let loginResult
  let token = ''
  let loginUserId = ''
  let updateResult
  let afterRouteTask
  let restoreResult = null
  try {
    const loginResponse = await fetch(joinApiPath(baseUrl, '/api/auth/login'), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const loginBody = await loginResponse.json().catch(() => null)
    token = String(loginBody?.data?.token ?? '')
    loginUserId = String(loginBody?.data?.user?.id ?? '').trim()
    loginResult = {
      ok: loginResponse.ok,
      status: loginResponse.status,
      bodySummary: summarizeBody(loginBody),
    }
    if (!token) throw new Error('inprocess login did not return a token')

    updateResult = await request({
      url: joinApiPath(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`),
      method: 'PUT',
      token,
      companyId,
      body: {
        title: diagnosticTitle,
        version: Number(beforeTask.version),
      },
      timeoutMs: 30000,
    })
    const { data } = await supabase
      .from('tasks')
      .select('id, title, version')
      .eq('id', taskId)
      .maybeSingle()
    afterRouteTask = data
    if (String(afterRouteTask?.title ?? '') === diagnosticTitle) {
      restoreResult = await request({
        url: joinApiPath(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`),
        method: 'PUT',
        token,
        companyId,
        body: {
          title: originalTitle,
          version: Number(afterRouteTask?.version),
        },
        timeoutMs: 30000,
      })
    }
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose))
    await closeDatabasePool().catch(() => undefined)
    pgProbe.restore()
  }

  const { data: finalTask } = await supabase
    .from('tasks')
    .select('id, title, version')
    .eq('id', taskId)
    .maybeSingle()
  let directRestore = null
  if (String(finalTask?.title ?? '').includes('[uat05-inprocess-diagnostic-')) {
    const { error } = await supabase
      .from('tasks')
      .update({ title: originalTitle, updated_at: new Date().toISOString() })
      .eq('id', taskId)
    directRestore = { attempted: true, succeeded: !error, errorMessage: error?.message ?? null, errorCode: error?.code ?? null }
  }

  const probedUpdates = []
  for (const entry of pgProbe.captured) {
    const updatedBy = String(entry.updatedByParam ?? '').trim()
    const { data: matchingUser } = updatedBy
      ? await supabase
        .from('users')
        .select('id')
        .eq('id', updatedBy)
        .maybeSingle()
      : { data: null }
    probedUpdates.push({
      statementPreview: entry.statementPreview,
      paramCount: entry.paramCount,
      updatedByParamIndex: entry.updatedByParamIndex,
      updatedByParamSummary: summarizeIdentifier(updatedBy),
      updatedByParamEqualsLoginUser: Boolean(updatedBy && loginUserId && updatedBy === loginUserId),
      updatedByParamExistsInPublicUsers: Boolean(matchingUser?.id),
    })
  }

  const logs = logger.getLogs()
  const report = {
    schemaVersion: 'workbuddy/v14241-uat05-inprocess-task-route-diagnostic/v1',
    generatedAt: new Date().toISOString(),
    status: updateResult?.ok ? 'inprocess_route_update_succeeded' : 'inprocess_route_update_failed',
    environment: 'controlled-staging-inprocess',
    taskId,
    projectId: beforeTask.project_id,
    actorRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_TEST_USER_EMAIL_REF',
    login: loginResult,
    auth: {
      loginUserIdSummary: summarizeIdentifier(loginUserId),
    },
    update: updateResult,
    routeMutatedTitleDespiteError: String(afterRouteTask?.title ?? '') === diagnosticTitle,
    restore: restoreResult,
    sqlProbe: {
      capturedTaskUpdateCount: probedUpdates.length,
      updates: probedUpdates,
    },
    errors: logs.filter((entry) => entry.level === 'error').slice(-8).map(safeLogEntry),
    warnings: logs.filter((entry) => entry.level === 'warn').slice(-8).map(safeLogEntry),
    before: {
      version: beforeTask.version ?? null,
      titleLength: originalTitle.length,
    },
    after: {
      version: finalTask?.version ?? null,
      titleRestoredOrClean: !String(finalTask?.title ?? '').includes('[uat05-inprocess-diagnostic-'),
      directRestore,
    },
    mutationBoundary: 'Controlled staging in-process route diagnostic against one UAT05 fixture task. It starts the Express app on an ephemeral localhost port, logs in through the route, attempts one title edit, captures in-memory error logs, and restores the title if needed.',
  }

  await writeJson(output, report)
  console.log(JSON.stringify({
    status: report.status,
    update: report.update,
    errorCount: report.errors.length,
    lastError: report.errors.at(-1) ?? null,
    output: rel(output),
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
