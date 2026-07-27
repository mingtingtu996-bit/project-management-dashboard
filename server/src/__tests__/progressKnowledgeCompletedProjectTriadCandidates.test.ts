import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const triadScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-completed-project-triad-candidates.mjs',
)

const triadPackagePath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'completed-project-triad',
  'progress-knowledge-completed-project-triad-candidates-package.json',
)

const triadReportPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'completed-project-triad',
  'progress-knowledge-completed-project-triad-candidates-report.md',
)

const triadNoopSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'completed-project-triad',
  'progress-knowledge-completed-project-triad-candidates-noop.sql',
)

const triadSeedSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'completed-project-triad',
  'progress-knowledge-completed-project-triad-candidates-seed.sql',
)

const triadFieldMappingReviewJsonPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'completed-project-triad',
  'progress-knowledge-completed-project-triad-field-mapping-review.json',
)

const triadFieldMappingReviewReportPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'completed-project-triad',
  'progress-knowledge-completed-project-triad-field-mapping-review.md',
)

const triadFieldMappingReviewCsvPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'completed-project-triad',
  'progress-knowledge-completed-project-triad-field-mapping-review.csv',
)

const expectedTriadDurations = {
  'real_project_sample:hunan-yunxi-green-chemical-parking': {
    contractDurationDays: 214,
    actualDurationDays: 756,
    varianceDays: 542,
  },
  'real_project_sample:hunan-jiangyong-xiangzhang-guandi-siteworks': {
    contractDurationDays: 122,
    actualDurationDays: 122,
    varianceDays: 0,
  },
  'real_project_sample:changde-chaoyang-gongguan-phase1-haoyu': {
    contractDurationDays: 724,
    actualDurationDays: 828,
    varianceDays: 104,
  },
  'real_project_sample:lengshuitan-phoenix-industrial-park-plant': {
    contractDurationDays: 427,
    actualDurationDays: 1035,
    varianceDays: 608,
  },
  'real_project_sample:daoxian-barracks': {
    contractDurationDays: 185,
    actualDurationDays: 590,
    varianceDays: 405,
  },
  'real_project_sample:nanxian-lida-middle-school': {
    contractDurationDays: 213,
    actualDurationDays: 277,
    varianceDays: 64,
  },
  'real_project_sample:lingling-science-innovation-industrial-park-phase2': {
    contractDurationDays: 547,
    actualDurationDays: 625,
    varianceDays: 78,
  },
  'real_project_sample:changsha-county-maotangpu-wastewater-plant': {
    contractDurationDays: 655,
    actualDurationDays: 1009,
    varianceDays: 354,
  },
  'real_project_sample:hunan-qiyang-shuangchuang-building': {
    contractDurationDays: 760,
    actualDurationDays: 1031,
    varianceDays: 271,
  },
  'real_project_sample:changde-chaoyang-gongguan-phase1': {
    contractDurationDays: 724,
    actualDurationDays: 750,
    varianceDays: 26,
  },
  'real_project_sample:zhongfang-nanhu-garden-phase3': {
    contractDurationDays: 730,
    actualDurationDays: 599,
    varianceDays: -131,
  },
} as const

