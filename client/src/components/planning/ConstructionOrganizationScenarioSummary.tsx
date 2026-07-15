import { GitBranch } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { WbsConstructionOrganizationScenarioSummary } from '@/services/wbsTemplateGenerationApi'

const SCENARIO_LABELS: Record<string, string> = {
  pile_before_excavation: '先桩后挖',
  excavation_before_pile: '先挖后桩',
  tower_lane_early_release_after_core_basement: '塔楼提前释放',
  shared_basement_first_then_tower: '整体地下室先行',
}

const FACT_LABELS: Record<string, string> = {
  scopeOrganizationFacts: '空间组织关系',
  methodVariantCodes: '工法做法',
  buildingCount: '楼栋数量',
  climateSignals: '天气/季节',
  weatherImpactBands: '天气影响',
  basementLevelCount: '地下层数',
  foundationDepthM: '基础深度',
  structureTypeCode: '结构类型',
  businessSubtype: '业态细分',
  prefabSystemCodes: '装配体系',
  elementVariantCodes: '构件做法',
  externalInterfaceCodes: '外部界面',
  hardConstraintCodes: '硬约束',
  buildingPatternCodes: '楼栋形态',
  functionalUsageCodes: '功能用途',
  physicalZoneTypeCodes: '空间类型',
  planScopeCaliber: '计划口径',
  deliveryStandard: '交付标准',
  terminalEvent: '终点事件',
  detailLevel: '生成深度',
  projectFeatures: '专项特征',
  locationFacts: '区位事实',
  totalAreaM2: '建筑面积',
  aboveGroundAreaM2: '地上面积',
  basementAreaM2: '地下面积',
  siteAreaM2: '场地面积',
  standardFloorCount: '标准层数',
  highestBuildingFloorCount: '最高楼层',
  prefabRate: '装配率',
  maxSpanM: '最大跨度',
  supportHeightM: '支撑高度',
  hasCivilDefense: '人防范围',
  scopeTree: '工程对象关系',
  scopeObjects: '工程对象关系',
  onboardingMode: '起跑线模式',
  onboardingSubstage: '当前接入阶段',
  onboardingPassedMilestones: '已过里程碑',
  onboardingPhaseProgress: '阶段进度',
  projectOrganizationPolicy: '业态施工组织策略',
}

const USE_CASE_LABELS: Record<string, string> = {
  newProjectPlanning: '新建主计划',
  startingLineOnboarding: '起跑线接入',
  accelerationRecovery: '赶工恢复',
}

export type ConstructionOrganizationUseCase = keyof typeof USE_CASE_LABELS

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values))
}

function readUseCaseEvaluations(option: Record<string, unknown> | null) {
  return asRecord(option?.useCaseEvaluations)
    ?? asRecord(asRecord(option?.evaluation)?.useCaseEvaluations)
}

function readGeneratedRowProjection(option: Record<string, unknown> | null) {
  return asRecord(option?.generatedRowProjection)
    ?? asRecord(asRecord(option?.evaluation)?.generatedRowProjection)
}

function readCandidateMaterializationEvaluation(option: Record<string, unknown> | null) {
  return asRecord(readGeneratedRowProjection(option)?.candidateMaterializationEvaluation)
}

function readMaterializationDecision(option: Record<string, unknown> | null) {
  return asRecord(readGeneratedRowProjection(option)?.materializationDecision)
}

function readMaterializationReviewPackage(option: Record<string, unknown> | null) {
  return asRecord(readGeneratedRowProjection(option)?.materializationReviewPackage)
}

function readGeneratedRowReferenceDurationEvidence(option: Record<string, unknown> | null) {
  return asRecord(readGeneratedRowProjection(option)?.generatedRowReferenceDurationEvidence)
}

function readGeneratedRowNetworkEvaluation(option: Record<string, unknown> | null) {
  return asRecord(readGeneratedRowProjection(option)?.generatedRowNetworkEvaluation)
}

function readScenarioRecommendations(scenario: WbsConstructionOrganizationScenarioSummary) {
  const recommendations = asRecord(scenario.scenarioRecommendations)
  if (recommendations) return recommendations

  const summaryRecommendations: Record<string, unknown> = {}
  for (const key of Object.keys(USE_CASE_LABELS)) {
    const recommendation = asRecord((scenario as Record<string, unknown>)[key])
    if (recommendation) summaryRecommendations[key] = recommendation
  }
  return Object.keys(summaryRecommendations).length > 0 ? summaryRecommendations : null
}

function readPlanNetworkDraftRecommendations(scenario: WbsConstructionOrganizationScenarioSummary) {
  return asRecord(scenario.planNetworkDraftRecommendations)
}

function readPlanOptionComparisonPackage(scenario: WbsConstructionOrganizationScenarioSummary) {
  return asRecord(scenario.planOptionComparisonPackage)
}

