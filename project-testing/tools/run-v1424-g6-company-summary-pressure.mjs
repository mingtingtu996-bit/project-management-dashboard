#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { openSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

import { resolvePublicHttpsOrigin } from '../../scripts/public-origin.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_RELEASE_DIR = path.join(REPO_ROOT, 'project-testing/reports/release-v1.4.24-20260702-125254')

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    releaseDir: DEFAULT_RELEASE_DIR,
    envFile: path.join(REPO_ROOT, 'deploy/env/staging.env'),
    baseUrl: 'http://127.0.0.1:3106',
    port: '3106',
    host: '127.0.0.1',
    environment: 'staging',
    projectCounts: '50,100,500',
    warmIterations: '20',
    forcePooler: false,
    timeoutMs: 45000,
  }

  const nextValue = (argv, index, arg) => {
    const equalsIndex = arg.indexOf('=')
    if (equalsIndex > 0) return [arg.slice(equalsIndex + 1), index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    return [value, index + 1]
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const name = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
    if (name === '--release-dir') {
      const [value, nextIndex] = nextValue(argv, index, arg)
      args.releaseDir = path.resolve(value)
      index = nextIndex
    } else if (name === '--env-file') {
      const [value, nextIndex] = nextValue(argv, index, arg)
      args.envFile = path.resolve(value)
      index = nextIndex
    } else if (name === '--base-url') {
      const [value, nextIndex] = nextValue(argv, index, arg)
      args.baseUrl = value
      index = nextIndex
    } else if (name === '--port') {
      const [value, nextIndex] = nextValue(argv, index, arg)
      args.port = value
      index = nextIndex
    } else if (name === '--environment') {
      const [value, nextIndex] = nextValue(argv, index, arg)
      args.environment = value
      index = nextIndex
    } else if (name === '--project-counts') {
      const [value, nextIndex] = nextValue(argv, index, arg)
      args.projectCounts = value
      index = nextIndex
    } else if (name === '--warm-iterations') {
      const [value, nextIndex] = nextValue(argv, index, arg)
      args.warmIterations = value
      index = nextIndex
    } else if (name === '--timeout-ms') {
      const [value, nextIndex] = nextValue(argv, index, arg)
      args.timeoutMs = Number(value)
      index = nextIndex
    } else if (name === '--pooler') {
      args.forcePooler = true
    } else if (name === '--help' || name === '-h') {
      console.log('Usage: node project-testing/tools/run-v1424-g6-company-summary-pressure.mjs [--release-dir <dir>] [--env-file deploy/env/staging.env]')
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function parseDotEnv(filePath) {
  const env = {}
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) env[key] = value
  }
  return env
}

function dedupeWindowsEnv(source) {
  const byLowerKey = new Map()
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    const lower = key.toLowerCase()
    if (lower === 'path') {
      byLowerKey.set('path', ['Path', value])
      continue
    }
    if (!byLowerKey.has(lower)) byLowerKey.set(lower, [key, value])
  }
  return Object.fromEntries([...byLowerKey.values()])
}

function toSupabasePoolerUrl(value, env) {
  if (!value) return value
  const url = new URL(value)
  const match = url.hostname.match(/^db\.([^.]+)\.supabase\.co$/)
  if (!match) return value
  const projectRef = match[1]
  url.hostname = env.SUPABASE_POOLER_HOST || 'aws-0-ap-southeast-1.pooler.supabase.com'
  url.port = env.SUPABASE_POOLER_PORT || '6543'
  if (url.username === 'postgres') url.username = `postgres.${projectRef}`
  url.searchParams.set('sslmode', 'require')
  return url.toString()
}

