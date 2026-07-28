import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Step6ProjectProfileConfirmation } from '@/components/project/wizard/Step6ProjectProfileConfirmation'
import type { WizardProfilePreview } from '@/components/project/wizard/projectWizardApi'

const durationMetric = (value: number, unit: 'calendar_day' | 'construction_production_day') => ({
  value,
  unit,
  calendarRef: unit === 'calendar_day' ? 'gregorian' : 'work_calendar',
  calendarVersion: unit === 'calendar_day' ? 'ISO-8601' : 'calendar-v1',
  timezone: 'Asia/Shanghai',
  asOf: '2026-07-20',
  availability: 'available' as const,
  unavailableReason: null,
})

const basePreview: WizardProfilePreview = {
  recommendation: {
    matchedTemplates: ['china-gb50300-base'],
    triggeredItemPacks: ['china-gb50300-base'],
    triggeredMilestones: [],
    expectedRowCount: {
      overview: 120,
      standard: 400,
      detailed: 1500,
    },
  },
  estimatedRowCount: 400,
  previewSummary: {
    businessType: 'general_civil',
    detailLevel: 'standard',
    buildingCount: 1,
    templateCount: 1,
    milestoneCount: 0,
  },
  profile: {
    identity: {
      projectName: '示例项目',
      businessType: 'general_civil',
      mode: 'new',
    },
    scale: {
      buildingCount: 1,
      highestBuildingFloorCount: 26,
      basementLevelCount: 2,
      totalAreaM2: 100000,
    },
    methods: {
      methodVariantCodes: ['cast_in_situ'],
      prefabSystemCodes: [],
      elementVariantCodes: [],
      buildingPatternCodes: [],
    },
    features: {
      userSelected: {},
      inferred: {
        functionalUsageCodes: ['住宅楼'],
      },
    },
    commercialFactReadiness: {
      summary: {
        readyCount: 4,
        warningCount: 0,
        blockingCount: 0,
        disabledCount: 1,
      },
      items: [
        {
          code: 'scale',
          label: '规模体量事实',
          status: 'ready',
          title: '规模体量可用于模板生成',
          detail: '总建筑面积、楼栋数、层数和地下室事实已经汇总为生成器可消费口径。',
          action: null,
          evidence: ['总建筑面积 100,000 m²', '最高层数 26 层'],
        },
        {
          code: 'method',
          label: '工法/工业化事实',
          status: 'ready',
          title: '工法画像可用于模板选择',
          detail: '已识别现浇工法。',
          action: null,
          evidence: ['工法 cast_in_situ'],
        },
        {
          code: 'scope',
          label: '范围/空间结构事实',
          status: 'ready',
          title: '空间结构可用于任务挂接',
          detail: '工程对象和生成范围已闭合。',
          action: null,
          evidence: ['scope_objects 已生成', 'scope_combos 已生成'],
        },
        {
          code: 'special_feature',
          label: '专项工程特征事实',
          status: 'ready',
          title: '专项特征可用于专项工序触发',
          detail: '当前未识别需要阻断生成的专项缺口。',
          action: null,
          evidence: ['住宅楼'],
        },
        {
          code: 'resource_assumption',
          label: '资源配置假设事实',
          status: 'disabled',
          title: '资源配置假设当前不参与工期估算',
          detail: '当前向导没有可靠来源，不伪造塔吊或施工电梯数量。',
          action: null,
          evidence: ['towerCraneCount=null', 'constructionHoistCount=null'],
        },
      ],
    },
    generation: {
      detailLevel: 'standard',
      estimatedRowCount: 400,
      templateCount: 1,
      milestoneCount: 0,
    },
    issues: [],
  },
}

