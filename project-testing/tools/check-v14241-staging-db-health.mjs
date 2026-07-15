#!/usr/bin/env node

import { lookup } from 'node:dns/promises'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import pg from 'pg'

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

function projectRefFromSupabaseUrl(value) {
  try {
    const host = new URL(value).hostname
    return host.match(/^([^.]+)\.supabase\.co$/)?.[1] ?? null
  } catch {
    return null
  }
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

function redactSecretLikeText(value) {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/[^@]+@/gi, 'postgres://<redacted>@')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<redacted-jwt>')
    .slice(0, 300)
}

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/[^<]|password\s*[=:]|service[_-]?role/i.test(text)) {
    throw new Error('refusing_to_write_staging_db_health_report_with_secret_like_text')
  }
}

async function fetchWithTimer(url, options = {}, timeoutMs = 15000) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const text = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      bodyPreview: redactSecretLikeText(text),
      headers: {
        'cf-ray': response.headers.get('cf-ray'),
        'sb-request-id': response.headers.get('sb-request-id'),
        server: response.headers.get('server'),
      },
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      error: redactSecretLikeText(error instanceof Error ? error.message : String(error)),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function probePgConnection(connectionString, timeoutMs = 15000) {
  if (!connectionString) {
    return { ok: false, status: 'missing_connection_string' }
  }

  const started = Date.now()
  const parsed = new URL(connectionString)
  parsed.searchParams.delete('sslmode')
  const client = new pg.Client({
    connectionString: parsed.toString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
  })

  try {
    await client.connect()
    const result = await client.query('select current_user, current_database(), now() as server_time')
    return {
      ok: true,
      status: 'connected',
      elapsedMs: Date.now() - started,
      host: parsed.hostname,
      port: parsed.port || null,
      userClass: parsed.username ? 'configured' : 'missing',
      rows: result.rows.map((row) => ({
        current_user: row.current_user,
        current_database: row.current_database,
        server_time: row.server_time,
      })),
    }
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      elapsedMs: Date.now() - started,
      host: parsed.hostname,
      port: parsed.port || null,
      userClass: parsed.username ? 'configured' : 'missing',
      error: redactSecretLikeText(error instanceof Error ? error.message : String(error)),
      code: error?.code ?? null,
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function main() {
  const envFile = resolve(argValue('--env-file', 'deploy/env/staging.env'))
  const output = argValue('--output', '')
  const env = parseEnv(await readFile(envFile, 'utf8'))

  const supabaseUrl = env.SUPABASE_URL || ''
  const projectRef = projectRefFromSupabaseUrl(supabaseUrl)
  const restHost = hostFromUrl(supabaseUrl)
  const dbConnectionString = env.DB_CONNECTION_STRING || env.SUPABASE_MIGRATION_URL || ''
  const dbHost = hostFromUrl(dbConnectionString) || (projectRef ? `db.${projectRef}.supabase.co` : null)

  const restNoKey = supabaseUrl
    ? await fetchWithTimer(`${supabaseUrl}/rest/v1/projects?select=id&limit=1`)
    : { ok: false, status: 'missing_supabase_url' }
  const restInvalidKey = supabaseUrl
    ? await fetchWithTimer(`${supabaseUrl}/rest/v1/projects?select=id&limit=1`, {
      headers: {
        apikey: 'sb_publishable_invalid',
        Authorization: 'Bearer sb_publishable_invalid',
      },
    })
    : { ok: false, status: 'missing_supabase_url' }
  const restAnonKey = supabaseUrl
    ? await fetchWithTimer(`${supabaseUrl}/rest/v1/projects?select=id&limit=1`, {
      headers: env.SUPABASE_ANON_KEY ? {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      } : {},
    })
    : { ok: false, status: 'missing_supabase_url' }
  const restServiceKey = supabaseUrl
    ? await fetchWithTimer(`${supabaseUrl}/rest/v1/projects?select=id&limit=1`, {
      headers: env.SUPABASE_SERVICE_KEY ? {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      } : {},
    })
    : { ok: false, status: 'missing_supabase_url' }
  const authAnonKey = supabaseUrl
    ? await fetchWithTimer(`${supabaseUrl}/auth/v1/health`, {
      headers: env.SUPABASE_ANON_KEY ? {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      } : {},
    }, 10000)
    : { ok: false, status: 'missing_supabase_url' }
  const postgres = await probePgConnection(dbConnectionString, 15000)

  const authenticatedTimeout = [restAnonKey, restServiceKey, authAnonKey].some((probe) => (
    typeof probe.error === 'string' && probe.error.toLowerCase().includes('timeout')
  ))
  const gatewayReachable = restNoKey.status === 401 && restInvalidKey.status === 401
  const status = gatewayReachable && postgres.ok && !authenticatedTimeout
    ? 'pass'
    : 'blocked'

  const report = {
    schemaVersion: 'workbuddy/v14241-staging-db-health/v1',
    generatedAt: new Date().toISOString(),
    status,
    environment: 'controlled-staging-local',
    envFile,
    safeToShare: true,
    rawSecretsWritten: false,
    projectRef,
    hosts: {
      restHost,
      dbHost,
    },
    dns: {
      restHost: restHost ? await lookup(restHost, { all: true }).catch((error) => ({ error: redactSecretLikeText(error.message) })) : null,
      dbHost: dbHost ? await lookup(dbHost, { all: true }).catch((error) => ({ error: redactSecretLikeText(error.message) })) : null,
    },
    checks: {
      restNoKey,
      restInvalidKey,
      restAnonKey,
      restServiceKey,
      authAnonKey,
      postgres,
    },
    diagnosis: gatewayReachable && authenticatedTimeout
      ? 'supabase_gateway_reachable_but_authenticated_service_requests_timeout'
      : !gatewayReachable
        ? 'supabase_gateway_not_reachable_as_expected'
        : !postgres.ok
          ? 'postgres_connection_failed'
          : 'staging_db_health_passed',
    mutationBoundary: 'Read-only staging connectivity probe; no application data, schema, publication, rollback, or cleanup mutation executed.',
  }

  assertNoSecretLikeText(report)
  if (output) {
    const outputPath = resolve(output)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  console.log(JSON.stringify({
    status: report.status,
    projectRef: report.projectRef,
    diagnosis: report.diagnosis,
    hosts: report.hosts,
    output: output || null,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