function buildServerEnv(args, fileEnv) {
  const env = dedupeWindowsEnv({
    ...process.env,
    ...fileEnv,
    PORT: args.port,
    HOST: args.host,
    SKIP_SCHEDULER_BOOT: 'true',
    SKIP_DATABASE_VALIDATE: 'true',
    SKIP_REFERENCE_DATA_BOOTSTRAP: 'true',
    SKIP_READ_MODEL_WARMUP: 'true',
    AUTH_ALLOW_DEV_FALLBACK_USER: 'false',
  })

  if (args.forcePooler) {
    for (const key of ['DB_CONNECTION_STRING', 'SUPABASE_MIGRATION_URL']) {
      try {
        env[key] = toSupabasePoolerUrl(env[key], env)
      } catch (error) {
        console.warn(`Could not normalize ${key} for Supabase pooler`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  return env
}

function createSupabaseClient(fileEnv) {
  const supabaseUrl = fileEnv.SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = fileEnv.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required to prepare the G6 staging test account.')
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function ensureStagingUser(fileEnv) {
  const username = fileEnv.TEST_USERNAME
  const password = fileEnv.TEST_USER_PASSWORD
  const email = fileEnv.TEST_USER_EMAIL || `${username}@workbuddy.test`
  if (!username || !password) {
    throw new Error('TEST_USERNAME and TEST_USER_PASSWORD are required in the env file for G6 staging auth.')
  }

  const client = createSupabaseClient(fileEnv)
  const passwordHash = await bcrypt.hash(password, 10)
  const existing = await client
    .from('users')
    .select('id, username')
    .eq('username', username)
    .limit(1)
    .maybeSingle()
  if (existing.error) {
    throw new Error(`Failed to inspect staging test user: ${existing.error.message}`)
  }

  const payload = {
    username,
    password_hash: passwordHash,
    display_name: fileEnv.TEST_USER_DISPLAY_NAME || 'v1.4.24 G6 Staging Tester',
    email,
    global_role: 'company_admin',
    status: 'active',
    deleted_at: null,
  }

  if (existing.data?.id) {
    const update = await client
      .from('users')
      .update(payload)
      .eq('id', existing.data.id)
    if (update.error) {
      throw new Error(`Failed to update staging test user: ${update.error.message}`)
    }
    return { userId: existing.data.id, username, mode: 'updated' }
  }

  const insert = await client
    .from('users')
    .insert(payload)
    .select('id')
    .single()
  if (insert.error || !insert.data?.id) {
    throw new Error(`Failed to create staging test user: ${insert.error?.message || 'missing returned id'}`)
  }
  return { userId: insert.data.id, username, mode: 'created' }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHealth(baseUrl, timeoutMs) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/readyz`)
      if (response.ok) return await response.json().catch(() => ({ ok: true }))
      lastError = new Error(`health returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(500)
  }
  throw new Error(`API health did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function login(baseUrl, fileEnv) {
  const username = fileEnv.TEST_USERNAME
  const password = fileEnv.TEST_USER_PASSWORD
  if (!username || !password) {
    throw new Error('TEST_USERNAME and TEST_USER_PASSWORD are required in the env file for G6 staging auth.')
  }
  const publicOrigin = resolvePublicHttpsOrigin({
    apiBaseUrl: baseUrl,
    publicOrigin: fileEnv.PUBLIC_HTTPS_ORIGIN,
  })

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: publicOrigin },
    body: JSON.stringify({ username, password }),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message || payload?.message || text || `login failed with ${response.status}`)
  }
  const data = payload?.data ?? payload
  if (!data?.token) throw new Error(`Login did not return a token for ${username}`)
  return { token: data.token, user: data.user ?? null, username }
}

async function runNode(commandArgs, options = {}) {
  const startedAt = new Date().toISOString()
  const child = spawn(process.execPath, commandArgs, {
    cwd: REPO_ROOT,
    env: options.env || process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  const exitCode = await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)))
  return {
    command: `node ${commandArgs.join(' ')}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode,
    stdout,
    stderr,
  }
}

async function writeText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, text, 'utf8')
}

function commandResultFromRun(run, params) {
  return {
    id: params.id,
    gate: 'G6',
    command: run.command,
    cwd: REPO_ROOT,
    environment: params.environment,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    exitCode: run.exitCode,
    status: run.exitCode === 0 ? 'pass' : 'fail',
    stdoutPath: params.stdoutPath,
    stderrPath: params.stderrPath,
    summary: params.summary,
    mutationBoundary: params.mutationBoundary,
    evidencePaths: params.evidencePaths,
  }
}

async function upsertCommandResult(releaseDir, row) {
  const filePath = path.join(releaseDir, 'v1424-command-results.normalized.json')
  const current = JSON.parse(await readFile(filePath, 'utf8'))
  const filtered = current.filter((item) => item.id !== row.id)
  filtered.push(row)
  await writeFile(filePath, `${JSON.stringify(filtered, null, 2)}\n`, 'utf8')
}

async function main() {
  const args = parseArgs()
  const releaseDir = args.releaseDir
  const logsDir = path.join(releaseDir, 'logs')
  await mkdir(logsDir, { recursive: true })
  await mkdir(path.join(REPO_ROOT, '.tmp'), { recursive: true })
  const fileEnv = parseDotEnv(args.envFile)
  const serverEnv = buildServerEnv(args, fileEnv)
  const preparedUser = await ensureStagingUser(fileEnv)

  const diagnosticRunId = `v1424-g6-${new Date().toISOString().replace(/[:.]/g, '-')}`
  const serverOut = path.join(REPO_ROOT, '.tmp/v1424-g6-api-3106.out.log')
  const serverErr = path.join(REPO_ROOT, '.tmp/v1424-g6-api-3106.err.log')
  await rm(serverOut, { force: true }).catch(() => undefined)
  await rm(serverErr, { force: true }).catch(() => undefined)
  const stdoutFd = openSync(serverOut, 'w')
  const stderrFd = openSync(serverErr, 'w')
  const server = spawn(process.execPath, ['server/dist/index.js'], {
    cwd: REPO_ROOT,
    env: serverEnv,
    stdio: ['ignore', stdoutFd, stderrFd],
    windowsHide: true,
  })

  let token = null
  try {
    await waitForHealth(args.baseUrl, args.timeoutMs)
    const loginResult = await login(args.baseUrl, fileEnv)
    token = loginResult.token

    const routeEvidenceFile = path.join(releaseDir, 'v1424-pressure-query-log-evidence.json')
    const routeRun = await runNode([
      'project-testing/tools/capture-c18-l14-company-summary-route-evidence.mjs',
      '--env-file', path.relative(REPO_ROOT, args.envFile),
      '--base-url', args.baseUrl,
      '--auth-token-env', 'WORKBUDDY_LIVE_AUTH_TOKEN',
      '--environment', args.environment,
      '--diagnostic-run-id', diagnosticRunId,
      '--project-counts', args.projectCounts,
      '--warm-iterations', args.warmIterations,
      '--server-log-file', path.relative(REPO_ROOT, serverOut),
      '--output-file', path.relative(REPO_ROOT, routeEvidenceFile),
    ], {
      env: {
        ...process.env,
        WORKBUDDY_LIVE_AUTH_TOKEN: token,
      },
    })
    await writeText(path.join(logsDir, 'G6-company-summary-route-evidence.stdout.txt'), routeRun.stdout)
    await writeText(path.join(logsDir, 'G6-company-summary-route-evidence.stderr.txt'), routeRun.stderr)
    await upsertCommandResult(releaseDir, commandResultFromRun(routeRun, {
      id: 'G6-company-summary-route-evidence',
      environment: args.environment,
      stdoutPath: path.relative(REPO_ROOT, path.join(logsDir, 'G6-company-summary-route-evidence.stdout.txt')).replaceAll(path.sep, '/'),
      stderrPath: path.relative(REPO_ROOT, path.join(logsDir, 'G6-company-summary-route-evidence.stderr.txt')).replaceAll(path.sep, '/'),
      summary: routeRun.exitCode === 0
        ? `staging company-summary route/query-log evidence written for project counts ${args.projectCounts}`
        : 'staging company-summary route/query-log evidence failed',
      mutationBoundary: 'authorized staging disposable company/project/snapshot write with cleanup',
      evidencePaths: [path.relative(REPO_ROOT, routeEvidenceFile).replaceAll(path.sep, '/')],
    }))
    if (routeRun.exitCode !== 0) throw new Error(routeRun.stderr || routeRun.stdout || 'route evidence failed')

    const pressureEvidenceFile = path.join(releaseDir, 'performance-pressure-evidence.json')
    const profileRun = await runNode([
      'node_modules/tsx/dist/cli.mjs',
      '-r',
      'dotenv/config',
      'server/src/scripts/profile-company-summary.ts',
      '--diagnostic-run-id=' + diagnosticRunId,
      '--route-evidence-file=' + path.relative(REPO_ROOT, routeEvidenceFile),
      '--require-live-evidence',
      '--output-file=' + path.relative(REPO_ROOT, pressureEvidenceFile),
    ])
    await writeText(path.join(logsDir, 'G6-company-summary-pressure-profile.stdout.txt'), profileRun.stdout)
    await writeText(path.join(logsDir, 'G6-company-summary-pressure-profile.stderr.txt'), profileRun.stderr)
    await upsertCommandResult(releaseDir, commandResultFromRun(profileRun, {
      id: 'G6-company-summary-pressure-profile',
      environment: 'local_static_assessing_staging_route_evidence',
      stdoutPath: path.relative(REPO_ROOT, path.join(logsDir, 'G6-company-summary-pressure-profile.stdout.txt')).replaceAll(path.sep, '/'),
      stderrPath: path.relative(REPO_ROOT, path.join(logsDir, 'G6-company-summary-pressure-profile.stderr.txt')).replaceAll(path.sep, '/'),
      summary: profileRun.exitCode === 0
        ? 'company-summary pressure profile accepted staging route/query-log evidence'
        : 'company-summary pressure profile rejected staging route/query-log evidence',
      mutationBoundary: 'read-only assessment of archived staging route evidence',
      evidencePaths: [
        path.relative(REPO_ROOT, routeEvidenceFile).replaceAll(path.sep, '/'),
        path.relative(REPO_ROOT, pressureEvidenceFile).replaceAll(path.sep, '/'),
      ],
    }))
    if (profileRun.exitCode !== 0) throw new Error(profileRun.stderr || profileRun.stdout || 'pressure profile failed')

    console.log(JSON.stringify({
      status: 'pass',
      diagnosticRunId,
      routeEvidenceFile: path.relative(REPO_ROOT, routeEvidenceFile).replaceAll(path.sep, '/'),
      pressureEvidenceFile: path.relative(REPO_ROOT, pressureEvidenceFile).replaceAll(path.sep, '/'),
      serverLogFile: path.relative(REPO_ROOT, serverOut).replaceAll(path.sep, '/'),
      preparedUser,
    }, null, 2))
  } finally {
    if (!server.killed) {
      server.kill('SIGTERM')
      await sleep(500)
      if (!server.killed) server.kill('SIGKILL')
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
