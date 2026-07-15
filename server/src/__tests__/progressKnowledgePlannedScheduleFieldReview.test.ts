import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const plannedScheduleScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-planned-schedule-field-review.mjs',
)

const plannedSchedulePackagePath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'progress-knowledge-planned-schedule-field-review-package.json',
)

const plannedScheduleReportPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'progress-knowledge-planned-schedule-field-review-report.md',
)

const plannedScheduleNoopSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'progress-knowledge-planned-schedule-field-review-noop.sql',
)

const publicDownloadPrefix = 'project-search/public-project-data/real-project-sample-discovery/downloads/'

const expectedGgzyScheduleFields = {
  ggzy_wuhan_baishazhou_railway_schedule_clarification_20260308: {
    durationDays: null,
    plannedStartDate: '2026-03-31',
    plannedFinishDate: '2031-03-30',
  },
  ggzy_wangkui_grain_infrastructure_schedule_clarification_20260330: {
    durationDays: 224,
    plannedStartDate: '2026-04-20',
    plannedFinishDate: '2026-11-30',
  },
  ggzy_dongguan_chashan_industrial_park_schedule_qa_20260618: {
    durationDays: 1195,
    plannedStartDate: '2026-08-31',
    plannedFinishDate: '2029-12-08',
  },
  ggzy_dongguan_grain_wharf_upgrade_candidate_schedule_20260208: {
    durationDays: 365,
    plannedStartDate: '2026-02-28',
    plannedFinishDate: '2027-02-27',
  },
  ggzy_heilongjiang_road_quality_upgrade_schedule_20260624: {
    durationDays: 128,
    plannedStartDate: '2026-06-26',
    plannedFinishDate: '2026-10-31',
  },
} as const

describe('external progress knowledge planned schedule field review package', () => {
  beforeAll(() => {
    expect(existsSync(plannedScheduleScript)).toBe(true)
    execFileSync('node', [plannedScheduleScript], { cwd: workspaceRoot, stdio: 'pipe' })
  }, 30_000)

  it('builds a planned schedule field-review package without creating replay or runtime writes', () => {
    expect(existsSync(plannedSchedulePackagePath)).toBe(true)
    expect(existsSync(plannedScheduleReportPath)).toBe(true)

    const dataset = JSON.parse(readFileSync(plannedSchedulePackagePath, 'utf8'))
    const candidates = dataset.fieldCandidates ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-planned-schedule-field-review/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe('field_review_before_replay_or_runtime_sample_candidate')
    expect(dataset.ingestionPolicy.mutationBoundary).toBe(
      'planned_schedule_field_review_only_no_replay_no_runtime_sample_no_business_fact_write',
    )
    expect(dataset.ingestionPolicy.requiredNextGate).toContain('same-project award/contract evidence')

    expect(dataset.summary.sourceDocumentCount).toBeGreaterThanOrEqual(13)
    expect(dataset.summary.fieldCandidateCount).toBeGreaterThanOrEqual(13)
    expect(dataset.summary.withDurationDays).toBeGreaterThanOrEqual(9)
    expect(dataset.summary.withPlannedStartDate).toBeGreaterThanOrEqual(10)
    expect(dataset.summary.withPlannedFinishDate).toBeGreaterThanOrEqual(10)
    expect(dataset.summary.runtimeSampleWriteCount).toBe(0)
    expect(dataset.summary.publicationReadinessCount).toBe(0)

    for (const candidate of candidates) {
      expect(candidate.candidateKey).toMatch(/^planned_schedule_field_review:/)
      expect(candidate.sourceKey).toBeTruthy()
      expect(candidate.sourceUrl).toMatch(/^https?:\/\//)
      expect(candidate.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(candidate.extractionQuality.status).toBe('auto_field_probe_requires_human_review')
      expect(candidate.governance.reviewStatus).toBe('planned_schedule_field_review_candidate_only')
      expect(candidate.governance.replayInputReady).toBe(false)
      expect(candidate.governance.publicationReadinessGenerated).toBe(false)
      expect(candidate.governance.runtimeSampleWritten).toBe(false)
      expect(candidate.nextRequiredSteps).toEqual(expect.arrayContaining([
        'human_field_review',
        'same_project_award_or_contract_evidence_pairing',
        'same_project_actual_or_completion_evidence_pairing',
        'replay_input_review_after_pairing_only',
      ]))
    }
  })

  it('keeps the GGZY planned-duration samples traceable in public-project-data', () => {
    const dataset = JSON.parse(readFileSync(plannedSchedulePackagePath, 'utf8'))
    const bySourceKey = new Map<string, any>(
      (dataset.fieldCandidates ?? []).map((candidate: any) => [candidate.sourceKey, candidate]),
    )

    for (const [sourceKey, expectedFields] of Object.entries(expectedGgzyScheduleFields)) {
      const candidate = bySourceKey.get(sourceKey)
      expect(candidate).toBeTruthy()
      expect(candidate.sourceAuthority).toBe('official_public_resource_trading_page')
      expect(candidate.sourceUrl).toContain('ggzy.gov.cn')
      expect(candidate.artifactPath).toMatch(new RegExp(`^${publicDownloadPrefix}`))
      expect(existsSync(resolve(workspaceRoot, candidate.artifactPath))).toBe(true)
      expect(candidate.plannedSchedule).toMatchObject(expectedFields)
      expect(candidate.evidenceText.length).toBeGreaterThan(20)
    }
  })

  it('emits only a no-op SQL guard for planned schedule field review', () => {
    expect(existsSync(plannedScheduleNoopSqlPath)).toBe(true)
    const noopSql = readFileSync(plannedScheduleNoopSqlPath, 'utf8')

    expect(noopSql).toContain('planned_schedule_field_review_only_no_replay_no_runtime_sample_no_business_fact_write')
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
