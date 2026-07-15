import { describe, expect, it } from 'vitest'
import type { TaskBaseline, TaskBaselineItem } from '../types/db.js'

describe('default master plan dependency writer handoff', () => {
  it('builds a read-only domain-writer draft with explicit release and rollback controls', async () => {
    const service = await import('../services/constructionOrganizationPlanNetworkDraftService.js')
    const builder = (service as Record<string, unknown>).buildDefaultMasterPlanDependencyWriterDraft

    expect(typeof builder).toBe('function')
    if (typeof builder !== 'function') return

    const baseline = buildBaseline()
    const items = [
      buildBaselineItem({
        id: 'item-site',
        sourceTaskId: 'task-site',
        clientRowId: 'row-site',
        title: '场地移交与测量控制网复核',
        predecessors: [],
      }),
      buildBaselineItem({
        id: 'item-foundation',
        sourceTaskId: 'task-foundation',
        clientRowId: 'row-foundation',
        title: '桩基与围护结构施工',
        predecessors: [{
          clientRowId: 'row-site',
          dependencyType: 'FS',
          lagDays: 0,
          intentCode: 'residential_master_plan_v2_sequence',
        }],
      }),
    ]

    const result = builder({
      baseline,
      items,
      handoffCandidateEventId: 'handoff-event-1',
      approvalCandidateEventId: 'approval-event-1',
      releaseHandoffCandidateEventId: 'release-event-1',
      releaseRecordTarget: 'default-master-plan-publication-1',
      rollbackTarget: 'rollback:default-master-plan-publication-1',
      executedAt: '2026-07-01T09:00:00.000Z',
      requestedByUserId: 'actor-1',
      consumerVerificationRefs: ['project-testing:dependency-read-smoke'],
      impactMonitoringRefs: ['project-testing:dependency-impact-monitor'],
      rollbackWriterRefs: ['project-testing:dependency-rollback-smoke'],
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'default_master_plan_dependency_writer_handoff',
      status: 'domain_writer_draft_ready',
      canMaterializeRuntime: false,
      dependencyIntentCount: 1,
      mappedDependencyIntentCount: 1,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesBaseline: false,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
    }))
    expect(result.taskMappings).toEqual(expect.arrayContaining([
      { generatedRowId: 'row-site', taskId: 'task-site', baselineItemId: 'item-site' },
      { generatedRowId: 'row-foundation', taskId: 'task-foundation', baselineItemId: 'item-foundation' },
    ]))
    expect(result.taskMappings).toHaveLength(2)
    expect(result.draft).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_draft',
      readiness: 'ready_for_replay',
      projectId: 'project-1',
      businessType: 'general_civil_residential',
      edgeCount: 1,
      nodeCount: 2,
      manualReviewHandoff: expect.objectContaining({ candidateEventId: 'handoff-event-1' }),
      manualReviewApproval: expect.objectContaining({ candidateEventId: 'approval-event-1' }),
      releaseExitHandoff: expect.objectContaining({
        candidateEventId: 'release-event-1',
        releaseRecordTarget: 'default-master-plan-publication-1',
        rollbackTarget: 'rollback:default-master-plan-publication-1',
      }),
    }))
    expect(result.draft.edges).toEqual([
      expect.objectContaining({
        fromGeneratedRowId: 'row-site',
        toGeneratedRowId: 'row-foundation',
        dependencyType: 'FS',
        lagDays: 0,
        intent: 'residential_master_plan_v2_sequence',
        writesTaskDependencies: false,
      }),
    ])
    expect(result.draft.evaluationEvidence).toEqual(expect.objectContaining({
      evaluationStatus: 'evaluation_ready',
      e3: expect.objectContaining({
        previewEdgeCount: 1,
        unresolvedEdgeCount: 0,
        writesTaskDependencies: false,
      }),
    }))
  })
})

function buildBaseline(): TaskBaseline {
  return {
    id: 'baseline-1',
    project_id: 'project-1',
    version: 1,
    status: 'confirmed',
    title: '住宅默认主计划',
    source_type: 'manual',
    source_version_label: 'residential_master_plan_v2',
    created_at: '2026-07-01T07:00:00.000Z',
    updated_at: '2026-07-01T07:00:00.000Z',
  }
}

function buildBaselineItem(params: {
  id: string
  sourceTaskId: string
  clientRowId: string
  title: string
  predecessors: Array<{ clientRowId: string; dependencyType: string; lagDays: number; intentCode: string }>
}): TaskBaselineItem {
  return {
    id: params.id,
    project_id: 'project-1',
    baseline_version_id: 'baseline-1',
    source_task_id: params.sourceTaskId,
    title: params.title,
    planned_start_date: '2026-07-01',
    planned_end_date: '2026-07-10',
    sort_order: 1,
    mapping_status: 'mapped',
    generation_metadata: {
      source: 'residential_master_plan_v2',
      candidateOnly: true,
      candidate_default_master_plan_baseline: true,
      clientRowId: params.clientRowId,
      predecessorDependencies: params.predecessors,
      durationSuggestion: {
        planDurationTruthSource: 'candidate_default_master_plan_baseline',
        dataUpgradeBlockedBy: ['GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'],
      },
      writesTasks: false,
      writesTaskDependencies: false,
      writesCriticalPathFacts: false,
    },
    created_at: '2026-07-01T07:00:00.000Z',
    updated_at: '2026-07-01T07:00:00.000Z',
  }
}
