import { describe, expect, it } from 'vitest'

import type { T2RhythmReleaseClosureArtifact } from '../scripts/generate-t2-rhythm-release-closure.js'
import type { T2RhythmReleaseClosureArtifactVerification } from '../scripts/verify-t2-rhythm-release-closure-artifact.js'
import type { ProductionMigrationGovernanceReport } from '../services/migrationProductionGovernanceService.js'
import {
  applyT2RhythmScheduleRuntimePublication,
  recordT2RhythmScheduleRuntimeImpactMonitoring,
  rollbackT2RhythmScheduleRuntimePublication,
} from '../services/t2RhythmScheduleRuntimePublicationService.js'
import type {
  T2RhythmScheduleCandidateNetworkEdge,
  T2RhythmScheduleCandidateNetworkNode,
} from '../services/t2RhythmScheduleCandidateNetworkService.js'
import type {
  T2RhythmScheduleCandidateNetworkPhase1Evaluation,
} from '../services/t2RhythmScheduleCandidateNetworkEvaluationService.js'

const projectId = '00000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000001'
const foundationTaskId = '20000000-0000-4000-8000-000000000001'
const structureTaskId = '20000000-0000-4000-8000-000000000002'

function readyArtifact(): T2RhythmReleaseClosureArtifact {
  return {
    artifactCode: 'c19_t2_rhythm_release_closure_artifact',
    status: 'manual_publication_candidate_ready',
    generatedAt: '2026-06-23T08:00:00.000Z',
    outputFile: 'artifacts/t2/release-closure.json',
    missingOutputFile: false,
    sourceFiles: {
      liveReplayEvidenceFile: 'artifacts/t2/live-replay.json',
      phase1SelectionGateFile: 'artifacts/t2/phase1-selection.json',
      l5ReleaseGateFile: 'artifacts/t2/l5-release.json',
    },
    provenance: {
      source: 't2_rhythm_release_closure_artifact_provenance',
      sourceFileCoverageStatus: 'ready',
      missingSourceFileRoles: [],
      inputFileDigests: [],
      standardLibrarySnapshot: {
        seedVersion: 't2-seed-test',
        templateCount: 196,
        businessTypeCount: 11,
        systemBusinessTypeCoverageStatus: 'ready',
        standardLibraryThicknessCoverageStatus: 'ready',
        systemBusinessTypeCoverageRate: 1,
        standardLibraryThicknessCoverageRate: 1,
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        selectedTemplateCoverageStatus: 'covered_by_current_seed',
        missingSelectedTemplateIds: [],
      },
    },
    report: {
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      releaseEvidenceRefs: ['artifact:t2-release-review-package'],
    },
    sourceEvidenceRefs: ['artifact:t2-release-review-package'],
    publicationDecision: {
      source: 't2_rhythm_release_closure_artifact_publication_decision',
      status: 'manual_publication_candidate_ready',
      canEmitReleaseArtifact: true,
      canBypassManualApproval: false,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      blockingReasons: [],
    },
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  } as unknown as T2RhythmReleaseClosureArtifact
}

function passingVerification(): T2RhythmReleaseClosureArtifactVerification {
  return {
    verificationCode: 'c19_t2_rhythm_release_closure_artifact_verification',
    status: 'pass',
    generatedAt: '2026-06-23T08:05:00.000Z',
    artifactFile: 'artifacts/t2/release-closure.json',
    outputFile: 'artifacts/t2/release-closure-verification.json',
    checks: {
      artifactStatusReady: true,
      publicationDecisionReady: true,
      inputDigestsMatch: true,
      standardLibrarySnapshotCurrent: true,
      sourceEvidenceRefsMatch: true,
      noRuntimeWriteBoundary: true,
      manualApprovalStillRequired: true,
    },
    digestMismatches: [],
    standardLibrarySnapshotMismatches: [],
    blockingReasons: [],
  }
}

