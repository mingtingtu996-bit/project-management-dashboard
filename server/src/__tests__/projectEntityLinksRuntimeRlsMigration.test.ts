import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const migrationName = '310_v14231_project_entity_links_runtime_rls.sql'
const migrationPath = resolve(serverRoot, 'migrations', migrationName)
const rollbackPath = resolve(serverRoot, 'migrations', 'rollback', migrationName)

describe('project entity links backend runtime RLS migration', () => {
  it('allows the backend runtime role to maintain links without broadening browser access', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/rolname\s*=\s*'workbuddy_runtime'/i)
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_entity_links TO workbuddy_runtime',
    )
    expect(sql).toContain('CREATE POLICY project_entity_links_backend_runtime_policy')
    expect(sql).toMatch(
      /project_entity_links_backend_runtime_policy[\s\S]+ON\s+public\.project_entity_links[\s\S]+FOR\s+ALL[\s\S]+TO\s+workbuddy_runtime/i,
    )
    expect(sql).toContain("current_user = 'workbuddy_runtime'")
    expect(sql).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
    expect(sql).not.toMatch(/GRANT[\s\S]+TO\s+(?:PUBLIC|anon|authenticated)\b/i)
    expect(sql).not.toContain('BYPASSRLS')
  })

  it('removes only the backend runtime policy on rollback', () => {
    const sql = readFileSync(rollbackPath, 'utf8')

    expect(sql).toContain('DROP POLICY IF EXISTS project_entity_links_backend_runtime_policy')
    expect(sql).not.toMatch(/DROP POLICY IF EXISTS project_entity_links_(?:read|write)_policy/i)
    expect(sql).not.toMatch(/GRANT[\s\S]+TO\s+(?:PUBLIC|anon|authenticated)\b/i)
  })

  it('keeps the clean bootstrap bundle aligned with migration 310', () => {
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
    expect(normalizeSql(cleanBundle.slice(sourceHeaderIndex + sourceHeader.length))).toBe(migration)
  })
})
