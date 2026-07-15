import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server'))
const migrationPath = resolve(serverRoot, 'migrations/261_v14232_workspace_isolation_rls_boundary_comments.sql')

function readMigration() {
  return readFileSync(migrationPath, 'utf8')
}

describe('v1.4.23.2-D workspace isolation RLS boundary migration', () => {
  it('does not rewrite legacy 007/011 migrations and instead annotates their live policies', () => {
    const sql = readMigration()

    expect(sql).toContain('Forward-only note: do not rewrite legacy migration files 007/011')
    expect(sql).toContain('COMMENT ON POLICY')
    expect(sql).toContain("tablename = 'tasks'")
    expect(sql).toContain("tablename = 'phases'")
    expect(sql).toContain("tablename = 'dialog_frequency_control'")
  })

  it('makes the application-layer isolation boundary explicit to prevent RLS safety theater', () => {
    const sql = readMigration()

    expect(sql).toContain('not the backend tenant-isolation dependency')
    expect(sql).toContain('application-layer company/project membership guards')
    expect(sql).toContain('CI workspace-isolation checks')
    expect(sql).toContain('non-bypass runtime RLS')
    expect(sql).toContain('COMMENT ON FUNCTION public.is_project_member(UUID, UUID)')
    expect(sql).toContain('COMMENT ON FUNCTION public.has_project_edit_permission(UUID, UUID)')
  })
})