function readyEvaluation(): T2RhythmScheduleCandidateNetworkPhase1Evaluation {
  return {
    source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
    candidateId: 'candidate-t2-runtime-1',
    tier: 'T2',
    status: 'phase1_readonly_evaluation_ready',
    canEnterC1913Phase1Selection: true,
    networkSpanDays: 7,
    topologicalOrder: ['node-foundation', 'node-structure'],
    criticalNodeIds: ['node-foundation', 'node-structure'],
    criticalWindowCodes: ['W01', 'W02'],
    nodeEvaluations: [],
    selectionReceipts: [],
    conflictSummary: {
      conflictCount: 0,
      conflictCodes: [],
      priorityOverrideBlocked: false,
    },
    templateAssemblyCompatibilityReceipt: {
      compatibilityStatus: 'compatible_candidate',
      conflictCodes: [],
      blockedTemplateIds: [],
      manualReviewReasons: [],
      priorityOverrideBlocked: false,
    },
    scheduleTrustEvidence: {
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      topologyEvaluated: true,
      floatCalculated: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
    },
    standardLibraryReadiness: {
      status: 'shadow_candidate_ready_not_publishable',
      precisionStatus: 'ready',
      breadthStatus: 'ready',
      depthStatus: 'ready',
      releaseEvidenceClosure: {
        source: 't2_rhythm_release_evidence_closure',
        status: 'ready_not_publishable',
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      },
    },
    phase1PublicationGate: {
      status: 'canary_handoff_ready_not_published',
      canEnterCanary: true,
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      canWritePlanDates: false,
      canAutoPublishRuntimeExperience: false,
      l5ReleaseGateStatus: 'l5_canary_handoff_ready',
      releasePackage: null,
      releaseBlockers: ['manual_promotion_after_canary_required'],
    },
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
    },
  } as unknown as T2RhythmScheduleCandidateNetworkPhase1Evaluation
}

function runtimeNodes(): T2RhythmScheduleCandidateNetworkNode[] {
  return [{
    nodeId: 'node-foundation',
    templateId: 't2-residential-standard-floor-structure-rhythm-v1',
    windowCode: 'W01',
    role: 'foundation_ready',
    startDay: 1,
    finishDay: 2,
    durationDays: 2,
    durationSource: 'parent_package_rhythm_window',
    tier: 'T2',
    confidence: 'high',
    durationBearing: true,
    autoApply: false,
  }, {
    nodeId: 'node-structure',
    templateId: 't2-residential-standard-floor-structure-rhythm-v1',
    windowCode: 'W02',
    role: 'standard_floor_structure',
    startDay: 3,
    finishDay: 7,
    durationDays: 5,
    durationSource: 'parent_package_rhythm_window',
    tier: 'T2',
    confidence: 'high',
    durationBearing: true,
    autoApply: false,
  }]
}

function runtimeEdges(): T2RhythmScheduleCandidateNetworkEdge[] {
  return [{
    edgeId: 'edge-foundation-structure',
    sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
    predecessorNodeId: 'node-foundation',
    successorNodeId: 'node-structure',
    predecessorWindowCode: 'W01',
    successorWindowCode: 'W02',
    relation: 'FS',
    lagDays: 0,
    mandatory: true,
    edgeType: 'handover_gate',
    tier: 'T2',
    autoApply: false,
  }]
}

function approval() {
  return {
    approved: true,
    approvalMode: 'manual_governance_approval' as const,
    approvedByUserId: 'release-user',
    approvalEvidenceRefs: ['approval:t2-runtime-publication'],
    canWriteTaskDependencies: true,
    canWritePlanDates: true,
    rollbackTarget: 't2-rhythm-schedule-runtime-rollback:project-1',
    consumerVerificationRefs: [
      'projectCriticalPathService.consumes_task_dependencies',
      'durationInputAssemblerService.reads_t2_runtime_context',
    ],
    impactMonitoringRefs: ['monitor:t2-runtime-publication:14d'],
  }
}

function guardedAutoApproval() {
  return {
    ...approval(),
    approvalMode: 'guarded_runtime_auto_publish' as const,
    approvalEvidenceRefs: ['approval:t2-canary-registration-only'],
  }
}

