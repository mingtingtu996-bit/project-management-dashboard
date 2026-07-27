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

const candidatePackagePath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'candidate-review',
  'progress-knowledge-candidate-only-package.json',
)
const candidateReportPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'candidate-review',
  'progress-knowledge-candidate-only-report.md',
)
const candidateSeedPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'candidate-review',
  'progress-knowledge-candidate-only-seed.sql',
)

const approvedPagesBySource: Record<string, number[]> = {
  beijing_2018_construction_duration_quota: [53, 54, 55],
  guangdong_2022_construction_duration_quota: [37, 38, 39, 40, 41, 42],
  jiangsu_2026_construction_duration_quota: [13, 14, 15, 16, 17, 18, 19, 20, 21],
}

const progressKnowledgeBuildTimeoutMs = 120_000

describe('external progress knowledge candidate-only review package', () => {
  beforeAll(() => {
    if (!existsSync(candidateReviewScript)) return

    execFileSync('node', [sourceExpansionScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [sourceVerificationScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [extractionReviewScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [candidateReviewScript], { cwd: workspaceRoot, stdio: 'pipe' })
  }, progressKnowledgeBuildTimeoutMs)

  it('promotes only user-approved table pages into candidate-only assets', () => {
    expect(existsSync(candidateReviewScript)).toBe(true)
    expect(existsSync(candidatePackagePath)).toBe(true)
    expect(existsSync(candidateReportPath)).toBe(true)

    const dataset = JSON.parse(readFileSync(candidatePackagePath, 'utf8'))
    const candidates = dataset.candidates ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-candidate-only-review/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe('validated_table_cells_candidate_only_review_before_calibration')
    expect(dataset.ingestionPolicy.mutationBoundary).toBe('candidate_only_no_business_fact_write')
    expect(dataset.ingestionPolicy.nextPhase).toContain('calibration_results_then_publication_readiness')
    expect(dataset.summary.approvedDocumentCount).toBe(3)
    expect(dataset.summary.skippedDocumentCount).toBe(1)
    expect(dataset.summary.retainedClassificationReferenceCount).toBe(4)
    expect(candidates.length).toBeGreaterThan(150)

    const skippedSources = dataset.skippedDocuments.map((document: { sourceKey: string }) => document.sourceKey)
    expect(skippedSources).toEqual(['shanghai_2022_construction_duration_quota_notice'])

    const retainedPages = dataset.retainedClassificationReferences.map(
      (reference: { sourceKey: string, page: number, retentionStatus: string }) => ({
        sourceKey: reference.sourceKey,
        page: reference.page,
        retentionStatus: reference.retentionStatus,
      }),
    )
    expect(retainedPages).toEqual(expect.arrayContaining([
      {
        sourceKey: 'beijing_2018_construction_duration_quota',
        page: 41,
        retentionStatus: 'retained_as_classification_reference_not_duration_candidate',
      },
      {
        sourceKey: 'guangdong_2022_construction_duration_quota',
        page: 17,
        retentionStatus: 'retained_as_classification_reference_not_duration_candidate',
      },
      {
        sourceKey: 'guangdong_2022_construction_duration_quota',
        page: 31,
        retentionStatus: 'retained_as_classification_reference_not_duration_candidate',
      },
      {
        sourceKey: 'jiangsu_2026_construction_duration_quota',
        page: 10,
        retentionStatus: 'retained_as_classification_reference_not_duration_candidate',
      },
    ]))

    for (const candidate of candidates) {
      expect(Object.keys(approvedPagesBySource)).toContain(candidate.sourceKey)
      expect(approvedPagesBySource[candidate.sourceKey]).toContain(candidate.sourceLocator.page)
      expect(candidate.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(candidate.sourceLocator.documentKey).toBe(candidate.documentKey)
      expect(candidate.sourceLocator.sourceHash).toBe(candidate.sourceHash)
      expect(candidate.sourceLocator.tableIndex).toBeGreaterThanOrEqual(1)
      expect(candidate.sourceLocator.rowIndex).toBeGreaterThanOrEqual(1)
      expect(candidate.sourceLocator.cellLocator.length).toBeGreaterThan(0)
      expect(candidate.extractedValue.rawRow.length).toBeGreaterThan(0)
      expect(candidate.extractedValue.normalizedValue.quotaCode).toBeTruthy()
      expect(candidate.extractionQuality.status).toBe('table_cells_user_validated')
      expect(candidate.reviewStatus).toBe('user_page_validated_candidate_only')
      expect(candidate.governanceStatus).toBe('candidate_only')
      expect(candidate.calibrationStatus).toBe('not_run')
      expect(candidate.mutationBoundary).toBe('candidate_only_no_business_fact_write')
      expect(candidate.publicationReadiness).toBeUndefined()
    }

    expect(candidates.some((candidate: { sourceKey: string }) => (
      candidate.sourceKey === 'shanghai_2022_construction_duration_quota_notice'
    ))).toBe(false)
    const retainedReferenceKeys = new Set([
      'beijing_2018_construction_duration_quota:41',
      'guangdong_2022_construction_duration_quota:17',
      'guangdong_2022_construction_duration_quota:31',
      'jiangsu_2026_construction_duration_quota:10',
    ])
    expect(candidates.some((candidate: { sourceKey: string, sourceLocator: { page: number } }) => (
      retainedReferenceKeys.has(`${candidate.sourceKey}:${candidate.sourceLocator.page}`)
    ))).toBe(false)
  })

  it('normalizes representative approved table cells with source hash and page locators', () => {
    const dataset = JSON.parse(readFileSync(candidatePackagePath, 'utf8'))
    const candidates = dataset.candidates ?? []
    const findCandidate = (sourceKey: string, quotaCode: string) => candidates.find((candidate: any) => (
      candidate.sourceKey === sourceKey
      && candidate.extractedValue.normalizedValue.quotaCode === quotaCode
    ))

    const beijing = findCandidate('beijing_2018_construction_duration_quota', '1-1')
    expect(beijing.sourceLocator.page).toBe(53)
    expect(beijing.extractedValue.normalizedValue.foundationType).toBe('带形基础')
    expect(beijing.extractedValue.normalizedValue.areaCondition).toMatchObject({
      operator: '<=',
      value: 1000,
      unit: 'm2',
    })
    expect(beijing.extractedValue.normalizedValue.durationDays).toBe(45)
    expect(beijing.extractedValue.normalizedValue.structureDurationDays).toBe(45)

    const guangdong = findCandidate('guangdong_2022_construction_duration_quota', 'A1-1')
    expect(guangdong.sourceLocator.page).toBe(37)
    expect(guangdong.extractedValue.normalizedValue.foundationType).toBe('带形基础')
    expect(guangdong.extractedValue.normalizedValue.durationDaysBySoilClass).toEqual({
      soil_class_i_ii: 32,
      soil_class_iii_iv: 36,
    })

    const jiangsu = findCandidate('jiangsu_2026_construction_duration_quota', '1-1-1')
    expect(jiangsu.sourceLocator.page).toBe(13)
    expect(jiangsu.extractedValue.normalizedValue.foundationType).toBe('筏板基础、满堂基础')
    expect(jiangsu.extractedValue.normalizedValue.durationDays).toBe(40)
    expect(jiangsu.extractedValue.normalizedValue.structureDurationDays).toBe(36)
  })

  it('emits candidate-only SQL without calibration, readiness, or business fact writes', () => {
    expect(existsSync(candidateSeedPath)).toBe(true)
    const seedSql = readFileSync(candidateSeedPath, 'utf8')

    expect(seedSql).toContain('INSERT INTO public.progress_asset_candidates')
    expect(seedSql).toContain('candidate_only_no_business_fact_write')
    expect(seedSql).toContain('validated_table_cells_candidate_only_review_before_calibration')
    expect(seedSql).not.toContain('INSERT INTO public.progress_asset_calibration_results')
    expect(seedSql).not.toContain('INSERT INTO public.progress_asset_publication_readiness')

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
