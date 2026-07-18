import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, RefreshCw, Send, ShieldCheck, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getApiErrorMessage } from '@/lib/apiClient'
import {
  canUseV14231ActionableSurfaceAsStableAction,
  fetchV14231ActionableSurface,
  type V14231ActionableSurface,
} from '@/services/v14231ReadinessApi'
import {
  getRuleAssetOperationSurfaceKey,
  RULE_ASSET_ACTION_SURFACE_KEYS,
} from '@/services/v14231PageActionReadiness'
import {
  type ConstructionOrganizationPlanNetworkDraft,
  type ConstructionOrganizationPlanNetworkDraftReport,
  executeRuleAssetGovernanceWorkbenchOperation,
  getConstructionOrganizationPlanNetworkDrafts,
  getRuleAssetGovernanceWorkbenchReadiness,
  getStructuredCauseQualityMetrics,
  type RuleAssetGovernanceWorkbenchAssetType,
  type RuleAssetGovernanceWorkbenchGate,
  type RuleAssetGovernanceWorkbenchOperationAction,
  type RuleAssetGovernanceWorkbenchOperationResult,
  type RuleAssetGovernanceWorkbenchReadiness,
  type StructuredCauseQualityMetrics,
} from '@/services/ruleAssetGovernanceWorkbenchApi'

const RULE_ASSET_ACTION_SURFACE_KEYS_TO_LOAD = Object.values(RULE_ASSET_ACTION_SURFACE_KEYS)
const CONSTRUCTION_ORGANIZATION_ASSET_TYPE = 'construction_organization_plan_network' as const

const GATE_LABELS: Record<string, string> = {
  asset_inventory_diagnostics: '资产台账',
  admission_automation: '自动发现准入',
  admission_governance_defaults: '四元默认治理',
  backend_operations_workbench: '后端工作台',
  company_governance_evidence: '公司治理证据',
  frontend_admin_operations_page: '前端治理页',
  runtime_asset_isolation_matrix: '运行期隔离矩阵',
  parameter_runtime_consumers: '参数消费者',
  metric_source_coverage: '指标源覆盖',
  metric_production_snapshot_publication_rollback_matrix: '指标闭环矩阵',
  future_asset_rediscovery_gate_rerun_matrix: '未来资产重跑门禁',
  operable_governance_frontend_matrix: '可操作前端矩阵',
  construction_organization_precision_replay_matrix: '施工组织精度回放',
  construction_organization_product_outcome_closeout_matrix: '施工组织结果闭口',
}

type OperationFormState = {
  action: RuleAssetGovernanceWorkbenchOperationAction
  assetType: RuleAssetGovernanceWorkbenchAssetType
  evidenceToken: string
  workPackageKey: string
  useCase: string
  evidenceAction: string
  businessType: string
  companyId: string
  projectId: string
  requestedByUserId: string
  executedAt: string
  domainWriterKey: string
  sourcePublicationKey: string
  optionId: string
  draftNetworkKey: string
  releaseRecordTarget: string
  rollbackTarget: string
  rollbackReason: string
  engineCode: string
  predictedDurationDays: string
  actualDurationDays: string
  overlayKey: string
  baselineKey: string
  segmentKey: string
  consumerVerificationRefs: string
  impactMonitoringRefs: string
  rollbackWriterRefs: string
  selectedScenarioIds: string
  manualConflictReviewDecision: 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment' | ''
}

const DEFAULT_OPERATION_FORM: OperationFormState = {
  action: 'release_exit_handoff',
  assetType: 'learnable_parameter',
  evidenceToken: '',
  workPackageKey: '',
  useCase: '',
  evidenceAction: '',
  businessType: '',
  companyId: '',
  projectId: '',
  requestedByUserId: '',
  executedAt: '',
  domainWriterKey: '',
  sourcePublicationKey: '',
  optionId: '',
  draftNetworkKey: '',
  releaseRecordTarget: '',
  rollbackTarget: '',
  rollbackReason: '',
  engineCode: '',
  predictedDurationDays: '',
  actualDurationDays: '',
  overlayKey: '',
  baselineKey: '',
  segmentKey: '',
  consumerVerificationRefs: '',
  impactMonitoringRefs: '',
  rollbackWriterRefs: '',
  selectedScenarioIds: '',
  manualConflictReviewDecision: '',
}

function shouldRefreshConstructionOrganizationEvidence(
  result: RuleAssetGovernanceWorkbenchOperationResult,
) {
  return result.status === 'operation_delegated'
    && result.assetType === 'construction_organization_plan_network'
}

function formatNumber(value: number) {
  return value.toLocaleString('zh-CN')
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function statusVariant(status: RuleAssetGovernanceWorkbenchGate['status']): 'default' | 'secondary' {
  return status === 'ready' ? 'default' : 'secondary'
}

function statusLabel(status: RuleAssetGovernanceWorkbenchGate['status']) {
  return status === 'ready' ? '已具备证据' : '仍需处理'
}

function compactList(values: string[], limit = 3) {
  if (values.length === 0) return '-'
  return values.slice(0, limit).join('；')
}

function compactEdgeList(edges: ConstructionOrganizationPlanNetworkDraft['edges'], limit = 3) {
  if (edges.length === 0) return '-'
  return edges.slice(0, limit)
    .map((edge) => `${edge.fromVirtualNodeId ?? edge.fromGeneratedRowId} -> ${edge.toVirtualNodeId ?? edge.toGeneratedRowId} ${edge.dependencyType}${edge.lagDays ? `+${edge.lagDays}` : ''}`)
    .join('；')
}

function compactDateWindow(window: ConstructionOrganizationPlanNetworkDraft['manualConflictReviewPackage']['sampleConflictEvidence'][number]['fromWindow']) {
  const plannedStart = window.plannedStartDate ?? (window.startDay == null ? null : `D+${window.startDay}`)
  const plannedEnd = window.plannedEndDate ?? (window.finishDay == null ? null : `D+${window.finishDay}`)
  if (!plannedStart && !plannedEnd) return '-'
  return `${plannedStart ?? '-'}~${plannedEnd ?? '-'}`
}

function compactConflictEvidenceList(
  evidence: ConstructionOrganizationPlanNetworkDraft['manualConflictReviewPackage']['sampleConflictEvidence'],
  limit = 2,
) {
  if (evidence.length === 0) return null
  return evidence.slice(0, limit).map((item) => (
    <div key={`${item.edgeId}-${item.fromGeneratedRowId}-${item.toGeneratedRowId}`} className="space-y-0.5">
      <div>
        {item.fromGeneratedRowId} -&gt; {item.toGeneratedRowId} {item.dependencyType}{item.lagDays ? `+${item.lagDays}` : ''}
      </div>
      <div>
        前置 {compactDateWindow(item.fromWindow)} / 后续 {compactDateWindow(item.toWindow)}
      </div>
      <div>{item.reason}</div>
    </div>
  ))
}

function detailNumber(details: Record<string, unknown>, key: string) {
  const value = Number(details[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}

function detailStringArray(details: Record<string, unknown>, key: string) {
  const value = details[key]
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

function detailRecordArray(details: Record<string, unknown>, key: string) {
  const value = details[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

function detailRecord(details: Record<string, unknown>, key: string) {
  const value = details[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function productOutcomeMissingBusinessTypes(gate: RuleAssetGovernanceWorkbenchGate) {
  const detailRows = gate.details ? detailRecordArray(gate.details, 'businessTypeRows') : []
  const missingFromRows = detailRows
    .filter((row) => (
      row.status !== 'product_outcome_closeout_ready'
      || row.hasRuntimeCloseoutClaim === false
      || detailStringArray(row, 'missingReasons').length > 0
    ))
    .map((row) => String(row.businessType ?? '').trim())
    .filter(Boolean)
  if (missingFromRows.length > 0) return Array.from(new Set(missingFromRows))

  const detailReasons = gate.details ? detailStringArray(gate.details, 'missingReasons') : []
  const reasons = detailReasons.length > 0 ? detailReasons : gate.missingReasons
  return Array.from(new Set(reasons
    .map((reason) => reason.split(':')[0]?.trim())
    .filter(Boolean)))
}

function productOutcomeReadyBusinessTypes(gate: RuleAssetGovernanceWorkbenchGate) {
  const detailRows = gate.details ? detailRecordArray(gate.details, 'businessTypeRows') : []
  return Array.from(new Set(detailRows
    .filter((row) => (
      row.status === 'product_outcome_closeout_ready'
      && row.hasRuntimeCloseoutClaim !== false
      && row.hasRequiredRuntimeReadyOptionCloseoutClaimCoverage !== false
      && row.hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage !== false
      && detailStringArray(row, 'missingReasons').length === 0
    ))
    .map((row) => String(row.businessType ?? '').trim())
    .filter(Boolean)))
}

const PRODUCT_OUTCOME_ACTION_LABELS: Record<string, string> = {
  run_precision_replay_for_business_type: '补跑精度回放',
  resolve_precision_replay_for_business_type: '修复精度回放',
  collect_runtime_closeout_claim_for_business_type: '收集运行闭口证据',
  link_release_exit_handoff_for_business_type: '关联发布出口交接',
  link_runtime_publication_for_business_type: '关联运行发布',
  record_runtime_consumer_observation_for_business_type: '记录消费观察',
  record_impact_monitoring_for_business_type: '记录影响监测',
  record_rollback_evidence_for_business_type: '记录回滚证据',
  record_saved_network_outcome_for_business_type: '记录保存结果',
  record_E1_E3_E5_runtime_accuracy_for_business_type: '补齐 E1/E3/E5 运行证据',
  collect_runtime_ready_use_case_option_evidence_for_business_type: '补齐入口 A/B/C 运行证据',
  collect_runtime_ready_option_closeout_claim_evidence_for_business_type: '补齐 A/B/C 采纳闭口证据',
  collect_runtime_ready_use_case_option_closeout_claim_evidence_for_business_type: '补齐入口 A/B/C 采纳闭口证据',
  record_site_adoption_for_business_type: '记录现场采纳',
  resolve_runtime_business_type_attribution_for_business_type: '补齐业态归因',
  resolve_runtime_business_type_conflict_for_business_type: '处理业态冲突',
  resolve_product_outcome_closeout_evidence_for_business_type: '补齐闭口证据',
}

const PRODUCT_OUTCOME_PROJECTION_ONLY_EVIDENCE_ACTIONS = new Set([
  'collect_runtime_closeout_claim_for_business_type',
  'collect_runtime_ready_option_closeout_claim_evidence_for_business_type',
  'collect_runtime_ready_use_case_option_closeout_claim_evidence_for_business_type',
  'resolve_runtime_business_type_attribution_for_business_type',
  'resolve_runtime_business_type_conflict_for_business_type',
])

function isProductOutcomeControlledOperation(operation: Record<string, unknown>) {
  const evidenceAction = String(operation.evidenceAction ?? '').trim()
  const operationAction = String(operation.operationAction ?? '').trim()
  if (!operationAction) return false
  if (PRODUCT_OUTCOME_PROJECTION_ONLY_EVIDENCE_ACTIONS.has(evidenceAction)) return false
  if (operationAction === 'runtime_recommendation_adopt' && evidenceAction !== 'record_site_adoption_for_business_type') {
    return false
  }
  return true
}

const PRODUCT_OUTCOME_OPERATION_WRITER_KEYS: Partial<Record<RuleAssetGovernanceWorkbenchOperationAction, string>> = {
  runtime_consumer_observation: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
  runtime_saved_outcome: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
  runtime_engine_evidence: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
  runtime_recommendation_adopt: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
  runtime_impact_monitoring: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
  runtime_rollback_execution: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
}

const PRODUCT_OUTCOME_RUNTIME_ENGINE_OPTIONS = [
  { label: 'E1', engineCode: 'standard_duration_reference' },
  { label: 'E3', engineCode: 'critical_path_cpm' },
  { label: 'E5', engineCode: 'schedule_acceleration_target' },
] as const

function productOutcomeNextEvidenceActionLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const detailRows = gate.details ? detailRecordArray(gate.details, 'businessTypeRows') : []
  const rowActions = detailRows
    .flatMap((row) => detailStringArray(row, 'nextEvidenceActions'))
  const workItemActions = gate.details
    ? detailRecordArray(gate.details, 'nextEvidenceWorkItems')
      .flatMap((item) => detailStringArray(item, 'nextEvidenceActions'))
    : []
  const detailActions = gate.details ? detailStringArray(gate.details, 'nextEvidenceActions') : []
  const actions = [
    ...rowActions,
    ...workItemActions,
    ...detailActions,
  ]
  return Array.from(new Set(actions
    .map((action) => PRODUCT_OUTCOME_ACTION_LABELS[action] ?? action)
    .filter(Boolean)))
}

function productOutcomeNextEvidenceOperationLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const detailRows = gate.details ? detailRecordArray(gate.details, 'businessTypeRows') : []
  const rowOperations = detailRows
    .flatMap((row) => detailRecordArray(row, 'nextEvidenceOperations'))
  const workItemOperations = gate.details
    ? detailRecordArray(gate.details, 'nextEvidenceWorkItems')
      .flatMap((item) => detailRecordArray(item, 'nextEvidenceOperations'))
    : []
  const detailOperations = gate.details ? detailRecordArray(gate.details, 'nextEvidenceOperations') : []
  const operations = [
    ...rowOperations,
    ...workItemOperations,
    ...detailOperations,
  ].filter(isProductOutcomeControlledOperation)
  return Array.from(new Set(operations
    .map((operation) => {
      const operationAction = String(operation.operationAction ?? '').trim()
      if (!operationAction) return ''
      const businessType = String(operation.businessType ?? '').trim()
      return businessType ? `${businessType}/${operationAction}` : operationAction
    })
    .filter(Boolean)))
}

function productOutcomeWorkbenchOperationSuggestionReport(gate: RuleAssetGovernanceWorkbenchGate) {
  return gate.details ? detailRecord(gate.details, 'workbenchOperationSuggestionReport') : null
}

function productOutcomeWorkbenchOperationSuggestions(gate: RuleAssetGovernanceWorkbenchGate) {
  const report = productOutcomeWorkbenchOperationSuggestionReport(gate)
  return report ? detailRecordArray(report, 'suggestions') : []
}

function productOutcomeSuggestionLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const report = productOutcomeWorkbenchOperationSuggestionReport(gate)
  if (!report) return []
  const status = String(report.status ?? '').trim()
  const suggestionCount = readNonNegativeNumber(report, 'suggestionCount')
  const submittableCount = readNonNegativeNumber(report, 'submittableSuggestionCount')
  const blockedCount = readNonNegativeNumber(report, 'blockedSuggestionCount')
  return [
    `${status || 'unknown'} ${formatNumber(submittableCount)}/${formatNumber(suggestionCount)} 可提交 阻断 ${formatNumber(blockedCount)}`,
  ]
}

function productOutcomeEvidenceProjectLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const detailRows = gate.details ? detailRecordArray(gate.details, 'businessTypeRows') : []
  return Array.from(new Set(detailRows.flatMap((row) => {
    const businessType = String(row.businessType ?? '').trim()
    return detailStringArray(row, 'runtimeEvidenceProjectIds')
      .map((projectId) => businessType ? `${businessType}/${projectId}` : projectId)
  }).filter(Boolean)))
}

function productOutcomeNextEvidenceWorkItemLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const workItems = gate.details ? detailRecordArray(gate.details, 'nextEvidenceWorkItems') : []
  return Array.from(new Set(workItems.map((item) => {
    const businessType = String(item.businessType ?? '').trim()
    const projectIds = detailStringArray(item, 'runtimeEvidenceProjectIds')
    const projectId = projectIds[0] ?? '待定项目'
    return businessType ? `${businessType}/${projectId}` : projectId
  }).filter(Boolean)))
}

function productOutcomePublicationKeyLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const workItems = gate.details ? detailRecordArray(gate.details, 'nextEvidenceWorkItems') : []
  const workItemLabels = workItems.flatMap((item) => {
    const businessType = String(item.businessType ?? '').trim()
    return detailStringArray(item, 'runtimeEvidencePublicationKeys')
      .map((publicationKey) => businessType ? `${businessType}/${publicationKey}` : publicationKey)
  })
  if (workItemLabels.length > 0) return Array.from(new Set(workItemLabels.filter(Boolean)))

  const detailRows = gate.details ? detailRecordArray(gate.details, 'businessTypeRows') : []
  return Array.from(new Set(detailRows.flatMap((row) => {
    const businessType = String(row.businessType ?? '').trim()
    return detailStringArray(row, 'runtimeEvidencePublicationKeys')
      .map((publicationKey) => businessType ? `${businessType}/${publicationKey}` : publicationKey)
  }).filter(Boolean)))
}

function readNonNegativeNumber(record: Record<string, unknown>, key: string) {
  const parsed = Number(record[key])
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0
}

function readDeficitRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function productOutcomeNetworkDeficitLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const detailRows = gate.details ? detailRecordArray(gate.details, 'businessTypeRows') : []
  return detailRows.map((row) => {
    const businessType = String(row.businessType ?? '').trim()
    const optionDeficit = readNonNegativeNumber(row, 'runtimeEvidenceOptionDeficit')
    const readyDeficit = readNonNegativeNumber(row, 'runtimeEvidenceRuntimeReadyOptionDeficit')
    const closeoutDeficit = readNonNegativeNumber(row, 'runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit')
    if (!businessType || (optionDeficit + readyDeficit + closeoutDeficit) === 0) return ''
    return `${businessType}: 运行网络缺 ${formatNumber(optionDeficit)}，运行就绪缺 ${formatNumber(readyDeficit)}，采纳闭口缺 ${formatNumber(closeoutDeficit)}`
  }).filter(Boolean)
}

const PRODUCT_OUTCOME_USE_CASE_LABELS: Record<string, string> = {
  newProjectPlanning: '新建项目',
  startingLineOnboarding: '起跑线',
  accelerationRecovery: '赶工恢复',
}

function productOutcomeUseCaseDeficitLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const detailRows = gate.details ? detailRecordArray(gate.details, 'businessTypeRows') : []
  return detailRows.map((row) => {
    const businessType = String(row.businessType ?? '').trim()
    const optionDeficits = readDeficitRecord(row, 'runtimeReadyUseCaseOptionDeficits')
    const closeoutDeficits = readDeficitRecord(row, 'runtimeReadyUseCaseOptionCloseoutClaimDeficits')
    const entries = Object.entries(PRODUCT_OUTCOME_USE_CASE_LABELS).map(([useCase, label]) => {
      const optionDeficit = readNonNegativeNumber(optionDeficits, useCase)
      const closeoutDeficit = readNonNegativeNumber(closeoutDeficits, useCase)
      return (optionDeficit + closeoutDeficit) > 0
        ? `${label}缺 ${formatNumber(optionDeficit)}/采纳缺 ${formatNumber(closeoutDeficit)}`
        : ''
    }).filter(Boolean)
    if (!businessType || entries.length === 0) return ''
    return `${businessType}: ${entries.join('，')}`
  }).filter(Boolean)
}

function productOutcomeExecutionPlanLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const planItems = gate.details ? detailRecordArray(gate.details, 'nextEvidenceExecutionPlan') : []
  return Array.from(new Set(planItems.map((item) => {
    const businessType = String(item.businessType ?? '').trim()
    const useCase = String(item.useCase ?? '').trim()
    const evidenceAction = String(item.evidenceAction ?? '').trim()
    const deficit = readNonNegativeNumber(item, 'deficit')
    if (!businessType || !evidenceAction || deficit <= 0) return ''
    const useCaseLabel = PRODUCT_OUTCOME_USE_CASE_LABELS[useCase] ?? (useCase || '通用')
    const actionLabel = PRODUCT_OUTCOME_ACTION_LABELS[evidenceAction] ?? evidenceAction
    return `${businessType}/${useCaseLabel}/${actionLabel} 缺 ${formatNumber(deficit)}`
  }).filter(Boolean)))
}

function productOutcomeEvidenceWorkPackageLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const packages = gate.details ? detailRecordArray(gate.details, 'nextEvidenceWorkPackages') : []
  return Array.from(new Set(packages.map((item) => {
    const businessType = String(item.businessType ?? '').trim()
    const status = String(item.status ?? '').trim()
    const totalDeficit = readNonNegativeNumber(item, 'totalDeficit')
    const packageKey = String(item.workPackageKey ?? '').trim()
    if (!businessType || totalDeficit <= 0) return ''
    const suffix = status ? `/${status}` : ''
    return `${businessType}/证据工作包缺 ${formatNumber(totalDeficit)}${suffix}${packageKey ? `/${packageKey}` : ''}`
  }).filter(Boolean)))
}

function productOutcomeEvidenceWorkPackageStepLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const packages = gate.details ? detailRecordArray(gate.details, 'nextEvidenceWorkPackages') : []
  return Array.from(new Set(packages.flatMap((item) => {
    const businessType = String(item.businessType ?? '').trim()
    return detailRecordArray(item, 'executionSteps').map((step) => {
      const useCase = String(step.useCase ?? '').trim()
      const operationAction = String(step.operationAction ?? '').trim()
      const deficit = readNonNegativeNumber(step, 'deficit')
      if (!businessType || !operationAction || deficit <= 0) return ''
      const useCaseLabel = PRODUCT_OUTCOME_USE_CASE_LABELS[useCase] ?? (useCase || '通用')
      return `${businessType}/${useCaseLabel}/${operationAction} 缺 ${formatNumber(deficit)}`
    })
  }).filter(Boolean)))
}

function productOutcomeEvidenceWorkPackageReadinessLabels(gate: RuleAssetGovernanceWorkbenchGate) {
  const packages = gate.details ? detailRecordArray(gate.details, 'nextEvidenceWorkPackages') : []
  return Array.from(new Set(packages.map((item) => {
    const businessType = String(item.businessType ?? '').trim()
    const prefillable = readNonNegativeNumber(item, 'prefillableExecutionStepCount')
    const blocked = readNonNegativeNumber(item, 'blockedExecutionStepCount')
    const status = String(item.executionReadinessStatus ?? '').trim()
    const missingAnchors = detailStringArray(item, 'missingRuntimeAnchorReasons')
    if (!businessType || !status) return ''
    const missingText = missingAnchors.length > 0 ? `/缺锚点 ${missingAnchors.join(',')}` : ''
    return `${businessType}/可预填 ${formatNumber(prefillable)}/阻断 ${formatNumber(blocked)}/${status}${missingText}`
  }).filter(Boolean)))
}

function productOutcomeNextEvidenceWorkItems(gate: RuleAssetGovernanceWorkbenchGate) {
  return gate.details ? detailRecordArray(gate.details, 'nextEvidenceWorkItems') : []
}

function productOutcomeEvidenceWorkPackages(gate: RuleAssetGovernanceWorkbenchGate) {
  return gate.details ? detailRecordArray(gate.details, 'nextEvidenceWorkPackages') : []
}

function productOutcomeExecutionPlanItems(gate: RuleAssetGovernanceWorkbenchGate) {
  return gate.details ? detailRecordArray(gate.details, 'nextEvidenceExecutionPlan') : []
}

function findProductOutcomeWorkItemForPlan(
  workItems: Record<string, unknown>[],
  planItem: Record<string, unknown>,
) {
  const businessType = String(planItem.businessType ?? '').trim()
  return workItems.find((item) => String(item.businessType ?? '').trim() === businessType)
}

function productOutcomeExecutionPlanButtonOptions(planItem: Record<string, unknown>) {
  const operationAction = String(planItem.operationAction ?? '').trim()
  if (operationAction === 'runtime_engine_evidence') return PRODUCT_OUTCOME_RUNTIME_ENGINE_OPTIONS
  return [{ label: '', engineCode: '' }] as const
}

function firstDetailString(record: Record<string, unknown>, key: string) {
  return detailStringArray(record, key)[0] ?? ''
}

function formatBusinessTypes(label: string, types: string[], limit = 5) {
  if (types.length === 0) return ''
  const visible = types.slice(0, limit).join('、')
  const remaining = types.length > limit ? ` 等 ${formatNumber(types.length)} 个` : ''
  return `；${label} ${visible}${remaining}`
}

function formatEvidenceActions(label: string, actions: string[], limit = 3) {
  if (actions.length === 0) return ''
  const visible = actions.slice(0, limit).join('、')
  const remaining = actions.length > limit ? ` 等 ${formatNumber(actions.length)} 项` : ''
  return `；${label} ${visible}${remaining}`
}

function gateDetailLine(gate: RuleAssetGovernanceWorkbenchGate) {
  const details = gate.details
  if (!details) return null
  if (details.source === 'construction_organization_product_outcome_closeout_gate_detail') {
    const ready = detailNumber(details, 'runtimeOutcomeReadyBusinessTypeCount')
    const supported = detailNumber(details, 'supportedBusinessTypeCount')
    const status = String(details.status ?? '')
    return `结果闭口 ${formatNumber(ready)}/${formatNumber(supported)} 业态${formatBusinessTypes('已闭口业态', productOutcomeReadyBusinessTypes(gate))}${formatBusinessTypes('缺口业态', productOutcomeMissingBusinessTypes(gate))}${formatEvidenceActions('下一步补证', productOutcomeNextEvidenceActionLabels(gate))}${formatEvidenceActions('受控操作', productOutcomeNextEvidenceOperationLabels(gate))}${formatEvidenceActions('证据项目', productOutcomeEvidenceProjectLabels(gate))}${formatEvidenceActions('补证清单', productOutcomeNextEvidenceWorkItemLabels(gate))}${formatEvidenceActions('发布锚点', productOutcomePublicationKeyLabels(gate))}${formatEvidenceActions('A/B/C 缺口', productOutcomeNetworkDeficitLabels(gate))}${formatEvidenceActions('入口缺口', productOutcomeUseCaseDeficitLabels(gate))}${formatEvidenceActions('执行队列', productOutcomeExecutionPlanLabels(gate))}${formatEvidenceActions('证据工作包', productOutcomeEvidenceWorkPackageLabels(gate))}${formatEvidenceActions('包内步骤', productOutcomeEvidenceWorkPackageStepLabels(gate))}${formatEvidenceActions('包执行状态', productOutcomeEvidenceWorkPackageReadinessLabels(gate))}${formatEvidenceActions('建议桥', productOutcomeSuggestionLabels(gate))}；${status}`
  }
  if (details.source !== 'construction_organization_precision_replay_gate_detail') return null
  const verified = detailNumber(details, 'verifiedUseCaseProofCount')
  const total = detailNumber(details, 'totalUseCaseProofCount')
  const replayed = detailNumber(details, 'replayedBusinessTypeCount')
  const supported = detailNumber(details, 'supportedBusinessTypeCount')
  const status = String(details.automaticOptionSelectionStatus ?? '')
  return `自动择优 ${formatNumber(verified)}/${formatNumber(total)}；${formatNumber(replayed)}/${formatNumber(supported)} 业态；${status}`
}

function splitRefs(value: string) {
  return value
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinRefs(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean).join('\n')
    : ''
}

function optionalText(value: string) {
  const text = value.trim()
  return text || undefined
}

function optionalPositiveNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : undefined
}

function optionalNullableText(value: unknown) {
  return value == null ? '' : String(value)
}

