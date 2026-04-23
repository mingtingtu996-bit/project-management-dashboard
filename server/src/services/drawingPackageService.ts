import type { DrawingPackage, DrawingPackageItem, DrawingVersion } from '../types/db.js'

export type ReviewMode = 'mandatory' | 'optional' | 'none' | 'manual_confirm'
export const DRAWING_REVIEW_MODE_VALUES = ['mandatory', 'optional', 'none', 'manual_confirm'] as const

export interface DrawingPackageTemplateItem {
  itemCode: string
  itemName: string
  disciplineType?: string
  isRequired: boolean
  sortOrder: number
}

export interface DrawingPackageTemplate {
  templateCode: string
  templateName: string
  disciplineType: string
  documentPurpose: string
  defaultReviewMode: ReviewMode
  items: DrawingPackageTemplateItem[]
}

export type DrawingPackageSource = DrawingPackage
export type DrawingPackageItemSource = DrawingPackageItem

export interface DrawingRecordSource {
  id?: string | null
  project_id?: string | null
  package_id?: string | null
  package_code?: string | null
  package_name?: string | null
  package_status?: string | null
  drawing_type?: string | null
  drawing_code?: string | null
  drawing_name?: string | null
  discipline_type?: string | null
  document_purpose?: string | null
  parent_drawing_id?: string | null
  version_no?: string | null
  revision_no?: string | null
  issued_for?: string | null
  effective_date?: string | null
  version?: string | null
  drawing_status?: string | null
  status?: string | null
  is_current_version?: boolean | number | null
  requires_review?: boolean | number | null
  review_mode?: ReviewMode | string | null
  review_status?: string | null
  review_basis?: string | null
  planned_submit_date?: string | null
  actual_submit_date?: string | null
  planned_pass_date?: string | null
  actual_pass_date?: string | null
  drawing_date?: string | null
  design_unit?: string | null
  review_unit?: string | null
  has_change?: boolean | number | null
  change_reason?: string | null
  schedule_impact_flag?: boolean | number | null
  is_ready_for_construction?: boolean | number | null
  is_ready_for_acceptance?: boolean | number | null
  created_at?: string | null
  updated_at?: string | null
}

export type DrawingVersionRecordSource = DrawingVersion

