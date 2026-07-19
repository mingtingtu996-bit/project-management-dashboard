#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import { resolvePublicHttpsOrigin } from '../../scripts/public-origin.mjs'

const defaultEnvFile = '.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env'
const defaultDbEnvFile = 'deploy/env/staging.env'
const defaultTraceFile = 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-evidence/staging/operator-evidence/real-uat-05-gantt-trace.json'
const defaultOutput = 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-evidence/staging/operator-readbacks/real-uat-05-cleanup-readback.json'

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
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

function rel(path) {
  const abs = resolve(path)
  const relativePath = relative(process.cwd(), abs)
  return relativePath.startsWith('..') ? abs.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

function joinApiPath(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
}

function unwrapData(body) {
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

function dependencyPayloadFromRows(rows) {
  return (rows ?? []).map((row) => ({
    dependencyTaskId: String(row.dependency_task_id ?? row.dependencyTaskId ?? '').trim(),
    dependencyType: String(row.dependency_type ?? row.dependencyType ?? 'FS').trim() || 'FS',
    lagDays: Number(row.lag_days ?? row.lagDays ?? 0) || 0,
  })).filter((row) => row.dependencyTaskId)
}

function summarizeBody(body) {
  const data = unwrapData(body)
  if (Array.isArray(data)) return { itemCount: data.length }
  if (!data || typeof data !== 'object') return { type: typeof data }
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    id: data.id ?? data.projectId ?? null,
    status: data.status ?? null,
    titleHasUatMarker: typeof data.title === 'string' ? data.title.includes('[uat05-') : undefined,
  }
}

function responseDigest(result) {
  return {
    ok: result.ok,
    status: result.status,
    elapsedMs: result.elapsedMs,
    bodySummary: summarizeBody(result.body),
  }
}

async function request({ url, method = 'GET', token, companyId, origin, body, timeoutMs = 30000 }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(origin ? { origin } : {}),
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

async function login(apiBase, username, password, publicOrigin) {
  const result = await request({
    url: joinApiPath(apiBase, '/api/auth/login'),
    method: 'POST',
    origin: publicOrigin,
    body: { username, password },
    timeoutMs: 30000,
  })
  const token = result.body?.data?.token
  if (!token) {
    throw new Error(`Login failed: ${JSON.stringify(responseDigest(result))}`)
  }
  return token
}

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password\s*[=:]|service[_-]?role|StrongPass/i.test(text)) {
    throw new Error('refusing_to_write_uat05_cleanup_with_secret_like_text')
  }
}

