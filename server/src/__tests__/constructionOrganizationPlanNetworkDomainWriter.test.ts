import { describe, expect, it } from 'vitest'
import {
  applyConstructionOrganizationPlanNetworkApprovedDraft,
} from '../services/constructionOrganizationPlanNetworkDomainWriter.js'
import type {
  ConstructionOrganizationPlanNetworkDraft,
  ConstructionOrganizationPlanNetworkDraftEdge,
} from '../services/constructionOrganizationPlanNetworkDraftService.js'

function buildReadyDraft(): ConstructionOrganizationPlanNetworkDraft {
  const edge: ConstructionOrganizationPlanNetworkDraftEdge = {
    edgeId: 'edge-1',
    fromGeneratedRowId: 'row-foundation',
    toGeneratedRowId: 'row-earthwork',
    dependencyType: 'FS' as const,
    lagDays: 0,
    intent: 'pile_before_earthwork_bulk_excavation',
    fromVirtualNodeId: 'foundation-work',
    toVirtualNodeId: 'earthwork-work',
    operation: 'propose_create_dependency',
    writesTaskDependencies: false as const,
  }
  const base = {
    source: 'construction_organization_plan_network_draft' as const,
    draftNetworkKey: 'sha256:draft-ready',
    candidateEventId: 'event-ready',
    assetKey: 'construction_organization.plan_option.option-ready',
    optionId: 'option-ready',
    businessType: 'hospital',
    selectedScenarioIds: ['pile_before_excavation'],
    readiness: 'ready_for_replay' as const,
    nodeCount: 2,
    edgeCount: 1,
    blockedReasons: [],
    nodes: [],
    edges: [edge],
    evaluationEvidence: {
      source: 'construction_organization_plan_network_draft_evaluation_evidence' as const,
      evaluationStatus: 'evaluation_ready' as const,
      evidenceGaps: [],
      e1: null,
      e3: null,
      e5: null,
      engineEvaluationSummary: null,
      boundaryPolicy: ['evaluation_evidence_is_read_only'],
    },
    useCaseEvaluationEvidence: {
      newProjectPlanning: {
        source: 'construction_organization_plan_network_draft_use_case_evaluation' as const,
        useCase: 'new_project_planning' as const,
        optionScore: 80,
        actionability: 'actionable_candidate',
        recoveryFactorHint: null,
        e5RecoverableSpanDays: null,
        rankBasis: [],
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
      },
      startingLineOnboarding: {
        source: 'construction_organization_plan_network_draft_use_case_evaluation' as const,
        useCase: 'starting_line_onboarding' as const,
        optionScore: 70,
        actionability: 'evidence_only',
        recoveryFactorHint: null,
        e5RecoverableSpanDays: null,
        rankBasis: [],
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
      },
      accelerationRecovery: {
        source: 'construction_organization_plan_network_draft_use_case_evaluation' as const,
        useCase: 'acceleration_recovery' as const,
        optionScore: 90,
        actionability: 'actionable_candidate',
        recoveryFactorHint: 1.05,
        e5RecoverableSpanDays: 3,
        rankBasis: [],
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
      },
    },
    reviewPackageStatus: 'ready_for_manual_review',
    reviewRequired: true,
    manualConflictReviewPackage: {
      source: 'construction_organization_plan_network_manual_conflict_review_package' as const,
      status: 'not_required' as const,
      reviewPrompt: null,
      reviewChecklist: [],
      conflictReasonCodes: [],
      proposedDependencyEdgeCount: 1,
      sampleProposedDependencyEdges: [edge],
      conflictEvidenceCount: 0,
      sampleConflictEvidence: [],
      allowedDecisions: [],
      recommendedNextAction: 'continue_standard_governance_flow' as const,
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
      boundaryPolicy: [
        'manual_conflict_review_package_is_read_only',
        'manual_conflict_review_package_does_not_auto_approve_candidate',
        'manual_conflict_review_package_does_not_write_task_dependencies',
        'manual_conflict_review_package_does_not_write_plan_dates',
        'manual_review_approval_still_required_after_approved_conflict_review',
      ],
    },
    manualReviewHandoff: null,
    manualReviewApproval: null,
    releaseExitHandoff: null,
    releaseExitAssessment: {
      source: 'construction_organization_plan_network_release_exit_assessment' as const,
      status: 'release_exit_blocked' as const,
      canMaterializeRuntime: false as const,
      draftNetworkKey: 'sha256:draft-ready',
      handoffCandidateEventId: null,
      approvalCandidateEventId: null,
      requiredBeforeRuntime: [],
      reasons: [],
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
      boundaryPolicy: [],
    },
    releaseExitPreparation: null,
    domainWriterReleaseExitReadiness: null,
    runtimeEngineEvidence: {
      source: 'construction_organization_plan_network_runtime_engine_evidence_summary' as const,
      status: 'missing_runtime_engine_evidence' as const,
      publicationKey: null,
      presentEngineCodes: [],
      missingEngineCodes: ['E1', 'E3', 'E5'] as Array<'E1' | 'E3' | 'E5'>,
      evidenceCount: 0,
      canClaimTruePerOptionRuntimeEvaluation: false,
      boundaryPolicy: ['runtime_engine_evidence_is_read_only'],
    },
    recommendationDecision: null,
    runtimeEvidenceLineage: {
      workPackageKey: 'pkg-1',
      useCase: 'newProjectPlanning',
      evidenceAction: 'domain_writer_fixture',
    },
    mutationBoundary: {
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
    },
    replayRequirements: [],
    evaluationRequirements: [],
    boundaryPolicy: ['draft_network_is_read_only'],
  }
  const releaseExitHandoff = {
    source: 'construction_organization_plan_network_release_exit_handoff_projection' as const,
    candidateEventId: 'handoff-release-event',
    assetKey: 'construction_organization.plan_network_release_exit_handoff.sha256-draft-ready',
    sourceModule: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
    eventStatus: 'review_required',
    runtimeEffect: 'candidate_only',
    createdAt: '2026-06-22T01:00:00.000Z',
    updatedAt: '2026-06-22T01:00:00.000Z',
    draftNetworkKey: 'sha256:draft-ready',
    originalCandidateEventId: 'event-ready',
    handoffCandidateEventId: 'manual-handoff-event',
    approvalCandidateEventId: 'approval-event',
    optionId: 'option-ready',
    selectedScenarioIds: ['pile_before_excavation'],
    requestedByUserId: 'release-user',
    executedAt: '2026-06-22T01:00:00.000Z',
    releaseRecordTarget: 'construction-org-plan-network-release:project-1',
    rollbackTarget: 'construction-org-plan-network-rollback:project-1',
    consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
    impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
    rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
    proposedDependencyEdgeCount: 1,
    writesTaskDependencies: false as const,
    writesPlanDates: false as const,
    writesSeed: false as const,
    writesBaseline: false as const,
    writesCriticalPathFacts: false as const,
    writesAccelerationDraft: false as const,
  }
  return {
    ...base,
    manualReviewHandoff: {
      source: 'construction_organization_plan_network_manual_review_handoff_projection' as const,
      candidateEventId: 'manual-handoff-event',
      assetKey: 'construction_organization.plan_network_handoff.sha256-draft-ready',
      sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      eventStatus: 'review_required',
      runtimeEffect: 'candidate_only',
      createdAt: '2026-06-21T01:00:00.000Z',
      updatedAt: '2026-06-21T01:00:00.000Z',
      draftNetworkKey: 'sha256:draft-ready',
      originalCandidateEventId: 'event-ready',
      optionId: 'option-ready',
      selectedScenarioIds: ['pile_before_excavation'],
      requestedByUserId: 'review-user',
      executedAt: '2026-06-21T01:00:00.000Z',
      reviewOperation: 'manual_review_dependency_proposal',
      proposedDependencyEdgeCount: 1,
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
    },
    manualConflictReviewDecision: null,
    manualReviewApproval: {
      source: 'construction_organization_plan_network_manual_review_approval_projection' as const,
      candidateEventId: 'approval-event',
      assetKey: 'construction_organization.plan_network_approval.sha256-draft-ready',
      sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
      eventStatus: 'approved',
      runtimeEffect: 'candidate_only',
      createdAt: '2026-06-21T02:00:00.000Z',
      updatedAt: '2026-06-21T02:00:00.000Z',
      draftNetworkKey: 'sha256:draft-ready',
      handoffCandidateEventId: 'manual-handoff-event',
      approvedByUserId: 'approver',
      approvedAt: '2026-06-21T02:00:00.000Z',
      approvalDecision: 'approved_for_release_exit_preparation',
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
    },
    releaseExitHandoff,
  }
}