export interface DrawingTaskSource {
  id?: string | null
  project_id?: string | null
  title?: string | null
  description?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface DrawingTaskConditionSource {
  id?: string | null
  task_id?: string | null
  project_id?: string | null
  condition_type?: string | null
  condition_name?: string | null
  description?: string | null
  drawing_package_id?: string | null
  drawing_package_code?: string | null
  status?: string | null
  is_satisfied?: boolean | number | null
  created_at?: string | null
  updated_at?: string | null
}

export interface DrawingAcceptancePlanSource {
  id?: string | null
  project_id?: string | null
  task_id?: string | null
  plan_name?: string | null
  acceptance_name?: string | null
  acceptance_type?: string | null
  status?: string | null
  planned_date?: string | null
  actual_date?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface DrawingAcceptanceRequirementSource {
  id?: string | null
  project_id?: string | null
  plan_id?: string | null
  requirement_type?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  drawing_package_id?: string | null
  description?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface DrawingAcceptanceRecordSource {
  id?: string | null
  project_id?: string | null
  plan_id?: string | null
  record_type?: string | null
  content?: string | null
  record_date?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface DrawingEscalatedIssueSource {
  id?: string | null
  project_id?: string | null
  title?: string | null
  description?: string | null
  source_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  created_at?: string | null
}

export interface DrawingEscalatedRiskSource {
  id?: string | null
  project_id?: string | null
  title?: string | null
  description?: string | null
  source_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  created_at?: string | null
}

export interface DrawingLinkedConditionView {
  id: string
  name: string
  status: string
  conditionType: string
  isSatisfied: boolean
}

export interface DrawingLinkedTaskView {
  id: string
  name: string
  status: string
  drawingConditionCount: number
  openConditionCount: number
  conditions: DrawingLinkedConditionView[]
}

export interface DrawingLinkedRequirementView {
  id: string
  requirementType: string
  sourceEntityType: string
  sourceEntityId: string
  description: string
  status: string
}

export interface DrawingLinkedAcceptanceView {
  id: string
  name: string
  status: string
  requirementCount: number
  openRequirementCount: number
  latestRecordAt: string | null
  requirements: DrawingLinkedRequirementView[]
}

export interface DrawingSignalView {
  code: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  evidence: string[]
  escalatedEntityType?: 'issue' | 'risk' | null
  escalatedEntityId?: string | null
  escalatedAt?: string | null
}

export interface DrawingPackageCurrentVersionTargetInput {
  packageId: string
  versionId?: string | null
  drawingId?: string | null
  versions: DrawingVersionRecordSource[]
  drawings: DrawingRecordSource[]
}

export interface DrawingPackageCurrentVersionTargetResult {
  targetVersion: DrawingVersionRecordSource | null
  targetDrawingId: string | null
  targetDrawing: DrawingRecordSource | null
  needsSnapshot: boolean
  error: {
    code: string
    message: string
    status: number
  } | null
}

export interface DrawingReviewRuleEvaluationInput {
  disciplineType?: string | null
  documentPurpose?: string | null
  packageCode?: string | null
  packageName?: string | null
  defaultReviewMode?: ReviewMode | string | null
  overrideReviewMode?: ReviewMode | string | null
  reviewBasis?: string | null
}

export interface DrawingReviewRuleEvaluationResult {
  requiresReview: boolean
  reviewMode: ReviewMode
  reviewBasis: string
}

export interface DrawingReviewRuleSource {
  id?: string | null
  project_id?: string | null
  package_code?: string | null
  discipline_type?: string | null
  document_purpose?: string | null
  default_review_mode?: ReviewMode | string | null
  review_basis?: string | null
  is_active?: boolean | number | null
  created_at?: string | null
  updated_at?: string | null
}

export interface DrawingPackageCard {
  packageId: string
  packageCode: string
  packageName: string
  disciplineType: string
  documentPurpose: string
  status: string
  requiresReview: boolean
  reviewMode: ReviewMode
  reviewModeLabel: string
  reviewBasis: string
  completenessRatio: number
  missingRequiredCount: number
  currentVersionDrawingId: string | null
  currentVersionNo: string
  currentVersionLabel: string
  currentReviewStatus: string
  hasChange: boolean
  scheduleImpactFlag: boolean
  isReadyForConstruction: boolean
  isReadyForAcceptance: boolean
  drawingsCount: number
  requiredItemsCount: number
  latestUpdateAt: string | null
  linkedTaskCount?: number
  linkedAcceptanceCount?: number
  linkedCertificateCount?: number
}

export interface DrawingBoardSummary {
  totalPackages: number
  missingPackages: number
  mandatoryReviewPackages: number
  reviewingPackages: number
  scheduleImpactCount: number
  readyForConstructionCount: number
  readyForAcceptanceCount: number
}

export interface DrawingLedgerRow {
  drawingId: string
  packageId: string
  packageCode: string
  packageName: string
  disciplineType: string
  documentPurpose: string
  drawingCode: string
  drawingName: string
  versionNo: string
  drawingStatus: string
  reviewStatus: string
  isCurrentVersion: boolean
  requiresReview: boolean
  reviewMode: ReviewMode
  reviewModeLabel: string
  reviewBasis: string
  hasChange: boolean
  scheduleImpactFlag: boolean
  plannedSubmitDate: string | null
  actualSubmitDate: string | null
  plannedPassDate: string | null
  actualPassDate: string | null
  designUnit: string | null
  reviewUnit: string | null
  createdAt: string | null
}

export interface DrawingPackageItemView {
  itemId: string
  itemCode: string
  itemName: string
  disciplineType: string
  isRequired: boolean
  status: 'missing' | 'available' | 'outdated'
  currentDrawingId: string | null
  currentVersion: string
  notes: string
  sortOrder: number
}

export interface DrawingVersionView {
  versionId: string
  drawingId: string
  parentDrawingId: string | null
  versionNo: string
  revisionNo: string | null
  issuedFor: string | null
  effectiveDate: string | null
  previousVersionId: string | null
  isCurrentVersion: boolean
  supersededAt: string | null
  changeReason: string
  createdAt: string | null
  createdBy: string
  drawingName: string
}

export interface DrawingPackageDetailView {
  package: DrawingPackageCard
  requiredItems: DrawingPackageItemView[]
  drawings: DrawingLedgerRow[]
  records: DrawingVersionView[]
  linkedTasks: DrawingLinkedTaskView[]
  linkedAcceptance: DrawingLinkedAcceptanceView[]
  issueSignals: DrawingSignalView[]
  riskSignals: DrawingSignalView[]
}

export const DEFAULT_DRAWING_PACKAGE_TEMPLATES: DrawingPackageTemplate[] = [
  {
    templateCode: 'architecture-construction',
    templateName: '建筑施工图包',
    disciplineType: '建筑',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
    items: [
      { itemCode: 'architecture-01', itemName: '平面图', isRequired: true, sortOrder: 1 },
      { itemCode: 'architecture-02', itemName: '立面图', isRequired: true, sortOrder: 2 },
      { itemCode: 'architecture-03', itemName: '剖面图', isRequired: true, sortOrder: 3 },
      { itemCode: 'architecture-04', itemName: '详图', isRequired: true, sortOrder: 4 },
    ],
  },
  {
    templateCode: 'structure-construction',
    templateName: '结构施工图包',
    disciplineType: '结构',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
    items: [
      { itemCode: 'structure-01', itemName: '基础图', isRequired: true, sortOrder: 1 },
      { itemCode: 'structure-02', itemName: '梁板配筋图', isRequired: true, sortOrder: 2 },
      { itemCode: 'structure-03', itemName: '柱墙配筋图', isRequired: true, sortOrder: 3 },
      { itemCode: 'structure-04', itemName: '节点详图', isRequired: true, sortOrder: 4 },
    ],
  },
  {
    templateCode: 'water-construction',
    templateName: '给排水施工图包',
    disciplineType: '给排水',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
    items: [
      { itemCode: 'water-01', itemName: '给水图', isRequired: true, sortOrder: 1 },
      { itemCode: 'water-02', itemName: '排水图', isRequired: true, sortOrder: 2 },
      { itemCode: 'water-03', itemName: '系统图', isRequired: true, sortOrder: 3 },
    ],
  },
  {
    templateCode: 'hvac-construction',
    templateName: '暖通施工图包',
    disciplineType: '暖通',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
    items: [
      { itemCode: 'hvac-01', itemName: '平面图', isRequired: true, sortOrder: 1 },
      { itemCode: 'hvac-02', itemName: '系统图', isRequired: true, sortOrder: 2 },
      { itemCode: 'hvac-03', itemName: '机房详图', isRequired: true, sortOrder: 3 },
    ],
  },
  {
    templateCode: 'electrical-construction',
    templateName: '电气施工图包',
    disciplineType: '电气',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
    items: [
      { itemCode: 'electrical-01', itemName: '配电图', isRequired: true, sortOrder: 1 },
      { itemCode: 'electrical-02', itemName: '弱电图', isRequired: true, sortOrder: 2 },
      { itemCode: 'electrical-03', itemName: '系统图', isRequired: true, sortOrder: 3 },
    ],
  },
  {
    templateCode: 'fire-review',
    templateName: '消防专项包',
    disciplineType: '消防',
    documentPurpose: '送审报批',
    defaultReviewMode: 'mandatory',
    items: [
      { itemCode: 'fire-01', itemName: '消防总说明', isRequired: true, sortOrder: 1 },
      { itemCode: 'fire-02', itemName: '平面与系统图', isRequired: true, sortOrder: 2 },
      { itemCode: 'fire-03', itemName: '设备详图', isRequired: true, sortOrder: 3 },
    ],
  },
  {
    templateCode: 'civil-defense-review',
    templateName: '人防专项包',
    disciplineType: '人防',
    documentPurpose: '送审报批',
    defaultReviewMode: 'mandatory',
    items: [
      { itemCode: 'civil-defense-01', itemName: '人防说明', isRequired: true, sortOrder: 1 },
      { itemCode: 'civil-defense-02', itemName: '人防平面图', isRequired: true, sortOrder: 2 },
    ],
  },
  {
    templateCode: 'completion-archive',
    templateName: '竣工归档包',
    disciplineType: '竣工归档',
    documentPurpose: '竣工归档',
    defaultReviewMode: 'manual_confirm',
    items: [
      { itemCode: 'completion-01', itemName: '竣工总说明', isRequired: true, sortOrder: 1 },
      { itemCode: 'completion-02', itemName: '竣工图目录', isRequired: true, sortOrder: 2 },
      { itemCode: 'completion-03', itemName: '各专业竣工图', isRequired: true, sortOrder: 3 },
    ],
  },
]

const DISCIPLINE_CODE_MAP: Record<string, string> = {
  总图: 'master-plan',
  建筑: 'architecture',
  结构: 'structure',
  给排水: 'water',
  暖通: 'hvac',
  电气: 'electrical',
  智能化: 'intelligent',
  消防: 'fire',
  人防: 'civil-defense',
  幕墙: 'curtain-wall',
  景观: 'landscape',
  精装: 'fit-out',
  市政配套: 'municipal',
  其他: 'other',
  竣工归档: 'completion',
}

const PURPOSE_CODE_MAP: Record<string, string> = {
  施工执行: 'execution',
  送审报批: 'review',
  变更修订: 'change',
  竣工归档: 'archive',
}

const REVIEW_MODE_LABELS: Record<ReviewMode, string> = {
  mandatory: '必审',
  optional: '可选',
  none: '不适用',
  manual_confirm: '人工确认',
}

const REVIEW_MODE_LABEL_TO_VALUE: Partial<Record<string, ReviewMode>> = {
  必审: 'mandatory',
  可选: 'optional',
  人工确认: 'manual_confirm',
  不适用: 'none',
}

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value.trim() || fallback
  }
  if (value == null) return fallback
  return String(value)
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function makePackageKey(disciplineType: string, documentPurpose: string) {
  const disciplineCode = DISCIPLINE_CODE_MAP[disciplineType] ?? `custom-${disciplineType}`
  const purposeCode = PURPOSE_CODE_MAP[documentPurpose] ?? `custom-${documentPurpose}`
  return `legacy-${disciplineCode}-${purposeCode}`
}

function selectCurrentDrawing(drawings: DrawingRecordSource[]) {
  const currentDrawings = drawings.filter((drawing) => toBoolean(drawing.is_current_version))
  if (currentDrawings.length === 0) {
    return drawings.slice().sort((left, right) => {
      const createdOrder = normalizeString(right.created_at, '').localeCompare(normalizeString(left.created_at, ''), 'zh-Hans-CN')
      if (createdOrder !== 0) return createdOrder
      return normalizeString(right.version_no ?? right.version, '').localeCompare(normalizeString(left.version_no ?? left.version, ''), 'zh-Hans-CN')
    })[0] ?? null
  }

  return currentDrawings.slice().sort((left, right) => {
    const createdOrder = normalizeString(right.created_at, '').localeCompare(normalizeString(left.created_at, ''), 'zh-Hans-CN')
    if (createdOrder !== 0) return createdOrder
    return normalizeString(right.version_no ?? right.version, '').localeCompare(normalizeString(left.version_no ?? left.version, ''), 'zh-Hans-CN')
  })[0] ?? null
}

export interface DrawingCurrentVersionPolicyInput {
  explicitCurrentVersion?: boolean | null
  targetPackageCurrentCount: number
  targetWasCurrent: boolean
}

export interface DrawingCurrentVersionPolicyResult {
  resolvedCurrentVersion: boolean
  error: {
    code: string
    message: string
    status: number
  } | null
}

export function resolveDrawingCurrentVersionPolicy(
  input: DrawingCurrentVersionPolicyInput,
): DrawingCurrentVersionPolicyResult {
  const targetPackageCurrentCount = Math.max(0, Math.floor(toNumber(input.targetPackageCurrentCount, 0)))
  const targetWasCurrent = toBoolean(input.targetWasCurrent)

  if (input.explicitCurrentVersion === true) {
    return {
      resolvedCurrentVersion: true,
      error: null,
    }
  }

  if (input.explicitCurrentVersion === false) {
    if (targetPackageCurrentCount === 0) {
      return {
        resolvedCurrentVersion: false,
        error: {
          code: 'MISSING_TARGET_DRAWING',
          message: '当前有效版不能为空',
          status: 400,
        },
      }
    }

    if (targetWasCurrent && targetPackageCurrentCount <= 1) {
      return {
        resolvedCurrentVersion: false,
        error: {
          code: 'MISSING_TARGET_DRAWING',
          message: '当前有效版不能为空',
          status: 400,
        },
      }
    }

    return {
      resolvedCurrentVersion: false,
      error: null,
    }
  }

  if (targetPackageCurrentCount === 0) {
    return {
      resolvedCurrentVersion: true,
      error: null,
    }
  }

  return {
    resolvedCurrentVersion: targetWasCurrent,
    error: null,
  }
}

export function getDrawingPackageGroupKey(drawing: DrawingRecordSource) {
  return normalizeString(drawing.package_id)
    || normalizeString(drawing.package_code)
    || makePackageKey(
      normalizeString(drawing.discipline_type ?? drawing.drawing_type, '其他'),
      normalizeString(drawing.document_purpose, '施工执行'),
    )
}

export function normalizeReviewMode(value: ReviewMode | string | null | undefined): ReviewMode {
  const normalized = normalizeString(value, 'none')
  if ((DRAWING_REVIEW_MODE_VALUES as readonly string[]).includes(normalized)) {
    return normalized as ReviewMode
  }
  const localized = REVIEW_MODE_LABEL_TO_VALUE[normalized]
  if (localized) return localized as ReviewMode
  return 'none'
}

export function isValidReviewModeInput(value: unknown): boolean {
  if (value == null) return true
  const normalized = normalizeString(value)
  if (!normalized) return true
  return (DRAWING_REVIEW_MODE_VALUES as readonly string[]).includes(normalized) || Boolean(REVIEW_MODE_LABEL_TO_VALUE[normalized])
}

export function getReviewModeLabel(mode: ReviewMode | string | null | undefined): string {
  return REVIEW_MODE_LABELS[normalizeReviewMode(mode)]
}

export function getDrawingReviewStatusLabel(
  reviewStatus: unknown,
  reviewMode: ReviewMode | string | null | undefined,
): string {
  const normalizedMode = normalizeReviewMode(reviewMode)
  if (normalizedMode === 'none') return '不适用'

  const normalizedStatus = normalizeString(reviewStatus)
  if (!normalizedStatus || normalizedStatus === '未提交') return '待送审'
  return normalizedStatus
}

export function buildDrawingPackageTemplateItems(template: DrawingPackageTemplate) {
  return template.items.map((item) => ({
    itemCode: item.itemCode,
    itemName: item.itemName,
    disciplineType: item.disciplineType ?? template.disciplineType,
    isRequired: item.isRequired,
    sortOrder: item.sortOrder,
  }))
}

export function getDefaultDrawingPackageTemplate(disciplineType?: string | null, documentPurpose?: string | null) {
  return (
    DEFAULT_DRAWING_PACKAGE_TEMPLATES.find(
      (template) => template.disciplineType === disciplineType && template.documentPurpose === documentPurpose,
    ) ?? DEFAULT_DRAWING_PACKAGE_TEMPLATES.find((template) => template.templateCode === 'architecture-construction')!
  )
}

export function evaluateDrawingReviewRule(input: DrawingReviewRuleEvaluationInput): DrawingReviewRuleEvaluationResult {
  const explicitMode = input.overrideReviewMode ? normalizeReviewMode(input.overrideReviewMode) : null
  if (explicitMode) {
    return {
      requiresReview: explicitMode !== 'none',
      reviewMode: explicitMode,
      reviewBasis: normalizeString(input.reviewBasis, '项目级覆盖规则'),
    }
  }

  const packageCode = normalizeString(input.packageCode)
  const packageName = normalizeString(input.packageName)
  const documentPurpose = normalizeString(input.documentPurpose)
  const nameBlob = `${packageCode} ${packageName}`

  if (nameBlob.includes('消防') || documentPurpose === '送审报批') {
    return {
      requiresReview: true,
      reviewMode: 'mandatory',
      reviewBasis: nameBlob.includes('消防') ? '消防专项包默认必审' : '送审报批包默认必审',
    }
  }

  if (nameBlob.includes('人防')) {
    return {
      requiresReview: true,
      reviewMode: 'mandatory',
      reviewBasis: '人防专项包默认必审',
    }
  }

  if (documentPurpose === '竣工归档' || nameBlob.includes('竣工归档')) {
    return {
      requiresReview: true,
      reviewMode: 'manual_confirm',
      reviewBasis: '竣工归档包需要人工确认',
    }
  }

  if (input.defaultReviewMode) {
    const normalizedMode = normalizeReviewMode(input.defaultReviewMode)
    return {
      requiresReview: normalizedMode !== 'none',
      reviewMode: normalizedMode,
      reviewBasis: normalizeString(input.reviewBasis, '图纸包模板默认规则'),
    }
  }

  return {
    requiresReview: false,
    reviewMode: 'none',
    reviewBasis: '常规施工执行包默认不送审',
  }
}

function matchReviewRuleScore(rule: DrawingReviewRuleSource, input: {
  projectId: string
  packageCode: string
  disciplineType: string
  documentPurpose: string
}) {
  if (rule.is_active != null && !toBoolean(rule.is_active)) return -1

  const ruleProjectId = normalizeString(rule.project_id)
  if (ruleProjectId && ruleProjectId !== input.projectId) return -1

  const rulePackageCode = normalizeString(rule.package_code)
  if (rulePackageCode && rulePackageCode !== input.packageCode) return -1

  const ruleDisciplineType = normalizeString(rule.discipline_type)
  if (ruleDisciplineType && ruleDisciplineType !== input.disciplineType) return -1

  const ruleDocumentPurpose = normalizeString(rule.document_purpose)
  if (ruleDocumentPurpose && ruleDocumentPurpose !== input.documentPurpose) return -1

  let score = 0
  if (ruleProjectId) score += 100
  if (rulePackageCode) score += 30
  if (ruleDisciplineType) score += 10
  if (ruleDocumentPurpose) score += 10
  if (normalizeString(rule.created_at)) score += 1
  return score
}

export function resolveDrawingReviewRuleEvaluation(input: {
  projectId?: string | null
  packageCode?: string | null
  packageName?: string | null
  disciplineType?: string | null
  documentPurpose?: string | null
  packageReviewMode?: ReviewMode | string | null
  packageReviewBasis?: string | null
  reviewRules?: DrawingReviewRuleSource[]
}): DrawingReviewRuleEvaluationResult {
  const projectId = normalizeString(input.projectId)
  const packageCode = normalizeString(input.packageCode)
  const packageName = normalizeString(input.packageName)
  const disciplineType = normalizeString(input.disciplineType)
  const documentPurpose = normalizeString(input.documentPurpose)
  const templateDefaults = getDefaultDrawingPackageTemplate(disciplineType, documentPurpose)
  const rules = (input.reviewRules ?? []).slice()
  const matchedRule = rules
    .map((rule) => ({ rule, score: matchReviewRuleScore(rule, { projectId, packageCode, disciplineType, documentPurpose }) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      const leftCreated = normalizeString(left.rule.created_at)
      const rightCreated = normalizeString(right.rule.created_at)
      if (leftCreated !== rightCreated) return rightCreated.localeCompare(leftCreated)
      return normalizeString(right.rule.id).localeCompare(normalizeString(left.rule.id), 'zh-Hans-CN')
    })[0]?.rule ?? null

  return evaluateDrawingReviewRule({
    disciplineType,
    documentPurpose,
    packageCode,
    packageName,
    defaultReviewMode: input.packageReviewMode ?? templateDefaults.defaultReviewMode,
    overrideReviewMode: matchedRule?.default_review_mode ?? null,
    reviewBasis: matchedRule?.review_basis ?? input.packageReviewBasis,
  })
}

export function resolvePackageKey(source: DrawingPackageSource) {
  return normalizeString(source.id) || normalizeString(source.package_code) || makePackageKey(
    normalizeString(source.discipline_type, '其他'),
    normalizeString(source.document_purpose, '施工执行'),
  )
}

export function buildPackageTemplateDefaults(
  template: DrawingPackageTemplate,
  projectId: string,
  packageCode?: string,
  packageName?: string,
) {
  return {
    packageCode: packageCode || `pkg-${template.templateCode}`,
    packageName: packageName || template.templateName,
    disciplineType: template.disciplineType,
    documentPurpose: template.documentPurpose,
    reviewMode: template.defaultReviewMode,
    items: buildDrawingPackageTemplateItems(template),
    projectId,
  }
}

function groupItemsByPackage(items: DrawingPackageItemSource[]) {
  const groups = new Map<string, DrawingPackageItemSource[]>()
  items.forEach((item) => {
    const key = normalizeString(item.package_id)
    if (!key) return
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  })
  return groups
}

function groupDrawingsByPackage(drawings: DrawingRecordSource[]) {
  const groups = new Map<string, DrawingRecordSource[]>()
  drawings.forEach((drawing) => {
    const key = getDrawingPackageGroupKey(drawing)
    if (!key) return
    const bucket = groups.get(key) ?? []
    bucket.push(drawing)
    groups.set(key, bucket)
  })
  return groups
}

const DRAWING_CONDITION_TYPES = new Set(['图纸', 'drawing'])
const DRAWING_REJECTION_STATUSES = new Set(['已驳回', '需修改', '退审'])
const DRAWING_REVIEW_DELAY_STATUSES = new Set(['未提交', '待送审', '已送审', '送审中', '审查中', '已驳回', '需修改'])

function normalizeSearchBlob(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => normalizeString(part))
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function matchesDrawingPackageReference(input: {
  packageId: string
  packageCode: string
  drawingIds: string[]
  explicitPackageId?: string | null
  explicitPackageCode?: string | null
  sourceEntityId?: string | null
}) {
  const packageId = normalizeString(input.packageId)
  const packageCode = normalizeString(input.packageCode)
  const explicitPackageId = normalizeString(input.explicitPackageId)
  const explicitPackageCode = normalizeString(input.explicitPackageCode)
  const sourceEntityId = normalizeString(input.sourceEntityId)
  const drawingIdSet = new Set(input.drawingIds.map((id) => normalizeString(id)).filter(Boolean))

  return (
    (!!explicitPackageId && explicitPackageId === packageId) ||
    (!!explicitPackageCode && explicitPackageCode === packageCode) ||
    (!!sourceEntityId && (sourceEntityId === packageId || sourceEntityId === packageCode || drawingIdSet.has(sourceEntityId)))
  )
}

function isPastDate(value?: string | null) {
  const text = normalizeString(value)
  if (!text) return false
  const parsed = new Date(text)
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now()
}

function isDeadlineMissed(plannedDate?: string | null, actualDate?: string | null) {
  return isPastDate(plannedDate) && !normalizeString(actualDate)
}

export function deriveDrawingScheduleImpactFlag(input: {
  status?: unknown
  drawingStatus?: unknown
  reviewStatus?: unknown
  plannedSubmitDate?: unknown
  actualSubmitDate?: unknown
  plannedPassDate?: unknown
  actualPassDate?: unknown
  hasChange?: unknown
  scheduleImpactFlag?: unknown
}) {
  const reviewStatus = normalizeString(input.reviewStatus)
  const drawingStatus = normalizeString(input.drawingStatus ?? input.status)
  const submitOverdue = isDeadlineMissed(
    normalizeString(input.plannedSubmitDate) || null,
    normalizeString(input.actualSubmitDate) || null,
  )
  const passOverdue = isDeadlineMissed(
    normalizeString(input.plannedPassDate) || null,
    normalizeString(input.actualPassDate) || null,
  )
  const rejectedOrReturned =
    DRAWING_REJECTION_STATUSES.has(reviewStatus)
    || drawingStatus === '已驳回'
  const delayedReview =
    DRAWING_REVIEW_DELAY_STATUSES.has(reviewStatus)
    && (submitOverdue || passOverdue)
  const changedWhileBlocked =
    toBoolean(input.hasChange)
    && (submitOverdue || passOverdue || rejectedOrReturned)

  return toBoolean(input.scheduleImpactFlag) || rejectedOrReturned || delayedReview || changedWhileBlocked
}

function buildTaskConditionView(condition: DrawingTaskConditionSource): DrawingLinkedConditionView {
  return {
    id: normalizeString(condition.id),
    name: normalizeString(condition.condition_name, '未命名条件'),
    status: normalizeString(condition.status, toBoolean(condition.is_satisfied) ? '已满足' : '未满足'),
    conditionType: normalizeString(condition.condition_type, '其他'),
    isSatisfied: toBoolean(condition.is_satisfied),
  }
}

function buildRequirementView(requirement: DrawingAcceptanceRequirementSource): DrawingLinkedRequirementView {
  return {
    id: normalizeString(requirement.id),
    requirementType: normalizeString(requirement.requirement_type, '未知要求'),
    sourceEntityType: normalizeString(requirement.source_entity_type, 'unknown'),
    sourceEntityId: normalizeString(requirement.source_entity_id, ''),
    description: normalizeString(requirement.description, ''),
    status: normalizeString(requirement.status, 'open'),
  }
}

function buildIssueSignal(
  code: string,
  title: string,
  description: string,
  severity: DrawingSignalView['severity'],
  evidence: string[],
): DrawingSignalView {
  return {
    code,
    title,
    description,
    severity,
    evidence,
    escalatedEntityType: null,
    escalatedEntityId: null,
    escalatedAt: null,
  }
}

function dedupeSignals(signals: DrawingSignalView[]) {
  const seen = new Set<string>()
  return signals.filter((signal) => {
    if (seen.has(signal.code)) return false
    seen.add(signal.code)
    return true
  })
}

function hasDrawingSignalMarker(description: string | null | undefined, signalCode: string) {
  if (!description) return false
  return description.includes(`[drawing_signal:${signalCode}]`)
}

function markEscalatedSignals<T extends DrawingSignalView>(input: {
  signals: T[]
  packageId: string
  entityType: 'issue' | 'risk'
  escalatedRows?: Array<{
    id?: string | null
    title?: string | null
    description?: string | null
    source_id?: string | null
    source_entity_type?: string | null
    source_entity_id?: string | null
    created_at?: string | null
  }>
}) {
  const packageId = normalizeString(input.packageId)
  if (!packageId) return input.signals

  return input.signals.map((signal) => {
    const matched = (input.escalatedRows ?? []).find((row) => {
      const isExplicitPackageSource =
        normalizeString(row.source_entity_type) === 'drawing_package'
        && normalizeString(row.source_entity_id) === packageId
      const isLegacyPackageSource = normalizeString(row.source_id) === packageId
      if (!isExplicitPackageSource && !isLegacyPackageSource) return false
      if (normalizeString(row.title) === signal.title) return true
      return hasDrawingSignalMarker(normalizeString(row.description), signal.code)
    })

    if (!matched?.id) return signal

    return {
      ...signal,
      escalatedEntityType: input.entityType,
      escalatedEntityId: normalizeString(matched.id),
      escalatedAt: normalizeString(matched.created_at),
    }
  })
}

function derivePackageStatus(input: {
  missingRequiredCount: number
  currentReviewStatus: string
  hasChange: boolean
  scheduleImpactFlag: boolean
  readyForConstruction: boolean
  readyForAcceptance: boolean
  evaluation: DrawingReviewRuleEvaluationResult
}) {
  if (input.missingRequiredCount > 0) return 'preparing'
  if (input.scheduleImpactFlag || input.hasChange) return 'revising'
  if (input.evaluation.requiresReview && ['待送审', '已送审', '送审中', '审查中'].includes(input.currentReviewStatus)) return 'reviewing'
  if (input.readyForAcceptance) return 'completed'
  if (input.readyForConstruction) return 'issued'
  return 'pending'
}

export function buildDrawingBoardView(source: {
  packages?: DrawingPackageSource[]
  items?: DrawingPackageItemSource[]
  drawings?: DrawingRecordSource[]
  versions?: DrawingVersionRecordSource[]
  reviewRules?: DrawingReviewRuleSource[]
  tasks?: DrawingTaskSource[]
  taskConditions?: DrawingTaskConditionSource[]
  acceptancePlans?: DrawingAcceptancePlanSource[]
  acceptanceRequirements?: DrawingAcceptanceRequirementSource[]
  acceptanceRecords?: DrawingAcceptanceRecordSource[]
}) {
  const packages = source.packages && source.packages.length > 0
    ? source.packages
    : derivePackagesFromLegacyDrawings(source.drawings ?? [])

  const itemGroups = groupItemsByPackage(source.items ?? [])
  const drawingGroups = groupDrawingsByPackage(source.drawings ?? [])

  const cards = packages.map((pkg) => {
    const packageKey = resolvePackageKey(pkg)
    const packageItems = itemGroups.get(packageKey) ?? []
    const packageDrawings = drawingGroups.get(packageKey) ?? []
    const evaluation = resolveDrawingReviewRuleEvaluation({
      projectId: pkg.project_id,
      packageCode: pkg.package_code,
      packageName: pkg.package_name,
      disciplineType: pkg.discipline_type,
      documentPurpose: pkg.document_purpose,
      packageReviewMode: pkg.review_mode,
      packageReviewBasis: pkg.review_basis,
      reviewRules: source.reviewRules,
    })
    const requiredItems = packageItems.filter((item) => item.is_required !== false && item.is_required !== 0)
    const completedRequiredItems = requiredItems.filter((item) => item.current_drawing_id)
    const hasPackageItems = packageItems.length > 0
    const missingRequiredCount = hasPackageItems
      ? Math.max(requiredItems.length - completedRequiredItems.length, 0)
      : pkg.missing_required_count != null
        ? toNumber(pkg.missing_required_count)
        : 0
    const completenessRatio = hasPackageItems
      ? requiredItems.length > 0
        ? Math.round((completedRequiredItems.length / requiredItems.length) * 100)
        : packageDrawings.length > 0
          ? 100
          : 0
      : pkg.completeness_ratio != null
        ? Math.max(0, Math.min(100, toNumber(pkg.completeness_ratio)))
        : packageDrawings.length > 0
          ? 100
          : 0
    const currentDrawing = selectCurrentDrawing(packageDrawings)
    const currentVersionNo = normalizeString(currentDrawing?.version_no ?? currentDrawing?.version, '未设置')
    const currentReviewStatus = getDrawingReviewStatusLabel(
      currentDrawing?.review_status,
      pkg.review_mode ?? evaluation.reviewMode,
    )
    const hasChange = pkg.has_change != null ? toBoolean(pkg.has_change) : packageDrawings.some((drawing) => toBoolean(drawing.has_change))
    const derivedScheduleImpactFlag = packageDrawings.some((drawing) => deriveDrawingScheduleImpactFlag({
      status: drawing.status,
      drawingStatus: drawing.drawing_status,
      reviewStatus: drawing.review_status,
      plannedSubmitDate: drawing.planned_submit_date,
      actualSubmitDate: drawing.actual_submit_date,
      plannedPassDate: drawing.planned_pass_date,
      actualPassDate: drawing.actual_pass_date,
      hasChange: drawing.has_change,
      scheduleImpactFlag: drawing.schedule_impact_flag,
    }))
    const scheduleImpactFlag = (pkg.schedule_impact_flag != null ? toBoolean(pkg.schedule_impact_flag) : false) || derivedScheduleImpactFlag
    const readyForConstruction = pkg.is_ready_for_construction != null
      ? toBoolean(pkg.is_ready_for_construction)
      : missingRequiredCount === 0 && (!evaluation.requiresReview || currentReviewStatus === '已通过')
    const readyForAcceptance = pkg.is_ready_for_acceptance != null
      ? toBoolean(pkg.is_ready_for_acceptance)
      : normalizeString(pkg.document_purpose) === '竣工归档' && readyForConstruction
    const status = normalizeString(pkg.status, derivePackageStatus({
      missingRequiredCount,
      currentReviewStatus,
      hasChange,
      scheduleImpactFlag,
      readyForConstruction,
      readyForAcceptance,
      evaluation,
    }))

    const packageCardBase = {
      packageId: packageKey,
      packageCode: normalizeString(pkg.package_code, packageKey),
      packageName: normalizeString(pkg.package_name, '未命名图纸包'),
      disciplineType: normalizeString(pkg.discipline_type, '其他'),
      documentPurpose: normalizeString(pkg.document_purpose, '施工执行'),
      status,
      requiresReview: pkg.requires_review != null ? toBoolean(pkg.requires_review) : evaluation.requiresReview,
      reviewMode: normalizeReviewMode(pkg.review_mode ?? evaluation.reviewMode),
      reviewModeLabel: getReviewModeLabel(pkg.review_mode ?? evaluation.reviewMode),
      reviewBasis: normalizeString(pkg.review_basis, evaluation.reviewBasis),
      completenessRatio,
      missingRequiredCount,
      currentVersionDrawingId: normalizeString(pkg.current_version_drawing_id) || normalizeString(currentDrawing?.id) || null,
      currentVersionNo,
      currentVersionLabel: currentVersionNo === '未设置' ? '未设置当前有效版' : `当前有效版 v${currentVersionNo}`,
      currentReviewStatus,
      hasChange,
      scheduleImpactFlag,
      isReadyForConstruction: readyForConstruction,
      isReadyForAcceptance: readyForAcceptance,
      drawingsCount: packageDrawings.length,
      requiredItemsCount: requiredItems.length,
      latestUpdateAt: normalizeString(pkg.updated_at) || normalizeString(pkg.created_at) || null,
    } satisfies DrawingPackageCard

    const linkedTasks = buildLinkedTasksExplicit({
      packageCard: packageCardBase,
      drawings: packageDrawings,
      tasks: source.tasks,
      taskConditions: source.taskConditions,
    })
    const linkedAcceptance = buildLinkedAcceptanceExplicit({
      packageCard: packageCardBase,
      drawings: packageDrawings,
      acceptancePlans: source.acceptancePlans,
      acceptanceRequirements: source.acceptanceRequirements,
      acceptanceRecords: source.acceptanceRecords,
    })

    return {
      ...packageCardBase,
      linkedTaskCount: linkedTasks.length,
      linkedAcceptanceCount: linkedAcceptance.length,
      linkedCertificateCount: 0,
    } satisfies DrawingPackageCard
  })

  cards.sort((left, right) => {
    const disciplineOrder = left.disciplineType.localeCompare(right.disciplineType, 'zh-Hans-CN')
    if (disciplineOrder !== 0) return disciplineOrder
    return left.packageName.localeCompare(right.packageName, 'zh-Hans-CN')
  })

  const summary: DrawingBoardSummary = {
    totalPackages: cards.length,
    missingPackages: cards.filter((card) => card.missingRequiredCount > 0).length,
    mandatoryReviewPackages: cards.filter((card) => card.requiresReview && card.reviewMode === 'mandatory').length,
    reviewingPackages: cards.filter((card) => ['待送审', '已送审', '送审中', '审查中'].includes(card.currentReviewStatus) || card.status === 'reviewing').length,
    scheduleImpactCount: cards.filter((card) => card.scheduleImpactFlag).length,
    readyForConstructionCount: cards.filter((card) => card.isReadyForConstruction).length,
    readyForAcceptanceCount: cards.filter((card) => card.isReadyForAcceptance).length,
  }

  return { summary, packages: cards }
}

export function buildDrawingLedgerRows(
  drawings: DrawingRecordSource[],
  packages?: DrawingPackageSource[],
  reviewRules?: DrawingReviewRuleSource[],
) {
  const packageMap = new Map((packages ?? []).map((pkg) => [resolvePackageKey(pkg), pkg]))

  const rows: DrawingLedgerRow[] = drawings.map((drawing) => {
    const packageKey = normalizeString(drawing.package_id) || normalizeString(drawing.package_code)
    const packageRow = packageMap.get(packageKey)
    const evaluation = resolveDrawingReviewRuleEvaluation({
      projectId: packageRow?.project_id,
      disciplineType: drawing.discipline_type ?? packageRow?.discipline_type,
      documentPurpose: drawing.document_purpose ?? packageRow?.document_purpose,
      packageCode: drawing.package_code ?? packageRow?.package_code,
      packageName: drawing.package_name ?? packageRow?.package_name,
      packageReviewMode: packageRow?.review_mode,
      packageReviewBasis: packageRow?.review_basis,
      reviewRules,
    })

    const drawingStatus = normalizeString(drawing.drawing_status ?? drawing.status, '编制中')
    const reviewMode = normalizeReviewMode(drawing.review_mode ?? packageRow?.review_mode ?? evaluation.reviewMode)
    const reviewStatus = getDrawingReviewStatusLabel(drawing.review_status, reviewMode)

    return {
      drawingId: normalizeString(drawing.id),
      packageId: packageKey || resolvePackageKey({
        package_code: drawing.package_code,
        package_name: drawing.package_name,
        discipline_type: drawing.discipline_type ?? drawing.drawing_type,
        document_purpose: drawing.document_purpose,
      }),
      packageCode: normalizeString(drawing.package_code ?? packageRow?.package_code, packageKey || '未分组'),
      packageName: normalizeString(drawing.package_name ?? packageRow?.package_name, '未命名图纸包'),
      disciplineType: normalizeString(drawing.discipline_type ?? drawing.drawing_type ?? packageRow?.discipline_type, '其他'),
      documentPurpose: normalizeString(drawing.document_purpose ?? packageRow?.document_purpose, '施工执行'),
      drawingCode: normalizeString(drawing.drawing_code, normalizeString(drawing.id)),
      drawingName: normalizeString(drawing.drawing_name, '未命名图纸'),
      versionNo: normalizeString(drawing.version_no ?? drawing.version, '1.0'),
      drawingStatus,
      reviewStatus,
      isCurrentVersion: toBoolean(drawing.is_current_version),
      requiresReview: drawing.requires_review != null ? toBoolean(drawing.requires_review) : evaluation.requiresReview,
      reviewMode,
      reviewModeLabel: getReviewModeLabel(reviewMode),
      reviewBasis: normalizeString(drawing.review_basis, evaluation.reviewBasis),
      hasChange: toBoolean(drawing.has_change),
      scheduleImpactFlag: deriveDrawingScheduleImpactFlag({
        status: drawing.status,
        drawingStatus: drawing.drawing_status,
        reviewStatus: drawing.review_status,
        plannedSubmitDate: drawing.planned_submit_date,
        actualSubmitDate: drawing.actual_submit_date,
        plannedPassDate: drawing.planned_pass_date,
        actualPassDate: drawing.actual_pass_date,
        hasChange: drawing.has_change,
        scheduleImpactFlag: drawing.schedule_impact_flag,
      }),
      plannedSubmitDate: normalizeString(drawing.planned_submit_date) || null,
      actualSubmitDate: normalizeString(drawing.actual_submit_date) || null,
      plannedPassDate: normalizeString(drawing.planned_pass_date) || null,
      actualPassDate: normalizeString(drawing.actual_pass_date) || null,
      designUnit: normalizeString(drawing.design_unit) || null,
      reviewUnit: normalizeString(drawing.review_unit) || null,
      createdAt: normalizeString(drawing.created_at) || null,
    }
  })

  rows.sort((left, right) => {
    if (left.packageName !== right.packageName) {
      return left.packageName.localeCompare(right.packageName, 'zh-Hans-CN')
    }
    if (left.versionNo !== right.versionNo) {
      return right.versionNo.localeCompare(left.versionNo, 'zh-Hans-CN')
    }
    return left.drawingName.localeCompare(right.drawingName, 'zh-Hans-CN')
  })

  return rows
}

export function buildDrawingVersionRows(versions: DrawingVersionRecordSource[], drawings: DrawingRecordSource[]) {
  const drawingMap = new Map(drawings.map((drawing) => [normalizeString(drawing.id), drawing]))

  const rows = versions.map<DrawingVersionView>((version) => {
    const drawing = drawingMap.get(normalizeString(version.drawing_id))
    return {
      versionId: normalizeString(version.id),
      drawingId: normalizeString(version.drawing_id),
      parentDrawingId: normalizeString(version.parent_drawing_id ?? drawing?.parent_drawing_id) || null,
      versionNo: normalizeString(version.version_no, normalizeString(drawing?.version_no ?? drawing?.version, '1.0')),
      revisionNo: normalizeString(version.revision_no ?? drawing?.revision_no) || null,
      issuedFor: normalizeString(version.issued_for ?? drawing?.issued_for) || null,
      effectiveDate: normalizeString(version.effective_date ?? drawing?.effective_date) || null,
      previousVersionId: normalizeString(version.previous_version_id) || null,
      isCurrentVersion: toBoolean(version.is_current_version ?? drawing?.is_current_version),
      supersededAt: normalizeString(version.superseded_at) || null,
      changeReason: normalizeString(version.change_reason, normalizeString(drawing?.change_reason, '')),
      createdAt: normalizeString(version.created_at) || null,
      createdBy: normalizeString(version.created_by, '系统'),
      drawingName: normalizeString(drawing?.drawing_name, '未命名图纸'),
    }
  })

  rows.sort((left, right) => {
    if (left.createdAt && right.createdAt && left.createdAt !== right.createdAt) {
      return right.createdAt.localeCompare(left.createdAt)
    }
    return right.versionNo.localeCompare(left.versionNo, 'zh-Hans-CN')
  })

  return rows
}

function sortVersionsByRecency(left: DrawingVersionRecordSource, right: DrawingVersionRecordSource) {
  const leftCurrent = toBoolean(left.is_current_version)
  const rightCurrent = toBoolean(right.is_current_version)
  if (leftCurrent !== rightCurrent) {
    return rightCurrent ? 1 : -1
  }

  const leftCreatedAt = normalizeString(left.created_at, '')
  const rightCreatedAt = normalizeString(right.created_at, '')
  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt.localeCompare(leftCreatedAt)
  }

  return normalizeString(right.version_no, '').localeCompare(normalizeString(left.version_no, ''), 'zh-Hans-CN')
}

export function resolveDrawingPackageCurrentVersionTarget(input: DrawingPackageCurrentVersionTargetInput): DrawingPackageCurrentVersionTargetResult {
  const packageId = normalizeString(input.packageId)
  const packageVersions = input.versions.filter((version) => normalizeString(version.package_id) === packageId)
  const packageDrawings = input.drawings.filter((drawing) => normalizeString(drawing.package_id) === packageId || normalizeString(drawing.package_code) === packageId)
  const normalizedVersionId = normalizeString(input.versionId)
  const normalizedDrawingId = normalizeString(input.drawingId)

  const resolveTargetVersionForDrawing = (drawingId: string) => {
    const versionsForDrawing = packageVersions
      .filter((version) => normalizeString(version.drawing_id) === drawingId)
      .slice()
      .sort(sortVersionsByRecency)
    return versionsForDrawing[0] ?? null
  }

  if (!normalizedVersionId && !normalizedDrawingId) {
    return {
      targetVersion: null,
      targetDrawingId: null,
      targetDrawing: null,
      needsSnapshot: false,
      error: {
        code: 'MISSING_TARGET_DRAWING',
        message: '当前有效版不能为空',
        status: 400,
      },
    }
  }

  if (normalizedVersionId) {
    const targetVersion = packageVersions.find((version) => normalizeString(version.id) === normalizedVersionId)
    if (targetVersion) {
      const targetDrawingId = normalizeString(targetVersion.drawing_id)
      return {
        targetVersion,
        targetDrawingId,
        targetDrawing: packageDrawings.find((drawing) => normalizeString(drawing.id) === targetDrawingId) ?? null,
        needsSnapshot: false,
        error: null,
      }
    }

    const legacyDrawing = packageDrawings.find((drawing) => normalizeString(drawing.id) === normalizedVersionId)
    if (!legacyDrawing) {
      return {
        targetVersion: null,
        targetDrawingId: null,
        targetDrawing: null,
        needsSnapshot: false,
        error: {
          code: 'VERSION_NOT_IN_PACKAGE',
          message: '所选版本不属于当前图纸包',
          status: 404,
        },
      }
    }

    const matchedVersion = resolveTargetVersionForDrawing(normalizedVersionId)
    if (matchedVersion) {
      const targetDrawingId = normalizeString(matchedVersion.drawing_id)
      return {
        targetVersion: matchedVersion,
        targetDrawingId,
        targetDrawing: packageDrawings.find((drawing) => normalizeString(drawing.id) === targetDrawingId) ?? legacyDrawing,
        needsSnapshot: false,
        error: null,
      }
    }

    return {
      targetVersion: null,
      targetDrawingId: normalizedVersionId,
      targetDrawing: legacyDrawing,
      needsSnapshot: true,
      error: null,
    }
  }

  const targetDrawing = packageDrawings.find((drawing) => normalizeString(drawing.id) === normalizedDrawingId)
  if (!targetDrawing) {
    return {
      targetVersion: null,
      targetDrawingId: null,
      targetDrawing: null,
      needsSnapshot: false,
      error: {
        code: 'DRAWING_NOT_IN_PACKAGE',
        message: '所选图纸不属于当前图纸包',
        status: 404,
      },
    }
  }

  const targetVersion = resolveTargetVersionForDrawing(normalizedDrawingId)
  if (targetVersion) {
    return {
      targetVersion,
      targetDrawingId: normalizeString(targetVersion.drawing_id),
      targetDrawing,
      needsSnapshot: false,
      error: null,
    }
  }

  return {
    targetVersion: null,
    targetDrawingId: normalizedDrawingId,
    targetDrawing,
    needsSnapshot: true,
    error: null,
  }
}

function buildLinkedTasks(input: {
  packageRow: DrawingPackageSource
  packageCard: DrawingPackageCard
  drawings: DrawingRecordSource[]
  tasks?: DrawingTaskSource[]
  taskConditions?: DrawingTaskConditionSource[]
}) {
  const packageId = normalizeString(input.packageCard.packageId)
  const packageCode = normalizeString(input.packageCard.packageCode)
  const drawingIds = input.drawings.map((drawing) => normalizeString(drawing.id)).filter(Boolean)
  const conditionGroups = new Map<string, DrawingTaskConditionSource[]>()

  for (const condition of input.taskConditions ?? []) {
    const taskId = normalizeString(condition.task_id)
    if (!taskId) continue
    const bucket = conditionGroups.get(taskId) ?? []
    bucket.push(condition)
    conditionGroups.set(taskId, bucket)
  }

  const linkedTasks: DrawingLinkedTaskView[] = []

  for (const task of input.tasks ?? []) {
    const taskId = normalizeString(task.id)
    if (!taskId) continue

    const conditions = (conditionGroups.get(taskId) ?? []).filter((condition) => DRAWING_CONDITION_TYPES.has(normalizeString(condition.condition_type, '')))
    if (conditions.length === 0) continue

    const explicitConditions = conditions.filter((condition) => matchesDrawingPackageReference({
      packageId,
      packageCode,
      drawingIds,
      explicitPackageId: condition.drawing_package_id,
      explicitPackageCode: condition.drawing_package_code,
    }))
    const matchedConditions = explicitConditions

    if (matchedConditions.length === 0) {
      continue
    }
    if (matchedConditions.length === 0) {
      continue
    }

    const selectedConditions = matchedConditions.slice(0, 3)
    const openConditionCount = matchedConditions.filter((condition) => !toBoolean(condition.is_satisfied)).length

    linkedTasks.push({
      id: taskId,
      name: normalizeString(task.title, '未命名任务'),
      status: normalizeString(task.status, 'pending'),
      drawingConditionCount: matchedConditions.length,
      openConditionCount,
      conditions: selectedConditions.map(buildTaskConditionView),
    })
  }

  linkedTasks.sort((left, right) => {
    if (left.openConditionCount !== right.openConditionCount) {
      return right.openConditionCount - left.openConditionCount
    }
    return left.name.localeCompare(right.name, 'zh-Hans-CN')
  })

  return linkedTasks
}

function buildLinkedAcceptance(input: {
  packageRow: DrawingPackageSource
  packageCard: DrawingPackageCard
  drawings: DrawingRecordSource[]
  acceptancePlans?: DrawingAcceptancePlanSource[]
  acceptanceRequirements?: DrawingAcceptanceRequirementSource[]
  acceptanceRecords?: DrawingAcceptanceRecordSource[]
}) {
  const packageId = normalizeString(input.packageCard.packageId)
  const packageCode = normalizeString(input.packageCard.packageCode)
  const drawingIds = input.drawings.map((drawing) => normalizeString(drawing.id)).filter(Boolean)
  const requirementsByPlan = new Map<string, DrawingAcceptanceRequirementSource[]>()
  for (const requirement of input.acceptanceRequirements ?? []) {
    const planId = normalizeString(requirement.plan_id)
    if (!planId) continue
    const bucket = requirementsByPlan.get(planId) ?? []
    bucket.push(requirement)
    requirementsByPlan.set(planId, bucket)
  }

  const recordsByPlan = new Map<string, DrawingAcceptanceRecordSource[]>()
  for (const record of input.acceptanceRecords ?? []) {
    const planId = normalizeString(record.plan_id)
    if (!planId) continue
    const bucket = recordsByPlan.get(planId) ?? []
    bucket.push(record)
    recordsByPlan.set(planId, bucket)
  }

  const linkedAcceptance: DrawingLinkedAcceptanceView[] = []

  for (const plan of input.acceptancePlans ?? []) {
    const planId = normalizeString(plan.id)
    if (!planId) continue

    const requirements = requirementsByPlan.get(planId) ?? []
    if (requirements.length === 0) continue

    const explicitRequirements = requirements.filter((requirement) => matchesDrawingPackageReference({
      packageId,
      packageCode,
      drawingIds,
      explicitPackageId: requirement.drawing_package_id,
      sourceEntityId: requirement.source_entity_id,
    }))

    const relevantRequirements = explicitRequirements
    if (relevantRequirements.length === 0) continue

    const latestRecordAt = (recordsByPlan.get(planId) ?? [])
      .map((record) => normalizeString(record.record_date) || normalizeString(record.created_at))
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left))[0] ?? null

    linkedAcceptance.push({
      id: planId,
      name: normalizeString(plan.acceptance_name ?? plan.plan_name, '未命名验收'),
      status: normalizeString(plan.status, 'pending'),
      requirementCount: relevantRequirements.length,
      openRequirementCount: relevantRequirements.filter((requirement) => {
        const status = normalizeString(requirement.status, 'open')
        return status === 'open' || status === 'blocked'
      }).length,
      latestRecordAt,
      requirements: relevantRequirements.map(buildRequirementView),
    })
  }

