import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'

function loadEnv(envPath) {
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function resolveDbHost(supabaseUrl) {
  const hostname = new URL(supabaseUrl).hostname
  const projectRef = hostname.split('.')[0]
  return `db.${projectRef}.supabase.co`
}

async function main() {
  const envPath = path.resolve(process.cwd(), 'server/.env')
  loadEnv(envPath)

  if (!process.env.SUPABASE_URL || !process.env.DB_PASSWORD) {
    throw new Error('Missing SUPABASE_URL or DB_PASSWORD in server/.env')
  }

  const pool = new Pool({
    host: resolveDbHost(process.env.SUPABASE_URL),
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 1,
  })

  try {
    const { rows } = await pool.query(`
      with table_status as (
        select
          c.relname as tablename,
          c.relrowsecurity as rowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
      ),
      policy_counts as (
        select
          tablename,
          count(*)::int as policy_count
        from pg_policies
        where schemaname = 'public'
        group by tablename
      )
      select
        t.tablename,
        t.rowsecurity,
        coalesce(p.policy_count, 0) as policy_count
      from table_status t
      left join policy_counts p on p.tablename = t.tablename
      order by t.tablename
    `)

    const disabledTables = rows.filter((row) => !row.rowsecurity)
    const policyOnlyTables = rows.filter((row) => row.rowsecurity && row.policy_count > 0)

    console.log('=== Public Table RLS Audit ===')
    console.log(`Total public tables: ${rows.length}`)
    console.log(`RLS disabled tables: ${disabledTables.length}`)
    console.log(`RLS enabled tables with policies: ${policyOnlyTables.length}`)

    if (disabledTables.length > 0) {
      console.log('\nDisabled tables:')
      for (const row of disabledTables) {
        console.log(`- ${row.tablename}`)
      }
      process.exitCode = 1
      return
    }

    console.log('\nAll public tables have RLS enabled.')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