describe('Step6ProjectProfileConfirmation', () => {
  it('uses typed production-day facts for nested acceleration actions', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          targetFeasibility: {
            mode: 'compression_preview',
            targetEndDate: '2026-07-20',
            naturalEndDate: '2026-07-25',
            overshootDays: 999,
            overshoot: durationMetric(5, 'calendar_day'),
            recoverableDays: 999,
            recoverable: durationMetric(3, 'construction_production_day'),
            unrecoverableDays: 999,
            unrecoverable: durationMetric(2, 'construction_production_day'),
            verdict: 'compressible',
            strategies: [],
            accelerationProposal: {
              mode: 'preview_only',
              source: 'target_end_compression',
              targetEndDate: '2026-07-20',
              naturalEndDate: '2026-07-25',
              overshootDays: 999,
              overshoot: durationMetric(5, 'calendar_day'),
              totalRecoverDays: 999,
              totalRecover: durationMetric(3, 'construction_production_day'),
              remainingGapDays: 999,
              remainingGap: durationMetric(2, 'construction_production_day'),
              verdict: 'needs_scope_decision',
              actions: [{
                type: 'scope_reduction',
                affectedRowIds: [],
                recoverDays: 999,
                recoverDuration: durationMetric(2, 'construction_production_day'),
                riskLevel: 'high',
                explanation: '需要人工确认交付范围。',
                decisionOptions: [],
              }],
              protectedConstraints: [],
            },
          },
        }}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText(/预计追回 2 个生产日/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('999')
  })

  it('shows an unavailable state instead of treating missing calendar-day metadata as target-aligned', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          targetFeasibility: {
            mode: 'compare_only',
            targetEndDate: '2026-07-20',
            naturalEndDate: '2026-07-25',
            overshootDays: 999,
            overshoot: {
              value: null,
              unit: 'calendar_day',
              calendarRef: null,
              calendarVersion: null,
              timezone: 'Asia/Shanghai',
              asOf: '',
              availability: 'unavailable',
              unavailableReason: 'as_of_missing',
            },
            recoverableDays: 999,
            recoverable: null,
            unrecoverableDays: 999,
            unrecoverable: null,
            verdict: 'tight',
            strategies: [],
          },
        }}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText(/日历天口径不可用/)).toBeInTheDocument()
    expect(screen.queryByText(/基本匹配/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('999')
  })

  it('shows commercial readiness for the five static fact groups before generation', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={basePreview}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '商业化事实闭环' })).toBeInTheDocument()
    expect(screen.getByText('4 项已达标')).toBeInTheDocument()
    expect(screen.getByText('1 项未启用')).toBeInTheDocument()
    expect(screen.getByText('规模体量事实')).toBeInTheDocument()
    expect(screen.getByText('工法/工业化事实')).toBeInTheDocument()
    expect(screen.getByText('范围/空间结构事实')).toBeInTheDocument()
    expect(screen.getByText('专项工程特征事实')).toBeInTheDocument()
    expect(screen.getByText('资源配置假设事实')).toBeInTheDocument()
    expect(screen.getByText('资源配置假设当前不参与工期估算')).toBeInTheDocument()
    expect(screen.getByText(/不伪造塔吊或施工电梯数量/)).toBeInTheDocument()
    expect(screen.getByText('towerCraneCount=null')).toBeInTheDocument()
    expect(screen.getByText('constructionHoistCount=null')).toBeInTheDocument()
  })

  it('shows construction organization scenario before final task generation', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          constructionOrganizationScenario: {
            source: 'construction_organization_scenario_selector',
            confidence: 'high',
            recommendedScenarioIds: [
              'pile_before_excavation',
              'shared_basement_first_then_tower',
            ],
            boundaryPolicy: {
              resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            },
            recommendedPlanOption: {
              selectedScenarioIds: [
                'pile_before_excavation',
                'shared_basement_first_then_tower',
              ],
              confidence: 'high',
              evaluation: {
                useCaseEvaluations: {
                  newProjectPlanning: {
                    factCoverage: {
                      decisionFactKeys: [
                        'scopeOrganizationFacts',
                        'methodVariantCodes',
                        'buildingCount',
                      ],
                      contextFactKeys: [
                        'planScopeCaliber',
                        'deliveryStandard',
                      ],
                      consumedFactKeys: [
                        'scopeOrganizationFacts',
                        'methodVariantCodes',
                        'buildingCount',
                        'planScopeCaliber',
                        'deliveryStandard',
                      ],
                      sidecarFactKeys: ['towerCraneCount'],
                      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                    },
                  },
                  startingLineOnboarding: {
                    factCoverage: {
                      consumedFactKeys: [
                        'scopeOrganizationFacts',
                        'onboardingSubstage',
                      ],
                    },
                  },
                },
              },
            },
            scenarioRecommendations: {
              newProjectPlanning: {
                useCase: 'new_project_planning',
                actionability: 'actionable_candidate',
                recommendationBasis: ['generated_row_projection_alignment'],
              },
              startingLineOnboarding: {
                useCase: 'starting_line_onboarding',
                actionability: 'evidence_only',
              },
            },
            planNetworkDraftRecommendations: {
              newProjectPlanning: {
                source: 'construction_organization_plan_network_draft_recommendation',
                useCase: 'new_project_planning',
                optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                selectedScenarioIds: [
                  'pile_before_excavation',
                  'shared_basement_first_then_tower',
                ],
                readiness: 'ready_for_manual_review',
                evaluationStatus: 'evaluation_ready',
                materializationDecision: 'ready_for_manual_materialization',
                proposedDependencyEdgeCount: 3,
                recommendationBasis: ['generated_row_projection_alignment'],
                factCoverage: null,
                e1: {
                  matchedReferenceRowCount: 4,
                  totalPlanReferenceDays: 310,
                  totalContextualReferenceDays: 306,
                  totalRecommendedDurationDays: 300,
                  writesReferenceDuration: false,
                  writesPlanDates: false,
                  writesSeed: false,
                },
                e3: {
                  projectedNetworkSpanDays: 318,
                  previewEdgeCount: 3,
                  unresolvedEdgeCount: 0,
                  criticalGeneratedRowIds: ['row-foundation', 'row-basement'],
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesCriticalPathFacts: false,
                },
                e5: {
                  optionScore: 82,
                  recoveryFactorHint: 1.06,
                  e5RecoverableSpanDays: 5,
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
          },
        }}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('施工组织方案')).toBeInTheDocument()
    expect(screen.getByText('先桩后挖 / 整体地下室先行')).toBeInTheDocument()
    expect(screen.getByText('已用于判断：空间组织关系、工法做法、楼栋数量')).toBeInTheDocument()
    expect(screen.getByText('已留痕：计划口径、交付标准')).toBeInTheDocument()
    expect(screen.getByText('推荐草案：可审阅关系草案，关系草案 3 条')).toBeInTheDocument()
    expect(screen.getByText('草案评估：E1 参考 4 行 / E3 网络 318 天 / E5 可恢复 5 天')).toBeInTheDocument()
    expect(screen.getByText(/新建主计划：可作为默认组织方案/)).toBeInTheDocument()
    expect(screen.queryByText(/起跑线接入：仅作证据/)).not.toBeInTheDocument()
    expect(screen.getByText('塔吊等资源只作可行性旁路信号')).toBeInTheDocument()
    expect(screen.getByText('候选方案不直接改写任务依赖或计划日期')).toBeInTheDocument()
  })

  it('shows duration asset utilization without adding a PM approval gate', () => {
    const onGenerate = vi.fn()
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            generation: {
              ...basePreview.profile.generation,
              durationAssetUtilizationSummary: {
                source: 'default_master_plan_duration_asset_utilization_summary',
                scheduleRowCount: 60,
                standardWorkDurationSeedRowCount: 58,
                activeStandardWorkDurationSeedRowCount: 8,
                fallbackStandardWorkDurationSeedRowCount: 50,
                t2RhythmTemplateRowCount: 57,
                activeT2RhythmTemplateRowCount: 7,
                fallbackT2RhythmTemplateRowCount: 50,
                runtimeReferenceDaysConsumedRowCount: 6,
                rowsMissingRuntimeReferenceDaysCount: 54,
                rowsMissingDurationAssetCount: 2,
                rowsMissingT2RhythmTemplateCount: 3,
                dependencyAssetConsumedRowCount: 12,
                durationRiskRangeRowCount: 55,
              },
              planQualityDiagnostics: {
                source: 'wizard_generation_plan_quality_diagnostics',
                status: 'offline_quality_review_recommended',
                intendedUse: 'offline_development_quality_review_and_template_calibration',
                runtimeApprovalRequired: false,
                blocksWizardCommit: false,
                blocksBaselinePublication: false,
              },
            },
          },
        }}
        onGenerate={onGenerate}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('工期资产总账')).toBeInTheDocument()
    expect(screen.getByText('seed 58/60')).toBeInTheDocument()
    expect(screen.getByText('runtime seed 8/60')).toBeInTheDocument()
    expect(screen.getByText('当前计划已使用系统冷启动资产；已发布学习校准仅作为可选覆盖，不影响本次生成与确认。')).toBeInTheDocument()
    expect(screen.getByText('依赖资产 12 行')).toBeInTheDocument()
    expect(screen.queryByText('项目经理审查清单')).not.toBeInTheDocument()
    const generateButton = screen.getByRole('button', { name: '确认并生成任务' })
    expect(generateButton).toBeEnabled()
    fireEvent.click(generateButton)
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('uses the typed production-day reserve for candidate duration risk', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            generation: {
              ...basePreview.profile.generation,
              candidateDurationAssetPreview: {
                totalCount: 1,
                riskRangeCount: 1,
                items: [{
                  clientRowId: 'row-1',
                  title: '主体结构施工',
                  riskP20DurationDays: 150,
                  riskP50DurationDays: 180,
                  riskP80DurationDays: 240,
                  durationRiskDistribution: {
                    p20Duration: durationMetric(15, 'construction_production_day'),
                    p50Duration: durationMetric(18, 'construction_production_day'),
                    p80Duration: durationMetric(24, 'construction_production_day'),
                    reserveDuration: durationMetric(6, 'construction_production_day'),
                    source: 'duration_benchmarks',
                    scope: 'company',
                    sampleCount: 24,
                    generatedAt: '2026-07-21T08:00:00.000Z',
                    sourceAsOf: '2026-07-20T23:59:59.000Z',
                    availability: 'available',
                    unavailableReason: null,
                  },
                }],
              },
            },
          },
        }}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('工期风险建议预留 6 个生产日')).toBeInTheDocument()
    expect(screen.queryByText('工期风险建议预留 60 天')).not.toBeInTheDocument()
  })

  it('does not display raw runtime reference days without typed production-day provenance', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            generation: {
              ...basePreview.profile.generation,
              candidateDurationAssetPreview: {
                totalCount: 1,
                items: [{
                  clientRowId: 'raw-runtime-row',
                  title: 'Raw runtime row',
                  runtimeReferenceDaysConsumed: true,
                  runtimeReferenceDaysStableCode: 'BTMP-SCH-01',
                  runtimeReferenceDaysP50Days: 160,
                  runtimeReferenceDaysP80Days: 176,
                  runtimeReferenceDaysSampleCount: 3,
                  durationRiskDistribution: {
                    p20Duration: durationMetric(150, 'construction_production_day'),
                    p50Duration: durationMetric(160, 'construction_production_day'),
                    p80Duration: durationMetric(176, 'construction_production_day'),
                    reserveDuration: durationMetric(16, 'construction_production_day'),
                    source: 'system_standard_duration_asset',
                    scope: 'system',
                    sampleCount: null,
                    generatedAt: '2026-07-21T08:00:00.000Z',
                    sourceAsOf: '2026-07-20T00:00:00.000Z',
                    availability: 'available',
                    unavailableReason: null,
                  },
                }],
              },
            },
          },
        }}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('参考天数 BTMP-SCH-01：生产日口径不可用 / 样本 3')).toBeInTheDocument()
    expect(screen.queryByText(/参考天数 BTMP-SCH-01：160 天/)).not.toBeInTheDocument()
  })

  it('shows candidate critical path evidence from the preview without implying production writes', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            generation: {
              ...basePreview.profile.generation,
              candidateNetworkEvaluation: {
                source: 'generated_wbs_row_candidate_network_cpm',
                networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
                projectedNetworkSpanDays: 326,
                previewEdgeCount: 4,
                processConstraintRoutingCandidateEdgeCount: 1,
                unresolvedEdgeCount: 0,
                criticalGeneratedRowIds: ['row-1', 'row-2'],
                durationAssetPlanDateNetworkRecalculation: {
                  source: 'wizard_duration_asset_plan_date_network_recalculation',
                  adjustedRowCount: 1,
                  previousProjectedNetworkSpanDays: 15,
                  recalculatedProjectedNetworkSpanDays: 17,
                  mutationBoundary: 'candidate_network_recalculation_only_no_task_dependency_write_no_plan_date_write_no_runtime_publication',
                },
                criticalRowSummaries: [
                  {
                    generatedRowId: 'row-1',
                    title: '基坑支护降水与土方开挖',
                    plannedStartDate: '2026-06-01',
                    plannedEndDate: '2026-07-15',
                    totalFloatDays: 0,
                  },
                ],
                materializationStatus: 'preview_only',
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              },
            },
          },
        } as any}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('候选关键路径')).toBeInTheDocument()
    expect(screen.getByText('跨度 326 天')).toBeInTheDocument()
    expect(screen.getByText('依赖边 4')).toBeInTheDocument()
    expect(screen.getByText('工艺穿插候选边 1')).toBeInTheDocument()
    expect(screen.getByText('未解析 0')).toBeInTheDocument()
    expect(screen.getByText('关键行 2')).toBeInTheDocument()
    expect(screen.getByText('工期资产重算 15 -> 17 天')).toBeInTheDocument()
    expect(screen.getByText('基坑支护降水与土方开挖')).toBeInTheDocument()
    expect(screen.getByText('2026-06-01 - 2026-07-15')).toBeInTheDocument()
    expect(screen.getByText('重算边界 candidate_network_recalculation_only_no_task_dependency_write_no_plan_date_write_no_runtime_publication')).toBeInTheDocument()
    expect(screen.getByText('只读预览，不写任务依赖、计划日期或关键路径事实')).toBeInTheDocument()
  })

  it('shows dated candidate acceptance plans from the preview without implying acceptance writes', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            generation: {
              ...basePreview.profile.generation,
              candidateAcceptancePlanPreview: {
                source: 'generated_wbs_rows_candidate_acceptance_plan_preview',
                evidenceLevel: 'candidate_acceptance_plan_preview_l1',
                mutationBoundary: 'preview_only_no_acceptance_plan_write',
                totalCount: 2,
                datedCount: 1,
                featureTriggeredAcceptanceScheduleRowCount: 1,
                materializedCount: 1,
                materializationStatus: 'materialized_acceptance_plans_available',
                writesAcceptancePlans: false,
                items: [
                  {
                    clientRowId: 'acceptance-row',
                    title: '竣工验收与交付移交',
                    acceptanceType: 'completion',
                    plannedDate: '2027-12-20',
                    plannedStartDate: '2027-12-20',
                    plannedEndDate: '2027-12-20',
                    featureTriggeredAcceptanceScheduleRow: true,
                    acceptanceScheduleEvidence: 'feature_triggered_acceptance_schedule_row:dated_candidate_schedule_row_no_production_write',
                    sourceBasis: 'feature_triggered_acceptance_schedule_row:dated_candidate_schedule_row_no_production_write',
                    createdTaskId: 'acceptance-task',
                    createdAcceptancePlanId: 'acceptance-plan-1',
                    materializationStatus: 'materialized_acceptance_plan_available',
                    materializationMutationBoundary: 'acceptance_plan_id_mapping_only_no_additional_acceptance_plan_write_no_runtime_approval_record',
                  },
                ],
              },
            },
          },
        } as any}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('候选验收计划')).toBeInTheDocument()
    expect(screen.getByText('候选 2 项')).toBeInTheDocument()
    expect(screen.getByText('已排日期 1 项')).toBeInTheDocument()
    expect(screen.getByText('特征触发 1 项')).toBeInTheDocument()
    expect(screen.getByText('已生成验收计划 1 项')).toBeInTheDocument()
    expect(screen.getByText('竣工验收与交付移交')).toBeInTheDocument()
    expect(screen.getByText('2027-12-20')).toBeInTheDocument()
    expect(screen.getByText('依据 feature_triggered_acceptance_schedule_row:dated_candidate_schedule_row_no_production_write')).toBeInTheDocument()
    expect(screen.getByText('验收节点证据 feature_triggered_acceptance_schedule_row:dated_candidate_schedule_row_no_production_write')).toBeInTheDocument()
    expect(screen.getByText('验收计划映射 acceptance-task / acceptance-plan-1 / materialized_acceptance_plan_available')).toBeInTheDocument()
    expect(screen.getByText('验收计划映射边界 acceptance_plan_id_mapping_only_no_additional_acceptance_plan_write_no_runtime_approval_record')).toBeInTheDocument()
    expect(screen.getByText('只读预览，不写验收计划事实')).toBeInTheDocument()
  })

  it('shows when candidate acceptance preview falls back to the wizard target end date', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            generation: {
              ...basePreview.profile.generation,
              candidateAcceptancePlanPreview: {
                source: 'wizard_target_candidate_acceptance_plan_preview',
                evidenceLevel: 'candidate_acceptance_plan_preview_l1',
                mutationBoundary: 'target_preview_only_no_acceptance_plan_write',
                totalCount: 1,
                datedCount: 1,
                writesAcceptancePlans: false,
                fallbackFromProjectTarget: true,
                items: [
                  {
                    clientRowId: 'wizard-target-completion-acceptance',
                    title: '竣工验收与交付移交',
                    acceptanceType: 'completion_acceptance',
                    plannedDate: '2027-12-31',
                    plannedStartDate: '2027-12-31',
                    plannedEndDate: '2027-12-31',
                    sourceBasis: 'wizard_planned_end_date_terminal_event',
                  },
                ],
              },
            },
          },
        } as any}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('项目目标日期兜底')).toBeInTheDocument()
    expect(screen.getByText('竣工验收与交付移交')).toBeInTheDocument()
    expect(screen.getByText('2027-12-31')).toBeInTheDocument()
    expect(screen.getByText('依据 wizard_planned_end_date_terminal_event')).toBeInTheDocument()
  })

  it('uses the starting-line construction organization option in the confirmation step', () => {
    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            identity: {
              ...basePreview.profile.identity,
              mode: 'starting_line',
            },
          },
          constructionOrganizationScenario: {
            source: 'construction_organization_scenario_selector',
            confidence: 'high',
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
              confidence: 'high',
              useCaseEvaluations: {
                newProjectPlanning: {
                  factCoverage: {
                    consumedFactKeys: ['scopeOrganizationFacts'],
                  },
                },
              },
            },
            planOptions: [
              {
                optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                selectedScenarioIds: [
                  'pile_before_excavation',
                  'shared_basement_first_then_tower',
                ],
                confidence: 'high',
              },
              {
                optionId: 'construction_org_option:pile_before_excavation+tower_lane_early_release_after_core_basement',
                selectedScenarioIds: [
                  'pile_before_excavation',
                  'tower_lane_early_release_after_core_basement',
                ],
                confidence: 'medium',
                useCaseEvaluations: {
                  startingLineOnboarding: {
                    factCoverage: {
                      consumedFactKeys: ['scopeOrganizationFacts', 'onboardingSubstage'],
                    },
                  },
                },
              },
            ],
            scenarioRecommendations: {
              newProjectPlanning: {
                useCase: 'new_project_planning',
                optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                actionability: 'actionable_candidate',
              },
              startingLineOnboarding: {
                useCase: 'starting_line_onboarding',
                optionId: 'construction_org_option:pile_before_excavation+tower_lane_early_release_after_core_basement',
                actionability: 'actionable_candidate',
                currentSubstage: 'main_structure',
              },
            },
          },
        }}
        onGenerate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('先桩后挖 / 塔楼提前释放')).toBeInTheDocument()
    expect(screen.queryByText('先桩后挖 / 整体地下室先行')).not.toBeInTheDocument()
    expect(screen.getByText('已用于判断：空间组织关系、当前接入阶段')).toBeInTheDocument()
    expect(screen.getByText(/起跑线接入：可作为接入候选/)).toBeInTheDocument()
    expect(screen.getByText(/当前阶段：main_structure/)).toBeInTheDocument()
    expect(screen.queryByText(/新建主计划：可作为默认组织方案/)).not.toBeInTheDocument()
  })

  it('shows task assignment coverage before generating WBS tasks', () => {
    const onGenerate = vi.fn()

    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            scopeTemplateCoverage: {
              summary: {
                autoSchedulableCount: 2,
                manualTaskRequiredCount: 1,
                missingRequiredScopeCount: 0,
              },
              items: [
                {
                  scopeObjectId: 'building-1',
                  scopeName: '1#楼',
                  objectType: 'building',
                  status: 'auto_schedulable',
                  title: '1#楼会自动生成并挂接任务',
                  detail: '标准楼栋已被系统识别。',
                  action: '无需额外处理，生成后可按该空间筛选复核。',
                  matchedRulePatterns: [],
                  requiredByTemplates: [],
                },
                {
                  scopeObjectId: 'outdoor-1',
                  scopeName: '室外总平',
                  objectType: 'physical_zone',
                  status: 'auto_schedulable',
                  title: '室外总平会自动生成并挂接任务',
                  detail: '室外总平已命中室外工程模板规则。',
                  action: '无需额外处理。',
                  matchedRulePatterns: ['OUT-'],
                  requiredByTemplates: ['OUT-'],
                },
                {
                  scopeObjectId: 'yard-1',
                  scopeName: '临设加工区',
                  objectType: 'physical_zone',
                  status: 'manual_task_required',
                  title: '临设加工区已进入范围树，但暂无自动专项任务',
                  detail: '可作为项目空间保存和筛选。',
                  action: '可以先生成 WBS，生成后补充该空间的专项任务。',
                  matchedRulePatterns: [],
                  requiredByTemplates: [],
                },
              ],
            },
          },
        }}
        onGenerate={onGenerate}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '任务挂接检查' })).toBeInTheDocument()
    expect(screen.getByText('可以直接生成任务')).toBeInTheDocument()
    expect(screen.getByText('任务会自动落到对应楼栋、地下室、楼层或专项空间。')).toBeInTheDocument()
    expect(screen.getByText('可以先生成，后补专项任务')).toBeInTheDocument()
    expect(screen.getByText('这些空间会保留为筛选范围，但当前没有自动任务包。')).toBeInTheDocument()
    expect(screen.getByText('需要先补齐空间')).toBeInTheDocument()
    expect(screen.getByText('模板已要求该空间，未补齐前不能生成，避免任务挂错位置。')).toBeInTheDocument()
    expect(screen.getAllByText('可自动生成').length).toBeGreaterThan(0)
    expect(screen.getAllByText('生成后补充').length).toBeGreaterThan(0)
    expect(screen.getByText('缺少空间')).toBeInTheDocument()
    expect(screen.getByText('1#楼会自动生成并挂接任务')).toBeInTheDocument()
    expect(screen.getByText('室外总平会自动生成并挂接任务')).toBeInTheDocument()
    expect(screen.getByText('临设加工区已进入范围树，但暂无自动专项任务')).toBeInTheDocument()
    expect(screen.getByText(/生成后补充该空间的专项任务/)).toBeInTheDocument()
    expect(screen.queryByText(/鎸|缂|浠|鍥|妯|閲/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认并生成任务' })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '确认并生成任务' }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('blocks final generation when selected templates require a missing project space', () => {
    const onGenerate = vi.fn()
    const onBackToScope = vi.fn()

    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            scopeTemplateCoverage: {
              summary: {
                autoSchedulableCount: 1,
                manualTaskRequiredCount: 0,
                missingRequiredScopeCount: 1,
              },
              items: [
                {
                  scopeObjectId: null,
                  scopeName: '避难层',
                  objectType: 'floor',
                  status: 'missing_required_scope',
                  title: '避难层缺少对应空间，暂不能生成',
                  detail: '模板已经触发避难层专项，但范围树里没有可挂接的避难层。',
                  action: '请先回到范围体量补齐该空间，再生成 WBS。',
                  matchedRulePatterns: ['UHR-03-01-02'],
                  requiredByTemplates: ['UHR-03-01-02'],
                },
              ],
            },
          },
        }}
        onGenerate={onGenerate}
        onRefresh={vi.fn()}
        onBackToScope={onBackToScope}
      />,
    )

    expect(screen.getByText('避难层缺少对应空间，暂不能生成')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回范围体量补齐' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认并生成任务' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '返回范围体量补齐' }))
    expect(onBackToScope).toHaveBeenCalledTimes(1)
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('blocks final generation when scope WBS readiness issues remain', () => {
    const onGenerate = vi.fn()
    const onRefresh = vi.fn()
    const onBackToScope = vi.fn()

    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            issues: [{
              code: 'SCOPE_WBS_READINESS_MISSING',
              severity: 'blocking',
              message: '1#楼缺少楼层信息，暂不能生成 WBS。',
            }],
          },
        }}
        onGenerate={onGenerate}
        onRefresh={onRefresh}
        onBackToScope={onBackToScope}
      />,
    )

    expect(screen.getByText('范围体量还不能生成 WBS')).toBeInTheDocument()
    expect(screen.getByText('1#楼缺少楼层信息，暂不能生成 WBS。')).toBeInTheDocument()
    expect(screen.getByText('影响')).toBeInTheDocument()
    expect(screen.getByText(/相关标准或专项任务暂不能自动挂接/)).toBeInTheDocument()
    expect(screen.getByText('下一步')).toBeInTheDocument()
    expect(screen.getByText(/回到范围体量/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回范围体量补齐' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认并生成任务' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '返回范围体量补齐' }))
    expect(onBackToScope).toHaveBeenCalledTimes(1)
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('shows non-blocking WBS preview warnings with action and keeps generation available', () => {
    const onGenerate = vi.fn()

    render(
      <Step6ProjectProfileConfirmation
        preview={{
          ...basePreview,
          profile: {
            ...basePreview.profile,
            issues: [{
              code: 'WBS_PREVIEW_UNAVAILABLE',
              severity: 'warning',
              title: 'WBS 试算暂未完成',
              message: '项目空间模型已保留，但本次 WBS 试算没有完成：preview generation timed out',
              action: '重新试算；正式生成仍会执行完整校验。',
              impact: '任务挂接检查只包含空间模型和已知规则匹配。',
              source: 'wbs_preview',
            }],
          },
        }}
        onGenerate={onGenerate}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('WBS 试算暂未完成')).toBeInTheDocument()
    expect(screen.getByText(/preview generation timed out/)).toBeInTheDocument()
    expect(screen.getByText(/任务挂接检查只包含空间模型和已知规则匹配/)).toBeInTheDocument()
    expect(screen.getByText(/正式生成仍会执行完整校验/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认并生成任务' })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '确认并生成任务' }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })
})
