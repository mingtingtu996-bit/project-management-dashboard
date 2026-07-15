import type { LifecycleStatus } from '../preMilestonesLifecycle'

export type PreMilestonesViewMode = 'list' | 'timeline'
export type PreMilestoneDialogMode = 'create' | 'edit' | 'conditions' | null

export interface ProjectOption {
  id: string
  name: string
}

export interface PreMilestone {
  id: string
  project_id: string
  milestone_type: string
  name: string
  description?: string
  status: LifecycleStatus
  lead_unit?: string
  planned_start_date?: string
  planned_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  responsible_user_id?: string
  sort_order: number
  notes?: string
  certificate_no?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface PreMilestoneDependency {
  id: string
  pre_milestone_id: string
  depends_on_id: string
  dependency_kind?: 'hard' | 'soft'
}

export interface PreMilestoneCondition {
  id: string
  pre_milestone_id: string
  condition_type: string
  condition_name: string
  description?: string
  status: '待满足' | '已满足' | '未满足' | '已确认' | string
  is_satisfied?: boolean
  responsible_person?: string
  due_date?: string
  target_date?: string
  completed_date?: string
  completed_by?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: string
}

export interface PreMilestoneFormData {
  project_id: string
  milestone_type: string
  name: string
  description: string
  lead_unit: string
  planned_start_date: string
  planned_end_date: string
  responsible_user_id: string
  sort_order: number
  notes: string
  status: LifecycleStatus
  certificate_no: string
  issue_date: string
  expiry_date: string
  issuing_authority: string
  phase_id: string
}

export interface ConditionFormData {
  condition_type: string
  condition_name: string
  description: string
  target_date: string
}

export interface LifecycleSummaryStats {
  totalCount: number
  completedCount: number
  inProgressCount: number
  notStartedCount: number
  delayedCount: number
  canceledCount: number
  completionRate: number
}

export interface LifecycleStatusOption {
  value: LifecycleStatus | 'all'
  label: string
}

export interface CertificateTypeRegistryEntry<TType extends string = string> {
  type: TType
  label: string
  aliases?: readonly string[]
}

export const CERTIFICATE_TYPE_REGISTRY = [
  {
    type: 'land_certificate',
    label: '土地证',
    aliases: ['land', 'land_certificate', '土地证', '国有土地使用证', '土地使用权证'],
  },
  {
    type: 'land_use_planning_permit',
    label: '用地规划许可证',
    aliases: ['land_use', 'land_use_planning_permit', '用地规划', '用地规划许可证'],
  },
  {
    type: 'engineering_planning_permit',
    label: '工程规划许可证',
    aliases: ['engineering', 'engineering_planning_permit', '工程规划', '工程规划许可证'],
  },
  {
    type: 'construction_permit',
    label: '施工许可证',
    aliases: ['construction', 'construction_permit', '施工许可', '施工许可证'],
  },
] as const satisfies readonly CertificateTypeRegistryEntry<string>[]

export type KnownCertificateType = (typeof CERTIFICATE_TYPE_REGISTRY)[number]['type']

export const CERTIFICATE_TYPE_VALUES = CERTIFICATE_TYPE_REGISTRY.map((entry) => entry.type) as KnownCertificateType[]

export type CertificateType = KnownCertificateType | string
export const CERTIFICATE_TYPE_LABELS = Object.fromEntries(
  CERTIFICATE_TYPE_REGISTRY.map((entry) => [entry.type, entry.label]),
) as Record<KnownCertificateType, string>
export type CertificateStage = '资料准备' | '内部报审' | '外部报批' | '批复领证'
export type CertificateStatus =
  | 'pending'
  | 'preparing_documents'
  | 'internal_review'
  | 'external_submission'
  | 'supplement_required'
  | 'approved'
  | 'issued'
  | 'expired'
  | 'voided'

export interface CertificateBoardItem {
  id: string
  certificate_type: CertificateType
  certificate_name: string
  status: CertificateStatus | string
  current_stage: CertificateStage | string
  planned_finish_date?: string | null
  actual_finish_date?: string | null
  approving_authority?: string | null
  next_action?: string | null
  next_action_due_date?: string | null
  is_blocked: boolean
  block_reason?: string | null
  latest_record_at?: string | null
  work_item_ids: string[]
  shared_work_item_ids: string[]
  document_no?: string | null
  issuing_authority?: string | null
}

export interface CertificateBoardCriticalItem {
  itemType: 'certificate' | 'work_item'
  itemId: string
  title: string
  status: string
  plannedFinishDate?: string | null
  dueDate?: string | null
  blockReason?: string | null
  isOverdue: boolean
}

export interface CertificateSharedRibbonItem {
  work_item_id: string
  item_name: string
  item_stage: CertificateStage | string
  status: CertificateStatus | string
  is_shared: boolean
  certificate_types: CertificateType[]
  certificate_names: string[]
  blocking_certificate_types: CertificateType[]
  dependency_count: number
  next_action?: string | null
  next_action_due_date?: string | null
  block_reason?: string | null
  planned_finish_date?: string | null
}

export interface CertificateWorkItem {
  id: string
  project_id: string
  item_code?: string | null
  item_name: string
  item_stage: CertificateStage | string
  status: CertificateStatus | string
  planned_finish_date?: string | null
  actual_finish_date?: string | null
  approving_authority?: string | null
  is_shared?: boolean | null
  next_action?: string | null
  next_action_due_date?: string | null
  is_blocked?: boolean | null
  block_reason?: string | null
  sort_order?: number | null
  notes?: string | null
  latest_record_at?: string | null
  certificate_ids?: string[]
  linked_issue_id?: string | null
  linked_risk_id?: string | null
  created_at: string
  updated_at: string
}

export type CertificateDependencyTargetType = 'certificate' | 'work_item'
export type CertificateDependencyKind = 'hard' | 'soft'

export interface CertificateDependency {
  id: string
  project_id: string
  predecessor_type: CertificateDependencyTargetType
  predecessor_id: string
  successor_type: CertificateDependencyTargetType
  successor_id: string
  dependency_kind: CertificateDependencyKind
  notes?: string | null
  created_at: string
}

export interface CertificateStatusRecord {
  id: string
  project_id: string
  target_type: 'certificate' | 'work_item'
  target_id: string
  record_type: 'status_change' | 'supplement_required' | 'condition_satisfied' | 'blocked' | 'unblocked' | 'note'
  from_status?: string | null
  to_status?: string | null
  content?: string | null
  recorded_at: string
  recorded_by?: string | null
}

export interface CertificateLinkedWarning {
  id: string
  project_id?: string
  task_id?: string | null
  warning_type: string
  warning_level: 'info' | 'warning' | 'critical' | string
  title: string
  description: string
  is_acknowledged?: boolean
  created_at: string
}

export interface CertificateLinkedIssue {
  id: string
  project_id?: string
  task_id?: string | null
  title: string
  description?: string | null
  severity: 'critical' | 'high' | 'medium' | 'low' | string
  status: 'open' | 'investigating' | 'resolved' | 'closed' | string
  source_type: string
  source_id?: string | null
  chain_id?: string | null
  pending_manual_close?: boolean
  version?: number
  created_at: string
  updated_at: string
}

export interface CertificateLinkedRisk {
  id: string
  project_id?: string
  task_id?: string | null
  title: string
  description?: string | null
  level: 'critical' | 'high' | 'medium' | 'low' | string
  status: 'identified' | 'mitigating' | 'closed' | string
  source_type: string
  source_id?: string | null
  chain_id?: string | null
  linked_issue_id?: string | null
  pending_manual_close?: boolean
  closed_reason?: string | null
  closed_at?: string | null
  version?: number
  created_at: string
  updated_at: string
}

export interface CertificateDependencyMatrixCell {
  work_item_id: string
  work_item_name: string
  status: 'satisfied' | 'pending' | 'blocked' | 'none'
  dependency_kind?: CertificateDependencyKind | null
  is_shared: boolean
}

export interface CertificateDependencyMatrixRow {
  certificate_id: string
  certificate_type: CertificateType
  certificate_name: string
  cells: CertificateDependencyMatrixCell[]
}

export interface CertificateBoardSummary {
  completedCount: number
  totalCount: number
  blockingCertificateType: CertificateType | null
  expectedReadyDate: string | null
  overdueCount: number
  supplementCount: number
  weeklyActionCount: number
  criticalItems: CertificateBoardCriticalItem[]
}

export interface CertificateBoardResponse {
  summary: CertificateBoardSummary
  certificates: CertificateBoardItem[]
  sharedItems: CertificateSharedRibbonItem[]
}

export interface CertificateLedgerResponse {
  items: CertificateWorkItem[]
  totals: {
    overdueCount: number
    blockedCount: number
    supplementCount: number
  }
}

export interface CertificateDetailResponse {
  certificate: CertificateBoardItem
  workItems: CertificateWorkItem[]
  dependencies: CertificateDependency[]
  records: CertificateStatusRecord[]
  dependencyMatrix: CertificateDependencyMatrixRow[]
  conditions: PreMilestoneCondition[]
  linkedWarnings: CertificateLinkedWarning[]
  linkedIssues: CertificateLinkedIssue[]
  linkedRisks: CertificateLinkedRisk[]
}

export interface CertificateWorkItemFormData {
  item_code: string
  item_name: string
  item_stage: CertificateStage
  status: CertificateStatus | string
  planned_finish_date: string
  actual_finish_date: string
  approving_authority: string
  is_shared: boolean
  next_action: string
  next_action_due_date: string
  is_blocked: boolean
  block_reason: string
  sort_order: number
  notes: string
  certificate_ids: string[]
}

export type CertificateTemplatePreviewAction = 'will_create' | 'will_skip_existing' | 'needs_confirmation'

export interface CertificateTemplatePreviewCertificate {
  key: KnownCertificateType
  certificateType: KnownCertificateType
  certificateName: string
  defaultStage: CertificateStage | string
  defaultStatus: CertificateStatus | string
  approvingAuthority: string
  requiredPolicy: string
  reason: string
  sortOrder: number
  action: CertificateTemplatePreviewAction
  selected: boolean
  existingId?: string | null
  skipReason?: string | null
}

export interface CertificateTemplatePreviewWorkItem {
  workItemCode: string
  itemName: string
  itemStage: CertificateStage | string
  defaultStatus: CertificateStatus | string
  approvingAuthority?: string | null
  isShared: boolean
  certificateTypes: KnownCertificateType[]
  requiredPolicy: string
  planRole: string
  criticality: 'blocking' | 'important' | 'normal' | string
  defaultNextAction: string
  sortOrder: number
  action: CertificateTemplatePreviewAction
  selected: boolean
  existingId?: string | null
  skipReason?: string | null
  sourceEvidence?: string[]
  landAcquisitionMethodCodes?: LandAcquisitionMethodCode[]
  provinceProfileCodes?: string[]
}

export type CertificateTemplateDependencyEndpoint =
  | { type: 'certificate'; certificateType: KnownCertificateType }
  | { type: 'work_item'; workItemCode: string }

export interface CertificateTemplatePreviewDependency {
  dependencyCode: string
  predecessor: CertificateTemplateDependencyEndpoint
  successor: CertificateTemplateDependencyEndpoint
  dependencyKind: CertificateDependencyKind
  relationRole: string
  reason: string
  action: CertificateTemplatePreviewAction
  selected: boolean
  skipReason?: string | null
  provinceProfileCodes?: string[]
}

export interface CertificateTemplatePreviewWarning {
  code: string
  message: string
  severity: 'info' | 'warning'
}

export type LandAcquisitionMethodCode = 'transfer' | 'allocation' | 'existing_land' | 'redevelopment'

export interface CertificateTemplateLandAcquisitionMethod {
  methodCode: LandAcquisitionMethodCode
  methodName: string
  description: string
  defaultSelected?: boolean
  workItemCodes: string[]
  materialNames: string[]
  policyBasis: string[]
  recommendedFor: string[]
}

export interface CertificateTemplateMaterialPackage {
  packageCode: string
  packageName: string
  packageScope: 'certificate_common' | 'land_acquisition_method' | 'province_overlay' | 'city_overlay'
  certificateTypes: KnownCertificateType[]
  workItemCodes: string[]
  materialNames: string[]
  policyBasis: string[]
  requiredPolicy: string
  sortOrder: number
  source: 'seed' | 'land_acquisition_method' | 'province_profile' | 'city_override'
  selected: boolean
  methodCode?: LandAcquisitionMethodCode
  provinceCode?: string
  cityCode?: string
}

export interface CertificateTemplateMaterialEvidenceChain {
  materialCode: string
  materialName: string
  certificateType: KnownCertificateType
  handlingStepCode: string
  handlingStepName: string
  sourceParties: string[]
  handlingAuthority: string
  requiredSubmitMaterials: string[]
  outputDocument: string
  linkedWorkItemCodes: string[]
  linkedWorkItemNames: string[]
  materialPackageCodes: string[]
  materialPackageNames: string[]
  reusableForCertificateTypes: KnownCertificateType[]
  blockingLevel: 'certificate_gate' | 'startup_gate' | 'supporting'
}

export interface CertificateTemplateHandlingStep {
  stepCode: string
  certificateType: KnownCertificateType
  stepName: string
  sourceParties: string[]
  handlingAuthority: string
  submitMaterials: string[]
  outputDocument: string
  satisfiesMaterialCodes: string[]
  satisfiesMaterials: string[]
  reusableForCertificateTypes: KnownCertificateType[]
  blockingLevel: 'certificate_gate' | 'startup_gate' | 'supporting'
  sortOrder: number
}

export interface CertificateTemplateProvinceProfile {
  provinceCode: string
  provinceName: string
  profileVersion: string
  source?: 'project_static_profile' | 'project_metadata' | 'project_location' | 'default'
  applied?: boolean
  authorityAliases: Record<string, string>
  additionalWorkItemCodes: string[]
  optionalWorkItemCodes: string[]
  softDependencyCodes: string[]
  appliedWorkItemCodes?: string[]
  appliedSoftDependencyCodes?: string[]
  policySources: Array<{
    sourceName: string
    sourceUrl?: string
    checkedAt: string
    updateMode: 'governed_seed_update'
  }>
  notes: string[]
}

export interface CertificateTemplateProvinceRuleSource {
  recognizedProvinceCode: string
  recognizedProvinceName: string
  appliedProfileCode: string
  appliedProfileName: string
  source: 'project_static_profile' | 'project_metadata' | 'project_location' | 'default'
  recognitionAccuracy: 'profile_code' | 'province_alias' | 'default'
  updateMode: 'governed_seed_update'
  policyUpdatePolicy: 'trusted_source_auto_publish'
  sourceCheckedAt: string | null
  nextReviewDueAt: string | null
}

export interface CertificateTemplateCityOverride {
  overrideCode: string
  cityCode: string
  cityName: string
  provinceCode: string
  overrideScope?: 'city'
  profileVersion: string
  aliases: string[]
  source: 'project_static_profile' | 'project_metadata' | 'project_location'
  applied: boolean
  handlingAuthorityOverrides?: Record<string, string>
  reusableOutputOverrides?: Record<string, string[]>
  policySources: Array<{
    sourceName: string
    sourceUrl?: string
    checkedAt: string
    updateMode: 'governed_seed_update'
  }>
  notes: string[]
}

export interface CertificateTemplatePreview {
  templateCode: string
  templateName: string
  seedVersion: string
  projectId: string
  summary: {
    certificateCreateCount: number
    workItemCreateCount: number
    dependencyCreateCount: number
    skippedExistingCount: number
    needsConfirmationCount: number
  }
  certificates: CertificateTemplatePreviewCertificate[]
  workItems: CertificateTemplatePreviewWorkItem[]
  dependencies: CertificateTemplatePreviewDependency[]
  materialPackages?: CertificateTemplateMaterialPackage[]
  materialEvidenceChains?: CertificateTemplateMaterialEvidenceChain[]
  handlingSteps?: CertificateTemplateHandlingStep[]
  landAcquisition: {
    selectedMethodCode: LandAcquisitionMethodCode
    source: 'preview_option' | 'project_metadata' | 'default'
    methods: CertificateTemplateLandAcquisitionMethod[]
  }
  provinceProfile: CertificateTemplateProvinceProfile | null
  provinceRuleSource?: CertificateTemplateProvinceRuleSource
  cityOverride?: CertificateTemplateCityOverride | null
  warnings: CertificateTemplatePreviewWarning[]
}

export interface ApplyCertificateTemplateRequest {
  templateCode: string
  seedVersion: string
  selectedCertificateKeys: string[]
  selectedWorkItemCodes: string[]
  selectedDependencyCodes: string[]
  duplicatePolicy: 'skip_existing'
  landAcquisitionMethodCode?: LandAcquisitionMethodCode
}

export interface ApplyCertificateTemplateResult {
  templateCode: string
  seedVersion: string
  projectId: string
  createdCertificateIds: string[]
  createdWorkItemIds: string[]
  createdDependencyIds: string[]
  skippedExisting: Array<{
    entityType: 'certificate' | 'work_item' | 'dependency'
    key: string
    reason: string
  }>
}
