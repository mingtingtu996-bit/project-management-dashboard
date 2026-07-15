#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

const defaultEnvFile = 'deploy/env/staging.env'
const defaultRefsEnvFile = '.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env'
const defaultTraceFile = 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-evidence/staging/operator-evidence/real-uat-05-gantt-trace.json'
const defaultOutput = 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-uat05-task-update-service-diagnostic.json'

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

function installEnv(env) {
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

function errorSummary(error) {
  return {
    name: error?.name ?? null,
    code: error?.code ?? null,
    statusCode: error?.statusCode ?? null,
    message: error instanceof Error ? error.message : String(error),
    stackPreview: error instanceof Error && error.stack ? error.stack.slice(0, 1600) : null,
  }
}

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password\s*[=:]|service[_-]?role|StrongPass/i.test(text)) {
    throw new Error('refusing_to_write_task_update_diagnostic_with_secret_like_text')
  }
}

async function writeJson(path, payload) {
  assertNoSecretLikeText(payload)
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(resolve(path), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function main() {
  const envFile = resolve(argValue('--env-file', defaultEnvFile))
  const refsEnvFile = resolve(argValue('--refs-env-file', defaultRefsEnvFile))
  const traceFile = resolve(argValue('--trace-file', defaultTraceFile))
  const output = resolve(argValue('--output', defaultOutput))
  const env = parseEnv(await readFile(envFile, 'utf8'))
  const refs = parseEnv(await readFile(refsEnvFile, 'utf8'))
  installEnv(env)

  const trace = JSON.parse((await readFile(traceFile, 'utf8')).replace(/^\uFEFF/, ''))
  const taskId = String(trace.targetTaskId ?? '').trim()
  if (!taskId) throw new Error('Trace file does not contain targetTaskId')
  const username = requireEnv(refs, 'V14241_STAGING_TEST_USER_EMAIL_REF')
  const supabase = createClient(requireEnv(env, 'SUPABASE_URL'), requireEnv(env, 'SUPABASE_SERVICE_KEY'), { auth: { persistSession: false } })
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, username')
    .eq('username', username)
    .maybeSingle()
  if (userError) throw userError
  if (!user?.id) throw new Error('diagnostic actor user not found')
  const { data: beforeTask, error: taskError } = await supabase
    .from('tasks')
    .select('id, project_id, title, version')
    .eq('id', taskId)
    .maybeSingle()
  if (taskError) throw taskError
  if (!beforeTask?.id) throw new Error('diagnostic task not found')

  const { updateTaskInMainChain } = await import('../../server/src/services/taskWriteChainService.ts')
  const { closeDatabasePool } = await import('../../server/src/database.ts')

  const originalTitle = String(beforeTask.title ?? '')
  const diagnosticTitle = `${originalTitle} [uat05-diagnostic-${Date.now()}]`
  const expectedVersion = Number.isFinite(Number(beforeTask.version)) ? Number(beforeTask.version) : undefined
  let updateResult = null
  let updateError = null
  let restoreResult = null
  let restoreError = null

  try {
    updateResult = await updateTaskInMainChain(taskId, { title: diagnosticTitle, updated_by: user.id }, expectedVersion)
  } catch (error) {
    updateError = errorSummary(error)
  }

  if (updateResult?.task?.id) {
    const nextVersion = Number(updateResult.task.version ?? expectedVersion)
    try {
      restoreResult = await updateTaskInMainChain(
        taskId,
        { title: originalTitle, updated_by: user.id },
        Number.isFinite(nextVersion) ? nextVersion : undefined,
      )
    } catch (error) {
      restoreError = errorSummary(error)
    }
  }

  await closeDatabasePool().catch(() => undefined)
  const { data: afterTask } = await supabase
    .from('tasks')
    .select('id, project_id, title, version')
    .eq('id', taskId)
    .maybeSingle()
  const restoredTitle = String(afterTask?.title ?? '') === originalTitle

  const report = {
    schemaVersion: 'workbuddy/v14241-uat05-task-update-service-diagnostic/v1',
    generatedAt: new Date().toISOString(),
    status: updateError
      ? 'reproduced_service_update_failure'
      : updateResult?.task?.id && restoredTitle && !restoreError
        ? 'service_update_succeeded_and_restored'
        : 'blocked_restore_required',
    environment: 'controlled-staging-local',
    taskId,
    projectId: beforeTask.project_id,
    actorRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_TEST_USER_EMAIL_REF',
    expectedVersion,
    updateSucceeded: Boolean(updateResult?.task?.id),
    updateError,
    restoreAttempted: Boolean(updateResult?.task?.id),
    restoreSucceeded: Boolean(restoreResult?.task?.id) && restoredTitle,
    restoreError,
    restoredTitle,
    before: {
      version: beforeTask.version ?? null,
      titleLength: originalTitle.length,
    },
    after: {
      version: afterTask?.version ?? null,
      titleRestored: restoredTitle,
      titleHasDiagnosticMarker: String(afterTask?.title ?? '').includes('[uat05-diagnostic-'),
    },
    mutationBoundary: 'Controlled staging diagnostic against one UAT05 fixture task. If update succeeds, the script immediately restores the original title through the same main write chain; no live or production mutation.',
  }
  await writeJson(output, report)
  console.log(JSON.stringify({
    status: report.status,
    updateSucceeded: report.updateSucceeded,
    updateError: report.updateError ? {
      code: report.updateError.code,
      statusCode: report.updateError.statusCode,
      message: report.updateError.message,
    } : null,
    restoreSucceeded: report.restoreSucceeded,
    output: rel(output),
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
