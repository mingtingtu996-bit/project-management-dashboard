import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const migrationPath = resolve(
  workspaceRoot,
  'server',
  'migrations',
  '226_v14225_progress_knowledge_assets.sql',
)

describe('v1.4.22.5 progress knowledge asset migration', () => {
  it('creates connector-ready progress knowledge source, document, candidate, calibration and readiness tables', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    for (const tableName of [
      'public.progress_knowledge_sources',
      'public.progress_knowledge_documents',
      'public.progress_asset_candidates',
      'public.progress_asset_calibration_runs',
      'public.progress_asset_calibration_results',
      'public.progress_asset_publication_readiness',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`)
      expect(sql).toContain(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`)
    }

    expect(sql).toContain("'internal_knowledge_base'")
    expect(sql).toContain("'web_knowledge_base'")
    expect(sql).toContain("'api_connector'")
    expect(sql).toContain("'spreadsheet'")
    expect(sql).toContain("'duration_seed_candidate'")
    expect(sql).toContain("'process_interleaving_rule'")
    expect(sql).toContain("'wbs_template_candidate'")
    expect(sql).toContain("'context_correction_factor'")
    expect(sql).toContain("'business_type_schedule_model'")
    expect(sql).toContain("'resource_assumption'")
  })

  it('keeps external progress assets candidate-only until calibrated publication gates pass', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('progress_asset_candidates_no_history_sample_promotion')
    expect(sql).toContain("promotion_target <> 'duration_experience_samples'")
    expect(sql).toContain('candidate_only_no_business_fact_write')
    expect(sql).toContain('progress_asset_candidates_candidate_boundary')
    expect(sql).toContain("'auto_canary_ready'")
    expect(sql).toContain("'auto_canary_active'")
    expect(sql).toContain("'auto_published'")
    expect(sql).toContain("'runtime_rolled_back'")
    expect(sql).toContain("'guarded_runtime_auto_publish'")
    expect(sql).toContain("'auto_publish'")
    expect(sql).toContain('human_review_policy TEXT NOT NULL')
    expect(sql).toContain("'zero_human_review_when_gate_passes'")
    expect(sql).toContain("'batch_manual_approval_required'")
    expect(sql).toContain('release_job_policy TEXT NOT NULL')
    expect(sql).toContain("'enqueue_guarded_canary_release'")
    expect(sql).toContain("'hold_for_governance_batch'")
    expect(sql).toContain('target_writer_ref TEXT')
    expect(sql).toContain('consumer_refs TEXT[] NOT NULL')
    expect(sql).toContain('observation_window_days INTEGER NOT NULL')
    expect(sql).toContain('rollback_target JSONB NOT NULL')

    expect(sql).not.toContain('INSERT INTO public.duration_experience_samples')
    expect(sql).not.toContain('ALTER TABLE public.duration_experience_samples')
  })
})
