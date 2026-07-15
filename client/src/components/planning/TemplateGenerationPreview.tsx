import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { DurationSuggestionTooltip } from '@/components/planning/DurationSuggestionTooltip'
import {
  ConstructionOrganizationScenarioSummary,
  type ConstructionOrganizationUseCase,
} from '@/components/planning/ConstructionOrganizationScenarioSummary'
import { PlanItemKindBadge, PlanItemTagBadge } from '@/components/planning/PlanItemKindBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  PLAN_ITEM_KIND_OPTIONS,
  RELATION_ROLE_LABELS,
  ROW_PROJECTION_LABELS,
  ROW_PROJECTION_OPTIONS,
  getLinkedProjectionSourceFromMetadata,
  getPlanItemKindFromMetadata,
  getPlanItemKindLabel,
  getPlanItemTagsFromMetadata,
  getProgressModeFromMetadata,
  normalizeRowProjectionMode,
  type RowProjectionMode,
} from '@/lib/planItemSemantics'
import { cn } from '@/lib/utils'
import type {
  WbsAccelerationProposal,
  WbsConstructionOrganizationScenarioSummary,
  WbsGeneratedTemplateRow,
  WbsTemplateGeneratePreview,
  WbsTargetFeasibility,
} from '@/services/wbsTemplateGenerationApi'

export type TemplateDuplicatePolicy = 'skip' | 'overwrite' | 'duplicate'

const CATEGORY_LABELS: Record<string, string> = {
  division: '分部',
  sub_division: '子分部',
  item_work: '分项',
  process: '工序',
  activity_step: '作业步骤',
  custom: '自定义',
}

const DUPLICATE_POLICIES: Array<{ key: TemplateDuplicatePolicy; label: string; description: string }> = [
  { key: 'skip', label: '跳过', description: '已存在的工序不进入草稿' },
  { key: 'overwrite', label: '覆盖', description: '以模板字段覆盖同名行' },
  { key: 'duplicate', label: '允许重复', description: '保留重复行供人工整理' },
]

const DEPENDENCY_SOURCE_LABELS: Record<string, string> = {
  sibling_sequence: '同级顺序',
  dependency_intent_template: '跨分区引用',
}

const HIDDEN_DEPENDENCY_SOURCE_LABELS = new Set(['cross_item_workflow'])

const ROW_PROJECTION_ORDER = ROW_PROJECTION_OPTIONS.map((option) => option.value)

const ROW_PROJECTION_BADGE_CLASS: Record<RowProjectionMode, string> = {
  schedule_row: 'border-blue-200 bg-blue-50 text-blue-700',
  gate_marker: 'border-amber-200 bg-amber-50 text-amber-700',
  inline_control: 'border-slate-200 bg-slate-50 text-slate-600',
  linked_projection: 'border-slate-300 bg-slate-100 text-slate-600',
}

function getDependencyDisplaySource(dependency: { source?: string | null; relationRole?: string | null }) {
  if (dependency.relationRole) return RELATION_ROLE_LABELS[dependency.relationRole] ?? dependency.relationRole
  if (!dependency.source) return '来源未标注'
  if (HIDDEN_DEPENDENCY_SOURCE_LABELS.has(dependency.source)) return '流程'
  return DEPENDENCY_SOURCE_LABELS[dependency.source] ?? dependency.source
}

function getRowTitle(row: WbsGeneratedTemplateRow) {
  return String(row.values?.title ?? row.values?.name ?? '未命名工序')
}

function getRowType(row: WbsGeneratedTemplateRow) {
  return String(row.values?.wbs_node_type ?? row.values?.category_type ?? 'custom')
}

function getRowMetadata(row: WbsGeneratedTemplateRow) {
  const metadata = row.values?.standard_task_metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
}

function getRowProjectionMode(row: WbsGeneratedTemplateRow): RowProjectionMode {
  const metadata = getRowMetadata(row)
  return normalizeRowProjectionMode(row.rowProjectionMode)
    ?? normalizeRowProjectionMode(row.values?.row_projection_mode)
    ?? normalizeRowProjectionMode(metadata.rowProjectionMode)
    ?? normalizeRowProjectionMode(metadata.row_projection_mode)
    ?? 'schedule_row'
}

