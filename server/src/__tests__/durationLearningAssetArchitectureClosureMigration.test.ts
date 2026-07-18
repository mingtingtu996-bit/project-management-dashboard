import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const migrationName = '305_v14231_learning_asset_architecture_closure.sql'
const migrationPath = resolve(serverRoot, 'migrations', migrationName)
const rollbackPath = resolve(serverRoot, 'migrations', 'rollback', migrationName)

function readMigration(path: string) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

describe('v1.4.23.1 learning asset architecture closure migration', () => {
  it('persists explicit tenant, tier, reuse, fact and lineage identity on raw samples', () => {
    const sql = readMigration(migrationPath)

    for (const column of [
      'company_id',
      'experience_tier',
      'reuse_scope',
      'fact_source',
      'evidence_fingerprint',
      'source_lineage',
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`, 'i'))
    }

    expect(sql).toMatch(/UPDATE\s+public\.duration_experience_samples[\s\S]+FROM\s+public\.projects/i)
    expect(sql).toContain('duration_experience_samples_experience_tier_check')
    expect(sql).toContain('duration_experience_samples_reuse_scope_check')
    expect(sql).toContain('duration_experience_samples_fact_source_check')
    expect(sql).toContain('uq_duration_experience_samples_company_fingerprint')
    expect(sql).toContain('duration_experience_samples_auth_read_policy')
    expect(sql).toContain('duration_experience_samples_auth_write_policy')
    expect(sql).toContain('duration_experience_samples_backend_runtime_policy')
    expect(sql).toContain('duration_experience_samples.company_id')
    expect(sql).toContain('public.is_active_company_member')
  })

  it('creates a tenant-owned retry queue for missed task-completion samples', () => {
    const sql = readMigration(migrationPath)

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.duration_experience_collection_queue')
    for (const status of ['pending', 'retrying', 'waiting_for_facts', 'completed', 'dead_letter']) {
      expect(sql).toContain(`'${status}'`)
    }
    expect(sql).toContain('CONSTRAINT duration_experience_collection_queue_unique_task_source')
    expect(sql).toContain('idx_duration_experience_collection_queue_due')
    expect(sql).toContain('idx_duration_experience_collection_queue_project')
    expect(sql).toContain('ALTER TABLE public.duration_experience_collection_queue FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('duration_experience_collection_queue_backend_runtime')
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_experience_collection_queue TO workbuddy_runtime',
    )
    expect(sql).not.toMatch(/TO\s+(?:anon|authenticated)\b[\s\S]{0,160}duration_experience_collection_queue/i)
  })

  it('makes published project calibrations explicitly tenant-owned and runtime-writable only inside tenant policy', () => {
    const sql = readMigration(migrationPath)

    expect(sql).toMatch(/ALTER TABLE public\.project_productivity_compensation_calibrations[\s\S]+ADD COLUMN IF NOT EXISTS company_id/i)
    expect(sql).toMatch(/UPDATE public\.project_productivity_compensation_calibrations[\s\S]+FROM public\.projects/i)
    expect(sql).toContain('ensure_project_productivity_calibration_tenant')
    expect(sql).toContain('ensure_project_productivity_calibration_tenant_trigger')
    expect(sql).toContain('ALTER COLUMN company_id SET NOT NULL')
    expect(sql).toContain('idx_project_productivity_calibration_tenant_status')
    expect(sql).toContain('project_productivity_calibration_select_member')
    expect(sql).toContain('project_productivity_calibration_backend_runtime')
    expect(sql).toContain('TO workbuddy_runtime')
    expect(sql).toContain('public.is_active_company_member(company_id, NULL::TEXT[])')
  })

  it('implements tenant-filtered atomic approval and predecessor-restoring rollback', () => {
    const sql = readMigration(migrationPath)

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.approve_duration_context_policy_canary_candidate_atomic')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rollback_duration_context_policy_version_atomic')
    expect(sql).toMatch(/duration_context_policy_canary_candidates[\s\S]+company_id\s*=\s*p_company_id[\s\S]+FOR UPDATE/i)
    expect(sql).toMatch(/duration_context_policy_versions[\s\S]+company_id\s*=\s*p_company_id[\s\S]+FOR UPDATE/i)
    expect(sql).toContain("candidate_status = 'candidate'")
    expect(sql).toContain("version_status IN ('canary', 'published')")
    expect(sql).toContain("version_status = 'expired'")
    expect(sql).toContain("version_status = 'rolled_back'")
    expect(sql).toContain("IN ('canary', 'published')")
    expect(sql).toContain("ELSE 'published'")
    expect(sql).toContain('SET version_status = restore_status')
    expect(sql).toContain('supersededByCandidateId')
    expect(sql).toContain('SECURITY INVOKER')
    expect(sql).not.toContain('SECURITY DEFINER')
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.approve_duration_context_policy_canary_candidate_atomic',
    )
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.rollback_duration_context_policy_version_atomic',
    )
  })

  it('keeps rollback and the current clean bootstrap aligned with managed migration 305', () => {
    const migration = readMigration(migrationPath).trim()
    const rollback = readMigration(rollbackPath)
    const clean = readMigration(resolve(serverRoot, 'migrations', 'CLEAN_MIGRATION_V4.sql')).trim()
    const sourceHeader = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const bundledMigrationStart = clean.indexOf(sourceHeader) + sourceHeader.length
    const nextSourceHeader = clean.indexOf(
      '\n-- ============================================================\n-- Source: ',
      bundledMigrationStart,
    )
    const bundledMigration = clean
      .slice(bundledMigrationStart, nextSourceHeader < 0 ? undefined : nextSourceHeader)
      .trim()

    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.approve_duration_context_policy_canary_candidate_atomic')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.rollback_duration_context_policy_version_atomic')
    expect(rollback).toContain('DROP TABLE IF EXISTS public.duration_experience_collection_queue')
    expect(rollback).toContain('DROP POLICY IF EXISTS project_productivity_calibration_backend_runtime')
    expect(rollback).toContain('CREATE POLICY project_productivity_calibration_write_service_role')
    expect(clean).toContain('CANONICAL: current clean bootstrap bundle, synchronized through migration 321')
    expect(clean).toContain(sourceHeader)
    expect(bundledMigration).toBe(migration)
  })
})
