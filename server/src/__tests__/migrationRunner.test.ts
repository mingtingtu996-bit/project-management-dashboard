import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  APPLY_MIGRATION_CHECKSUM_CONTRACT_VERSION,
  acquireMigrationAdvisoryLock,
  compareMigrationVersions,
  applyMigration,
  calculateMigrationChecksum,
  discoverMigrationFiles,
  getPendingMigrations,
  releaseMigrationAdvisoryLock,
  resolveMigrationConnectionConfig,
  resolveMigrationRuntimeConnectionConfig,
  selectMigrationsThroughVersion,
  shouldBlockUnsafeMigrationReplay,
} from '../services/migrationRunner.js'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const originalEnv = { ...process.env }

function buildHardenedCommercialTriggerAclRows() {
  const functionIdentities = [
    'public.workbuddy_initialize_company_commercial()',
    'public.workbuddy_meter_company_projects()',
  ]
  const roleNames = [
    'anon',
    'authenticated',
    'service_role',
    'workbuddy_runtime',
    'workbuddy_runtime_login',
  ]
  return functionIdentities.flatMap((functionIdentity) => (
    roleNames.map((roleName) => ({
      function_identity: functionIdentity,
      function_exists: true,
      public_can_execute: false,
      role_name: roleName,
      role_exists: true,
      role_can_execute: !['anon', 'authenticated'].includes(roleName),
    }))
  ))
}

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...originalEnv }
})

