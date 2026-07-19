#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolvePublicHttpsOrigin } from '../../scripts/public-origin.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultArtifactRoot = join(defaultReleaseDir, 'v14241-real-env-evidence', 'staging')
const defaultEnvFile = join(repoRoot, '.tmp', 'v14241-controlled-staging', 'v14241-controlled-staging.refs.env')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

function parseEnv(text) {
  const env = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    const value = line.slice(line.indexOf('=') + 1).trim()
    env[key] = value
  }
  return env
}

function requireEnv(env, key) {
  const value = String(env[key] ?? '').trim()
  if (!value) throw new Error(`Missing required env key: ${key}`)
  return value
}

function joinApiPath(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
}

function unwrapData(body) {
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

function percentile(values, p) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

function summarizeBody(body) {
  const data = unwrapData(body)
  if (Array.isArray(data)) return { itemCount: data.length }
  if (!data || typeof data !== 'object') return { type: typeof data }
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    id: data.id ?? data.projectId ?? null,
    status: data.status ?? null,
    errorCode: data.error?.code ?? data.code ?? null,
    errorMessage: data.error?.message ?? data.message ?? null,
    itemCount: Array.isArray(data.items) ? data.items.length : undefined,
    primaryChainLength: Array.isArray(data.primaryChain?.taskIds) ? data.primaryChain.taskIds.length : undefined,
    networkScheduleCount: Array.isArray(data.networkSchedule) ? data.networkSchedule.length : undefined,
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

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

async function writeJson(path, payload) {
  assertNoSecretLikeText(payload)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password\s*[=:]|service[_-]?role/i.test(text)) {
    throw new Error('refusing_to_write_uat05_evidence_with_secret_like_text')
  }
}

function taskTitle(task) {
  return String(task?.title ?? task?.name ?? task?.id ?? 'UAT05 task')
}

function pickCandidatePairs(tasks) {
  const candidates = tasks
    .filter((task) => task?.id && task?.project_id)
    .filter((task) => task.is_wbs_summary !== true)
    .slice(0, 40)
  const pairs = []
  for (let index = 1; index < candidates.length; index += 1) {
    pairs.push([candidates[index - 1], candidates[index]])
  }
  return pairs
}

function dependencyPayloadFromRows(rows) {
  return (rows ?? []).map((row) => ({
    dependencyTaskId: String(row.dependency_task_id ?? row.dependencyTaskId ?? '').trim(),
    dependencyType: String(row.dependency_type ?? row.dependencyType ?? 'FS').trim() || 'FS',
    lagDays: Number(row.lag_days ?? row.lagDays ?? 0) || 0,
  })).filter((row) => row.dependencyTaskId)
}

async function getTask(apiBase, token, companyId, taskId) {
  const result = await request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}`),
    token,
    companyId,
    timeoutMs: 10000,
  })
  return { result, task: unwrapData(result.body) }
}

async function getDependencies(apiBase, token, companyId, taskId) {
  const result = await request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}/dependencies`),
    token,
    companyId,
    timeoutMs: 10000,
  })
  return { result, dependencies: Array.isArray(unwrapData(result.body)) ? unwrapData(result.body) : [] }
}

async function putDependencies(apiBase, token, companyId, taskId, dependencies) {
  return request({
    url: joinApiPath(apiBase, `/api/tasks/${encodeURIComponent(taskId)}/dependencies`),
    method: 'PUT',
    token,
    companyId,
    body: { dependencies },
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
    timeoutMs: 15000,
  })
}

