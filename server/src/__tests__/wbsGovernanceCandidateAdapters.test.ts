import { describe, expect, it } from 'vitest'
import {
  persistWbsSeedSemanticGovernanceCandidateEvents,
} from '../services/wbsSeedSemanticGovernanceService.js'
import {
  persistWbsTaskStructureGovernanceCandidateEvent,
} from '../services/wbsTaskStructureGovernancePipelineService.js'
import {
  collectAndPersistConstructionDependencyReplayCalibrationCandidates,
} from '../services/constructionDependencyReplayCalibrationService.js'

function createQueryRecorder() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
      return [{ id: `candidate-event-${calls.length}` }] as T[]
    }
    return [] as T[]
  }
  return { calls, queryExec }
}

describe('WBS governance candidate adapters', () => {
  it('persists WBS semantic governance findings as unified candidate events without mutating runtime seeds', async () => {
    const { calls, queryExec } = createQueryRecorder()

    const result = await persistWbsSeedSemanticGovernanceCandidateEvents({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      maxCandidates: 2,
      queryExec,
    })

    expect(result.persistedEventCount).toBeGreaterThan(0)
    const candidateInsert = calls.find((call) =>
      call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'),
    )
    expect(candidateInsert?.params).toEqual(expect.arrayContaining([
      expect.stringMatching(/^wbs\.semantic\./),
      'wbsSeedSemanticGovernanceService',
      'project',
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      'template_structure',
      'governed_candidate',
      'manual_governance_required',
      'auto_review_package',
      'review_required',
    ]))
    expect(candidateInsert?.params).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reportCode: 'wbs_seed_semantic_precision_governance',
        businessTypeRegistryAudit: expect.objectContaining({
          status: 'ready',
          unmappedLegacyWbsTemplateTypes: [],
        }),
        finding: expect.objectContaining({
          severity: expect.stringMatching(/^P[01]$/),
          ruleCode: expect.any(String),
          stableCode: expect.any(String),
        }),
      }),
    ]))
    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('task_dependencies')
  })

  it('persists the WBS task-structure governance profile as a candidate event without granting runtime write authority', async () => {
    const { calls, queryExec } = createQueryRecorder()

    const result = await persistWbsTaskStructureGovernanceCandidateEvent({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      source: 'template_generate',
      queryExec,
    })

    expect(result.event.assetKey).toBe('wbs.task_structure.rule_asset_profile')
    expect(result.event.governanceDecision.canWriteRuntime).toBe(false)
    expect(calls[0]?.params).toEqual(expect.arrayContaining([
      'wbs.task_structure.rule_asset_profile',
      'wbsTaskStructureGovernancePipelineService',
      'project',
      'template_structure',
      'governed_candidate',
      'candidate_only',
      'manual_required',
      'review_required',
    ]))
    expect(calls[0]?.params).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pipeline: 'wbs_task_structure_governance_pipeline',
        downstreamAlgorithmsCanRewriteStructure: false,
        dataQualityCanBlockDirectly: false,
      }),
    ]))
  })

  it('persists dependency replay calibration queues as dependency-order candidates without writing dependency runtime rows', async () => {
    const { calls, queryExec } = createQueryRecorder()
    const queryRows = async <T = Record<string, unknown>>(): Promise<T[]> => ([{
      id: 'dependency-1',
      project_id: '00000000-0000-4000-8000-000000000001',
      dependency_type: 'FS',
      lag_days: 0,
      source_type: 'cross_item_workflow',
      metadata: { seedRuleId: 'foundation_support_dewatering_to_earthwork' },
      predecessor_task_id: 'task-a',
      predecessor_task_code: '01-03-01',
      predecessor_actual_end_date: '2026-01-01',
      successor_task_id: 'task-b',
      successor_task_code: '01-05-01',
      successor_actual_start_date: '2026-01-06',
    }] as T[])

    const result = await collectAndPersistConstructionDependencyReplayCalibrationCandidates({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectIds: ['00000000-0000-4000-8000-000000000001'],
      queryRows,
      queryExec,
    })

    expect(result.report.calibrationQueues.l3LagCalibrationCandidates).toHaveLength(1)
    expect(result.persistedEventCount).toBe(1)
    const candidateInsert = calls.find((call) =>
      call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'),
    )
    expect(candidateInsert?.params).toEqual(expect.arrayContaining([
      'wbs.dependency.cross_item_workflow.foundation_support_dewatering_to_earthwork',
      'constructionDependencyReplayCalibrationService',
      'constructionDependencyReplayCalibrationService:wbs.dependency.cross_item_workflow.foundation_support_dewatering_to_earthwork:10000000-0000-4000-8000-000000000001:no_project',
      'company',
      '10000000-0000-4000-8000-000000000001',
      null,
      'dependency_order',
      'governed_candidate',
      'candidate_only',
      'auto_shadow',
      'review_required',
    ]))
    expect(candidateInsert?.params).toEqual(expect.arrayContaining([
      expect.objectContaining({
        experienceTier: 'T1',
        reuseScope: 'project',
        learningScope: 'project',
        wbsNodeTypes: ['process', 'activity_step', 'task'],
        experienceAssetType: 'dependency_order',
        experienceGroupKeys: expect.arrayContaining([
          'T1:dependency_order',
          'T1:dependency_layer:cross_item_workflow',
          'T1:dependency_seed:foundation_support_dewatering_to_earthwork',
          'project:00000000-0000-4000-8000-000000000001',
        ]),
        experienceTierRegistryCandidate: expect.objectContaining({
          tier: 'T1',
          groupKeyStrategy: 'dependency_order_seed_rule',
          prohibitsCrossTierBucketMixing: true,
          requiredRegistry: 'experienceTierRegistry',
        }),
        queueStatus: 'manual_review_required',
        recommendation: 'review_nonzero_lag_or_condition_profile',
        sampleDependencyIds: ['dependency-1'],
      }),
      expect.objectContaining({
        decisionStatus: 'review_required',
        runtimeAction: 'candidate_only',
        canWriteRuntime: false,
        canModifyPublishAnchor: false,
      }),
    ]))
    const writeSql = calls
      .map((call) => call.sql.toLowerCase())
      .filter((sql) => sql.includes('insert') || sql.includes('update') || sql.includes('delete'))
      .join('\n')
    expect(writeSql).not.toContain('task_dependencies')
    expect(writeSql).not.toContain('algorithm_seed_records')
  })
})