function closedMigrationGovernanceReport(): ProductionMigrationGovernanceReport {
  return {
    gate: 'production-migration-governance',
    status: 'closed',
    gates: [
      { id: 'MG-01', name: 'migration_input_freeze', status: 'pass', reasonCodes: [] },
      { id: 'MG-02', name: 'migration_classification_table', status: 'pass', reasonCodes: [] },
      { id: 'MG-03', name: 'privileged_migration_url_probe', status: 'pass', reasonCodes: [] },
      { id: 'MG-04', name: 'baseline_adoption_plan', status: 'pass', reasonCodes: [] },
      { id: 'MG-05', name: 'forward_apply_plan', status: 'pass', reasonCodes: [] },
      { id: 'MG-06', name: 'drift_orphan_checksum_drop_guard', status: 'pass', reasonCodes: [] },
      { id: 'MG-07', name: 'closeout_readback', status: 'pass', reasonCodes: [] },
    ],
    classifications: [],
    allowValidate: true,
    allowWarmup: true,
    allowScheduler: true,
  }
}

describe('t2RhythmScheduleRuntimePublicationService', () => {
  it('blocks runtime apply when verified release closure or explicit write approval is missing', async () => {
    const result = await applyT2RhythmScheduleRuntimePublication({
      artifact: readyArtifact(),
      verification: { ...passingVerification(), status: 'fail' },
      evaluation: readyEvaluation(),
      networkNodes: runtimeNodes(),
      networkEdges: runtimeEdges(),
      taskMappings: [
        { nodeId: 'node-foundation', taskId: foundationTaskId },
        { nodeId: 'node-structure', taskId: structureTaskId },
      ],
      projectId,
      projectStartDate: '2026-07-01',
      approval: {
        ...approval(),
        canWritePlanDates: false,
      },
      queryExec: async () => {
        throw new Error('blocked runtime apply must not touch database')
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_blocked',
      writesTaskDependencies: false,
      writesPlanDates: false,
      releaseRecordPersisted: false,
      reasons: expect.arrayContaining([
        'release_closure_artifact_verification_not_passed',
        'runtime_plan_date_write_approval_required',
      ]),
    }))
  })

  it('blocks runtime apply when release closure artifact lacks artifact lineage evidence refs', async () => {
    const result = await applyT2RhythmScheduleRuntimePublication({
      artifact: {
        ...readyArtifact(),
        sourceEvidenceRefs: [],
      },
      verification: passingVerification(),
      evaluation: readyEvaluation(),
      networkNodes: runtimeNodes(),
      networkEdges: runtimeEdges(),
      taskMappings: [
        { nodeId: 'node-foundation', taskId: foundationTaskId },
        { nodeId: 'node-structure', taskId: structureTaskId },
      ],
      projectId,
      projectStartDate: '2026-07-01',
      approval: approval(),
      queryExec: async () => {
        throw new Error('missing artifact lineage must block before database access')
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_blocked',
      reasons: expect.arrayContaining([
        'runtime_publication_source_evidence_required',
      ]),
    }))
  })

  it('blocks runtime apply before production migration MG-07 closeout permits runtime writers', async () => {
    const result = await applyT2RhythmScheduleRuntimePublication({
      artifact: readyArtifact(),
      verification: passingVerification(),
      evaluation: readyEvaluation(),
      networkNodes: runtimeNodes(),
      networkEdges: runtimeEdges(),
      taskMappings: [
        { nodeId: 'node-foundation', taskId: foundationTaskId },
        { nodeId: 'node-structure', taskId: structureTaskId },
      ],
      projectId,
      projectStartDate: '2026-07-01',
      approval: approval(),
      queryExec: async () => {
        throw new Error('migration governance must block before database access')
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_blocked',
      writesTaskDependencies: false,
      writesPlanDates: false,
      releaseRecordPersisted: false,
      reasons: expect.arrayContaining([
        'production_migration_governance_closed_evidence_required',
      ]),
    }))
  })

  it('applies a verified T2 runtime publication to T2-owned dependencies and mapped task plan dates', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.tasks') && sql.includes('planned_start_date')) {
        return [
          {
            id: foundationTaskId,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-02',
            start_date: '2026-06-01',
            end_date: '2026-06-02',
          },
          {
            id: structureTaskId,
            planned_start_date: '2026-06-03',
            planned_end_date: '2026-06-07',
            start_date: '2026-06-03',
            end_date: '2026-06-07',
          },
        ] as T[]
      }
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return [] as T[]
      if (sql.includes('INSERT INTO public.task_dependencies')) return [{ id: 'dep-1' }] as T[]
      if (sql.includes('UPDATE public.tasks')) return [{ id: params[1] }] as T[]
      if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_publications')) return [{ id: 'pub-1' }] as T[]
      if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_events')) return [{ id: 'evt-1' }] as T[]
      return [] as T[]
    }

    const result = await applyT2RhythmScheduleRuntimePublication({
      artifact: readyArtifact(),
      verification: passingVerification(),
      evaluation: readyEvaluation(),
      networkNodes: runtimeNodes(),
      networkEdges: runtimeEdges(),
      taskMappings: [
        { nodeId: 'node-foundation', taskId: foundationTaskId },
        { nodeId: 'node-structure', taskId: structureTaskId },
      ],
      companyId,
      projectId,
      projectStartDate: '2026-07-01',
      approval: approval(),
      productionMigrationGovernanceReport: closedMigrationGovernanceReport(),
      executedAt: '2026-06-23T09:00:00.000Z',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_ready',
      canAutoPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: true,
      canWritePlanDates: true,
      sourceEvidenceRefs: ['artifact:t2-release-review-package'],
      runtimeCallEvidenceRefs: expect.arrayContaining([
        'approval:t2-runtime-publication',
        'projectCriticalPathService.consumes_task_dependencies',
        'durationInputAssemblerService.reads_t2_runtime_context',
        'monitor:t2-runtime-publication:14d',
        't2-rhythm-schedule-runtime-rollback:project-1',
      ]),
      writesTaskDependencies: true,
      writesPlanDates: true,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      insertedDependencyCount: 1,
      skippedDependencyCount: 0,
      patchedPlanDateCount: 2,
      releaseRecordPersisted: true,
      rollbackTarget: 't2-rhythm-schedule-runtime-rollback:project-1',
    }))
    expect(result.publicationKey).toBe('t2-rhythm-schedule-runtime:00000000-0000-4000-8000-000000000001:candidate-t2-runtime-1:2026-06-23T08:00:00.000Z')
    expect(result.appliedPlanDatePatches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: 'node-foundation',
        taskId: foundationTaskId,
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-02',
        previousPlannedStartDate: '2026-06-01',
        previousPlannedEndDate: '2026-06-02',
      }),
      expect.objectContaining({
        nodeId: 'node-structure',
        taskId: structureTaskId,
        plannedStartDate: '2026-07-03',
        plannedEndDate: '2026-07-07',
      }),
    ]))

    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain('INSERT INTO public.task_dependencies')
    expect(sqlText).toContain("WHERE public.task_dependencies.source_type = 't2_rhythm_schedule_runtime'")
    expect(sqlText).toContain('UPDATE public.tasks')
    expect(sqlText).toContain('INSERT INTO public.t2_rhythm_schedule_runtime_publications')
    expect(sqlText).toContain('INSERT INTO public.t2_rhythm_schedule_runtime_events')
    const eventInsert = calls.find((call) => call.sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_events'))
    expect(eventInsert?.params?.[3]).toEqual(expect.objectContaining({
      sourceEvidenceRefs: ['artifact:t2-release-review-package'],
      runtimeCallEvidenceRefs: expect.arrayContaining([
        'approval:t2-runtime-publication',
        'projectCriticalPathService.consumes_task_dependencies',
        'durationInputAssemblerService.reads_t2_runtime_context',
      ]),
    }))
    expect(calls.map((call) => call.sql)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']))
    expect(calls.map((call) => call.sql)).not.toContain('ROLLBACK')
    expect(sqlText).not.toContain('algorithm_seed')
    expect(sqlText).not.toContain('task_baselines')
    expect(sqlText).not.toContain('critical_path_facts')
  })

  it('blocks final runtime apply when approval is guarded auto publish instead of manual governance approval', async () => {
    const result = await applyT2RhythmScheduleRuntimePublication({
      artifact: readyArtifact(),
      verification: passingVerification(),
      evaluation: readyEvaluation(),
      networkNodes: runtimeNodes(),
      networkEdges: runtimeEdges(),
      taskMappings: [
        { nodeId: 'node-foundation', taskId: foundationTaskId },
        { nodeId: 'node-structure', taskId: structureTaskId },
      ],
      projectId,
      projectStartDate: '2026-07-01',
      approval: guardedAutoApproval(),
      queryExec: async () => {
        throw new Error('guarded auto approval must block before final runtime apply')
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_blocked',
      canAutoPublishRuntimeExperience: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      releaseRecordPersisted: false,
      reasons: expect.arrayContaining([
        'manual_runtime_publication_approval_required',
      ]),
    }))
  })

  it('rolls back the final runtime apply transaction when release event persistence fails', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.tasks') && sql.includes('planned_start_date')) {
        return [
          { id: foundationTaskId, planned_start_date: null, planned_end_date: null, start_date: null, end_date: null },
          { id: structureTaskId, planned_start_date: null, planned_end_date: null, start_date: null, end_date: null },
        ] as T[]
      }
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return [] as T[]
      if (sql.includes('INSERT INTO public.task_dependencies')) return [{ id: 'dep-1' }] as T[]
      if (sql.includes('UPDATE public.tasks')) return [{ id: 'task' }] as T[]
      if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_publications')) return [{ id: 'pub-1' }] as T[]
      if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_events')) {
        throw new Error('event insert failed')
      }
      return [] as T[]
    }

    await expect(applyT2RhythmScheduleRuntimePublication({
      artifact: readyArtifact(),
      verification: passingVerification(),
      evaluation: readyEvaluation(),
      networkNodes: runtimeNodes(),
      networkEdges: runtimeEdges(),
      taskMappings: [
        { nodeId: 'node-foundation', taskId: foundationTaskId },
        { nodeId: 'node-structure', taskId: structureTaskId },
      ],
      projectId,
      projectStartDate: '2026-07-01',
      approval: approval(),
      productionMigrationGovernanceReport: closedMigrationGovernanceReport(),
      queryExec,
    })).rejects.toThrow('event insert failed')

    expect(calls.map((call) => call.sql)).toEqual(expect.arrayContaining(['BEGIN', 'ROLLBACK']))
    expect(calls.map((call) => call.sql)).not.toContain('COMMIT')
  })

  it('blocks runtime apply when any T2 network node lacks a task mapping', async () => {
    const result = await applyT2RhythmScheduleRuntimePublication({
      artifact: readyArtifact(),
      verification: passingVerification(),
      evaluation: readyEvaluation(),
      networkNodes: runtimeNodes(),
      networkEdges: runtimeEdges(),
      taskMappings: [
        { nodeId: 'node-foundation', taskId: foundationTaskId },
      ],
      projectId,
      projectStartDate: '2026-07-01',
      approval: approval(),
      queryExec: async () => {
        throw new Error('missing mapping must block before database access')
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_blocked',
      writesTaskDependencies: false,
      writesPlanDates: false,
      reasons: ['task_mapping_missing:node-structure'],
    }))
  })

  it('counts existing non-T2 dependency conflicts as skipped while still patching mapped dates and persisting release record', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes('FROM public.tasks') && sql.includes('planned_start_date')) {
        return [
          { id: foundationTaskId, planned_start_date: null, planned_end_date: null, start_date: null, end_date: null },
          { id: structureTaskId, planned_start_date: null, planned_end_date: null, start_date: null, end_date: null },
        ] as T[]
      }
      if (sql.includes('INSERT INTO public.task_dependencies')) return [] as T[]
      if (sql.includes('UPDATE public.tasks')) return [{ id: 'task' }] as T[]
      if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_publications')) return [{ id: 'pub-1' }] as T[]
      if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_events')) return [{ id: 'evt-1' }] as T[]
      return [] as T[]
    }

    const result = await applyT2RhythmScheduleRuntimePublication({
      artifact: readyArtifact(),
      verification: passingVerification(),
      evaluation: readyEvaluation(),
      networkNodes: runtimeNodes(),
      networkEdges: runtimeEdges(),
      taskMappings: [
        { nodeId: 'node-foundation', taskId: foundationTaskId },
        { nodeId: 'node-structure', taskId: structureTaskId },
      ],
      projectId,
      projectStartDate: '2026-07-01',
      approval: approval(),
      productionMigrationGovernanceReport: closedMigrationGovernanceReport(),
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_ready',
      writesTaskDependencies: false,
      insertedDependencyCount: 0,
      skippedDependencyCount: 1,
      writesPlanDates: true,
      patchedPlanDateCount: 2,
      releaseRecordPersisted: true,
    }))
    expect(result.appliedDependencies).toEqual([])
  })

  it('records impact monitoring for a T2 runtime publication without extra runtime writes', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'event-1' }] as T[]
    }

    const result = await recordT2RhythmScheduleRuntimeImpactMonitoring({
      queryExec,
      publicationKey: 't2-rhythm-schedule-runtime:project-1:candidate-1:2026-06-23T08:00:00.000Z',
      eventStatus: 'monitoring_passed',
      eventPayload: {
        businessType: 'residential',
        monitoredDependencyViolationRate: 0,
        medianGateSlipDays: 1,
      },
      productionMigrationGovernanceReport: closedMigrationGovernanceReport(),
      executedAt: '2026-06-23T10:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_runtime_publication_service',
      status: 'runtime_event_recorded',
      eventType: 'impact_monitoring',
      eventStatus: 'monitoring_passed',
      sourcePublicationKey: 't2-rhythm-schedule-runtime:project-1:candidate-1:2026-06-23T08:00:00.000Z',
      eventPersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
    }))
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('INSERT INTO public.t2_rhythm_schedule_runtime_events')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'impact_monitoring',
      'monitoring_passed',
      't2-rhythm-schedule-runtime:project-1:candidate-1:2026-06-23T08:00:00.000Z',
      expect.objectContaining({
        businessType: 'residential',
        monitoredDependencyViolationRate: 0,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    ]))
  })

  it('rolls back the runtime publication transaction when rollback event persistence fails', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const publicationKey = 't2-rhythm-schedule-runtime:project-1:candidate-1:2026-06-23T08:00:00.000Z'
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.t2_rhythm_schedule_runtime_publications')) {
        return [{
          publication_key: publicationKey,
          project_id: projectId,
          runtime_publication_status: 'runtime_published',
          applied_dependency_edges: [],
          applied_plan_date_patches: [],
        }] as T[]
      }
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return [] as T[]
      if (sql.includes('UPDATE public.task_dependencies')) return [{ id: 'dep-1' }] as T[]
      if (sql.includes('UPDATE public.tasks')) return [{ id: 'task-1' }] as T[]
      if (sql.includes('UPDATE public.t2_rhythm_schedule_runtime_publications')) return [{ id: 'pub-1' }] as T[]
      if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_events')) {
        throw new Error('rollback event insert failed')
      }
      return [] as T[]
    }

    await expect(rollbackT2RhythmScheduleRuntimePublication({
      queryExec,
      projectId,
      publicationKey,
      rollbackReason: 'canary_monitoring_regression',
      rollbackEvidenceRefs: ['rollback-drill:t2-schedule-runtime'],
      executedByUserId: 'release-user',
      productionMigrationGovernanceReport: closedMigrationGovernanceReport(),
      executedAt: '2026-06-23T11:00:00.000Z',
    })).rejects.toThrow('rollback event insert failed')

    expect(calls.map((call) => call.sql)).toEqual(expect.arrayContaining(['BEGIN', 'ROLLBACK']))
    expect(calls.map((call) => call.sql)).not.toContain('COMMIT')
  })

  it('blocks rollback before production migration MG-07 closeout permits runtime writers', async () => {
    const result = await rollbackT2RhythmScheduleRuntimePublication({
      queryExec: async () => {
        throw new Error('migration governance must block rollback before database access')
      },
      projectId,
      publicationKey: 't2-rhythm-schedule-runtime:project-1:candidate-1:2026-06-23T08:00:00.000Z',
      rollbackReason: 'canary_monitoring_regression',
      rollbackEvidenceRefs: ['rollback-drill:t2-schedule-runtime'],
      executedByUserId: 'release-user',
      executedAt: '2026-06-23T11:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_rollback_blocked',
      releaseRecordRolledBack: false,
      rollbackEventPersisted: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      reasons: expect.arrayContaining([
        'production_migration_governance_closed_evidence_required',
      ]),
    }))
  })

  it('rolls back a T2 runtime publication by deactivating T2-owned dependencies and restoring previous task dates', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const publicationKey = 't2-rhythm-schedule-runtime:project-1:candidate-1:2026-06-23T08:00:00.000Z'
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.t2_rhythm_schedule_runtime_publications')) {
        return [{
          publication_key: publicationKey,
          project_id: projectId,
          runtime_publication_status: 'runtime_published',
          applied_dependency_edges: [{
            taskId: structureTaskId,
            dependencyTaskId: foundationTaskId,
            dependencyType: 'FS',
          }],
          applied_plan_date_patches: [{
            taskId: foundationTaskId,
            previousPlannedStartDate: '2026-06-01',
            previousPlannedEndDate: '2026-06-02',
            previousStartDate: '2026-06-01',
            previousEndDate: '2026-06-02',
          }, {
            taskId: structureTaskId,
            previousPlannedStartDate: null,
            previousPlannedEndDate: null,
            previousStartDate: null,
            previousEndDate: null,
          }],
        }] as T[]
      }
      if (sql.includes('UPDATE public.task_dependencies')) return [{ id: 'dep-1' }] as T[]
      if (sql.includes('UPDATE public.tasks')) return [{ id: params[1] }] as T[]
      if (sql.includes('UPDATE public.t2_rhythm_schedule_runtime_publications')) return [{ id: 'pub-1' }] as T[]
      if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_events')) return [{ id: 'evt-1' }] as T[]
      return [] as T[]
    }

    const result = await rollbackT2RhythmScheduleRuntimePublication({
      queryExec,
      projectId,
      publicationKey,
      rollbackReason: 'canary_monitoring_regression',
      rollbackEvidenceRefs: ['rollback-drill:t2-schedule-runtime'],
      executedByUserId: 'release-user',
      productionMigrationGovernanceReport: closedMigrationGovernanceReport(),
      executedAt: '2026-06-23T11:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_rollback_ready',
      publicationKey,
      dependencyRollbackCount: 1,
      planDateRollbackCount: 2,
      releaseRecordRolledBack: true,
      rollbackEventPersisted: true,
      writesTaskDependencies: true,
      writesPlanDates: true,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      reasons: [],
    }))
    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain("source_type = 't2_rhythm_schedule_runtime'")
    expect(sqlText).toContain("status = 'inactive'")
    expect(sqlText).toContain("runtime_publication_status = 'runtime_rolled_back'")
    expect(sqlText).toContain('rollback_execution')
    expect(sqlText).toContain('INSERT INTO public.t2_rhythm_schedule_runtime_events')
    expect(calls.find((call) => call.sql.includes('FROM public.t2_rhythm_schedule_runtime_publications'))).toEqual(expect.objectContaining({
      params: [publicationKey, projectId],
    }))
  })
})