async function collectTraceEvidence({
  apiBase,
  token,
  companyId,
  projectId,
  largeProjectId,
  tasks,
  now,
}) {
  const attempts = []
  let cleanup = {
    status: 'blocked',
    restoredTaskTitle: false,
    restoredDependencies: false,
  }

  for (const [predecessor, successor] of pickCandidatePairs(tasks)) {
    const predecessorId = String(predecessor.id)
    const successorId = String(successor.id)
    let originalDetail = null
    let originalDependencies = []
    let editedTitle = ''

    try {
      const originalTaskRead = await getTask(apiBase, token, companyId, successorId)
      originalDetail = originalTaskRead.task
      if (!originalTaskRead.result.ok || !originalDetail) {
        attempts.push({ successorId, status: 'blocked_original_task_read_failed', result: responseDigest(originalTaskRead.result) })
        continue
      }

      const originalDependencyRead = await getDependencies(apiBase, token, companyId, successorId)
      originalDependencies = dependencyPayloadFromRows(originalDependencyRead.dependencies)
      if (!originalDependencyRead.result.ok) {
        attempts.push({ successorId, status: 'blocked_original_dependency_read_failed', result: responseDigest(originalDependencyRead.result) })
        continue
      }

      editedTitle = `${taskTitle(originalDetail)} [uat05-${now.getTime()}]`
      const taskEdit = await updateTaskTitle(
        apiBase,
        token,
        companyId,
        successorId,
        editedTitle,
        originalDetail.version,
      )
      const editedRead = await getTask(apiBase, token, companyId, successorId)
      const editedTask = editedRead.task
      const taskEditPassed = taskEdit.ok && editedRead.result.ok && String(editedTask?.title ?? '') === editedTitle

      const staleConflict = await updateTaskTitle(
        apiBase,
        token,
        companyId,
        successorId,
        `${editedTitle} stale`,
        originalDetail.version,
      )

      const dependencyWrite = await putDependencies(apiBase, token, companyId, successorId, [
        { dependencyTaskId: predecessorId, dependencyType: 'FS', lagDays: 0 },
      ])
      const dependencyRead = await getDependencies(apiBase, token, companyId, successorId)
      const dependencyRows = dependencyPayloadFromRows(dependencyRead.dependencies)
      const dependencyPassed = dependencyWrite.ok
        && dependencyRead.result.ok
        && dependencyRows.some((row) => row.dependencyTaskId === predecessorId)

      const cycleConflict = await putDependencies(apiBase, token, companyId, successorId, [
        { dependencyTaskId: successorId, dependencyType: 'FS', lagDays: 0 },
      ])
      const conflictPassed = staleConflict.status === 409 || cycleConflict.status === 400 || cycleConflict.status === 500

      const latestBeforeRestore = await getTask(apiBase, token, companyId, successorId)
      const restoreTitle = await updateTaskTitle(
        apiBase,
        token,
        companyId,
        successorId,
        taskTitle(originalDetail),
        latestBeforeRestore.task?.version,
      )
      const restoreDependencies = await putDependencies(apiBase, token, companyId, successorId, originalDependencies)
      const finalTask = await getTask(apiBase, token, companyId, successorId)
      const finalDependencies = await getDependencies(apiBase, token, companyId, successorId)
      const finalDependencyPayload = dependencyPayloadFromRows(finalDependencies.dependencies)
      const originalDependencySignature = JSON.stringify(originalDependencies)
      const finalDependencySignature = JSON.stringify(finalDependencyPayload)
      cleanup = {
        status: restoreTitle.ok
          && restoreDependencies.ok
          && finalTask.result.ok
          && taskTitle(finalTask.task) === taskTitle(originalDetail)
          && finalDependencies.result.ok
          && originalDependencySignature === finalDependencySignature
          ? 'pass'
          : 'blocked',
        restoredTaskTitle: restoreTitle.ok && finalTask.result.ok && taskTitle(finalTask.task) === taskTitle(originalDetail),
        restoredDependencies: restoreDependencies.ok && finalDependencies.result.ok && originalDependencySignature === finalDependencySignature,
        taskId: successorId,
        dependencyCount: finalDependencyPayload.length,
      }

      const traceStatus = taskEditPassed && dependencyPassed && conflictPassed && cleanup.status === 'pass'
        ? 'pass'
        : 'blocked'
      return {
        trace: {
          schemaVersion: 'workbuddy/v14241-real-uat05-gantt-trace/v1',
          generatedAt: now.toISOString(),
          status: traceStatus,
          environment: 'staging',
          projectId,
          largeProjectId,
          targetTaskId: successorId,
          predecessorTaskId: predecessorId,
          taskEditReadback: {
            status: taskEditPassed ? 'pass' : 'blocked',
            edit: responseDigest(taskEdit),
            readback: responseDigest(editedRead.result),
          },
          dependencyReadback: {
            status: dependencyPassed ? 'pass' : 'blocked',
            write: responseDigest(dependencyWrite),
            readback: responseDigest(dependencyRead.result),
            dependencyCount: dependencyRows.length,
          },
          conflictHandling: {
            status: conflictPassed ? 'expected_conflict' : 'blocked',
            staleTaskVersionUpdate: responseDigest(staleConflict),
            selfDependencyWrite: responseDigest(cycleConflict),
          },
          screenshotsOrTrace: [],
          cleanup,
          attempts,
          commandOrManualScript: 'node project-testing/tools/collect-v14241-real-uat05-operator-evidence.mjs',
        },
        cleanup,
      }
    } catch (error) {
      attempts.push({
        successorId,
        predecessorId,
        status: 'blocked_exception',
        error: error instanceof Error ? error.message : String(error),
      })
      if (originalDetail) {
        try {
          const latest = await getTask(apiBase, token, companyId, successorId)
          await updateTaskTitle(apiBase, token, companyId, successorId, taskTitle(originalDetail), latest.task?.version)
          await putDependencies(apiBase, token, companyId, successorId, originalDependencies)
        } catch {
          // The evidence below will keep cleanup blocked.
        }
      }
    }
  }

  return {
    trace: {
      schemaVersion: 'workbuddy/v14241-real-uat05-gantt-trace/v1',
      generatedAt: now.toISOString(),
      status: 'blocked',
      environment: 'staging',
      projectId,
      largeProjectId,
      taskEditReadback: { status: 'blocked' },
      dependencyReadback: { status: 'blocked' },
      conflictHandling: { status: 'blocked' },
      screenshotsOrTrace: [],
      cleanup,
      attempts,
      commandOrManualScript: 'node project-testing/tools/collect-v14241-real-uat05-operator-evidence.mjs',
    },
    cleanup,
  }
}

