import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const migrationName = '308_commercial_trigger_rpc_acl_closeout.sql'
const migrationPath = resolve(serverRoot, 'migrations', migrationName)
const rollbackPath = resolve(serverRoot, 'migrations', 'rollback', migrationName)
const cleanMigrationPath = resolve(serverRoot, 'migrations', 'CLEAN_MIGRATION_V4.sql')

const triggerFunctions = [
  'public.workbuddy_initialize_company_commercial()',
  'public.workbuddy_meter_company_projects()',
]

function readSql(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('commercial trigger RPC ACL closeout migration', () => {
  it('keeps the staging-ledgered migration and its clean-bundle segment immutable', () => {
    const sql = readSql(migrationPath)
    expect(createHash('sha256').update(sql).digest('hex')).toBe(
      '7d920e2696673975d8a2e4fe2e07a28f294a108b8dc12d6a9f95544bb0dbb85f',
    )
    const cleanSql = readSql(cleanMigrationPath)
    const sourceHeader = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const nextSourceHeader = [
      '-- ============================================================',
      '-- Source: 309_v14231_runtime_consumer_evidence_runtime_rls.sql',
      '-- ============================================================',
    ].join('\n')
    const normalizedCleanSql = cleanSql.replace(/\r\n/g, '\n')
    const sourceIndex = normalizedCleanSql.indexOf(sourceHeader)
    const nextSourceIndex = normalizedCleanSql.indexOf(nextSourceHeader, sourceIndex + sourceHeader.length)
    const bundledMigration = normalizedCleanSql
      .slice(sourceIndex + sourceHeader.length, nextSourceIndex)
      .trim()

    expect(sourceIndex).toBeGreaterThan(-1)
    expect(nextSourceIndex).toBeGreaterThan(sourceIndex)
    expect(bundledMigration).toBe(sql.replace(/\r\n/g, '\n').trim())
  })

  it('removes direct API execution while preserving backend runtime access', () => {
    const sql = readSql(migrationPath)

    expect(sql).not.toBe('')
    for (const functionIdentity of triggerFunctions) {
      expect(sql).toContain(functionIdentity)
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC/i)
    expect(sql).toMatch(/ARRAY\['anon', 'authenticated'\]/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION %s FROM %I/i)
    expect(sql).toMatch(
      /ARRAY\[\s*'service_role',\s*'workbuddy_runtime',\s*'workbuddy_runtime_login'\s*\]/i,
    )
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO %I/i)
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('does not replace the commercial triggers or their business functions', () => {
    const sql = readSql(migrationPath)

    expect(sql).not.toMatch(/\b(?:CREATE|ALTER|DROP)\s+TRIGGER\b/i)
    expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i)
    expect(sql).not.toMatch(/\bDROP\s+FUNCTION\b/i)
  })

  it('provides an explicit rollback that documents the security regression', () => {
    const sql = readSql(rollbackPath)

    expect(sql).not.toBe('')
    expect(sql).toMatch(/reopens? the Supabase Advisor finding/i)
    for (const functionIdentity of triggerFunctions) {
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${functionIdentity} TO PUBLIC`)
    }
    expect(sql).not.toMatch(/\bDROP\s+(?:TRIGGER|FUNCTION)\b/i)
  })
})