describe('external progress knowledge completed project triad candidates', () => {
  beforeAll(() => {
    expect(existsSync(triadScript)).toBe(true)
    execFileSync('node', [triadScript], { cwd: workspaceRoot, stdio: 'pipe' })
  })

  it('builds completed-project triad candidates from official hashed performance artifacts', () => {
    expect(existsSync(triadPackagePath)).toBe(true)
    expect(existsSync(triadReportPath)).toBe(true)

    const dataset = JSON.parse(readFileSync(triadPackagePath, 'utf8'))
    const candidates = dataset.triadCandidates ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-completed-project-triad-candidates/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe(
      'completed_project_triad_candidate_review_before_replay_input_or_runtime_sample',
    )
    expect(dataset.ingestionPolicy.mutationBoundary).toBe(
      'completed_project_triad_candidate_only_no_replay_no_runtime_sample_no_business_fact_write',
    )
    expect(dataset.ingestionPolicy.requiredNextGate).toContain('human source')

    expect(dataset.summary).toMatchObject({
      triadCandidateCount: 11,
      officialSourceHashCount: 11,
      withPlannedOrContractDurationCount: 11,
      withActualDurationCount: 11,
      withScopeAndScaleCount: 11,
      replayInputCandidateAfterReviewCount: 11,
      replayInputWriteCount: 0,
      runtimeSampleWriteCount: 0,
      publicationReadinessCount: 11,
      manualPublicationReadinessCount: 11,
      autoCanaryReadyCount: 0,
    })
    expect(dataset.summary.byProjectCategory.building_engineering).toBe(9)
    expect(dataset.summary.byProjectCategory.municipal_public_works).toBe(2)

    for (const candidate of candidates) {
      expect(candidate.candidateKey).toMatch(/^completed_project_triad:/)
      expect(candidate.sourceEvidence.sourceUrl).toMatch(/^https?:\/\//)
      expect(candidate.sourceEvidence.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(candidate.sourceEvidence.localArtifactPath).toMatch(
        /^project-search\/public-project-data\/real-project-sample-discovery\/downloads\//,
      )
      expect(existsSync(resolve(workspaceRoot, candidate.sourceEvidence.localArtifactPath))).toBe(true)
      expect(candidate.triadEvidence.evidenceStatus).toBe(
        'official_performance_table_contains_contract_actual_and_scope_fields',
      )
      expect(candidate.replayInputAssessment.humanReviewRequired).toBe(true)
      expect(candidate.replayInputAssessment.replayInputWritten).toBe(false)
      expect(candidate.replayInputAssessment.runtimeSampleWritten).toBe(false)
      expect(candidate.replayInputAssessment.publicationReadinessGenerated).toBe(false)
    }
  })

  it('keeps exact planned-vs-actual duration deltas for replay-input review', () => {
    const dataset = JSON.parse(readFileSync(triadPackagePath, 'utf8'))
    const bySampleKey = new Map<string, any>(
      (dataset.triadCandidates ?? []).map((candidate: any) => [candidate.sampleKey, candidate]),
    )

    for (const [sampleKey, expected] of Object.entries(expectedTriadDurations)) {
      const candidate = bySampleKey.get(sampleKey)
      expect(candidate).toBeTruthy()
      expect(candidate.triadEvidence.contractDurationDays).toBe(expected.contractDurationDays)
      expect(candidate.triadEvidence.actualDurationDays).toBe(expected.actualDurationDays)
      expect(candidate.triadEvidence.varianceDays).toBe(expected.varianceDays)
      expect(candidate.replayInputAssessment.replayInputCandidateStatus).toBe(
        'candidate_after_human_source_and_field_review',
      )
      expect(candidate.replayInputAssessment.blockedReasons).toEqual(expect.arrayContaining([
        'human_source_review_required',
        'field_mapping_review_required_before_replay_input',
        'no_runtime_sample_or_business_fact_write_in_this_step',
      ]))
      expect(candidate.governance.nextRequiredSteps).toEqual(expect.arrayContaining([
        'human_source_and_field_review',
        'replay_input_schema_mapping_review',
        'conflict_and_outlier_review',
        'runtime_sample_candidate_review_after_approval_only',
      ]))
    }
  })

  it('emits a governed SQL seed for knowledge and asset tables only', () => {
    expect(existsSync(triadSeedSqlPath)).toBe(true)
    const seedSql = readFileSync(triadSeedSqlPath, 'utf8')

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

    expect(seedSql).toContain('completed_project_triad_candidate_only_no_replay_no_runtime_sample_no_business_fact_write')
    expect(seedSql).toContain('manual_governance_required')
    expect(seedSql).toContain('hold_for_governance_batch')
    expect(seedSql).toContain('public_project_realism_replay_input_candidate')
    expect(seedSql).toContain('replayInputWriteCount":0')
    expect(seedSql).toContain('runtimeSampleWriteCount":0')
    expect(seedSql).not.toContain('auto_canary_ready')
    expect(seedSql).not.toContain('enqueue_guarded_canary_release')

    const allowedDocumentTypes = new Set(['pdf', 'doc', 'docx', 'html', 'spreadsheet', 'api_record', 'database_snapshot'])
    const lines = seedSql.split(/\r?\n/)
    const documentTypes: string[] = []
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes('INSERT INTO public.progress_knowledge_documents')) continue
      const selectIndex = lines.findIndex((line, lineIndex) => lineIndex > index && line.trim() === 'source.id,')
      const documentTypeLine = lines[selectIndex + 3]?.trim()
      const documentType = documentTypeLine?.match(/^'([^']+)',$/)?.[1]
      if (documentType) documentTypes.push(documentType)
    }
    expect(documentTypes).toHaveLength(11)
    for (const documentType of documentTypes) {
      expect(allowedDocumentTypes.has(documentType)).toBe(true)
    }

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
      expect(seedSql).not.toContain(`DELETE FROM ${forbiddenTable}`)
    }
  })

  it('builds a field-mapping review package before replay input use', () => {
    expect(existsSync(triadFieldMappingReviewJsonPath)).toBe(true)
    expect(existsSync(triadFieldMappingReviewReportPath)).toBe(true)
    expect(existsSync(triadFieldMappingReviewCsvPath)).toBe(true)

    const review = JSON.parse(readFileSync(triadFieldMappingReviewJsonPath, 'utf8'))
    const reviewItems = review.reviewItems ?? []

    expect(review.schemaVersion).toBe('progress-knowledge-completed-project-triad-field-mapping-review/v1')
    expect(review.mutationBoundary).toBe('field_mapping_review_package_only_no_db_or_business_fact_write')
    expect(review.summary).toMatchObject({
      reviewItemCount: 11,
      sourceHashReadyCount: 11,
      fieldShapeReadyCount: 11,
      plannedOrContractDurationReadyCount: 11,
      actualDurationReadyCount: 11,
      scopeAndScaleReadyCount: 11,
      pendingHumanReviewCount: 11,
      replayInputWriteCount: 0,
      runtimeSampleWriteCount: 0,
      businessFactWriteCount: 0,
    })
    expect(review.summary.outlierReviewCount).toBeGreaterThanOrEqual(1)
    expect(review.reviewPolicy.currentDecision).toBe('pending_human_source_and_field_mapping_review')
    expect(review.reviewPolicy.requiredBeforeReplayInput).toEqual(expect.arrayContaining([
      'confirm_source_url_and_local_hash',
      'confirm_contract_duration_source_fields',
      'confirm_actual_duration_source_fields',
      'confirm_scope_scale_source_fields',
      'resolve_outlier_flags',
    ]))

    for (const item of reviewItems) {
      expect(item.candidateKey).toMatch(/^completed_project_triad:/)
      expect(item.sourceEvidence.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(item.reviewStatus.currentDecision).toBe('pending_human_source_and_field_mapping_review')
      expect(item.reviewStatus.replayInputWritten).toBe(false)
      expect(item.reviewStatus.runtimeSampleWritten).toBe(false)
      expect(item.reviewStatus.businessFactWritten).toBe(false)
      expect(item.reviewStatus.blockers).toEqual(expect.arrayContaining([
        'human_source_review_required',
        'field_mapping_review_required_before_replay_input',
        'no_runtime_sample_or_business_fact_write_in_this_step',
      ]))

      const mappedTargets = new Set((item.mappedFields ?? []).map((field: any) => field.targetField))
      expect(mappedTargets.has('schedule.contract.durationDaysInclusive')).toBe(true)
      expect(mappedTargets.has('schedule.actual.durationDaysInclusive')).toBe(true)
      expect(mappedTargets.has('scope.scaleText')).toBe(true)
    }

    const qiyang = reviewItems.find((item: any) => (
      item.candidateKey === 'completed_project_triad:hunan-qiyang-shuangchuang-building'
    ))
    expect(qiyang.durationSummary).toMatchObject({
      contractDurationDays: 760,
      actualDurationDays: 1031,
      varianceDays: 271,
    })
    expect(qiyang.scopeSummary.actualAreaSqm).toBe(100698.88)

    const reviewReport = readFileSync(triadFieldMappingReviewReportPath, 'utf8')
    expect(reviewReport).toContain('Review items | 11')
    expect(reviewReport).toContain('Replay input writes | 0')
    expect(reviewReport).toContain('pending_human_source_and_field_mapping_review')

    const csvRows = readFileSync(triadFieldMappingReviewCsvPath, 'utf8').trim().split(/\r?\n/)
    expect(csvRows).toHaveLength(12)
    expect(csvRows[0]).toContain('candidate_key,sample_key,project_name')
  })

  it('emits only a no-op SQL guard for completed project triad review', () => {
    expect(existsSync(triadNoopSqlPath)).toBe(true)
    const noopSql = readFileSync(triadNoopSqlPath, 'utf8')

    expect(noopSql).toContain('completed_project_triad_candidate_only_no_replay_no_runtime_sample_no_business_fact_write')
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