async function collectCriticalPathEvidence({ apiBase, token, companyId, projectId, largeProjectId, now }) {
  const result = await request({
    url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(largeProjectId)}/critical-path`),
    token,
    companyId,
    timeoutMs: 30000,
  })
  const data = unwrapData(result.body)
  const criticalPathTaskCount = Array.isArray(data?.displayTaskIds) ? data.displayTaskIds.length : 0
  const primaryChainLength = Array.isArray(data?.primaryChain?.taskIds) ? data.primaryChain.taskIds.length : 0
  const networkScheduleCount = Array.isArray(data?.networkSchedule) ? data.networkSchedule.length : 0
  const status = result.ok && (criticalPathTaskCount > 0 || primaryChainLength > 0 || networkScheduleCount > 0)
    ? 'pass'
    : 'blocked'
  return {
    schemaVersion: 'workbuddy/v14241-real-uat05-critical-path-readback/v1',
    generatedAt: now.toISOString(),
    status,
    environment: 'staging',
    projectId,
    largeProjectId,
    criticalPathUpdated: result.ok,
    criticalPathTaskCount,
    primaryChainLength,
    networkScheduleCount,
    projectDurationDays: data?.projectDurationDays ?? null,
    calculationStatus: data?.calculationStatus ?? null,
    apiReadback: responseDigest(result),
    commandOrManualScript: 'node project-testing/tools/collect-v14241-real-uat05-operator-evidence.mjs',
  }
}

async function collectPerformanceEvidence({
  apiBase,
  token,
  companyId,
  projectId,
  largeProjectId,
  thresholdMs,
  sampleCount,
  now,
}) {
  const taskListSamples = []
  const criticalPathSamples = []
  for (let index = 0; index < sampleCount; index += 1) {
    const taskList = await request({
      url: joinApiPath(apiBase, `/api/tasks?projectId=${encodeURIComponent(largeProjectId)}&surface=task_list&acceptance_impact=false`),
      token,
      companyId,
      timeoutMs: 30000,
    })
    taskListSamples.push(responseDigest(taskList))

    const criticalPath = await request({
      url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(largeProjectId)}/critical-path`),
      token,
      companyId,
      timeoutMs: 30000,
    })
    criticalPathSamples.push(responseDigest(criticalPath))
  }

  const taskListP95 = percentile(taskListSamples.map((item) => item.elapsedMs), 95)
  const criticalPathP95 = percentile(criticalPathSamples.map((item) => item.elapsedMs), 95)
  const p95Ms = Math.max(taskListP95 ?? 0, criticalPathP95 ?? 0)
  return {
    schemaVersion: 'workbuddy/v14241-real-uat05-performance-gantt-p95/v1',
    generatedAt: now.toISOString(),
    status: p95Ms <= thresholdMs && taskListSamples.every((item) => item.ok) && criticalPathSamples.every((item) => item.ok)
      ? 'pass'
      : 'fail',
    environment: 'staging',
    projectId,
    largeProjectId,
    p95Ms,
    thresholdMs,
    sampleCount,
    metrics: {
      p95Ms,
      taskListP95Ms: taskListP95,
      criticalPathP95Ms: criticalPathP95,
      taskListMaxMs: Math.max(...taskListSamples.map((item) => item.elapsedMs)),
      criticalPathMaxMs: Math.max(...criticalPathSamples.map((item) => item.elapsedMs)),
    },
    routeSamples: {
      taskList: taskListSamples,
      criticalPath: criticalPathSamples,
    },
    commandOrManualScript: 'node project-testing/tools/collect-v14241-real-uat05-operator-evidence.mjs',
  }
}