function getRowExecutionPhase(row: WbsGeneratedTemplateRow) {
  const metadata = getRowMetadata(row)
  return String(row.executionPhase ?? row.values?.execution_phase ?? metadata.executionPhase ?? '')
}

function getRowExecutionLane(row: WbsGeneratedTemplateRow) {
  const metadata = getRowMetadata(row)
  return String(row.executionLane ?? row.values?.execution_lane ?? metadata.executionLane ?? '')
}

function getRowExecutionSortKey(row: WbsGeneratedTemplateRow) {
  const metadata = getRowMetadata(row)
  const value = row.executionSortKey ?? row.values?.execution_sort_key ?? metadata.executionSortKey
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : row.sortOrder
}

function countRowsByProjection(rows: WbsGeneratedTemplateRow[]) {
  return rows.reduce<Record<RowProjectionMode, number>>((counts, row) => {
    counts[getRowProjectionMode(row)] += 1
    return counts
  }, {
    schedule_row: 0,
    gate_marker: 0,
    inline_control: 0,
    linked_projection: 0,
  })
}

function getRowPlanItemKind(row: WbsGeneratedTemplateRow) {
  const metadata = getRowMetadata(row)
  return row.planItemKind
    ?? getPlanItemKindFromMetadata(metadata, {
      isMilestone: Boolean(row.values?.is_milestone),
      relationRole: metadata.relationRole,
      packType: row.values?.pack_type,
    })
}

function getRowPlanItemTags(row: WbsGeneratedTemplateRow) {
  if (Array.isArray(row.planItemTags)) return row.planItemTags
  return getPlanItemTagsFromMetadata(getRowMetadata(row))
}

function getRowProgressMode(row: WbsGeneratedTemplateRow) {
  return row.progressMode ?? getProgressModeFromMetadata(getRowMetadata(row), getRowPlanItemKind(row) as any)
}

function getRowLinkedProjectionSource(row: WbsGeneratedTemplateRow) {
  return row.linkedProjectionSource ?? getLinkedProjectionSourceFromMetadata(getRowMetadata(row))
}

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'string' ? value.trim().length > 0 : value != null
}

function readPositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readNonNegativeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.ceil(parsed) : null
}

function readGovernedReferenceDuration(suggestion: Record<string, unknown> | null | undefined) {
  if (!suggestion) return null
  const outputCode = String(suggestion.durationOutputCode ?? '').trim()
  if (outputCode === 'contextual_reference') {
    return readPositiveNumber(suggestion.contextualReferenceDays)
  }
  if (outputCode === 'plan_reference') {
    return readPositiveNumber(suggestion.planReferenceDays)
  }
  if (outputCode === 'remaining_forecast') {
    return readPositiveNumber(suggestion.remainingForecastDays)
  }
  return null
}

function getRowReferenceDuration(row: WbsGeneratedTemplateRow) {
  return readGovernedReferenceDuration(row.durationSuggestion as Record<string, unknown> | null | undefined)
    ?? readGovernedReferenceDuration(row.values?.duration_suggestion as Record<string, unknown> | null | undefined)
}