function readOrganizationDecisionReport(scenario: WbsConstructionOrganizationScenarioSummary) {
  return asRecord(scenario.organizationDecisionReport)
}

function readProductCloseoutReadiness(scenario: WbsConstructionOrganizationScenarioSummary) {
  return asRecord(readOrganizationDecisionReport(scenario)?.productCloseoutReadiness)
}

function readProductOutcomeCloseoutProgress(scenario: WbsConstructionOrganizationScenarioSummary) {
  const readiness = readProductCloseoutReadiness(scenario)
  return asRecord(readiness?.productOutcomeCloseoutProgress)
    ?? asRecord(readiness?.matrixProgress)
    ?? asRecord(readOrganizationDecisionReport(scenario)?.productOutcomeCloseoutProgress)
    ?? asRecord((scenario as Record<string, unknown>).productOutcomeCloseoutProgress)
}

function readDecisionReportUseCase(
  scenario: WbsConstructionOrganizationScenarioSummary,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  if (!activeUseCase) return null
  return asRecord(asRecord(readOrganizationDecisionReport(scenario)?.selectedByUseCase)?.[activeUseCase])
}

function readPlanOptionCandidateCount(scenario: WbsConstructionOrganizationScenarioSummary) {
  const reportOptionCount = Number(readOrganizationDecisionReport(scenario)?.optionCount)
  if (Number.isFinite(reportOptionCount) && reportOptionCount > 0) return reportOptionCount
  if (Array.isArray(scenario.planOptions)) return scenario.planOptions.length
  const comparisonPackage = readPlanOptionComparisonPackage(scenario)
  const packageCount = Number(comparisonPackage?.totalOptionCount)
  if (Number.isFinite(packageCount) && packageCount > 0) return packageCount
  return Math.max(0, Number((scenario as Record<string, unknown>).planOptionCount ?? 0) || 0)
}

function readPlanOptionComparisonOptions(scenario: WbsConstructionOrganizationScenarioSummary) {
  const comparisonPackage = readPlanOptionComparisonPackage(scenario)
  return Array.isArray(comparisonPackage?.options)
    ? comparisonPackage.options.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    : []
}

function selectPlanOptionComparisonItem(
  scenario: WbsConstructionOrganizationScenarioSummary,
  option: Record<string, unknown> | null,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  const comparisonPackage = readPlanOptionComparisonPackage(scenario)
  const recommendedByUseCase = asRecord(comparisonPackage?.recommendedOptionIdsByUseCase)
  const activeOptionId = activeUseCase && typeof recommendedByUseCase?.[activeUseCase] === 'string'
    ? recommendedByUseCase[activeUseCase] as string
    : readRecommendedOptionId(scenario, activeUseCase)
      ?? (typeof option?.optionId === 'string' ? option.optionId : null)
  const comparisonOptions = readPlanOptionComparisonOptions(scenario)
  const matchedById = activeOptionId
    ? comparisonOptions.find((item) => item.optionId === activeOptionId)
    : null
  if (matchedById) return matchedById
  if (activeUseCase) {
    return comparisonOptions.find((item) => asStringArray(item.isRecommendedFor).includes(activeUseCase)) ?? null
  }
  return comparisonOptions[0] ?? null
}

function buildPlanOptionComparisonGovernanceLine(
  scenario: WbsConstructionOrganizationScenarioSummary,
  option: Record<string, unknown> | null,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  const comparisonItem = selectPlanOptionComparisonItem(scenario, option, activeUseCase)
  const action = typeof comparisonItem?.nextGovernanceAction === 'string'
    ? comparisonItem.nextGovernanceAction
    : ''
  if (!action) return null
  const reasons = asStringArray(comparisonItem?.nextGovernanceReasons)
    .map(reasonLabel)
    .slice(0, 3)
  return reasons.length > 0
    ? `下一步治理：${action}；原因：${reasons.join('、')}`
    : `下一步治理：${action}`
}

function buildSystemRecommendationBasisLine(
  scenario: WbsConstructionOrganizationScenarioSummary,
  option: Record<string, unknown> | null,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  const comparisonItem = selectPlanOptionComparisonItem(scenario, option, activeUseCase)
  const basis = asRecord(comparisonItem?.systemRecommendationBasis)
  if (!basis) return null

  const parts: string[] = []
  const e1 = asRecord(basis.e1)
  const matchedReferenceRowCount = Number(e1?.matchedReferenceRowCount)
  if (Boolean(e1?.hasGeneratedRowReferenceEvidence) && Number.isFinite(matchedReferenceRowCount) && matchedReferenceRowCount > 0) {
    parts.push(`E1 参考 ${Math.round(matchedReferenceRowCount)} 行`)
  }

  const e3 = asRecord(basis.e3)
  const previewEdgeCount = Number(e3?.previewEdgeCount)
  if (Number.isFinite(previewEdgeCount) && previewEdgeCount > 0) {
    parts.push(`E3 关系 ${Math.round(previewEdgeCount)} 条`)
  }

  const e5 = asRecord(basis.e5)
  const e5RecoverableSpanDays = Number(e5?.e5RecoverableSpanDays)
  if (Number.isFinite(e5RecoverableSpanDays) && e5RecoverableSpanDays > 0) {
    parts.push(`E5 可恢复 ${Math.round(e5RecoverableSpanDays)} 天`)
  }

  return parts.length > 0 ? `系统推荐依据：${parts.join('、')}` : null
}