async function writeJson(path, payload) {
  assertNoSecretLikeText(payload)
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(resolve(path), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function main() {
  const envFile = resolve(argValue('--env-file', defaultEnvFile))
  const dbEnvFile = resolve(argValue('--db-env-file', defaultDbEnvFile))
  const traceFile = resolve(argValue('--trace-file', defaultTraceFile))
  const output = resolve(argValue('--output', defaultOutput))
  const allowDbCleanup = hasFlag('--allow-db-cleanup')
  const env = parseEnv(await readFile(envFile, 'utf8'))
  const trace = JSON.parse((await readFile(traceFile, 'utf8')).replace(/^\uFEFF/, ''))

  const apiBase = requireEnv(env, 'V14241_STAGING_API_BASE_URL')
  const publicOrigin = resolvePublicHttpsOrigin({
    apiBaseUrl: apiBase,
    publicOrigin: argValue('--public-origin', process.env.PUBLIC_HTTPS_ORIGIN ?? ''),
  })
  const username = requireEnv(env, 'V14241_STAGING_TEST_USER_EMAIL_REF')
  const password = requireEnv(env, 'V14241_STAGING_TEST_USER_PASSWORD_REF')
  const companyId = requireEnv(env, 'V14241_STAGING_COMPANY_ID')
  const projectId = requireEnv(env, 'V14241_STAGING_PROJECT_ID')
  const largeProjectId = requireEnv(env, 'V14241_STAGING_REAL_UAT_05_TARGET_REFS_LARGE_PROJECT_REF')
  const taskId = String(trace.targetTaskId ?? '').trim()
  const predecessorTaskId = String(trace.predecessorTaskId ?? '').trim()
  if (!taskId || !predecessorTaskId) throw new Error('Trace file does not contain targetTaskId and predecessorTaskId')

  const token = await login(apiBase, username, password, publicOrigin)
  const beforeTask = await request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}`),
    token,
    companyId,
  })
  const beforeDependencies = await request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}/dependencies`),
    token,
    companyId,
  })
  const beforeRows = Array.isArray(unwrapData(beforeDependencies.body)) ? unwrapData(beforeDependencies.body) : []
  const nextDependencies = dependencyPayloadFromRows(beforeRows)
    .filter((row) => row.dependencyTaskId !== predecessorTaskId)
  const cleanupWrite = await request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}/dependencies`),
    method: 'PUT',
    token,
    companyId,
    body: { dependencies: nextDependencies },
    timeoutMs: 30000,
  })
  let afterTask = await request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}`),
    token,
    companyId,
  })
  let afterDependencies = await request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}/dependencies`),
    token,
    companyId,
  })
  let afterRows = Array.isArray(unwrapData(afterDependencies.body)) ? unwrapData(afterDependencies.body) : []
  let stillHasUatDependency = dependencyPayloadFromRows(afterRows)
    .some((row) => row.dependencyTaskId === predecessorTaskId)
  let dbCleanup = { attempted: false, status: 'not_attempted', updatedCount: 0, error: null }
  if (stillHasUatDependency && allowDbCleanup) {
    dbCleanup = { attempted: true, status: 'blocked', updatedCount: 0, error: null }
    const dbEnv = parseEnv(await readFile(dbEnvFile, 'utf8'))
    const supabaseUrl = requireEnv(dbEnv, 'SUPABASE_URL')
    const supabaseKey = requireEnv(dbEnv, 'SUPABASE_SERVICE_KEY')
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    const { data, error } = await supabase
      .from('task_dependencies')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('project_id', largeProjectId)
      .eq('task_id', taskId)
      .eq('dependency_task_id', predecessorTaskId)
      .eq('status', 'active')
      .eq('source_type', 'manual')
      .select('id')
    if (error) {
      dbCleanup.error = error.message
    } else {
      dbCleanup.status = 'applied'
      dbCleanup.updatedCount = data?.length ?? 0
    }
    afterTask = await request({
      url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}`),
      token,
      companyId,
    })
    afterDependencies = await request({
      url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}/dependencies`),
      token,
      companyId,
    })
    afterRows = Array.isArray(unwrapData(afterDependencies.body)) ? unwrapData(afterDependencies.body) : []
    stillHasUatDependency = dependencyPayloadFromRows(afterRows)
      .some((row) => row.dependencyTaskId === predecessorTaskId)
  }
  const titleHasUatMarker = String(unwrapData(afterTask.body)?.title ?? '').includes('[uat05-')
  const status = beforeTask.ok
    && beforeDependencies.ok
    && cleanupWrite.ok
    && afterTask.ok
    && afterDependencies.ok
    && !stillHasUatDependency
    && !titleHasUatMarker
    ? 'pass'
    : 'blocked'

  const doc = {
    schemaVersion: 'workbuddy/v14241-real-uat05-cleanup-readback/v1',
    generatedAt: new Date().toISOString(),
    status,
    environment: 'staging',
    projectId,
    largeProjectId,
    taskId,
    predecessorTaskId,
    traceFile: rel(traceFile),
    restoredTaskTitle: !titleHasUatMarker,
    restoredDependencies: !stillHasUatDependency,
    dependencyCountBefore: beforeRows.length,
    dependencyCountAfter: afterRows.length,
    dbCleanup,
    checks: {
      beforeTask: responseDigest(beforeTask),
      beforeDependencies: responseDigest(beforeDependencies),
      cleanupWrite: responseDigest(cleanupWrite),
      afterTask: responseDigest(afterTask),
      afterDependencies: responseDigest(afterDependencies),
    },
    mutationBoundary: allowDbCleanup
      ? 'Controlled staging cleanup-only run; attempted API cleanup first, then allowed DB cleanup only for the matching active manual dependency edge created by the UAT05 trace target/predecessor pair; no production writes.'
      : 'Controlled staging cleanup-only run; removed only the dependency edge created by the UAT05 trace target/predecessor pair and verified no UAT title marker remains.',
    commandOrManualScript: 'node project-testing/tools/cleanup-v14241-real-uat05-residue.mjs',
  }
  await writeJson(output, doc)

  console.log(JSON.stringify({
    status: doc.status,
    restoredTaskTitle: doc.restoredTaskTitle,
    restoredDependencies: doc.restoredDependencies,
    dependencyCountBefore: doc.dependencyCountBefore,
    dependencyCountAfter: doc.dependencyCountAfter,
    output: rel(output),
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
