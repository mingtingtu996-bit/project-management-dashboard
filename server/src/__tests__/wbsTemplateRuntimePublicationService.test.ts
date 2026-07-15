import { describe, expect, it } from 'vitest'

import {
  executeWbsTemplateRuntimeRollback,
  persistWbsTemplateRuntimePublication,
  resolveWbsTemplateRuntimePublication,
} from '../services/wbsTemplateRuntimePublicationService.js'
import type {
  WbsTemplateRuntimePublicationQueryExec,
} from '../services/wbsTemplateRuntimePublicationService.js'
import type {
  SpecialWorkDurationSeedPublicationReadiness,
} from '../services/wbsTemplateCandidateEventService.js'
import type {
  WbsReferenceDaysPublicationReadiness,
} from '../services/wbsTemplateGoldenBenchmarkGateService.js'

const readySpecialSeedPublication: SpecialWorkDurationSeedPublicationReadiness = {
  status: 'special_work_seed_publication_ready',
  liveLearningEvidence: {
    assetClassificationRegistered: true,
    predictionEventRecorded: true,
    actualOutcomeEventRecorded: true,
    tieredLearningPolicyRegistered: true,
    enabledLearningScopes: ['global', 'industry', 'company', 'project'],
    runtimeConsumerUsesPublishedArtifact: true,
    governedCandidateOnlyBoundaryPreserved: true,
    approvedSpecialSeedCandidateRecorded: true,
    specialSeedPublicationWriterReady: true,
    seedVersionLineageRecorded: true,
    releaseExitApproved: true,
    impactMonitoringReady: true,
    rollbackTargetReady: true,
    accuracyMetricsAvailable: true,
    generatedRowCount: 10,
    retainedRowCount: 7,
    rejectedRowCount: 3,
    pendingRowCount: 0,
    resolvedOutcomeRatio: 1,
  },
  seedVersionLineage: {
    seedType: 'special_work_duration',
    seedVersionId: 'special-seed-version-v2',
    runtimePublicationKey: 'wbs_template_runtime:special-seed-version-v2',
    rollbackTarget: 'wbs_template_runtime:special-seed-version-v1',
    approvedCandidateEventIds: ['candidate-1'],
    generatedEntityIds: ['generated-row-1', 'generated-row-2'],
    generatedRowCount: 10,
    retainedRowCount: 7,
    rejectedRowCount: 3,
    pendingRowCount: 0,
  },
  missingReasons: [],
}

const readyReferenceDaysPublication: WbsReferenceDaysPublicationReadiness = {
  status: 'wbs_reference_days_publication_ready',
  liveLearningEvidence: {
    assetClassificationRegistered: true,
    predictionEventRecorded: true,
    actualOutcomeEventRecorded: true,
    tieredLearningPolicyRegistered: true,
    enabledLearningScopes: ['global', 'industry', 'company', 'project'],
    runtimeConsumerUsesPublishedArtifact: true,
    benchmarkReplayGatePassed: true,
    approvedReferenceDaysCandidateRecorded: true,
    referenceDaysPublicationWriterReady: true,
    referenceDaysLineageRecorded: true,
    referenceDaysWriterDoesNotMutateConfirmedPlans: true,
    releaseExitApproved: true,
    impactMonitoringReady: true,
    rollbackTargetReady: true,
    accuracyMetricsAvailable: true,
    benchmarkScenarioCount: 13,
  },
  referenceDaysLineage: {
    assetType: 'wbs_reference_days',
    referenceDaysVersionId: 'wbs-reference-days-v2',
    runtimePublicationKey: 'wbs_reference_days_runtime:wbs-reference-days-v2',
    rollbackTarget: 'wbs_reference_days_runtime:wbs-reference-days-v1',
    approvedCandidateEventIds: ['reference-candidate-1'],
    benchmarkGateVersion: 'wbs-template-golden-benchmark-v1',
    benchmarkScenarioCount: 13,
  },
  missingReasons: [],
}