  linkedAcceptance.sort((left, right) => {
    if (left.openRequirementCount !== right.openRequirementCount) {
      return right.openRequirementCount - left.openRequirementCount
    }
    return left.name.localeCompare(right.name, 'zh-Hans-CN')
  })

  return linkedAcceptance
}

function buildLinkedTasksExplicit(input: {
  packageCard: DrawingPackageCard
  drawings: DrawingRecordSource[]
  tasks?: DrawingTaskSource[]
  taskConditions?: DrawingTaskConditionSource[]
}) {
  const packageId = normalizeString(input.packageCard.packageId)
  const packageCode = normalizeString(input.packageCard.packageCode)
  const drawingIds = input.drawings.map((drawing) => normalizeString(drawing.id)).filter(Boolean)
  const conditionGroups = new Map<string, DrawingTaskConditionSource[]>()

  for (const condition of input.taskConditions ?? []) {
    const taskId = normalizeString(condition.task_id)
    if (!taskId) continue
    const bucket = conditionGroups.get(taskId) ?? []
    bucket.push(condition)
    conditionGroups.set(taskId, bucket)
  }

  return (input.tasks ?? [])
    .map((task) => {
      const taskId = normalizeString(task.id)
      if (!taskId) return null

      const linkedConditions = (conditionGroups.get(taskId) ?? [])
        .filter((condition) => DRAWING_CONDITION_TYPES.has(normalizeString(condition.condition_type, '')))
        .filter((condition) => matchesDrawingPackageReference({
          packageId,
          packageCode,
          drawingIds,
          explicitPackageId: condition.drawing_package_id,
          explicitPackageCode: condition.drawing_package_code,
        }))

      if (linkedConditions.length === 0) return null

      return {
        id: taskId,
        name: normalizeString(task.title, 'Unnamed task'),
        status: normalizeString(task.status, 'pending'),
        drawingConditionCount: linkedConditions.length,
        openConditionCount: linkedConditions.filter((condition) => !toBoolean(condition.is_satisfied)).length,
        conditions: linkedConditions.slice(0, 3).map(buildTaskConditionView),
      } satisfies DrawingLinkedTaskView
    })
    .filter((task): task is DrawingLinkedTaskView => task !== null)
    .sort((left, right) => {
      if (left.openConditionCount !== right.openConditionCount) {
        return right.openConditionCount - left.openConditionCount
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    })
}

function buildLinkedAcceptanceExplicit(input: {
  packageCard: DrawingPackageCard
  drawings: DrawingRecordSource[]
  acceptancePlans?: DrawingAcceptancePlanSource[]
  acceptanceRequirements?: DrawingAcceptanceRequirementSource[]
  acceptanceRecords?: DrawingAcceptanceRecordSource[]
}) {
  const packageId = normalizeString(input.packageCard.packageId)
  const packageCode = normalizeString(input.packageCard.packageCode)
  const drawingIds = input.drawings.map((drawing) => normalizeString(drawing.id)).filter(Boolean)
  const requirementsByPlan = new Map<string, DrawingAcceptanceRequirementSource[]>()

  for (const requirement of input.acceptanceRequirements ?? []) {
    const planId = normalizeString(requirement.plan_id)
    if (!planId) continue
    const bucket = requirementsByPlan.get(planId) ?? []
    bucket.push(requirement)
    requirementsByPlan.set(planId, bucket)
  }

  const recordsByPlan = new Map<string, DrawingAcceptanceRecordSource[]>()
  for (const record of input.acceptanceRecords ?? []) {
    const planId = normalizeString(record.plan_id)
    if (!planId) continue
    const bucket = recordsByPlan.get(planId) ?? []
    bucket.push(record)
    recordsByPlan.set(planId, bucket)
  }

  return (input.acceptancePlans ?? [])
    .map((plan) => {
      const planId = normalizeString(plan.id)
      if (!planId) return null

      const linkedRequirements = (requirementsByPlan.get(planId) ?? []).filter((requirement) => matchesDrawingPackageReference({
        packageId,
        packageCode,
        drawingIds,
        explicitPackageId: requirement.drawing_package_id,
        sourceEntityId: requirement.source_entity_id,
      }))

      if (linkedRequirements.length === 0) return null

      const latestRecordAt = (recordsByPlan.get(planId) ?? [])
        .map((record) => normalizeString(record.record_date) || normalizeString(record.created_at))
        .filter(Boolean)
        .sort((left, right) => right.localeCompare(left))[0] ?? null

      return {
        id: planId,
        name: normalizeString(plan.acceptance_name ?? plan.plan_name, 'Unnamed acceptance'),
        status: normalizeString(plan.status, 'pending'),
        requirementCount: linkedRequirements.length,
        openRequirementCount: linkedRequirements.filter((requirement) => {
          const status = normalizeString(requirement.status, 'open')
          return status === 'open' || status === 'blocked'
        }).length,
        latestRecordAt,
        requirements: linkedRequirements.map(buildRequirementView),
      } satisfies DrawingLinkedAcceptanceView
    })
    .filter((plan): plan is DrawingLinkedAcceptanceView => plan !== null)
    .sort((left, right) => {
      if (left.openRequirementCount !== right.openRequirementCount) {
        return right.openRequirementCount - left.openRequirementCount
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    })
}

function buildDrawingIssueSignals(input: {
  packageCard: DrawingPackageCard
  drawings: DrawingRecordSource[]
  missingRequiredCount: number
  completenessRatio: number
}) {
  const currentDrawing = selectCurrentDrawing(input.drawings)
  const rejectedDrawings = input.drawings.filter((drawing) => DRAWING_REJECTION_STATUSES.has(normalizeString(drawing.review_status)))
  const reviewDelayDrawing = currentDrawing && DRAWING_REVIEW_DELAY_STATUSES.has(normalizeString(currentDrawing.review_status))
    && (
      isPastDate(currentDrawing.planned_submit_date)
      || isPastDate(currentDrawing.planned_pass_date)
    )
  const signals: DrawingSignalView[] = []

  if (input.missingRequiredCount > 0) {
    signals.push(buildIssueSignal(
      'missing-required',
      '图纸缺漏',
      `当前图纸包仍缺漏 ${input.missingRequiredCount} 项应有项。`,
      'high',
      [`缺漏项：${input.missingRequiredCount}`],
    ))
  }

  if (input.completenessRatio < 100) {
    signals.push(buildIssueSignal(
      'incomplete-package',
      '图纸未齐套',
      `图纸包齐套度为 ${input.completenessRatio}%，未达到完整出图要求。`,
      'medium',
      [`齐套度：${input.completenessRatio}%`],
    ))
  }

  if (reviewDelayDrawing) {
    signals.push(buildIssueSignal(
      'review-overdue',
        '逾期送审',
        `当前有效版 ${normalizeString(currentDrawing.version_no ?? currentDrawing.version, '1.0')} 已超过计划送审/通过日期。`,
        'high',
        [
        `当前状态：${getDrawingReviewStatusLabel(currentDrawing.review_status, input.packageCard.reviewMode)}`,
        `计划送审：${normalizeString(currentDrawing.planned_submit_date) || normalizeString(currentDrawing.planned_pass_date) || '未设置'}`,
      ],
    ))
  }

  if (rejectedDrawings.length >= 2) {
    signals.push(buildIssueSignal(
      'multi-round-reject',
      '多轮退审',
      `图纸包内已有 ${rejectedDrawings.length} 条退审/修改记录，建议升级为问题闭环。`,
      'high',
      [`退审记录：${rejectedDrawings.length} 条`],
    ))
  }

  return dedupeSignals(signals)
}

function buildDrawingRiskSignals(input: {
  packageCard: DrawingPackageCard
  issueSignals: DrawingSignalView[]
}) {
  const signals: DrawingSignalView[] = []

  if (input.packageCard.scheduleImpactFlag) {
    signals.push(buildIssueSignal(
      'schedule-impact',
      '工期影响',
      '图纸包已标记工期影响，建议同步风险并关注后续关键线路。',
      'critical',
      ['package.scheduleImpactFlag=true'],
    ))
  }

  if (input.packageCard.hasChange) {
    signals.push(buildIssueSignal(
      'package-change',
      '图纸变更',
      '当前图纸包存在变更，建议评估变更对工期、施工与验收的连锁影响。',
      'high',
      ['package.hasChange=true'],
    ))
  }

  if (input.issueSignals.some((signal) => signal.code === 'review-overdue')) {
    signals.push(buildIssueSignal(
      'review-delay-risk',
      '送审延期风险',
      '送审或审查逾期会放大关键线路的不确定性，建议同步风险化处理。',
      'medium',
      ['存在逾期送审问题'],
    ))
  }

  return dedupeSignals(signals)
}

export function buildDrawingPackageDetailView(input: {
  packageRow: DrawingPackageSource
  requiredItems: DrawingPackageItemSource[]
  drawings: DrawingRecordSource[]
  versions: DrawingVersionRecordSource[]
  reviewRules?: DrawingReviewRuleSource[]
  tasks?: DrawingTaskSource[]
  taskConditions?: DrawingTaskConditionSource[]
  acceptancePlans?: DrawingAcceptancePlanSource[]
  acceptanceRequirements?: DrawingAcceptanceRequirementSource[]
  acceptanceRecords?: DrawingAcceptanceRecordSource[]
  issues?: DrawingEscalatedIssueSource[]
  risks?: DrawingEscalatedRiskSource[]
}): DrawingPackageDetailView {
  const board = buildDrawingBoardView({
    packages: [input.packageRow],
    items: input.requiredItems,
    drawings: input.drawings,
    versions: input.versions,
    reviewRules: input.reviewRules,
    tasks: input.tasks,
    taskConditions: input.taskConditions,
    acceptancePlans: input.acceptancePlans,
    acceptanceRequirements: input.acceptanceRequirements,
    acceptanceRecords: input.acceptanceRecords,
  })

  const items = input.requiredItems.map<DrawingPackageItemView>((item) => {
    const hasDrawing = Boolean(item.current_drawing_id)
    const drawing = input.drawings.find((record) => normalizeString(record.id) === normalizeString(item.current_drawing_id))
    const currentVersion = normalizeString(item.current_version, normalizeString(drawing?.version_no ?? drawing?.version, ''))
    return {
      itemId: normalizeString(item.id),
      itemCode: normalizeString(item.item_code, normalizeString(item.id)),
      itemName: normalizeString(item.item_name, '未命名应有项'),
      disciplineType: normalizeString(item.discipline_type ?? drawing?.discipline_type ?? input.packageRow.discipline_type, '其他'),
      isRequired: toBoolean(item.is_required),
      status: hasDrawing ? (drawing && !toBoolean(drawing.is_current_version) ? 'outdated' : 'available') : 'missing',
      currentDrawingId: normalizeString(item.current_drawing_id) || null,
      currentVersion,
      notes: normalizeString(item.notes),
      sortOrder: toNumber(item.sort_order),
    }
  })

  const packageCard = board.packages[0] ?? {
    packageId: resolvePackageKey(input.packageRow),
    packageCode: normalizeString(input.packageRow.package_code),
    packageName: normalizeString(input.packageRow.package_name),
    disciplineType: normalizeString(input.packageRow.discipline_type ?? input.packageRow.drawing_type),
    documentPurpose: normalizeString(input.packageRow.document_purpose),
    status: normalizeString(input.packageRow.status, 'pending'),
    requiresReview: false,
    reviewMode: 'none' as ReviewMode,
    reviewModeLabel: '不适用',
    reviewBasis: '',
    completenessRatio: 0,
    missingRequiredCount: 0,
    currentVersionDrawingId: null,
    currentVersionNo: '未设置',
    currentVersionLabel: '未设置当前有效版',
    currentReviewStatus: '不适用',
    hasChange: false,
    scheduleImpactFlag: false,
    isReadyForConstruction: false,
    isReadyForAcceptance: false,
    drawingsCount: 0,
    requiredItemsCount: 0,
    latestUpdateAt: null,
  }

  const linkedTasks = buildLinkedTasksExplicit({
    packageCard,
    drawings: input.drawings,
    tasks: input.tasks,
    taskConditions: input.taskConditions,
  })

  const linkedAcceptance = buildLinkedAcceptanceExplicit({
    packageCard,
    drawings: input.drawings,
    acceptancePlans: input.acceptancePlans,
    acceptanceRequirements: input.acceptanceRequirements,
    acceptanceRecords: input.acceptanceRecords,
  })

  const issueSignals = markEscalatedSignals({
    signals: buildDrawingIssueSignals({
      packageCard,
      drawings: input.drawings,
      missingRequiredCount: packageCard.missingRequiredCount,
      completenessRatio: packageCard.completenessRatio,
    }),
    packageId: packageCard.packageId,
    entityType: 'issue',
    escalatedRows: input.issues,
  })

  const riskSignals = markEscalatedSignals({
    signals: buildDrawingRiskSignals({
      packageCard,
      issueSignals,
    }),
    packageId: packageCard.packageId,
    entityType: 'risk',
    escalatedRows: input.risks,
  })

  return {
    package: packageCard,
    requiredItems: items,
    drawings: buildDrawingLedgerRows(input.drawings, [input.packageRow], input.reviewRules),
    records: buildDrawingVersionRows(input.versions, input.drawings),
    linkedTasks,
    linkedAcceptance,
    issueSignals,
    riskSignals,
  }
}

export function derivePackagesFromLegacyDrawings(drawings: DrawingRecordSource[]) {
  const groups = groupDrawingsByPackage(drawings)
  return Array.from(groups.entries()).map(([packageKey, groupDrawings]) => {
    const first = groupDrawings[0]
    const evaluation = evaluateDrawingReviewRule({
      disciplineType: first?.discipline_type ?? first?.drawing_type,
      documentPurpose: first?.document_purpose,
      packageCode: first?.package_code ?? makePackageKey(
        normalizeString(first?.discipline_type ?? first?.drawing_type, '其他'),
        normalizeString(first?.document_purpose, '施工执行'),
      ),
      packageName: first?.package_name,
    })
    const currentDrawing = selectCurrentDrawing(groupDrawings)
    return {
      id: packageKey,
      project_id: normalizeString(first?.project_id),
      package_code: normalizeString(first?.package_code, packageKey),
      package_name: normalizeString(first?.package_name, `${normalizeString(first?.discipline_type ?? first?.drawing_type, '其他')}图纸包`),
      discipline_type: normalizeString(first?.discipline_type ?? first?.drawing_type, '其他'),
      document_purpose: normalizeString(first?.document_purpose, '施工执行'),
      status: normalizeString(first?.package_status, 'issued'),
      requires_review: evaluation.requiresReview,
      review_mode: evaluation.reviewMode,
      review_basis: evaluation.reviewBasis,
      completeness_ratio: groupDrawings.length > 0 ? 100 : 0,
      missing_required_count: 0,
      current_version_drawing_id: normalizeString(currentDrawing?.id) || null,
      has_change: groupDrawings.some((drawing) => toBoolean(drawing.has_change)),
      schedule_impact_flag: groupDrawings.some((drawing) => deriveDrawingScheduleImpactFlag({
        status: drawing.status,
        drawingStatus: drawing.drawing_status,
        reviewStatus: drawing.review_status,
        plannedSubmitDate: drawing.planned_submit_date,
        actualSubmitDate: drawing.actual_submit_date,
        plannedPassDate: drawing.planned_pass_date,
        actualPassDate: drawing.actual_pass_date,
        hasChange: drawing.has_change,
        scheduleImpactFlag: drawing.schedule_impact_flag,
      })),
      is_ready_for_construction: groupDrawings.length > 0,
      is_ready_for_acceptance: normalizeString(first?.document_purpose) === '竣工归档' && groupDrawings.length > 0,
      created_at: normalizeString(first?.created_at) || null,
      updated_at: normalizeString(first?.updated_at) || null,
    } satisfies DrawingPackageSource
  })
}
