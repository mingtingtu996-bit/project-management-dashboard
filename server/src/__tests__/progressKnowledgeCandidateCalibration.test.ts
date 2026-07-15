import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const sourceExpansionScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-source-expansion.mjs',
)
const sourceVerificationScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-source-verification.mjs',
)
const extractionReviewScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-extraction-review.mjs',
)
const candidateReviewScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-candidate-review.mjs',
)
const calibrationScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-candidate-calibration.mjs',
)

const calibrationPackagePath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'candidate-calibration',
  'progress-knowledge-candidate-calibration-package.json',
)
const calibrationReportPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'candidate-calibration',
  'progress-knowledge-candidate-calibration-report.md',
)
const calibrationSeedPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'candidate-calibration',
  'progress-knowledge-candidate-calibration-seed.sql',
)

const progressKnowledgeBuildTimeoutMs = 120_000

describe('external progress knowledge candidate calibration review package', () => {
  beforeAll(() => {
    if (!existsSync(calibrationScript)) return

    execFileSync('node', [sourceExpansionScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [sourceVerificationScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [extractionReviewScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [candidateReviewScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [calibrationScript], { cwd: workspaceRoot, stdio: 'pipe' })
  }, progressKnowledgeBuildTimeoutMs)

  it('builds calibration results for all candidate-only assets without publication readiness', () => {
    expect(existsSync(calibrationScript)).toBe(true)
    expect(existsSync(calibrationPackagePath)).toBe(true)
    expect(existsSync(calibrationReportPath)).toBe(true)

    const dataset = JSON.parse(readFileSync(calibrationPackagePath, 'utf8'))
    const results = dataset.calibrationResults ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-candidate-calibration/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe('candidate_mapping_calibration_conflict_review_before_publication_readiness')
    expect(dataset.ingestionPolicy.mutationBoundary).toBe('calibration_results_only_no_publication_readiness_or_business_fact_write')
    expect(dataset.ingestionPolicy.nextPhase).toContain('publication_readiness_only_after')
    expect(dataset.ingestionPolicy.forbiddenWrites).toEqual(expect.arrayContaining([
      'progress_asset_publication_readiness',
      'duration_experience_samples',
      'task_dependencies',
      'critical_path',
    ]))

    expect(dataset.summary.candidateCount).toBe(385)
    expect(dataset.summary.calibrationResultCount).toBe(385)
    expect(dataset.summary.publicationReadinessCount).toBe(0)
    expect(dataset.summary.byRecommendedAction.auto_canary_ready ?? 0).toBe(0)
    expect(dataset.summary.conflictGroupCount).toBeGreaterThan(0)

    for (const result of results) {
      expect(result.candidateKey).toBeTruthy()
      expect(result.sourceKey).toMatch(/^(beijing|guangdong|jiangsu)_/)
      expect(result.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(result.sourceLocator.page).toBeGreaterThan(0)
      expect(result.candidateValue.normalizedValue.quotaCode).toBeTruthy()
      expect(result.mappingStatus).toMatch(/^(matched_existing_asset|gap_no_current_asset|ambiguous_mapping|blocked_conflict)$/)
      expect(result.replayStatus).toMatch(/^(not_run|needs_runtime_sample)$/)
      expect(result.replayStatus).not.toBe('shadow_blocked_no_internal_sample')
      expect(result.recommendedAction).toMatch(/^(manual_governance_required|candidate_only|blocked)$/)
      expect(result.evidence.requiresHumanCalibrationReview).toBe(true)
      expect(result.evidence.publicationReadinessGenerated).toBe(false)
      expect(result.evidence.conflictCheck.status).toMatch(/^(no_conflict|regional_variant_conflict|duplicate_scope_review_required)$/)
      expect(result.evidence.replayGate.originalStatus).toMatch(/^(needs_runtime_sample|shadow_blocked_no_internal_sample)$/)
      expect(result.publicationReadiness).toBeUndefined()
    }
  })

  it('keeps representative approved rows traceable through mapping and replay gates', () => {
    const dataset = JSON.parse(readFileSync(calibrationPackagePath, 'utf8'))
    const results = dataset.calibrationResults ?? []
    const findResult = (sourceKey: string, quotaCode: string) => results.find((result: any) => (
      result.sourceKey === sourceKey
      && result.candidateValue.normalizedValue.quotaCode === quotaCode
    ))

    const beijing = findResult('beijing_2018_construction_duration_quota', '1-1')
    expect(beijing.sourceLocator.page).toBe(53)
    expect(beijing.mappingStatus).toBe('matched_existing_asset')
    expect(beijing.currentAssetRef).toContain('standard_work_duration_seed')
    expect(beijing.candidateValue.normalizedValue.durationDays).toBe(45)
    expect(beijing.recommendedAction).toBe('manual_governance_required')

    const guangdong = findResult('guangdong_2022_construction_duration_quota', 'A1-1')
    expect(guangdong.sourceLocator.page).toBe(37)
    expect(guangdong.mappingStatus).toBe('matched_existing_asset')
    expect(guangdong.candidateValue.normalizedValue.durationDaysBySoilClass).toEqual({
      soil_class_i_ii: 32,
      soil_class_iii_iv: 36,
    })
    expect(guangdong.evidence.replayGate.blockers).toContain('soil_class_split_requires_mapping_review')

    const jiangsu = findResult('jiangsu_2026_construction_duration_quota', '1-1-1')
    expect(jiangsu.sourceLocator.page).toBe(13)
    expect(jiangsu.mappingStatus).toBe('matched_existing_asset')
    expect(jiangsu.candidateValue.normalizedValue.durationDays).toBe(40)
    expect(jiangsu.candidateValue.normalizedValue.structureDurationDays).toBe(36)
    expect(jiangsu.evidence.conflictCheck.groupKey).toContain('below_zero_no_basement')
  })

  it('emits calibration SQL only and keeps readiness/business writes out', () => {
    expect(existsSync(calibrationSeedPath)).toBe(true)
    const seedSql = readFileSync(calibrationSeedPath, 'utf8')

    expect(seedSql).toContain('INSERT INTO public.progress_asset_calibration_runs')
    expect(seedSql).toContain('INSERT INTO public.progress_asset_calibration_results')
    expect(seedSql).toContain('candidate_mapping_calibration_conflict_review_before_publication_readiness')
    expect(seedSql).toContain('calibration_results_only_no_publication_readiness_or_business_fact_write')
    expect(seedSql).not.toContain('INSERT INTO public.progress_asset_publication_readiness')
    expect(seedSql).not.toContain('UPDATE public.progress_asset_publication_readiness')
    expect(seedSql).not.toContain("'shadow_blocked_no_internal_sample'")

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