function getRowDurationSuggestion(row: WbsGeneratedTemplateRow) {
  return row.durationSuggestion ?? row.values?.duration_suggestion ?? null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function findConstructionOrganizationScenario(rows: WbsGeneratedTemplateRow[]): WbsConstructionOrganizationScenarioSummary | null {
  for (const row of rows) {
    const metadata = getRowMetadata(row)
    const projectOrganization = asRecord(metadata.projectOrganization)
    const scenarioSelection = asRecord(projectOrganization?.scenarioSelection)
    if (scenarioSelection?.source === 'construction_organization_scenario_selector') {
      return scenarioSelection as WbsConstructionOrganizationScenarioSummary
    }
  }
  return null
}

function formatLagDays(lagDays: number | null | undefined) {
  const lag = Number(lagDays ?? 0) || 0
  if (lag === 0) return '+0'
  return lag > 0 ? `+${lag}` : String(lag)
}

function getAccelerationActionLabel(type: string) {
  if (type === 'fast_track') return '搭接优化'
  if (type === 'crashing') return '资源赶工'
  if (type === 'scope_reduction') return '范围/交付决策'
  return type
}

function getRiskLabel(riskLevel: string) {
  if (riskLevel === 'low') return '低风险'
  if (riskLevel === 'medium') return '中风险'
  if (riskLevel === 'high') return '高风险'
  return riskLevel
}

function CandidateNetworkEvaluationSummary({
  evaluation,
}: {
  evaluation: WbsTemplateGeneratePreview['candidateNetworkEvaluation']
}) {
  if (!evaluation) return null
  const spanDays = readPositiveNumber(evaluation.projectedNetworkSpanDays)
  const edgeCount = readNonNegativeNumber(evaluation.previewEdgeCount)
  const processConstraintRoutingCandidateEdgeCount = readNonNegativeNumber(evaluation.processConstraintRoutingCandidateEdgeCount)
  const unresolvedEdgeCount = readNonNegativeNumber(evaluation.unresolvedEdgeCount)
  const criticalRowCount = Array.isArray(evaluation.criticalGeneratedRowIds)
    ? evaluation.criticalGeneratedRowIds.length
    : 0
  const readOnlyBoundary = evaluation.writesTaskDependencies === false
    && evaluation.writesPlanDates === false
    && evaluation.writesCriticalPathFacts === false

  if (!spanDays && edgeCount === null && unresolvedEdgeCount === null && criticalRowCount === 0) return null

  return (
    <div data-testid="template-preview-candidate-cpm" className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-slate-900">候选关键路径</div>
        <div className="flex flex-wrap gap-1.5 tabular-nums">
          {spanDays ? (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">跨度 {spanDays} 天</Badge>
          ) : null}
          {edgeCount !== null ? (
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">依赖边 {edgeCount}</Badge>
          ) : null}
          {processConstraintRoutingCandidateEdgeCount && processConstraintRoutingCandidateEdgeCount > 0 ? (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">工艺穿插候选边 {processConstraintRoutingCandidateEdgeCount}</Badge>
          ) : null}
          {unresolvedEdgeCount !== null ? (
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">未解析 {unresolvedEdgeCount}</Badge>
          ) : null}
          {criticalRowCount > 0 ? (
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">关键行 {criticalRowCount}</Badge>
          ) : null}
        </div>
      </div>
      {readOnlyBoundary ? (
        <div className="mt-1 leading-5 text-slate-500">只读预览，不写任务依赖、计划日期或关键路径事实</div>
      ) : null}
    </div>
  )
}

function AccelerationProposalPreview({
  proposal,
  rowTitleById,
}: {
  proposal: WbsAccelerationProposal
  rowTitleById: Map<string, string>
}) {
  return (
    <div data-testid="target-acceleration-proposal" className="grid gap-3 rounded-lg border border-amber-200 bg-white px-3 py-3 text-xs text-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">赶工方案预览</div>
          <div className="mt-1 leading-5 text-slate-500">
            自然排期 {proposal.naturalEndDate}，目标 {proposal.targetEndDate}；这是草案预览，不自动修改任务日期。
          </div>
        </div>
        <div className="flex flex-wrap gap-2 tabular-nums">
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            预计可追回 {proposal.totalRecoverDays} 天
          </Badge>
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
            剩余缺口 {proposal.remainingGapDays} 天
          </Badge>
        </div>
      </div>

      <div className="grid gap-2">
        {proposal.actions.map((action) => (
          <div key={action.type} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-slate-800">{getAccelerationActionLabel(action.type)}</div>
              <div className="flex flex-wrap gap-1.5 tabular-nums">
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                  可追回 {action.recoverDays} 天
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                  {getRiskLabel(action.riskLevel)}
                </Badge>
              </div>
            </div>
            <p className="mt-1 leading-5 text-slate-500">{action.explanation}</p>

            {action.type === 'fast_track' && action.dependencyAdjustments.length > 0 ? (
              <div className="mt-2 grid gap-1">
                {action.dependencyAdjustments.slice(0, 3).map((adjustment) => (
                  <div key={`${adjustment.predecessorClientRowId}-${adjustment.successorClientRowId}`} className="flex flex-wrap gap-1.5 text-slate-500">
                    <span className="font-medium text-slate-700">{rowTitleById.get(adjustment.successorClientRowId) ?? adjustment.successorClientRowId}</span>
                    <span>{adjustment.fromDependencyType}{formatLagDays(adjustment.lagDaysBefore)} → {adjustment.toDependencyType}{formatLagDays(adjustment.lagDaysAfter)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {action.type === 'crashing' && action.durationAdjustments.length > 0 ? (
              <div className="mt-2 grid gap-1">
                {action.durationAdjustments.slice(0, 3).map((adjustment) => (
                  <div key={adjustment.clientRowId} className="flex flex-wrap gap-1.5 text-slate-500">
                    <span className="font-medium text-slate-700">{rowTitleById.get(adjustment.clientRowId) ?? adjustment.clientRowId}</span>
                    <span>{adjustment.currentDurationDays} 天 → {adjustment.proposedDurationDays} 天，下限 {adjustment.minDurationDays} 天</span>
                  </div>
                ))}
              </div>
            ) : null}

            {action.type === 'scope_reduction' && action.decisionOptions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {action.decisionOptions.slice(0, 4).map((option) => (
                  <Badge key={option} variant="outline" className="border-slate-200 bg-white text-slate-600">
                    {option}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="font-semibold text-slate-800">硬约束保护</div>
        {proposal.protectedConstraints.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {proposal.protectedConstraints.slice(0, 6).map((constraint) => (
              <Badge key={`${constraint.clientRowId}-${constraint.reasonCode}`} variant="outline" className="border-slate-200 bg-white text-slate-600">
                {constraint.title} {constraint.durationDays} 天
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-slate-500">未识别到可压缩草案中的养护、检测报告或法定验收等待；后续应用仍会二次校验。</p>
        )}
      </div>
    </div>
  )
}

export function summarizeTemplatePreviewWarnings(rows: WbsGeneratedTemplateRow[]) {
  return [
    {
      key: 'unit',
      label: '默认责任单位缺失',
      count: rows.filter((row) => !hasValue(row.values?.participant_unit_id)).length,
    },
    {
      key: 'condition',
      label: '开工条件未解析',
      count: rows.filter((row) => !hasValue(row.values?.condition_ids) && !hasValue(row.values?.conditions)).length,
    },
    {
      key: 'acceptance',
      label: '验收链接未解析',
      count: rows.filter((row) => !hasValue(row.values?.acceptance_requirement_ids) && !hasValue(row.values?.acceptance_links)).length,
    },
  ].filter((item) => item.count > 0)
}

export interface TemplateGenerationPreviewProps {
  rows: WbsGeneratedTemplateRow[]
  selectedRowIds: Set<string>
  duplicatePolicy: TemplateDuplicatePolicy
  onDuplicatePolicyChange: (policy: TemplateDuplicatePolicy) => void
  onToggleRow: (rowId: string, checked: boolean) => void
  onApply?: () => void
  applyLabel?: string
  showApplyButton?: boolean
  className?: string
  maxRows?: number
  rowLimitBehavior?: 'render_budget' | 'hard_limit'
  applyPending?: boolean
  rowLimitPolicy?: 'single_batch' | 'split_by_phase'
  targetFeasibility?: WbsTargetFeasibility | null
  candidateNetworkEvaluation?: WbsTemplateGeneratePreview['candidateNetworkEvaluation']
  constructionOrganizationUseCase?: ConstructionOrganizationUseCase
  onRequestAccelerationProposal?: () => void
  generationBatches?: Array<{
    batchId: string
    phaseObjectId: string | null
    rowCount: number
    rowLimit: number
    totalRowCount?: number
    rowProjectionCounts?: Partial<Record<RowProjectionMode, number>>
  }>
}

export function TemplateGenerationPreview({
  rows,
  selectedRowIds,
  duplicatePolicy,
  onDuplicatePolicyChange,
  onToggleRow,
  onApply,
  applyLabel = '加入草稿',
  showApplyButton = true,
  className,
  maxRows = 500,
  rowLimitBehavior = 'render_budget',
  applyPending = false,
  rowLimitPolicy,
  targetFeasibility,
  candidateNetworkEvaluation,
  constructionOrganizationUseCase,
  onRequestAccelerationProposal,
  generationBatches = [],
}: TemplateGenerationPreviewProps) {
  const selectedRows = useMemo(() => rows.filter((row) => selectedRowIds.has(row.clientRowId)), [rows, selectedRowIds])
  const orderedRows = useMemo(() => [...rows].sort((left, right) => getRowExecutionSortKey(left) - getRowExecutionSortKey(right)), [rows])
  const visibleOrderedRows = useMemo(() => orderedRows.slice(0, maxRows), [orderedRows, maxRows])
  const rowTitleById = useMemo(() => new Map(rows.map((row) => [row.clientRowId, getRowTitle(row)])), [rows])
  const [showAccelerationProposal, setShowAccelerationProposal] = useState(false)
  const projectionCounts = useMemo(() => countRowsByProjection(selectedRows), [selectedRows])
  const previewProjectionCounts = useMemo(() => countRowsByProjection(rows), [rows])
  const typeCounts = useMemo(() => (
    selectedRows.reduce<Record<string, number>>((counts, row) => {
      const type = getRowType(row)
      counts[type] = (counts[type] ?? 0) + 1
      return counts
    }, {})
  ), [selectedRows])
  const semanticCounts = useMemo(() => (
    selectedRows.reduce<Record<string, number>>((counts, row) => {
      const kind = getRowPlanItemKind(row)
      counts[kind] = (counts[kind] ?? 0) + 1
      return counts
    }, {})
  ), [selectedRows])
  const semanticSections = useMemo(() => {
    const grouped = visibleOrderedRows.reduce<Record<string, WbsGeneratedTemplateRow[]>>((groups, row) => {
      const kind = getRowPlanItemKind(row)
      groups[kind] = groups[kind] ?? []
      groups[kind].push(row)
      return groups
    }, {})
    return PLAN_ITEM_KIND_OPTIONS
      .map((option) => ({ kind: option.value, rows: grouped[option.value] ?? [] }))
      .filter((section) => section.rows.length > 0)
  }, [visibleOrderedRows])
  const constructionOrganizationScenario = useMemo(() => findConstructionOrganizationScenario(rows), [rows])
  const warnings = useMemo(() => summarizeTemplatePreviewWarnings(selectedRows), [selectedRows])
  const phaseSplitReady = rowLimitPolicy === 'split_by_phase'
    && generationBatches.length > 0
    && generationBatches.every((batch) => batch.rowCount <= (batch.rowLimit || maxRows))
  const rowLimitExceeded = previewProjectionCounts.schedule_row > maxRows
  const hardRowLimitExceeded = rowLimitBehavior === 'hard_limit' && rowLimitExceeded
  const hiddenPreviewRowCount = Math.max(orderedRows.length - visibleOrderedRows.length, 0)
  const canApply = selectedRows.length > 0 && !hardRowLimitExceeded && !applyPending
  const showTargetWarning = Boolean(targetFeasibility && targetFeasibility.overshootDays > 0)
  const accelerationProposal = targetFeasibility?.accelerationProposal ?? null

  return (
    <section
      data-testid="template-generation-preview"
      className={cn('grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">生成预览</div>
          <div className="mt-1 text-xs text-slate-500">
            已选择 {selectedRows.length} / {rows.length} 行；其中主计划行 {projectionCounts.schedule_row} 行，保存前仍可在草稿表格里继续调整。
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {ROW_PROJECTION_ORDER.map((mode) => (
            projectionCounts[mode] > 0 ? (
              <Badge key={mode} variant="outline" className={cn('bg-white', ROW_PROJECTION_BADGE_CLASS[mode])}>
                {ROW_PROJECTION_LABELS[mode]} {projectionCounts[mode]}
              </Badge>
            ) : null
          ))}
          {Object.entries(semanticCounts).map(([kind, count]) => (
            <PlanItemKindBadge key={kind} kind={kind} count={count} compact showDefault />
          ))}
          {Object.entries(typeCounts).map(([type, count]) => (
            <Badge key={type} variant="outline" className="bg-white">
              {CATEGORY_LABELS[type] ?? type} {count}
            </Badge>
          ))}
        </div>
      </div>

      <div data-testid="template-duplicate-policy" className="grid gap-2 rounded-lg border border-blue-100 bg-white p-3">
        <div className="text-xs font-medium text-slate-600">重复检测</div>
        <div className="flex flex-wrap gap-2">
          {DUPLICATE_POLICIES.map((policy) => (
            <Button unstyled
              key={policy.key}
              type="button"
              data-testid={`template-duplicate-policy-${policy.key}`}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                duplicatePolicy === policy.key
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
              onClick={() => onDuplicatePolicyChange(policy.key)}
            >
              <span className="block font-medium">{policy.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{policy.description}</span>
            </Button>
          ))}
        </div>
      </div>

      <ConstructionOrganizationScenarioSummary
        scenario={constructionOrganizationScenario}
        activeUseCase={constructionOrganizationUseCase}
      />

      {warnings.length > 0 ? (
        <div data-testid="template-preview-warning-list" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            字段缺失预警
          </div>
          <div className="flex flex-wrap gap-2">
            {warnings.map((warning) => (
              <Badge key={warning.key} variant="outline" className="border-amber-200 bg-white text-amber-800">
                {warning.label} {warning.count}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {showTargetWarning && targetFeasibility ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            目标工期偏紧
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="leading-5">
              自然排期预计 {targetFeasibility.naturalEndDate} 完工，超出目标 {targetFeasibility.overshootDays} 天；当前未自动压缩。
            </span>
            {onRequestAccelerationProposal || accelerationProposal ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-amber-300 bg-white px-2 text-xs text-amber-800 hover:bg-amber-100"
                onClick={() => {
                  if (accelerationProposal) {
                    setShowAccelerationProposal((current) => !current)
                    return
                  }
                  onRequestAccelerationProposal?.()
                }}
              >
                生成赶工建议
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showAccelerationProposal && accelerationProposal ? (
        <AccelerationProposalPreview proposal={accelerationProposal} rowTitleById={rowTitleById} />
      ) : null}

      <CandidateNetworkEvaluationSummary evaluation={candidateNetworkEvaluation} />

      {phaseSplitReady ? (
        <div data-testid="template-preview-phase-batch" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          已按 phase 自动拆分为 {generationBatches.length} 批，单批预算 {maxRows} 行；保存时按批次写入，避免大项目一次性渲染过重。
        </div>
      ) : null}

      {rowLimitExceeded ? (
        <div data-testid="template-preview-row-limit" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {hardRowLimitExceeded
            ? `本次下钻超过 ${maxRows} 条进度行，请缩小节点范围后再保存。`
            : `主计划行超过 ${maxRows} 行，首屏先渲染 ${maxRows} 行，剩余 ${hiddenPreviewRowCount} 行继续按批次加载；这是性能预算，不阻止生成。`}
        </div>
      ) : null}

      <ScrollArea className="max-h-64 rounded-lg border border-blue-100 bg-white">
        <div className="divide-y divide-slate-100">
          {semanticSections.map((section) => (
            <div key={section.kind} className="bg-white">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50/95 px-3 py-2 backdrop-blur">
                <PlanItemKindBadge kind={section.kind} count={section.rows.length} compact showDefault />
                <span className="text-xs text-slate-400">{getPlanItemKindLabel(section.kind)}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {section.rows.map((row) => {
                  const type = getRowType(row)
                  const checked = selectedRowIds.has(row.clientRowId)
                  const referenceDuration = getRowReferenceDuration(row)
                  const durationSuggestion = getRowDurationSuggestion(row)
                  const dependencies = row.predecessorDependencies ?? []
                  const planItemKind = getRowPlanItemKind(row)
                  const rowProjectionMode = getRowProjectionMode(row)
                  const executionPhase = getRowExecutionPhase(row)
                  const executionLane = getRowExecutionLane(row)
                  const planItemTags = getRowPlanItemTags(row)
                  const progressMode = getRowProgressMode(row)
                  const linkedProjectionSource = getRowLinkedProjectionSource(row)
                  return (
                    <label
                      key={row.clientRowId}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50',
                        rowProjectionMode !== 'schedule_row' && 'border-l-2',
                        rowProjectionMode === 'gate_marker' && 'border-l-amber-300 bg-amber-50/30',
                        rowProjectionMode === 'inline_control' && 'border-l-slate-200 bg-slate-50/40',
                        rowProjectionMode === 'linked_projection' && 'border-l-slate-400 bg-slate-50/70',
                        planItemKind === 'linked_projection' && 'bg-slate-50/70',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => onToggleRow(row.clientRowId, nextChecked === true)}
                        className="mt-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="block truncate text-sm font-medium text-slate-900">{getRowTitle(row)}</span>
                          <Badge variant="outline" className={cn('h-5 px-1.5 text-xs font-medium', ROW_PROJECTION_BADGE_CLASS[rowProjectionMode])}>
                            {ROW_PROJECTION_LABELS[rowProjectionMode]}
                          </Badge>
                          <PlanItemKindBadge kind={planItemKind} compact />
                          {planItemTags.map((tag) => <PlanItemTagBadge key={tag} tag={tag} />)}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{CATEGORY_LABELS[type] ?? type}</span>
                          {executionPhase ? <span>{executionPhase}{executionLane ? ` / ${executionLane}` : ''}</span> : null}
                          <span>{String(row.values?.planned_start_date ?? row.values?.start_date ?? '-')} - {String(row.values?.planned_end_date ?? row.values?.end_date ?? '-')}</span>
                          <span>{progressMode}</span>
                          {referenceDuration && durationSuggestion ? (
                            <DurationSuggestionTooltip
                              compact
                              suggestion={{
                                ...durationSuggestion,
                                sampleSize: null,
                                sourceBreakdown: null,
                              }}
                              />
                          ) : null}
                          {dependencies.length ? <span>前置 {dependencies.length}</span> : null}
                          {linkedProjectionSource ? (
                            <span className="text-slate-400">联动: {linkedProjectionSource.sourceLabel || linkedProjectionSource.sourceType}</span>
                          ) : null}
                        </span>
                        {dependencies.length ? (
                          <span className="mt-1 grid gap-1">
                            {dependencies.slice(0, 3).map((dependency) => {
                              const source = getDependencyDisplaySource(dependency)
                              return (
                                <span key={`${dependency.clientRowId}-${dependency.dependencyType}-${dependency.lagDays}-${dependency.intentCode ?? ''}`} className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                  <Badge variant="outline" className="h-5 border-slate-200 bg-slate-50 px-1.5 text-xs font-medium text-slate-600">
                                    {dependency.dependencyType}{formatLagDays(dependency.lagDays)}
                                  </Badge>
                                  <span className="max-w-[220px] truncate">{rowTitleById.get(dependency.clientRowId) ?? dependency.clientRowId}</span>
                                  <span className="text-slate-400">来源: {source}</span>
                                </span>
                              )
                            })}
                            {dependencies.length > 3 ? (
                              <span className="text-xs text-slate-400">另有 {dependencies.length - 3} 条前置关系</span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs tabular-nums text-slate-400">{row.sortOrder + 1}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {showApplyButton ? (
        <div className="flex justify-end">
          <Button type="button" onClick={onApply} disabled={!canApply} loading={applyPending}>
            {applyLabel}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

export default TemplateGenerationPreview
