import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migrationFilename = '304_v1420_viewer_wbs_legacy_closeout.sql'
const deprecatedBootstrapSnapshots = [
  'CLEAN_MIGRATION.sql',
  'CLEAN_MIGRATION_V2.sql',
  'CLEAN_MIGRATION_V3.sql',
  'FULL_MIGRATION_ALL_IN_ONE.sql',
  'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql',
]

describe('v1.4.20 viewer and WBS legacy closeout migration', () => {
  it('logs and removes retired viewer facts before enforcing canonical project roles', () => {
    const sql = readMigration(migrationFilename)

    const auditIndex = sql.indexOf('INSERT INTO public.change_logs')
    const memberDeleteIndex = sql.indexOf('DELETE FROM public.project_members')
    expect(auditIndex).toBeGreaterThanOrEqual(0)
    expect(memberDeleteIndex).toBeGreaterThan(auditIndex)
    expect(sql).toMatch(/\bpermission_level\b[\s\S]{0,120}=\s*'viewer'/i)
    expect(sql).toMatch(/\brole\b[\s\S]{0,120}=\s*'viewer'/i)
    expect(sql).toContain('project_members_permission_level_check')
    expect(sql).toContain('project_invitations_permission_level_check')
    expect(sql).toContain('project_direct_invitations_role_check')
    expect(sql).toContain('DROP COLUMN IF EXISTS role')
    expect(sql).toContain('DROP INDEX IF EXISTS public.idx_project_members_role')
  })

  it('preflights lineage and data before dropping empty WBS compatibility tables without cascade', () => {
    const sql = readMigration(migrationFilename)

    expect(sql).toContain("entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone')")
    expect(sql).toContain('public.data_lineage_links')
    expect(sql).toContain('public.project_entity_links')
    expect(sql).toContain('SELECT count(*) INTO relation_row_count FROM public.wbs_structure')
    expect(sql).toContain('SELECT count(*) INTO relation_row_count FROM public.wbs_task_links')
    expect(sql).toContain("table_name = 'tasks'")
    expect(sql).toContain("table_name = 'notifications'")
    expect(sql).toContain("table_name = 'planning_governance_states'")
    expect(sql).toContain("DELETE FROM public.data_lineage_entity_types")

    const childDropIndex = sql.indexOf('DROP TABLE IF EXISTS public.wbs_task_links')
    const parentDropIndex = sql.indexOf('DROP TABLE IF EXISTS public.wbs_structure')
    expect(childDropIndex).toBeGreaterThanOrEqual(0)
    expect(parentDropIndex).toBeGreaterThan(childDropIndex)
    expect(sql).not.toMatch(/\bCASCADE\b/i)
  })

  it('ships an explicit manual rollback outside the forward queue', () => {
    const rollback = readRollbackMigration(migrationFilename)

    expect(rollback).toContain('CREATE TABLE IF NOT EXISTS public.wbs_structure')
    expect(rollback).toContain('CREATE TABLE IF NOT EXISTS public.wbs_task_links')
    expect(rollback).toContain('ADD COLUMN IF NOT EXISTS role')
    expect(rollback).toContain('data_lineage_entity_types')
    expect(rollback).toContain('project_members_permission_level_check')
  })

  it.each(deprecatedBootstrapSnapshots)('%s converges to the canonical schema after its historical statements', (filename) => {
    const sql = readMigration(filename)
    const closeoutIndex = sql.lastIndexOf('v1.4 final legacy-object closeout')

    expect(closeoutIndex).toBeGreaterThanOrEqual(0)
    for (const table of [
      'task_milestones',
      'milestones',
      'warnings',
      'project_scope_dimensions',
      'scope_dimensions',
      'ai_duration_estimates',
      'wbs_task_links',
      'wbs_structure',
    ]) {
      const createIndex = sql.lastIndexOf(`CREATE TABLE IF NOT EXISTS ${table}`)
      const dropIndex = sql.lastIndexOf(`DROP TABLE IF EXISTS public.${table}`)
      expect(dropIndex).toBeGreaterThan(closeoutIndex)
      if (createIndex >= 0) expect(dropIndex).toBeGreaterThan(createIndex)
    }

    const closeoutSql = sql.slice(closeoutIndex)
    expect(closeoutSql).toContain('DROP COLUMN IF EXISTS device_id')
    expect(closeoutSql).toContain('DROP COLUMN IF EXISTS phase_id')
    expect(closeoutSql).toContain('DROP COLUMN IF EXISTS assignee_unit')
    expect(closeoutSql).toContain('DROP COLUMN IF EXISTS responsible_unit')
    expect(closeoutSql).toContain('project_members_permission_level_check')
    expect(closeoutSql).toContain('project_invitations_permission_level_check')
    expect(closeoutSql).not.toMatch(/\bCASCADE\b/i)
  })
})

function migrationRoot() {
  const rootRelativePath = resolve(process.cwd(), 'server', 'migrations')
  return existsSync(rootRelativePath) ? rootRelativePath : resolve(process.cwd(), 'migrations')
}

function readMigration(filename: string) {
  return readFileSync(resolve(migrationRoot(), filename), 'utf8')
}

function readRollbackMigration(filename: string) {
  return readFileSync(resolve(migrationRoot(), 'rollback', filename), 'utf8')
}