function operationPayloadToForm(
  payload: Record<string, unknown>,
  current: OperationFormState,
): OperationFormState {
  return {
    ...current,
    action: String(payload.action ?? current.action).trim() as RuleAssetGovernanceWorkbenchOperationAction,
    assetType: String(payload.assetType ?? current.assetType).trim() as RuleAssetGovernanceWorkbenchAssetType,
    evidenceToken: optionalNullableText(payload.evidenceToken),
    workPackageKey: optionalNullableText(payload.workPackageKey),
    useCase: optionalNullableText(payload.useCase),
    evidenceAction: optionalNullableText(payload.evidenceAction),
    businessType: optionalNullableText(payload.businessType),
    companyId: optionalNullableText(payload.companyId),
    projectId: optionalNullableText(payload.projectId),
    requestedByUserId: optionalNullableText(payload.requestedByUserId),
    executedAt: optionalNullableText(payload.executedAt),
    domainWriterKey: optionalNullableText(payload.domainWriterKey),
    sourcePublicationKey: optionalNullableText(payload.sourcePublicationKey),
    optionId: optionalNullableText(payload.optionId),
    draftNetworkKey: optionalNullableText(payload.draftNetworkKey),
    releaseRecordTarget: optionalNullableText(payload.releaseRecordTarget),
    rollbackTarget: optionalNullableText(payload.rollbackTarget),
    rollbackReason: optionalNullableText(payload.rollbackReason),
    engineCode: optionalNullableText(payload.engineCode),
    predictedDurationDays: optionalNullableText(payload.predictedDurationDays),
    actualDurationDays: optionalNullableText(payload.actualDurationDays),
    overlayKey: optionalNullableText(payload.overlayKey),
    baselineKey: optionalNullableText(payload.baselineKey),
    segmentKey: optionalNullableText(payload.segmentKey),
    consumerVerificationRefs: joinRefs(payload.consumerVerificationRefs),
    impactMonitoringRefs: joinRefs(payload.impactMonitoringRefs),
    rollbackWriterRefs: joinRefs(payload.rollbackWriterRefs),
    selectedScenarioIds: joinRefs(payload.selectedScenarioIds),
    manualConflictReviewDecision: optionalNullableText(payload.manualConflictReviewDecision) as OperationFormState['manualConflictReviewDecision'],
  }
}

function readPositiveNumberFromRecord(record: Record<string, unknown> | null | undefined, key: string) {
  const parsed = Number(record?.[key])
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function draftCanBeSentToManualReview(draft: ConstructionOrganizationPlanNetworkDraft) {
  return draft.readiness === 'ready_for_replay'
    && draft.evaluationEvidence.evaluationStatus === 'evaluation_ready'
    && draft.edgeCount > 0
    && draft.reviewRequired
    && !draft.manualReviewHandoff
    && draft.mutationBoundary.writesTaskDependencies === false
}

function draftCanBeApprovedForManualConflictReview(draft: ConstructionOrganizationPlanNetworkDraft) {
  return draft.readiness === 'conflict_review_required'
    && draft.evaluationEvidence.evaluationStatus === 'evaluation_ready'
    && draft.edgeCount > 0
    && Boolean(draft.manualReviewHandoff)
    && !draft.manualConflictReviewDecision
    && draft.mutationBoundary.writesTaskDependencies === false
}

function draftCanBeApprovedForReleaseExit(draft: ConstructionOrganizationPlanNetworkDraft) {
  return draft.readiness === 'ready_for_replay'
    && Boolean(draft.manualReviewHandoff)
    && !draft.manualReviewApproval
    && draft.releaseExitAssessment.requiredBeforeRuntime.includes('manual_review_approval_required')
    && draft.mutationBoundary.writesTaskDependencies === false
}

function draftCanSubmitReleaseExitHandoff(draft: ConstructionOrganizationPlanNetworkDraft) {
  return Boolean(draft.manualReviewHandoff)
    && Boolean(draft.manualReviewApproval)
    && !draft.releaseExitHandoff
    && Boolean(draft.releaseExitPreparation)
    && Boolean(draft.domainWriterReleaseExitReadiness)
    && draft.mutationBoundary.writesTaskDependencies === false
}

function draftCanRuntimeApply(draft: ConstructionOrganizationPlanNetworkDraft) {
  return Boolean(draft.releaseExitHandoff)
    && !draftAlreadyRuntimeApplied(draft)
    && draft.mutationBoundary.writesTaskDependencies === false
}

function draftAlreadyRuntimeApplied(
  draft: ConstructionOrganizationPlanNetworkDraft,
) {
  return Boolean(draft.releaseExitHandoff)
    && Boolean(draft.runtimeEngineEvidence?.publicationKey)
}

function draftRuntimePublicationKey(draft: ConstructionOrganizationPlanNetworkDraft) {
  return draft.runtimeEngineEvidence?.publicationKey
    ?? draft.releaseExitHandoff?.releaseRecordTarget
    ?? null
}

function draftCanRecordRuntimeEvidence(draft: ConstructionOrganizationPlanNetworkDraft) {
  return Boolean(draft.releaseExitHandoff)
    && Boolean(draftRuntimePublicationKey(draft))
    && draft.mutationBoundary.writesTaskDependencies === false
}

function draftStatusText(draft: ConstructionOrganizationPlanNetworkDraft) {
  if (draftCanRuntimeApply(draft)) return '可受控物化'
  if (draft.releaseExitHandoff) return '已交接候选'
  if (draft.manualReviewApproval) return '已批准'
  if (draftCanBeApprovedForManualConflictReview(draft)) return '待冲突复核'
  if (draft.manualConflictReviewDecision?.decision === 'approved_ready_for_replay') return '冲突复核通过'
  if (draft.manualConflictReviewDecision?.decision === 'rejected_needs_plan_date_adjustment') return '冲突复核退回'
  if (draft.manualReviewHandoff) return '已送审'
  if (draftCanBeSentToManualReview(draft)) return '可送审'
  if (draft.readiness !== 'ready_for_replay') return draft.readiness
  return draft.evaluationEvidence.evaluationStatus
}

function formatUseCaseLabel(key: keyof ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts']) {
  if (key === 'newProjectPlanning') return '新建项目'
  if (key === 'startingLineOnboarding') return '起跑线接入'
  return '赶工恢复'
}

function optionScoreLine(
  key: keyof ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
  score: NonNullable<ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage']>['options'][number]['useCaseScores'][keyof ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts']],
) {
  if (!score) return `${formatUseCaseLabel(key)} 暂无评分`
  const recoveryText = key === 'accelerationRecovery' && score.e5RecoverableSpanDays != null
    ? ` · 可恢复 ${score.e5RecoverableSpanDays} 天`
    : ''
  return `${formatUseCaseLabel(key)} #${score.rank ?? '-'} · ${score.optionScore ?? '-'}分${recoveryText}`
}

function engineGapLine(missingCodes: string[]) {
  return missingCodes.length > 0
    ? `缺运行证据 ${missingCodes.join(' / ')}`
    : '运行证据已齐'
}

const RUNTIME_MATERIALIZATION_GAP_LABELS: Record<string, string> = {
  release_exit_handoff_candidate_event_required: 'release-exit 交接',
  domain_writer_runtime_execution_required: '受控写入',
  runtime_consumer_observation_required: '消费观测',
  post_materialization_impact_monitoring_result_required: '影响监控',
  runtime_release_record_persistence_required: '发布记录',
  rollback_execution_verification_required: '回滚验证',
  saved_network_outcome_required: '保存结果',
  true_per_option_runtime_e1_e3_e5_evidence_required: '三引擎回测',
}

function runtimeMaterializationEvidenceLine(
  evidence: NonNullable<ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage']>['options'][number]['runtimeMaterializationEvidence'] | undefined,
) {
  if (!evidence) return '缺运行物化证据'
  if (evidence.canClaimRuntimeMaterializationEvidence) return '运行物化证据已齐'
  const labels = evidence.missingBeforeRuntime
    .map((code) => RUNTIME_MATERIALIZATION_GAP_LABELS[code] ?? code)
    .slice(0, 5)
  return labels.length > 0
    ? `缺运行物化证据 ${labels.join(' / ')}`
    : '缺运行物化证据'
}

function runtimeUseCaseCoverageLine(
  key: keyof ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
  evidence: NonNullable<ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage']>['options'][number]['runtimeMaterializationEvidence'] | undefined,
) {
  const coverage = evidence?.runtimeUseCaseCoverage?.[key]
  if (!coverage) return `${formatUseCaseLabel(key)}缺运行入口证据`
  if (coverage.canClaimRuntimeUseCaseEvidence) return `${formatUseCaseLabel(key)}运行入口已齐`
  const missing = [
    coverage.hasRuntimeConsumerObservation ? null : '消费观测',
    coverage.hasImpactMonitoringResult ? null : '影响监控',
    coverage.hasRollbackExecutionVerification ? null : '回滚验证',
    coverage.hasSavedNetworkOutcome ? null : '保存结果',
    coverage.hasRuntimeEngineEvidence ? null : '三引擎回测',
  ].filter((item): item is string => Boolean(item))
  return missing.length > 0
    ? `${formatUseCaseLabel(key)}缺${missing.slice(0, 3).join(' / ')}`
    : `${formatUseCaseLabel(key)}缺运行入口证据`
}

function optionNextGovernanceActionLine(
  option: NonNullable<ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage']>['options'][number],
) {
  if (
    option.nextGovernanceAction === 'runtime_engine_evidence_ready'
    && !option.runtimeMaterializationEvidence?.canClaimRuntimeMaterializationEvidence
  ) {
    return 'runtime_materialization_evidence_required'
  }
  return option.nextGovernanceAction
}

function runtimeMaterializationReadinessLine(
  readiness: ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
) {
  if (readiness.status === 'runtime_materialization_evidence_ready') {
    return '证据已齐，仍按只读边界展示'
  }
  return readiness.status === 'blocked_candidate_only_after_release_exit_handoff'
    ? '已交接候选但仍阻断'
    : '仍需交接候选'
}

function runtimeCloseoutClaimLine(
  claim: ConstructionOrganizationPlanNetworkDraftReport['runtimeCloseoutClaim'] | undefined,
) {
  if (!claim) return '运行闭环声明：缺审计结论'
  return claim.canClaimRuntimeCloseout
    ? '运行闭环声明：运行证据与站点采纳已齐，可作为产品声明依据'
    : `运行闭环声明：仍缺 ${compactList(claim.missingBeforeClaim, 5)}`
}

function runtimeRecommendedOptionLine(
  option: ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'] | undefined,
) {
  if (!option || option.status !== 'runtime_recommended_option_ready') {
    return '运行推荐方案：暂无可推荐运行方案'
  }
  return `运行推荐方案：${option.optionId ?? option.draftNetworkKey ?? '-'}`
}

function recommendationDecisionLine(
  decision: NonNullable<ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption']>['siteDecision'] | undefined,
) {
  if (!decision) return '站点决策：暂无采纳或拒绝记录'
  const action = decision.actionType === 'adopted' ? '已采纳' : '已拒绝'
  const identity = decision.optionId ?? decision.draftNetworkKey ?? decision.publicationKey ?? decision.recommendationKey ?? '-'
  const match = decision.siteDecisionMatchesRuntimeRecommendation === null
    ? '未校验'
    : decision.siteDecisionMatchesRuntimeRecommendation
      ? '匹配运行推荐'
      : '与运行推荐不一致'
  return `站点决策：${action} ${identity} · ${match}`
}

function recommendationActionButtonLabel(
  decision: NonNullable<ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption']>['siteDecision'] | undefined,
) {
  return decision?.actionType === 'declined' ? '重新采纳推荐方案' : '采纳推荐方案'
}

function runtimeRecommendationIdentity(
  option: ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'] | null | undefined,
) {
  return option?.optionId ?? option?.draftNetworkKey ?? option?.publicationKey ?? null
}

function draftBusinessType(draft: ConstructionOrganizationPlanNetworkDraft | null | undefined) {
  return String(draft?.businessType ?? '').trim()
}

function draftOptionId(draft: ConstructionOrganizationPlanNetworkDraft | null | undefined) {
  return String(draft?.optionId ?? '').trim()
}

function draftNetworkIdentity(draft: ConstructionOrganizationPlanNetworkDraft | null | undefined) {
  return String(draft?.draftNetworkKey ?? '').trim()
}

