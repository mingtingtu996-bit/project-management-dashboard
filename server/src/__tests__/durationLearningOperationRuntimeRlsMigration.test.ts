import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const migrationName = '303_v14231_duration_learning_operation_runtime_rls.sql'
const migrationPath = resolve(serverRoot, 'migrations', migrationName)
const rollbackPath = resolve(serverRoot, 'migrations', 'rollback', migrationName)

const operationTables = [
  {
    table: 'duration_context_policy_learning_checkpoints',
    policy: 'duration_context_learning_checkpoints_backend_runtime',
  },
  {
    table: 'duration_asset_baseline_revision_operations',
    policy: 'duration_asset_baseline_revision_ops_backend_runtime',
  },
]

describe('duration learning operation runtime RLS migration', () => {
  it('lets only the backend runtime role maintain durable learning operations', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/rolname\s*=\s*'workbuddy_runtime'/i)
    for (const { table, policy } of operationTables) {
      expect(sql).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO workbuddy_runtime`,
      )
      expect(sql).toContain(`DROP POLICY IF EXISTS ${policy}`)
      expect(sql).toContain(`CREATE POLICY ${policy}`)
      expect(sql).toMatch(new RegExp(
        `ON\\s+public\\.${table}[\\s\\S]+FOR\\s+ALL[\\s\\S]+TO\\s+workbuddy_runtime`,
        'i',
      ))
    }

    expect(sql).toContain("current_user = 'workbuddy_runtime'")
    expect(sql).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(sql).not.toMatch(/TO\s+(?:anon|authenticated)\b/i)
    expect(sql).not.toContain('BYPASSRLS')
    expect(sql).not.toContain('GRANT ALL')
  })

  it('rolls back only the policies and preserves pre-existing runtime table ACLs', () => {
    const sql = readFileSync(rollbackPath, 'utf8')

    for (const { policy } of operationTables) {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${policy}`)
    }
    expect(sql).not.toMatch(/REVOKE[\s\S]+FROM\s+workbuddy_runtime/i)
  })

  it('keeps the clean bootstrap bundle aligned with the incremental migration', () => {
    const normalizeSql = (value: string) => value.replace(/\r\n/g, '\n').trim()
    const migration = normalizeSql(readFileSync(migrationPath, 'utf8'))
    const cleanBundle = normalizeSql(readFileSync(
      resolve(serverRoot, 'migrations', 'CLEAN_MIGRATION_V4.sql'),
      'utf8',
    ))
    const sourceHeader = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceHeaderIndex = cleanBundle.indexOf(sourceHeader)

    expect(sourceHeaderIndex).toBeGreaterThanOrEqual(0)

    const sourceBodyStart = sourceHeaderIndex + sourceHeader.length
    const nextSourceIndex = cleanBundle.indexOf(
      '\n-- ============================================================\n-- Source:',
      sourceBodyStart,
    )
    const bundledMigration = normalizeSql(cleanBundle.slice(
      sourceBodyStart,
      nextSourceIndex >= 0 ? nextSourceIndex : undefined,
    ))

    expect(bundledMigration).toBe(migration)
  })
})
