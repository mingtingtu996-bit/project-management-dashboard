import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migrationFilename = '300_runtime_legacy_compatibility_cleanup.sql'

describe('runtime legacy compatibility cleanup migration', () => {
  it('moves meaningful data to canonical relations before dropping retired columns', () => {
    const sql = readMigration(migrationFilename)

    expect(sql).toContain('INSERT INTO public.project_entity_links')
    expect(sql).toContain("'acceptance_plan'")
    expect(sql).toContain("'covers_task'")
    expect(sql).toContain('INSERT INTO public.task_dependencies')
    expect(sql).toContain("'legacy_direct_predecessor'")
    expect(sql).toContain('SET phase_object_id = eo.id')
    expect(sql).toContain('warning_lifecycle_status = CASE')
    expect(sql).toContain("metadata = metadata - 'personal_states'")
    expect(sql).toContain('CREATE TEMP TABLE migration_300_milestone_map')
    expect(sql).toContain('INSERT INTO public.tasks')
    expect(sql).toContain('SET milestone_id = milestone_map.canonical_task_id')
    expect(sql).toContain('INSERT INTO public.notifications')
    expect(sql).toContain('INSERT INTO public.participant_units')
    expect(sql).toContain('SET participant_unit_id = participant_unit.id')

    for (const retiredColumn of [
      'public.users DROP COLUMN IF EXISTS role',
      'public.users DROP COLUMN IF EXISTS device_id',
      'public.tasks DROP COLUMN IF EXISTS phase_id',
      'public.tasks DROP COLUMN IF EXISTS preceding_task_id',
      'public.tasks DROP COLUMN IF EXISTS responsible_unit',
      'public.tasks DROP COLUMN IF EXISTS assignee_unit',
      'public.task_conditions DROP COLUMN IF EXISTS responsible_unit',
      'public.acceptance_plans DROP COLUMN IF EXISTS task_id',
      'public.acceptance_plans DROP COLUMN IF EXISTS responsible_unit',
    ]) {
      expect(sql).toContain(retiredColumn)
    }

    expect(sql).toContain('DROP TABLE public.task_milestones')
    expect(sql).toContain('DROP TABLE public.milestones')
    expect(sql).toContain('DROP TABLE public.warnings')

    expect(sql).toContain('RAISE EXCEPTION')
    expect(sql).not.toMatch(/\bCASCADE\b/i)
  })

  it('ships an explicit rollback script outside the forward migration queue', () => {
    const rollback = readRollbackMigration(migrationFilename)

    expect(rollback).toContain('ADD COLUMN IF NOT EXISTS role')
    expect(rollback).toContain('ADD COLUMN IF NOT EXISTS device_id')
    expect(rollback).toContain('ADD COLUMN IF NOT EXISTS phase_id')
    expect(rollback).toContain('ADD COLUMN IF NOT EXISTS preceding_task_id')
    expect(rollback).toContain('ADD COLUMN IF NOT EXISTS responsible_unit')
    expect(rollback).toContain('ADD COLUMN IF NOT EXISTS assignee_unit')
    expect(rollback).toContain('ADD COLUMN IF NOT EXISTS task_id')
    expect(rollback).toContain('CREATE TABLE IF NOT EXISTS public.milestones')
    expect(rollback).toContain('CREATE TABLE IF NOT EXISTS public.task_milestones')
    expect(rollback).toContain('CREATE TABLE IF NOT EXISTS public.warnings')
    expect(rollback).toContain('project_entity_links')
    expect(rollback).toContain('task_dependencies')
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
