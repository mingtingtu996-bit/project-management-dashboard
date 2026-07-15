#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import jwt from 'jsonwebtoken'

function parseEnvFile(path) {
  const env = {}
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    shell: false,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

const releaseDir = 'project-testing/reports/release-v1.4.24-20260702-125254'
const envFile = 'deploy/env/staging.env'
const envFilePath = resolve(envFile)
const baseUrl = 'http://127.0.0.1:3106'
const projectId = 'cc32d88a-a139-409d-9a3e-27b8f093b8db'
const planId = '38c8d75b-4e3c-44f2-98c1-1383d5e06657'
const envFileValues = parseEnvFile(envFilePath)
if (!envFileValues.JWT_SECRET) throw new Error(`${envFile} is missing JWT_SECRET`)

const authToken = jwt.sign({
  userId: '9800b1a4-7772-4ea0-b21d-308bf3318770',
  username: 'admin',
  role: 'owner',
  globalRole: 'company_admin',
  tokenVersion: 0,
}, envFileValues.JWT_SECRET, {
  expiresIn: '2h',
  issuer: 'construction-management-system',
  audience: 'api-users',
})

const childEnv = {
  ...process.env,
  DOTENV_CONFIG_PATH: envFilePath,
  WORKBUDDY_LIVE_AUTH_TOKEN: authToken,
}

const l08 = run('cmd.exe', [
  '/d',
  '/c',
  'npm.cmd',
  'run',
  'diagnose:acceptance-status-concurrency-live',
  '--workspace=server',
  '--',
  '--allow-write',
  `--base-url=${baseUrl}`,
  `--project-id=${projectId}`,
  '--create-disposable-plan',
  `--disposable-plan-evidence-file=${releaseDir}/c18-l08-disposable-plan-evidence.json`,
  '--diagnostic-run-id=v1424-c18-l08-20260704-2320',
  `--output-file=${releaseDir}/c18-l08-acceptance-status-concurrency-live.json`,
], childEnv)

const l09 = run('cmd.exe', [
  '/d',
  '/c',
  'npm.cmd',
  'run',
  'diagnose:wizard-commit-live',
  '--workspace=server',
  '--',
  '--allow-write',
  `--base-url=${baseUrl}`,
  `--project-id=${projectId}`,
  '--create-disposable-draft',
  `--payload-file=${releaseDir}/c18-l09-wizard-payload.json`,
  '--create-failure-injection-evidence',
  `--failure-injection-evidence-file=${releaseDir}/c18-l09-failure-injection-evidence.json`,
  '--diagnostic-run-id=v1424-c18-l09-20260704-2320',
  `--output-file=${releaseDir}/c18-l09-wizard-commit-live.json`,
], childEnv)

if (l08 !== 0 || l09 !== 0) {
  console.error(JSON.stringify({ status: 'fail', l08ExitCode: l08, l09ExitCode: l09 }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ status: 'pass', l08ExitCode: l08, l09ExitCode: l09 }, null, 2))