function readPlanNetworkDraftRecommendation(
  scenario: WbsConstructionOrganizationScenarioSummary,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  if (!activeUseCase) return null
  return asRecord(readPlanNetworkDraftRecommendations(scenario)?.[activeUseCase])
}

function readRecommendedOptionId(
  scenario: WbsConstructionOrganizationScenarioSummary,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  if (!activeUseCase) return null
  const decisionOptionId = readDecisionReportUseCase(scenario, activeUseCase)?.optionId
  if (typeof decisionOptionId === 'string' && decisionOptionId) return decisionOptionId
  const recommendation = asRecord(readScenarioRecommendations(scenario)?.[activeUseCase])
  return typeof recommendation?.optionId === 'string' ? recommendation.optionId : null
}

function buildProjectPolicyLine(
  scenario: WbsConstructionOrganizationScenarioSummary,
  option?: Record<string, unknown> | null,
) {
  const policy = asRecord(option?.projectOrganizationScheme)
    ?? asRecord(asRecord(option?.engineEvaluationSummary)?.projectOrganization)
    ?? asRecord((scenario as Record<string, unknown>).projectOrganizationPolicy)
    ?? asRecord(asRecord((scenario as Record<string, unknown>).factBasis)?.projectOrganizationPolicy)
  if (!policy) return null
  const strategy = typeof policy.strategy === 'string' ? policy.strategy : ''
  const schemeFamily = typeof policy.schemeFamily === 'string' ? policy.schemeFamily : ''
  const gateTags = asStringArray(policy.interfaceGateTags)
  const parts = [
    schemeFamily ? `组织族 ${schemeFamily}` : null,
    strategy ? `策略 ${strategy}` : null,
    gateTags.length > 0 ? `接口 ${gateTags.slice(0, 3).join('、')}` : null,
  ].filter((item): item is string => Boolean(item))
  return parts.length > 0 ? parts.join('；') : null
}

function readUseCaseSelectedScenarioIds(
  scenario: WbsConstructionOrganizationScenarioSummary,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  if (!activeUseCase) return []
  const recommendation = asRecord(readScenarioRecommendations(scenario)?.[activeUseCase])
  return asStringArray(recommendation?.selectedScenarioIds)
}

function selectPlanOption(
  scenario: WbsConstructionOrganizationScenarioSummary,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  const recommendedOption = asRecord(scenario.recommendedPlanOption)
  const activeOptionId = readRecommendedOptionId(scenario, activeUseCase)
    ?? (typeof recommendedOption?.optionId === 'string' ? recommendedOption.optionId : null)
  const planOptions = Array.isArray(scenario.planOptions) ? scenario.planOptions : []
  const activeOption = activeOptionId
    ? planOptions
      .map((item) => asRecord(item))
      .find((item) => item?.optionId === activeOptionId)
    : null
  return activeOption ?? recommendedOption
}

function readSummaryDecisionFactKeys(scenario: WbsConstructionOrganizationScenarioSummary) {
  const facts = asRecord((scenario as Record<string, unknown>).scopeOrganizationFacts)
  if (!facts) return []

  const keys = ['scopeOrganizationFacts']
  const buildingObjectCount = Number(facts.buildingObjectCount ?? 0)
  if (Number.isFinite(buildingObjectCount) && buildingObjectCount > 0) {
    keys.push('buildingCount')
  }
  return keys
}

function actionabilityLabel(useCaseKey: string, actionability: string) {
  if (actionability === 'not_actionable_after_current_phase') {
    return useCaseKey === 'startingLineOnboarding'
      ? '仅作证据，当前阶段不可倒写'
      : '仅作证据'
  }
  if (actionability === 'evidence_only') return '仅作证据'
  if (useCaseKey === 'accelerationRecovery') return '可作为赶工恢复候选'
  if (useCaseKey === 'startingLineOnboarding') return '可作为接入候选'
  return '可作为默认组织方案'
}

