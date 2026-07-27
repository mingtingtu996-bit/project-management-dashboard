#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function parseEnv(text) {
  const env = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    const value = line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')
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

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password\s*[=:]|service[_-]?role/i.test(text)) {
    throw new Error('refusing_to_write_context_probe_with_secret_like_text')
  }
}

function summarizeBody(body) {
  const data = unwrapData(body)
  if (Array.isArray(data)) return { itemCount: data.length }
  if (!data || typeof data !== 'object') return { type: typeof data }
  return {
    topLevelFields: Object.keys(data).slice(0, 12),
    id: data.id ?? data.projectId ?? null,
    status: data.status ?? null,
    currentCompanyId: data.currentCompany?.id ?? data.currentCompanyId ?? null,
    currentCompanyRole: data.currentCompany?.role ?? data.currentCompanyRole ?? null,
    switchableCompanyCount: Array.isArray(data.switchableCompanies) ? data.switchableCompanies.length : undefined,
    myProjectCount: Array.isArray(data.myProjects) ? data.myProjects.length : undefined,
    companyProjectCount: Array.isArray(data.companyProjects) ? data.companyProjects.length : undefined,
  }
}

function summarizeWorkspace(workspace, expectedProjectIds) {
  const data = unwrapData(workspace.body) ?? {}
  const switchableCompanies = Array.isArray(data.switchableCompanies) ? data.switchableCompanies : []
  const myProjects = Array.isArray(data.myProjects) ? data.myProjects : []
  const companyProjects = Array.isArray(data.companyProjects) ? data.companyProjects : []
  const expected = new Set(expectedProjectIds.filter(Boolean))
  return {
    currentCompanyId: data.currentCompany?.id ?? null,
    currentCompanyRole: data.currentCompany?.role ?? null,
    switchableCompanies: switchableCompanies.map((company) => ({
      id: company.id ?? null,
      role: company.role ?? null,
      active: company.active === true,
    })),
    expectedProjectVisibility: Object.fromEntries([...expected].map((projectId) => [
      projectId,
      {
        inMyProjects: myProjects.some((project) => project.id === projectId),
        inCompanyProjects: companyProjects.some((project) => project.id === projectId),
      },
    ])),
    counts: {
      myProjects: myProjects.length,
      companyProjects: companyProjects.length,
      switchableCompanies: switchableCompanies.length,
    },
  }
}

async function request({ url, method = 'GET', token, companyId, body, timeoutMs = 15000 }) {
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
      parsed = { rawTextPreview: text.slice(0, 300) }
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

async function login(apiBase, username, password) {
  const result = await request({
    url: joinApiPath(apiBase, '/api/auth/login'),
    method: 'POST',
    body: { username, password },
    timeoutMs: 30000,
  })
  const token = result.body?.data?.token
  if (!token) {
    throw new Error(`Login failed with HTTP ${result.status}`)
  }
  return { token, result }
}

async function writeJson(path, payload) {
  assertNoSecretLikeText(payload)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function main() {
  const envFile = resolve(argValue('--env-file', '.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env'))
  const output = argValue('--output', '')
  const env = parseEnv(await readFile(envFile, 'utf8'))
  const apiBase = requireEnv(env, 'V14241_STAGING_API_BASE_URL')
  const username = requireEnv(env, 'V14241_STAGING_TEST_USER_EMAIL_REF')
  const password = requireEnv(env, 'V14241_STAGING_TEST_USER_PASSWORD_REF')
  const companyId = requireEnv(env, 'V14241_STAGING_COMPANY_ID')
  const projectId = requireEnv(env, 'V14241_STAGING_PROJECT_ID')
  const largeProjectId = requireEnv(env, 'V14241_STAGING_REAL_UAT_05_TARGET_REFS_LARGE_PROJECT_REF')

  const { token, result: loginResult } = await login(apiBase, username, password)
  const workspace = await request({
    url: joinApiPath(apiBase, '/api/workspace'),
    token,
    companyId,
    timeoutMs: 20000,
  })
  const standardProject = await request({
    url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(projectId)}`),
    token,
    companyId,
    timeoutMs: 15000,
  })
  const largeProject = await request({
    url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(largeProjectId)}`),
    token,
    companyId,
    timeoutMs: 15000,
  })
  const standardTasks = await request({
    url: joinApiPath(apiBase, `/api/tasks?projectId=${encodeURIComponent(projectId)}&surface=task_list&acceptance_impact=false`),
    token,
    companyId,
    timeoutMs: 20000,
  })
  const largeTasks = await request({
    url: joinApiPath(apiBase, `/api/tasks?projectId=${encodeURIComponent(largeProjectId)}&surface=task_list&acceptance_impact=false`),
    token,
    companyId,
    timeoutMs: 20000,
  })
  const criticalPath = await request({
    url: joinApiPath(apiBase, `/api/projects/${encodeURIComponent(largeProjectId)}/critical-path`),
    token,
    companyId,
    timeoutMs: 30000,
  })

  const report = {
    schemaVersion: 'workbuddy/v14241-controlled-staging-context/v1',
    generatedAt: new Date().toISOString(),
    status: workspace.ok && standardProject.ok && largeProject.ok && Array.isArray(unwrapData(largeTasks.body)) && unwrapData(largeTasks.body).length > 0
      ? 'pass'
      : 'blocked',
    environment: 'controlled-staging-local',
    envFile,
    apiBaseRef: 'env://.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env#V14241_STAGING_API_BASE_URL',
    rawSecretsWritten: false,
    targetRefs: {
      companyId,
      projectId,
      largeProjectId,
    },
    checks: {
      login: {
        ok: loginResult.ok,
        status: loginResult.status,
        elapsedMs: loginResult.elapsedMs,
        bodySummary: summarizeBody(loginResult.body),
      },
      workspace: {
        ok: workspace.ok,
        status: workspace.status,
        elapsedMs: workspace.elapsedMs,
        bodySummary: summarizeBody(workspace.body),
        visibility: summarizeWorkspace(workspace, [projectId, largeProjectId]),
      },
      standardProject: {
        ok: standardProject.ok,
        status: standardProject.status,
        elapsedMs: standardProject.elapsedMs,
        bodySummary: summarizeBody(standardProject.body),
      },
      largeProject: {
        ok: largeProject.ok,
        status: largeProject.status,
        elapsedMs: largeProject.elapsedMs,
        bodySummary: summarizeBody(largeProject.body),
      },
      standardTasks: {
        ok: standardTasks.ok,
        status: standardTasks.status,
        elapsedMs: standardTasks.elapsedMs,
        bodySummary: summarizeBody(standardTasks.body),
      },
      largeTasks: {
        ok: largeTasks.ok,
        status: largeTasks.status,
        elapsedMs: largeTasks.elapsedMs,
        bodySummary: summarizeBody(largeTasks.body),
      },
      criticalPath: {
        ok: criticalPath.ok,
        status: criticalPath.status,
        elapsedMs: criticalPath.elapsedMs,
        bodySummary: summarizeBody(criticalPath.body),
      },
    },
    mutationBoundary: 'Read-only controlled staging context probe; no task, dependency, project, publication, rollback, or cleanup mutation executed.',
  }

  if (output) {
    await writeJson(resolve(output), report)
  }

  console.log(JSON.stringify({
    status: report.status,
    checks: Object.fromEntries(Object.entries(report.checks).map(([key, value]) => [key, {
      ok: value.ok,
      status: value.status,
      elapsedMs: value.elapsedMs,
      bodySummary: value.bodySummary,
    }])),
    output: output || null,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
