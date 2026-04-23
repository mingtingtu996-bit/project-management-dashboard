import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

describe('planning core table migration', () => {
  it('ships a canonical reconciliation migration for the four planning core tables', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations', '099_reconcile_planning_domain_core_tables.sql'),
      'utf8',
    )

    expect(migration).toContain('ALTER TABLE IF EXISTS public.task_baselines')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_version_id UUID')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL')
    expect(migration).toContain('ALTER TABLE IF EXISTS public.task_baseline_items')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS is_baseline_critical BOOLEAN NOT NULL DEFAULT FALSE')
    expect(migration).toContain('ALTER TABLE IF EXISTS public.monthly_plans')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS data_confidence_score NUMERIC(5,2)')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS data_confidence_flag TEXT')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS data_confidence_note TEXT')
    expect(migration).toContain('monthly_plans_data_confidence_flag_check')
    expect(migration).toContain('ALTER TABLE IF EXISTS public.monthly_plan_items')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS carryover_from_item_id UUID REFERENCES public.monthly_plan_items(id) ON DELETE SET NULL')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS current_progress NUMERIC(6,2)')
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('keeps bundled clean/full snapshots on the current planning core table contract', () => {
    const snapshotFiles = [
      'CLEAN_MIGRATION.sql',
      'CLEAN_MIGRATION_V2.sql',
      'CLEAN_MIGRATION_V3.sql',
      'CLEAN_MIGRATION_V4.sql',
      'FULL_MIGRATION_ALL_IN_ONE.sql',
      'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql',
    ]

    for (const filename of snapshotFiles) {
      const migration = readFileSync(resolve(serverRoot, 'migrations', filename), 'utf8')
      expect(migration).toContain('is_baseline_critical BOOLEAN NOT NULL DEFAULT FALSE')
      expect(migration).toContain('data_confidence_score NUMERIC(5,2)')
      expect(migration).toContain('data_confidence_flag TEXT')
      expect(migration).toContain('data_confidence_note TEXT')
      expect(migration).toContain('carryover_from_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL')
      expect(migration).toContain('current_progress NUMERIC(6,2)')
    }
  })
})
