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
  clauseSequenceReadiness: resolve(
    workspaceRoot,
    'project-search',
    'tools',
    'build-progress-knowledge-clause-sequence-readiness.mjs',
  ),
}

const packagePath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'clause-sequence-readiness',
  'progress-knowledge-clause-sequence-readiness-package.json',
)
const reportPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'clause-sequence-readiness',
  'progress-knowledge-clause-sequence-readiness-report.md',
)
const seedSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'clause-sequence-readiness',
  'progress-knowledge-clause-sequence-readiness-seed.sql',
)

const execFileAsync = promisify(execFile)
const progressKnowledgeBuildTimeoutMs = 900_000

describe('external progress knowledge clause/sequence readiness preflight', () => {
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

  it('creates manual-governance calibration and readiness rows for every clause candidate', () => {
    expect(existsSync(packagePath)).toBe(true)
    expect(existsSync(reportPath)).toBe(true)

    const dataset = JSON.parse(readFileSync(packagePath, 'utf8'))
    const calibrationResults = dataset.calibrationResults ?? []
    const publicationReadiness = dataset.publicationReadiness ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-clause-sequence-readiness/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe(
      'clause_sequence_readiness_preflight_manual_governance_before_any_runtime_publication',
    )
    expect(dataset.ingestionPolicy.mutationBoundary).toBe('readiness_preflight_only_no_business_fact_write')
    expect(dataset.ingestionPolicy.forbiddenWrites).toEqual(expect.arrayContaining([
      'duration_experience_samples',
      'tasks',
      'task_dependencies',
      'critical_path',
      'published_runtime_overlay',
    ]))

    expect(dataset.summary.candidateCount).toBeGreaterThanOrEqual(40)
    expect(dataset.summary.candidateCount).toBe(calibrationResults.length)
    expect(dataset.summary.calibrationResultCount).toBe(calibrationResults.length)
    expect(dataset.summary.publicationReadinessCount).toBe(publicationReadiness.length)
    expect(publicationReadiness.length).toBe(calibrationResults.length)
    expect(dataset.summary.autoCanaryReadyCount).toBe(0)
    expect(dataset.summary.byReadinessStatus).toEqual({ manual_governance_required: publicationReadiness.length })
    expect(dataset.summary.byRecommendedAction).toEqual({ manual_governance_required: calibrationResults.length })
    expect(dataset.summary.byReleaseJobPolicy).toEqual({ hold_for_governance_batch: publicationReadiness.length })

    for (const result of calibrationResults) {
      expect(result.candidateKey).toBeTruthy()
      expect(result.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(result.mappingStatus).toBe('ambiguous_mapping')
      expect(result.replayStatus).toBe('needs_runtime_sample')
      expect(result.recommendedAction).toBe('manual_governance_required')
      expect(result.evidence.blockers).toContain('human_clause_review_not_completed')
      expect(result.evidence.blockers).toContain('writer_and_rollback_gate_not_authorized')
      expect(result.evidence.mutationBoundary).toBe('readiness_preflight_only_no_business_fact_write')
    }

    for (const readiness of publicationReadiness) {
      expect(readiness.readinessStatus).toBe('manual_governance_required')
      expect(readiness.publishAnchor).toBe('manual_governance_required')
      expect(readiness.automationMaturity).toBe('manual_required')
      expect(readiness.humanReviewPolicy).toBe('batch_manual_approval_required')
      expect(readiness.releaseJobPolicy).toBe('hold_for_governance_batch')
      expect(readiness.observationWindowDays).toBe(0)
      expect(readiness.targetWriterRef).toBeNull()
      expect(readiness.rollbackTarget.required).toBe(false)
      expect(readiness.impactMonitoringPlan.status).toBe('not_started')
      expect(readiness.publicationPayload.status).toBe('not_publishable_until_manual_governance_passes')
      expect(readiness.readinessEvidence.blockers).toContain('no_replay_or_shadow_result_for_clause_knowledge')
    }
  })

  it('emits readiness SQL only for progress knowledge tables and never runtime/business fact writes', () => {
    expect(existsSync(seedSqlPath)).toBe(true)
    const seedSql = readFileSync(seedSqlPath, 'utf8')

    expect(seedSql).toContain('INSERT INTO public.progress_asset_calibration_runs')
    expect(seedSql).toContain('INSERT INTO public.progress_asset_calibration_results')
    expect(seedSql).toContain('INSERT INTO public.progress_asset_publication_readiness')
    expect(seedSql).toContain('DELETE FROM public.progress_asset_publication_readiness')
    expect(seedSql).toContain('manual_governance_required')
    expect(seedSql).toContain('hold_for_governance_batch')
    expect(seedSql).toContain('readiness_preflight_only_no_business_fact_write')
    expect(seedSql).not.toContain('auto_canary_ready')
    expect(seedSql).not.toContain('enqueue_guarded_canary_release')

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
      expect(seedSql).not.toContain(`DELETE FROM ${forbiddenTable}`)
    }
  })
})
