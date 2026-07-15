import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'

export const TENANT_POLICY_PATTERN = /\b(company_id|project_id|project_members|company_members|auth\.uid\s*\(|current_setting\s*\()/i

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
          c.relrowsecurity as rowsecurity,
          c.relforcerowsecurity as force_rowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
      ),
      policies as (
        select
          tablename,
          count(*)::int as policy_count,
          string_agg(
            coalesce(qual, '') || ' ' || coalesce(with_check, ''),
            E'\n'
            order by policyname
          ) as policy_definition
        from pg_policies
        where schemaname = 'public'
        group by tablename
      )
      select
        t.tablename,
        t.rowsecurity,
        t.force_rowsecurity,
        coalesce(p.policy_count, 0) as policy_count,
        coalesce(p.policy_definition, '') as policy_definition
      from table_status t
      left join policies p on p.tablename = t.tablename
      order by t.tablename
    `)

    const audit = evaluateRlsAuditRows(rows)

    console.log('=== Public Table RLS Audit ===')
    console.log(`Total public tables: ${rows.length}`)
    console.log(`RLS disabled tables: ${audit.disabledTables.length}`)
    console.log(`RLS enabled tables without FORCE RLS: ${audit.forceMissingTables.length}`)
    console.log(`RLS enabled tables with policies: ${audit.policyTables.length}`)
    console.log(`RLS enabled tables without policies: ${audit.tablesWithoutPolicies.length}`)
    console.log(`RLS policy tables without tenant predicate: ${audit.tablesWithoutTenantPredicate.length}`)

    if (audit.disabledTables.length > 0) {
      console.log('\nDisabled tables:')
      for (const row of audit.disabledTables) {
        console.log(`- ${row.tablename}`)
      }
    }

    if (audit.forceMissingTables.length > 0) {
      console.log('\nRLS enabled but not forced tables:')
      for (const row of audit.forceMissingTables) {
        console.log(`- ${row.tablename}`)
      }
    }

    if (audit.tablesWithoutPolicies.length > 0) {
      console.log('\nRLS enabled but policy-less tables:')
      for (const row of audit.tablesWithoutPolicies) {
        console.log(`- ${row.tablename}`)
      }
    }

    if (audit.tablesWithoutTenantPredicate.length > 0) {
      console.log('\nPolicy tables without an obvious tenant predicate:')
      for (const row of audit.tablesWithoutTenantPredicate) {
        console.log(`- ${row.tablename}`)
      }
    }

    if (audit.hasFailures) {
      process.exitCode = 1
      return
    }

    console.log('\nAll public tables have RLS, policies, and tenant predicates.')
  } finally {
    await pool.end()
  }
}

export function evaluateRlsAuditRows(rows) {
  const disabledTables = rows.filter((row) => !row.rowsecurity)
  const forceMissingTables = rows.filter((row) => row.rowsecurity && !row.force_rowsecurity)
  const policyTables = rows.filter((row) => row.rowsecurity && Number(row.policy_count ?? 0) > 0)
  const tablesWithoutPolicies = rows.filter((row) => row.rowsecurity && Number(row.policy_count ?? 0) === 0)
  const tablesWithoutTenantPredicate = policyTables.filter((row) => (
    !TENANT_POLICY_PATTERN.test(String(row.policy_definition ?? ''))
  ))

  return {
    disabledTables,
    forceMissingTables,
    policyTables,
    tablesWithoutPolicies,
    tablesWithoutTenantPredicate,
    hasFailures: disabledTables.length > 0
      || forceMissingTables.length > 0
      || tablesWithoutPolicies.length > 0
      || tablesWithoutTenantPredicate.length > 0,
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
