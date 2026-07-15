import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const datasetPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'validation',
  'candidate-progress-assets.json',
)
const seedSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'validation',
  'candidate-progress-assets-seed.sql',
)

describe('external progress knowledge validation dataset', () => {
  it('contains a bounded 50-100 record calibration sample with required source and asset coverage', () => {
    expect(existsSync(datasetPath)).toBe(true)
    const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'))
    const assets = dataset.assets ?? []

    expect(assets.length).toBeGreaterThanOrEqual(50)
    expect(assets.length).toBeLessThanOrEqual(100)

    expect(new Set(dataset.sources.map((source: { sourceKey: string }) => source.sourceKey))).toEqual(new Set([
      'cscec5_shandong_duration_standardization_manual',
      'beijing_2018_construction_duration_quota',
      'guangdong_2022_construction_duration_quota',
      'hubei_prefab_lean_construction_standard_draft',
    ]))

    for (const assetType of [
      'duration_seed_candidate',
      'process_interleaving_rule',
      'wbs_template_candidate',
      'context_correction_factor',
      'business_type_schedule_model',
      'resource_assumption',
    ]) {
      expect(assets.some((asset: { assetType: string }) => asset.assetType === assetType)).toBe(true)
    }
  })

  it('separates automatic publication readiness from manual governance and candidate-only review', () => {
    const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'))
    const assets = dataset.assets ?? []

    expect(assets.some((asset: any) => asset.publicationReadiness?.readinessStatus === 'auto_canary_ready')).toBe(true)
    expect(assets.some((asset: any) => asset.publicationReadiness?.readinessStatus === 'manual_governance_required')).toBe(true)
    expect(assets.some((asset: any) => asset.publicationReadiness?.readinessStatus === 'candidate_only')).toBe(true)
    expect(assets.some((asset: any) => asset.publicationReadiness?.releaseJobPolicy === 'enqueue_guarded_canary_release')).toBe(true)
    expect(assets.some((asset: any) => asset.publicationReadiness?.releaseJobPolicy === 'hold_for_governance_batch')).toBe(true)
    expect(assets.some((asset: any) => asset.publicationReadiness?.humanReviewPolicy === 'zero_human_review_when_gate_passes')).toBe(true)

    for (const asset of assets) {
      expect(asset.mutationBoundary).toContain('no_business_fact_write')
      expect(asset.promotionTarget).not.toBe('duration_experience_samples')
      expect(asset.calibrationResult?.recommendedAction).toBeTruthy()
      expect(asset.currentSystemCoverage?.mappingStatus).toBeTruthy()
    }

    for (const asset of assets.filter((item: any) => item.publicationReadiness?.readinessStatus === 'auto_canary_ready')) {
      expect(asset.publicationReadiness.humanReviewPolicy).toBe('zero_human_review_when_gate_passes')
      expect(asset.publicationReadiness.releaseJobPolicy).toBe('enqueue_guarded_canary_release')
      expect(asset.publicationReadiness.targetWriterRef).toBeTruthy()
      expect(asset.publicationReadiness.consumerRefs.length).toBeGreaterThan(0)
      expect(asset.publicationReadiness.observationWindowDays).toBeGreaterThan(0)
      expect(asset.publicationReadiness.rollbackTarget.required).toBe(true)
    }

    expect(dataset.currentSystemSnapshot.files.durationSuggestionService).toContain('durationSuggestionService.ts')
    expect(dataset.currentSystemSnapshot.files.taskDurationForecastService).toContain('taskDurationForecastService.ts')
    expect(dataset.summary.gapSummary.totalGapAssets).toBeGreaterThan(0)
    expect(Object.keys(dataset.summary.gapSummary.byBusinessType).length).toBeGreaterThan(0)
    expect(Object.keys(dataset.summary.gapSummary.byPhaseCode).length).toBeGreaterThan(0)
    expect(Object.keys(dataset.summary.gapSummary.byRegionCode).length).toBeGreaterThan(0)
    expect(Object.keys(dataset.summary.gapSummary.byMethodCode).length).toBeGreaterThan(0)
  })

  it('emits a bounded SQL seed package for small-scale validation without writing business facts', () => {
    expect(existsSync(seedSqlPath)).toBe(true)
    const seedSql = readFileSync(seedSqlPath, 'utf8')

    for (const tableName of [
      'public.progress_knowledge_sources',
      'public.progress_knowledge_documents',
      'public.progress_asset_candidates',
      'public.progress_asset_calibration_runs',
      'public.progress_asset_calibration_results',
      'public.progress_asset_publication_readiness',
    ]) {
      expect(seedSql).toContain(`INSERT INTO ${tableName}`)
    }

    expect(seedSql).toContain('ON CONFLICT')
    expect(seedSql).toContain('enqueue_guarded_canary_release')
    expect(seedSql).toContain('zero_human_review_when_gate_passes')
    expect(seedSql).toContain('candidate_only_no_business_fact_write')

    for (const forbiddenTable of [
      'public.duration_experience_samples',
      'public.tasks',
      'public.task_baselines',
      'public.monthly_plans',
      'public.monthly_plan_items',
      'public.task_dependencies',
      'public.actual_duration_outcomes',
      'public.critical_path',
    ]) {
      expect(seedSql).not.toContain(`INSERT INTO ${forbiddenTable}`)
      expect(seedSql).not.toContain(`UPDATE ${forbiddenTable}`)
    }
  })
})
