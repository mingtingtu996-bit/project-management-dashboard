import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ConstructionOrganizationScenarioSummary,
  type ConstructionOrganizationUseCase,
} from '@/components/planning/ConstructionOrganizationScenarioSummary'
import type {
  CommercialFactReadinessItem,
  ScopeTemplateCoverageItem,
  WizardProfilePreview,
} from './projectWizardApi'
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { formatDurationMetric, formatDurationRiskReserve, readAvailableDurationValue, type DurationRiskDistributionDto } from '@/lib/durationMetric'

interface Props {
  preview: WizardProfilePreview | null
  loading?: boolean
  error?: string | null
  generating?: boolean
  onGenerate: () => void
  onRefresh: () => void
  onBackToScope?: () => void
}

function formatNumber(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '未填写'
  return `${new Intl.NumberFormat('zh-CN').format(value)}${suffix}`
}

function formatRatio(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '未计算'
  return `${Math.round(value * 100)}%`
}

function readFiniteCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function countCandidateCriticalRows(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

type CandidateCriticalRowSummary = {
  title: string
  plannedStartDate: string
  plannedEndDate: string
  totalFloatDays: number | null
}

type CandidateNetworkRecalculation = {
  adjustedRowCount: number
  previousProjectedNetworkSpanDays: number
  recalculatedProjectedNetworkSpanDays: number
  mutationBoundary: string
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hideInternalDurationPercentiles(value: string | null | undefined) {
  return String(value ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && !/^P(?:20|50|80)\s+/i.test(part))
    .join(' / ')
    .replace(/\bP(?:20|50|80)\s+(?=\d)/gi, '')
}

function readCandidateNetworkRecalculation(value: unknown): CandidateNetworkRecalculation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const recalculation = record.durationAssetPlanDateNetworkRecalculation
  if (!recalculation || typeof recalculation !== 'object' || Array.isArray(recalculation)) return null
  const recalculationRecord = recalculation as Record<string, unknown>
  const adjustedRowCount = readFiniteCount(recalculationRecord.adjustedRowCount)
  const previousProjectedNetworkSpanDays = readFiniteCount(recalculationRecord.previousProjectedNetworkSpanDays)
  const recalculatedProjectedNetworkSpanDays = readFiniteCount(recalculationRecord.recalculatedProjectedNetworkSpanDays)
  const mutationBoundary = readText(recalculationRecord.mutationBoundary)
  if (adjustedRowCount <= 0 || previousProjectedNetworkSpanDays <= 0 || recalculatedProjectedNetworkSpanDays <= 0) return null
  return {
    adjustedRowCount,
    previousProjectedNetworkSpanDays,
    recalculatedProjectedNetworkSpanDays,
    mutationBoundary,
  }
}

function readCandidateCriticalRowSummaries(value: unknown): CandidateCriticalRowSummary[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const summaries = (value as Record<string, unknown>).criticalRowSummaries
  if (!Array.isArray(summaries)) return []
  return summaries
    .map((summary) => {
      if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null
      const record = summary as Record<string, unknown>
      const title = readText(record.title)
      const plannedStartDate = readText(record.plannedStartDate ?? record.planned_start_date)
      const plannedEndDate = readText(record.plannedEndDate ?? record.planned_end_date)
      if (!title || !plannedStartDate || !plannedEndDate) return null
      const totalFloatDays = typeof record.totalFloatDays === 'number'
        ? record.totalFloatDays
        : typeof record.total_float_days === 'number'
          ? record.total_float_days
          : null
      return { title, plannedStartDate, plannedEndDate, totalFloatDays } satisfies CandidateCriticalRowSummary
    })
    .filter((summary): summary is CandidateCriticalRowSummary => Boolean(summary))
}

function formatCandidateDurationRisk(item: {
  riskP20DurationDays?: number | null
  riskP50DurationDays?: number | null
  riskP80DurationDays?: number | null
  durationRiskDistribution?: DurationRiskDistributionDto | null
}) {
  const { riskP20DurationDays, riskP50DurationDays, riskP80DurationDays } = item
  if (!item.durationRiskDistribution && riskP20DurationDays == null && riskP50DurationDays == null && riskP80DurationDays == null) return null
  return `工期风险${formatDurationRiskReserve(item.durationRiskDistribution)}`
}

function formatCandidateSeasonalEvidence(item: {
  processSeasonalDurationAssetConsumed?: boolean
  processSeasonalClimateSignal?: string | null
  processSeasonalImpactBand?: string | null
}) {
  if (!item.processSeasonalDurationAssetConsumed) return null
  const signal = item.processSeasonalClimateSignal || '已应用'
  return item.processSeasonalImpactBand
    ? `季节修正 ${signal} / ${item.processSeasonalImpactBand}`
    : `季节修正 ${signal}`
}

function formatCandidateDurationAdjustment(item: {
  baseSelectedDurationDays?: number | null
  selectedDurationDays?: number | null
}) {
  if (item.baseSelectedDurationDays == null || item.selectedDurationDays == null) return null
  return `工期 ${item.baseSelectedDurationDays} -> ${item.selectedDurationDays} 天`
}

function formatCandidateSeedLineage(item: {
  standardWorkDurationSeedStableCode?: string | null
  standardWorkDurationSeedResolverSource?: string | null
  standardWorkDurationSeedResolverVersionId?: string | null
}) {
  if (!item.standardWorkDurationSeedStableCode) return null
  const resolver = [
    item.standardWorkDurationSeedResolverSource,
    item.standardWorkDurationSeedResolverVersionId,
  ].filter(Boolean).join(' / ')
  return resolver
    ? `seed ${item.standardWorkDurationSeedStableCode}：${resolver}`
    : `seed ${item.standardWorkDurationSeedStableCode}`
}

function formatCandidateT2Lineage(item: {
  t2RhythmTemplateId?: string | null
  t2RhythmTemplateResolverSource?: string | null
  t2RhythmTemplateResolverVersionId?: string | null
}) {
  if (!item.t2RhythmTemplateId) return null
  const resolver = [
    item.t2RhythmTemplateResolverSource,
    item.t2RhythmTemplateResolverVersionId,
  ].filter(Boolean).join(' / ')
  return resolver ? `T2 ${item.t2RhythmTemplateId}：${resolver}` : `T2 ${item.t2RhythmTemplateId}`
}

function formatCandidateRuntimeReferenceDays(item: {
  runtimeReferenceDaysConsumed?: boolean
  runtimeReferenceDaysStableCode?: string | null
  runtimeReferenceDaysP50Days?: number | null
  runtimeReferenceDaysP80Days?: number | null
  runtimeReferenceDaysSampleCount?: number | null
}) {
  if (!item.runtimeReferenceDaysConsumed && !item.runtimeReferenceDaysStableCode) return null
  const stableCode = item.runtimeReferenceDaysStableCode || '已消费'
  const referenceDays = item.runtimeReferenceDaysP50Days ?? item.runtimeReferenceDaysP80Days ?? '-'
  const sampleCount = item.runtimeReferenceDaysSampleCount ?? '-'
  return `参考天数 ${stableCode}：${referenceDays} 天 / 样本 ${sampleCount}`
}

function formatCandidateProjectScaleQuantityProxy(item: {
  projectScaleQuantityProxyApplied?: boolean
  projectScaleQuantityProxySource?: string | null
  projectScaleQuantityProxyValue?: number | null
  projectScaleQuantityProxyUnit?: string | null
  projectScaleQuantityProxyBasis?: string | null
  productivityDerivedDurationDays?: number | null
}) {
  const hasQuantityProxy = Boolean(
    item.projectScaleQuantityProxyApplied
      || item.projectScaleQuantityProxySource
      || item.projectScaleQuantityProxyValue != null
      || item.projectScaleQuantityProxyUnit
      || item.projectScaleQuantityProxyBasis
      || item.productivityDerivedDurationDays != null,
  )
  if (!hasQuantityProxy) return null
  const details = [
    item.projectScaleQuantityProxySource,
    item.projectScaleQuantityProxyValue == null ? null : `quantity ${item.projectScaleQuantityProxyValue}`,
    item.projectScaleQuantityProxyUnit,
    item.productivityDerivedDurationDays == null
      ? null
      : `productivity duration ${item.productivityDerivedDurationDays} days`,
    item.projectScaleQuantityProxyBasis,
  ].filter(Boolean)
  return details.length > 0
    ? `工程量/产能 ${details.join(' / ')}`
    : '工程量/产能 project_scale_quantity_proxy'
}

function formatCandidateBusinessTypeLineage(item: {
  businessType?: string | null
  businessTypeProfileSourceType?: string | null
  businessTypeProfileTemplateId?: string | null
  businessTypeProfileTemplateGroup?: string | null
  businessTypeProfilePackType?: string | null
  businessTypeProfileMutationBoundary?: string | null
  businessTypeSpecialtyDurationAssetApplied?: boolean
  businessTypeSpecificT2RhythmTemplateApplied?: boolean
}) {
  const hasBusinessTypeLineage = Boolean(
    item.businessType
      || item.businessTypeProfileSourceType
      || item.businessTypeProfileTemplateId
      || item.businessTypeProfileTemplateGroup
      || item.businessTypeProfilePackType
      || item.businessTypeProfileMutationBoundary
      || item.businessTypeSpecialtyDurationAssetApplied
      || item.businessTypeSpecificT2RhythmTemplateApplied,
  )
  if (!hasBusinessTypeLineage) return null
  const details = [
    item.businessType,
    item.businessTypeProfileSourceType,
    item.businessTypeProfileTemplateId,
    item.businessTypeProfileTemplateGroup,
    item.businessTypeProfilePackType,
    item.businessTypeSpecialtyDurationAssetApplied ? 'specialty_duration_asset' : null,
    item.businessTypeSpecificT2RhythmTemplateApplied ? 'specific_t2_rhythm_template' : null,
    item.businessTypeProfileMutationBoundary,
  ].filter(Boolean)
  return details.length > 0 ? `业态专属 ${details.join(' / ')}` : '业态专属 lineage'
}

function formatCandidateDependencyLineage(item: {
  dependencyAssetStableCode?: string | null
  dependencyAssetStrength?: string | null
  dependencyAssetDependencyType?: string | null
  dependencyAssetLagDays?: number | null
  dependencyAssetEvidenceSourceKeys?: string[]
  dependencyTimingAssetConsumed?: boolean
  dependencyTimingSelectedLagDays?: number | null
  dependencyRuleSource?: string | null
  dependencyLayerStack?: string | null
  dependencyProductionWritePolicy?: string | null
  phaseAnchorDependencyCount?: number | null
  dependencyStartAnchor?: boolean
  dependencyAnchorType?: string | null
}) {
  const hasDependencySequenceEvidence = Boolean(
    item.dependencyAssetStableCode
      || item.dependencyTimingAssetConsumed
      || item.dependencyTimingSelectedLagDays != null
      || item.dependencyRuleSource
      || item.dependencyLayerStack
      || item.dependencyProductionWritePolicy
      || item.phaseAnchorDependencyCount != null
      || item.dependencyStartAnchor
      || item.dependencyAnchorType,
  )
  if (!hasDependencySequenceEvidence) return null
  const reference = item.dependencyAssetStableCode || item.dependencyRuleSource || 'dependency_timing_asset'
  const details = [
    item.dependencyAssetStrength,
    item.dependencyAssetDependencyType,
    item.dependencyAssetLagDays == null ? null : `lag ${item.dependencyAssetLagDays}`,
    item.dependencyTimingSelectedLagDays == null ? null : `timing lag ${item.dependencyTimingSelectedLagDays}`,
    item.dependencyTimingAssetConsumed ? 'dependency_timing_asset' : null,
    item.dependencyRuleSource,
    item.dependencyLayerStack,
    item.dependencyProductionWritePolicy,
    item.phaseAnchorDependencyCount == null ? null : `anchors ${item.phaseAnchorDependencyCount}`,
    item.dependencyStartAnchor ? 'start_anchor' : null,
    item.dependencyAnchorType,
    ...(item.dependencyAssetEvidenceSourceKeys ?? []),
  ].filter(Boolean)
  if (!item.dependencyAssetStableCode) {
    return details.length > 0
      ? `dependency evidence ${reference}: ${details.join(' / ')}`
      : `dependency evidence ${reference}`
  }
  return details.length > 0
    ? `依赖依据 ${item.dependencyAssetStableCode}：${details.join(' / ')}`
    : `依赖依据 ${item.dependencyAssetStableCode}`
}

function formatCriticalPathEvidenceDetails(item: {
  criticalPathCandidate?: boolean | null
  totalFloatDays?: number | null
  earlyStartOffsetDays?: number | null
  earlyFinishOffsetDays?: number | null
  lateStartOffsetDays?: number | null
  lateFinishOffsetDays?: number | null
}) {
  const hasEvidence = Boolean(
    item.criticalPathCandidate != null
      || item.totalFloatDays != null
      || item.earlyStartOffsetDays != null
      || item.earlyFinishOffsetDays != null
      || item.lateStartOffsetDays != null
      || item.lateFinishOffsetDays != null,
  )
  if (!hasEvidence) return null
  return [
    item.criticalPathCandidate == null ? null : `critical ${item.criticalPathCandidate ? 'yes' : 'no'}`,
    item.totalFloatDays == null ? null : `float ${item.totalFloatDays} days`,
    item.earlyStartOffsetDays == null ? null : `ES ${item.earlyStartOffsetDays}`,
    item.earlyFinishOffsetDays == null ? null : `EF ${item.earlyFinishOffsetDays}`,
    item.lateStartOffsetDays == null ? null : `LS ${item.lateStartOffsetDays}`,
    item.lateFinishOffsetDays == null ? null : `LF ${item.lateFinishOffsetDays}`,
  ].filter(Boolean).join(' / ')
}

function formatCandidateCriticalPathEvidence(item: {
  criticalPathCandidate?: boolean | null
  totalFloatDays?: number | null
  earlyStartOffsetDays?: number | null
  earlyFinishOffsetDays?: number | null
  lateStartOffsetDays?: number | null
  lateFinishOffsetDays?: number | null
}) {
  const details = formatCriticalPathEvidenceDetails(item)
  return details ? `critical path ${details}` : null
}

function formatDurationSelectionBasisDetails(item: {
  durationSelectionRule?: string | null
  durationCalibrationSource?: string | null
  durationMaturity?: string | null
  durationReviewGate?: string | null
  durationTruthSource?: string | null
  standardWorkDurationSeedP50Days?: number | null
  t2RhythmTemplateP50Days?: number | null
  realPlanSkeletonDurationDays?: number | null
  realPlanSkeletonFloorApplied?: boolean | null
  maxNonSkeletonAssetDays?: number | null
}) {
  const hasEvidence = Boolean(
    item.durationSelectionRule
      || item.durationCalibrationSource
      || item.durationMaturity
      || item.durationReviewGate
      || item.durationTruthSource
      || item.standardWorkDurationSeedP50Days != null
      || item.t2RhythmTemplateP50Days != null
      || item.realPlanSkeletonDurationDays != null
      || item.realPlanSkeletonFloorApplied != null
      || item.maxNonSkeletonAssetDays != null,
  )
  if (!hasEvidence) return null
  return [
    item.durationSelectionRule ? `rule ${item.durationSelectionRule}` : null,
    item.durationCalibrationSource ? `calibration ${item.durationCalibrationSource}` : null,
    item.durationMaturity ? `maturity ${item.durationMaturity}` : null,
    item.durationReviewGate ? `gate ${item.durationReviewGate}` : null,
    item.durationTruthSource ? `truth ${item.durationTruthSource}` : null,
    item.standardWorkDurationSeedP50Days == null ? null : `seed ${item.standardWorkDurationSeedP50Days}`,
    item.t2RhythmTemplateP50Days == null ? null : `T2 ${item.t2RhythmTemplateP50Days}`,
    item.realPlanSkeletonDurationDays == null ? null : `skeleton ${item.realPlanSkeletonDurationDays} days`,
    item.realPlanSkeletonFloorApplied == null
      ? null
      : `skeleton_floor ${item.realPlanSkeletonFloorApplied ? 'yes' : 'no'}`,
    item.maxNonSkeletonAssetDays == null ? null : `max non-skeleton ${item.maxNonSkeletonAssetDays} days`,
  ].filter(Boolean).join(' / ')
}

function formatCandidateDurationSelectionBasis(item: Parameters<typeof formatDurationSelectionBasisDetails>[0]) {
  const details = formatDurationSelectionBasisDetails(item)
  return details ? `duration basis ${details}` : null
}

function joinValues(values: string[] | undefined, fallback = '未识别') {
  return values && values.length > 0 ? values.join('、') : fallback
}

function profileLabel(code?: string | null) {
  const labels: Record<string, string> = {
    general_civil: '民用建筑',
    hospital: '医院',
    hotel: '酒店',
    school: '学校',
    industrial: '工业建筑',
    data_center: '数据中心',
    transportation_hub: '交通枢纽',
    sports_culture: '体育文化建筑',
    tod_upper_cover: 'TOD 上盖',
    renovation: '既有改造',
    modular_building: '模块化建筑',
    full_project_master: '项目全周期总控计划',
    general_contract: '施工总承包范围',
    civil_structure_package: '土建/主体结构范围',
    specialty_package: '专项分包范围',
    continuation_start_line: '已开工项目接续计划',
    rough: '毛坯交付',
    mep_ready: '机电完成可移交',
    public_area_fitout: '公区精装完成',
    full_fitout: '全装修交付',
    hotel_opening: '酒店开业标准',
    production_ready: '投产/生产就绪',
    contract_completion: '合同范围完成',
    completion_acceptance: '竣工验收/备案',
    owner_handover: '业主/物业移交',
    trial_opening: '试营业/试运行',
    production_validation: '投产验证通过',
  }
  return code ? labels[code] ?? code : '未填写'
}

function actionTitle(type: string) {
  if (type === 'fast_track') return '提前穿插'
  if (type === 'crashing') return '增加资源'
  return '调整交付范围'
}

function verdictText(verdict?: string) {
  if (verdict === 'draft_recoverable') return '按预案可追回'
  if (verdict === 'needs_scope_decision') return '还需要管理决策'
  if (verdict === 'infeasible') return '按当前条件不可承诺'
  return '需要复核'
}

function scopeReadinessTitle(issue: WizardProfilePreview['profile']['issues'][number]) {
  return issue.title || issue.scopeName || '范围体量缺少必要信息'
}

function scopeReadinessImpact(issue: WizardProfilePreview['profile']['issues'][number]) {
  return issue.impact || '相关标准或专项任务暂不能自动挂接，系统已暂停生成以避免范围错误。'
}

function scopeReadinessAction(issue: WizardProfilePreview['profile']['issues'][number]) {
  return issue.action || '回到范围体量补齐楼层、地下层或对应物理空间。'
}

function coverageStatusLabel(status: ScopeTemplateCoverageItem['status']) {
  if (status === 'auto_schedulable') return '可自动生成'
  if (status === 'manual_task_required') return '生成后补充'
  return '缺少空间'
}

function coverageStatusClass(status: ScopeTemplateCoverageItem['status']) {
  if (status === 'auto_schedulable') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (status === 'manual_task_required') return 'border-amber-200 bg-amber-50 text-amber-950'
  return 'border-rose-200 bg-rose-50 text-rose-900'
}

function sortCoverageItems(items: ScopeTemplateCoverageItem[]) {
  const order: Record<ScopeTemplateCoverageItem['status'], number> = {
    missing_required_scope: 0,
    manual_task_required: 1,
    auto_schedulable: 2,
  }
  return [...items].sort((left, right) => order[left.status] - order[right.status])
}

function commercialReadinessStatusLabel(status: CommercialFactReadinessItem['status']) {
  if (status === 'ready') return '已达标'
  if (status === 'warning') return '待确认'
  if (status === 'blocking') return '需补齐'
  return '未启用'
}

function commercialReadinessStatusClass(status: CommercialFactReadinessItem['status']) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-950'
  if (status === 'blocking') return 'border-rose-200 bg-rose-50 text-rose-900'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

export function Step6ProjectProfileConfirmation({
  preview,
  loading = false,
  error,
  generating = false,
  onGenerate,
  onRefresh,
  onBackToScope,
}: Props) {
  const WarningIcon = getWizardScopeIcon('warning')
  const CompleteIcon = getWizardScopeIcon('wizard_complete')
  const TargetIcon = getWizardScopeIcon('schedule_target')
  const GeneratingIcon = getWizardScopeIcon('generating')
  const LocationIcon = getWizardScopeIcon('wizard_step_identity')
  const SummaryIcon = getWizardScopeIcon('profile_summary')
  const GenerationIcon = getWizardScopeIcon('generation')

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <GeneratingIcon className="mx-auto h-5 w-5 animate-spin text-blue-600" data-testid={wizardIconTestId('generating')} />
        <p className="mt-3 text-sm text-slate-600">正在按当前项目画像试算任务和目标工期...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <div className="flex items-start gap-2 text-sm text-rose-800">
          <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" data-testid={wizardIconTestId('warning')} />
          <span>{error}</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-3 bg-white" onClick={onRefresh}>
          重新试算
        </Button>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">尚未形成项目画像，请先补齐前面的项目资料。</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRefresh}>
          生成画像
        </Button>
      </div>
    )
  }

  const feasibility = preview.targetFeasibility
  const proposal = feasibility?.accelerationProposal
  const targetOvershootValue = readAvailableDurationValue(feasibility?.overshoot, 'calendar_day')
  const scopeCoverageDiagnostics = preview.profile.scopeCoverageDiagnostics ?? []
  const scopeTemplateCoverage = preview.profile.scopeTemplateCoverage ?? null
  const scopeWbsReadinessIssues = preview.profile.issues.filter((issue) => issue.code === 'SCOPE_WBS_READINESS_MISSING')
  const advisoryIssues = preview.profile.issues.filter((issue) => issue.code !== 'SCOPE_WBS_READINESS_MISSING')
  const missingTemplateScopeCount = scopeTemplateCoverage?.summary.missingRequiredScopeCount ?? 0
  const scopeBlocksGeneration = scopeWbsReadinessIssues.length > 0 || missingTemplateScopeCount > 0
  const commercialFactReadiness = preview.profile.commercialFactReadiness ?? null
  const durationAssetSummary = preview.profile.generation.durationAssetUtilizationSummary ?? null
  const durationAssetScheduleRowCount = readFiniteCount(durationAssetSummary?.scheduleRowCount) || preview.estimatedRowCount
  const durationAssetSeedRowCount = readFiniteCount(durationAssetSummary?.standardWorkDurationSeedRowCount)
  const durationAssetActiveSeedRowCount = readFiniteCount(durationAssetSummary?.activeStandardWorkDurationSeedRowCount)
  const durationAssetFallbackSeedRowCount = readFiniteCount(durationAssetSummary?.fallbackStandardWorkDurationSeedRowCount)
  const durationAssetT2RowCount = readFiniteCount(durationAssetSummary?.t2RhythmTemplateRowCount)
  const durationAssetActiveT2RowCount = readFiniteCount(durationAssetSummary?.activeT2RhythmTemplateRowCount)
  const durationAssetFallbackT2RowCount = readFiniteCount(durationAssetSummary?.fallbackT2RhythmTemplateRowCount)
  const durationAssetDependencyRowCount = readFiniteCount(durationAssetSummary?.dependencyAssetConsumedRowCount)
  const durationAssetProcessSeasonalRowCount = readFiniteCount(durationAssetSummary?.processSeasonalDurationAssetRowCount)
  const durationAssetConstructionCalendarRowCount = readFiniteCount(durationAssetSummary?.constructionCalendarRowCount)
  const durationAssetRuntimeReferenceDaysRowCount =
    readFiniteCount(durationAssetSummary?.runtimeReferenceDaysConsumedRowCount)
    || readFiniteCount(durationAssetSummary?.runtimeReferenceDaysRowCount)
  const durationAssetMissingSeedCount = readFiniteCount(durationAssetSummary?.rowsMissingDurationAssetCount)
  const durationAssetMissingT2Count = readFiniteCount(durationAssetSummary?.rowsMissingT2RhythmTemplateCount)
  const durationAssetMissingRuntimeReferenceDaysCount = readFiniteCount(durationAssetSummary?.rowsMissingRuntimeReferenceDaysCount)
  const durationAssetUsesColdStartAssets = Boolean(
    durationAssetSummary
      && (
        durationAssetActiveSeedRowCount < durationAssetSeedRowCount
        || durationAssetActiveT2RowCount < durationAssetT2RowCount
      ),
  )
  const businessTypeProfileScheduleRowCount = readFiniteCount(durationAssetSummary?.businessTypeProfileScheduleRowCount)
  const businessTypeSpecialtySeedRowCount = readFiniteCount(durationAssetSummary?.businessTypeSpecialtyDurationAssetRowCount)
  const businessTypeSpecificT2RowCount = readFiniteCount(durationAssetSummary?.businessTypeSpecificT2RhythmTemplateRowCount)
  const businessTypeMissingSpecialtySeedCount = readFiniteCount(durationAssetSummary?.businessTypeRowsMissingSpecialtyDurationAssetCount)
  const businessTypeMissingSpecificT2Count = readFiniteCount(durationAssetSummary?.businessTypeRowsMissingSpecificT2RhythmTemplateCount)
  const durationRiskRangeRowCount = readFiniteCount(durationAssetSummary?.durationRiskRangeRowCount)
  const businessTypeProfileCodes = joinValues(durationAssetSummary?.businessTypeProfileBusinessTypeCodes)
  const candidateDurationAssetPreview = preview.profile.generation.candidateDurationAssetPreview ?? null
  const candidateDurationAssetFirstItem = candidateDurationAssetPreview?.items?.[0] ?? null
  const candidateDurationRiskText = candidateDurationAssetFirstItem
    ? formatCandidateDurationRisk(candidateDurationAssetFirstItem)
    : null
  const candidateSeasonalText = candidateDurationAssetFirstItem
    ? formatCandidateSeasonalEvidence(candidateDurationAssetFirstItem)
    : null
  const candidateDurationAdjustmentText = candidateDurationAssetFirstItem
    ? formatCandidateDurationAdjustment(candidateDurationAssetFirstItem)
    : null
  const candidateDurationSeedLineageText = candidateDurationAssetFirstItem
    ? formatCandidateSeedLineage(candidateDurationAssetFirstItem)
    : null
  const candidateDurationT2LineageText = candidateDurationAssetFirstItem
    ? formatCandidateT2Lineage(candidateDurationAssetFirstItem)
    : null
  const candidateDurationRuntimeReferenceText = candidateDurationAssetFirstItem
    ? formatCandidateRuntimeReferenceDays(candidateDurationAssetFirstItem)
    : null
  const candidateDurationProjectScaleQuantityProxyText = candidateDurationAssetFirstItem
    ? formatCandidateProjectScaleQuantityProxy(candidateDurationAssetFirstItem)
    : null
  const candidateDurationBusinessTypeLineageText = candidateDurationAssetFirstItem
    ? formatCandidateBusinessTypeLineage(candidateDurationAssetFirstItem)
    : null
  const candidateDurationDependencyLineageText = candidateDurationAssetFirstItem
    ? formatCandidateDependencyLineage(candidateDurationAssetFirstItem)
    : null
  const candidateDurationCriticalPathText = candidateDurationAssetFirstItem
    ? formatCandidateCriticalPathEvidence(candidateDurationAssetFirstItem)
    : null
  const candidateDurationSelectionBasisText = candidateDurationAssetFirstItem
    ? formatCandidateDurationSelectionBasis(candidateDurationAssetFirstItem)
    : null
  const candidateNetworkEvaluation = preview.profile.generation.candidateNetworkEvaluation ?? null
  const candidateNetworkSpanDays = readFiniteCount(candidateNetworkEvaluation?.projectedNetworkSpanDays)
  const candidateNetworkEdgeCount = readFiniteCount(candidateNetworkEvaluation?.previewEdgeCount)
  const candidateNetworkProcessConstraintEdgeCount = readFiniteCount(candidateNetworkEvaluation?.processConstraintRoutingCandidateEdgeCount)
  const candidateNetworkUnresolvedEdgeCount = readFiniteCount(candidateNetworkEvaluation?.unresolvedEdgeCount)
  const candidateNetworkCriticalRowCount = countCandidateCriticalRows(candidateNetworkEvaluation?.criticalGeneratedRowIds)
  const candidateNetworkCriticalRowSummaries = readCandidateCriticalRowSummaries(candidateNetworkEvaluation)
  const candidateNetworkFirstCriticalRow = candidateNetworkCriticalRowSummaries[0] ?? null
  const candidateNetworkRecalculation = readCandidateNetworkRecalculation(candidateNetworkEvaluation)
  const blocksGeneration = scopeBlocksGeneration
    || readFiniteCount(commercialFactReadiness?.summary.blockingCount) > 0
    || candidateNetworkUnresolvedEdgeCount > 0
  const candidateNetworkReadOnly = candidateNetworkEvaluation?.writesTaskDependencies === false
    && candidateNetworkEvaluation?.writesPlanDates === false
    && candidateNetworkEvaluation?.writesCriticalPathFacts === false
  const candidateAcceptancePlanPreview = preview.profile.generation.candidateAcceptancePlanPreview ?? null
  const candidateAcceptancePlanTotalCount = readFiniteCount(candidateAcceptancePlanPreview?.totalCount)
  const candidateAcceptancePlanDatedCount = readFiniteCount(candidateAcceptancePlanPreview?.datedCount)
  const candidateAcceptancePlanFeatureTriggeredCount = readFiniteCount(
    candidateAcceptancePlanPreview?.featureTriggeredAcceptanceScheduleRowCount,
  )
  const candidateAcceptancePlanMaterializedCount = readFiniteCount(candidateAcceptancePlanPreview?.materializedCount)
  const candidateAcceptancePlanFirstItem = candidateAcceptancePlanPreview?.items?.[0] ?? null
  const candidateAcceptancePlanReadOnly = candidateAcceptancePlanPreview?.writesAcceptancePlans === false
  const candidateAcceptancePlanFallbackFromProjectTarget = candidateAcceptancePlanPreview?.fallbackFromProjectTarget === true
  const candidateAcceptancePlanFirstItemSourceBasis = candidateAcceptancePlanFirstItem?.sourceBasis?.trim()
  const candidateAcceptancePlanFirstItemCreatedTaskId = candidateAcceptancePlanFirstItem?.createdTaskId?.trim() || ''
  const candidateAcceptancePlanFirstItemCreatedAcceptancePlanId = candidateAcceptancePlanFirstItem?.createdAcceptancePlanId?.trim() || ''
  const candidateAcceptancePlanFirstItemMaterializationStatus = candidateAcceptancePlanFirstItem?.materializationStatus?.trim() || ''
  const candidateAcceptancePlanFirstItemMaterializationBoundary = candidateAcceptancePlanFirstItem?.materializationMutationBoundary?.trim() || ''
  const candidateAcceptancePlanFirstItemAcceptanceScheduleEvidence = candidateAcceptancePlanFirstItem?.acceptanceScheduleEvidence?.trim() || ''
  const inferredFeatures = [
    ...(preview.profile.features.inferred.functionalUsageCodes ?? []),
    ...(preview.profile.features.inferred.functionalCategoryCodes ?? []),
    ...(preview.profile.features.inferred.specialRoomTypeCodes ?? []),
  ]
  const constructionOrganizationUseCase: ConstructionOrganizationUseCase = preview.profile.identity.mode === 'starting_line'
    ? 'startingLineOnboarding'
    : 'newProjectPlanning'

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">确认项目画像</h2>
        <p className="mt-1 text-sm text-slate-500">
          系统会按这份画像选择模板、生成任务，并用同一套任务网络校准目标工期。确认无误后再生成任务列表。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-1)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <SummaryIcon className="h-4 w-4 text-blue-600" data-testid={wizardIconTestId('profile_summary')} />
            系统理解的项目
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
            <div>业态：<span className="font-medium text-slate-950">{profileLabel(preview.profile.identity.businessType)}</span></div>
            <div>计划范围：<span className="font-medium text-slate-950">{profileLabel(preview.profile.identity.planScopeCaliber)}</span></div>
            <div>交付标准：<span className="font-medium text-slate-950">{profileLabel(preview.profile.identity.deliveryStandard)}</span></div>
            <div>终点事件：<span className="font-medium text-slate-950">{profileLabel(preview.profile.identity.terminalEvent)}</span></div>
            <div>单体数量：<span className="font-medium text-slate-950 tabular-nums">{formatNumber(preview.profile.scale.buildingCount, ' 栋')}</span></div>
            <div>最高层数：<span className="font-medium text-slate-950 tabular-nums">{formatNumber(preview.profile.scale.highestBuildingFloorCount, ' 层')}</span></div>
            <div>地下层数：<span className="font-medium text-slate-950 tabular-nums">{formatNumber(preview.profile.scale.basementLevelCount, ' 层')}</span></div>
            <div>总建筑面积：<span className="font-medium text-slate-950 tabular-nums">{formatNumber(preview.profile.scale.totalAreaM2, ' m²')}</span></div>
            <div>地上建筑面积：<span className="font-medium text-slate-950 tabular-nums">{formatNumber(preview.profile.scale.aboveGroundAreaM2, ' m²')}</span></div>
            <div>地下建筑面积：<span className="font-medium text-slate-950 tabular-nums">{formatNumber(preview.profile.scale.basementAreaM2, ' m²')}</span></div>
            <div>占地面积：<span className="font-medium text-slate-950 tabular-nums">{formatNumber(preview.profile.scale.siteAreaM2, ' m²')}</span></div>
            <div>基坑深度：<span className="font-medium text-slate-950 tabular-nums">{formatNumber(preview.profile.scale.foundationDepthM, ' m')}</span></div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-1)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <LocationIcon className="h-4 w-4 text-blue-600" data-testid={wizardIconTestId('wizard_step_identity')} />
            地点与区域规则
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            <div>项目地点：<span className="font-medium text-slate-950">{preview.profile.locationFacts?.rawLocation ?? '未填写'}</span></div>
            <div>气候分区：<span className="font-medium text-slate-950">{preview.profile.locationFacts?.climateZone ?? '未匹配'}</span></div>
            <div>区域信号：<span className="font-medium text-slate-950">{joinValues(preview.profile.locationFacts?.climateSignals)}</span></div>
            <p className="text-xs leading-5 text-slate-500">
              地点会转成项目地理事实，后续冬雨季、天气窗口、工效因子和工期压缩预案统一读取这份事实。
            </p>
          </div>
        </section>
      </div>

      {commercialFactReadiness ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-1)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CompleteIcon className="h-4 w-4 text-blue-600" data-testid={wizardIconTestId('wizard_complete')} />
                <h3 className="text-sm font-semibold text-slate-900">商业化事实闭环</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                这里确认输入侧事实是否已经按生成器可消费口径闭合，不新增一套事实来源。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-900">
                {commercialFactReadiness.summary.readyCount} 项已达标
              </span>
              {commercialFactReadiness.summary.warningCount > 0 ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-950">
                  {commercialFactReadiness.summary.warningCount} 项待确认
                </span>
              ) : null}
              {commercialFactReadiness.summary.blockingCount > 0 ? (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-rose-900">
                  {commercialFactReadiness.summary.blockingCount} 项需补齐
                </span>
              ) : null}
              {commercialFactReadiness.summary.disabledCount > 0 ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
                  {commercialFactReadiness.summary.disabledCount} 项未启用
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {commercialFactReadiness.items.map((item) => (
              <div key={item.code} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${commercialReadinessStatusClass(item.status)}`}>
                    {commercialReadinessStatusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium leading-5 text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                {item.action ? (
                  <p className="mt-2 text-xs leading-5 text-amber-800">{item.action}</p>
                ) : null}
                {item.evidence.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.evidence.slice(0, 5).map((evidence) => (
                      <span key={evidence} className="rounded-md bg-white px-1.5 py-0.5 text-xs leading-5 text-slate-500">
                        {evidence}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ConstructionOrganizationScenarioSummary
        scenario={preview.constructionOrganizationScenario}
        activeUseCase={constructionOrganizationUseCase}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-1)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <GenerationIcon className="h-4 w-4 text-blue-600" data-testid={wizardIconTestId('generation')} />
          将按这些依据生成
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">预计任务行数</p>
            <p className="mt-1 text-xl font-semibold text-slate-950 tabular-nums">{preview.estimatedRowCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">模板来源</p>
            <p className="mt-1 text-xl font-semibold text-slate-950 tabular-nums">{preview.profile.generation.templateCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">里程碑 / 验收节点</p>
            <p className="mt-1 text-xl font-semibold text-slate-950 tabular-nums">{preview.profile.generation.milestoneCount}</p>
          </div>
          {durationAssetSummary ? (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">工期资产总账</p>
              <p className="mt-1 text-sm font-semibold text-slate-950 tabular-nums">seed {durationAssetSeedRowCount}/{durationAssetScheduleRowCount}</p>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">runtime seed {durationAssetActiveSeedRowCount}/{durationAssetScheduleRowCount}</p>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">fallback seed {durationAssetFallbackSeedRowCount}/{durationAssetScheduleRowCount}</p>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">T2 {durationAssetT2RowCount}/{durationAssetScheduleRowCount}</p>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">runtime T2 {durationAssetActiveT2RowCount}/{durationAssetScheduleRowCount}</p>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">fallback T2 {durationAssetFallbackT2RowCount}/{durationAssetScheduleRowCount}</p>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">已发布学习校准 {durationAssetRuntimeReferenceDaysRowCount}/{durationAssetScheduleRowCount}</p>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">未采用学习覆盖 {durationAssetMissingRuntimeReferenceDaysCount}</p>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">缺口 {durationAssetMissingSeedCount}/{durationAssetMissingT2Count}</p>
              {durationAssetUsesColdStartAssets ? (
                <p className="mt-2 text-xs leading-5 text-amber-700">
                  当前计划已使用系统冷启动资产；已发布学习校准仅作为可选覆盖，不影响本次生成与确认。
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-600 tabular-nums">依赖资产 {durationAssetDependencyRowCount} 行</p>
              {durationAssetConstructionCalendarRowCount > 0 ? (
                <p className="mt-1 text-xs text-slate-600 tabular-nums">施工日历 {durationAssetConstructionCalendarRowCount} 行</p>
              ) : null}
              {durationAssetProcessSeasonalRowCount > 0 ? (
                <p className="mt-1 text-xs text-slate-600 tabular-nums">季节调整 {durationAssetProcessSeasonalRowCount} 行</p>
              ) : null}
              {durationRiskRangeRowCount > 0 ? (
                <p className="mt-1 text-xs text-slate-600 tabular-nums">工期风险 {durationRiskRangeRowCount} 行已评估</p>
              ) : null}
              {businessTypeProfileScheduleRowCount > 0 ? (
                <>
                  <p className="mt-1 text-xs text-slate-600 tabular-nums">业态专属 seed {businessTypeSpecialtySeedRowCount}/{businessTypeProfileScheduleRowCount}</p>
                  <p className="mt-1 text-xs text-slate-600 tabular-nums">业态 T2 {businessTypeSpecificT2RowCount}/{businessTypeProfileScheduleRowCount}</p>
                  <p className="mt-1 text-xs text-slate-600 tabular-nums">业态缺口 {businessTypeMissingSpecialtySeedCount}/{businessTypeMissingSpecificT2Count}</p>
                  <p className="mt-1 text-xs text-slate-500">{businessTypeProfileCodes}</p>
                </>
              ) : null}
            </div>
          ) : null}
          {candidateDurationAssetFirstItem ? (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">候选工期资产</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{candidateDurationAssetFirstItem.title}</p>
              {[
                candidateDurationRiskText,
                candidateSeasonalText,
                candidateDurationAdjustmentText,
                candidateDurationSeedLineageText,
                candidateDurationT2LineageText,
                candidateDurationRuntimeReferenceText,
                candidateDurationProjectScaleQuantityProxyText,
                candidateDurationBusinessTypeLineageText,
                candidateDurationDependencyLineageText,
                candidateDurationCriticalPathText,
                candidateDurationSelectionBasisText,
              ].filter((value): value is string => Boolean(value)).map((value) => (
                <p key={value} className="mt-1 text-xs leading-5 text-slate-600 tabular-nums">{value}</p>
              ))}
            </div>
          ) : null}
          {candidateNetworkEvaluation ? (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">候选关键路径</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs tabular-nums">
                {candidateNetworkSpanDays > 0 ? (
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">跨度 {candidateNetworkSpanDays} 天</Badge>
                ) : null}
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">依赖边 {candidateNetworkEdgeCount}</Badge>
                {candidateNetworkProcessConstraintEdgeCount > 0 ? (
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">工艺穿插候选边 {candidateNetworkProcessConstraintEdgeCount}</Badge>
                ) : null}
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">未解析 {candidateNetworkUnresolvedEdgeCount}</Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">关键行 {candidateNetworkCriticalRowCount}</Badge>
                {candidateNetworkRecalculation ? (
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                    工期资产重算 {candidateNetworkRecalculation.previousProjectedNetworkSpanDays} -&gt; {candidateNetworkRecalculation.recalculatedProjectedNetworkSpanDays} 天
                  </Badge>
                ) : null}
              </div>
              {candidateNetworkFirstCriticalRow ? (
                <div className="mt-2 text-xs leading-5">
                  <p className="font-medium text-slate-800">{candidateNetworkFirstCriticalRow.title}</p>
                  <p className="mt-1 text-slate-600 tabular-nums">
                    {candidateNetworkFirstCriticalRow.plannedStartDate} - {candidateNetworkFirstCriticalRow.plannedEndDate}
                  </p>
                </div>
              ) : null}
              {candidateNetworkReadOnly ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">只读预览，不写任务依赖、计划日期或关键路径事实</p>
              ) : null}
              {candidateNetworkRecalculation?.mutationBoundary ? (
                <p className="mt-1 text-xs leading-5 text-slate-500">重算边界 {candidateNetworkRecalculation.mutationBoundary}</p>
              ) : null}
            </div>
          ) : null}
          {candidateAcceptancePlanPreview ? (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">候选验收计划</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs tabular-nums">
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">候选 {candidateAcceptancePlanTotalCount} 项</Badge>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">已排日期 {candidateAcceptancePlanDatedCount} 项</Badge>
                {candidateAcceptancePlanFeatureTriggeredCount > 0 ? (
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">特征触发 {candidateAcceptancePlanFeatureTriggeredCount} 项</Badge>
                ) : null}
                {candidateAcceptancePlanMaterializedCount > 0 ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">已生成验收计划 {candidateAcceptancePlanMaterializedCount} 项</Badge>
                ) : null}
                {candidateAcceptancePlanFallbackFromProjectTarget ? (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">项目目标日期兜底</Badge>
                ) : null}
              </div>
              {candidateAcceptancePlanFirstItem ? (
                <div className="mt-2 text-xs leading-5">
                  <p className="font-medium text-slate-800">{candidateAcceptancePlanFirstItem.title}</p>
                  {candidateAcceptancePlanFirstItem.plannedDate ? (
                    <p className="mt-1 text-slate-600 tabular-nums">{candidateAcceptancePlanFirstItem.plannedDate}</p>
                  ) : null}
                  {candidateAcceptancePlanFirstItemSourceBasis ? (
                    <p className="mt-1 text-slate-500">依据 {candidateAcceptancePlanFirstItemSourceBasis}</p>
                  ) : null}
                  {candidateAcceptancePlanFirstItemAcceptanceScheduleEvidence ? (
                    <p className="mt-1 text-slate-500 tabular-nums">验收节点证据 {candidateAcceptancePlanFirstItemAcceptanceScheduleEvidence}</p>
                  ) : null}
                  {candidateAcceptancePlanFirstItemCreatedTaskId || candidateAcceptancePlanFirstItemCreatedAcceptancePlanId || candidateAcceptancePlanFirstItemMaterializationStatus ? (
                    <p className="mt-1 text-slate-500 tabular-nums">
                      验收计划映射 {candidateAcceptancePlanFirstItemCreatedTaskId || '未映射任务'} / {candidateAcceptancePlanFirstItemCreatedAcceptancePlanId || '未映射验收计划'} / {candidateAcceptancePlanFirstItemMaterializationStatus || 'materialization_status_missing'}
                    </p>
                  ) : null}
                  {candidateAcceptancePlanFirstItemMaterializationBoundary ? (
                    <p className="mt-1 text-slate-500 tabular-nums">验收计划映射边界 {candidateAcceptancePlanFirstItemMaterializationBoundary}</p>
                  ) : null}
                </div>
              ) : null}
              {candidateAcceptancePlanReadOnly ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">只读预览，不写验收计划事实</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {preview.recommendation.matchedTemplates.slice(0, 10).map((template) => (
            <Badge key={template} variant="outline" className="bg-slate-50 text-slate-700">{template}</Badge>
          ))}
        </div>
        <div className="mt-4 text-xs leading-5 text-slate-500">
          工法：{joinValues(preview.profile.methods.methodVariantCodes)}；系统识别空间：{joinValues(inferredFeatures)}
        </div>
      </section>

      {scopeTemplateCoverage ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-1)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <GenerationIcon className="h-4 w-4 text-blue-600" data-testid={wizardIconTestId('generation')} />
                <h3 className="text-sm font-semibold text-slate-900">任务挂接检查</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                系统已按当前范围树检查模板任务能挂到哪些工程空间。这里不是重新排任务，而是在生成前确认“任务有没有地方落”。
              </p>
            </div>
            {missingTemplateScopeCount > 0 && onBackToScope ? (
              <Button type="button" variant="outline" size="sm" className="shrink-0 bg-white" onClick={onBackToScope}>
                返回范围体量补齐
              </Button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-emerald-50 px-3 py-2">
              <p className="text-xs text-emerald-700">可自动生成</p>
              <p className="mt-1 text-xl font-semibold text-emerald-950 tabular-nums">{scopeTemplateCoverage.summary.autoSchedulableCount}</p>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-700">生成后补充</p>
              <p className="mt-1 text-xl font-semibold text-amber-950 tabular-nums">{scopeTemplateCoverage.summary.manualTaskRequiredCount}</p>
            </div>
            <div className="rounded-lg bg-rose-50 px-3 py-2">
              <p className="text-xs text-rose-700">缺少空间</p>
              <p className="mt-1 text-xl font-semibold text-rose-950 tabular-nums">{scopeTemplateCoverage.summary.missingRequiredScopeCount}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
              <p className="text-sm font-semibold text-emerald-950">可以直接生成任务</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">任务会自动落到对应楼栋、地下室、楼层或专项空间。</p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-white px-3 py-2">
              <p className="text-sm font-semibold text-amber-950">可以先生成，后补专项任务</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">这些空间会保留为筛选范围，但当前没有自动任务包。</p>
            </div>
            <div className="rounded-lg border border-rose-100 bg-white px-3 py-2">
              <p className="text-sm font-semibold text-rose-950">需要先补齐空间</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">模板已要求该空间，未补齐前不能生成，避免任务挂错位置。</p>
            </div>
          </div>

          {scopeTemplateCoverage.items.length > 0 ? (
            <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
              {sortCoverageItems(scopeTemplateCoverage.items).map((item, index) => (
                <div key={`${item.status}-${item.scopeObjectId ?? item.scopeName}-${index}`} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${coverageStatusClass(item.status)}`}>
                      {coverageStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{item.action}</p>
                  {item.requiredByTemplates.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-400">涉及模板：{item.requiredByTemplates.join('、')}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              当前没有需要单独提示的空间挂接问题。
            </p>
          )}
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-1)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CompleteIcon className="h-4 w-4 text-blue-600" data-testid={wizardIconTestId('wizard_complete')} />
          范围闭合检查
        </div>
        {scopeCoverageDiagnostics.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {scopeCoverageDiagnostics.map((diagnostic) => (
              <div key={diagnostic.code} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p>{diagnostic.message}</p>
                {diagnostic.coverageRatio !== null && diagnostic.coverageRatio !== undefined ? (
                  <p className="mt-1 text-xs text-amber-900">
                    面积覆盖率 {formatRatio(diagnostic.coverageRatio)}；
                    项目面积 {formatNumber(diagnostic.expectedAreaM2, ' m²')}；
                    已计入 {formatNumber(diagnostic.accountedAreaM2, ' m²')}；
                    差额 {formatNumber(diagnostic.deltaAreaM2, ' m²')}
                  </p>
                ) : null}
                {diagnostic.nodeNames && diagnostic.nodeNames.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-900">涉及节点：{diagnostic.nodeNames.join('、')}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            已完成基础范围闭合检查，未发现明显重复范围、漏填面积或功能区误计入面积。
          </p>
        )}
      </section>

      {scopeWbsReadinessIssues.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <WarningIcon className="h-4 w-4 text-amber-700" data-testid={wizardIconTestId('warning')} />
                范围体量还不能生成 WBS
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                标准工序和专项工序需要明确挂到楼栋、地下室、楼层或独立工程区。以下空间缺少必要体量，系统暂不生成任务，避免模板挂错范围。
              </p>
            </div>
            {onBackToScope ? (
              <Button type="button" variant="outline" size="sm" className="shrink-0 bg-white" onClick={onBackToScope}>
                返回范围体量补齐
              </Button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2">
            {scopeWbsReadinessIssues.map((issue, index) => (
              <div key={`${issue.code}-${index}`} className="rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-950">
                <p className="font-semibold">{scopeReadinessTitle(issue)}</p>
                <p className="mt-1 leading-6 text-amber-900">{issue.message}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg bg-amber-50 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-950">影响</p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">{scopeReadinessImpact(issue)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-900">下一步</p>
                    <p className="mt-1 text-xs leading-5 text-slate-700">{scopeReadinessAction(issue)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {feasibility && targetOvershootValue !== null && targetOvershootValue > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <TargetIcon className="h-4 w-4 text-amber-700" data-testid={wizardIconTestId('schedule_target')} />
            目标工期偏紧
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            模板按正常施工组织预计 {feasibility.naturalEndDate} 完工，目标竣工为 {feasibility.targetEndDate}，
            晚于目标 {formatDurationMetric(feasibility.overshoot, { absolute: true })}。系统不会直接改写任务日期，会先形成可审阅的工期调整预案。
          </p>
          {proposal ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-slate-700">
                预案结论：{verdictText(proposal.verdict)}；预计追回 {formatDurationMetric(proposal.totalRecover, { absolute: true })}，剩余缺口 {formatDurationMetric(proposal.remainingGap, { absolute: true })}。
                {proposal.commitmentDisclaimer ? ` ${proposal.commitmentDisclaimer}` : ''}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {proposal.actions.map((action) => (
                  <div key={action.type} className="rounded-lg border border-amber-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">{actionTitle(action.type)}</p>
                    <p className="mt-1 text-xs text-slate-600">预计追回 {formatDurationMetric(action.recoverDuration)}</p>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">{action.explanation}</p>
                  </div>
                ))}
              </div>
              {proposal.protectedConstraints.length > 0 ? (
                <p className="text-xs leading-5 text-amber-900">
                  已保护 {proposal.protectedConstraints.length} 项不可随意压缩的工艺等待，如养护、检测报告、验收等待。
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : feasibility && targetOvershootValue === null ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <TargetIcon className="h-4 w-4" data-testid={wizardIconTestId('schedule_target')} />
            目标工期口径暂不可用
          </div>
          <p className="mt-1 leading-6">
            目标竣工为 {feasibility.targetEndDate}，自然排期为 {feasibility.naturalEndDate}；日历天口径不可用，当前不展示未经验证的偏移天数。
          </p>
        </section>
      ) : feasibility ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex items-center gap-2 font-semibold">
            <CompleteIcon className="h-4 w-4" data-testid={wizardIconTestId('wizard_complete')} />
            目标工期与模板自然排期基本匹配
          </div>
        </section>
      ) : null}

      {advisoryIssues.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <WarningIcon className="h-4 w-4 text-amber-600" data-testid={wizardIconTestId('warning')} />
            生成前建议确认
          </div>
          <div className="mt-3 grid gap-2">
            {advisoryIssues.map((issue, index) => (
              <div
                key={`${issue.code}-${index}`}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  issue.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-950'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <p className="font-semibold text-slate-950">{issue.title || issue.scopeName || issue.message}</p>
                {issue.title || issue.scopeName ? (
                  <p className="mt-1 leading-6">{issue.message}</p>
                ) : null}
                {issue.impact || issue.action ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {issue.impact ? (
                      <div className="rounded-lg bg-white/70 px-3 py-2">
                        <p className="text-xs font-semibold text-slate-900">影响</p>
                        <p className="mt-1 text-xs leading-5 text-slate-700">{issue.impact}</p>
                      </div>
                    ) : null}
                    {issue.action ? (
                      <div className="rounded-lg bg-white/70 px-3 py-2">
                        <p className="text-xs font-semibold text-slate-900">下一步</p>
                        <p className="mt-1 text-xs leading-5 text-slate-700">{issue.action}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={generating}
        >
          重新试算
        </Button>
        <Button type="button" onClick={onGenerate} disabled={generating || blocksGeneration} className="bg-blue-600 hover:bg-blue-700">
          {generating ? (
            <GeneratingIcon className="h-4 w-4 animate-spin" data-testid={wizardIconTestId('generating')} />
          ) : (
            <GenerationIcon className="h-4 w-4" data-testid={wizardIconTestId('generation')} />
          )}
          确认并生成任务
        </Button>
      </div>
    </div>
  )
}
