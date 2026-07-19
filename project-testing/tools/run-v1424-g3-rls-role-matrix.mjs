#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolvePublicHttpsOrigin } from '../../scripts/public-origin.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = path.join(
  repoRoot,
  'project-testing',
  'reports',
  'release-v1.4.24-20260702-125254',
)
const defaultManifestPath = path.join(repoRoot, '.tmp', 'full-app-test-env', 'manifest.json')

function parseArgs(argv) {
  const args = {
    apiBase: process.env.API_BASE_URL || process.env.V1424_API_BASE_URL || 'http://127.0.0.1:3106',
    publicOrigin: process.env.PUBLIC_HTTPS_ORIGIN || '',
    releaseDir: defaultReleaseDir,
    manifest: defaultManifestPath,
    writeCommandResult: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--api-base') {
      args.apiBase = String(argv[index + 1] ?? '').trim()
      index += 1
    } else if (arg === '--public-origin') {
      args.publicOrigin = String(argv[index + 1] ?? '').trim()
      index += 1
    } else if (arg === '--release-dir') {
      args.releaseDir = path.resolve(String(argv[index + 1] ?? '').trim())
      index += 1
    } else if (arg === '--manifest') {
      args.manifest = path.resolve(String(argv[index + 1] ?? '').trim())
      index += 1
    } else if (arg === '--write-command-result') {
      args.writeCommandResult = true
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/run-v1424-g3-rls-role-matrix.mjs [--api-base <url>] [--release-dir <dir>] [--manifest <path>] [--write-command-result]')
      process.exit(0)
    }
  }

  args.apiBase = args.apiBase.replace(/\/$/, '')
  return args
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/')
}

function safeId(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

function nowIso() {
  return new Date().toISOString()
}

async function requestJson(apiBase, urlPath, options = {}) {
  const headers = {
    accept: 'application/json',
    ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(options.headers ?? {}),
  }
  const startedAt = Date.now()
  let response
  let rawBody = ''
  try {
    response = await fetch(`${apiBase}${urlPath}`, {
      ...options,
      headers,
      body: options.body === undefined || typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body),
    })
    rawBody = await response.text()
  } catch (error) {
    return {
      status: 0,
      ok: false,
      durationMs: Date.now() - startedAt,
      errorCode: 'FETCH_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      body: null,
    }
  }

  let body = null
  try {
    body = rawBody ? JSON.parse(rawBody) : null
  } catch {
    body = { raw: rawBody.slice(0, 500) }
  }

  return {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    errorCode: body?.error?.code ?? null,
    errorMessage: body?.error?.message ?? null,
    body,
  }
}

function authHeaders(session) {
  return {
    authorization: `Bearer ${session.token}`,
  }
}

async function login(apiBase, account, publicOrigin) {
  const result = await requestJson(apiBase, '/api/auth/login', {
    method: 'POST',
    headers: { origin: publicOrigin },
    body: {
      username: account.username,
      password: account.password,
    },
  })
  const token = result.body?.data?.token
  const user = result.body?.data?.user ?? null
  return {
    status: result.status,
    ok: result.status === 200 && typeof token === 'string' && token.length > 20,
    token,
    user,
    raw: result,
  }
}

function assertStatus(actual, allowed) {
  return allowed.includes(actual)
}

function makeCase(id, role, operation, result, expectedStatuses, extra = {}) {
  const passed = assertStatus(result.status, expectedStatuses)
  return {
    id,
    role,
    operation,
    status: passed ? 'pass' : 'fail',
    httpStatus: result.status,
    expectedStatuses,
    errorCode: result.errorCode,
    durationMs: result.durationMs,
    ...extra,
  }
}

function addBlocker(blockers, code, condition) {
  if (condition) blockers.add(code)
}

function minimalProject(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id ?? null,
    name: row.name ?? null,
    company_id: row.company_id ?? row.companyId ?? null,
    owner_id: row.owner_id ?? row.ownerId ?? null,
  }
}

