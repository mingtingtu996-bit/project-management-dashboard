import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  compareMigrationVersions,
  calculateMigrationChecksum,
  discoverMigrationFiles,
  getPendingMigrations,
  resolveMigrationConnectionConfig,
  selectMigrationsThroughVersion,
  shouldBlockUnsafeMigrationReplay,
} from '../services/migrationRunner.js'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('migration runner contract', () => {
  it('discovers canonical migration files and filters out backup/verify/final variants', async () => {
    const migrations = await discoverMigrationFiles(resolve(serverRoot, 'migrations'))
    const filenames = migrations.map((item) => item.filename)
    const versions = migrations.map((item) => item.version)

    expect(filenames).toContain('009b_fix_delivery_issues.sql')
    expect(filenames).toContain('083_add_warning_lifecycle_to_notifications.sql')
    expect(filenames).toContain('083a_lock_down_public_rls.sql')
    expect(new Set(versions).size).toBe(versions.length)

    expect(filenames).not.toContain('037_create_task_conditions_and_obstacles_final.sql')
    expect(filenames).not.toContain('037_create_task_conditions_and_obstacles_fixed.sql')
    expect(filenames).not.toContain('038_verify_tables.sql')
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

  it('prefers DATABASE_URL when it is provided', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres'

    expect(resolveMigrationConnectionConfig()).toEqual({
      connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
      family: 4,
      ssl: { rejectUnauthorized: false },
    })
  })
})
