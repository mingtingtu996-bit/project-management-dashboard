import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

describe('drawings migration hardening', () => {
  function readMigration(...segments: string[]) {
    return readFileSync(resolve(serverRoot, ...segments), 'utf8')
  }

  function extractPreMilestonesCreateBlock(source: string) {
    const marker = 'CREATE TABLE IF NOT EXISTS pre_milestones ('
    const start = source.indexOf(marker)
    expect(start).toBeGreaterThanOrEqual(0)
    const tail = source.slice(start)
    const end = tail.indexOf('\n);')
    expect(end).toBeGreaterThanOrEqual(0)
    return tail.slice(0, end + 3)
  }

  function extractPreMilestoneStatusFunction(source: string) {
    const marker = 'CREATE OR REPLACE FUNCTION fn_update_pre_milestone_status()'
    const start = source.indexOf(marker)
    expect(start).toBeGreaterThanOrEqual(0)
    const tail = source.slice(start)
    const end = tail.indexOf('$$ LANGUAGE plpgsql;')
    expect(end).toBeGreaterThanOrEqual(0)
    return tail.slice(0, end + '$$ LANGUAGE plpgsql;'.length)
  }

  it('guards optional drawing tables before creating migration 088 indexes', () => {
    const migration = readMigration('migrations', '088a_v2_hardening_drawings_dependencies_indexes.sql')

    expect(migration).toContain("table_name = 'construction_drawings'")
    expect(migration).toContain("table_name = 'drawing_versions'")
    expect(migration).toContain("EXECUTE 'CREATE INDEX IF NOT EXISTS idx_drawing_versions_package_created_at")
  })

  it('hardens mainline c drawing and license contract fields in migration 093', () => {
    const migration = readMigration('migrations', '093a_mainline_c_drawings_licenses_hardening.sql')

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS issued_for TEXT')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS effective_date DATE')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ')
    expect(migration).toContain("IF to_regclass('public.drawing_versions') IS NOT NULL THEN")
    expect(migration).toContain("IF to_regclass('public.drawing_package_items') IS NOT NULL THEN")
    expect(migration).toContain("IF to_regclass('public.drawing_packages') IS NOT NULL THEN")
    expect(migration).toContain("IF to_regclass('public.drawing_review_rules') IS NOT NULL THEN")
    expect(migration).toContain("UPDATE public.drawing_versions AS dv")
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_drawing_versions_parent_drawing_id ON public.drawing_versions(parent_drawing_id)")
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_drawing_package_items_discipline_type ON public.drawing_package_items(package_id, discipline_type)")
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS discipline_type TEXT')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS certificate_no TEXT')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS current_stage VARCHAR(32)')
    expect(migration).toContain('SELECT dp.discipline_type')
    expect(migration).toContain('chk_pre_milestones_status_current')
    expect(migration).toContain("mandatory', 'optional', 'none', 'manual_confirm")
  })

  it('keeps bundled and bootstrap pre_milestones schemas on the current contract', () => {
    const files = [
      ['migrations', 'CLEAN_MIGRATION.sql'],
      ['migrations', 'CLEAN_MIGRATION_V2.sql'],
      ['migrations', 'CLEAN_MIGRATION_V3.sql'],
      ['migrations', 'CLEAN_MIGRATION_V4.sql'],
      ['migrations', 'FULL_MIGRATION_ALL_IN_ONE.sql'],
      ['migrations', 'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql'],
      ['migration-pre_milestones.sql'],
      ['run-migration.ts'],
    ] as const

    for (const segments of files) {
      const block = extractPreMilestonesCreateBlock(readMigration(...segments))

      expect(block).toContain("DEFAULT 'pending'")
      expect(block).toContain("'preparing_documents'")
      expect(block).toContain("'internal_review'")
      expect(block).toContain("'external_submission'")
      expect(block).toContain("'supplement_required'")
      expect(block).toContain("'approved'")
      expect(block).toContain("'issued'")
      expect(block).toContain("'expired'")
      expect(block).toContain("'voided'")
      expect(block).toContain("'land_certificate'")
      expect(block).toContain("'construction_permit'")
      expect(block).toContain('certificate_type TEXT')
      expect(block).toContain('certificate_name TEXT')
      expect(block).toContain('certificate_no TEXT')
      expect(block).toContain('current_stage VARCHAR(32)')
      expect(block).toContain('responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL')
      expect(block).toContain('created_by UUID REFERENCES users(id) ON DELETE SET NULL')
      expect(block).not.toContain("DEFAULT '待申请'")
    }
  })

  it('keeps bundled pre_milestone status automation on the current contract', () => {
    const files = [
      ['migrations', 'CLEAN_MIGRATION.sql'],
      ['migrations', 'CLEAN_MIGRATION_V2.sql'],
      ['migrations', 'CLEAN_MIGRATION_V3.sql'],
      ['migrations', 'CLEAN_MIGRATION_V4.sql'],
      ['migrations', 'FULL_MIGRATION_ALL_IN_ONE.sql'],
      ['migrations', 'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql'],
    ] as const

    for (const segments of files) {
      const block = extractPreMilestoneStatusFunction(readMigration(...segments))

      expect(block).toContain("v_current_status IN ('issued', 'expired', 'voided')")
      expect(block).toContain("SET status = 'issued'")
      expect(block).toContain("SET status = 'preparing_documents'")
      expect(block).toContain("status NOT IN ('issued', 'expired', 'voided')")
      expect(block).toContain("AND status = 'pending'")
      expect(block).not.toContain("'已取得'")
      expect(block).not.toContain("'待申请'")
      expect(block).not.toContain("'办理中'")
    }
  })
})
