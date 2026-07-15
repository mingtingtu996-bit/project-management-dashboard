import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TargetAccelerationReviewPanel } from '../TargetAccelerationReviewPanel'
import type { WbsTargetFeasibility } from '@/services/wbsTemplateGenerationApi'
import type { Task } from '../../GanttViewTypes'

const tasks: Task[] = [
  {
    id: 'task-structure',
    project_id: 'project-1',
    title: '主体结构',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  },
]

function buildTargetFeasibility(): WbsTargetFeasibility {
  return {
    mode: 'compression_preview',
    scenario: 'runtime_delay_recovery',
    targetEndDate: '2026-11-30',
    naturalEndDate: '2026-12-20',
    overshootDays: 20,
    recoverableDays: 12,
    unrecoverableDays: 8,
    verdict: 'compressible',
    strategies: [],
          accelerationProposal: {
      mode: 'preview_only',
      source: 'target_end_compression',
      targetEndDate: '2026-11-30',
      naturalEndDate: '2026-12-20',
      overshootDays: 20,
      totalRecoverDays: 12,
      remainingGapDays: 8,
      verdict: 'needs_scope_decision',
      actions: [{
        type: 'crashing',
        affectedRowIds: ['task-structure'],
        recoverDays: 12,
        riskLevel: 'medium',
        explanation: '关键路径资源赶工预览。',
        durationAdjustments: [{
          clientRowId: 'task-structure',
          currentDurationDays: 30,
          proposedDurationDays: 26,
          minDurationDays: 24,
          recoverDays: 4,
          basis: 'resource_crash_preview',
        }],
      }],
      protectedConstraints: [],
          calculationBasis: {
            scenario: 'runtime_delay_recovery',
        naturalDurationDays: 220,
        totalRecoverCapRatio: 0.12,
        seasonalFactor: 0.92,
        projectTypeProfile: 'residential',
        criticalCandidateDays: 80,
        resourceGroupedCandidateDays: 30,
        hardConstraintDays: 14,
            constructionOrganizationScenario: {
              source: 'construction_organization_scenario_selector',
          recommendedScenarioIds: [
            'pile_before_excavation',
            'shared_basement_first_then_tower',
          ],
          recommendedPlanOption: {
            optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
            selectedScenarioIds: [
              'pile_before_excavation',
              'shared_basement_first_then_tower',
            ],
            combinedScore: 128,
            confidence: 'high',
            recoveryFactorHint: 1.06,
            useCaseEvaluations: {
              accelerationRecovery: {
                factCoverage: {
                  consumedFactKeys: [
                    'scopeOrganizationFacts',
                    'methodVariantCodes',
                    'buildingCount',
                  ],
                  sidecarFactKeys: ['towerCraneCount'],
                  resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                },
              },
            },
            generatedRowProjection: {
              candidateMaterializationEvaluation: {
                previewEdgeCount: 4,
                satisfiedEdgeCount: 2,
                violatedEdgeCount: 1,
                unresolvedEdgeCount: 1,
                materializationScore: 0.45,
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              },
              materializationDecision: {
                source: 'construction_organization_candidate_materialization_decision',
                decision: 'blocked_by_violations',
                allowManualMaterialization: false,
                reasons: ['candidate_preview_edges_violate_generated_row_dates'],
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              },
              materializationReviewPackage: {
                source: 'construction_organization_candidate_materialization_review_package',
                packageBasis: 'manual_review_package_from_generated_row_preview_edges',
                status: 'blocked_by_violations',
                allowManualReview: false,
                proposedDependencyEdgeCount: 0,
                blockedReasons: ['candidate_preview_edges_violate_generated_row_dates'],
                proposedDependencyEdges: [],
                reviewRequired: true,
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              },
              generatedRowReferenceDurationEvidence: {
                source: 'generated_wbs_row_reference_duration_projection',
                durationBasis: 'generated_row_plan_dates_and_plan_reference_days',
                matchedReferenceRowCount: 5,
                totalPlanReferenceDays: 420,
                writesReferenceDuration: false,
                writesPlanDates: false,
                writesSeed: false,
              },
              generatedRowNetworkEvaluation: {
                source: 'generated_wbs_row_candidate_network_cpm',
                networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
                projectedNetworkSpanDays: 460,
                previewEdgeCount: 4,
                unresolvedEdgeCount: 1,
                criticalGeneratedRowIds: ['row-basement', 'row-tower'],
                materializationStatus: 'partial_mapping_read_only',
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              },
            },
            boundaryPolicy: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
            },
          },
              scenarioRecommendations: {
                accelerationRecovery: {
                  useCase: 'acceleration_recovery',
                  optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                  recoveryFactorHint: 1.06,
                  actionability: 'actionable_candidate',
                },
              },
              planOptionComparisonPackage: {
                source: 'construction_organization_plan_option_comparison_package',
                totalOptionCount: 2,
                recommendedOptionIdsByUseCase: {
                  accelerationRecovery: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                },
                options: [{
                  source: 'construction_organization_plan_option_comparison_item',
                  optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                  selectedScenarioIds: [
                    'pile_before_excavation',
                    'shared_basement_first_then_tower',
                  ],
                  isRecommendedFor: ['accelerationRecovery'],
                  nextGovernanceAction: 'blocked',
                  nextGovernanceReasons: ['blocked_by_violations'],
                }],
              },
              planNetworkDraftRecommendations: {
                accelerationRecovery: {
                  source: 'construction_organization_plan_network_draft_recommendation',
                  useCase: 'acceleration_recovery',
                  optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                  selectedScenarioIds: [
                    'pile_before_excavation',
                    'shared_basement_first_then_tower',
                  ],
                  readiness: 'ready_for_manual_review',
                  evaluationStatus: 'evaluation_ready',
                  materializationDecision: 'ready_for_manual_materialization',
                  proposedDependencyEdgeCount: 4,
                  recommendationBasis: ['generated_row_network_recovery_evidence'],
                  factCoverage: null,
                  e1: {
                    matchedReferenceRowCount: 5,
                    totalPlanReferenceDays: 420,
                    totalContextualReferenceDays: 414,
                    totalRecommendedDurationDays: 408,
                    writesReferenceDuration: false,
                    writesPlanDates: false,
                    writesSeed: false,
                  },
                  e3: {
                    projectedNetworkSpanDays: 460,
                    previewEdgeCount: 4,
                    unresolvedEdgeCount: 1,
                    criticalGeneratedRowIds: ['row-basement', 'row-tower'],
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesCriticalPathFacts: false,
                  },
                  e5: {
                    optionScore: 88,
                    recoveryFactorHint: 1.06,
                    e5RecoverableSpanDays: 6,
                    actionability: 'actionable_candidate',
                    writesAccelerationDraft: false,
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesSeed: false,
                  },
                  mutationBoundary: {
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesSeed: false,
                    writesBaseline: false,
                    writesCriticalPathFacts: false,
                    writesAccelerationDraft: false,
                  },
                },
              },
              resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            },
          },
        },
  }
}

