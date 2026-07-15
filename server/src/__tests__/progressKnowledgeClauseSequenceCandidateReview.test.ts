import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { beforeAll, describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const scripts = {
  sourceExpansion: resolve(workspaceRoot, 'project-search', 'tools', 'build-progress-knowledge-source-expansion.mjs'),
  sourceVerification: resolve(workspaceRoot, 'project-search', 'tools', 'build-progress-knowledge-source-verification.mjs'),
  clauseSequenceReview: resolve(workspaceRoot, 'project-search', 'tools', 'build-progress-knowledge-clause-sequence-review.mjs'),
  clauseSequenceCandidateReview: resolve(
    workspaceRoot,
    'project-search',
    'tools',
    'build-progress-knowledge-clause-sequence-candidate-review.mjs',
  ),
}

const packagePath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'clause-sequence-candidate-review',
  'progress-knowledge-clause-sequence-candidate-only-package.json',
)
const reportPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'clause-sequence-candidate-review',
  'progress-knowledge-clause-sequence-candidate-only-report.md',
)
const seedSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'clause-sequence-candidate-review',
  'progress-knowledge-clause-sequence-candidate-only-seed.sql',
)

const progressKnowledgeBuildTimeoutMs = 900_000
const execFileAsync = promisify(execFile)

describe('external progress knowledge clause/sequence candidate-only mapping', () => {
  beforeAll(async () => {
    for (const script of Object.values(scripts)) {
      expect(existsSync(script)).toBe(true)
    }

    for (const script of Object.values(scripts)) {
      await execFileAsync('node', [script], {
        cwd: workspaceRoot,
        maxBuffer: 32 * 1024 * 1024,
      })
    }
  }, progressKnowledgeBuildTimeoutMs)

  it('maps auto-probed clause snippets into manual-governance candidate assets', () => {
    expect(existsSync(packagePath)).toBe(true)
    expect(existsSync(reportPath)).toBe(true)

    const dataset = JSON.parse(readFileSync(packagePath, 'utf8'))
    const candidates = dataset.candidates ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-clause-sequence-candidate-only-review/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe('clause_sequence_candidate_only_review_before_calibration')
    expect(dataset.ingestionPolicy.mutationBoundary).toBe('candidate_only_no_business_fact_write')
    expect(dataset.summary.candidateCount).toBe(candidates.length)
    expect(dataset.summary.candidateCount).toBeGreaterThanOrEqual(40)
    expect(dataset.summary.totalSnippetCount).toBe(
      candidates.reduce((sum: number, candidate: any) => sum + candidate.applicability.hitCount, 0),
    )
    expect(dataset.summary.totalSnippetCount).toBeGreaterThan(dataset.summary.candidateCount)
    expect(Number.isInteger(dataset.summary.conversionRequiredCount)).toBe(true)
    expect(dataset.summary.conversionRequiredCount).toBeGreaterThanOrEqual(0)
    expect(dataset.summary.publicationReadinessCount).toBe(0)

    const byAssetType = candidates.reduce((acc: Record<string, number>, candidate: any) => {
      acc[candidate.assetType] = (acc[candidate.assetType] ?? 0) + 1
      return acc
    }, {})
    expect(dataset.summary.byAssetType).toEqual(byAssetType)
    for (const assetType of [
      'business_type_schedule_model',
      'process_interleaving_rule',
      'resource_assumption',
      'context_correction_factor',
    ]) {
      expect(dataset.summary.byAssetType[assetType]).toBeGreaterThan(0)
    }

    for (const candidate of candidates) {
      expect(candidate.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(candidate.sourceLocator.sourceHash).toBe(candidate.sourceHash)
      expect(candidate.sourceLocator.artifactPath).toBeTruthy()
      expect(candidate.extractedValue.valueType).toBe('clause_sequence_knowledge_candidate')
      expect(candidate.extractedValue.evidenceSnippets.length).toBeGreaterThan(0)
      expect(candidate.extractionQuality.status).toBe('auto_clause_sequence_probe_candidate_requires_human_review')
      expect(candidate.reviewStatus).toBe('auto_clause_sequence_candidate_requires_human_review')
      expect(candidate.governanceStatus).toBe('manual_governance_required')
      expect(candidate.calibrationStatus).toBe('not_run')
      expect(candidate.mutationBoundary).toBe('candidate_only_no_business_fact_write')
      expect(candidate.nextRequiredSteps).toContain('human_clause_review')
      expect(candidate.nextRequiredSteps).toContain('publication_readiness_after_calibration_only')
    }
  })

  it('emits candidate-only SQL without calibration, readiness, runtime, or business fact writes', () => {
    expect(existsSync(seedSqlPath)).toBe(true)
    const seedSql = readFileSync(seedSqlPath, 'utf8')

    expect(seedSql).toContain('INSERT INTO public.progress_asset_candidates')
    expect(seedSql).toContain('manual_governance_required')
    expect(seedSql).toContain('candidate_only_no_business_fact_write')
    expect(seedSql).toContain('clause_sequence_candidate_only_review_before_calibration')
    expect(seedSql).not.toContain('INSERT INTO public.progress_asset_calibration_results')
    expect(seedSql).not.toContain('INSERT INTO public.progress_asset_publication_readiness')

    for (const forbiddenTable of [
      'public.duration_experience_samples',
      'public.actual_duration_outcomes',
      'public.tasks',
      'public.task_baselines',
      'public.monthly_plans',
      'public.monthly_plan_items',
      'public.task_dependencies',
      'public.critical_path',
    ]) {
      expect(seedSql).not.toContain(`INSERT INTO ${forbiddenTable}`)
      expect(seedSql).not.toContain(`UPDATE ${forbiddenTable}`)
    }
  })
})