function reasonLabel(reason: string) {
  if (reason.startsWith('missing_runtime_engine:')) {
    const engineCode = reason.split(':')[1] || ''
    return engineCode ? `缺少 ${engineCode} 运行证据` : '缺少运行期引擎证据'
  }
  const labels: Record<string, string> = {
    rainy_deep_pit_without_horizontal_support: '雨季深基坑且缺少水平支撑',
    not_selected_for_foundation_sequence: '当前不是基础施工顺序首选',
    not_selected_for_basement_tower_release: '当前不是地下室/塔楼释放首选',
    selected_by_default_plan_score: '默认计划得分较高',
    kept_as_comparable_option: '保留为可比较候选',
    default_new_project_planning_option: '新建主计划默认入口',
    uses_existing_wizard_project_facts: '依据向导事实推导',
    e5_recoverable_span_priority: '优先考虑可恢复工期',
    bounded_recovery_factor_only: '只作有界赶工修正',
    onboarding_mode_starting_line: '起跑线接入模式',
    starting_line_current_phase_missing: '缺少当前阶段证据',
    starting_line_current_phase_allows_organization_candidate: '当前阶段仍可作为组织候选',
    starting_line_current_phase_past_foundation_or_basement: '当前阶段已越过基础/地下室组织窗口',
    starting_line_passed_milestones_present: '已读取起跑线里程碑',
    starting_line_phase_progress_present: '已读取阶段进度',
    starting_line_passed_foundation_or_basement_milestone: '已过基础/地下室关键里程碑',
    selected_by_acceleration_recovery_score: '赶工恢复得分较高',
    kept_as_acceleration_comparable_option: '保留为赶工可比较候选',
    generated_row_projection_alignment: '已与生成行投影对齐',
    ready_for_manual_review_handoff: '可进入人工审阅交接',
    generated_row_projection_required_before_manual_review_handoff: '需要先映射到本次生成行',
    all_virtual_dependency_edges_have_generated_row_carriers: '候选关系均有生成行承载',
    manual_review_handoff_blocked_by_materialization_decision: '物化决策阻断人工审阅',
    manual_review_handoff_recorded: '人工审阅交接已记录',
    manual_review_approved_release_exit_handoff_required: '人工审阅已批准，需进入 release-exit 交接',
    runtime_engine_evidence_ready: '运行期三引擎证据已齐备',
    ready_for_runtime_engine_evidence_closeout: '可进入运行期引擎证据收口',
    needs_generated_row_carrier: '缺少生成行承载',
    evidence_only: '仅作施工组织证据',
    blocked_by_violations: '存在计划关系冲突',
  }
  return labels[reason] ?? reason
}

function draftReadinessLabel(value: string) {
  const labels: Record<string, string> = {
    ready_for_manual_review: '可审阅关系草案',
    ready_for_manual_materialization: '可进入人工审阅',
    needs_generated_row_carrier: '缺少生成行承载',
    evidence_only: '仅作方案证据',
    blocked_by_violations: '存在计划冲突',
    missing_generated_row_projection: '缺少生成行评估',
  }
  return labels[value] ?? value
}

function buildPlanNetworkDraftLine(draft: Record<string, unknown> | null) {
  if (!draft) return null
  const readiness = typeof draft.readiness === 'string' ? draft.readiness : ''
  const edgeCount = Number(draft.proposedDependencyEdgeCount ?? 0) || 0
  if (!readiness && edgeCount <= 0) return null
  const edgeText = edgeCount > 0 ? `，关系草案 ${edgeCount} 条` : ''
  return `推荐草案：${draftReadinessLabel(readiness)}${edgeText}`
}

function buildPlanNetworkDraftEvaluationLine(draft: Record<string, unknown> | null) {
  if (!draft) return null
  const e1 = asRecord(draft.e1)
  const e3 = asRecord(draft.e3)
  const e5 = asRecord(draft.e5)
  const parts: string[] = []
  const matchedReferenceRowCount = Number(e1?.matchedReferenceRowCount)
  if (Number.isFinite(matchedReferenceRowCount) && matchedReferenceRowCount > 0) {
    parts.push(`E1 参考 ${matchedReferenceRowCount} 行`)
  }
  const projectedNetworkSpanDays = Number(e3?.projectedNetworkSpanDays)
  if (Number.isFinite(projectedNetworkSpanDays) && projectedNetworkSpanDays > 0) {
    parts.push(`E3 网络 ${Math.round(projectedNetworkSpanDays)} 天`)
  }
  const e5RecoverableSpanDays = Number(e5?.e5RecoverableSpanDays)
  if (Number.isFinite(e5RecoverableSpanDays) && e5RecoverableSpanDays > 0) {
    parts.push(`E5 可恢复 ${Math.round(e5RecoverableSpanDays)} 天`)
  }
  return parts.length > 0 ? `草案评估：${parts.join(' / ')}` : null
}

