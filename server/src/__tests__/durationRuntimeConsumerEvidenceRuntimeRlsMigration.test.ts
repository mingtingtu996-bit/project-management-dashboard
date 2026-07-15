import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const migrationName = '309_v14231_runtime_consumer_evidence_runtime_rls.sql'
const migrationPath = resolve(serverRoot, 'migrations', migrationName)
const rollbackPath = resolve(serverRoot, 'migrations', 'rollback', migrationName)

const evidenceTables = [
  'runtime_consumer_runtime_calls',
  'runtime_consumer_observations',
]

describe('duration runtime consumer evidence runtime RLS migration', () => {
  it('grants the backend runtime append-only evidence access', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/rolname\s*=\s*'workbuddy_runtime'/i)
    for (const table of evidenceTables) {
      expect(sql).toContain(`REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM PUBLIC`)
      expect(sql).toContain(
        `REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM anon, authenticated`,
      )
      expect(sql).toContain(`DROP POLICY IF EXISTS ${table}_select_admin`)
      expect(sql).not.toContain(`CREATE POLICY ${table}_select_admin`)
      expect(sql).toContain(
        `GRANT SELECT, INSERT ON TABLE public.${table} TO workbuddy_runtime`,
      )
      expect(sql).toContain(
        `REVOKE UPDATE, DELETE ON TABLE public.${table} FROM workbuddy_runtime`,
      )
      expect(sql).toContain(`CREATE POLICY ${table}_backend_runtime_read`)
      expect(sql).toMatch(new RegExp(
        `${table}_backend_runtime_read[\\s\\S]+ON\\s+public\\.${table}[\\s\\S]+FOR\\s+SELECT[\\s\\S]+TO\\s+workbuddy_runtime`,
        'i',
      ))
      expect(sql).toContain(`CREATE POLICY ${table}_backend_runtime_append`)
      expect(sql).toMatch(new RegExp(
        `${table}_backend_runtime_append[\\s\\S]+ON\\s+public\\.${table}[\\s\\S]+FOR\\s+INSERT[\\s\\S]+TO\\s+workbuddy_runtime`,
        'i',
      ))
    }

    expect(sql).toContain("current_user = 'workbuddy_runtime'")
    expect(sql).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(sql).toContain('writes_runtime_directly = false')
    expect(sql).toContain('writes_fact_directly = false')
    expect(sql).not.toMatch(/TO\s+(?:anon|authenticated)\b/i)
    expect(sql).not.toContain('GRANT ALL')
    expect(sql).not.toContain('BYPASSRLS')
  })

  it('drops the policies and restores the pre-309 table ACLs on rollback', () => {
    const sql = readFileSync(rollbackPath, 'utf8')

    for (const table of evidenceTables) {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${table}_backend_runtime_read`)
      expect(sql).toContain(`DROP POLICY IF EXISTS ${table}_backend_runtime_append`)
      expect(sql).toContain(`GRANT UPDATE, DELETE ON TABLE public.${table} TO workbuddy_runtime`)
      expect(sql).toContain(
        `GRANT ALL PRIVILEGES ON TABLE public.${table} TO anon, authenticated`,
      )
      expect(sql).toContain(`CREATE POLICY ${table}_select_admin`)
      expect(sql).not.toContain(
        `REVOKE SELECT, INSERT ON TABLE public.${table} FROM workbuddy_runtime`,
      )
      expect(sql).not.toContain(`GRANT ALL PRIVILEGES ON TABLE public.${table} TO PUBLIC`)
    }
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
