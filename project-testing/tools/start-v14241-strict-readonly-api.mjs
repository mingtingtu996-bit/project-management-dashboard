#!/usr/bin/env node

import { openSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultEnvFile = join(repoRoot, 'deploy', 'env', 'staging.env')
const defaultLogDir = join(repoRoot, '.tmp')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
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

function readEnvFile(path) {
  const env = {}
  for (const line of readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
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

const envFile = resolve(argValue('--env-file', defaultEnvFile))
const port = String(argValue('--port', '3107'))
const host = String(argValue('--host', '127.0.0.1'))
const logDir = resolve(argValue('--log-dir', defaultLogDir))
mkdirSync(logDir, { recursive: true })

const baseEnv = {
  ...process.env,
  ...readEnvFile(envFile),
  PORT: port,
  HOST: host,
  NODE_ENV: 'production',
  SKIP_SCHEDULER_BOOT: 'true',
  SKIP_DATABASE_VALIDATE: 'true',
  SKIP_REFERENCE_DATA_BOOTSTRAP: 'true',
  SKIP_READ_MODEL_WARMUP: 'true',
  AUTH_ALLOW_DEV_FALLBACK_USER: 'false',
  AUTH_ALLOW_TEST_FALLBACK_USER: 'false',
  DISABLE_PERMISSION_SYSTEM: 'false',
  API_RATE_LIMIT_MAX: '10000',
  AUTH_RATE_LIMIT_MAX: '10000',
}

delete baseEnv.Path
delete baseEnv.PATH
baseEnv.Path = process.env.Path ?? process.env.PATH ?? ''

const env = dedupeWindowsEnv(baseEnv)

const stdoutPath = join(logDir, `v14241-strict-readonly-api-${port}.out.log`)
const stderrPath = join(logDir, `v14241-strict-readonly-api-${port}.err.log`)
const pidPath = join(logDir, `v14241-strict-readonly-api-${port}.pid`)
const stdout = openSync(stdoutPath, 'a')
const stderr = openSync(stderrPath, 'a')
const child = spawn('cmd.exe', ['/d', '/c', 'npm.cmd', 'run', 'dev', '--workspace=server'], {
  cwd: repoRoot,
  env,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', stdout, stderr],
})

child.unref()
writeFileSync(pidPath, `${child.pid}\n`, 'utf8')
console.log(JSON.stringify({
  status: 'started',
  pid: child.pid,
  baseUrl: `http://${host}:${port}`,
  pidFile: pidPath,
  stdout: stdoutPath,
  stderr: stderrPath,
  mutationBoundary: 'server startup only; scheduler, reference bootstrap, database validation, and read-model warmup disabled',
  strictAuth: {
    nodeEnv: env.NODE_ENV,
    disablePermissionSystem: env.DISABLE_PERMISSION_SYSTEM,
    allowDevFallbackUser: env.AUTH_ALLOW_DEV_FALLBACK_USER,
    allowTestFallbackUser: env.AUTH_ALLOW_TEST_FALLBACK_USER,
  },
}, null, 2))