function minimalTask(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id ?? null,
    title: row.title ?? null,
    assignee: row.assignee ?? null,
    assignee_name: row.assignee_name ?? null,
    version: row.version ?? null,
  }
}

async function deleteIfCreated(apiBase, session, projectId, cleanup) {
  if (!safeId(projectId)) return
  const result = await requestJson(apiBase, `/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  })
  cleanup.push({
    target: 'project',
    id: projectId,
    httpStatus: result.status,
    success: result.status >= 200 && result.status < 300,
    errorCode: result.errorCode,
  })
}

async function commitTaskCell(apiBase, session, { projectId, taskId, field, value, requestId }) {
  return requestJson(apiBase, '/api/tasks/commit', {
    method: 'POST',
    headers: authHeaders(session),
    body: {
      projectId,
      surface: 'task_list',
      fieldRegistryVersion: 'v1.4.7.1',
      clientContext: { requestId },
      operations: [
        {
          type: 'update_cell',
          rowId: taskId,
          field,
          value,
        },
      ],
    },
  })
}

export function buildTenantAccessMatrix(report) {
  const cases = Array.isArray(report?.cases) ? report.cases : []
  const find = (id) => cases.find((testCase) => testCase.id === id) ?? null
  const caseStatus = (id) => {
    const testCase = find(id)
    return {
      status: testCase?.status ?? 'missing',
      httpStatus: testCase?.httpStatus ?? null,
      errorCode: testCase?.errorCode ?? null,
    }
  }

  return {
    schemaVersion: 'workbuddy-v1424-tenant-access-matrix/v1',
    generatedAt: report.generatedAt,
    apiBase: report.apiBase,
    status: report.status,
    rawTokenWrittenToReport: false,
    matrix: [
      {
        actor: 'owner',
        tenantScope: 'same_tenant_standard_project',
        read: caseStatus('G3-OWNER-PROJECT-READ'),
        write: caseStatus('G3-OWNER-PROJECT-WRITE'),
      },
      {
        actor: 'company_admin',
        tenantScope: 'same_company_standard_project',
        read: caseStatus('G3-COMPANY-ADMIN-PROJECT-READ'),
        write: caseStatus('G3-COMPANY-ADMIN-PROJECT-PATCH'),
      },
      {
        actor: 'editor',
        tenantScope: 'same_project_task_chain',
        read: caseStatus('G3-EDITOR-TASK-LIST'),
        write: caseStatus('G3-EDITOR-TASK-WRITE'),
        ownerOnlyWriteRejected: caseStatus('G3-EDITOR-PROJECT-PATCH-REJECTED'),
      },
      {
        actor: 'outsider',
        tenantScope: 'same_company_but_not_project_member',
        membershipRejected: caseStatus('G3-OUTSIDER-MEMBERSHIP-REJECTED'),
        readRejected: caseStatus('G3-OUTSIDER-TASK-LIST-REJECTED'),
        writeRejected: caseStatus('G3-OUTSIDER-TASK-WRITE-REJECTED'),
        projectPatchRejected: caseStatus('G3-OUTSIDER-PROJECT-PATCH-REJECTED'),
      },
      {
        actor: 'anon',
        tenantScope: 'anonymous',
        writeRejected: caseStatus('G3-ANON-PROJECT-CREATE-REJECTED'),
      },
      {
        actor: 'invalid_token',
        tenantScope: 'invalid_token',
        readRejected: caseStatus('G3-INVALID-TOKEN-PROJECT-LIST-REJECTED'),
      },
      {
        actor: 'cross_company_user',
        tenantScope: 'other_tenant_against_standard_project',
        ownWrite: caseStatus('G3-CROSS-TENANT-OWN-PROJECT-WRITE'),
        crossReadRejected: caseStatus('G3-CROSS-TENANT-STANDARD-PROJECT-READ-REJECTED'),
        crossListIsolated: caseStatus('G3-CROSS-TENANT-PROJECT-LIST-ISOLATED'),
        crossWriteRejected: caseStatus('G3-CROSS-TENANT-STANDARD-TASK-WRITE-REJECTED'),
      },
    ],
    blockers: report.coverageSummary?.blockers ?? [],
  }
}

export function containsSecretLikeText(value) {
  const text = JSON.stringify(value)
  return /\bBearer\s+/i.test(text)
    || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(text)
    || /\bSUPABASE_SERVICE_KEY\s*[:=]/i.test(text)
    || /\bservice_role\b/i.test(text)
    || /\b(access_token|auth_token)\s*[:=]/i.test(text)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const publicOrigin = resolvePublicHttpsOrigin({
    apiBaseUrl: args.apiBase,
    publicOrigin: args.publicOrigin,
  })
  const generatedAt = nowIso()
  const manifest = readJson(args.manifest)
  const accounts = manifest.accounts ?? {}
  const standardProjectId = safeId(manifest.projects?.standard?.id)
  const cleanup = []
  const cases = []
  const blockers = new Set()
  const sessions = {}

  const health = await requestJson(args.apiBase, '/api/readyz')
  addBlocker(blockers, 'api_health_not_ok', health.status !== 200)

  for (const role of ['companyAdmin', 'owner', 'editor', 'outsider']) {
    const account = accounts[role]
    if (!account?.username || !account?.password) {
      blockers.add(`${role}_account_missing`)
      continue
    }
    const session = await login(args.apiBase, account, publicOrigin)
    sessions[role] = session
    cases.push({
      id: `G3-AUTH-${role}`,
      role,
      operation: 'login',
      status: session.ok ? 'pass' : 'fail',
      httpStatus: session.status,
      userId: session.user?.id ?? null,
      globalRole: session.user?.globalRole ?? null,
      currentCompanyId: session.user?.currentCompanyId ?? null,
      rawTokenWrittenToReport: false,
    })
    addBlocker(blockers, `${role}_login_failed`, !session.ok)
  }

  if (!standardProjectId) blockers.add('standard_project_id_missing')

  const owner = sessions.owner
  const editor = sessions.editor
  const companyAdmin = sessions.companyAdmin
  const outsider = sessions.outsider

  if (owner?.ok && standardProjectId) {
    const list = await requestJson(args.apiBase, '/api/projects', { headers: authHeaders(owner) })
    const projects = Array.isArray(list.body?.data) ? list.body.data : []
    cases.push(makeCase(
      'G3-OWNER-PROJECT-LIST',
      'owner',
      'GET /api/projects',
      list,
      [200],
      { count: projects.length, includesStandardProject: projects.some((project) => project.id === standardProjectId) },
    ))
    addBlocker(blockers, 'owner_project_list_missing_standard_project', list.status !== 200 || !projects.some((project) => project.id === standardProjectId))

    const read = await requestJson(args.apiBase, `/api/projects/${standardProjectId}`, { headers: authHeaders(owner) })
    cases.push(makeCase(
      'G3-OWNER-PROJECT-READ',
      'owner',
      `GET /api/projects/${standardProjectId}`,
      read,
      [200],
      { project: minimalProject(read.body?.data) },
    ))

    const create = await requestJson(args.apiBase, '/api/projects', {
      method: 'POST',
      headers: authHeaders(owner),
      body: {
        name: `V1424-G3 disposable ${Date.now()}`,
        description: 'disposable project created by v1.4.24 G3 role matrix probe',
        status: '未开始',
      },
    })
    const createdProject = create.body?.data ?? null
    const createdProjectId = safeId(createdProject?.id)
    cases.push(makeCase(
      'G3-OWNER-PROJECT-WRITE',
      'owner',
      'POST /api/projects',
      create,
      [201],
      { createdProjectId, project: minimalProject(createdProject) },
    ))
    addBlocker(blockers, 'owner_project_write_failed', create.status !== 201 || !createdProjectId)
    if (createdProjectId) {
      const readback = await requestJson(args.apiBase, `/api/projects/${createdProjectId}`, { headers: authHeaders(owner) })
      cases.push(makeCase(
        'G3-OWNER-PROJECT-READBACK',
        'owner',
        `GET /api/projects/${createdProjectId}`,
        readback,
        [200],
        { readbackProjectId: readback.body?.data?.id ?? null },
      ))
      addBlocker(blockers, 'owner_project_readback_failed', readback.status !== 200 || readback.body?.data?.id !== createdProjectId)
      await deleteIfCreated(args.apiBase, owner, createdProjectId, cleanup)
    }
  }

  if (companyAdmin?.ok && standardProjectId) {
    const list = await requestJson(args.apiBase, '/api/projects', { headers: authHeaders(companyAdmin) })
    const projects = Array.isArray(list.body?.data) ? list.body.data : []
    cases.push(makeCase(
      'G3-COMPANY-ADMIN-PROJECT-LIST',
      'company_admin',
      'GET /api/projects',
      list,
      [200],
      { count: projects.length, includesStandardProject: projects.some((project) => project.id === standardProjectId) },
    ))
    const read = await requestJson(args.apiBase, `/api/projects/${standardProjectId}`, { headers: authHeaders(companyAdmin) })
    cases.push(makeCase(
      'G3-COMPANY-ADMIN-PROJECT-READ',
      'company_admin',
      `GET /api/projects/${standardProjectId}`,
      read,
      [200],
      { project: minimalProject(read.body?.data) },
    ))
    const patch = await requestJson(args.apiBase, `/api/projects/${standardProjectId}`, {
      method: 'PATCH',
      headers: authHeaders(companyAdmin),
      body: {
        description: `v1424 g3 company admin patch ${Date.now()}`,
      },
    })
    cases.push(makeCase(
      'G3-COMPANY-ADMIN-PROJECT-PATCH',
      'company_admin',
      `PATCH /api/projects/${standardProjectId}`,
      patch,
      [200],
      { project: minimalProject(patch.body?.data) },
    ))
    addBlocker(blockers, 'company_admin_standard_project_access_failed', list.status !== 200 || read.status !== 200 || patch.status !== 200)
  }

  if (editor?.ok && standardProjectId) {
    const list = await requestJson(args.apiBase, `/api/tasks?projectId=${standardProjectId}&surface=task_list`, {
      headers: authHeaders(editor),
    })
    const tasks = Array.isArray(list.body?.data) ? list.body.data : []
    cases.push(makeCase(
      'G3-EDITOR-TASK-LIST',
      'editor',
      'GET /api/tasks?projectId=<standard>',
      list,
      [200],
      { count: tasks.length },
    ))
    addBlocker(blockers, 'editor_task_list_failed', list.status !== 200)

    const writableTask = tasks.find((task) => safeId(task.id) && String(task.status ?? '').toLowerCase() !== 'completed')
      ?? tasks.find((task) => safeId(task.id))
      ?? null
    const writableTaskId = safeId(writableTask?.id)
    const previousAssignee = writableTask?.assignee ?? writableTask?.assignee_name ?? ''
    const nextAssignee = `g3-editor-${Date.now()}`
    let readback = null
    let rollback = null
    const write = writableTaskId
      ? await commitTaskCell(args.apiBase, editor, {
        projectId: standardProjectId,
        taskId: writableTaskId,
        field: 'assignee',
        value: nextAssignee,
        requestId: `v1424-g3-editor-write-${Date.now()}`,
      })
      : { status: 0, durationMs: 0, errorCode: 'NO_WRITABLE_TASK', body: null }
    if (writableTaskId && write.status === 200) {
      readback = await requestJson(args.apiBase, `/api/tasks/${writableTaskId}`, {
        headers: authHeaders(editor),
      })
      rollback = await commitTaskCell(args.apiBase, editor, {
        projectId: standardProjectId,
        taskId: writableTaskId,
        field: 'assignee',
        value: previousAssignee,
        requestId: `v1424-g3-editor-rollback-${Date.now()}`,
      })
      cleanup.push({
        target: 'task_assignee_rollback',
        id: writableTaskId,
        httpStatus: rollback.status,
        success: rollback.status === 200,
        errorCode: rollback.errorCode,
      })
    }
    const readbackTask = readback?.body?.data ?? null
    const editorWriteClosed =
      write.status === 200
      && readback?.status === 200
      && readbackTask?.id === writableTaskId
      && (readbackTask?.assignee === nextAssignee || readbackTask?.assignee_name === nextAssignee)
      && rollback?.status === 200
    cases.push(makeCase(
      'G3-EDITOR-TASK-WRITE',
      'editor',
      'POST /api/tasks/commit update_cell assignee with readback and rollback',
      write,
      [200],
      {
        taskId: writableTaskId,
        before: minimalTask(writableTask),
        readback: minimalTask(readbackTask),
        rollbackStatus: rollback?.status ?? null,
        readbackMatched: readbackTask?.assignee === nextAssignee || readbackTask?.assignee_name === nextAssignee,
      },
    ))
    addBlocker(blockers, 'editor_task_write_failed', !editorWriteClosed)

    const projectPatch = await requestJson(args.apiBase, `/api/projects/${standardProjectId}`, {
      method: 'PATCH',
      headers: authHeaders(editor),
      body: {
        description: `v1424 g3 editor project patch should fail ${Date.now()}`,
      },
    })
    cases.push(makeCase(
      'G3-EDITOR-PROJECT-PATCH-REJECTED',
      'editor',
      `PATCH /api/projects/${standardProjectId}`,
      projectPatch,
      [403],
      { rejectedWithout500: projectPatch.status === 403 },
    ))
    addBlocker(blockers, 'editor_owner_only_project_patch_not_rejected', projectPatch.status !== 403)
  }

  if (outsider?.ok && standardProjectId) {
    const membership = await requestJson(args.apiBase, `/api/members/${standardProjectId}/me`, {
      headers: authHeaders(outsider),
    })
    cases.push(makeCase(
      'G3-OUTSIDER-MEMBERSHIP-REJECTED',
      'outsider',
      `GET /api/members/${standardProjectId}/me`,
      membership,
      [403],
      { rejectedWithout500: membership.status === 403 },
    ))
    const list = await requestJson(args.apiBase, `/api/tasks?projectId=${standardProjectId}&surface=task_list`, {
      headers: authHeaders(outsider),
    })
    cases.push(makeCase(
      'G3-OUTSIDER-TASK-LIST-REJECTED',
      'outsider',
      'GET /api/tasks?projectId=<standard>',
      list,
      [403],
      { rejectedWithout500: list.status === 403 },
    ))
    const write = await requestJson(args.apiBase, '/api/tasks', {
      method: 'POST',
      headers: authHeaders(outsider),
      body: {
        project_id: standardProjectId,
        title: `V1424 G3 outsider task should fail ${Date.now()}`,
        status: 'todo',
        priority: 'medium',
        start_date: '2026-07-04',
        end_date: '2026-07-05',
      },
    })
    cases.push(makeCase(
      'G3-OUTSIDER-TASK-WRITE-REJECTED',
      'outsider',
      'POST /api/tasks',
      write,
      [403],
      { rejectedWithout500: write.status === 403 },
    ))
    const projectPatch = await requestJson(args.apiBase, `/api/projects/${standardProjectId}`, {
      method: 'PATCH',
      headers: authHeaders(outsider),
      body: {
        description: `v1424 g3 outsider project patch should fail ${Date.now()}`,
      },
    })
    cases.push(makeCase(
      'G3-OUTSIDER-PROJECT-PATCH-REJECTED',
      'outsider',
      `PATCH /api/projects/${standardProjectId}`,
      projectPatch,
      [403],
      { rejectedWithout500: projectPatch.status === 403 },
    ))
    addBlocker(
      blockers,
      'same_company_outsider_access_not_rejected',
      membership.status !== 403 || list.status !== 403 || write.status !== 403 || projectPatch.status !== 403,
    )
  }

  const anonCreate = await requestJson(args.apiBase, '/api/projects', {
    method: 'POST',
    body: {
      name: `V1424 anon should fail ${Date.now()}`,
    },
  })
  cases.push(makeCase(
    'G3-ANON-PROJECT-CREATE-REJECTED',
    'anon',
    'POST /api/projects',
    anonCreate,
    [401],
    { rejectedWithout500: anonCreate.status === 401 },
  ))
  addBlocker(blockers, 'anon_project_create_not_rejected_as_401', anonCreate.status !== 401)

  const invalidToken = await requestJson(args.apiBase, '/api/projects', {
    headers: { authorization: 'Bearer invalid-v1424-token' },
  })
  cases.push(makeCase(
    'G3-INVALID-TOKEN-PROJECT-LIST-REJECTED',
    'invalid_token',
    'GET /api/projects',
    invalidToken,
    [401],
    { rejectedWithout500: invalidToken.status === 401 },
  ))
  addBlocker(blockers, 'invalid_token_project_list_not_rejected_as_401', invalidToken.status !== 401)

  let crossSession = null
  const crossUsername = `v1424_cross_${Date.now()}`
  const crossRegister = await requestJson(args.apiBase, '/api/auth/register', {
    method: 'POST',
    body: {
      username: crossUsername,
      password: 'StrongPass123!',
      display_name: 'v1.4.24 cross tenant probe',
      email: `${crossUsername}@example.invalid`,
    },
  })
  if (crossRegister.status === 200 && crossRegister.body?.data?.token) {
    crossSession = {
      token: crossRegister.body.data.token,
      user: crossRegister.body.data.user,
    }
  }
  cases.push(makeCase(
    'G3-CROSS-TENANT-REGISTER',
    'cross_company_user',
    'POST /api/auth/register',
    crossRegister,
    [200],
    { userId: crossRegister.body?.data?.user?.id ?? null, currentCompanyId: crossRegister.body?.data?.user?.currentCompanyId ?? null, rawTokenWrittenToReport: false },
  ))
  addBlocker(blockers, 'cross_company_user_registration_failed', !crossSession)

  let crossCreatedProjectId = null
  if (crossSession) {
    const crossProject = await requestJson(args.apiBase, '/api/projects', {
      method: 'POST',
      headers: authHeaders(crossSession),
      body: {
        name: `V1424-G3 cross tenant disposable ${Date.now()}`,
        description: 'disposable project for cross-tenant isolation probe',
        status: '未开始',
      },
    })
    crossCreatedProjectId = safeId(crossProject.body?.data?.id)
    cases.push(makeCase(
      'G3-CROSS-TENANT-OWN-PROJECT-WRITE',
      'cross_company_user',
      'POST /api/projects',
      crossProject,
      [201],
      { createdProjectId: crossCreatedProjectId, project: minimalProject(crossProject.body?.data) },
    ))
    addBlocker(blockers, 'cross_company_user_own_project_write_failed', crossProject.status !== 201 || !crossCreatedProjectId)

    if (standardProjectId) {
      const crossRead = await requestJson(args.apiBase, `/api/projects/${standardProjectId}`, {
        headers: authHeaders(crossSession),
      })
      cases.push(makeCase(
        'G3-CROSS-TENANT-STANDARD-PROJECT-READ-REJECTED',
        'cross_company_user',
        `GET /api/projects/${standardProjectId}`,
        crossRead,
        [403],
        { rejectedWithout500: crossRead.status === 403 },
      ))
      addBlocker(blockers, 'cross_company_user_can_read_standard_project', crossRead.status !== 403)

      const crossList = await requestJson(args.apiBase, '/api/projects', {
        headers: authHeaders(crossSession),
      })
      const crossProjects = Array.isArray(crossList.body?.data) ? crossList.body.data : []
      cases.push(makeCase(
        'G3-CROSS-TENANT-PROJECT-LIST-ISOLATED',
        'cross_company_user',
        'GET /api/projects',
        crossList,
        [200],
        {
          count: crossProjects.length,
          includesStandardProject: crossProjects.some((project) => project.id === standardProjectId),
          includesOwnDisposableProject: crossCreatedProjectId ? crossProjects.some((project) => project.id === crossCreatedProjectId) : null,
        },
      ))
      addBlocker(blockers, 'cross_company_user_project_list_leaks_standard_project', crossList.status !== 200 || crossProjects.some((project) => project.id === standardProjectId))

      const crossWrite = await requestJson(args.apiBase, '/api/tasks', {
        method: 'POST',
        headers: authHeaders(crossSession),
        body: {
          project_id: standardProjectId,
          title: `V1424 G3 cross tenant task should fail ${Date.now()}`,
          status: 'todo',
          priority: 'medium',
          start_date: '2026-07-04',
          end_date: '2026-07-05',
        },
      })
      cases.push(makeCase(
        'G3-CROSS-TENANT-STANDARD-TASK-WRITE-REJECTED',
        'cross_company_user',
        'POST /api/tasks against standard project',
        crossWrite,
        [403],
        { rejectedWithout500: crossWrite.status === 403 },
      ))
      addBlocker(blockers, 'cross_company_user_can_write_standard_project_task', crossWrite.status !== 403)
    }

    if (crossCreatedProjectId) {
      await deleteIfCreated(args.apiBase, crossSession, crossCreatedProjectId, cleanup)
    }
  }

  const failedCases = cases.filter((testCase) => testCase.status !== 'pass')
  const status = blockers.size === 0 && failedCases.length === 0 ? 'pass' : 'blocked'

  const report = {
    schemaVersion: 'workbuddy-v1424-rls-role-matrix/v2',
    generatedAt,
    apiBase: args.apiBase,
    environment: 'staging_api',
    status,
    rawTokenWrittenToReport: false,
    fixture: {
      manifestPath: relative(args.manifest),
      standardProjectId,
      accounts: Object.fromEntries(
        Object.entries(accounts).map(([role, account]) => [
          role,
          {
            username: account?.username ?? null,
            declaredRole: account?.globalRole ?? account?.projectRole ?? null,
          },
        ]),
      ),
    },
    coverageSummary: {
      totalCases: cases.length,
      passedCases: cases.length - failedCases.length,
      failedCases: failedCases.length,
      blockers: [...blockers],
    },
    cases,
    cleanup,
    decisionImpact: status === 'pass'
      ? 'G3 role matrix passed for configured staging API and disposable data'
      : 'G3 remains blocked until failed/blocking role-matrix cases are closed',
  }

  const matrixPath = path.join(args.releaseDir, 'rls-role-matrix.json')
  const tenantMatrixPath = path.join(args.releaseDir, 'tenant-access-matrix.json')
  const authPath = path.join(args.releaseDir, 'auth-smoke.json')
  const errorSemanticsPath = path.join(args.releaseDir, 'api-error-semantics.json')
  const tenantMatrix = buildTenantAccessMatrix(report)
  if (containsSecretLikeText(report) || containsSecretLikeText(tenantMatrix)) {
    throw new Error('refusing_to_write_g3_report_with_secret_like_text')
  }
  writeJson(matrixPath, report)
  writeJson(tenantMatrixPath, tenantMatrix)
  const authSmoke = {
    schemaVersion: 'workbuddy-v1424-auth-smoke/v2',
    generatedAt,
    apiBase: args.apiBase,
    status: health.status === 200 && ['companyAdmin', 'owner', 'editor', 'outsider'].every((role) => sessions[role]?.ok) ? 'pass' : 'blocked',
    healthStatus: health.status,
    accounts: Object.fromEntries(
      Object.entries(sessions).map(([role, session]) => [
        role,
        {
          loginStatus: session.status,
          ok: session.ok,
          userId: session.user?.id ?? null,
          globalRole: session.user?.globalRole ?? null,
          currentCompanyId: session.user?.currentCompanyId ?? null,
        },
      ]),
    ),
    rawTokenWrittenToReport: false,
    blockers: [...blockers].filter((blocker) => blocker.endsWith('_login_failed') || blocker === 'api_health_not_ok'),
  }
  const errorSemantics = {
    schemaVersion: 'workbuddy-v1424-api-error-semantics/v2',
    generatedAt,
    apiBase: args.apiBase,
    status: anonCreate.status === 401 && invalidToken.status === 401 ? 'pass' : 'blocked',
    checks: [
      {
        id: 'anon-project-create',
        expectedStatus: 401,
        actualStatus: anonCreate.status,
        errorCode: anonCreate.errorCode,
      },
      {
        id: 'invalid-token-project-list',
        expectedStatus: 401,
        actualStatus: invalidToken.status,
        errorCode: invalidToken.errorCode,
      },
    ],
    rawTokenWrittenToReport: false,
    blockers: [
      anonCreate.status === 401 ? null : 'anon_project_create_not_rejected_as_401',
      invalidToken.status === 401 ? null : 'invalid_token_project_list_not_rejected_as_401',
    ].filter(Boolean),
  }
  if (containsSecretLikeText(authSmoke) || containsSecretLikeText(errorSemantics)) {
    throw new Error('refusing_to_write_g3_aux_report_with_secret_like_text')
  }
  writeJson(authPath, authSmoke)
  writeJson(errorSemanticsPath, errorSemantics)

  if (args.writeCommandResult) {
    const commandResultsPath = path.join(args.releaseDir, 'v1424-command-results.normalized.json')
    const rows = readJson(commandResultsPath)
    const nextRow = {
      id: 'G3-rls-role-matrix-2',
      gate: 'G3',
      command: `node project-testing/tools/run-v1424-g3-rls-role-matrix.mjs --api-base=${args.apiBase} --write-command-result`,
      cwd: repoRoot,
      environment: 'staging_api',
      startedAt: generatedAt,
      finishedAt: nowIso(),
      exitCode: status === 'pass' ? 0 : 1,
      status,
      stdoutPath: relative(matrixPath),
      stderrPath: relative(matrixPath),
      summary: status === 'pass'
        ? 'full configured G3 role matrix passed without raw token disclosure'
        : `G3 role matrix blocked: ${[...blockers].join(', ')}`,
      mutationBoundary: 'staging API disposable project/task writes with cleanup; no raw token persisted',
      evidencePaths: [
        relative(matrixPath),
        relative(tenantMatrixPath),
        relative(authPath),
        relative(errorSemanticsPath),
      ],
    }
    const filtered = rows.filter((row) => row.id !== nextRow.id)
    writeJson(commandResultsPath, [...filtered, nextRow])
  }

  console.log(JSON.stringify({
    status,
    reportPath: relative(matrixPath),
    tenantAccessMatrixPath: relative(tenantMatrixPath),
    authSmokePath: relative(authPath),
    apiErrorSemanticsPath: relative(errorSemanticsPath),
    totalCases: cases.length,
    failedCases: failedCases.length,
    blockers: [...blockers],
  }, null, 2))

  process.exitCode = status === 'pass' ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
