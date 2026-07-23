import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CANONICAL_STRUCTURED_CAUSE_CODES } from '../domain/structuredCauseTaxonomy.js'

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
    expect(forward).toContain('CREATE INDEX IF NOT EXISTS idx_duration_benchmark_cause_segments_benchmark_id')
    expect(forward).toContain('ON public.duration_benchmark_cause_segments (benchmark_id)')
  })

  it('keeps the migration cause-code check exactly equal to the canonical taxonomy', () => {
    const forward = readSql('migrations', migrationName)
    const check = forward.match(/CHECK \(cause_code IN \(([\s\S]*?)\)\)/)
    const migrationCodes = Array.from(check?.[1].matchAll(/'([^']+)'/g) ?? [], (match) => match[1]).sort()

    expect(check).not.toBeNull()
    expect(migrationCodes).toEqual([...CANONICAL_STRUCTURED_CAUSE_CODES].sort())
  })

  it('fails closed on missing runtime role and limits direct mutation authority', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain("IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime')")
    expect(forward).toContain("RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 324'")
    expect(forward).toContain('ALTER TABLE public.duration_benchmark_cause_segments FORCE ROW LEVEL SECURITY')
    expect(forward).toContain('REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM PUBLIC, anon')
    expect(forward).toContain('REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM authenticated')
    expect(forward).toContain('REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM workbuddy_runtime')
    expect(forward).toMatch(
      /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'service_role'\) THEN\s+EXECUTE 'REVOKE ALL ON TABLE public\.duration_benchmark_cause_segments FROM service_role'/,
    )
    expect(forward).toContain('GRANT SELECT ON TABLE public.duration_benchmark_cause_segments TO authenticated')
    expect(forward).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_benchmark_cause_segments TO workbuddy_runtime')
    expect(forward).not.toMatch(/GRANT [^;]+ON TABLE public\.duration_benchmark_cause_segments TO service_role/)
    expect(forward).toContain('CREATE POLICY duration_benchmark_cause_segments_backend_runtime')
    expect(forward).toContain('FOR ALL')
    expect(forward).toContain('TO workbuddy_runtime')
  })

  it('preserves global and tenant-member reads with project/company authority checks', () => {
    const forward = readSql('migrations', migrationName)
    const memberReadPolicy = forward.slice(
      forward.indexOf('CREATE POLICY duration_benchmark_cause_segments_member_read'),
      forward.indexOf('DROP POLICY IF EXISTS duration_benchmark_cause_segments_backend_runtime'),
    )

    expect(forward).toContain('CREATE POLICY duration_benchmark_cause_segments_member_read')
    expect(memberReadPolicy).toMatch(
      /duration_benchmark_cause_segments\.company_id IS NULL\s+AND duration_benchmark_cause_segments\.project_id IS NULL/,
    )
    expect(memberReadPolicy).toMatch(
      /duration_benchmark_cause_segments\.company_id IS NOT NULL\s+AND duration_benchmark_cause_segments\.project_id IS NULL\s+AND workbuddy_private\.is_active_company_member\(\s*duration_benchmark_cause_segments\.company_id,\s*NULL::TEXT\[\]\s*\)/,
    )
    expect(memberReadPolicy).toMatch(
      /duration_benchmark_cause_segments\.project_id IS NOT NULL[\s\S]*workbuddy_private\.is_active_company_member\(\s*duration_benchmark_cause_segments\.company_id,\s*NULL::TEXT\[\]\s*\)\s+AND \(\s*workbuddy_private\.is_active_company_member\(\s*duration_benchmark_cause_segments\.company_id,\s*ARRAY\['company_admin'\]::TEXT\[\]\s*\)\s+OR workbuddy_private\.is_active_project_member\(\s*duration_benchmark_cause_segments\.project_id,\s*NULL::TEXT\[\]\s*\)\s*\)/,
    )
    expect(memberReadPolicy).toContain('project.company_id = duration_benchmark_cause_segments.company_id')
    expect(memberReadPolicy).toMatch(
      /FROM public\.duration_benchmarks benchmark\s+WHERE benchmark\.id = duration_benchmark_cause_segments\.benchmark_id\s+AND benchmark\.company_id IS NOT DISTINCT FROM duration_benchmark_cause_segments\.company_id\s+AND benchmark\.project_id IS NOT DISTINCT FROM duration_benchmark_cause_segments\.project_id/,
    )
  })

  it('locks INSERT and benchmark moves in both orderings but leaves ordinary UPDATE parent reads unlocked', () => {
    const forward = readSql('migrations', migrationName)
    const segmentScopeFunction = forward.slice(
      forward.indexOf('CREATE OR REPLACE FUNCTION public.ensure_duration_benchmark_cause_segment_scope()'),
      forward.indexOf('DROP TRIGGER IF EXISTS ensure_duration_benchmark_cause_segment_scope_trigger'),
    )
    const parentLoadBlock = segmentScopeFunction.slice(
      segmentScopeFunction.indexOf('BEGIN'),
      segmentScopeFunction.indexOf('IF NOT FOUND THEN'),
    )
    const lockedParentLoad = parentLoadBlock.slice(
      parentLoadBlock.indexOf('IF lock_benchmark_scope THEN'),
      parentLoadBlock.indexOf('ELSE', parentLoadBlock.indexOf('IF lock_benchmark_scope THEN')),
    )
    const ordinaryUpdateParentLoad = parentLoadBlock.slice(
      parentLoadBlock.indexOf('ELSE', parentLoadBlock.indexOf('IF lock_benchmark_scope THEN')),
      parentLoadBlock.lastIndexOf('END IF;'),
    )
    const parentScopeFunction = forward.slice(
      forward.indexOf('CREATE OR REPLACE FUNCTION public.prevent_duration_benchmark_scope_change_with_segments()'),
      forward.indexOf('DROP TRIGGER IF EXISTS prevent_duration_benchmark_scope_change_with_segments_trigger'),
    )

    expect(forward).toContain('CREATE OR REPLACE FUNCTION public.ensure_duration_benchmark_cause_segment_scope()')
    expect(segmentScopeFunction).toContain('SECURITY INVOKER')
    expect(segmentScopeFunction).not.toContain('SECURITY DEFINER')
    expect(segmentScopeFunction).toContain('SET search_path = pg_catalog')
    expect(parentLoadBlock).toMatch(
      /IF TG_OP = 'INSERT' THEN\s+lock_benchmark_scope := TRUE;\s+ELSE\s+lock_benchmark_scope := NEW\.benchmark_id IS DISTINCT FROM OLD\.benchmark_id;\s+END IF/,
    )
    // Parent-first INSERT/move: FOR SHARE waits, then validation reads committed parent scope.
    // Child-first INSERT/move: FOR SHARE delays parent scope UPDATE until the guard can see the segment.
    expect(lockedParentLoad).toMatch(
      /FROM public\.duration_benchmarks benchmark\s+WHERE benchmark\.id = NEW\.benchmark_id\s+FOR SHARE/,
    )
    // Ordinary UPDATE: avoid child->parent lock inversion during ON DELETE CASCADE; the existing parent guard protects scope.
    expect(ordinaryUpdateParentLoad).toMatch(
      /FROM public\.duration_benchmarks benchmark\s+WHERE benchmark\.id = NEW\.benchmark_id/,
    )
    expect(ordinaryUpdateParentLoad).not.toContain('FOR SHARE')
    expect(parentLoadBlock.match(/FOR SHARE/g)).toHaveLength(1)
    expect(forward).toContain('BEFORE INSERT OR UPDATE')
    expect(forward).toContain('NEW.company_id IS DISTINCT FROM benchmark_company_id')
    expect(forward).toContain('NEW.project_id IS DISTINCT FROM benchmark_project_id')
    expect(forward).toContain("RAISE EXCEPTION 'duration benchmark cause segment scope mismatch'")
    expect(forward).toContain('project_company_id IS DISTINCT FROM NEW.company_id')
    expect(forward).toContain("RAISE EXCEPTION 'duration benchmark cause segment project/company mismatch'")
    expect(forward).toContain('CREATE OR REPLACE FUNCTION public.prevent_duration_benchmark_scope_change_with_segments()')
    expect(parentScopeFunction).toContain('SECURITY DEFINER')
    expect(parentScopeFunction).not.toContain('SECURITY INVOKER')
    expect(parentScopeFunction).toContain('SET search_path = pg_catalog')
    expect(parentScopeFunction).not.toContain('EXECUTE ')
    expect(parentScopeFunction).toMatch(
      /\(\s*NEW\.company_id IS DISTINCT FROM OLD\.company_id\s+OR NEW\.project_id IS DISTINCT FROM OLD\.project_id\s*\)\s+AND EXISTS \(\s*SELECT 1\s+FROM public\.duration_benchmark_cause_segments segment\s+WHERE segment\.benchmark_id = OLD\.id\s*\)/,
    )
    expect(parentScopeFunction).toContain("RAISE EXCEPTION 'duration benchmark scope cannot change while cause segments exist'")
    expect(forward).toMatch(
      /CREATE TRIGGER prevent_duration_benchmark_scope_change_with_segments_trigger\s+BEFORE UPDATE OF company_id, project_id\s+ON public\.duration_benchmarks\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.prevent_duration_benchmark_scope_change_with_segments\(\)/,
    )
    expect(forward).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.ensure_duration_benchmark_cause_segment_scope\(\)\s+FROM PUBLIC, anon, authenticated/,
    )
    expect(forward).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.prevent_duration_benchmark_scope_change_with_segments\(\)\s+FROM PUBLIC, anon, authenticated/,
    )
    expect(forward).toMatch(
      /EXECUTE 'REVOKE EXECUTE ON FUNCTION public\.ensure_duration_benchmark_cause_segment_scope\(\) FROM service_role'/,
    )
    expect(forward).toMatch(
      /EXECUTE 'REVOKE EXECUTE ON FUNCTION public\.prevent_duration_benchmark_scope_change_with_segments\(\) FROM service_role'/,
    )
    expect(forward).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.prevent_duration_benchmark_scope_change_with_segments\(\)/)
  })

  it('enforces project/company authority on parent duration benchmarks with rollback parity', () => {
    const forward = readSql('migrations', migrationName)
    const rollback = readSql('migrations', 'rollback', migrationName)
    const clean = readSql('migrations', 'CLEAN_MIGRATION_V4.sql')

    expect(forward).toContain('CREATE OR REPLACE FUNCTION public.ensure_duration_benchmark_scope()')
    expect(forward).toContain("RAISE EXCEPTION 'duration benchmark company is required for project scope'")
    expect(forward).toContain("RAISE EXCEPTION 'duration benchmark project not found'")
    expect(forward).toContain("RAISE EXCEPTION 'duration benchmark project/company mismatch'")
    expect(forward).toMatch(/CREATE TRIGGER ensure_duration_benchmark_scope_trigger\s+BEFORE INSERT OR UPDATE OF company_id, project_id\s+ON public\.duration_benchmarks/)
    expect(rollback).toContain('DROP TRIGGER IF EXISTS ensure_duration_benchmark_scope_trigger ON public.duration_benchmarks')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.ensure_duration_benchmark_scope()')
    expect(clean).toContain('CREATE OR REPLACE FUNCTION public.ensure_duration_benchmark_scope()')
  })

  it('enforces immutable candidate operations, one active task primary, and composite project ownership', () => {
    const forward = readSql('migrations', migrationName)
    const rollback = readSql('migrations', 'rollback', migrationName)
    const clean = readSql('migrations', 'CLEAN_MIGRATION_V4.sql')

    expect(forward).toContain("metadata ->> 'candidate_operation_id'")
    expect(forward).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmarks_candidate_operation')
    expect(forward).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmarks_candidate_operation\s+ON public\.duration_benchmarks \(\s*company_id,\s*project_id,\s*benchmark_key,\s*\(metadata ->> 'candidate_operation_id'\)\s*\) NULLS NOT DISTINCT/,
    )
    expect(forward).toContain("WHERE is_active = TRUE AND metadata ->> 'candidate_operation_id' IS NOT NULL")
    expect(forward).toContain("RAISE EXCEPTION 'migration 324 blocked: duplicate active duration benchmark candidate operations exist'")

    expect(forward).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_structured_cause_task_active_primary')
    expect(forward).toContain("subject_type = 'task'")
    expect(forward).toContain("event_type IN ('delay', 'completion')")
    expect(forward).toContain("status IN ('candidate', 'confirmed')")
    expect(forward).toContain("cause_role = 'primary'")
    expect(forward).toContain("RAISE EXCEPTION 'migration 324 blocked: duplicate active task primary causes exist'")

    expect(forward).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_id_company_id_for_duration_benchmarks')
    expect(forward).toContain('ADD CONSTRAINT duration_benchmarks_project_company_fk')
    expect(forward).toContain('FOREIGN KEY (project_id, company_id)')
    expect(forward).toContain('REFERENCES public.projects(id, company_id)')
    expect(forward).toContain('ON UPDATE RESTRICT')
    expect(rollback).toContain('DROP CONSTRAINT IF EXISTS duration_benchmarks_project_company_fk')
    expect(rollback).toContain('DROP INDEX IF EXISTS public.uq_duration_benchmarks_candidate_operation')
    expect(rollback).toContain('DROP INDEX IF EXISTS public.uq_structured_cause_task_active_primary')
    expect(rollback).toContain('DROP INDEX IF EXISTS public.uq_projects_id_company_id_for_duration_benchmarks')
    expect(clean).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmarks_candidate_operation')
  })

  it('provides an exact rollback limited to migration 324 objects', () => {
    const rollbackPath = resolve(serverRoot, 'migrations', 'rollback', migrationName)

    expect(existsSync(rollbackPath)).toBe(true)
    const rollback = readSql('migrations', 'rollback', migrationName)
    expect(rollback).toMatch(
      /IF to_regclass\('public\.duration_benchmark_cause_segments'\) IS NOT NULL THEN[\s\S]*EXECUTE 'DROP POLICY IF EXISTS duration_benchmark_cause_segments_member_read ON public\.duration_benchmark_cause_segments'[\s\S]*EXECUTE 'DROP POLICY IF EXISTS duration_benchmark_cause_segments_backend_runtime ON public\.duration_benchmark_cause_segments'[\s\S]*EXECUTE 'DROP TRIGGER IF EXISTS ensure_duration_benchmark_cause_segment_scope_trigger ON public\.duration_benchmark_cause_segments'[\s\S]*END IF/,
    )
    expect(rollback).toMatch(
      /IF to_regclass\('public\.duration_benchmarks'\) IS NOT NULL THEN\s+EXECUTE 'DROP TRIGGER IF EXISTS ensure_duration_benchmark_scope_trigger ON public\.duration_benchmarks';\s+EXECUTE 'DROP TRIGGER IF EXISTS prevent_duration_benchmark_scope_change_with_segments_trigger ON public\.duration_benchmarks';\s+END IF/,
    )
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.ensure_duration_benchmark_cause_segment_scope()')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.prevent_duration_benchmark_scope_change_with_segments()')
    expect(rollback).toContain('DROP TABLE IF EXISTS public.duration_benchmark_cause_segments')
    expect(rollback).toContain('ALTER TABLE IF EXISTS public.duration_benchmarks')
    expect(rollback).toContain('DROP COLUMN IF EXISTS generated_at')
    expect(rollback).toContain('DROP COLUMN IF EXISTS source_window_start')
    expect(rollback).toContain('DROP COLUMN IF EXISTS source_as_of')
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.duration_benchmarks')
    expect(rollback).not.toContain('DROP POLICY IF EXISTS duration_benchmarks_')

    const parentTriggerDrop = rollback.indexOf('DROP TRIGGER IF EXISTS prevent_duration_benchmark_scope_change_with_segments_trigger')
    const segmentTriggerDrop = rollback.indexOf('DROP TRIGGER IF EXISTS ensure_duration_benchmark_cause_segment_scope_trigger')
    const parentFunctionDrop = rollback.indexOf('DROP FUNCTION IF EXISTS public.prevent_duration_benchmark_scope_change_with_segments()')
    const segmentFunctionDrop = rollback.indexOf('DROP FUNCTION IF EXISTS public.ensure_duration_benchmark_cause_segment_scope()')
    const tableDrop = rollback.indexOf('DROP TABLE IF EXISTS public.duration_benchmark_cause_segments')
    const columnDrop = rollback.indexOf('ALTER TABLE IF EXISTS public.duration_benchmarks', tableDrop)

    expect(parentTriggerDrop).toBeGreaterThan(-1)
    expect(segmentTriggerDrop).toBeGreaterThan(-1)
    expect(parentFunctionDrop).toBeGreaterThan(parentTriggerDrop)
    expect(segmentFunctionDrop).toBeGreaterThan(segmentTriggerDrop)
    expect(tableDrop).toBeGreaterThan(parentFunctionDrop)
    expect(tableDrop).toBeGreaterThan(segmentFunctionDrop)
    expect(columnDrop).toBeGreaterThan(tableDrop)
  })

  it('keeps the exact migration 324 block immediately before migration 325', () => {
    const standaloneBody = readSql('migrations', migrationName).trim()
    const clean = readSql('migrations', 'CLEAN_MIGRATION_V4.sql')
    const sourceHeader = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = clean.indexOf(sourceHeader)
    const migration323Index = clean.indexOf('Source: 323_duration_learning_runtime_evidence_outbox.sql')
    const migration325Header = [
      '-- ============================================================',
      '-- Source: 325_duration_asset_review_queue.sql',
      '-- ============================================================',
    ].join('\n')
    const migration325Index = clean.indexOf(migration325Header, sourceIndex)
    const cleanMigration324Body = clean.slice(sourceIndex + sourceHeader.length, migration325Index).trim()

    expect(sourceIndex).toBeGreaterThan(migration323Index)
    expect(migration325Index).toBeGreaterThan(sourceIndex)
    expect(standaloneBody).toBe(cleanMigration324Body)
    expect(clean).toContain('CANONICAL: current clean bootstrap bundle, synchronized through migration 325')
  })
})