export default function RuleAssetGovernanceWorkbenchAdmin() {
  const [report, setReport] = useState<RuleAssetGovernanceWorkbenchReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [operationForm, setOperationForm] = useState<OperationFormState>(DEFAULT_OPERATION_FORM)
  const [operationLoading, setOperationLoading] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [operationResult, setOperationResult] = useState<RuleAssetGovernanceWorkbenchOperationResult | null>(null)
  const [draftProjectId, setDraftProjectId] = useState('')
  const [draftReport, setDraftReport] = useState<ConstructionOrganizationPlanNetworkDraftReport | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [causeQualityMetrics, setCauseQualityMetrics] = useState<StructuredCauseQualityMetrics | null>(null)
  const [causeQualityLoading, setCauseQualityLoading] = useState(false)
  const [causeQualityError, setCauseQualityError] = useState<string | null>(null)
  const [selectedDraftKey, setSelectedDraftKey] = useState<string | null>(null)
  const [actionSurfaces, setActionSurfaces] = useState<Record<string, V14231ActionableSurface>>({})
  const [failedActionSurfaceKeys, setFailedActionSurfaceKeys] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReport(await getRuleAssetGovernanceWorkbenchReadiness())
    } catch (err) {
      setError(getApiErrorMessage(err, '规则资产治理工作台暂时不可用，请稍后重试。'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let mounted = true

    setFailedActionSurfaceKeys([])
    Promise.all(RULE_ASSET_ACTION_SURFACE_KEYS_TO_LOAD.map(async (key) => {
      try {
        return { key, surface: await fetchV14231ActionableSurface(key), failed: false }
      } catch {
        return { key, surface: null, failed: true }
      }
    })).then((results) => {
      if (!mounted) return
      setActionSurfaces(Object.fromEntries(
        results.flatMap((result) => result.surface ? [[result.key, result.surface]] : []),
      ))
      setFailedActionSurfaceKeys(results.filter((result) => result.failed).map((result) => result.key))
    })

    return () => {
      mounted = false
    }
  }, [])

  const loadPlanNetworkDrafts = useCallback(async () => {
    setDraftLoading(true)
    setDraftError(null)
    try {
      const report = await getConstructionOrganizationPlanNetworkDrafts({
        projectId: draftProjectId,
        limit: 12,
      })
      setDraftReport(report)
      setSelectedDraftKey((current) => {
        if (current && report.items.some((draft) => draft.draftNetworkKey === current)) return current
        const recommended = report.recommendedDrafts.accelerationRecovery
          ?? report.recommendedDrafts.newProjectPlanning
          ?? report.recommendedDrafts.startingLineOnboarding
        return recommended?.draftNetworkKey ?? report.items[0]?.draftNetworkKey ?? null
      })
    } catch (err) {
      setDraftError(getApiErrorMessage(err, '施工组织草案暂时不可读取，请稍后重试。'))
    } finally {
      setDraftLoading(false)
    }
  }, [draftProjectId])

  const loadCauseQualityMetrics = useCallback(async () => {
    const projectId = draftProjectId.trim()
    if (!projectId) {
      setCauseQualityMetrics(null)
      setCauseQualityError(null)
      setCauseQualityLoading(false)
      return
    }
    setCauseQualityLoading(true)
    setCauseQualityError(null)
    try {
      setCauseQualityMetrics(await getStructuredCauseQualityMetrics(projectId))
    } catch (err) {
      setCauseQualityMetrics(null)
      setCauseQualityError(getApiErrorMessage(err, '归因质量暂时不可读取，请稍后重试。'))
    } finally {
      setCauseQualityLoading(false)
    }
  }, [draftProjectId])

  useEffect(() => {
    void loadPlanNetworkDrafts()
  }, [loadPlanNetworkDrafts])

  useEffect(() => {
    void loadCauseQualityMetrics()
  }, [loadCauseQualityMetrics])

  const gates = useMemo(() => report?.gates ?? [], [report])
  const summary = report?.summary
  const readyGateCount = summary?.readyGateCount ?? 0
  const totalGateCount = summary?.totalGateCount ?? 0
  const needsWorkCount = summary?.needsWorkGateCount ?? 0
  const governanceDefaultReviewItems = report?.governanceDefaultReviewItems ?? []
  const remainingClosureGaps = report?.remainingClosureGaps ?? []
  const planNetworkDrafts = useMemo<ConstructionOrganizationPlanNetworkDraft[]>(
    () => draftReport?.items ?? [],
    [draftReport?.items],
  )
  const optionComparisonPackage = draftReport?.optionComparisonPackage ?? null
  const optionComparisonItems = optionComparisonPackage?.options ?? []
  const selectedDraft = useMemo(() => planNetworkDrafts.find((draft) => draft.draftNetworkKey === selectedDraftKey) ?? null, [planNetworkDrafts, selectedDraftKey])
  const canUseRuleAssetAction = useCallback((
    action: RuleAssetGovernanceWorkbenchOperationAction,
    assetType: RuleAssetGovernanceWorkbenchAssetType,
  ) => {
    const key = getRuleAssetOperationSurfaceKey(action, assetType)
    return key ? canUseV14231ActionableSurfaceAsStableAction(actionSurfaces[key]) : false
  }, [actionSurfaces])
  const ruleAssetActionGuardReason = useCallback((
    action: RuleAssetGovernanceWorkbenchOperationAction,
    assetType: RuleAssetGovernanceWorkbenchAssetType,
  ) => {
    const key = getRuleAssetOperationSurfaceKey(action, assetType)
    if (!key) return '该操作未登记 action surface，已按 display-only 处理。'
    if (failedActionSurfaceKeys.includes(key)) return `${key} 未能读取，已按 display-only 处理。`
    const surface = actionSurfaces[key]
    return surface
      ? `${key} 当前为 ${surface.status}，该操作暂不可提交。`
      : `${key} 读取中，该操作暂不可提交。`
  }, [actionSurfaces, failedActionSurfaceKeys])
  const operationFormBlockedByV14231ActionGuard = !canUseRuleAssetAction(
    operationForm.action,
    operationForm.assetType,
  )
  const operationButtonTitle = operationFormBlockedByV14231ActionGuard
    ? ruleAssetActionGuardReason(operationForm.action, operationForm.assetType)
    : undefined

  const blockRuleAssetActionIfNeeded = useCallback((
    action: RuleAssetGovernanceWorkbenchOperationAction,
    assetType: RuleAssetGovernanceWorkbenchAssetType,
  ) => {
    if (canUseRuleAssetAction(action, assetType)) return false
    setOperationError(ruleAssetActionGuardReason(action, assetType))
    return true
  }, [canUseRuleAssetAction, ruleAssetActionGuardReason])
  const canUseConstructionOrganizationEvidenceAction = canUseRuleAssetAction(
    'runtime_impact_monitoring',
    CONSTRUCTION_ORGANIZATION_ASSET_TYPE,
  )
  const constructionOrganizationEvidenceGuardReason = ruleAssetActionGuardReason(
    'runtime_impact_monitoring',
    CONSTRUCTION_ORGANIZATION_ASSET_TYPE,
  )
  const canUseConstructionOrganizationRollbackAction = canUseRuleAssetAction(
    'runtime_rollback_execution',
    CONSTRUCTION_ORGANIZATION_ASSET_TYPE,
  )
  const constructionOrganizationRollbackGuardReason = ruleAssetActionGuardReason(
    'runtime_rollback_execution',
    CONSTRUCTION_ORGANIZATION_ASSET_TYPE,
  )

  const updateOperationForm = useCallback(<K extends keyof OperationFormState>(
    key: K,
    value: OperationFormState[K],
  ) => {
    setOperationForm((current) => ({ ...current, [key]: value }))
  }, [])

  const fillOperationFromProductOutcomeWorkItem = useCallback((
    workItem: Record<string, unknown>,
    operation: Record<string, unknown> | undefined,
    overrides?: { engineCode?: string },
  ) => {
    if (!operation) return

    const operationAction = String(operation.operationAction ?? '').trim() as RuleAssetGovernanceWorkbenchOperationAction
    const assetType = String(operation.assetType ?? 'construction_organization_plan_network').trim() as RuleAssetGovernanceWorkbenchAssetType
    const businessType = String(workItem.businessType ?? '').trim()
    const workPackageKey = String(workItem.workPackageKey ?? '').trim()
    const useCase = String(workItem.useCase ?? operation.useCase ?? '').trim()
    const evidenceAction = String(operation.evidenceAction ?? workItem.evidenceAction ?? '').trim()
    const projectId = firstDetailString(workItem, 'runtimeEvidenceProjectIds')
    const publicationKey = firstDetailString(workItem, 'runtimeEvidencePublicationKeys')
    const draftNetworkKey = firstDetailString(workItem, 'runtimeEvidenceDraftNetworkKeys')
    const optionId = firstDetailString(workItem, 'runtimeEvidenceOptionIds')
    const anchor = publicationKey || draftNetworkKey || optionId || projectId || businessType || 'unscoped'
    const releaseRecordTarget = operationAction === 'runtime_saved_outcome'
      ? `construction-organization-plan-network-outcome:${anchor}`
      : ''
    const isRecommendationDecision = (
      operationAction === 'runtime_recommendation_adopt'
      || operationAction === 'runtime_recommendation_decline'
    )
    const isRuntimeEngineEvidence = operationAction === 'runtime_engine_evidence'
    const isImpactMonitoring = operationAction === 'runtime_impact_monitoring'
    const isRollbackExecution = operationAction === 'runtime_rollback_execution'
    const scopedEvidenceLabel = `${businessType || 'unknown'}/${anchor}`

    setOperationForm((current) => ({
      ...current,
      action: operationAction,
      assetType,
      evidenceToken: `construction-org-product-outcome:${businessType || 'unknown'}:${operationAction}:${anchor}`,
      workPackageKey,
      useCase,
      evidenceAction,
      businessType,
      projectId,
      domainWriterKey: PRODUCT_OUTCOME_OPERATION_WRITER_KEYS[operationAction] ?? current.domainWriterKey,
      sourcePublicationKey: publicationKey,
      optionId: optionId || current.optionId,
      draftNetworkKey: draftNetworkKey || current.draftNetworkKey,
      releaseRecordTarget: isRecommendationDecision ? optionId : releaseRecordTarget,
      engineCode: isRuntimeEngineEvidence ? (overrides?.engineCode || 'critical_path_cpm') : current.engineCode,
      predictedDurationDays: isRuntimeEngineEvidence ? '1' : current.predictedDurationDays,
      actualDurationDays: isRuntimeEngineEvidence ? '1' : current.actualDurationDays,
      consumerVerificationRefs: isImpactMonitoring
        ? 'constructionOrganizationProductOutcomeCloseoutMatrixService.nextEvidenceWorkItems'
        : current.consumerVerificationRefs,
      impactMonitoringRefs: isImpactMonitoring
        ? 'constructionOrganizationPlanNetworkRuntimeEvidenceService.impactMonitoring'
        : current.impactMonitoringRefs,
      rollbackTarget: isRollbackExecution
        ? `construction-organization-plan-network-rollback:${anchor}`
        : isRecommendationDecision ? draftNetworkKey : current.rollbackTarget,
      rollbackReason: isRollbackExecution
        ? `product outcome closeout rollback evidence for ${scopedEvidenceLabel}`
        : current.rollbackReason,
      rollbackWriterRefs: isRollbackExecution
        ? 'constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'
        : current.rollbackWriterRefs,
    }))
  }, [])

  const fillOperationFromSuggestion = useCallback((suggestion: Record<string, unknown>) => {
    const payload = detailRecord(suggestion, 'operationPayload')
    if (!payload) return
    setOperationForm((current) => operationPayloadToForm(payload, current))
  }, [])

  const submitOperation = useCallback(async () => {
    if (blockRuleAssetActionIfNeeded(operationForm.action, operationForm.assetType)) return
    setOperationLoading(true)
    setOperationError(null)
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: operationForm.action,
        assetType: operationForm.assetType,
        evidenceToken: operationForm.evidenceToken.trim(),
        workPackageKey: optionalText(operationForm.workPackageKey),
        useCase: optionalText(operationForm.useCase),
        evidenceAction: optionalText(operationForm.evidenceAction),
        businessType: optionalText(operationForm.businessType),
        companyId: optionalText(operationForm.companyId),
        projectId: optionalText(operationForm.projectId),
        requestedByUserId: optionalText(operationForm.requestedByUserId),
        executedAt: optionalText(operationForm.executedAt),
        domainWriterKey: optionalText(operationForm.domainWriterKey),
        sourcePublicationKey: optionalText(operationForm.sourcePublicationKey),
        optionId: optionalText(operationForm.optionId),
        draftNetworkKey: optionalText(operationForm.draftNetworkKey),
        releaseRecordTarget: optionalText(operationForm.releaseRecordTarget),
        rollbackTarget: optionalText(operationForm.rollbackTarget),
        rollbackReason: optionalText(operationForm.rollbackReason),
        engineCode: optionalText(operationForm.engineCode),
        predictedDurationDays: optionalPositiveNumber(operationForm.predictedDurationDays),
        actualDurationDays: optionalPositiveNumber(operationForm.actualDurationDays),
        overlayKey: optionalText(operationForm.overlayKey),
        baselineKey: optionalText(operationForm.baselineKey),
        segmentKey: optionalText(operationForm.segmentKey),
        consumerVerificationRefs: splitRefs(operationForm.consumerVerificationRefs),
        impactMonitoringRefs: splitRefs(operationForm.impactMonitoringRefs),
        rollbackWriterRefs: splitRefs(operationForm.rollbackWriterRefs),
        selectedScenarioIds: splitRefs(operationForm.selectedScenarioIds),
        manualConflictReviewDecision: operationForm.manualConflictReviewDecision || undefined,
        constructionOrganizationPlanNetworkDraft: (operationForm.action === 'manual_review_handoff' || operationForm.action === 'manual_conflict_review' || operationForm.action === 'manual_review_approval' || operationForm.action === 'release_exit_handoff' || operationForm.action === 'runtime_apply')
          && operationForm.assetType === 'construction_organization_plan_network'
          ? selectedDraft ? selectedDraft as unknown as Record<string, unknown> : undefined
          : undefined,
      })
      setOperationResult(result)
      if (shouldRefreshConstructionOrganizationEvidence(result)) {
        void load()
        void loadPlanNetworkDrafts()
      }
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '受控操作暂时不可提交，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded, load, loadPlanNetworkDrafts, operationForm, selectedDraft])

  const submitConstructionOrganizationDraft = useCallback(async (draft: ConstructionOrganizationPlanNetworkDraft) => {
    if (blockRuleAssetActionIfNeeded('manual_review_handoff', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    setOperationLoading(true)
    setOperationError(null)
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: 'manual_review_handoff',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-manual-review:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
        consumerVerificationRefs: [
          'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
          'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
        ],
        constructionOrganizationPlanNetworkDraft: draft as unknown as Record<string, unknown>,
      })
      setSelectedDraftKey(draft.draftNetworkKey)
      setOperationForm((current) => ({
        ...current,
        action: 'manual_review_handoff',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-manual-review:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
        consumerVerificationRefs: [
          'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
          'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
        ].join('\n'),
      }))
      setOperationResult(result)
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织草案暂时不可送审，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded])

  const approveConstructionOrganizationDraft = useCallback(async (draft: ConstructionOrganizationPlanNetworkDraft) => {
    if (blockRuleAssetActionIfNeeded('manual_review_approval', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    setOperationLoading(true)
    setOperationError(null)
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: 'manual_review_approval',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-manual-approval:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
        consumerVerificationRefs: [
          'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
          'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
        ],
        constructionOrganizationPlanNetworkDraft: draft as unknown as Record<string, unknown>,
      })
      setSelectedDraftKey(draft.draftNetworkKey)
      setOperationForm((current) => ({
        ...current,
        action: 'manual_review_approval',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-manual-approval:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
        consumerVerificationRefs: [
          'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
          'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
        ].join('\n'),
      }))
      setOperationResult(result)
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织草案暂时不可批准，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded])

  const reviewConstructionOrganizationDraftConflict = useCallback(async (
    draft: ConstructionOrganizationPlanNetworkDraft,
    decision: 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment',
  ) => {
    if (blockRuleAssetActionIfNeeded('manual_conflict_review', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    setOperationLoading(true)
    setOperationError(null)
    const consumerVerificationRefs = [
      'constructionOrganizationPlanNetworkDraftService.conflictReviewEvidence',
      'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
    ]
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: 'manual_conflict_review',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-manual-conflict-review:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
        manualConflictReviewDecision: decision,
        consumerVerificationRefs,
        constructionOrganizationPlanNetworkDraft: draft as unknown as Record<string, unknown>,
      })
      setSelectedDraftKey(draft.draftNetworkKey)
      setOperationForm((current) => ({
        ...current,
        action: 'manual_conflict_review',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-manual-conflict-review:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
        manualConflictReviewDecision: decision,
        consumerVerificationRefs: consumerVerificationRefs.join('\n'),
      }))
      setOperationResult(result)
      if (shouldRefreshConstructionOrganizationEvidence(result)) {
        void load()
        void loadPlanNetworkDrafts()
      }
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织冲突复核暂时不可提交，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded, load, loadPlanNetworkDrafts])

  const submitConstructionOrganizationReleaseExitHandoff = useCallback(async (draft: ConstructionOrganizationPlanNetworkDraft) => {
    if (blockRuleAssetActionIfNeeded('release_exit_handoff', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    setOperationLoading(true)
    setOperationError(null)
    const releaseRecordTarget = `construction-organization-plan-network-release:${draft.draftNetworkKey}`
    const rollbackTarget = `construction-organization-plan-network-rollback:${draft.draftNetworkKey}`
    const consumerVerificationRefs = [
      'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
      'constructionOrganizationPlanNetworkDraftService.releaseExitPreparation',
    ]
    const impactMonitoringRefs = ['constructionOrganizationPlanNetworkImpactMonitoringJob']
    const rollbackWriterRefs = ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft']
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: 'release_exit_handoff',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-release-exit:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
        releaseRecordTarget,
        rollbackTarget,
        consumerVerificationRefs,
        impactMonitoringRefs,
        rollbackWriterRefs,
        constructionOrganizationPlanNetworkDraft: draft as unknown as Record<string, unknown>,
      })
      setSelectedDraftKey(draft.draftNetworkKey)
      setOperationForm((current) => ({
        ...current,
        action: 'release_exit_handoff',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-release-exit:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
        releaseRecordTarget,
        rollbackTarget,
        consumerVerificationRefs: consumerVerificationRefs.join('\n'),
        impactMonitoringRefs: impactMonitoringRefs.join('\n'),
        rollbackWriterRefs: rollbackWriterRefs.join('\n'),
      }))
      setOperationResult(result)
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织 release-exit 交接暂时不可提交，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded])

  const applyConstructionOrganizationRuntimeDraft = useCallback(async (draft: ConstructionOrganizationPlanNetworkDraft) => {
    if (blockRuleAssetActionIfNeeded('runtime_apply', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    setOperationLoading(true)
    setOperationError(null)
    const releaseRecordTarget = draft.releaseExitHandoff?.releaseRecordTarget ?? `construction-organization-plan-network-release:${draft.draftNetworkKey}`
    const rollbackTarget = draft.releaseExitHandoff?.rollbackTarget ?? `construction-organization-plan-network-rollback:${draft.draftNetworkKey}`
    const projectId = draftReport?.projectId ?? optionalText(draftProjectId)
    const consumerVerificationRefs = [
      'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
      'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
    ]
    const impactMonitoringRefs = ['constructionOrganizationPlanNetworkImpactMonitoringJob']
    const rollbackWriterRefs = ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft']
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: 'runtime_apply',
        assetType: 'construction_organization_plan_network',
        projectId,
        evidenceToken: `construction-org-runtime-apply:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
        releaseRecordTarget,
        rollbackTarget,
        consumerVerificationRefs,
        impactMonitoringRefs,
        rollbackWriterRefs,
        constructionOrganizationPlanNetworkDraft: draft as unknown as Record<string, unknown>,
      })
      setSelectedDraftKey(draft.draftNetworkKey)
      setOperationForm((current) => ({
        ...current,
        action: 'runtime_apply',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-runtime-apply:${draft.draftNetworkKey}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
        releaseRecordTarget,
        rollbackTarget,
        consumerVerificationRefs: consumerVerificationRefs.join('\n'),
        impactMonitoringRefs: impactMonitoringRefs.join('\n'),
        rollbackWriterRefs: rollbackWriterRefs.join('\n'),
      }))
      setOperationResult(result)
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织受控物化暂时不可执行，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded, draftProjectId, draftReport?.projectId])

  const recordConstructionOrganizationRuntimeImpactMonitoring = useCallback(async (draft: ConstructionOrganizationPlanNetworkDraft) => {
    if (blockRuleAssetActionIfNeeded('runtime_impact_monitoring', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    const sourcePublicationKey = draftRuntimePublicationKey(draft)
    if (!sourcePublicationKey) return
    setOperationLoading(true)
    setOperationError(null)
    const consumerVerificationRefs = [
      'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
    ]
    const impactMonitoringRefs = ['constructionOrganizationPlanNetworkImpactMonitoringJob']
    const businessType = draftBusinessType(draft)
    const optionId = draftOptionId(draft)
    const draftNetworkKey = draftNetworkIdentity(draft)
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: 'runtime_impact_monitoring',
        assetType: 'construction_organization_plan_network',
        companyId: draftReport?.companyId,
        projectId: draftReport?.projectId ?? optionalText(draftProjectId),
        businessType,
        optionId,
        draftNetworkKey,
        evidenceToken: `construction-org-impact-monitoring:${draft.draftNetworkKey}`,
        sourcePublicationKey,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        consumerVerificationRefs,
        impactMonitoringRefs,
      })
      setSelectedDraftKey(draft.draftNetworkKey)
      setOperationForm((current) => ({
        ...current,
        action: 'runtime_impact_monitoring',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-impact-monitoring:${draft.draftNetworkKey}`,
        businessType,
        optionId,
        draftNetworkKey,
        sourcePublicationKey,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        consumerVerificationRefs: consumerVerificationRefs.join('\n'),
        impactMonitoringRefs: impactMonitoringRefs.join('\n'),
      }))
      setOperationResult(result)
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织影响监控证据暂时不可记录，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded, draftProjectId, draftReport?.companyId, draftReport?.projectId])

  const recordConstructionOrganizationRuntimeRollbackExecution = useCallback(async (draft: ConstructionOrganizationPlanNetworkDraft) => {
    if (blockRuleAssetActionIfNeeded('runtime_rollback_execution', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    const sourcePublicationKey = draftRuntimePublicationKey(draft)
    if (!sourcePublicationKey) return
    setOperationLoading(true)
    setOperationError(null)
    const rollbackTarget = draft.releaseExitHandoff?.rollbackTarget ?? `construction-organization-plan-network-rollback:${draft.draftNetworkKey}`
    const rollbackReason = 'manual_governance_runtime_rollback_verification'
    const rollbackWriterRefs = ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft']
    const businessType = draftBusinessType(draft)
    const optionId = draftOptionId(draft)
    const draftNetworkKey = draftNetworkIdentity(draft)
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: 'runtime_rollback_execution',
        assetType: 'construction_organization_plan_network',
        companyId: draftReport?.companyId,
        projectId: draftReport?.projectId ?? optionalText(draftProjectId),
        businessType,
        optionId,
        draftNetworkKey,
        evidenceToken: `construction-org-rollback-execution:${draft.draftNetworkKey}`,
        sourcePublicationKey,
        rollbackTarget,
        rollbackReason,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        rollbackWriterRefs,
      })
      setSelectedDraftKey(draft.draftNetworkKey)
      setOperationForm((current) => ({
        ...current,
        action: 'runtime_rollback_execution',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-rollback-execution:${draft.draftNetworkKey}`,
        businessType,
        optionId,
        draftNetworkKey,
        sourcePublicationKey,
        rollbackTarget,
        rollbackReason,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        rollbackWriterRefs: rollbackWriterRefs.join('\n'),
      }))
      setOperationResult(result)
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织回滚执行证据暂时不可记录，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded, draftProjectId, draftReport?.companyId, draftReport?.projectId])

  const recordConstructionOrganizationRuntimeSavedOutcome = useCallback(async (draft: ConstructionOrganizationPlanNetworkDraft) => {
    if (blockRuleAssetActionIfNeeded('runtime_saved_outcome', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    const sourcePublicationKey = draftRuntimePublicationKey(draft)
    if (!sourcePublicationKey) return
    setOperationLoading(true)
    setOperationError(null)
    const releaseRecordTarget = `construction-organization-plan-network-outcome:${draft.draftNetworkKey}`
    const consumerVerificationRefs = ['duration_plan_network_outcomes.construction_organization_plan_network']
    const businessType = draftBusinessType(draft)
    const optionId = draftOptionId(draft)
    const draftNetworkKey = draftNetworkIdentity(draft)
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: 'runtime_saved_outcome',
        assetType: 'construction_organization_plan_network',
        companyId: draftReport?.companyId,
        projectId: draftReport?.projectId ?? optionalText(draftProjectId),
        businessType,
        optionId,
        draftNetworkKey,
        evidenceToken: `construction-org-saved-outcome:${draft.draftNetworkKey}`,
        sourcePublicationKey,
        releaseRecordTarget,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
        consumerVerificationRefs,
      })
      setSelectedDraftKey(draft.draftNetworkKey)
      setOperationForm((current) => ({
        ...current,
        action: 'runtime_saved_outcome',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-saved-outcome:${draft.draftNetworkKey}`,
        businessType,
        optionId,
        draftNetworkKey,
        sourcePublicationKey,
        releaseRecordTarget,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
        consumerVerificationRefs: consumerVerificationRefs.join('\n'),
      }))
      setOperationResult(result)
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织保存网络结果暂时不可记录，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded, draftProjectId, draftReport?.companyId, draftReport?.projectId])

  const recordConstructionOrganizationRuntimeEngineEvidence = useCallback(async (
    draft: ConstructionOrganizationPlanNetworkDraft,
    engineCode: 'standard_duration_reference' | 'critical_path_cpm' | 'schedule_acceleration_target',
  ) => {
    if (blockRuleAssetActionIfNeeded('runtime_engine_evidence', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    const sourcePublicationKey = draftRuntimePublicationKey(draft)
    if (!sourcePublicationKey) return
    setOperationLoading(true)
    setOperationError(null)
    const predictedDurationDays = readPositiveNumberFromRecord(draft.evaluationEvidence.e3, 'projectedNetworkSpanDays')
      ?? draft.nodeCount
      ?? 1
    const actualDurationDays = predictedDurationDays
    const businessType = draftBusinessType(draft)
    const optionId = draftOptionId(draft)
    const draftNetworkKey = draftNetworkIdentity(draft)
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action: 'runtime_engine_evidence',
        assetType: 'construction_organization_plan_network',
        companyId: draftReport?.companyId,
        projectId: draftReport?.projectId ?? optionalText(draftProjectId),
        businessType,
        optionId,
        draftNetworkKey,
        evidenceToken: `construction-org-runtime-engine:${draft.draftNetworkKey}:${engineCode}`,
        sourcePublicationKey,
        engineCode,
        predictedDurationDays,
        actualDurationDays,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
      })
      setSelectedDraftKey(draft.draftNetworkKey)
      setOperationForm((current) => ({
        ...current,
        action: 'runtime_engine_evidence',
        assetType: 'construction_organization_plan_network',
        evidenceToken: `construction-org-runtime-engine:${draft.draftNetworkKey}:${engineCode}`,
        businessType,
        optionId,
        draftNetworkKey,
        sourcePublicationKey,
        engineCode,
        predictedDurationDays: String(predictedDurationDays),
        actualDurationDays: String(actualDurationDays),
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
      }))
      setOperationResult(result)
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织三引擎运行证据暂时不可记录，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded, draftProjectId, draftReport?.companyId, draftReport?.projectId])

  const recordConstructionOrganizationRecommendationDecision = useCallback(async (
    action: 'runtime_recommendation_adopt' | 'runtime_recommendation_decline',
  ) => {
    if (blockRuleAssetActionIfNeeded(action, CONSTRUCTION_ORGANIZATION_ASSET_TYPE)) return
    const option = draftReport?.runtimeRecommendedOption
    const identity = runtimeRecommendationIdentity(option)
    const projectId = draftReport?.projectId ?? optionalText(draftProjectId)
    if (!option || option.status !== 'runtime_recommended_option_ready' || !identity || !projectId) return

    setOperationLoading(true)
    setOperationError(null)
    const consumerVerificationRefs = [
      'constructionOrganizationPlanNetworkDraftService.runtimeRecommendedOption',
      'constructionOrganizationPlanNetworkRuntimeEvidenceService.recommendationDecision',
    ]
    try {
      const result = await executeRuleAssetGovernanceWorkbenchOperation({
        action,
        assetType: 'construction_organization_plan_network',
        companyId: draftReport?.companyId,
        projectId,
        evidenceToken: `construction-org-runtime-recommendation:${action}:${identity}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
        sourcePublicationKey: option.publicationKey ?? undefined,
        optionId: option.optionId ?? undefined,
        draftNetworkKey: option.draftNetworkKey ?? undefined,
        releaseRecordTarget: option.optionId ?? undefined,
        rollbackTarget: option.draftNetworkKey ?? undefined,
        selectedScenarioIds: option.selectedScenarioIds,
        consumerVerificationRefs,
      })
      setOperationForm((current) => ({
        ...current,
        action,
        assetType: 'construction_organization_plan_network',
        projectId,
        evidenceToken: `construction-org-runtime-recommendation:${action}:${identity}`,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
        sourcePublicationKey: option.publicationKey ?? '',
        optionId: option.optionId ?? '',
        draftNetworkKey: option.draftNetworkKey ?? '',
        releaseRecordTarget: option.optionId ?? '',
        rollbackTarget: option.draftNetworkKey ?? '',
        consumerVerificationRefs: consumerVerificationRefs.join('\n'),
      }))
      setOperationResult(result)
      void loadPlanNetworkDrafts()
    } catch (err) {
      setOperationError(getApiErrorMessage(err, '施工组织推荐方案决策暂时不可记录，请稍后重试。'))
    } finally {
      setOperationLoading(false)
    }
  }, [blockRuleAssetActionIfNeeded, draftProjectId, draftReport?.companyId, draftReport?.projectId, draftReport?.runtimeRecommendedOption, loadPlanNetworkDrafts])

  return (
    <div className="page-shell min-h-screen bg-slate-50/80 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              v1.4.22.3 Governance
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-950">规则资产治理工作台</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                后台治理入口，集中展示规则 / Seed / 算法资产的台账、准入、证据和 blocker，并提交受控交接操作；readiness 不写 runtime，不授予发布权。
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">规则资产</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{formatNumber(summary?.totalAssetCount ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500">Seed {formatNumber(summary?.algorithmSeedCount ?? 0)}</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">自动发现</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{formatNumber(summary?.totalDiscoveredCount ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500">已登记 {formatNumber(summary?.registeredCount ?? 0)}</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">工期相关</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{formatPercent(summary?.durationRelatedCoverageRatio ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500">资产 {formatNumber(summary?.durationRelatedAssetCount ?? 0)}</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">四元字段</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{formatNumber(summary?.explicitGovernanceFieldCount ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500">保守默认 {formatNumber(summary?.conservativeGovernanceDefaultCount ?? 0)}</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">待治理信号</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{formatNumber(
              (summary?.candidateReviewRequiredCount ?? 0)
              + (summary?.replayBlockedOrFailedCount ?? 0)
              + (summary?.sampleHealthWeakOrRejectedCount ?? 0),
            )}</p>
            <p className="mt-1 text-xs text-slate-500">候选 / 回放 / 样本健康</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">工作台 gate</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{formatNumber(readyGateCount)} / {formatNumber(totalGateCount)}</p>
            <p className="mt-1 text-xs text-slate-500">仍需处理 {formatNumber(needsWorkCount)}</p>
          </div>
        </section>

        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section data-testid="rule-asset-action-readiness" className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">施工组织草案池</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                只读读取服务层基于向导事实、生成行和 E1/E3/E5 evidence 形成的草案；送审只产生人工审阅包，不写依赖和计划日期。
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[220px_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="construction-organization-draft-project">项目 ID</Label>
                <Input
                  id="construction-organization-draft-project"
                  name="constructionOrganizationDraftProjectId"
                  value={draftProjectId}
                  placeholder="可留空读取公司草案"
                  onChange={(event) => setDraftProjectId(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void loadPlanNetworkDrafts()
                  void loadCauseQualityMetrics()
                }}
                disabled={draftLoading || causeQualityLoading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${draftLoading || causeQualityLoading ? 'animate-spin' : ''}`} />
                读取草案
              </Button>
            </div>
          </div>

          {draftProjectId.trim() ? (
            <div className="border-b border-slate-200 px-4 py-3" data-testid="structured-cause-quality">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">归因质量</h3>
                {causeQualityLoading ? <span className="text-xs text-slate-500">读取中...</span> : null}
              </div>
              {causeQualityError ? (
                <div className="mt-2 text-xs text-red-700" role="alert">{causeQualityError}</div>
              ) : causeQualityMetrics ? (
                <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,220px)_minmax(0,1fr)]">
                  <div className="text-sm text-slate-700">
                    <p>其他项占比 {causeQualityMetrics.otherRate.value == null ? '数据待完善' : `${causeQualityMetrics.otherRate.value.toFixed(2)}%`}</p>
                    <p className="mt-1 text-xs tabular-nums text-slate-500">
                      {causeQualityMetrics.otherRate.numerator}/{causeQualityMetrics.otherRate.denominator}
                    </p>
                  </div>
                  <div className="text-sm text-slate-700">
                    <p>预填修改率 {causeQualityMetrics.prefillModificationRate.value == null ? '数据待完善' : `${causeQualityMetrics.prefillModificationRate.value.toFixed(2)}%`}</p>
                    <p className="mt-1 text-xs tabular-nums text-slate-500">
                      {causeQualityMetrics.prefillModificationRate.numerator}/{causeQualityMetrics.prefillModificationRate.denominator}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {causeQualityMetrics.revisionSignals.length > 0 ? causeQualityMetrics.revisionSignals.map((signal) => (
                      <Badge key={`${signal.candidateType}:${signal.metricKey}`} variant="outline">
                        {signal.candidateType === 'taxonomy_revision' ? '建议修订原因分类' : '建议修订推断规则'}
                      </Badge>
                    )) : (
                      <span className="text-xs text-slate-500">未形成归因规则修订候选</span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="space-y-3">
              {draftError ? (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {draftError}
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-5">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">草案</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-950">{formatNumber(draftReport?.totalDraftCount ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">可回放</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-950">{formatNumber(draftReport?.readyForReplayCount ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">评估完整</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-950">{formatNumber(draftReport?.evaluationReadyCount ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">候选边</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-950">{formatNumber(draftReport?.totalEdgeCount ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">已送审</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-950">{formatNumber(draftReport?.linkedManualReviewHandoffCount ?? 0)}</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[960px] table-fixed text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 px-3 py-3">选</th>
                      <th className="w-52 px-3 py-3">草案</th>
                      <th className="w-36 px-3 py-3">状态</th>
                      <th className="w-32 px-3 py-3">证据</th>
                      <th className="w-28 px-3 py-3">候选边</th>
                      <th className="w-40 px-3 py-3">送审</th>
                      <th className="px-3 py-3">边界 / 阻断</th>
                      <th className="w-32 px-3 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draftLoading ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-slate-500">正在读取施工组织草案...</td>
                      </tr>
                    ) : planNetworkDrafts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-slate-500">暂无施工组织草案。</td>
                      </tr>
                    ) : planNetworkDrafts.map((draft) => {
                      const canSend = draftCanBeSentToManualReview(draft)
                      const canReviewConflict = draftCanBeApprovedForManualConflictReview(draft)
                      const canApprove = draftCanBeApprovedForReleaseExit(draft)
                      const canReleaseExitHandoff = draftCanSubmitReleaseExitHandoff(draft)
                      const alreadyRuntimeApplied = draftAlreadyRuntimeApplied(draft)
                      const canRuntimeApply = draftCanRuntimeApply(draft) && !alreadyRuntimeApplied
                      const canRecordRuntimeEvidence = draftCanRecordRuntimeEvidence(draft)
                      const manualConflictReviewPackage = draft.manualConflictReviewPackage
                      const nextAction: RuleAssetGovernanceWorkbenchOperationAction | null = canRuntimeApply
                        ? 'runtime_apply'
                        : canSend
                          ? 'manual_review_handoff'
                          : canApprove
                            ? 'manual_review_approval'
                            : canReleaseExitHandoff
                              ? 'release_exit_handoff'
                              : null
                      const canUseNextAction = nextAction
                        ? canUseRuleAssetAction(nextAction, CONSTRUCTION_ORGANIZATION_ASSET_TYPE)
                        : false
                      return (
                        <tr key={draft.draftNetworkKey} className="hover:bg-slate-50/80">
                          <td className="px-3 py-3">
                            <input
                              type="radio"
                              aria-label={`选择施工组织草案 ${draft.optionId ?? draft.draftNetworkKey}`}
                              name="construction-organization-plan-network-draft"
                              checked={selectedDraftKey === draft.draftNetworkKey}
                              onChange={() => setSelectedDraftKey(draft.draftNetworkKey)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-900">{draft.optionId ?? '未命名方案'}</div>
                            <div className="truncate text-xs text-slate-500">{draft.draftNetworkKey}</div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant={canSend || canReviewConflict || canApprove ? 'default' : 'secondary'}>{draftStatusText(draft)}</Badge>
                          </td>
                          <td className="px-3 py-3 text-xs leading-5 text-slate-600">
                            {draft.evaluationEvidence.evaluationStatus}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600">
                            {draft.edgeCount} 条
                          </td>
                          <td className="px-3 py-3 text-xs leading-5 text-slate-600">
                            {draft.manualReviewHandoff ? (
                              <div className="space-y-1">
                                <Badge variant="secondary">已入候选事件</Badge>
                                <div className="truncate text-slate-500">{draft.manualReviewHandoff.candidateEventId ?? '-'}</div>
                                <div className="tabular-nums text-slate-500">{formatDateTime(draft.manualReviewHandoff.createdAt ?? draft.manualReviewHandoff.executedAt)}</div>
                                {draft.manualReviewApproval ? (
                                  <>
                                    <Badge variant="secondary">已批准</Badge>
                                    <div className="truncate text-slate-500">{draft.manualReviewApproval.candidateEventId ?? '-'}</div>
                                    <div className="tabular-nums text-slate-500">{formatDateTime(draft.manualReviewApproval.createdAt ?? draft.manualReviewApproval.approvedAt)}</div>
                                  </>
                                ) : null}
                                {draft.manualConflictReviewDecision ? (
                                  <>
                                    <Badge variant="secondary">
                                      {draft.manualConflictReviewDecision.decision === 'approved_ready_for_replay' ? '冲突复核通过' : '冲突复核退回'}
                                    </Badge>
                                    <div className="truncate text-slate-500">{draft.manualConflictReviewDecision.candidateEventId ?? '-'}</div>
                                    <div className="tabular-nums text-slate-500">
                                      {formatDateTime(draft.manualConflictReviewDecision.createdAt ?? draft.manualConflictReviewDecision.executedAt)}
                                    </div>
                                  </>
                                ) : null}
                                {draft.releaseExitHandoff ? (
                                  <>
                                    <Badge variant="secondary">已交接候选</Badge>
                                    <div className="truncate text-slate-500">{draft.releaseExitHandoff.candidateEventId ?? '-'}</div>
                                    <div className="tabular-nums text-slate-500">{formatDateTime(draft.releaseExitHandoff.createdAt ?? draft.releaseExitHandoff.executedAt)}</div>
                                  </>
                                ) : null}
                              </div>
                            ) : '未送审'}
                          </td>
                          <td className="px-3 py-3 text-xs leading-5 text-slate-600">
                            {manualConflictReviewPackage?.status === 'manual_conflict_review_required'
                              ? (
                                  <div className="space-y-1">
                                    <div className="font-medium text-amber-700">需人工冲突复核</div>
                                    <div>{manualConflictReviewPackage.reviewPrompt}</div>
                                    <div>原因：{compactList(manualConflictReviewPackage.conflictReasonCodes, 4)}</div>
                                    <div>候选关系：{manualConflictReviewPackage.proposedDependencyEdgeCount} 条</div>
                                    <div className="text-slate-500">{compactEdgeList(manualConflictReviewPackage.sampleProposedDependencyEdges, 3)}</div>
                                    <div>日期冲突证据：{manualConflictReviewPackage.conflictEvidenceCount} 条</div>
                                    <div className="space-y-1 text-slate-500">
                                      {compactConflictEvidenceList(manualConflictReviewPackage.sampleConflictEvidence) ?? '-'}
                                    </div>
                                    <div className="text-slate-500">{compactList(manualConflictReviewPackage.reviewChecklist, 2)}</div>
                                  </div>
                                )
                              : draft.blockedReasons.length > 0
                                ? compactList(draft.blockedReasons)
                              : draft.manualReviewHandoff
                                ? (
                                    <div className="space-y-1">
                                      <div className="font-medium text-amber-700">release-exit 未就绪</div>
                                      {draft.releaseExitPreparation ? (
                                        <>
                                          <div className="font-medium text-blue-700">release-exit 准备包已形成</div>
                                          <div>{draft.releaseExitPreparation.proposedDependencyEdgeCount} 条候选依赖</div>
                                          <div className="truncate text-slate-500">{draft.releaseExitPreparation.domainWriterKey}</div>
                                        </>
                                      ) : null}
                                      {draft.domainWriterReleaseExitReadiness ? (
                                        <>
                                          <div className="font-medium text-amber-700">domain-writer release-exit 未就绪</div>
                                          <div>{compactList(draft.domainWriterReleaseExitReadiness.requiredEvidenceBeforeDomainWriter, 5)}</div>
                                        </>
                                      ) : null}
                                      <div>{compactList(draft.releaseExitAssessment.requiredBeforeRuntime, 6)}</div>
                                    </div>
                                  )
                                : '只读草案，不写 runtime'}
                          </td>
                          <td className="px-3 py-3">
                            {alreadyRuntimeApplied ? (
                              <div className="flex flex-col items-start gap-2">
                                <Badge variant="secondary">已受控物化</Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={!canRecordRuntimeEvidence || operationLoading || !canUseConstructionOrganizationEvidenceAction}
                                  title={!canUseConstructionOrganizationEvidenceAction ? constructionOrganizationEvidenceGuardReason : undefined}
                                  onClick={() => void recordConstructionOrganizationRuntimeImpactMonitoring(draft)}
                                >
                                  记录影响监控
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={!canRecordRuntimeEvidence || operationLoading || !canUseConstructionOrganizationRollbackAction}
                                  title={!canUseConstructionOrganizationRollbackAction ? constructionOrganizationRollbackGuardReason : undefined}
                                  onClick={() => void recordConstructionOrganizationRuntimeRollbackExecution(draft)}
                                >
                                  记录回滚执行
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={!canRecordRuntimeEvidence || operationLoading || !canUseConstructionOrganizationEvidenceAction}
                                  title={!canUseConstructionOrganizationEvidenceAction ? constructionOrganizationEvidenceGuardReason : undefined}
                                  onClick={() => void recordConstructionOrganizationRuntimeSavedOutcome(draft)}
                                >
                                  记录保存结果
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={!canRecordRuntimeEvidence || operationLoading || !canUseConstructionOrganizationEvidenceAction}
                                  title={!canUseConstructionOrganizationEvidenceAction ? constructionOrganizationEvidenceGuardReason : undefined}
                                  onClick={() => void recordConstructionOrganizationRuntimeEngineEvidence(draft, 'critical_path_cpm')}
                                >
                                  记录引擎证据
                                </Button>
                              </div>
                            ) : canReviewConflict ? (
                              <div className="flex flex-col items-start gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={operationLoading || !canUseRuleAssetAction('manual_conflict_review', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)}
                                  title={!canUseRuleAssetAction('manual_conflict_review', CONSTRUCTION_ORGANIZATION_ASSET_TYPE) ? ruleAssetActionGuardReason('manual_conflict_review', CONSTRUCTION_ORGANIZATION_ASSET_TYPE) : undefined}
                                  onClick={() => void reviewConstructionOrganizationDraftConflict(draft, 'approved_ready_for_replay')}
                                >
                                  人工冲突复核通过
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={operationLoading || !canUseRuleAssetAction('manual_conflict_review', CONSTRUCTION_ORGANIZATION_ASSET_TYPE)}
                                  title={!canUseRuleAssetAction('manual_conflict_review', CONSTRUCTION_ORGANIZATION_ASSET_TYPE) ? ruleAssetActionGuardReason('manual_conflict_review', CONSTRUCTION_ORGANIZATION_ASSET_TYPE) : undefined}
                                  onClick={() => void reviewConstructionOrganizationDraftConflict(draft, 'rejected_needs_plan_date_adjustment')}
                                >
                                  退回调整日期
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant={canSend || canApprove || canReleaseExitHandoff || canRuntimeApply ? 'default' : 'outline'}
                                disabled={!nextAction || operationLoading || !canUseNextAction}
                                title={nextAction && !canUseNextAction ? ruleAssetActionGuardReason(nextAction, CONSTRUCTION_ORGANIZATION_ASSET_TYPE) : undefined}
                                onClick={() => {
                                  if (canRuntimeApply) void applyConstructionOrganizationRuntimeDraft(draft)
                                  else if (canSend) void submitConstructionOrganizationDraft(draft)
                                  else if (canApprove) void approveConstructionOrganizationDraft(draft)
                                  else if (canReleaseExitHandoff) void submitConstructionOrganizationReleaseExitHandoff(draft)
                                }}
                              >
                                {canRuntimeApply ? '执行受控物化' : draft.releaseExitHandoff ? '已交接候选' : canReleaseExitHandoff ? '提交 release-exit 交接' : draft.manualReviewApproval ? '已批准' : draft.manualReviewHandoff ? '批准人工审阅' : '送人工审阅'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">候选方案对比包</h3>
                  <Badge variant="secondary">{formatNumber(optionComparisonPackage?.totalOptionCount ?? 0)} 套</Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  只读比较三入口评分、运行证据缺口和下一步治理动作，不自动物化。
                </p>
                <div className="mt-3 space-y-2">
                  {optionComparisonItems.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      暂无候选对比证据。
                    </div>
                  ) : optionComparisonItems.map((option) => (
                    <div key={option.draftNetworkKey} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium text-slate-800">{option.optionId ?? option.draftNetworkKey}</p>
                        <Badge variant={option.isRecommendedFor.length > 0 ? 'default' : 'secondary'}>
                          {option.isRecommendedFor.length > 0 ? '已推荐' : '候选'}
                        </Badge>
                      </div>
                      <div className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                        <div>{optionScoreLine('newProjectPlanning', option.useCaseScores.newProjectPlanning)}</div>
                        <div>{optionScoreLine('startingLineOnboarding', option.useCaseScores.startingLineOnboarding)}</div>
                        <div>{optionScoreLine('accelerationRecovery', option.useCaseScores.accelerationRecovery)}</div>
                        <div className="font-medium text-amber-700">{engineGapLine(option.missingRuntimeEngineCodes)}</div>
                        <div className="font-medium text-amber-700">{runtimeMaterializationEvidenceLine(option.runtimeMaterializationEvidence)}</div>
                        <div>{runtimeUseCaseCoverageLine('newProjectPlanning', option.runtimeMaterializationEvidence)}</div>
                        <div>{runtimeUseCaseCoverageLine('startingLineOnboarding', option.runtimeMaterializationEvidence)}</div>
                        <div>{runtimeUseCaseCoverageLine('accelerationRecovery', option.runtimeMaterializationEvidence)}</div>
                        <div>下一步：{optionNextGovernanceActionLine(option)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <h3 className="text-sm font-semibold text-slate-900">推荐草案</h3>
              <div className="mt-3 space-y-3">
                {(['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'] as const).map((key) => {
                  const item = draftReport?.recommendedDrafts[key]
                  return (
                    <div key={key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-700">{formatUseCaseLabel(key)}</p>
                        <Badge variant={item?.readiness === 'ready_for_replay' ? 'default' : 'secondary'}>
                          {item?.readiness ?? '暂无'}
                        </Badge>
                      </div>
                      <p className="mt-2 truncate text-xs text-slate-500">{item?.optionId ?? '-'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        恢复 {item?.e5RecoverableSpanDays ?? 0} 天 · {item?.actionability ?? 'unknown'}
                      </p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
                当前选择：{selectedDraft?.optionId ?? selectedDraft?.draftNetworkKey ?? '-'}。
                送审会调用固定 writer，并保留 release exit、监控和回滚前置要求。
                {selectedDraft?.releaseExitAssessment ? (
                  <span className="mt-2 block">
                    Release-exit：{selectedDraft.releaseExitAssessment.status === 'release_exit_blocked' ? '未就绪' : '需先送审'}；
                    {compactList(selectedDraft.releaseExitAssessment.requiredBeforeRuntime, 6)}
                  </span>
                ) : null}
                {selectedDraft?.releaseExitPreparation ? (
                  <span className="mt-2 block">
                    release-exit 准备包已形成：{selectedDraft.releaseExitPreparation.proposedDependencyEdgeCount} 条候选依赖；
                    {selectedDraft.releaseExitPreparation.domainWriterKey}
                  </span>
                ) : null}
                {selectedDraft?.domainWriterReleaseExitReadiness ? (
                  <span className="mt-2 block">
                    domain-writer release-exit 未就绪：
                    {compactList(selectedDraft.domainWriterReleaseExitReadiness.requiredEvidenceBeforeDomainWriter, 5)}
                  </span>
                ) : null}
                {draftReport?.runtimeMaterializationReadiness ? (
                  <span className="mt-2 block">
                    运行期物化：{runtimeMaterializationReadinessLine(draftReport.runtimeMaterializationReadiness)}；
                    {compactList(draftReport.runtimeMaterializationReadiness.missingBeforeRuntime, 5)}
                  </span>
                ) : null}
                {draftReport?.runtimeCloseoutClaim ? (
                  <span className="mt-2 block">
                    {runtimeCloseoutClaimLine(draftReport.runtimeCloseoutClaim)}
                  </span>
                ) : null}
                {draftReport?.runtimeRecommendedOption ? (
                  <div className="mt-2 space-y-2">
                    <span className="block">
                      {runtimeRecommendedOptionLine(draftReport.runtimeRecommendedOption)}；
                      需人工确认，不自动采纳，不直接写计划或依赖
                    </span>
                    <span className="block">
                      {recommendationDecisionLine(draftReport.runtimeRecommendedOption.siteDecision)}
                    </span>
                    {draftReport.runtimeRecommendedOption.status === 'runtime_recommended_option_ready' ? (
                      <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                          disabled={operationLoading || !canUseConstructionOrganizationEvidenceAction || !runtimeRecommendationIdentity(draftReport.runtimeRecommendedOption) || !(draftReport.projectId ?? optionalText(draftProjectId))}
                          title={!canUseConstructionOrganizationEvidenceAction ? constructionOrganizationEvidenceGuardReason : undefined}
                          onClick={() => void recordConstructionOrganizationRecommendationDecision('runtime_recommendation_adopt')}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {recommendationActionButtonLabel(draftReport.runtimeRecommendedOption.siteDecision)}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={operationLoading || !canUseConstructionOrganizationEvidenceAction || !runtimeRecommendationIdentity(draftReport.runtimeRecommendedOption) || !(draftReport.projectId ?? optionalText(draftProjectId))}
                          title={!canUseConstructionOrganizationEvidenceAction ? constructionOrganizationEvidenceGuardReason : undefined}
                          onClick={() => void recordConstructionOrganizationRecommendationDecision('runtime_recommendation_decline')}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          不采纳
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">受控操作交接</h2>
            <p className="mt-1 text-xs text-slate-500">
              仅调用后台 operations 合同，展示阻断或委托结果；工作台本身不写 runtime，不绕过锚点和成熟度门禁。
            </p>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault()
                void submitOperation()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="operation-action">操作动作</Label>
                <select
                  id="operation-action"
                  name="action"
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  value={operationForm.action}
                  onChange={(event) => updateOperationForm('action', event.target.value as RuleAssetGovernanceWorkbenchOperationAction)}
                >
                  <option value="release_exit_handoff">release_exit_handoff</option>
                  <option value="manual_review_handoff">manual_review_handoff</option>
                  <option value="manual_conflict_review">manual_conflict_review</option>
                  <option value="manual_review_approval">manual_review_approval</option>
                  <option value="runtime_apply">runtime_apply</option>
                  <option value="runtime_impact_monitoring">runtime_impact_monitoring</option>
                  <option value="runtime_rollback_execution">runtime_rollback_execution</option>
                  <option value="runtime_consumer_observation">runtime_consumer_observation</option>
                  <option value="runtime_engine_evidence">runtime_engine_evidence</option>
                  <option value="runtime_saved_outcome">runtime_saved_outcome</option>
                  <option value="runtime_recommendation_adopt">runtime_recommendation_adopt</option>
                  <option value="runtime_recommendation_decline">runtime_recommendation_decline</option>
                  <option value="runtime_rollback">runtime_rollback</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-asset-type">资产类型</Label>
                <select
                  id="operation-asset-type"
                  name="assetType"
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  value={operationForm.assetType}
                  onChange={(event) => updateOperationForm('assetType', event.target.value as RuleAssetGovernanceWorkbenchAssetType)}
                >
                  <option value="learnable_parameter">learnable_parameter</option>
                  <option value="algorithm_seed">algorithm_seed</option>
                  <option value="policy_template">policy_template</option>
                  <option value="forecast_residual_overlay">forecast_residual_overlay</option>
                  <option value="cold_start_baseline">cold_start_baseline</option>
                  <option value="sample_health">sample_health</option>
                  <option value="dependency_rule">dependency_rule</option>
                  <option value="template_seed">template_seed</option>
                  <option value="construction_organization_plan_network">construction_organization_plan_network</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-evidence-token">证据令牌</Label>
                <Input
                  id="operation-evidence-token"
                  name="evidenceToken"
                  value={operationForm.evidenceToken}
                  onChange={(event) => updateOperationForm('evidenceToken', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-project-id">project ID</Label>
                <Input
                  id="operation-project-id"
                  name="projectId"
                  value={operationForm.projectId}
                  onChange={(event) => updateOperationForm('projectId', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-company-id">company ID</Label>
                <Input
                  id="operation-company-id"
                  name="companyId"
                  value={operationForm.companyId}
                  onChange={(event) => updateOperationForm('companyId', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-requested-by-user-id">requested by</Label>
                <Input
                  id="operation-requested-by-user-id"
                  name="requestedByUserId"
                  value={operationForm.requestedByUserId}
                  onChange={(event) => updateOperationForm('requestedByUserId', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-executed-at">executed at</Label>
                <Input
                  id="operation-executed-at"
                  name="executedAt"
                  value={operationForm.executedAt}
                  onChange={(event) => updateOperationForm('executedAt', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-business-type">业务类型</Label>
                <Input
                  id="operation-business-type"
                  name="businessType"
                  value={operationForm.businessType}
                  onChange={(event) => updateOperationForm('businessType', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-domain-writer">domain writer</Label>
                <Input
                  id="operation-domain-writer"
                  name="domainWriterKey"
                  value={operationForm.domainWriterKey}
                  onChange={(event) => updateOperationForm('domainWriterKey', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-source-publication">source publication</Label>
                <Input
                  id="operation-source-publication"
                  name="sourcePublicationKey"
                  value={operationForm.sourcePublicationKey}
                  onChange={(event) => updateOperationForm('sourcePublicationKey', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-option-id">option id</Label>
                <Input
                  id="operation-option-id"
                  name="optionId"
                  value={operationForm.optionId}
                  onChange={(event) => updateOperationForm('optionId', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-draft-network-key">draft network key</Label>
                <Input
                  id="operation-draft-network-key"
                  name="draftNetworkKey"
                  value={operationForm.draftNetworkKey}
                  onChange={(event) => updateOperationForm('draftNetworkKey', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-release-record-target">release record target</Label>
                <Input
                  id="operation-release-record-target"
                  name="releaseRecordTarget"
                  value={operationForm.releaseRecordTarget}
                  onChange={(event) => updateOperationForm('releaseRecordTarget', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-rollback-target">rollback target</Label>
                <Input
                  id="operation-rollback-target"
                  name="rollbackTarget"
                  value={operationForm.rollbackTarget}
                  onChange={(event) => updateOperationForm('rollbackTarget', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-engine-code">engine code</Label>
                <select
                  id="operation-engine-code"
                  name="engineCode"
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  value={operationForm.engineCode}
                  onChange={(event) => updateOperationForm('engineCode', event.target.value)}
                >
                  <option value="">选择引擎</option>
                  <option value="standard_duration_reference">standard_duration_reference</option>
                  <option value="critical_path_cpm">critical_path_cpm</option>
                  <option value="schedule_acceleration_target">schedule_acceleration_target</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-engine-duration">predicted / actual days</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    id="operation-engine-duration"
                    name="predictedDurationDays"
                    inputMode="numeric"
                    value={operationForm.predictedDurationDays}
                    onChange={(event) => updateOperationForm('predictedDurationDays', event.target.value)}
                  />
                  <Input
                    aria-label="actual duration days"
                    name="actualDurationDays"
                    inputMode="numeric"
                    value={operationForm.actualDurationDays}
                    onChange={(event) => updateOperationForm('actualDurationDays', event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-overlay-key">overlay key</Label>
                <Input
                  id="operation-overlay-key"
                  name="overlayKey"
                  value={operationForm.overlayKey}
                  onChange={(event) => updateOperationForm('overlayKey', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operation-baseline-key">baseline / segment</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    id="operation-baseline-key"
                    name="baselineKey"
                    value={operationForm.baselineKey}
                    onChange={(event) => updateOperationForm('baselineKey', event.target.value)}
                  />
                  <Input
                    aria-label="segment key"
                    name="segmentKey"
                    value={operationForm.segmentKey}
                    onChange={(event) => updateOperationForm('segmentKey', event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="operation-consumer-refs">consumer / monitoring / writer refs</Label>
                <div className="grid gap-2 lg:grid-cols-3">
                  <Textarea
                    id="operation-consumer-refs"
                    name="consumerVerificationRefs"
                    value={operationForm.consumerVerificationRefs}
                    onChange={(event) => updateOperationForm('consumerVerificationRefs', event.target.value)}
                  />
                  <Textarea
                    aria-label="impact monitoring refs"
                    name="impactMonitoringRefs"
                    value={operationForm.impactMonitoringRefs}
                    onChange={(event) => updateOperationForm('impactMonitoringRefs', event.target.value)}
                  />
                  <Textarea
                    aria-label="rollback writer refs"
                    name="rollbackWriterRefs"
                    value={operationForm.rollbackWriterRefs}
                    onChange={(event) => updateOperationForm('rollbackWriterRefs', event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="operation-selected-scenario-ids">selected scenario IDs</Label>
                <Textarea
                  id="operation-selected-scenario-ids"
                  name="selectedScenarioIds"
                  value={operationForm.selectedScenarioIds}
                  onChange={(event) => updateOperationForm('selectedScenarioIds', event.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="operation-manual-conflict-review-decision">人工冲突复核结论</Label>
                <select
                  id="operation-manual-conflict-review-decision"
                  name="manualConflictReviewDecision"
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  value={operationForm.manualConflictReviewDecision}
                  onChange={(event) => updateOperationForm('manualConflictReviewDecision', event.target.value as OperationFormState['manualConflictReviewDecision'])}
                >
                  <option value="">不提交冲突复核结论</option>
                  <option value="approved_ready_for_replay">approved_ready_for_replay</option>
                  <option value="rejected_needs_plan_date_adjustment">rejected_needs_plan_date_adjustment</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="operation-rollback-reason">operation reason</Label>
                <Textarea
                  id="operation-rollback-reason"
                  name="rollbackReason"
                  value={operationForm.rollbackReason}
                  onChange={(event) => updateOperationForm('rollbackReason', event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  disabled={operationLoading || operationFormBlockedByV14231ActionGuard}
                  title={operationButtonTitle}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {operationLoading ? '提交中' : '提交受控操作'}
                </Button>
              </div>
            </form>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">操作结果</h3>
              {operationError ? (
                <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {operationError}
                </div>
              ) : null}
              {operationResult ? (
                <div className="mt-3 space-y-3 text-xs text-slate-600">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={operationResult.status === 'operation_delegated' ? 'default' : 'secondary'}>
                      {operationResult.status}
                    </Badge>
                    <Badge variant="outline">delegated={String(operationResult.delegatedToDomainWriter)}</Badge>
                    <Badge variant="outline">writesRuntimeDirectly={String(operationResult.writesRuntimeDirectly)}</Badge>
                    <Badge variant="outline">grantPublishRights={String(!operationResult.workbenchDoesNotGrantPublishRights)}</Badge>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">reasons</p>
                    <p className="mt-1 leading-5">{compactList(operationResult.reasons)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">boundary policy</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {operationResult.boundaryPolicy.map((item) => (
                        <Badge key={item} variant="outline">{item}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">domain writer</p>
                    <p className="mt-1">{operationResult.domainWriterKey ?? '-'}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  尚未提交；结果区会展示 blocked / delegated 状态、原因和边界策略。
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">治理门禁</h2>
              <p className="mt-1 text-xs text-slate-500">只读展示 evidence / gap / blocker，不提供发布、批准或回滚操作。</p>
            </div>
            <Badge variant={report?.canDeclareGovernanceWorkbenchComplete ? 'default' : 'secondary'}>
              {report?.status ?? 'loading'}
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-56 px-4 py-3">gate</th>
                  <th className="w-36 px-4 py-3">状态</th>
                  <th className="w-80 px-4 py-3">证据</th>
                  <th className="px-4 py-3">缺口 / blocker</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500">正在读取治理 readiness...</td>
                  </tr>
                ) : gates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500">暂无治理门禁数据。</td>
                  </tr>
                ) : gates.map((gate) => (
                  <tr key={gate.key} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        {gate.status === 'ready' ? (
                          <Database className="mt-0.5 h-4 w-4 text-blue-600" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                        )}
                        <div>
                          <div className="font-medium text-slate-900">{GATE_LABELS[gate.key] ?? gate.key}</div>
                          <div className="text-xs text-slate-500">{gate.key}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(gate.status)}>{statusLabel(gate.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-slate-600">
                      <div>{compactList(gate.evidenceRefs)}</div>
                      {gateDetailLine(gate) ? (
                        <div className="mt-1 font-medium text-blue-700">{gateDetailLine(gate)}</div>
                      ) : null}
                      {productOutcomeNextEvidenceWorkItems(gate).length > 0 || productOutcomeWorkbenchOperationSuggestions(gate).length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {productOutcomeWorkbenchOperationSuggestions(gate).map((suggestion, suggestionIndex) => {
                            const action = String(suggestion.action ?? '').trim()
                            const businessType = String(suggestion.businessType ?? '').trim()
                            const evidenceAction = String(suggestion.evidenceAction ?? '').trim()
                            const engineCode = String(suggestion.engineCode ?? '').trim()
                            const actionLabel = PRODUCT_OUTCOME_ACTION_LABELS[evidenceAction] ?? action
                            const missingFields = detailStringArray(suggestion, 'missingRequiredFields')
                            const canSubmit = suggestion.canSubmitControlledOperation !== false
                            const label = [
                              businessType || `建议 ${formatNumber(suggestionIndex + 1)}`,
                              actionLabel,
                              engineCode,
                            ].filter(Boolean).join('/')
                            return (
                              <div key={`operation-suggestion-${label}-${suggestionIndex}`} className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={canSubmit ? 'default' : 'outline'}
                                  disabled={!canSubmit}
                                  onClick={() => fillOperationFromSuggestion(suggestion)}
                                >
                                  填入建议 {label}
                                </Button>
                                {missingFields.length > 0 ? (
                                  <span className="text-xs font-medium text-amber-700">
                                    缺字段 {missingFields.join('、')}
                                  </span>
                                ) : null}
                              </div>
                            )
                          })}
                          {productOutcomeNextEvidenceWorkItems(gate).flatMap((item, itemIndex) => {
                            const operations = detailRecordArray(item, 'nextEvidenceOperations')
                            if (operations.length === 0) return []
                            return operations.filter(isProductOutcomeControlledOperation).map((operation, operationIndex) => {
                              const operationAction = String(operation.operationAction ?? '').trim()
                              const businessType = String(item.businessType ?? '').trim()
                              const projectId = firstDetailString(item, 'runtimeEvidenceProjectIds')
                              const evidenceAction = String(operation.evidenceAction ?? '').trim()
                              const actionLabel = PRODUCT_OUTCOME_ACTION_LABELS[evidenceAction] ?? operationAction
                              const label = businessType && operationAction
                                ? `${businessType}/${actionLabel}`
                                : businessType || projectId || `补证项 ${formatNumber(itemIndex + 1)}`
                              return (
                              <Button
                                key={`${label}-${itemIndex}-${operationIndex}`}
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!operationAction}
                                onClick={() => fillOperationFromProductOutcomeWorkItem(item, operation)}
                              >
                                填入补证操作 {label}
                              </Button>
                              )
                            })
                          })}
                          {productOutcomeExecutionPlanItems(gate).flatMap((planItem, planIndex) => {
                            const workItem = findProductOutcomeWorkItemForPlan(productOutcomeNextEvidenceWorkItems(gate), planItem)
                            if (!workItem) return []
                            const operationAction = String(planItem.operationAction ?? '').trim()
                            const evidenceAction = String(planItem.evidenceAction ?? '').trim()
                            const businessType = String(planItem.businessType ?? '').trim()
                            const useCase = String(planItem.useCase ?? '').trim()
                            if (!operationAction || !evidenceAction || !businessType) return []
                            if (!isProductOutcomeControlledOperation(planItem)) return []
                            const useCaseLabel = PRODUCT_OUTCOME_USE_CASE_LABELS[useCase] ?? (useCase || '通用')
                            const actionLabel = PRODUCT_OUTCOME_ACTION_LABELS[evidenceAction] ?? operationAction
                            const label = `${businessType}/${useCaseLabel}/${actionLabel}`
                            return productOutcomeExecutionPlanButtonOptions(planItem).map((engineOption) => (
                              <Button
                                key={`execution-plan-${label}-${engineOption.label || 'default'}-${planIndex}`}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => fillOperationFromProductOutcomeWorkItem(
                                  workItem,
                                  planItem,
                                  engineOption.engineCode ? { engineCode: engineOption.engineCode } : undefined,
                                )}
                              >
                                填入执行队列 {label}{engineOption.label ? `/${engineOption.label}` : ''}
                              </Button>
                            ))
                          })}
                          {productOutcomeEvidenceWorkPackages(gate).flatMap((workPackage, packageIndex) => {
                            const businessType = String(workPackage.businessType ?? '').trim()
                            return detailRecordArray(workPackage, 'executionSteps').flatMap((step, stepIndex) => {
                              const operationAction = String(step.operationAction ?? '').trim()
                              const useCase = String(step.useCase ?? '').trim()
                              if (!businessType || !operationAction) return []
                              if (!isProductOutcomeControlledOperation(step)) return []
                              const useCaseLabel = PRODUCT_OUTCOME_USE_CASE_LABELS[useCase] ?? (useCase || '通用')
                              const label = `${businessType}/${useCaseLabel}/${operationAction}`
                              return productOutcomeExecutionPlanButtonOptions(step).map((engineOption) => (
                                <Button
                                  key={`work-package-step-${label}-${engineOption.label || 'default'}-${packageIndex}-${stepIndex}`}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={step.canPrefillControlledOperation === false}
                                  onClick={() => fillOperationFromProductOutcomeWorkItem(
                                    step,
                                    step,
                                    engineOption.engineCode ? { engineCode: engineOption.engineCode } : undefined,
                                  )}
                                >
                                  填入工作包步骤 {label}{engineOption.label ? `/${engineOption.label}` : ''}
                                </Button>
                              ))
                            })
                          })}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-slate-600">{compactList(gate.missingReasons)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">保守默认待补</h2>
            <p className="mt-1 text-xs text-slate-500">这些资产已进入自动发现准入，但仍需补显式四元登记；该清单不授予发布权。</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-64 px-4 py-3">资产</th>
                  <th className="w-36 px-4 py-3">工期相关</th>
                  <th className="w-40 px-4 py-3">learning target</th>
                  <th className="px-4 py-3">原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">正在读取保守默认清单...</td>
                  </tr>
                ) : governanceDefaultReviewItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">暂无保守默认待补资产。</td>
                  </tr>
                ) : governanceDefaultReviewItems.slice(0, 12).map((item) => (
                  <tr key={`${item.assetKey}:${item.sourcePath}`} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{item.assetKey}</div>
                      <div className="truncate text-xs text-slate-500">{item.sourcePath}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={item.durationRelated ? 'default' : 'secondary'}>
                        {item.durationRelated ? '工期相关' : '非工期'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{item.learningTarget}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">剩余闭环缺口</h2>
            <p className="mt-1 text-xs text-slate-500">readiness 只证明后台证据链可读；以下项目仍不能由工作台状态外推为全文完成。</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-72 px-4 py-3">缺口</th>
                  <th className="w-72 px-4 py-3">所需证据</th>
                  <th className="px-4 py-3">边界原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">正在读取剩余闭环缺口...</td>
                  </tr>
                ) : remainingClosureGaps.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">暂无结构化剩余闭环缺口。</td>
                  </tr>
                ) : remainingClosureGaps.map((gap) => (
                  <tr key={gap.key} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{gap.key}</div>
                      <div className="text-xs text-slate-500">{gap.status}</div>
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-slate-600">{compactList(gap.evidenceRequired)}</td>
                    <td className="px-4 py-3 text-xs leading-5 text-slate-600">{gap.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">边界策略</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(report?.boundaryPolicy ?? []).map((item) => (
              <Badge key={item} variant="outline">{item}</Badge>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
