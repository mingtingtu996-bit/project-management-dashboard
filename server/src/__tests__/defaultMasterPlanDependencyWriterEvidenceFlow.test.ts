import { describe, expect, it } from 'vitest'
import type { TaskBaseline, TaskBaselineItem } from '../types/db.js'
import {
  runDefaultMasterPlanDependencyWriterEvidenceFlow,
} from '../services/defaultMasterPlanDependencyWriterEvidenceFlowService.js'

describe('default master plan dependency writer evidence flow', () => {
  it('keeps the default dependency writer flow dry-run by default without calling the runtime writer', async () => {
    const calls: string[] = []
    const result = await runDefaultMasterPlanDependencyWriterEvidenceFlow({
      baseline: buildBaseline(),
      items: buildBaselineItems(),
      handoffCandidateEventId: 'handoff-event-1',
      approvalCandidateEventId: 'approval-event-1',
      releaseHandoffCandidateEventId: 'release-event-1',
      releaseRecordTarget: 'default-master-plan-publication-1',
      rollbackTarget: 'rollback:default-master-plan-publication-1',
      requestedByUserId: 'pm-1',
      executedByUserId: 'pm-1',
      executedAt: '2026-07-01T09:30:00.000Z',
      queryExec: async (sql) => {
        calls.push(sql)
        return []
      },
    })

    expect(calls).toEqual([])
    expect(result).toEqual(expect.objectContaining({
      source: 'default_master_plan_dependency_writer_evidence_flow',
      status: 'dry_run_ready',
      executionMode: 'dry_run',
      writesProductionTables: false,
      productionReady: false,
    }))
    expect(result.evidence).toEqual(expect.objectContaining({
      schemaVersion: 'workbuddy-default-master-plan-dependency-writer-evidence/v1',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      execution_mode: 'dry_run',
      candidate_default_master_plan: expect.objectContaining({
        generation_mode: 'residential_master_plan_v2',
        candidate_default_master_plan_baseline: true,
      }),
      task_mapping: expect.objectContaining({
        status: 'runtime_task_mapping_verified',
        mapped_generated_row_count: 2,
        mapped_task_count: 2,
        unresolved_generated_row_ids: [],
      }),
      domain_writer_result: expect.objectContaining({
        source: 'construction_organization_plan_network_domain_writer',
        status: 'dry_run_not_executed',
        writesTaskDependencies: false,
        releaseRecordPersisted: false,
      }),
      critical_path_recalculation: expect.objectContaining({
        status: 'not_run_dry_run',
      }),
    }))
  })

  it('executes the existing governed domain writer only in explicit execute mode and emits checker-compatible evidence', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.tasks') && sql.includes('standard_task_metadata')) {
        return [
          { id: 'task-site', standard_task_metadata: { rowCarrierClientRowId: 'row-site' } },
          { id: 'task-foundation', standard_task_metadata: { rowCarrierClientRowId: 'row-foundation' } },
        ] as T[]
      }
      if (sql.includes('INSERT INTO public.task_dependencies')) {
        return [{ id: 'dependency-1' }] as T[]
      }
      if (sql.includes('INSERT INTO public.construction_organization_plan_network_runtime_publications')) {
        return [{ id: 'publication-1' }] as T[]
      }
      return [] as T[]
    }

    const result = await runDefaultMasterPlanDependencyWriterEvidenceFlow({
      mode: 'execute',
      baseline: buildBaseline(),
      items: buildBaselineItems(),
      companyId: 'company-1',
      handoffCandidateEventId: 'handoff-event-1',
      approvalCandidateEventId: 'approval-event-1',
      releaseHandoffCandidateEventId: 'release-event-1',
      releaseRecordTarget: 'default-master-plan-publication-1',
      rollbackTarget: 'rollback:default-master-plan-publication-1',
      requestedByUserId: 'pm-1',
      executedByUserId: 'pm-1',
      executedAt: '2026-07-01T09:30:00.000Z',
      queryExec,
      taskDependenciesExportEvidenceRef: 'task_dependencies_export:project-testing/reports/default-master-plan-production-readiness/task-dependencies.json#sha256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      criticalPathRecalculation: {
        status: 'readback_passed',
        evidence_ref: 'project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json',
      },
    })

    expect(calls.map((call) => call.sql).join('\n')).toContain('INSERT INTO public.task_dependencies')
    expect(result).toEqual(expect.objectContaining({
      status: 'executed',
      executionMode: 'execute',
      writesProductionTables: true,
      productionReady: false,
    }))
    expect(result.evidence).toEqual(expect.objectContaining({
      schemaVersion: 'workbuddy-default-master-plan-dependency-writer-evidence/v1',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      sourceEvidenceRef: 'task_dependencies_export:project-testing/reports/default-master-plan-production-readiness/task-dependencies.json#sha256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      candidate_default_master_plan: expect.objectContaining({
        generation_mode: 'residential_master_plan_v2',
        source_version_label: 'residential_master_plan_v2',
        candidate_default_master_plan_baseline: true,
      }),
      task_mapping: expect.objectContaining({
        status: 'runtime_task_mapping_verified',
        mapped_generated_row_count: 2,
        mapped_task_count: 2,
        unresolved_generated_row_ids: [],
      }),
      domain_writer_result: expect.objectContaining({
        source: 'construction_organization_plan_network_domain_writer',
        status: 'runtime_apply_ready',
        writesTaskDependencies: true,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        insertedDependencyCount: 1,
        releaseRecordPersisted: true,
        releaseHandoffCandidateEventId: 'release-event-1',
        releaseRecordTarget: 'default-master-plan-publication-1',
        rollbackTarget: 'rollback:default-master-plan-publication-1',
      }),
      critical_path_recalculation: {
        status: 'readback_passed',
        evidence_ref: 'project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json',
      },
    }))
    expect(result.evidence.domain_writer_result.appliedDependencies).toEqual([
      expect.objectContaining({
        taskId: 'task-foundation',
        dependencyTaskId: 'task-site',
        sourceType: 'construction_organization_plan_network',
      }),
    ])
  })

  it('does not mark a ready draft as default master-plan evidence when the baseline source label is legacy', async () => {
    const result = await runDefaultMasterPlanDependencyWriterEvidenceFlow({
      baseline: {
        ...buildBaseline(),
        source_version_label: 'legacy_template_serial_fallback',
      },
      items: buildBaselineItems(),
      handoffCandidateEventId: 'handoff-event-1',
      approvalCandidateEventId: 'approval-event-1',
      releaseHandoffCandidateEventId: 'release-event-1',
      releaseRecordTarget: 'default-master-plan-publication-1',
      rollbackTarget: 'rollback:default-master-plan-publication-1',
      requestedByUserId: 'pm-1',
      executedByUserId: 'pm-1',
      executedAt: '2026-07-01T09:30:00.000Z',
    })

    expect(result.status).toBe('dry_run_ready')
    expect(result.evidence.domain_writer_handoff.status).toBe('domain_writer_draft_ready')
    expect(result.evidence.candidate_default_master_plan).toEqual({
      generation_mode: null,
      source_version_label: 'legacy_template_serial_fallback',
      candidate_default_master_plan_baseline: false,
    })
  })

  it('does not mark default master-plan evidence when a baseline item hides retired original source lineage', async () => {
    const result = await runDefaultMasterPlanDependencyWriterEvidenceFlow({
      baseline: buildBaseline(),
      items: buildBaselineItems().map((item, index) => index === 0
        ? {
            ...item,
            generation_metadata: {
              ...(item.generation_metadata as Record<string, unknown>),
              originalSource: 'manual_comparison_scenario',
            },
          }
        : item),
      handoffCandidateEventId: 'handoff-event-1',
      approvalCandidateEventId: 'approval-event-1',
      releaseHandoffCandidateEventId: 'release-event-1',
      releaseRecordTarget: 'default-master-plan-publication-1',
      rollbackTarget: 'rollback:default-master-plan-publication-1',
      requestedByUserId: 'pm-1',
      executedByUserId: 'pm-1',
      executedAt: '2026-07-01T09:30:00.000Z',
    })

    expect(result.status).toBe('blocked')
    expect(result.evidence.candidate_default_master_plan).toEqual({
      generation_mode: null,
      source_version_label: 'manual_comparison_scenario',
      candidate_default_master_plan_baseline: false,
    })
    expect(result.blockers).toContain('candidate_default_master_plan_retired_or_low_information_source_label')
  })

  it('blocks default master-plan evidence when a baseline item hides retired source aliases in nested lineage metadata', async () => {
    const result = await runDefaultMasterPlanDependencyWriterEvidenceFlow({
      baseline: buildBaseline(),
      items: buildBaselineItems().map((item, index) => index === 0
        ? {
            ...item,
            generation_metadata: {
              ...(item.generation_metadata as Record<string, unknown>),
              templateSource: 'legacy_template_reverse_inference',
              sourceMetadata: {
                originSource: 'low_information_template_draft',
                sourceLineage: [
                  { scenarioSource: 'manual_comparison_scenario' },
                ],
              },
              runtimeLineage: {
                sourceMetadata: {
                  fallbackApplied: 'human_comparison_package',
                },
              },
            },
          }
        : item),
      handoffCandidateEventId: 'handoff-event-1',
      approvalCandidateEventId: 'approval-event-1',
      releaseHandoffCandidateEventId: 'release-event-1',
      releaseRecordTarget: 'default-master-plan-publication-1',
      rollbackTarget: 'rollback:default-master-plan-publication-1',
      requestedByUserId: 'pm-1',
      executedByUserId: 'pm-1',
      executedAt: '2026-07-01T09:30:00.000Z',
    })

    expect(result.status).toBe('blocked')
    expect(result.evidence.candidate_default_master_plan).toEqual({
      generation_mode: null,
      source_version_label: 'legacy_template_reverse_inference',
      candidate_default_master_plan_baseline: false,
    })
    expect(result.blockers).toContain('candidate_default_master_plan_retired_or_low_information_source_label')
  })

  it('blocks default master-plan evidence when governance basis policy reason and evidence fields hide retired sources', async () => {
    const result = await runDefaultMasterPlanDependencyWriterEvidenceFlow({
      baseline: buildBaseline(),
      items: buildBaselineItems().map((item, index) => index === 0
        ? {
            ...item,
            generation_metadata: {
              ...(item.generation_metadata as Record<string, unknown>),
              comparisonBasis: ['manual_comparison_scenario'],
              boundaryPolicy: ['low_information_template_draft'],
              decisionReasons: JSON.stringify([
                { sourceKind: 'legacy_template_reverse_inference' },
              ]),
              reviewProof: {
                sourceStatus: 'controlled_degradation',
              },
              handoffEvidence: [
                { sourceType: 'legacy_template_serial_fallback' },
              ],
            },
          }
        : item),
      handoffCandidateEventId: 'handoff-event-1',
      approvalCandidateEventId: 'approval-event-1',
      releaseHandoffCandidateEventId: 'release-event-1',
      releaseRecordTarget: 'default-master-plan-publication-1',
      rollbackTarget: 'rollback:default-master-plan-publication-1',
      requestedByUserId: 'pm-1',
      executedByUserId: 'pm-1',
      executedAt: '2026-07-01T09:30:00.000Z',
    })

    expect(result.status).toBe('blocked')
    expect(result.evidence.candidate_default_master_plan).toEqual({
      generation_mode: null,
      source_version_label: 'manual_comparison_scenario',
      candidate_default_master_plan_baseline: false,
    })
    expect(result.blockers).toContain('candidate_default_master_plan_retired_or_low_information_source_label')
  })

  it('does not treat duration asset evidence fields as retired default master-plan source labels', async () => {
    const result = await runDefaultMasterPlanDependencyWriterEvidenceFlow({
      baseline: buildBaseline(),
      items: buildBaselineItems().map((item, index) => index === 0
        ? {
            ...item,
            generation_metadata: {
              ...(item.generation_metadata as Record<string, unknown>),
              durationAssetMapping: {
                source: 'real_plan_evidence_asset_backed_master_plan_v1',
                standardWorkDurationSeedStableCode: 'site_setup_temp_works',
                t2RhythmTemplateId: 't2-residential-basement-structure-handover-rhythm-v1',
              },
              durationAssetCalculation: {
                source: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
                durationTruthSource: 'asset_backed_candidate_master_plan',
                standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
                runtimeReferenceDaysConsumed: false,
                runtimeReferenceDaysEvidenceLevel: '',
              },
            },
          }
        : item),
      handoffCandidateEventId: 'handoff-event-1',
      approvalCandidateEventId: 'approval-event-1',
      releaseHandoffCandidateEventId: 'release-event-1',
      releaseRecordTarget: 'default-master-plan-publication-1',
      rollbackTarget: 'rollback:default-master-plan-publication-1',
      requestedByUserId: 'pm-1',
      executedByUserId: 'pm-1',
      executedAt: '2026-07-01T09:30:00.000Z',
    })

    expect(result.status).toBe('dry_run_ready')
    expect(result.evidence.candidate_default_master_plan).toEqual({
      generation_mode: 'residential_master_plan_v2',
      source_version_label: 'residential_master_plan_v2',
      candidate_default_master_plan_baseline: true,
    })
    expect(result.blockers).not.toContain('candidate_default_master_plan_retired_or_low_information_source_label')
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

function buildBaselineItems(): TaskBaselineItem[] {
  return [
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