describe('wbsTemplateRuntimePublicationService', () => {
  it('persists a scoped WBS template runtime publication without mutating templates, tasks, baselines, or seed runtime', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }

    const result = await persistWbsTemplateRuntimePublication({
      readiness: readySpecialSeedPublication,
      companyId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      queryExec,
      executedAt: '2026-06-15T06:00:00.000Z',
      impactMonitoring: {
        monitoredAssetCount: 2,
        monitoringWindowHours: 72,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'wbs_template_runtime_published',
      assetKind: 'special_work_duration_seed',
      writesWbsTemplateRuntime: true,
      writesTemplatesDirectly: false,
      writesTasksOrBaselinesDirectly: false,
      writesSeedRuntimeDirectly: false,
      publicationKey: 'wbs_template_runtime:special-seed-version-v2',
      rollbackTarget: 'wbs_template_runtime:special-seed-version-v1',
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain('insert into public.wbs_template_runtime_publications')
    expect(joinedSql).toContain('insert into public.wbs_template_runtime_events')
    expect(joinedSql).not.toContain('insert into public.wbs_templates')
    expect(joinedSql).not.toContain('update public.wbs_templates')
    expect(joinedSql).not.toContain('wbs_template_nodes')
    expect(joinedSql).not.toContain('insert into public.tasks')
    expect(joinedSql).not.toContain('update public.tasks')
    expect(joinedSql).not.toContain('task_baselines')
    expect(joinedSql).not.toContain('algorithm_seed_records')
    expect(joinedSql).not.toContain('algorithm_seed_versions')
  })

  it('persists WBS reference-days runtime publications through the same scoped boundary', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }

    const result = await persistWbsTemplateRuntimePublication({
      readiness: readyReferenceDaysPublication,
      companyId: '11111111-1111-4111-8111-111111111111',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'wbs_template_runtime_published',
      assetKind: 'wbs_reference_days',
      publicationKey: 'wbs_reference_days_runtime:wbs-reference-days-v2',
      rollbackTarget: 'wbs_reference_days_runtime:wbs-reference-days-v1',
      reasons: [],
    }))
    expect(calls.map((call) => call.sql).join('\n').toLowerCase()).toContain('insert into public.wbs_template_runtime_publications')
  })

  it('persists default master-plan runtime publications without runtime PM approval evidence', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }

    const result = await persistWbsTemplateRuntimePublication({
      readiness: {
        status: 'default_master_plan_publication_ready',
        defaultMasterPlanLineage: {
          assetType: 'default_master_plan',
          defaultMasterPlanVersionId: 'baseline-reviewed',
          acceptedBaselineId: 'baseline-reviewed',
          projectId: '22222222-2222-4222-8222-222222222222',
          generationMode: 'managed_frontier_default_master_plan',
          runtimeAssetKey: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
          dependencyWriterReleaseRecordTarget: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
          runtimePublicationKey: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
          rollbackTarget: 'rollback:runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
          durationCalibrationEvidenceRef: 'duration-calibration-evidence.json',
          dependencyWriterEvidenceRef: 'dependency-writer-evidence.json',
        },
        missingReasons: [],
      } as any,
      companyId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      queryExec,
      executedAt: '2026-07-02T06:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'wbs_template_runtime_published',
      assetKind: 'default_master_plan',
      publicationKey: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
      rollbackTarget: 'rollback:runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
      writesWbsTemplateRuntime: true,
      writesTemplatesDirectly: false,
      writesTasksOrBaselinesDirectly: false,
      writesSeedRuntimeDirectly: false,
      reasons: [],
    }))
    const insertCall = calls.find((call) => call.sql.toLowerCase().includes('insert into public.wbs_template_runtime_publications'))
    expect(insertCall?.params?.[1]).toBe('default_master_plan')
    expect(insertCall?.params?.[2]).toBe('baseline-reviewed')
    expect(insertCall?.params?.[6]).toEqual(expect.objectContaining({
      acceptedBaselineId: 'baseline-reviewed',
      generationMode: 'managed_frontier_default_master_plan',
      runtimeAssetKey: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).not.toContain('insert into public.tasks')
    expect(joinedSql).not.toContain('update public.tasks')
    expect(joinedSql).not.toContain('task_baselines')
    expect(joinedSql).not.toContain('algorithm_seed_records')
  })

  it('blocks default master-plan runtime publication when learned-asset publication controls are missing', async () => {
    const queryExec = async () => {
      throw new Error('queryExec should not be called for blocked default master-plan publication')
    }

    await expect(persistWbsTemplateRuntimePublication({
      readiness: {
        status: 'default_master_plan_publication_ready',
        defaultMasterPlanLineage: {
          assetType: 'default_master_plan',
          defaultMasterPlanVersionId: 'baseline-reviewed',
          acceptedBaselineId: 'baseline-reviewed',
          projectId: '22222222-2222-4222-8222-222222222222',
          generationMode: 'managed_frontier_default_master_plan',
          runtimeAssetKey: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
          dependencyWriterReleaseRecordTarget: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
          runtimePublicationKey: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
          rollbackTarget: 'rollback:runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
          durationCalibrationEvidenceRef: '',
          dependencyWriterEvidenceRef: '',
        },
        missingReasons: [],
      } as any,
      companyId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      status: 'blocked',
      writesWbsTemplateRuntime: false,
      reasons: expect.arrayContaining([
        'duration_calibration_evidence_ref_required',
        'dependency_writer_evidence_ref_required',
      ]),
    }))
  })

  it('blocks default master-plan runtime publication when lineage project does not match the publication scope', async () => {
    const queryExec = async () => {
      throw new Error('queryExec should not be called for project-mismatched default master-plan publication')
    }

    await expect(persistWbsTemplateRuntimePublication({
      readiness: {
        status: 'default_master_plan_publication_ready',
        defaultMasterPlanLineage: {
          assetType: 'default_master_plan',
          defaultMasterPlanVersionId: 'baseline-reviewed',
          acceptedBaselineId: 'baseline-reviewed',
          projectId: 'project-from-other-chain',
          generationMode: 'managed_frontier_default_master_plan',
          runtimeAssetKey: 'runtime.default_master_plan.project-from-other-chain',
          dependencyWriterReleaseRecordTarget: 'runtime.default_master_plan.project-from-other-chain',
          runtimePublicationKey: 'runtime.default_master_plan.project-from-other-chain',
          rollbackTarget: 'rollback:runtime.default_master_plan.project-from-other-chain',
          durationCalibrationEvidenceRef: 'duration-calibration-evidence.json',
          dependencyWriterEvidenceRef: 'dependency-writer-evidence.json',
        },
        missingReasons: [],
      } as any,
      companyId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      status: 'blocked',
      writesWbsTemplateRuntime: false,
      reasons: expect.arrayContaining([
        'default_master_plan_project_id_mismatch',
      ]),
    }))
  })

  it('blocks runtime publication when readiness is not ready or company scope is missing', async () => {
    const queryExec = async () => {
      throw new Error('queryExec should not be called for blocked publication')
    }

    await expect(persistWbsTemplateRuntimePublication({
      readiness: {
        ...readySpecialSeedPublication,
        status: 'special_work_seed_publication_not_ready',
        missingReasons: ['runtime_consumer_publication_required'],
      },
      companyId: '11111111-1111-4111-8111-111111111111',
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      status: 'blocked',
      writesWbsTemplateRuntime: false,
      reasons: ['runtime_consumer_publication_required'],
    }))

    await expect(persistWbsTemplateRuntimePublication({
      readiness: readySpecialSeedPublication,
      companyId: '',
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      status: 'blocked',
      writesWbsTemplateRuntime: false,
      reasons: ['company_scope_required'],
    }))
  })

  it('rolls back only the scoped WBS template runtime publication', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }

    const result = await executeWbsTemplateRuntimeRollback({
      queryExec,
      companyId: '11111111-1111-4111-8111-111111111111',
      sourcePublicationKey: 'wbs_template_runtime:special-seed-version-v2',
      rollbackTarget: 'wbs_template_runtime:special-seed-version-v1',
      reason: 'impact_monitoring_regression',
      executedAt: '2026-06-15T06:30:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      writesWbsTemplateRuntime: true,
      writesTemplatesDirectly: false,
      writesTasksOrBaselinesDirectly: false,
      writesSeedRuntimeDirectly: false,
      sourcePublicationKey: 'wbs_template_runtime:special-seed-version-v2',
      rollbackTarget: 'wbs_template_runtime:special-seed-version-v1',
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain("set runtime_publication_status = 'runtime_rolled_back'")
    expect(joinedSql).toContain('where publication_key = $3 and rollback_target = $4 and company_id = $5')
    expect(joinedSql).not.toContain('wbs_templates')
    expect(joinedSql).not.toContain('wbs_template_nodes')
    expect(joinedSql).not.toContain('task_baselines')
    expect(joinedSql).not.toContain('algorithm_seed_records')
  })

  it('resolves only scoped runtime-published WBS template publications for consumers', async () => {
    const queryExec: WbsTemplateRuntimePublicationQueryExec = async <T = Record<string, unknown>>(sql: string) => {
      const normalizedSql = sql.toLowerCase()
      expect(normalizedSql).toContain('from public.wbs_template_runtime_publications')
      expect(normalizedSql).toContain("runtime_publication_status = 'runtime_published'")
      expect(normalizedSql).toContain('company_id = $2')
      return [{
        publication_key: 'wbs_template_runtime:special-seed-version-v2',
        asset_kind: 'special_work_duration_seed',
        asset_version_id: 'special-seed-version-v2',
        runtime_publication_status: 'runtime_published',
        runtime_lineage: readySpecialSeedPublication.seedVersionLineage,
        rollback_target: 'wbs_template_runtime:special-seed-version-v1',
        company_id: '11111111-1111-4111-8111-111111111111',
        project_id: '22222222-2222-4222-8222-222222222222',
      }] as T[]
    }

    const result = await resolveWbsTemplateRuntimePublication({
      publicationKey: 'wbs_template_runtime:special-seed-version-v2',
      companyId: '11111111-1111-4111-8111-111111111111',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      runtimeConsumable: true,
      publicationKey: 'wbs_template_runtime:special-seed-version-v2',
      assetKind: 'special_work_duration_seed',
      assetVersionId: 'special-seed-version-v2',
      reasons: [],
    }))
  })

  it('keeps default master-plan runtime publications non-consumable without a project scope', async () => {
    const queryExec: WbsTemplateRuntimePublicationQueryExec = async <T = Record<string, unknown>>() => [{
      publication_key: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
      asset_kind: 'default_master_plan',
      asset_version_id: 'baseline-reviewed',
      runtime_publication_status: 'runtime_published',
      runtime_lineage: {
        assetType: 'default_master_plan',
        acceptedBaselineId: 'baseline-reviewed',
        projectId: '22222222-2222-4222-8222-222222222222',
        generationMode: 'managed_frontier_default_master_plan',
        runtimeAssetKey: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
        dependencyWriterReleaseRecordTarget: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
        runtimePublicationKey: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
        rollbackTarget: 'rollback:runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
        durationCalibrationEvidenceRef: 'duration-calibration-evidence.json',
        dependencyWriterEvidenceRef: 'dependency-writer-evidence.json',
      },
      rollback_target: 'rollback:runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
      company_id: '11111111-1111-4111-8111-111111111111',
      project_id: '22222222-2222-4222-8222-222222222222',
    }] as T[]

    await expect(resolveWbsTemplateRuntimePublication({
      publicationKey: 'runtime.default_master_plan.22222222-2222-4222-8222-222222222222',
      companyId: '11111111-1111-4111-8111-111111111111',
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      runtimeConsumable: false,
      assetKind: 'default_master_plan',
      reasons: expect.arrayContaining([
        'project_scope_required_for_default_master_plan_runtime_consumer',
      ]),
    }))
  })
})