describe('TargetAccelerationReviewPanel', () => {
  it('surfaces the construction organization plan option behind runtime acceleration', () => {
    render(
      <TargetAccelerationReviewPanel
        targetFeasibility={buildTargetFeasibility()}
        tasks={tasks}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /查看赶工建议/ }))

    expect(screen.getByText('施工组织方案')).toBeInTheDocument()
    expect(screen.getByText(/先桩后挖/)).toBeInTheDocument()
    expect(screen.getByText(/整体地下室先行/)).toBeInTheDocument()
    expect(screen.getByText(/已用于判断：空间组织关系、工法做法、楼栋数量/)).toBeInTheDocument()
    expect(screen.getByText(/与当前计划存在 1 条组织关系冲突；已校验 4 条关系，匹配度 45%/)).toBeInTheDocument()
    expect(screen.getByText(/组织关系审阅：存在计划冲突，暂不进入落依赖审阅/)).toBeInTheDocument()
    expect(screen.getByText(/存在冲突，关系草案暂不开放/)).toBeInTheDocument()
    expect(screen.getByText(/推荐草案：可审阅关系草案，关系草案 4 条/)).toBeInTheDocument()
    expect(screen.getByText(/草案评估：E1 参考 5 行 \/ E3 网络 460 天 \/ E5 可恢复 6 天/)).toBeInTheDocument()
    expect(screen.getByText(/下一步治理：blocked/)).toBeInTheDocument()
    expect(screen.getByText(/原因：存在计划关系冲突/)).toBeInTheDocument()
    expect(screen.getByText(/已读取 5 行生成计划参考工期，合计参考 420 天/)).toBeInTheDocument()
    expect(screen.getByText(/候选网络只读评估：跨度 460 天，关键生成行 2 个，未解析 1 条关系/)).toBeInTheDocument()
    expect(screen.getByText(/塔吊等资源只作可行性旁路信号/)).toBeInTheDocument()
    expect(screen.getByText(/候选方案不直接改写任务依赖或计划日期/)).toBeInTheDocument()
  })

  it('uses the acceleration recovery construction organization option when it differs from the default planning option', () => {
    const targetFeasibility = buildTargetFeasibility()
    const scenario = targetFeasibility.accelerationProposal?.calculationBasis?.constructionOrganizationScenario
    if (!scenario) throw new Error('expected construction organization scenario fixture')

    scenario.recommendedPlanOption = {
      optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
      selectedScenarioIds: [
        'pile_before_excavation',
        'shared_basement_first_then_tower',
      ],
      combinedScore: 128,
      confidence: 'high',
      recoveryFactorHint: 1.02,
      useCaseEvaluations: {
        newProjectPlanning: {
          factCoverage: {
            consumedFactKeys: ['scopeOrganizationFacts'],
          },
        },
      },
    }
    scenario.planOptions = [
      scenario.recommendedPlanOption,
      {
        optionId: 'construction_org_option:pile_before_excavation+tower_lane_early_release_after_core_basement',
        selectedScenarioIds: [
          'pile_before_excavation',
          'tower_lane_early_release_after_core_basement',
        ],
        combinedScore: 122,
        confidence: 'medium',
        recoveryFactorHint: 1.12,
        useCaseEvaluations: {
          accelerationRecovery: {
            factCoverage: {
              consumedFactKeys: [
                'scopeOrganizationFacts',
                'climateSignals',
              ],
              sidecarFactKeys: ['towerCraneCount'],
              resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            },
          },
        },
        excludedReasons: [{
          scenarioId: 'shared_basement_first_then_tower',
          reasons: ['not_selected_for_basement_tower_release'],
        }],
      },
    ]
    scenario.scenarioRecommendations = {
      newProjectPlanning: {
        useCase: 'new_project_planning',
        optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
        recoveryFactorHint: 1.02,
        actionability: 'actionable_candidate',
      },
      accelerationRecovery: {
        useCase: 'acceleration_recovery',
        optionId: 'construction_org_option:pile_before_excavation+tower_lane_early_release_after_core_basement',
        recoveryFactorHint: 1.12,
        actionability: 'actionable_candidate',
      },
    }

    render(
      <TargetAccelerationReviewPanel
        targetFeasibility={targetFeasibility}
        tasks={tasks}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /查看赶工建议/ }))

    expect(screen.getByText('先桩后挖 / 塔楼提前释放')).toBeInTheDocument()
    expect(screen.getByText(/塔楼提前释放/)).toBeInTheDocument()
    expect(screen.getByText(/已用于判断：空间组织关系、天气\/季节/)).toBeInTheDocument()
    expect(screen.getByText(/赶工恢复：可作为赶工恢复候选/)).toBeInTheDocument()
    expect(screen.queryByText(/新建主计划：可作为默认组织方案/)).not.toBeInTheDocument()
  })
})
