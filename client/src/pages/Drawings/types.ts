export type ReviewMode = 'mandatory' | 'optional' | 'none' | 'manual_confirm'

export interface DrawingBoardSummary {
  totalPackages: number
  missingPackages: number
  mandatoryReviewPackages: number
  reviewingPackages: number
  scheduleImpactCount: number
  readyForConstructionCount: number
  readyForAcceptanceCount: number
  plannedSubmitThisMonthCount?: number
  criticalBlockingDiscipline?: string | null
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
  review_opinion?: string | null
  review_report_no?: string | null
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
  designPerson?: string | null
  notes?: string | null
  review_opinion?: string | null
  review_report_no?: string | null
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

export interface DrawingVersionImpactItem {
  id: string
  name: string
  type: 'task' | 'acceptance' | 'certificate'
  status?: string
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
  impactedItems?: DrawingVersionImpactItem[]
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
  title: string
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

export interface DrawingsBoardResponse {
  summary: DrawingBoardSummary
  packages: DrawingPackageCard[]
}

export interface DrawingsLedgerResponse {
  drawings: DrawingLedgerRow[]
}

export interface DrawingsApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: string
}

export interface DrawingTemplateOption {
  templateCode: string
  templateName: string
  disciplineType: string
  documentPurpose: string
  defaultReviewMode: ReviewMode
}

export interface DrawingPackageTemplatePreviewItem {
  itemCode: string
  itemName: string
  disciplineType: string
  isRequired: boolean
  sortOrder: number
}

export interface DrawingPackageTemplatePreviewPackage {
  packageCode: string
  packageName: string
  disciplineType: string
  documentPurpose: string
  reviewMode: ReviewMode
  reviewBasis: string
  scopeLevel: 'project' | 'building' | 'specialty'
  deliverableRole:
    | 'site_and_building_execution_base'
    | 'statutory_review_package'
    | 'specialty_execution_package'
    | 'completion_archive_package'
  linkedConstructionStage: string
  linkedAcceptancePurpose: string
  overlaySource?: 'experience_replay_candidate'
  items: DrawingPackageTemplatePreviewItem[]
  action: 'will_create' | 'will_skip_existing'
  selected: boolean
  existingPackageId: string | null
}

export interface DrawingPackageTemplatePreview {
  templateCode: string
  templateName: string
  seedVersion: string
  projectId: string
  summary: {
    packageCreateCount: number
    packageSkipExistingCount: number
    itemCreateCount: number
  }
  templateBoundary: {
    assetLevel: 'drawing_package'
    mainPageLogic: 'preserved'
    applyPolicy: 'create_missing_packages_only'
  }
  businessProfile: {
    businessTypeCode: string
    businessTypeName: string
    source: 'project_generation_facts' | 'project_metadata' | 'project_field' | 'default'
    defaultPackageCodes: string[]
    optionalPackageCodes: string[]
    sourcePolicyHints: string[]
  }
  experienceOverlay?: {
    overlayCode: 'drawing_package_experience_overlay'
    sourceReportCode: string
    sourceSeedVersion: string
    additionalPackageCodes: string[]
    runtimeConsumptionPolicy: 'qualified_experience_overlay_after_replay_gate'
    qualityGate: {
      status: 'passed' | 'blocked'
      packageHitRate: number
      calibratedSampleCount: number
      blockReason?: 'experience_replay_quality_gate_not_passed'
    }
  } | null
  packages: DrawingPackageTemplatePreviewPackage[]
  warnings: Array<{
    code: string
    message: string
    severity: 'info' | 'warning'
  }>
}

export interface ApplyDrawingPackageTemplateResult {
  templateCode: string
  seedVersion: string
  projectId: string
  createdPackageIds: string[]
  createdItemIds: string[]
  skippedExisting: Array<{
    entityType: 'package'
    key: string
    reason: string
  }>
}
