import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationName = '324_canonical_cause_and_benchmark_provenance.sql'

function readSql(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8').replace(/\r\n/g, '\n')
}

describe('canonical cause benchmark migration', () => {
  it('adds benchmark provenance and canonical cause segments', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ')
    expect(forward).toContain('ADD COLUMN IF NOT EXISTS source_window_start TIMESTAMPTZ')
    expect(forward).toContain('ADD COLUMN IF NOT EXISTS source_as_of TIMESTAMPTZ')
    expect(forward).toContain('CREATE TABLE IF NOT EXISTS public.duration_benchmark_cause_segments')
    expect(forward).toContain("duration_day_basis TEXT NOT NULL CHECK (duration_day_basis = 'construction_production_day')")
    expect(forward).toContain('CHECK (source_window_start IS NULL OR source_window_start <= source_as_of)')
    expect(forward).toContain("'government_inspection','site_capacity_pressure','workflow_sequence','external_readiness','other'")
    expect(forward).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_cause_segment_current')
    expect(forward).toContain('WHERE is_current = TRUE')
  })

  it('fails closed on missing runtime role and limits direct mutation authority', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain("IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime')")
    expect(forward).toContain("RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 324'")
    expect(forward).toContain('ALTER TABLE public.duration_benchmark_cause_segments FORCE ROW LEVEL SECURITY')
    expect(forward).toContain('REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM PUBLIC, anon')
    expect(forward).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE public.duration_benchmark_cause_segments FROM authenticated')
    expect(forward).toContain('GRANT SELECT ON TABLE public.duration_benchmark_cause_segments TO authenticated')
    expect(forward).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_benchmark_cause_segments TO workbuddy_runtime')
    expect(forward).toContain('CREATE POLICY duration_benchmark_cause_segments_backend_runtime')
    expect(forward).toContain('FOR ALL')
    expect(forward).toContain('TO workbuddy_runtime')
  })

  it('preserves global and tenant-member reads with project/company authority checks', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('CREATE POLICY duration_benchmark_cause_segments_member_read')
    expect(forward).toContain('workbuddy_private.is_active_company_member')
    expect(forward).toContain('workbuddy_private.is_active_project_member')
    expect(forward).toContain('duration_benchmark_cause_segments.company_id IS NULL')
    expect(forward).toContain('duration_benchmark_cause_segments.project_id IS NULL')
    expect(forward).toContain('project.company_id = duration_benchmark_cause_segments.company_id')
  })

  it('rejects segment scope that disagrees with its benchmark or project authority', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('CREATE OR REPLACE FUNCTION public.ensure_duration_benchmark_cause_segment_scope()')
    expect(forward).toContain('BEFORE INSERT OR UPDATE')
    expect(forward).toContain('NEW.company_id IS DISTINCT FROM benchmark_company_id')
    expect(forward).toContain('NEW.project_id IS DISTINCT FROM benchmark_project_id')
    expect(forward).toContain("RAISE EXCEPTION 'duration benchmark cause segment scope mismatch'")
    expect(forward).toContain('project_company_id IS DISTINCT FROM NEW.company_id')
    expect(forward).toContain("RAISE EXCEPTION 'duration benchmark cause segment project/company mismatch'")
  })

  it('provides an exact rollback limited to migration 324 objects', () => {
    const rollbackPath = resolve(serverRoot, 'migrations', 'rollback', migrationName)

    expect(existsSync(rollbackPath)).toBe(true)
    const rollback = readSql('migrations', 'rollback', migrationName)
    expect(rollback).toContain('DROP POLICY IF EXISTS duration_benchmark_cause_segments_member_read')
    expect(rollback).toContain('DROP POLICY IF EXISTS duration_benchmark_cause_segments_backend_runtime')
    expect(rollback).toContain('DROP TRIGGER IF EXISTS ensure_duration_benchmark_cause_segment_scope_trigger')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.ensure_duration_benchmark_cause_segment_scope()')
    expect(rollback).toContain('DROP TABLE IF EXISTS public.duration_benchmark_cause_segments')
    expect(rollback).toContain('DROP COLUMN IF EXISTS generated_at')
    expect(rollback).toContain('DROP COLUMN IF EXISTS source_window_start')
    expect(rollback).toContain('DROP COLUMN IF EXISTS source_as_of')
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.duration_benchmarks')
    expect(rollback).not.toContain('DROP POLICY IF EXISTS duration_benchmarks_')
  })

  it('is the exact migration 324 block at CLEAN EOF', () => {
    const standaloneBody = readSql('migrations', migrationName).trim()
    const clean = readSql('migrations', 'CLEAN_MIGRATION_V4.sql')
    const sourceHeader = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = clean.indexOf(sourceHeader)
    const migration323Index = clean.indexOf('Source: 323_duration_learning_runtime_evidence_outbox.sql')
    const cleanTailBody = clean.slice(sourceIndex + sourceHeader.length).trim()

    expect(sourceIndex).toBeGreaterThan(migration323Index)
    expect(standaloneBody).toBe(cleanTailBody)
    expect(clean.trimEnd().endsWith(standaloneBody)).toBe(true)
    expect(clean).toContain('CANONICAL: current clean bootstrap bundle, synchronized through migration 324')
  })
})