describe('constructionOrganizationPlanNetworkDomainWriter', () => {
  it('blocks runtime apply before release-exit handoff exists', async () => {
    const draft = { ...buildReadyDraft(), releaseExitHandoff: null }

    const result = await applyConstructionOrganizationPlanNetworkApprovedDraft({
      draft,
      companyId: 'company-1',
      projectId: 'project-1',
      queryExec: async () => [],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_blocked',
      writesTaskDependencies: false,
      releaseRecordPersisted: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'release_exit_handoff_required',
    ]))
  })

  it('blocks option-comparison and manual-comparison packages even when a caller bypasses draft service gates', async () => {
    const draft = {
      ...buildReadyDraft(),
      source: 'construction_organization_plan_network_option_comparison_package',
      assetKey: 'construction_organization.plan_network_option_comparison_package.option-ready',
      runtimeEvidenceLineage: {
        workPackageKey: 'pkg-1',
        useCase: 'manual_comparison',
        evidenceAction: 'option_comparison_package',
      },
      boundaryPolicy: [
        'draft_network_is_read_only',
        'option_comparison_package_is_read_only',
        'manual_comparison_package_is_read_only',
      ],
    } as unknown as ConstructionOrganizationPlanNetworkDraft
    const calls: Array<{ sql: string, params: unknown[] }> = []

    const result = await applyConstructionOrganizationPlanNetworkApprovedDraft({
      draft,
      companyId: 'company-1',
      projectId: 'project-1',
      queryExec: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        return []
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_blocked',
      canMaterializeRuntime: false,
      writesTaskDependencies: false,
      releaseRecordPersisted: false,
      insertedDependencyCount: 0,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'option_comparison_package_cannot_materialize_runtime',
      'manual_comparison_source_cannot_materialize_runtime',
    ]))
    expect(calls).toEqual([])
  })

  it('maps generated row carriers to tasks and appends governed dependency edges without replacing manual dependencies', async () => {
    const draft = buildReadyDraft()
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.tasks') && sql.includes('standard_task_metadata')) {
        return [
          { id: 'task-foundation', standard_task_metadata: { rowCarrierClientRowId: 'row-foundation' } },
          { id: 'task-earthwork', standard_task_metadata: { rowCarrierClientRowId: 'row-earthwork' } },
        ] as T[]
      }
      if (sql.includes('INSERT INTO public.task_dependencies')) {
        return [{ id: 'dep-1' }] as T[]
      }
      if (sql.includes('INSERT INTO public.construction_organization_plan_network_runtime_publications')) {
        return [{ id: 'publication-1' }] as T[]
      }
      return [] as T[]
    }

    const result = await applyConstructionOrganizationPlanNetworkApprovedDraft({
      draft,
      companyId: 'company-1',
      projectId: 'project-1',
      queryExec,
      executedByUserId: 'release-user',
      executedAt: '2026-06-22T02:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_ready',
      writesTaskDependencies: true,
      insertedDependencyCount: 1,
      skippedDependencyCount: 0,
      releaseRecordPersisted: true,
      rollbackTarget: 'construction-org-plan-network-rollback:project-1',
      releaseRecordTarget: 'construction-org-plan-network-release:project-1',
    }))
    expect(result.appliedDependencies[0]).toEqual(expect.objectContaining({
      taskId: 'task-earthwork',
      dependencyTaskId: 'task-foundation',
      dependencyType: 'FS',
      sourceType: 'construction_organization_plan_network',
      sourceRefId: null,
      sourceEventId: 'handoff-release-event',
    }))
    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain('INSERT INTO public.task_dependencies')
    expect(sqlText).toContain('ON CONFLICT')
    expect(sqlText).toContain("WHERE public.task_dependencies.source_type = 'construction_organization_plan_network'")
    expect(sqlText).not.toContain('DELETE FROM task_dependencies')
    expect(sqlText).not.toContain("source_type = 'manual'")
    const dependencyInsert = calls.find((call) => call.sql.includes('INSERT INTO public.task_dependencies'))
    const metadata = JSON.parse(String(dependencyInsert?.params[8] ?? '{}')) as Record<string, unknown>
    expect(metadata).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_domain_writer',
      businessType: 'hospital',
      draftNetworkKey: 'sha256:draft-ready',
      optionId: 'option-ready',
      publicationKey: 'construction-org-plan-network-release:project-1',
      runtimePublicationKey: 'construction-org-plan-network-release:project-1',
    }))
    const publicationInsert = calls.find((call) => call.sql.includes('INSERT INTO public.construction_organization_plan_network_runtime_publications'))
    const releaseLineage = JSON.parse(String(publicationInsert?.params[7] ?? '{}')) as Record<string, unknown>
    expect(releaseLineage).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_domain_writer',
      businessType: 'hospital',
      draftNetworkKey: 'sha256:draft-ready',
      optionId: 'option-ready',
      publicationKey: 'construction-org-plan-network-release:project-1',
      runtimePublicationKey: 'construction-org-plan-network-release:project-1',
    }))
  })

  it('maps generated row ids directly to task ids when historical wizard tasks have no client row carrier metadata', async () => {
    const draft = {
      ...buildReadyDraft(),
      edges: [{
        ...buildReadyDraft().edges[0],
        fromGeneratedRowId: 'task-foundation',
        toGeneratedRowId: 'task-earthwork',
      }],
    }
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes('FROM public.tasks') && sql.includes('standard_task_metadata')) {
        return [
          { id: 'task-foundation', standard_task_metadata: { stableCode: '01-02' } },
          { id: 'task-earthwork', standard_task_metadata: { stableCode: '01-05' } },
        ] as T[]
      }
      if (sql.includes('INSERT INTO public.task_dependencies')) {
        return [{ id: 'dep-1' }] as T[]
      }
      if (sql.includes('INSERT INTO public.construction_organization_plan_network_runtime_publications')) {
        return [{ id: 'publication-1' }] as T[]
      }
      return [] as T[]
    }

    const result = await applyConstructionOrganizationPlanNetworkApprovedDraft({
      draft,
      companyId: 'company-1',
      projectId: 'project-1',
      queryExec,
      executedByUserId: 'release-user',
      executedAt: '2026-06-22T02:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_ready',
      insertedDependencyCount: 1,
      skippedDependencyCount: 0,
      writesTaskDependencies: true,
    }))
    expect(result.appliedDependencies[0]).toEqual(expect.objectContaining({
      taskId: 'task-earthwork',
      dependencyTaskId: 'task-foundation',
    }))
  })

  it('counts conflict-protected manual dependencies as skipped instead of applied', async () => {
    const draft = buildReadyDraft()
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes('FROM public.tasks') && sql.includes('standard_task_metadata')) {
        return [
          { id: 'task-foundation', standard_task_metadata: { rowCarrierClientRowId: 'row-foundation' } },
          { id: 'task-earthwork', standard_task_metadata: { rowCarrierClientRowId: 'row-earthwork' } },
        ] as T[]
      }
      if (sql.includes('INSERT INTO public.task_dependencies')) {
        return [] as T[]
      }
      if (sql.includes('INSERT INTO public.construction_organization_plan_network_runtime_publications')) {
        return [{ id: 'publication-1' }] as T[]
      }
      return [] as T[]
    }

    const result = await applyConstructionOrganizationPlanNetworkApprovedDraft({
      draft,
      companyId: 'company-1',
      projectId: 'project-1',
      queryExec,
      executedByUserId: 'release-user',
      executedAt: '2026-06-22T02:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_ready',
      writesTaskDependencies: false,
      insertedDependencyCount: 0,
      skippedDependencyCount: 1,
      releaseRecordPersisted: true,
    }))
    expect(result.appliedDependencies).toEqual([])
  })
})
