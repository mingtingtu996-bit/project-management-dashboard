import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith('server')
  ? resolve(process.cwd(), '..')
  : process.cwd()
const migrationPath = resolve(
  workspaceRoot,
  'server/migrations/335_duration_learning_retirement_state_rls_policy.sql',
)
const rollbackPath = resolve(
  workspaceRoot,
  'server/migrations/rollback/335_duration_learning_retirement_state_rls_policy.sql',
)

function readSql(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('retirement-state RLS policy migration 335', () => {
  it('adds an explicit deny-all policy without opening a client access path', () => {
    const sql = readSql(migrationPath)

    expect(sql).toContain('BEGIN;')
    expect(sql).toContain(
      'CREATE POLICY duration_learning_legacy_runtime_retirement_state_deny_all',
    )
    expect(sql).toMatch(
      /ON\s+public\.duration_learning_legacy_runtime_retirement_state\s+FOR\s+ALL\s+TO\s+PUBLIC/i,
    )
    expect(sql).toMatch(/USING\s*\(\s*false\s*\)/i)
    expect(sql).toMatch(/WITH\s+CHECK\s*\(\s*false\s*\)/i)
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.duration_learning_legacy_runtime_retirement_state\s+FROM\s+PUBLIC/i,
    )
    expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*\s+TO\s+(?:anon|authenticated)/i)
    expect(sql).toContain('COMMIT;')
  })

  it('rolls back only the explicit policy and preserves the retirement table', () => {
    const rollback = readSql(rollbackPath)

    expect(rollback).toContain(
      'DROP POLICY IF EXISTS duration_learning_legacy_runtime_retirement_state_deny_all',
    )
    expect(rollback).toContain(
      'ON public.duration_learning_legacy_runtime_retirement_state',
    )
    expect(rollback).not.toMatch(/DROP\s+TABLE\s+IF\s+EXISTS\s+public\.duration_learning_legacy_runtime_retirement_state/i)
    expect(rollback).toContain('COMMIT;')
  })

  it('keeps the canonical clean bootstrap block byte-aligned with the incremental migration', () => {
    const sql = readSql(migrationPath).replace(/\r\n/g, '\n').trim()
    const clean = readSql(resolve(workspaceRoot, 'server/migrations/CLEAN_MIGRATION_V4.sql'))
      .replace(/\r\n/g, '\n')
    const header = [
      '-- ============================================================',
      '-- Source: 335_duration_learning_retirement_state_rls_policy.sql',
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = clean.indexOf(header)
    const sourceBodyStart = sourceIndex + header.length
    const nextSourceIndex = clean.indexOf(
      '\n-- ============================================================\n-- Source:',
      sourceBodyStart,
    )
    const bundledSource = clean
      .slice(sourceBodyStart, nextSourceIndex >= 0 ? nextSourceIndex : undefined)
      .trim()

    expect(sourceIndex).toBeGreaterThanOrEqual(0)
    expect(bundledSource).toBe(sql)
  })
})