describe('migration runner contract', () => {
  it('publishes the checksum-bound apply capability version for dist consumers', () => {
    expect(APPLY_MIGRATION_CHECKSUM_CONTRACT_VERSION).toBe(1)
  })

  it('discovers canonical migration files without excluding formal rollback-status migrations', async () => {
    const migrations = await discoverMigrationFiles(resolve(serverRoot, 'migrations'))
    const filenames = migrations.map((item) => item.filename)
    const versions = migrations.map((item) => item.version)

    expect(filenames).toContain('009b_fix_delivery_issues.sql')
    expect(filenames).toContain('083_add_warning_lifecycle_to_notifications.sql')
    expect(filenames).toContain('083a_lock_down_public_rls.sql')
    expect(filenames).toContain('199_v14223_policy_template_entity_runtime_rollback_status.sql')
    expect(filenames).toContain('200_v14223_forecast_residual_overlay_runtime_rollback.sql')
    expect(filenames).toContain('201_v14223_cold_start_baseline_runtime_rollback.sql')
    expect(new Set(versions).size).toBe(versions.length)

    expect(filenames).not.toContain('037_create_task_conditions_and_obstacles_final.sql')
    expect(filenames).not.toContain('037_create_task_conditions_and_obstacles_fixed.sql')
    expect(filenames).not.toContain('038_verify_tables.sql')
    expect(filenames).not.toContain('115_rollback_project_daily_snapshot.sql')
    expect(filenames).not.toContain('009_create_warnings_table.sql.bak')

    expect(filenames.indexOf('009b_fix_delivery_issues.sql')).toBeGreaterThan(
      filenames.indexOf('009_add_job_execution_logs.sql'),
    )
    expect(filenames.indexOf('010_add_missing_tables.sql')).toBeGreaterThan(
      filenames.indexOf('009b_fix_delivery_issues.sql'),
    )
  })

  it('computes pending migrations by filename and keeps checksum deterministic', () => {
    const discovered = [
      { filename: '001_initial_schema.sql' },
      { filename: '002_add_phase1_tables.sql' },
      { filename: '003_add_task_locks_and_logs.sql' },
    ] as any

    const applied = [
      { filename: '001_initial_schema.sql' },
      { filename: '003_add_task_locks_and_logs.sql' },
    ]

    expect(getPendingMigrations(discovered, applied)).toEqual([
      { filename: '002_add_phase1_tables.sql' },
    ])

    const sql = readFileSync(resolve(serverRoot, 'migrations', '084_align_p0_contract_gaps.sql'), 'utf8')
    expect(calculateMigrationChecksum(sql)).toBe(calculateMigrationChecksum(sql))
  })

  it('keeps production RLS helper grants on the private schema without reopening public RPC access', () => {
    const runtimeSql = readFileSync(
      resolve(serverRoot, 'migrations', '312_runtime_login_rls_helper_acl.sql'),
      'utf8',
    )
    const roleSql = readFileSync(
      resolve(serverRoot, 'migrations', '313_grant_rls_helper_execute_to_runtime_roles.sql'),
      'utf8',
    )

    expect(runtimeSql).toContain('GRANT USAGE ON SCHEMA workbuddy_private TO workbuddy_runtime')
    expect(runtimeSql).toContain('GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime')
    expect(runtimeSql).not.toContain('GRANT EXECUTE ON FUNCTION public.is_active_company_member')

    expect(roleSql).toContain("to_regprocedure('workbuddy_private.is_active_company_member(uuid,text[])')")
    expect(roleSql).toContain("'anon'")
    expect(roleSql).toContain("'authenticated'")
    expect(roleSql).toContain("'service_role'")
    expect(roleSql).toContain("'workbuddy_runtime'")
    expect(roleSql).toContain("'workbuddy_runtime_login'")
    expect(roleSql).toContain("format('GRANT USAGE ON SCHEMA workbuddy_private TO %I'")
    expect(roleSql).toContain('GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO %I')
    expect(roleSql).toContain('REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM PUBLIC')
    expect(roleSql).toContain('REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM %I')
    expect(roleSql).not.toContain("format('GRANT EXECUTE ON FUNCTION %s TO %I'")
    expect(roleSql).toContain('ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS')
  })

  it('supports baseline selection and version ordering with numeric and suffixed versions', () => {
    expect(compareMigrationVersions('009', '009b')).toBeLessThan(0)
    expect(compareMigrationVersions('083a', '084')).toBeLessThan(0)
    expect(compareMigrationVersions('084', '084')).toBe(0)

    const discovered = [
      { filename: '009_add_job_execution_logs.sql', version: '009' },
      { filename: '009b_fix_delivery_issues.sql', version: '009b' },
      { filename: '010_add_missing_tables.sql', version: '010' },
      { filename: '083a_lock_down_public_rls.sql', version: '083a' },
      { filename: '084_align_p0_contract_gaps.sql', version: '084' },
      { filename: '085_reconcile_live_schema_after_baseline_adoption.sql', version: '085' },
    ] as any

    expect(selectMigrationsThroughVersion(discovered, '084').map((item) => item.filename)).toEqual([
      '009_add_job_execution_logs.sql',
      '009b_fix_delivery_issues.sql',
      '010_add_missing_tables.sql',
      '083a_lock_down_public_rls.sql',
      '084_align_p0_contract_gaps.sql',
    ])
  })

  it('blocks blind replay when ledger is empty but baseline tables already exist', () => {
    expect(shouldBlockUnsafeMigrationReplay([], ['projects', 'tasks'])).toBe(true)
    expect(shouldBlockUnsafeMigrationReplay([{ filename: '001_initial_schema.sql' }], ['projects', 'tasks'])).toBe(
      false,
    )
    expect(shouldBlockUnsafeMigrationReplay([], [])).toBe(false)
  })

  it('derives the postgres host from SUPABASE_URL and accepts DB_PASSWORD as fallback', () => {
    delete process.env.DATABASE_URL
    delete process.env.PGHOST
    delete process.env.SUPABASE_HOST
    delete process.env.PGPASSWORD
    delete process.env.SUPABASE_PASSWORD
    delete process.env.PGUSER
    delete process.env.SUPABASE_USER
    delete process.env.PGDATABASE
    delete process.env.SUPABASE_DATABASE
    delete process.env.PGPORT
    delete process.env.SUPABASE_PORT
    delete process.env.PGSSLMODE

    process.env.SUPABASE_URL = 'https://wwdrkjnbvcbfytwnnyvs.supabase.co'
    process.env.DB_PASSWORD = 'secret-value'

    expect(resolveMigrationConnectionConfig()).toEqual({
      host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      port: 5432,
      family: 4,
      database: 'postgres',
      user: 'postgres',
      password: 'secret-value',
      ssl: { rejectUnauthorized: false },
    })
  })

  it('prefers the dedicated migration URL over the runtime DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres'
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres:other@db.other.supabase.co:5432/postgres'

    expect(resolveMigrationConnectionConfig()).toEqual({
      connectionString: 'postgresql://postgres:other@db.other.supabase.co:5432/postgres?sslmode=no-verify',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })
  })

  it('normalizes migration connection-string sslmode so pg keeps non-verifying TLS for Supabase pooler certificates', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=require'

    expect(resolveMigrationConnectionConfig()).toEqual({
      connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=no-verify',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })
  })

  it('uses production migration connection fallbacks before host/password config', () => {
    delete process.env.DATABASE_URL
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres:migration@db.migration.supabase.co:5432/postgres'
    process.env.DIRECT_DATABASE_URL = 'postgresql://postgres:direct@db.direct.supabase.co:5432/postgres'
    process.env.DB_CONNECTION_STRING = 'postgresql://runtime:runtime@db.runtime.supabase.co:6543/postgres'

    expect(resolveMigrationConnectionConfig()).toEqual({
      connectionString: 'postgresql://postgres:migration@db.migration.supabase.co:5432/postgres?sslmode=no-verify',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })

    delete process.env.SUPABASE_MIGRATION_URL
    expect(resolveMigrationConnectionConfig()).toEqual({
      connectionString: 'postgresql://postgres:direct@db.direct.supabase.co:5432/postgres?sslmode=no-verify',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })

    delete process.env.DIRECT_DATABASE_URL
    expect(resolveMigrationConnectionConfig()).toEqual({
      connectionString: 'postgresql://runtime:runtime@db.runtime.supabase.co:6543/postgres?sslmode=no-verify',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })
  })

  it('falls back to DATABASE_URL when SUPABASE_MIGRATION_URL is blank', () => {
    process.env.SUPABASE_MIGRATION_URL = '   '
    process.env.DATABASE_URL = 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres'

    expect(resolveMigrationConnectionConfig()).toEqual({
      connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=no-verify',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })
  })

  it('prefers SUPABASE_MIGRATION_URL over runtime credentials when the runtime role is least-privilege', () => {
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres:migration-secret@db.example.supabase.co:5432/postgres'
    process.env.DATABASE_URL = 'postgresql://workbuddy_runtime_login:runtime-secret@db.example.supabase.co:5432/postgres'
    process.env.SUPABASE_USER = 'workbuddy_runtime_login'
    process.env.DB_PASSWORD = 'runtime-secret'

    expect(resolveMigrationConnectionConfig()).toEqual({
      connectionString: 'postgresql://postgres:migration-secret@db.example.supabase.co:5432/postgres?sslmode=no-verify',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })
  })

  it('rejects a migration connection that belongs to a different Supabase project', () => {
    process.env.SUPABASE_URL = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres.bbbbbbbbbbbbbbbbbbbb:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres'

    expect(() => resolveMigrationConnectionConfig()).toThrow('MIGRATION_TARGET_MISMATCH')
  })

  it('rejects a matching project suffix on a non-Supabase migration host', () => {
    process.env.SUPABASE_URL = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:secret@evil.example:5432/postgres'

    expect(() => resolveMigrationConnectionConfig()).toThrow('MIGRATION_TARGET_HOST_UNTRUSTED')
  })

  it('rejects a host-based migration target outside the authoritative Supabase project', () => {
    delete process.env.SUPABASE_MIGRATION_URL
    delete process.env.DIRECT_DATABASE_URL
    delete process.env.DATABASE_URL
    delete process.env.DB_CONNECTION_STRING
    delete process.env.PGHOST
    process.env.SUPABASE_URL = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
    process.env.SUPABASE_HOST = 'evil.example'
    process.env.SUPABASE_PASSWORD = 'secret'

    expect(() => resolveMigrationConnectionConfig()).toThrow('MIGRATION_TARGET_HOST_UNTRUSTED')
  })

  it('accepts the exact authoritative Supabase direct and pooler targets', () => {
    process.env.SUPABASE_URL = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres:secret@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres'
    expect(resolveMigrationConnectionConfig()).toMatchObject({
      connectionString: expect.stringContaining('db.aaaaaaaaaaaaaaaaaaaa.supabase.co'),
    })

    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
    expect(resolveMigrationConnectionConfig()).toMatchObject({
      connectionString: expect.stringContaining('pooler.supabase.com'),
    })
  })

  it('resolves host-based migration config to an ipv4 address before connecting', async () => {
    delete process.env.DATABASE_URL
    process.env.SUPABASE_HOST = 'db.example.supabase.co'
    process.env.SUPABASE_PASSWORD = 'secret-value'

    const dnsLookup = async (hostname: string) => {
      expect(hostname).toBe('db.example.supabase.co')
      return { address: '203.0.113.24', family: 4 }
    }

    await expect(resolveMigrationRuntimeConnectionConfig(dnsLookup)).resolves.toEqual({
      host: '203.0.113.24',
      port: 5432,
      family: 4,
      database: 'postgres',
      user: 'postgres',
      password: 'secret-value',
      ssl: { rejectUnauthorized: false },
    })
  })

  it('falls back to runtime DNS when host-based migration config has no ipv4 record', async () => {
    delete process.env.DATABASE_URL
    process.env.SUPABASE_HOST = 'db.ipv6-only.supabase.co'
    process.env.SUPABASE_PASSWORD = 'secret-value'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const dnsLookup = async (hostname: string) => {
      expect(hostname).toBe('db.ipv6-only.supabase.co')
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    }

    await expect(resolveMigrationRuntimeConnectionConfig(dnsLookup)).resolves.toEqual({
      host: 'db.ipv6-only.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'secret-value',
      ssl: { rejectUnauthorized: false },
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('resolves connection-string migration config to an ipv4 address before connecting', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres'

    const dnsLookup = async (hostname: string) => {
      expect(hostname).toBe('db.example.supabase.co')
      return { address: '203.0.113.42', family: 4 }
    }

    await expect(resolveMigrationRuntimeConnectionConfig(dnsLookup)).resolves.toEqual({
      connectionString: 'postgresql://postgres:secret@203.0.113.42:5432/postgres',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })
  })

  it('strips sslmode from migration connection strings so explicit TLS config is authoritative', async () => {
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=require'

    const dnsLookup = async (hostname: string) => {
      expect(hostname).toBe('db.example.supabase.co')
      return { address: '203.0.113.43', family: 4 }
    }

    await expect(resolveMigrationRuntimeConnectionConfig(dnsLookup)).resolves.toEqual({
      connectionString: 'postgresql://postgres:secret@203.0.113.43:5432/postgres',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })
  })

  it('falls back to runtime DNS when connection-string migration config has no ipv4 record', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:secret@db.ipv6-only.supabase.co:5432/postgres'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const dnsLookup = async (hostname: string) => {
      expect(hostname).toBe('db.ipv6-only.supabase.co')
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    }

    await expect(resolveMigrationRuntimeConnectionConfig(dnsLookup)).resolves.toEqual({
      connectionString: 'postgresql://postgres:secret@db.ipv6-only.supabase.co:5432/postgres',
      ssl: { rejectUnauthorized: false },
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('logs migration DNS fallback only when debug output is explicitly enabled', async () => {
    delete process.env.DATABASE_URL
    process.env.SUPABASE_HOST = 'db.ipv6-only.supabase.co'
    process.env.SUPABASE_PASSWORD = 'secret-value'
    process.env.MIGRATION_DNS_DEBUG = '1'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const dnsLookup = async (hostname: string) => {
      expect(hostname).toBe('db.ipv6-only.supabase.co')
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    }

    await expect(resolveMigrationRuntimeConnectionConfig(dnsLookup)).resolves.toEqual({
      host: 'db.ipv6-only.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'secret-value',
      ssl: { rejectUnauthorized: false },
    })
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('applies migration SQL and its immutable ledger row in one transaction', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'workbuddy-migration-'))
    const migrationPath = resolve(tempDir, '999_test_migration.sql')
    await writeFile(migrationPath, 'CREATE TABLE migration_apply_contract (id uuid);\n', 'utf8')

    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const fakeClient = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })
        return { rows: [] }
      },
    } as any

    try {
      await applyMigration(fakeClient, {
        filename: '999_test_migration.sql',
        version: '999',
        name: 'test_migration',
        fullPath: migrationPath,
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }

    const ledgerSql = queries.find((query) => query.sql.includes('schema_migrations'))?.sql ?? ''
    expect(queries[0]?.sql).toBe('BEGIN')
    expect(queries.some((query) => query.sql.includes('CREATE TABLE migration_apply_contract'))).toBe(true)
    expect(ledgerSql).toContain('INSERT INTO public.schema_migrations')
    expect(ledgerSql).not.toMatch(/ON\s+CONFLICT/i)
    expect(ledgerSql).not.toMatch(/DO\s+UPDATE/i)
    expect(queries.at(-1)?.sql).toBe('COMMIT')
  })

  it('runs the exact migration 308 ACL postcondition before writing its ledger row', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'workbuddy-migration-'))
    const migrationPath = resolve(tempDir, '308_commercial_trigger_rpc_acl_closeout.sql')
    const managedSql = 'SELECT \'managed migration 308 sql\';\n'
    await writeFile(migrationPath, managedSql, 'utf8')
    const postconditionRows = buildHardenedCommercialTriggerAclRows()
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const fakeClient = {
      query: async function (sql: string, params?: unknown[]) {
        expect(this).toBe(fakeClient)
        queries.push({ sql, params })
        return sql.includes('commercial_trigger_rpc_acl_postcondition')
          ? { rows: postconditionRows }
          : { rows: [] }
      },
    } as any

    try {
      await applyMigration(fakeClient, {
        filename: '308_commercial_trigger_rpc_acl_closeout.sql',
        version: '308',
        name: 'commercial_trigger_rpc_acl_closeout',
        fullPath: migrationPath,
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }

    const beginIndex = queries.findIndex(({ sql }) => sql === 'BEGIN')
    const migrationIndex = queries.findIndex(({ sql }) => sql.includes('managed migration 308 sql'))
    const postconditionIndex = queries.findIndex(({ sql }) => sql.includes('commercial_trigger_rpc_acl_postcondition'))
    const ledgerIndex = queries.findIndex(({ sql }) => sql.includes('INSERT INTO public.schema_migrations'))
    const commitIndex = queries.findIndex(({ sql }) => sql === 'COMMIT')
    expect(beginIndex).toBe(0)
    expect(migrationIndex).toBeGreaterThan(beginIndex)
    expect(postconditionIndex).toBeGreaterThan(migrationIndex)
    expect(ledgerIndex).toBeGreaterThan(postconditionIndex)
    expect(commitIndex).toBeGreaterThan(ledgerIndex)
  })

  it('rolls back migration 308 when the ACL postcondition fails without writing the ledger', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'workbuddy-migration-'))
    const migrationPath = resolve(tempDir, '308_commercial_trigger_rpc_acl_closeout.sql')
    await writeFile(migrationPath, 'SELECT \'managed migration 308 sql\';\n', 'utf8')
    const queries: string[] = []
    const invalidPostconditionRows = buildHardenedCommercialTriggerAclRows()
    const residualApiGrant = invalidPostconditionRows.find((row) => row.role_name === 'authenticated')
    if (residualApiGrant) residualApiGrant.role_can_execute = true
    const fakeClient = {
      query: async (sql: string) => {
        queries.push(sql)
        return sql.includes('commercial_trigger_rpc_acl_postcondition')
          ? { rows: invalidPostconditionRows }
          : { rows: [] }
      },
    } as any

    try {
      await expect(applyMigration(fakeClient, {
        filename: '308_commercial_trigger_rpc_acl_closeout.sql',
        version: '308',
        name: 'commercial_trigger_rpc_acl_closeout',
        fullPath: migrationPath,
      })).rejects.toThrow(/ACL postcondition failed/i)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }

    expect(queries).toContain('ROLLBACK')
    expect(queries).not.toContain('COMMIT')
    expect(queries.some((sql) => sql.includes('INSERT INTO public.schema_migrations'))).toBe(false)
  })

  it('selects the ACL postcondition only for the exact migration 308 filename', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'workbuddy-migration-'))
    const filenames = [
      '308_commercial_trigger_rpc_acl_closeout.sql',
      '308_commercial_trigger_rpc_acl_closeout_copy.sql',
      '1308_commercial_trigger_rpc_acl_closeout.sql',
      '999_test_migration.sql',
    ]
    let postconditionCount = 0
    const fakeClient = {
      query: async (sql: string) => {
        if (sql.includes('commercial_trigger_rpc_acl_postcondition')) postconditionCount += 1
        return sql.includes('commercial_trigger_rpc_acl_postcondition')
          ? { rows: buildHardenedCommercialTriggerAclRows() }
          : { rows: [] }
      },
    } as any

    try {
      for (const filename of filenames) {
        const migrationPath = resolve(tempDir, filename)
        await writeFile(migrationPath, 'SELECT 1;\n', 'utf8')
        await applyMigration(fakeClient, {
          filename,
          version: filename.slice(0, filename.indexOf('_')),
          name: 'test_migration',
          fullPath: migrationPath,
        })
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }

    expect(postconditionCount).toBe(1)
  })

  it('fails before the first database query when the SQL no longer matches the expected checksum', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'workbuddy-migration-'))
    const migrationPath = resolve(tempDir, '997_test_migration.sql')
    const validatedSql = 'CREATE TABLE migration_checksum_contract (id uuid);\n'
    const replacedSql = 'DROP TABLE migration_checksum_contract;\n'
    await writeFile(migrationPath, validatedSql, 'utf8')
    const expectedChecksum = calculateMigrationChecksum(validatedSql)
    await writeFile(migrationPath, replacedSql, 'utf8')

    const queries: string[] = []
    const fakeClient = {
      query: async (sql: string) => {
        queries.push(sql)
        return { rows: [] }
      },
    } as any

    try {
      await expect(applyMigration(fakeClient, {
        filename: '997_test_migration.sql',
        version: '997',
        name: 'test_migration',
        fullPath: migrationPath,
      }, { expectedChecksum })).rejects.toMatchObject({
        code: 'MIGRATION_CHECKSUM_MISMATCH',
        expectedChecksum,
        actualChecksum: calculateMigrationChecksum(replacedSql),
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }

    expect(queries).toEqual([])
  })

  it('rolls back migration SQL when the ledger insert fails', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'workbuddy-migration-'))
    const migrationPath = resolve(tempDir, '998_test_migration.sql')
    await writeFile(migrationPath, 'BEGIN;\nCREATE TABLE migration_rollback_contract (id uuid);\nCOMMIT;\n', 'utf8')
    const queries: string[] = []
    const fakeClient = {
      query: async (sql: string) => {
        queries.push(sql)
        if (sql.includes('INSERT INTO public.schema_migrations')) {
          throw new Error('ledger unavailable')
        }
        return { rows: [] }
      },
    } as any

    try {
      await expect(applyMigration(fakeClient, {
        filename: '998_test_migration.sql',
        version: '998',
        name: 'test_migration',
        fullPath: migrationPath,
      })).rejects.toThrow('ledger unavailable')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }

    expect(queries[0]).toBe('BEGIN')
    expect(queries.some((sql) => /^\s*BEGIN\s*;/i.test(sql))).toBe(false)
    expect(queries).toContain('ROLLBACK')
    expect(queries).not.toContain('COMMIT')
  })

  it('acquires and releases one database-wide migration advisory lock', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const fakeClient = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })
        return sql.includes('pg_try_advisory_lock')
          ? { rows: [{ acquired: true }] }
          : { rows: [{ released: true }] }
      },
    } as any

    await expect(acquireMigrationAdvisoryLock(fakeClient)).resolves.toBeUndefined()
    await expect(releaseMigrationAdvisoryLock(fakeClient)).resolves.toBeUndefined()

    expect(queries[0]?.sql).toContain('pg_try_advisory_lock')
    expect(queries[1]?.sql).toContain('pg_advisory_unlock')
    expect(queries[0]?.params).toEqual(queries[1]?.params)
  })
})