async function main() {
  const envFile = resolve(argValue('--env-file', defaultEnvFile))
  const artifactRoot = resolve(argValue('--artifact-root', defaultArtifactRoot))
  const now = new Date()
  const env = parseEnv(await readFile(envFile, 'utf8'))
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
  const thresholdMs = Number(env.V14241_STAGING_REAL_UAT_05_EXPECTED_EVIDENCE_REFS_PERFORMANCE_THRESHOLD_REF || 2500)
  const sampleCount = Math.max(1, Number(argValue('--samples', '3')) || 3)

  const operatorEvidence = join(artifactRoot, 'operator-evidence')
  const operatorReadbacks = join(artifactRoot, 'operator-readbacks')
  const tracePath = join(operatorEvidence, 'real-uat-05-gantt-trace.json')
  const criticalPathPath = join(operatorEvidence, 'real-uat-05-critical-path-readback.json')
  const performancePath = join(operatorEvidence, 'real-uat-05-performance-gantt-p95.json')
  const cleanupPath = join(operatorReadbacks, 'real-uat-05-cleanup-readback.json')
  const summaryPath = join(operatorEvidence, 'real-uat-05-operator-evidence-summary.json')

  const token = await login(apiBase, username, password, publicOrigin)
  const tasksResult = await request({
    url: joinApiPath(apiBase, `/api/tasks?projectId=${encodeURIComponent(largeProjectId)}&surface=task_list&acceptance_impact=false`),
    token,
    companyId,
    timeoutMs: 30000,
  })
  const tasks = Array.isArray(unwrapData(tasksResult.body)) ? unwrapData(tasksResult.body) : []
  if (!tasksResult.ok || tasks.length < 2) {
    throw new Error(`Unable to read enough large-project tasks: ${JSON.stringify(responseDigest(tasksResult))}`)
  }

  const traceResult = await collectTraceEvidence({
    apiBase,
    token,
    companyId,
    projectId,
    largeProjectId,
    tasks,
    now,
  })
  const criticalPathEvidence = await collectCriticalPathEvidence({
    apiBase,
    token,
    companyId,
    projectId,
    largeProjectId,
    now,
  })
  const performanceEvidence = await collectPerformanceEvidence({
    apiBase,
    token,
    companyId,
    projectId,
    largeProjectId,
    thresholdMs,
    sampleCount,
    now,
  })
  const cleanupEvidence = {
    schemaVersion: 'workbuddy/v14241-real-uat05-cleanup-readback/v1',
    generatedAt: now.toISOString(),
    status: traceResult.cleanup.status === 'pass' ? 'pass' : 'blocked',
    environment: 'staging',
    projectId,
    largeProjectId,
    ...traceResult.cleanup,
    commandOrManualScript: 'node project-testing/tools/collect-v14241-real-uat05-operator-evidence.mjs',
  }

  await writeJson(tracePath, traceResult.trace)
  await writeJson(criticalPathPath, criticalPathEvidence)
  await writeJson(performancePath, performanceEvidence)
  await writeJson(cleanupPath, cleanupEvidence)

  const summary = {
    schemaVersion: 'workbuddy/v14241-real-uat05-operator-evidence-summary/v1',
    generatedAt: now.toISOString(),
    status: [traceResult.trace.status, criticalPathEvidence.status, performanceEvidence.status, cleanupEvidence.status].every((status) => status === 'pass')
      ? 'pass'
      : 'blocked_or_failed',
    environment: 'staging',
    projectId,
    largeProjectId,
    commandsExecuted: 1 + 1 + (sampleCount * 2),
    artifacts: {
      trace: rel(tracePath),
      criticalPathReadback: rel(criticalPathPath),
      performanceGanttP95: rel(performancePath),
      cleanupReadback: rel(cleanupPath),
    },
    statuses: {
      trace: traceResult.trace.status,
      criticalPathReadback: criticalPathEvidence.status,
      performanceGanttP95: performanceEvidence.status,
      cleanupReadback: cleanupEvidence.status,
    },
    performance: {
      p95Ms: performanceEvidence.p95Ms,
      thresholdMs: performanceEvidence.thresholdMs,
    },
    mutationBoundary: 'Controlled staging task title and task dependency write/readback with cleanup restore; no live or production execution.',
  }
  await writeJson(summaryPath, summary)

  console.log(JSON.stringify({
    status: summary.status,
    statuses: summary.statuses,
    performance: summary.performance,
    artifacts: summary.artifacts,
    summary: rel(summaryPath),
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
