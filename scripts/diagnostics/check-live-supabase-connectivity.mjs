import { lookup } from 'node:dns/promises'
import path from 'node:path'
import process from 'node:process'

import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') })

const supabaseUrl = process.env.SUPABASE_URL || ''
const anonKey = process.env.SUPABASE_ANON_KEY || ''
const dbPassword = process.env.DB_PASSWORD || ''

if (!supabaseUrl) {
  console.error(JSON.stringify({ error: 'Missing SUPABASE_URL in server/.env' }, null, 2))
  process.exit(1)
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const dbHost = `db.${projectRef}.supabase.co`

async function fetchWithTimer(url, options = {}, timeoutMs = 15000) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    const text = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      bodyPreview: text.slice(0, 300),
      headers: {
        'cf-ray': response.headers.get('cf-ray'),
        'sb-request-id': response.headers.get('sb-request-id'),
        server: response.headers.get('server'),
      },
    }
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function probePostgres(host, port, user, password, timeoutMs = 15000) {
  const started = Date.now()
  const client = new pg.Client({
    host,
    port,
    database: 'postgres',
    user,
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: timeoutMs,
  })

  try {
    await client.connect()
    const result = await client.query('select current_user as current_user')
    return {
      ok: true,
      elapsedMs: Date.now() - started,
      rows: result.rows,
    }
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function main() {
  const restHost = new URL(supabaseUrl).hostname
  const restNoKey = await fetchWithTimer(`${supabaseUrl}/rest/v1/projects?select=id&limit=1`)
  const restInvalidKey = await fetchWithTimer(
    `${supabaseUrl}/rest/v1/projects?select=id&limit=1`,
    {
      headers: {
        apikey: 'sb_publishable_invalid',
        Authorization: 'Bearer sb_publishable_invalid',
      },
    },
  )
  const restRealKey = await fetchWithTimer(
    `${supabaseUrl}/rest/v1/projects?select=id&limit=1`,
    {
      headers: {
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
    },
    45000,
  )

  const dns = {
    restHost: await lookup(restHost, { all: true }).catch(() => []),
    dbHost: await lookup(dbHost, { all: true }).catch(() => []),
  }

  const postgresDirect = dbPassword
    ? await probePostgres(dbHost, 5432, 'postgres', dbPassword, 20000)
    : { ok: false, error: 'Missing DB_PASSWORD' }

  const sessionPooler = dbPassword
    ? await probePostgres(
      'aws-0-ap-southeast-1.pooler.supabase.com',
      5432,
      `postgres.${projectRef}`,
      dbPassword,
      10000,
    )
    : { ok: false, error: 'Missing DB_PASSWORD' }

  const summary = {
    checkedAt: new Date().toISOString(),
    projectRef,
    supabaseUrl,
    dns,
    restNoKey,
    restInvalidKey,
    restRealKey,
    postgresDirect,
    sessionPooler,
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exit(1)
})