function readCandidateComparisonLines(option: Record<string, unknown> | null) {
  const excludedReasons = Array.isArray(option?.excludedReasons) ? option.excludedReasons : []
  return excludedReasons
    .map((item) => {
      const record = asRecord(item)
      const scenarioId = typeof record?.scenarioId === 'string' ? record.scenarioId : ''
      const reasons = asStringArray(record?.reasons)
      if (!scenarioId || reasons.length === 0) return null
      return `${SCENARIO_LABELS[scenarioId] ?? scenarioId}：${reasons.map(reasonLabel).join('、')}`
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 3)
}

function mergeOptionEvidence(
  option: Record<string, unknown> | null,
  fallbackOption: Record<string, unknown> | null,
) {
  if (!option || !fallbackOption || option === fallbackOption) return option
  return {
    ...fallbackOption,
    ...option,
    projectOrganizationScheme: asRecord(option.projectOrganizationScheme)
      ?? asRecord(option.engineEvaluationSummary)?.projectOrganization
      ?? fallbackOption.projectOrganizationScheme,
    selectionReasons: asStringArray(option.selectionReasons).length > 0
      ? option.selectionReasons
      : fallbackOption.selectionReasons,
    excludedReasons: Array.isArray(option.excludedReasons) && option.excludedReasons.length > 0
      ? option.excludedReasons
      : fallbackOption.excludedReasons,
  }
}

function buildUseCaseLines(
  scenario: WbsConstructionOrganizationScenarioSummary,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  const recommendations = readScenarioRecommendations(scenario)
  if (!recommendations) return []

  const entries = activeUseCase
    ? [[activeUseCase, USE_CASE_LABELS[activeUseCase]]] as Array<[ConstructionOrganizationUseCase, string]>
    : Object.entries(USE_CASE_LABELS)

  return entries
    .map(([key, label]) => {
      const recommendation = asRecord(recommendations[key])
      const actionability = typeof recommendation?.actionability === 'string'
        ? recommendation.actionability
        : ''
      if (!actionability) return null
      const currentSubstage = typeof recommendation?.currentSubstage === 'string'
        ? recommendation.currentSubstage
        : null
      return {
        key,
        text: `${label}：${actionabilityLabel(key, actionability)}`,
        currentSubstage,
      }
    })
    .filter((item): item is { key: string; text: string; currentSubstage: string | null } => Boolean(item))
}

function buildRecommendationBasisLines(
  scenario: WbsConstructionOrganizationScenarioSummary,
  option: Record<string, unknown> | null,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  const basis: string[] = []
  if (activeUseCase) {
    basis.push(...asStringArray(readDecisionReportUseCase(scenario, activeUseCase)?.decisionBasis))
  }
  const recommendations = readScenarioRecommendations(scenario)
  if (activeUseCase) {
    basis.push(...asStringArray(asRecord(recommendations?.[activeUseCase])?.recommendationBasis))
  }
  for (const evaluation of readUseCaseEvaluationRecords(option, activeUseCase)) {
    basis.push(...asStringArray(evaluation.rankBasis))
  }
  if (basis.length === 0) {
    basis.push(...asStringArray(option?.selectionReasons))
  }
  return uniqueStrings(basis)
    .map(reasonLabel)
    .slice(0, 4)
}

function readUseCaseEvaluationRecords(
  option: Record<string, unknown> | null,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  const useCaseEvaluations = readUseCaseEvaluations(option)
  if (!useCaseEvaluations) return []
  if (activeUseCase) {
    const evaluation = asRecord(useCaseEvaluations[activeUseCase])
    return evaluation ? [evaluation] : []
  }
  return Object.values(useCaseEvaluations)
    .map((evaluation) => asRecord(evaluation))
    .filter((evaluation): evaluation is Record<string, unknown> => Boolean(evaluation))
}

function buildMaterializationLine(option: Record<string, unknown> | null) {
  const evaluation = readCandidateMaterializationEvaluation(option)
  if (!evaluation) return null
  const previewEdgeCount = Number(evaluation.previewEdgeCount ?? 0) || 0
  const satisfiedEdgeCount = Number(evaluation.satisfiedEdgeCount ?? 0) || 0
  const violatedEdgeCount = Number(evaluation.violatedEdgeCount ?? 0) || 0
  const unresolvedEdgeCount = Number(evaluation.unresolvedEdgeCount ?? 0) || 0
  const materializationScore = Number(evaluation.materializationScore)
  const scoreText = Number.isFinite(materializationScore)
    ? `，匹配度 ${Math.round(materializationScore * 100)}%`
    : ''

  if (violatedEdgeCount > 0) {
    return `与当前计划存在 ${violatedEdgeCount} 条组织关系冲突；已校验 ${previewEdgeCount} 条关系${scoreText}`
  }
  if (unresolvedEdgeCount > 0) {
    return `有 ${unresolvedEdgeCount} 条候选关系缺少生成行承载；已校验 ${previewEdgeCount} 条关系${scoreText}`
  }
  if (previewEdgeCount > 0) {
    return `与当前计划关系匹配；已校验 ${previewEdgeCount} 条关系，其中 ${satisfiedEdgeCount} 条满足${scoreText}`
  }
  return null
}

function buildMaterializationDecisionLine(option: Record<string, unknown> | null) {
  const decision = readMaterializationDecision(option)
  const decisionCode = typeof decision?.decision === 'string' ? decision.decision : ''
  if (!decisionCode) return null

  const labels: Record<string, string> = {
    ready_for_manual_materialization: '可进入人工审阅',
    needs_generated_row_carrier: '缺少生成行承载，暂不能落依赖',
    evidence_only: '仅作施工组织证据',
    blocked_by_violations: '存在计划冲突，暂不进入落依赖审阅',
  }

  return `组织关系审阅：${labels[decisionCode] ?? decisionCode}`
}

function buildMaterializationReviewPackageLine(option: Record<string, unknown> | null) {
  const reviewPackage = readMaterializationReviewPackage(option)
  if (!reviewPackage) return null
  const edgeCount = Number(reviewPackage.proposedDependencyEdgeCount ?? 0) || 0
  const status = typeof reviewPackage.status === 'string' ? reviewPackage.status : ''
  const statusLabels: Record<string, string> = {
    ready_for_manual_review: '已生成可审阅关系草案',
    needs_generated_row_carrier: '缺少生成行承载，暂不能生成关系草案',
    evidence_only: '仅保留为方案证据',
    blocked_by_violations: '存在冲突，关系草案暂不开放',
  }
  if (edgeCount > 0) {
    return `${statusLabels[status] ?? '关系草案'}：${edgeCount} 条`
  }
  return status ? statusLabels[status] ?? status : null
}

function buildReferenceDurationEvidenceLine(option: Record<string, unknown> | null) {
  const evidence = readGeneratedRowReferenceDurationEvidence(option)
  if (!evidence) return null
  const matchedReferenceRowCount = Number(evidence.matchedReferenceRowCount ?? 0) || 0
  const totalPlanReferenceDays = Number(evidence.totalPlanReferenceDays)
  if (matchedReferenceRowCount <= 0) return null
  const totalText = Number.isFinite(totalPlanReferenceDays)
    ? `，合计参考 ${Math.round(totalPlanReferenceDays)} 天`
    : ''
  return `已读取 ${matchedReferenceRowCount} 行生成计划参考工期${totalText}`
}

function buildGeneratedRowNetworkLine(option: Record<string, unknown> | null) {
  const evaluation = readGeneratedRowNetworkEvaluation(option)
  if (!evaluation) return null
  const projectedNetworkSpanDays = Number(evaluation.projectedNetworkSpanDays)
  if (!Number.isFinite(projectedNetworkSpanDays) || projectedNetworkSpanDays <= 0) return null
  const criticalGeneratedRowIds = Array.isArray(evaluation.criticalGeneratedRowIds)
    ? evaluation.criticalGeneratedRowIds
    : []
  const unresolvedEdgeCount = Number(evaluation.unresolvedEdgeCount ?? 0) || 0
  const unresolvedText = unresolvedEdgeCount > 0
    ? `，未解析 ${unresolvedEdgeCount} 条关系`
    : ''
  return `候选网络只读评估：跨度 ${Math.round(projectedNetworkSpanDays)} 天，关键生成行 ${criticalGeneratedRowIds.length} 个${unresolvedText}`
}

function buildProductCloseoutReadinessLine(scenario: WbsConstructionOrganizationScenarioSummary) {
  const readiness = readProductCloseoutReadiness(scenario)
  const progress = readProductOutcomeCloseoutProgress(scenario)
  if (progress) {
    const canDeclareProgress = progress.canDeclareConstructionOrganizationProductOutcomeCloseout === true
    const readyCount = Number(progress.runtimeOutcomeReadyBusinessTypeCount ?? 0)
    const supportedCount = Number(progress.supportedBusinessTypeCount ?? 0)
    const missingBusinessTypes = asStringArray(progress.missingBusinessTypes)
    if (canDeclareProgress) {
      return Number.isFinite(readyCount) && Number.isFinite(supportedCount) && supportedCount > 0
        ? `产品闭环：${Math.round(readyCount)}/${Math.round(supportedCount)} 业态运行证据已闭合，仍以运行闭环矩阵为准`
        : '产品闭环：运行证据已闭合，仍以运行闭环矩阵为准'
    }
    const countText = Number.isFinite(readyCount) && Number.isFinite(supportedCount) && supportedCount > 0
      ? `${Math.round(readyCount)}/${Math.round(supportedCount)} 业态闭合`
      : '候选推荐'
    const missingText = missingBusinessTypes.length > 0
      ? `，缺口业态：${missingBusinessTypes.slice(0, 3).join('、')}`
      : ''
    return `产品闭环：${countText}，仍需运行闭环矩阵确认${missingText}`
  }
  if (!readiness) return null
  const canDeclare = readiness.canDeclareConstructionOrganizationProductOutcomeCloseout === true
  if (canDeclare) return '产品闭环：运行证据已闭合，仍以运行闭环矩阵为准'
  const missing = asStringArray(readiness.missingBeforeProductCloseout)
  const requiresRuntimeEvidence = missing.includes('real_runtime_evidence_source_required')
  const requiresUseCaseCoverage = missing.some((item) => item.startsWith('runtime_use_case_coverage_required'))
    || missing.includes('runtime_use_case_coverage_required')
  const requiresOptionNetwork = missing.includes('runtime_option_network_coverage_required')
    || missing.includes('runtime_ready_option_closeout_claim_coverage_required')
  const requiresSiteAdoption = missing.includes('site_adoption_of_runtime_recommended_option_required')
  const labels = [
    requiresRuntimeEvidence ? '运行证据' : null,
    requiresUseCaseCoverage ? '三入口覆盖' : null,
    requiresOptionNetwork ? '候选网络闭环' : null,
    requiresSiteAdoption ? '站点采纳' : null,
  ].filter((item): item is string => Boolean(item))
  return labels.length > 0
    ? `产品闭环：候选推荐，仍需${labels.join('、')}`
    : '产品闭环：候选推荐，仍需运行闭环矩阵确认'
}

export function buildConstructionOrganizationScenarioReview(
  scenario: WbsConstructionOrganizationScenarioSummary | null | undefined,
  activeUseCase?: ConstructionOrganizationUseCase,
) {
  if (!scenario) return null

  const option = mergeOptionEvidence(selectPlanOption(scenario, activeUseCase), asRecord(scenario.recommendedPlanOption))
  const planNetworkDraft = readPlanNetworkDraftRecommendation(scenario, activeUseCase)
  const optionScenarioIds = asStringArray(option?.selectedScenarioIds)
  const useCaseScenarioIds = readUseCaseSelectedScenarioIds(scenario, activeUseCase)
  const scenarioIds = uniqueStrings(
    activeUseCase && useCaseScenarioIds.length > 0
      ? useCaseScenarioIds
      : optionScenarioIds.length > 0
        ? optionScenarioIds
        : useCaseScenarioIds.length > 0
        ? useCaseScenarioIds
        : asStringArray(scenario.recommendedScenarioIds),
  )
  if (scenarioIds.length === 0) return null

  const factKeys: string[] = []
  const contextFactKeys: string[] = []
  const sidecarFactKeys: string[] = []
  const resourcePolicies: string[] = []
  const decisionReportSignals = asRecord(readOrganizationDecisionReport(scenario)?.decisionSignals)
  factKeys.push(...asStringArray(decisionReportSignals?.decisionFactKeys))
  contextFactKeys.push(...asStringArray(decisionReportSignals?.contextFactKeys))
  sidecarFactKeys.push(...asStringArray(decisionReportSignals?.sidecarFactKeys))
  if (typeof decisionReportSignals?.resourcePolicy === 'string') {
    resourcePolicies.push(decisionReportSignals.resourcePolicy)
  }
  for (const evaluation of readUseCaseEvaluationRecords(option, activeUseCase)) {
    const factCoverage = asRecord(evaluation.factCoverage)
    const decisionFactKeys = asStringArray(factCoverage?.decisionFactKeys)
    factKeys.push(...(decisionFactKeys.length > 0 ? decisionFactKeys : asStringArray(factCoverage?.consumedFactKeys)))
    contextFactKeys.push(...asStringArray(factCoverage?.contextFactKeys))
    sidecarFactKeys.push(...asStringArray(factCoverage?.sidecarFactKeys))
    if (typeof factCoverage?.resourcePolicy === 'string') {
      resourcePolicies.push(factCoverage.resourcePolicy)
    }
  }
  if (typeof scenario.resourcePolicy === 'string') {
    resourcePolicies.push(scenario.resourcePolicy)
  }

  if (factKeys.length === 0) {
    factKeys.push(...readSummaryDecisionFactKeys(scenario))
  }

  return {
    labels: scenarioIds.map((id) => SCENARIO_LABELS[id] ?? id),
    candidateCount: readPlanOptionCandidateCount(scenario),
    comparisonLines: readCandidateComparisonLines(option),
    factLabels: uniqueStrings(factKeys)
      .map((key) => FACT_LABELS[key] ?? key)
      .slice(0, 4),
    contextFactLabels: uniqueStrings(contextFactKeys)
      .map((key) => FACT_LABELS[key] ?? key)
      .slice(0, 3),
    resourcesAreSidecar: sidecarFactKeys.length > 0 || resourcePolicies.some((policy) => policy.includes('sidecar')),
    confidence: typeof option?.confidence === 'string' ? option.confidence : scenario.confidence,
    useCaseLines: buildUseCaseLines(scenario, activeUseCase),
    recommendationBasisLines: buildRecommendationBasisLines(scenario, option, activeUseCase),
    projectPolicyLine: buildProjectPolicyLine(scenario, option),
    materializationLine: buildMaterializationLine(option),
    materializationDecisionLine: buildMaterializationDecisionLine(option),
    materializationReviewPackageLine: buildMaterializationReviewPackageLine(option),
    planOptionComparisonGovernanceLine: buildPlanOptionComparisonGovernanceLine(scenario, option, activeUseCase),
    systemRecommendationBasisLine: buildSystemRecommendationBasisLine(scenario, option, activeUseCase),
    planNetworkDraftLine: buildPlanNetworkDraftLine(planNetworkDraft),
    planNetworkDraftEvaluationLine: buildPlanNetworkDraftEvaluationLine(planNetworkDraft),
    referenceDurationEvidenceLine: buildReferenceDurationEvidenceLine(option),
    generatedRowNetworkLine: buildGeneratedRowNetworkLine(option),
    productCloseoutReadinessLine: buildProductCloseoutReadinessLine(scenario),
  }
}

export function ConstructionOrganizationScenarioSummary({
  scenario,
  className,
  activeUseCase,
}: {
  scenario: WbsConstructionOrganizationScenarioSummary | null | undefined
  className?: string
  activeUseCase?: ConstructionOrganizationUseCase
}) {
  const review = buildConstructionOrganizationScenarioReview(scenario, activeUseCase)
  if (!review) return null

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-3', className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <GitBranch className="h-4 w-4 text-blue-600" />
        施工组织方案
        {review.confidence ? (
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
            {review.confidence}
          </Badge>
        ) : null}
      </div>
      <div className="grid gap-1.5 text-xs leading-5 text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-800">
            {review.labels.join(' / ')}
          </span>
        </div>
        {review.factLabels.length > 0 ? (
          <div>已用于判断：{review.factLabels.join('、')}</div>
        ) : null}
        {review.contextFactLabels.length > 0 ? (
          <div>已留痕：{review.contextFactLabels.join('、')}</div>
        ) : null}
        {review.candidateCount > 1 ? (
          <div>已比较 {review.candidateCount} 套候选方案</div>
        ) : null}
        {review.recommendationBasisLines.length > 0 ? (
          <div>推荐依据：{review.recommendationBasisLines.join('、')}</div>
        ) : null}
        {review.systemRecommendationBasisLine ? (
          <div>{review.systemRecommendationBasisLine}</div>
        ) : null}
        {review.projectPolicyLine ? (
          <div>{review.projectPolicyLine}</div>
        ) : null}
        {review.materializationLine ? (
          <div>{review.materializationLine}</div>
        ) : null}
        {review.materializationDecisionLine ? (
          <div>{review.materializationDecisionLine}</div>
        ) : null}
        {review.materializationReviewPackageLine ? (
          <div>{review.materializationReviewPackageLine}</div>
        ) : null}
        {review.planOptionComparisonGovernanceLine ? (
          <div>{review.planOptionComparisonGovernanceLine}</div>
        ) : null}
        {review.planNetworkDraftLine ? (
          <div>{review.planNetworkDraftLine}</div>
        ) : null}
        {review.planNetworkDraftEvaluationLine ? (
          <div>{review.planNetworkDraftEvaluationLine}</div>
        ) : null}
        {review.referenceDurationEvidenceLine ? (
          <div>{review.referenceDurationEvidenceLine}</div>
        ) : null}
        {review.generatedRowNetworkLine ? (
          <div>{review.generatedRowNetworkLine}</div>
        ) : null}
        {review.productCloseoutReadinessLine ? (
          <div>{review.productCloseoutReadinessLine}</div>
        ) : null}
        {review.comparisonLines.length > 0 ? (
          <div className="grid gap-1">
            {review.comparisonLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : null}
        {review.useCaseLines.length > 0 ? (
          <div className="grid gap-1">
            {review.useCaseLines.map((line) => (
              <div key={line.key}>
                {line.text}
                {line.currentSubstage ? (
                  <span>；当前阶段：{line.currentSubstage}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {review.resourcesAreSidecar ? (
          <div>塔吊等资源只作可行性旁路信号</div>
        ) : null}
        <div>候选方案不直接改写任务依赖或计划日期</div>
      </div>
    </div>
  )
}
