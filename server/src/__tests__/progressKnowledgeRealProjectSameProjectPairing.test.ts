import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const pairingScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-real-project-same-project-pairing.mjs',
)

const pairingPackagePath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'same-project-pairing',
  'progress-knowledge-real-project-same-project-pairing-package.json',
)

const pairingReportPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'same-project-pairing',
  'progress-knowledge-real-project-same-project-pairing-report.md',
)

const pairingNoopSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'same-project-pairing',
  'progress-knowledge-real-project-same-project-pairing-noop.sql',
)

const expectedOfficialEvidenceCounts = {
  ggzy_wuhan_baishazhou_railway_schedule_clarification_20260308: 1,
  ggzy_wangkui_grain_infrastructure_schedule_clarification_20260330: 3,
  ggzy_dongguan_chashan_industrial_park_schedule_qa_20260618: 2,
  ggzy_dongguan_grain_wharf_upgrade_candidate_schedule_20260208: 2,
  ggzy_heilongjiang_road_quality_upgrade_schedule_20260624: 1,
} as const

describe('external progress knowledge real project same-project pairing package', () => {
  beforeAll(() => {
    expect(existsSync(pairingScript)).toBe(true)
    execFileSync('node', [pairingScript], { cwd: workspaceRoot, stdio: 'pipe' })
  })

  it('builds official same-project pairing candidates without replay or runtime writes', () => {
    expect(existsSync(pairingPackagePath)).toBe(true)
    expect(existsSync(pairingReportPath)).toBe(true)

    const dataset = JSON.parse(readFileSync(pairingPackagePath, 'utf8'))
    const candidates = dataset.pairingCandidates ?? []
    const artifacts = dataset.evidenceArtifacts ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-real-project-same-project-pairing/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe('same_project_pairing_candidate_review_before_replay_input')
    expect(dataset.ingestionPolicy.mutationBoundary).toBe(
      'same_project_pairing_candidate_only_no_replay_no_runtime_sample_no_business_fact_write',
    )
    expect(dataset.ingestionPolicy.requiredNextGate).toContain('actual progress')

    expect(dataset.summary).toMatchObject({
      plannedScheduleCandidateCount: 5,
      evidenceLeadCount: 9,
      evidenceDownloadedOrCachedCount: 9,
      officialAwardOrContractPairingCount: 5,
      actualCompletionPairingCount: 0,
      blockedByFuturePlannedFinishCount: 5,
      replayInputReadyCount: 0,
      runtimeSampleWriteCount: 0,
      publicationReadinessCount: 0,
    })

    expect(candidates).toHaveLength(5)
    expect(artifacts).toHaveLength(9)

    for (const artifact of artifacts) {
      expect(artifact.sourceAuthority).toBe('official_public_resource_trading_page')
      expect(artifact.url).toContain('ggzy.gov.cn')
      expect(artifact.downloadStatus).toMatch(/^(downloaded_and_cached|cached_local_artifact)$/)
      expect(artifact.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(artifact.artifactPath).toMatch(
        /^project-search\/public-project-data\/real-project-sample-discovery\/same-project-pairing\/downloads\//,
      )
      expect(existsSync(resolve(workspaceRoot, artifact.artifactPath))).toBe(true)
      expect(artifact.extractionQuality.status).toBe('ready_for_same_project_pairing_review')
    }
  })

  it('keeps all same-project pairings candidate-only until actual completion evidence exists', () => {
    const dataset = JSON.parse(readFileSync(pairingPackagePath, 'utf8'))
    const bySourceKey = new Map<string, any>(
      (dataset.pairingCandidates ?? []).map((candidate: any) => [candidate.sourceKey, candidate]),
    )

    for (const [sourceKey, expectedCount] of Object.entries(expectedOfficialEvidenceCounts)) {
      const candidate = bySourceKey.get(sourceKey)
      expect(candidate).toBeTruthy()
      expect(candidate.pairingAssessment.officialAwardOrContractEvidenceCount).toBe(expectedCount)
      expect(candidate.pairingAssessment.awardOrContractEvidenceStatus).toBe(
        'official_award_or_tender_evidence_candidate_found',
      )
      expect(candidate.pairingAssessment.actualCompletionEvidenceStatus).toBe(
        'not_available_planned_finish_in_future',
      )
      expect(candidate.pairingAssessment.replayInputReady).toBe(false)
      expect(candidate.pairingAssessment.runtimeSampleWritten).toBe(false)
      expect(candidate.pairingAssessment.publicationReadinessGenerated).toBe(false)
      expect(candidate.pairingAssessment.blockedReasons).toEqual(expect.arrayContaining([
        'human_field_review_required',
        'planned_finish_date_is_in_future',
        'same_project_actual_or_completion_evidence_required_before_replay_input',
      ]))
      expect(candidate.nextRequiredSteps).toEqual(expect.arrayContaining([
        'human_same_project_pairing_review',
        'same_project_actual_or_completion_evidence_search_after_planned_finish',
        'replay_input_review_after_actual_pairing_only',
      ]))
    }
  })

  it('emits only a no-op SQL guard for same-project pairing review', () => {
    expect(existsSync(pairingNoopSqlPath)).toBe(true)
    const noopSql = readFileSync(pairingNoopSqlPath, 'utf8')

    expect(noopSql).toContain('same_project_pairing_candidate_only_no_replay_no_runtime_sample_no_business_fact_write')
    expect(noopSql).not.toContain('INSERT INTO')
    expect(noopSql).not.toContain('UPDATE public')

    for (const forbiddenTable of [
      'public.progress_asset_publication_readiness',
      'public.duration_experience_samples',
      'public.actual_duration_outcomes',
      'public.tasks',
      'public.task_baselines',
      'public.monthly_plans',
      'public.monthly_plan_items',
      'public.task_dependencies',
      'public.critical_path',
    ]) {
      expect(noopSql).not.toContain(`INSERT INTO ${forbiddenTable}`)
      expect(noopSql).not.toContain(`UPDATE ${forbiddenTable}`)
    }
  })
})
