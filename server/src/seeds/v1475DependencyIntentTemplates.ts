import type { WbsTemplateCatalogGroup } from './domainWbsTemplateCatalogs.js'

export type V1475DependencyRelationRole =
  | 'workflow'
  | 'evidence'
  | 'inspection'
  | 'approval'
  | 'handover'
  | 'commercial'
  | 'prerequisite'
  | 'management'
  | 'projected_link'

export type V1475DependencyIntentConfidenceLevel = 'high' | 'medium' | 'low'
export type V1475DependencyIntentMaterializeDirection = 'source_depends_on_target' | 'target_depends_on_source'

export type V1475DependencyIntentAuditReasonCode =
  | 'accepted_business_constraint_confirmed_template_only'
  | 'accepted_business_constraint_candidate_only'
  | 'accepted_business_constraint_manual_confirm'
  | 'accepted_business_constraint_reference_field_normalized'
  | 'rejected_physical_construction_mainline'
  | 'rejected_missing_reference_code'
  | 'rejected_missing_source_code'
  | 'rejected_relation_role_fallback'

export type V1475DependencyIntentTemplate = {
  intentCode: string
  fromCatalogGroup: WbsTemplateCatalogGroup
  fromReferencedCode: string
  toCatalogGroup: WbsTemplateCatalogGroup
  toReferencedCode: string
  relationRole: V1475DependencyRelationRole
  relationshipDomain: 'business_constraint'
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
  scopeRule: 'same_project' | 'same_phase' | 'same_building' | 'same_unit' | 'same_floor' | 'same_zone' | 'same_system'
  strength: 'hard' | 'recommended' | 'candidate'
  autoApplyPolicy: 'confirmed_template_only' | 'candidate_only' | 'manual_confirm'
  sourceSeedRuleIds: string[]
  conflictPolicy: 'explicit_dependency_wins' | 'project_fact_wins' | 'quarantine_on_conflict'
  materializeDirection?: V1475DependencyIntentMaterializeDirection
  matchedReferenceField?: string
  confidenceScore?: number
  confidenceLevel?: V1475DependencyIntentConfidenceLevel
  auditReasonCode?: V1475DependencyIntentAuditReasonCode
  auditTrace?: string[]
}

export type V1475DependencyIntentAuditRecord = {
  decision: 'accepted' | 'rejected'
  reasonCode: V1475DependencyIntentAuditReasonCode
  confidenceScore: number
  confidenceLevel: V1475DependencyIntentConfidenceLevel
  matchedReferenceField: string
  referenceGroup: WbsTemplateCatalogGroup
  fromCatalogGroup: WbsTemplateCatalogGroup
  fromReferencedCode: string
  toReferencedCode: string
  relationRole: V1475DependencyRelationRole
  relationshipDomain: 'business_constraint' | 'physical_construction_mainline'
  dependencyType: V1475DependencyIntentTemplate['dependencyType'] | null
  lagDays: number | null
  scopeRule: V1475DependencyIntentTemplate['scopeRule'] | null
  autoApplyPolicy: V1475DependencyIntentTemplate['autoApplyPolicy'] | null
  sourceSeedRuleIds: string[]
  intentCode: string | null
  auditTrace: string[]
}

export type V1475DependencyIntentResolutionSummary = {
  acceptedCount: number
  rejectedCount: number
  acceptedRuntimeEligibleCount: number
  acceptedCandidateOnlyCount: number
  acceptedManualConfirmCount: number
  rejectedPhysicalMainlineCount: number
  rejectedMissingSourceCodeCount: number
  rejectedMissingReferenceCodeCount: number
  rejectedRelationRoleFallbackCount: number
  confidenceScoreTotal: number
  confidenceScoreAverage: number
  byReferenceField: Record<string, { accepted: number; rejected: number }>
  byAuditReasonCode: Record<string, number>
  byConfidenceLevel: Record<V1475DependencyIntentConfidenceLevel, number>
}

export type V1475DependencyIntentResolution = {
  intents: V1475DependencyIntentTemplate[]
  audit: V1475DependencyIntentAuditRecord[]
  summary: V1475DependencyIntentResolutionSummary
}

export type V1475DependencyIntentScopeRule = V1475DependencyIntentTemplate['scopeRule']
export type V1475DependencyIntentPolicy = V1475DependencyIntentTemplate['autoApplyPolicy']

export const V1475_DEPENDENCY_INTENT_SCOPE_RULES: V1475DependencyIntentScopeRule[] = [
  'same_project',
  'same_phase',
  'same_building',
  'same_unit',
  'same_floor',
  'same_zone',
  'same_system',
]

// Catalog Group 只作为分类输入，不直接决定业务边界。
// 实体施工主线交接归 standard_internal_flow / cross_item_workflow，
// 本层只输出跨业务域约束依赖意图，不把施工主线写成 dependencyIntentTemplates。
export const DEPENDENCY_INTENT_REFERENCE_FIELDS: Array<{
  field: string
  semanticField: string
  group: WbsTemplateCatalogGroup
}> = [
  { field: 'referencedCoreQualityCodes', semanticField: 'semanticReferencedCoreQualityCodes', group: 'core_quality' },
  { field: 'referencedMilestoneCodes', semanticField: 'semanticReferencedMilestoneCodes', group: 'project_milestone' },
  { field: 'referencedSiteManagementCodes', semanticField: 'semanticReferencedSiteManagementCodes', group: 'site_management' },
  { field: 'referencedDangerControlCodes', semanticField: 'semanticReferencedDangerControlCodes', group: 'danger_control' },
  { field: 'referencedQualityResponsibilityCodes', semanticField: 'semanticReferencedQualityResponsibilityCodes', group: 'quality_responsibility' },
  { field: 'referencedDocumentCommercialCodes', semanticField: 'semanticReferencedDocumentCommercialCodes', group: 'document_commercial_support' },
  { field: 'referencedSpecialtyCodes', semanticField: 'semanticReferencedSpecialtyCodes', group: 'specialty' },
]

export const V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID = 'v1.4.22.2:explicit_business_gate_templates'

type V1475ExplicitBusinessGateTemplate = {
  templateCode: string
  fromCatalogGroup: WbsTemplateCatalogGroup
  fromReferencedCodePattern: RegExp
  sampleFromReferencedCode: string
  toCatalogGroup: WbsTemplateCatalogGroup
  toReferencedCodePattern: RegExp
  sampleToReferencedCode: string
  relationRoles: V1475DependencyRelationRole[]
  dependencyType: V1475DependencyIntentTemplate['dependencyType']
  lagDays: number
  scopeRule: V1475DependencyIntentScopeRule
  confidenceAdjustment: number
}

type V1475ExplicitBusinessGateMatch = {
  template: V1475ExplicitBusinessGateTemplate
  materializeDirection: V1475DependencyIntentMaterializeDirection
}

export const V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES: V1475ExplicitBusinessGateTemplate[] = [
  {
    templateCode: 'deep_pit_danger_control_approval_to_excavation_release',
    fromCatalogGroup: 'danger_control',
    fromReferencedCodePattern: /^DANGER-DEEP-PIT-APPROVAL(-|$)?/i,
    sampleFromReferencedCode: 'DANGER-DEEP-PIT-APPROVAL',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^(01-05-01|FND-02-01-02)(-|$)?/i,
    sampleToReferencedCode: '01-05-01',
    relationRoles: ['approval'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'fire_acceptance_to_fire_specialty_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-FIRE-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-FIRE-ACCEPTANCE',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^FIR-05-01-02(-|$)?/i,
    sampleToReferencedCode: 'FIR-05-01-02',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'closeout_archive_to_completion_acceptance',
    fromCatalogGroup: 'document_commercial_support',
    fromReferencedCodePattern: /^DCS-CLOSEOUT-ARCHIVE(-|$)?/i,
    sampleFromReferencedCode: 'DCS-CLOSEOUT-ARCHIVE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-/i,
    sampleToReferencedCode: 'MS-竣工验收',
    relationRoles: ['handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'household_acceptance_to_delivery_filing_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-HOUSEHOLD-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-HOUSEHOLD-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(DELIVERY-FILING|DELIVERY-CONDITION-FILING|DELIVERY-RECORD)(-|$)?/i,
    sampleToReferencedCode: 'MS-DELIVERY-FILING',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'household_acceptance_to_delivery_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-HOUSEHOLD-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-HOUSEHOLD-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(DELIVERY|HANDOVER|OWNER)/i,
    sampleToReferencedCode: 'MS-DELIVERY-HANDOVER',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 10,
  },
  {
    templateCode: 'dangerous_subproject_plan_approval_to_construction_release',
    fromCatalogGroup: 'danger_control',
    fromReferencedCodePattern: /^DANGER-(MAJOR-WORKS-PLAN-APPROVAL|DANGEROUS-SUBPROJECT-APPROVAL)(-|$)?/i,
    sampleFromReferencedCode: 'DANGER-MAJOR-WORKS-PLAN-APPROVAL',
    toCatalogGroup: 'site_management',
    toReferencedCodePattern: /^SM-(CONSTRUCTION-RELEASE|WORK-START-RELEASE|SITE-RELEASE)(-|$)?/i,
    sampleToReferencedCode: 'SM-CONSTRUCTION-RELEASE',
    relationRoles: ['approval', 'prerequisite'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'fire_acceptance_to_occupancy_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-FIRE-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-FIRE-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OCCUPANCY-USE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'power_acceptance_to_energization_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-POWER-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-POWER-ACCEPTANCE',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^ELE-UTILITY-POWER-ON(-|$)?/i,
    sampleToReferencedCode: 'ELE-UTILITY-POWER-ON',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 11,
  },
  {
    templateCode: 'water_supply_acceptance_to_water_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-WATER-SUPPLY-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-WATER-SUPPLY-ACCEPTANCE',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^PLU-UTILITY-WATER-ON(-|$)?/i,
    sampleToReferencedCode: 'PLU-UTILITY-WATER-ON',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 11,
  },
  {
    templateCode: 'planning_acceptance_to_completion_acceptance',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-PLANNING-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-PLANNING-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(COMPLETION|FINAL|竣工)/i,
    sampleToReferencedCode: 'MS-COMPLETION-ACCEPTANCE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'environmental_acceptance_to_occupancy_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-ENVIRONMENTAL-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-ENVIRONMENTAL-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OCCUPANCY-USE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'civil_defense_acceptance_to_completion_acceptance',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-CIVIL-DEFENSE-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-CIVIL-DEFENSE-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(COMPLETION|FINAL|竣工)/i,
    sampleToReferencedCode: 'MS-COMPLETION-ACCEPTANCE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'civil_defense_acceptance_to_occupancy_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-CIVIL-DEFENSE-ACCEPTANCE(-|$)?/i,
    sampleFromReferencedCode: 'MS-CIVIL-DEFENSE-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OCCUPANCY-USE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'completion_acceptance_to_occupancy_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(COMPLETION-ACCEPTANCE|FINAL-ACCEPTANCE|竣工验收)(-|$)?/i,
    sampleFromReferencedCode: 'MS-COMPLETION-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OCCUPANCY-USE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'completion_acceptance_to_owner_delivery_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(COMPLETION-ACCEPTANCE|FINAL-ACCEPTANCE|竣工验收)(-|$)?/i,
    sampleFromReferencedCode: 'MS-COMPLETION-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OWNER-DELIVERY|DELIVERY|HANDOVER)(-|$)?/i,
    sampleToReferencedCode: 'MS-OWNER-DELIVERY',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'completion_filing_to_occupancy_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(COMPLETION-FILING|COMPLETION-RECORD|01-01-11|竣工备案)(-|$)?/i,
    sampleFromReferencedCode: 'MS-COMPLETION-FILING',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OCCUPANCY-USE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'completion_filing_to_delivery_filing_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(COMPLETION-FILING|COMPLETION-RECORD|01-01-11)(-|$)?/i,
    sampleFromReferencedCode: 'MS-COMPLETION-FILING',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(DELIVERY-FILING|DELIVERY-CONDITION-FILING|DELIVERY-RECORD)(-|$)?/i,
    sampleToReferencedCode: 'MS-DELIVERY-FILING',
    relationRoles: ['approval', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'completion_filing_to_owner_delivery_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(COMPLETION-FILING|COMPLETION-RECORD|01-01-11)(-|$)?/i,
    sampleFromReferencedCode: 'MS-COMPLETION-FILING',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OWNER-DELIVERY|DELIVERY|HANDOVER)(-|$)?/i,
    sampleToReferencedCode: 'MS-OWNER-DELIVERY',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'delivery_filing_to_owner_delivery_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(DELIVERY-FILING|DELIVERY-CONDITION-FILING|DELIVERY-RECORD)(-|$)?/i,
    sampleFromReferencedCode: 'MS-DELIVERY-FILING',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OWNER-DELIVERY|DELIVERY|HANDOVER)(-|$)?/i,
    sampleToReferencedCode: 'MS-OWNER-DELIVERY',
    relationRoles: ['approval', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'quality_supervision_report_to_completion_filing',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^(MS-(QUALITY-SUPERVISION-REPORT|QUALITY-SUPERVISION)|QUALITY_SUPERVISION_REPORT)(-|$)?/i,
    sampleFromReferencedCode: 'MS-QUALITY-SUPERVISION-REPORT',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^(MS-(COMPLETION-FILING|COMPLETION-RECORD|竣工备案)|COMPLETION_FILING)(-|$)?/i,
    sampleToReferencedCode: 'MS-COMPLETION-FILING',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'sanitation_facility_acceptance_to_delivery_filing_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(SANITATION-FACILITY-ACCEPTANCE|WASTE-FACILITY-ACCEPTANCE)(-|$)?/i,
    sampleFromReferencedCode: 'MS-SANITATION-FACILITY-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(DELIVERY-FILING|DELIVERY-CONDITION-FILING|DELIVERY-RECORD)(-|$)?/i,
    sampleToReferencedCode: 'MS-DELIVERY-FILING',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'archive_acceptance_to_completion_filing_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(ARCHIVE-ACCEPTANCE|ARCHIVE-HANDOVER)(-|$)?/i,
    sampleFromReferencedCode: 'MS-ARCHIVE-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(COMPLETION-FILING|COMPLETION-RECORD)(-|$)?/i,
    sampleToReferencedCode: 'MS-COMPLETION-FILING',
    relationRoles: ['handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'comprehensive_acceptance_to_completion_filing_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(COMPREHENSIVE-ACCEPTANCE|JOINT-ACCEPTANCE)(-|$)?/i,
    sampleFromReferencedCode: 'MS-COMPREHENSIVE-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(COMPLETION-FILING|COMPLETION-RECORD)(-|$)?/i,
    sampleToReferencedCode: 'MS-COMPLETION-FILING',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'property_handover_inspection_to_delivery_filing_release',
    fromCatalogGroup: 'site_management',
    fromReferencedCodePattern: /^SM-PROPERTY-TAKEOVER-INSPECTION(-|$)?/i,
    sampleFromReferencedCode: 'SM-PROPERTY-TAKEOVER-INSPECTION',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(DELIVERY-FILING|DELIVERY-CONDITION-FILING|DELIVERY-RECORD)(-|$)?/i,
    sampleToReferencedCode: 'MS-DELIVERY-FILING',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'property_takeover_inspection_to_owner_delivery',
    fromCatalogGroup: 'site_management',
    fromReferencedCodePattern: /^SM-PROPERTY-TAKEOVER-INSPECTION(-|$)?/i,
    sampleFromReferencedCode: 'SM-PROPERTY-TAKEOVER-INSPECTION',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OWNER-DELIVERY|DELIVERY|HANDOVER)(-|$)?/i,
    sampleToReferencedCode: 'MS-OWNER-DELIVERY',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'public_assembly_fire_safety_check_to_opening_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(PUBLIC-ASSEMBLY-FIRE-SAFETY-CHECK|PUBLIC-ASSEMBLY-FIRE-CHECK|OPENING-FIRE-SAFETY-CHECK)(-|$)?/i,
    sampleFromReferencedCode: 'MS-PUBLIC-ASSEMBLY-FIRE-SAFETY-CHECK',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OPENING-RELEASE|OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OPENING-RELEASE',
    relationRoles: ['approval', 'inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'operation_handover_dossier_to_warranty_start_release',
    fromCatalogGroup: 'document_commercial_support',
    fromReferencedCodePattern: /^DCS-01-01-06(-|$)?/i,
    sampleFromReferencedCode: 'DCS-01-01-06',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-01-01-12(-|$)?/i,
    sampleToReferencedCode: 'MS-01-01-12',
    relationRoles: ['handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'system_commissioning_to_trial_operation_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(SYSTEM-COMMISSIONING-COMPLETE|COMMISSIONING-COMPLETE|MEP-FIRE-LINKAGE-COMMISSIONING)(-|$)?/i,
    sampleFromReferencedCode: 'MS-SYSTEM-COMMISSIONING-COMPLETE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(TRIAL-OPERATION-RELEASE|TRIAL-OPERATION|OPENING-RELEASE)(-|$)?/i,
    sampleToReferencedCode: 'MS-TRIAL-OPERATION-RELEASE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'elevator_authority_inspection_to_occupancy_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(ELEVATOR-AUTHORITY-INSPECTION|ELEVATOR-SUPERVISION-INSPECTION|LIFT-AUTHORITY-INSPECTION)(-|$)?/i,
    sampleFromReferencedCode: 'MS-ELEVATOR-AUTHORITY-INSPECTION',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OCCUPANCY-USE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'gas_acceptance_to_kitchen_operation_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(GAS-ACCEPTANCE|GAS-SPECIAL-ACCEPTANCE|KITCHEN-GAS-ACCEPTANCE)(-|$)?/i,
    sampleFromReferencedCode: 'MS-GAS-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(KITCHEN-OPERATION-RELEASE|HOTEL-KITCHEN-OPERATION|CATERING-OPERATION-RELEASE)(-|$)?/i,
    sampleToReferencedCode: 'MS-KITCHEN-OPERATION-RELEASE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'gas_acceptance_to_occupancy_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(GAS-ACCEPTANCE|GAS-SPECIAL-ACCEPTANCE|KITCHEN-GAS-ACCEPTANCE)(-|$)?/i,
    sampleFromReferencedCode: 'MS-GAS-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OCCUPANCY-USE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'lightning_protection_acceptance_to_occupancy_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(LIGHTNING-PROTECTION-ACCEPTANCE|LIGHTNING-ACCEPTANCE|防雷验收)(-|$)?/i,
    sampleFromReferencedCode: 'MS-LIGHTNING-PROTECTION-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OCCUPANCY-USE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'ev_charging_acceptance_filing_to_charging_system_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-23-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-23-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^ELE-03-02-01-P08-S04$/i,
    sampleToReferencedCode: 'ELE-03-02-01-P08-S04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'prefab_assembly_rate_acceptance_to_quality_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-24-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-24-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^PFB-03-01-(02-P08|03-P06)$/i,
    sampleToReferencedCode: 'PFB-03-01-02-P08',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'mic_assembly_rate_certification_to_completion_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-80-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-80-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^MIC-05-01-02-P05$/i,
    sampleToReferencedCode: 'MIC-05-01-02-P05',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'mic_inter_module_pressure_test_to_interface_commissioning_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-84-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-84-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^MIC-05-01-01-P04$/i,
    sampleToReferencedCode: 'MIC-05-01-01-P04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'mic_waterproof_spray_test_to_envelope_interface_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-85-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-85-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^MIC-05-01-01-P0(3|5)$/i,
    sampleToReferencedCode: 'MIC-05-01-01-P03',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'ibu_closed_water_test_to_site_installation_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-86-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-86-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^IBU-02-01-01-P05$/i,
    sampleToReferencedCode: 'IBU-02-01-01-P05',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'hotel_trial_operation_stress_test_to_takeover_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-94-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-94-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^HTL-05-01-02-P0(4|5)$/i,
    sampleToReferencedCode: 'HTL-05-01-02-P04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'pile_trial_tension_test_review_to_pile_parameter_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-98-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-98-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^FND-01-01-03-P0(3|4)$/i,
    sampleToReferencedCode: 'FND-01-01-03-P03',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'diaphragm_wall_trial_section_acceptance_to_support_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-99-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-99-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^FND-02-01-01-P02$/i,
    sampleToReferencedCode: 'FND-02-01-01-P02',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'pile_mass_post_construction_detection_to_acceptance_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-102-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-102-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^FND-01-01-03-P0(6|7|9)$/i,
    sampleToReferencedCode: 'FND-01-01-03-P06',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'wind_tunnel_report_to_roof_skylight_smoke_vent_interface_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-50-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-50-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^STL-03-01-01-P07$/i,
    sampleToReferencedCode: 'STL-03-01-01-P07',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'shm_operation_to_roof_skylight_smoke_vent_interface_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-53-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-53-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^STL-03-01-01-P07$/i,
    sampleToReferencedCode: 'STL-03-01-01-P07',
    relationRoles: ['handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'sample_plan_confirmation_to_quality_sample_lead_release',
    fromCatalogGroup: 'specialty',
    fromReferencedCodePattern: /^BDT-06-01-01-P01$/i,
    sampleFromReferencedCode: 'BDT-06-01-01-P01',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-14-P01$/i,
    sampleToReferencedCode: 'QR-01-01-14-P01',
    relationRoles: ['prerequisite'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'fitout_sample_room_material_confirmation_to_quality_sample_release',
    fromCatalogGroup: 'specialty',
    fromReferencedCodePattern: /^BDT-06-01-05-P01$/i,
    sampleFromReferencedCode: 'BDT-06-01-05-P01',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-14-P04$/i,
    sampleToReferencedCode: 'QR-01-01-14-P04',
    relationRoles: ['prerequisite'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'facade_performance_inspection_handover_to_sample_quality_release',
    fromCatalogGroup: 'specialty',
    fromReferencedCodePattern: /^FAC-02-01-02-P09$/i,
    sampleFromReferencedCode: 'FAC-02-01-02-P09',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-14-P04$/i,
    sampleToReferencedCode: 'QR-01-01-14-P04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'indoor_air_quality_report_handover_to_delivery_quality_release',
    fromCatalogGroup: 'specialty',
    fromReferencedCodePattern: /^DEC-03A-01-01-P09$/i,
    sampleFromReferencedCode: 'DEC-03A-01-01-P09',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-(13|15)-P05$/i,
    sampleToReferencedCode: 'QR-01-01-13-P05',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'fire_detection_report_handover_to_fire_acceptance_quality_release',
    fromCatalogGroup: 'specialty',
    fromReferencedCodePattern: /^FIR-05-01-01-P09$/i,
    sampleFromReferencedCode: 'FIR-05-01-01-P09',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-10-P01$/i,
    sampleToReferencedCode: 'QR-01-01-10-P01',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'fire_acceptance_opinion_archive_to_fire_acceptance_quality_release',
    fromCatalogGroup: 'specialty',
    fromReferencedCodePattern: /^FIR-05-01-02-P09$/i,
    sampleFromReferencedCode: 'FIR-05-01-02-P09',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-10-P01$/i,
    sampleToReferencedCode: 'QR-01-01-10-P01',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'civil_defense_acceptance_opinion_closeout_to_acceptance_quality_release',
    fromCatalogGroup: 'specialty',
    fromReferencedCodePattern: /^CDF-02-01-02-P09$/i,
    sampleFromReferencedCode: 'CDF-02-01-02-P09',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-10-P02$/i,
    sampleToReferencedCode: 'QR-01-01-10-P02',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'civil_defense_function_retest_handover_to_acceptance_quality_release',
    fromCatalogGroup: 'specialty',
    fromReferencedCodePattern: /^CDF-02-01-02-P10$/i,
    sampleFromReferencedCode: 'CDF-02-01-02-P10',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-10-P02$/i,
    sampleToReferencedCode: 'QR-01-01-10-P02',
    relationRoles: ['handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'energy_acceptance_to_completion_acceptance',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(ENERGY-ACCEPTANCE|ENERGY-SPECIAL-ACCEPTANCE|BUILDING-ENERGY-ACCEPTANCE|01-01-63)(-|$)?/i,
    sampleFromReferencedCode: 'MS-ENERGY-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(COMPLETION|FINAL|01-01-09|01-01-11|绔ｅ伐)/i,
    sampleToReferencedCode: 'MS-COMPLETION-ACCEPTANCE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'energy_acceptance_to_occupancy_use_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(ENERGY-ACCEPTANCE|ENERGY-SPECIAL-ACCEPTANCE|BUILDING-ENERGY-ACCEPTANCE|01-01-63)(-|$)?/i,
    sampleFromReferencedCode: 'MS-ENERGY-SPECIAL-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(OCCUPANCY|USE|OPERATION|OPENING)(-|$)?/i,
    sampleToReferencedCode: 'MS-OCCUPANCY-USE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_project',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'special_equipment_supervision_inspection_to_equipment_operation_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(SPECIAL-EQUIPMENT-SUPERVISION-INSPECTION|SPECIAL-EQUIPMENT-INSPECTION|EQUIPMENT-SUPERVISION-INSPECTION)(-|$)?/i,
    sampleFromReferencedCode: 'MS-SPECIAL-EQUIPMENT-SUPERVISION-INSPECTION',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(EQUIPMENT-OPERATION-RELEASE|SPECIAL-EQUIPMENT-OPERATION|EQUIPMENT-USE-RELEASE)(-|$)?/i,
    sampleToReferencedCode: 'MS-EQUIPMENT-OPERATION-RELEASE',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'weak_current_security_acceptance_to_smart_building_operation',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-(WEAK-CURRENT-SECURITY-ACCEPTANCE|NETWORK-SECURITY-ACCEPTANCE|SMART-BUILDING-ACCEPTANCE)(-|$)?/i,
    sampleFromReferencedCode: 'MS-WEAK-CURRENT-SECURITY-ACCEPTANCE',
    toCatalogGroup: 'project_milestone',
    toReferencedCodePattern: /^MS-(SMART-BUILDING-OPERATION|NETWORK-OPERATION-RELEASE|SECURITY-SYSTEM-OPERATION)(-|$)?/i,
    sampleToReferencedCode: 'MS-SMART-BUILDING-OPERATION',
    relationRoles: ['inspection', 'handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'tier_design_certification_to_data_center_design_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-32-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-32-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^DTC-01-01-01-P01$/i,
    sampleToReferencedCode: 'DTC-01-01-01-P01',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'industrial_fat_acceptance_to_equipment_site_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-39-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-39-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^ICR-04-01-01-P04$/i,
    sampleToReferencedCode: 'ICR-04-01-01-P04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'industrial_iq_acceptance_to_validation_boundary_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-41-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-41-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^ICR-01-01-01-P04$/i,
    sampleToReferencedCode: 'ICR-01-01-01-P04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'existing_structure_expert_review_to_renovation_investigation_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-57-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-57-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^RNV-01-01-01-P04$/i,
    sampleToReferencedCode: 'RNV-01-01-01-P04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'renovation_hazard_closeout_to_occupied_work_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-58-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-58-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^RNV-01-01-02-P05$/i,
    sampleToReferencedCode: 'RNV-01-01-02-P05',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'energy_retrofit_acceptance_to_envelope_energy_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-63-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-63-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^WPI-02-01-02-P06$/i,
    sampleToReferencedCode: 'WPI-02-01-02-P06',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'medical_gas_acceptance_to_medical_gas_system_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-27-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-27-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^CLN-01-01-02-P06$/i,
    sampleToReferencedCode: 'CLN-01-01-02-P06',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'radiation_protection_health_acceptance_to_special_room_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-28-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-28-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^CLN-03-01-01-P05$/i,
    sampleToReferencedCode: 'CLN-03-01-01-P05',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'high_formwork_acceptance_to_concrete_placement_release',
    fromCatalogGroup: 'danger_control',
    fromReferencedCodePattern: /^DANGER-02-01-04-P04$/i,
    sampleFromReferencedCode: 'DANGER-02-01-04-P04',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-03-P04$/i,
    sampleToReferencedCode: '02-01-03-P04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_floor',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'tod_nonstop_operation_plan_approval_to_interface_work_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-73-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-73-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^TOD-01-01-02-P01$/i,
    sampleToReferencedCode: 'TOD-01-01-02-P01',
    relationRoles: ['approval'],
    dependencyType: 'FS',
    lagDays: 2,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'tod_metro_operator_interface_acceptance_to_trial_operation_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-77-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-77-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^TOD-03-01-02-P04$/i,
    sampleToReferencedCode: 'TOD-03-01-02-P04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'high_speed_rail_trial_operation_to_tod_handover_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-56-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-56-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^TOD-03-01-02-P04$/i,
    sampleToReferencedCode: 'TOD-03-01-02-P04',
    relationRoles: ['handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_phase',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'deep_pit_special_acceptance_to_foundation_followup_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-101-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-101-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^FND-02-01-(01|02)-P06$/i,
    sampleToReferencedCode: 'FND-02-01-01-P06',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'civil_defense_function_retest_to_property_handover_quality_release',
    fromCatalogGroup: 'specialty',
    fromReferencedCodePattern: /^CDF-02-01-02-P06$/i,
    sampleFromReferencedCode: 'CDF-02-01-02-P06',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-10-P02$/i,
    sampleToReferencedCode: 'QR-01-01-10-P02',
    relationRoles: ['handover'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'high_formwork_dismantling_strength_report_to_formwork_removal_release',
    fromCatalogGroup: 'danger_control',
    fromReferencedCodePattern: /^DANGER-02-01-04-P06$/i,
    sampleFromReferencedCode: 'DANGER-02-01-04-P06',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-03-P11$/i,
    sampleToReferencedCode: '02-01-03-P11',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_floor',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'tool_formwork_stop_dismantling_condition_to_formwork_removal_release',
    fromCatalogGroup: 'danger_control',
    fromReferencedCodePattern: /^DANGER-02-01-05-P06$/i,
    sampleFromReferencedCode: 'DANGER-02-01-05-P06',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-03-P11$/i,
    sampleToReferencedCode: '02-01-03-P11',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_floor',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'concrete_specimen_witness_sampling_to_pour_quality_release',
    fromCatalogGroup: 'quality_responsibility',
    fromReferencedCodePattern: /^QR-01-01-03-P02$/i,
    sampleFromReferencedCode: 'QR-01-01-03-P02',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-(03|05)-P(05|06|07)$/i,
    sampleToReferencedCode: '02-01-03-P05',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 10,
  },
  {
    templateCode: 'witness_sampling_report_closure_to_concrete_quality_release',
    fromCatalogGroup: 'quality_responsibility',
    fromReferencedCodePattern: /^QR-01-01-03-P04$/i,
    sampleFromReferencedCode: 'QR-01-01-03-P04',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-03-P(04|05|06)$/i,
    sampleToReferencedCode: '02-01-03-P04',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 10,
  },
  {
    templateCode: 'concealed_rebar_formwork_mep_acceptance_to_concrete_pour_release',
    fromCatalogGroup: 'quality_responsibility',
    fromReferencedCodePattern: /^QR-01-01-05-P02$/i,
    sampleFromReferencedCode: 'QR-01-01-05-P02',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-03-P04$/i,
    sampleToReferencedCode: '02-01-03-P04',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_floor',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'concrete_measured_quality_inspection_to_entity_quality_release',
    fromCatalogGroup: 'quality_responsibility',
    fromReferencedCodePattern: /^QR-01-01-06-P01$/i,
    sampleFromReferencedCode: 'QR-01-01-06-P01',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-(01-(03|05)-P16|04-02-P06|05-05-P06)$/i,
    sampleToReferencedCode: '02-01-03-P16',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_floor',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'main_structure_entity_quality_detection_to_entity_quality_release',
    fromCatalogGroup: 'quality_responsibility',
    fromReferencedCodePattern: /^QR-01-01-08-P02$/i,
    sampleFromReferencedCode: 'QR-01-01-08-P02',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-(03|05)-P16$/i,
    sampleToReferencedCode: '02-01-03-P16',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_floor',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'main_structure_third_party_detection_to_entity_quality_release',
    fromCatalogGroup: 'quality_responsibility',
    fromReferencedCodePattern: /^QR-01-01-04-P03$/i,
    sampleFromReferencedCode: 'QR-01-01-04-P03',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-(03|05)-P16$/i,
    sampleToReferencedCode: '02-01-03-P16',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'main_structure_dispute_recheck_to_entity_quality_release',
    fromCatalogGroup: 'quality_responsibility',
    fromReferencedCodePattern: /^QR-01-01-17-P06$/i,
    sampleFromReferencedCode: 'QR-01-01-17-P06',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-(03|05)-P16$/i,
    sampleToReferencedCode: '02-01-03-P16',
    relationRoles: ['evidence'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'masonry_plaster_measured_quality_inspection_to_finish_quality_release',
    fromCatalogGroup: 'quality_responsibility',
    fromReferencedCodePattern: /^QR-01-01-06-P02$/i,
    sampleFromReferencedCode: 'QR-01-01-06-P02',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-02-(01-P09|02-P06|03-P07|04-P07|05-P06)$/i,
    sampleToReferencedCode: '02-02-01-P09',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_floor',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'energy_special_acceptance_to_energy_quality_release',
    fromCatalogGroup: 'quality_responsibility',
    fromReferencedCodePattern: /^QR-01-01-09-P03$/i,
    sampleFromReferencedCode: 'QR-01-01-09-P03',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^09-(01-01-P09|02-01-P08|03-01-P08|04-01-P08|05-01-P08)$/i,
    sampleToReferencedCode: '09-01-01-P09',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'special_acceptance_bundle_to_energy_quality_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-10-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-10-P01',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^09-(01-01-P09|02-01-P08|03-01-P08|04-01-P08|05-01-P08)$/i,
    sampleToReferencedCode: '09-01-01-P09',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'special_acceptance_bundle_to_quality_responsibility_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-10-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-10-P01',
    toCatalogGroup: 'quality_responsibility',
    toReferencedCodePattern: /^QR-01-01-(09-P03|10-P01|10-P02)$/i,
    sampleToReferencedCode: 'QR-01-01-09-P03',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_building',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'special_acceptance_bundle_to_specialty_node_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-10-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-10-P01',
    toCatalogGroup: 'specialty',
    toReferencedCodePattern: /^(WPI-02-01-02-P06|FIR-05-01-02-P0(6|8)|CDF-02-01-02-P0(6|7)|ELV-02-01-02-P0(6|7|8))$/i,
    sampleToReferencedCode: 'WPI-02-01-02-P06',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_system',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'foundation_acceptance_milestone_to_foundation_quality_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-06-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-06-P01',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^01-(02-02-P07|03-01-P07)$/i,
    sampleToReferencedCode: '01-02-02-P07',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_zone',
    confidenceAdjustment: 12,
  },
  {
    templateCode: 'main_structure_acceptance_milestone_to_entity_quality_release',
    fromCatalogGroup: 'project_milestone',
    fromReferencedCodePattern: /^MS-01-01-07-P01$/i,
    sampleFromReferencedCode: 'MS-01-01-07-P01',
    toCatalogGroup: 'core_quality',
    toReferencedCodePattern: /^02-01-(03|05)-P16$/i,
    sampleToReferencedCode: '02-01-03-P16',
    relationRoles: ['inspection'],
    dependencyType: 'FS',
    lagDays: 1,
    scopeRule: 'same_floor',
    confidenceAdjustment: 12,
  },
]

const DEPENDENCY_INTENT_SPECIALTY_PREFIXES = [
  'BDT',
  'OUT',
  'MUN',
  'DEC',
  'MEP',
  'FIR',
  'FAC',
  'ELV',
  'INT',
  'HVA',
  'HVAC',
  'PLU',
  'ELE',
  'FND',
  'STL',
  'PFB',
  'WPI',
  'CDF',
  'CLN',
  'DTC',
  'ICR',
  'RNV',
  'HRT',
  'CMP',
  'TOD',
  'MIC',
  'IBU',
  'IKU',
  'HTL',
]

function inferCatalogGroupFromReferencedCode(code: string): WbsTemplateCatalogGroup | null {
  const normalizedCode = normalizeText(code).toUpperCase()
  if (!normalizedCode) return null
  if (/^QR-/.test(normalizedCode)) return 'quality_responsibility'
  if (/^MS-/.test(normalizedCode)) return 'project_milestone'
  if (/^DANGER-/.test(normalizedCode)) return 'danger_control'
  if (/^(DOC|DCS)-/.test(normalizedCode)) return 'document_commercial_support'
  if (/^(SM|SITE)-/.test(normalizedCode)) return 'site_management'
  if (/^(0[1-9]|10)(-|$)/.test(normalizedCode)) return 'core_quality'
  const prefix = normalizedCode.split('-')[0]
  if (DEPENDENCY_INTENT_SPECIALTY_PREFIXES.includes(prefix)) return 'specialty'
  return null
}

export function inferV1475ReferenceCatalogGroupFromCode(code: string): WbsTemplateCatalogGroup | null {
  return inferCatalogGroupFromReferencedCode(code)
}

export function resolveV1475ReferenceCatalogGroup(input: {
  declaredGroup: WbsTemplateCatalogGroup
  field: string
  code: string
}) {
  const inferredGroup = inferCatalogGroupFromReferencedCode(input.code)
  if (!inferredGroup || inferredGroup === input.declaredGroup) {
    return {
      group: input.declaredGroup,
      normalized: false,
      auditTrace: [] as string[],
    }
  }
  return {
    group: inferredGroup,
    normalized: true,
    auditTrace: [
      `declaredReferenceGroup=${input.declaredGroup}`,
      `normalizedReferenceGroup=${inferredGroup}`,
      `referenceField=${input.field}`,
      `referenceCode=${input.code}`,
    ],
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readReferenceCodes(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(normalizeText).filter(Boolean))]
  const text = normalizeText(value)
  return text ? [...new Set(text.split(/[,\s]+/).map(normalizeText).filter(Boolean))] : []
}

export function readDependencyIntentReferenceCodes(
  metadata: Record<string, unknown>,
  referenceField: { field: string; semanticField?: string },
): string[] {
  return [...new Set([
    ...readReferenceCodes(metadata[referenceField.field]),
    ...readReferenceCodes(referenceField.semanticField ? metadata[referenceField.semanticField] : undefined),
  ])]
}

function normalizeRelationRole(value: unknown): V1475DependencyRelationRole {
  const role = normalizeText(value) as V1475DependencyRelationRole
  if (['workflow', 'evidence', 'inspection', 'approval', 'handover', 'commercial', 'prerequisite', 'management', 'projected_link'].includes(role)) return role
  return 'workflow'
}

function normalizeRelationRoleWithAudit(value: unknown) {
  const rawRelationRole = normalizeText(value)
  const relationRole = normalizeRelationRole(rawRelationRole)
  return {
    relationRole,
    rawRelationRole,
    fallbackUsed: Boolean(rawRelationRole) && rawRelationRole !== relationRole,
  }
}

function normalizeDependencyIntentPolicy(value: unknown): V1475DependencyIntentPolicy | null {
  const policy = normalizeText(value) as V1475DependencyIntentPolicy
  if (['confirmed_template_only', 'candidate_only', 'manual_confirm'].includes(policy)) return policy
  return null
}

function normalizeDependencyIntentScopeRule(value: unknown): V1475DependencyIntentScopeRule | null {
  const scopeRule = normalizeText(value) as V1475DependencyIntentScopeRule
  return V1475_DEPENDENCY_INTENT_SCOPE_RULES.includes(scopeRule) ? scopeRule : null
}

function normalizeConfidenceAdjustment(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(-20, Math.min(20, Math.round(numeric)))
}

// 施工组之间的 workflow/prerequisite 在本层只作为治理候选信号。
// 运行期默认依赖只留给跨业务域约束，并且后续还要通过 scope 兼容校验。
const V1475_PHYSICAL_WORKFLOW_METADATA_REFERENCE_KEYS = new Set([
  'workflow|project_milestone|MS-01-01-13-P01|core_quality|01-02-02-P07',
  'workflow|project_milestone|MS-01-01-13-P01|core_quality|02-01-01-P01',
  'workflow|project_milestone|MS-01-01-14-P01|core_quality|02-01-03-P16',
  'workflow|project_milestone|MS-01-01-14-P01|core_quality|02-01-05-P16',
  'workflow|specialty|BDT-06-01-01-P02|quality_responsibility|QR-01-01-14-P02',
  'workflow|specialty|BDT-06-01-01-P03|quality_responsibility|QR-01-01-14-P03',
  'workflow|specialty|BDT-06-01-05-P02|quality_responsibility|QR-01-01-14-P04',
  'workflow|specialty|BDT-06-01-06-P02|quality_responsibility|QR-01-01-14-P04',
])

function physicalWorkflowMetadataReferenceKey(input: {
  role: V1475DependencyRelationRole
  fromGroup: WbsTemplateCatalogGroup
  fromReferencedCode?: string
  toGroup: WbsTemplateCatalogGroup
  toReferencedCode?: string
}) {
  return [
    input.role,
    input.fromGroup,
    normalizeText(input.fromReferencedCode),
    input.toGroup,
    normalizeText(input.toReferencedCode),
  ].join('|')
}

export function isV1475ConstructionMainlineReference(
  role: V1475DependencyRelationRole,
  fromGroup: WbsTemplateCatalogGroup,
  toGroup: WbsTemplateCatalogGroup,
  fromReferencedCode?: string,
  toReferencedCode?: string,
) {
  if ((role === 'handover' || role === 'inspection') && fromGroup === 'specialty' && toGroup === 'specialty') return true
  if (role !== 'workflow' && role !== 'prerequisite') return false
  const fromConstructionGroup = fromGroup === 'core_quality' || fromGroup === 'specialty'
  const toConstructionGroup = toGroup === 'core_quality' || toGroup === 'specialty'
  if (fromConstructionGroup && toConstructionGroup) return true
  return V1475_PHYSICAL_WORKFLOW_METADATA_REFERENCE_KEYS.has(physicalWorkflowMetadataReferenceKey({
    role,
    fromGroup,
    fromReferencedCode,
    toGroup,
    toReferencedCode,
  }))
}

export function shouldEmitV1475DependencyIntent(
  role: V1475DependencyRelationRole,
  fromGroup: WbsTemplateCatalogGroup,
  toGroup: WbsTemplateCatalogGroup,
  fromReferencedCode?: string,
  toReferencedCode?: string,
) {
  return !isV1475ConstructionMainlineReference(role, fromGroup, toGroup, fromReferencedCode, toReferencedCode)
}

function findV1475ExplicitBusinessGateTemplate(input: {
  fromCatalogGroup: WbsTemplateCatalogGroup
  fromReferencedCode: string
  toCatalogGroup: WbsTemplateCatalogGroup
  toReferencedCode: string
  relationRole: V1475DependencyRelationRole
}): V1475ExplicitBusinessGateMatch | null {
  const fromReferencedCode = normalizeText(input.fromReferencedCode)
  const toReferencedCode = normalizeText(input.toReferencedCode)
  const directMatch = V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES.find((template) => (
    template.fromCatalogGroup === input.fromCatalogGroup
    && template.toCatalogGroup === input.toCatalogGroup
    && template.relationRoles.includes(input.relationRole)
    && template.fromReferencedCodePattern.test(fromReferencedCode)
    && template.toReferencedCodePattern.test(toReferencedCode)
  )) ?? null
  if (directMatch) {
    return {
      template: directMatch,
      materializeDirection: 'target_depends_on_source',
    }
  }

  const reverseMatch = V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES.find((template) => (
    template.fromCatalogGroup === input.toCatalogGroup
    && template.toCatalogGroup === input.fromCatalogGroup
    && template.relationRoles.includes(input.relationRole)
    && template.fromReferencedCodePattern.test(toReferencedCode)
    && template.toReferencedCodePattern.test(fromReferencedCode)
  )) ?? null
  if (!reverseMatch) return null

  return {
    template: reverseMatch,
    materializeDirection: 'source_depends_on_target',
  }
}

function dependencyShapeFor(input: {
  role: V1475DependencyRelationRole
  fromGroup: WbsTemplateCatalogGroup
  toGroup: WbsTemplateCatalogGroup
  metadata: Record<string, unknown>
}) {
  const metadataPolicy = normalizeDependencyIntentPolicy(input.metadata.dependencyIntentPolicy)
  if (metadataPolicy) {
    return {
      dependencyType: 'FS' as const,
      lagDays: 0,
      strength: metadataPolicy === 'confirmed_template_only' ? 'recommended' as const : 'candidate' as const,
      autoApplyPolicy: metadataPolicy,
      policySource: 'metadata_override' as const,
    }
  }

  if (input.role === 'commercial' || input.fromGroup === 'document_commercial_support' || input.toGroup === 'document_commercial_support') {
    return {
      dependencyType: 'FS' as const,
      lagDays: 0,
      strength: 'candidate' as const,
      autoApplyPolicy: 'candidate_only' as const,
      policySource: 'document_commercial_candidate_default' as const,
    }
  }
  if (input.role === 'management' || input.fromGroup === 'site_management' || input.toGroup === 'site_management') {
    return {
      dependencyType: 'FS' as const,
      lagDays: 0,
      strength: 'candidate' as const,
      autoApplyPolicy: 'manual_confirm' as const,
      policySource: 'site_management_manual_confirm_default' as const,
    }
  }
  if (input.role === 'evidence') {
    return {
      dependencyType: 'SS' as const,
      lagDays: 0,
      strength: 'candidate' as const,
      autoApplyPolicy: 'candidate_only' as const,
      policySource: 'metadata_quarantine_role_default' as const,
    }
  }
  if (input.role === 'inspection' || input.role === 'approval' || input.role === 'handover' || input.role === 'projected_link') {
    return {
      dependencyType: 'FS' as const,
      lagDays: 0,
      strength: 'candidate' as const,
      autoApplyPolicy: 'manual_confirm' as const,
      policySource: 'metadata_quarantine_role_default' as const,
    }
  }
  return {
    dependencyType: 'FS' as const,
    lagDays: 0,
    strength: 'candidate' as const,
    autoApplyPolicy: 'candidate_only' as const,
    policySource: 'metadata_quarantine_role_default' as const,
  }
}

function confidenceLevelForScore(score: number): V1475DependencyIntentConfidenceLevel {
  if (score >= 85) return 'high'
  if (score >= 65) return 'medium'
  return 'low'
}

function scoreAcceptedDependencyIntentConfidence(input: {
  relationRole: V1475DependencyRelationRole
  scopeRule: V1475DependencyIntentScopeRule
  autoApplyPolicy: V1475DependencyIntentTemplate['autoApplyPolicy']
  matchedReferenceField: string
  referenceGroup: WbsTemplateCatalogGroup
  rawRelationRole?: string | null
  referenceGroupNormalized?: boolean
  confidenceAdjustment?: number
  policySource?: string
  scopeRuleSource?: string
  dependencyIntentReason?: string
}) {
  const baseScoreByRole: Record<V1475DependencyRelationRole, number> = {
    workflow: 76,
    evidence: 92,
    inspection: 90,
    approval: 88,
    handover: 89,
    commercial: 70,
    prerequisite: 80,
    management: 66,
    projected_link: 78,
  }
  const scopeBonusByRule: Record<V1475DependencyIntentScopeRule, number> = {
    same_project: 0,
    same_phase: 2,
    same_building: 4,
    same_unit: 5,
    same_floor: 6,
    same_zone: 7,
    same_system: 8,
  }
  const policyAdjustmentByPolicy: Record<V1475DependencyIntentTemplate['autoApplyPolicy'], number> = {
    confirmed_template_only: 3,
    candidate_only: -2,
    manual_confirm: -6,
  }
  const score = Math.max(
    20,
    Math.min(
      95,
      baseScoreByRole[input.relationRole]
      + scopeBonusByRule[input.scopeRule]
      + policyAdjustmentByPolicy[input.autoApplyPolicy]
      + (input.confidenceAdjustment ?? 0)
      - (input.referenceGroupNormalized ? 8 : 0),
    ),
  )
  const auditTrace = [
    'decision=accepted',
    `matchedReferenceField=${input.matchedReferenceField}`,
    `referenceGroup=${input.referenceGroup}`,
    input.referenceGroupNormalized ? 'referenceGroupNormalized=true' : null,
    `relationRole=${input.relationRole}`,
    input.rawRelationRole && input.rawRelationRole !== input.relationRole ? `rawRelationRole=${input.rawRelationRole}` : null,
    `scopeRule=${input.scopeRule}`,
    input.scopeRuleSource ? `scopeRuleSource=${input.scopeRuleSource}` : null,
    `autoApplyPolicy=${input.autoApplyPolicy}`,
    input.policySource ? `policySource=${input.policySource}` : null,
    input.dependencyIntentReason ? `dependencyIntentReason=${input.dependencyIntentReason}` : null,
    input.confidenceAdjustment ? `confidenceAdjustment=${input.confidenceAdjustment}` : null,
    `confidenceScore=${score}`,
  ].filter(Boolean) as string[]
  return {
    confidenceScore: score,
    confidenceLevel: confidenceLevelForScore(score),
    auditTrace,
  }
}

function scopeRuleForDependencyIntent(input: {
  role: V1475DependencyRelationRole
  fromGroup: WbsTemplateCatalogGroup
  toGroup: WbsTemplateCatalogGroup
  toReferencedCode: string
  metadata: Record<string, unknown>
}): { scopeRule: V1475DependencyIntentScopeRule; scopeRuleSource: string } {
  const metadataScopeRule = normalizeDependencyIntentScopeRule(input.metadata.dependencyIntentScopeRule)
  if (metadataScopeRule) {
    return {
      scopeRule: metadataScopeRule,
      scopeRuleSource: 'metadata_override',
    }
  }
  const code = normalizeText(input.toReferencedCode).toUpperCase()
  if (input.role === 'evidence') return { scopeRule: 'same_system', scopeRuleSource: 'role_code_inference' }
  if (input.role === 'approval' || input.role === 'management' || input.fromGroup === 'site_management' || input.toGroup === 'site_management') {
    return { scopeRule: 'same_phase', scopeRuleSource: 'role_code_inference' }
  }
  if (input.role === 'commercial' || input.fromGroup === 'document_commercial_support' || input.toGroup === 'document_commercial_support') {
    return { scopeRule: 'same_project', scopeRuleSource: 'document_commercial_default' }
  }

  if (input.toGroup === 'project_milestone') return { scopeRule: 'same_building', scopeRuleSource: 'role_code_inference' }
  if (input.toGroup === 'quality_responsibility') return { scopeRule: 'same_building', scopeRuleSource: 'role_code_inference' }
  if (/^(05|06|07|08|PLU|HVA|HVAC|ELE|FIR|INT|DCN|CLN|ICR)/.test(code)) return { scopeRule: 'same_system', scopeRuleSource: 'role_code_inference' }
  if (/^(02|03|04|DEC)/.test(code)) return { scopeRule: 'same_floor', scopeRuleSource: 'role_code_inference' }
  if (/^(01|09|10|FND|PFB|WPI|FAC|ELV|OUT|MUN)/.test(code)) return { scopeRule: 'same_zone', scopeRuleSource: 'role_code_inference' }
  return { scopeRule: 'same_phase', scopeRuleSource: 'role_code_inference' }
}

function buildRejectedDependencyIntentAudit(input: {
  matchedReferenceField: string
  referenceGroup: WbsTemplateCatalogGroup
  fromCatalogGroup: WbsTemplateCatalogGroup
  fromReferencedCode: string
  toReferencedCode: string
  relationRole: V1475DependencyRelationRole
  rawRelationRole?: string | null
}): Pick<V1475DependencyIntentAuditRecord, 'decision' | 'reasonCode' | 'confidenceScore' | 'confidenceLevel' | 'auditTrace'> {
  const score = input.rawRelationRole && input.rawRelationRole !== input.relationRole ? 72 : 94
  const reasonCode: V1475DependencyIntentAuditReasonCode = (input.rawRelationRole && input.rawRelationRole !== input.relationRole)
    ? 'rejected_relation_role_fallback'
    : 'rejected_physical_construction_mainline'
  const auditTrace = [
    'decision=rejected',
    `matchedReferenceField=${input.matchedReferenceField}`,
    `referenceGroup=${input.referenceGroup}`,
    `relationRole=${input.relationRole}`,
    input.rawRelationRole && input.rawRelationRole !== input.relationRole ? `rawRelationRole=${input.rawRelationRole}` : null,
    `fromCatalogGroup=${input.fromCatalogGroup}`,
    `fromReferencedCode=${input.fromReferencedCode}`,
    `toReferencedCode=${input.toReferencedCode}`,
    'routing=standard_internal_flow_or_cross_item_workflow',
    'reason=physical_construction_mainline',
    `confidenceScore=${score}`,
  ].filter(Boolean) as string[]
  return {
    decision: 'rejected' as const,
    reasonCode,
    confidenceScore: score,
    confidenceLevel: confidenceLevelForScore(score),
    auditTrace,
  }
}

function incrementDecisionBucket(target: Record<string, { accepted: number; rejected: number }>, field: string, decision: 'accepted' | 'rejected') {
  const bucket = target[field] ?? { accepted: 0, rejected: 0 }
  bucket[decision] += 1
  target[field] = bucket
}

function buildEmptyDependencyIntentResolution(): V1475DependencyIntentResolution {
  return {
    intents: [],
    audit: [],
    summary: {
      acceptedCount: 0,
      rejectedCount: 0,
      acceptedRuntimeEligibleCount: 0,
      acceptedCandidateOnlyCount: 0,
      acceptedManualConfirmCount: 0,
      rejectedPhysicalMainlineCount: 0,
      rejectedMissingSourceCodeCount: 0,
      rejectedMissingReferenceCodeCount: 0,
      rejectedRelationRoleFallbackCount: 0,
      confidenceScoreTotal: 0,
      confidenceScoreAverage: 0,
      byReferenceField: {},
      byAuditReasonCode: {},
      byConfidenceLevel: { high: 0, medium: 0, low: 0 },
    },
  }
}

function summarizeDependencyIntentResolution(audit: V1475DependencyIntentAuditRecord[]): V1475DependencyIntentResolutionSummary {
  const summary: V1475DependencyIntentResolutionSummary = {
    acceptedCount: 0,
    rejectedCount: 0,
    acceptedRuntimeEligibleCount: 0,
    acceptedCandidateOnlyCount: 0,
    acceptedManualConfirmCount: 0,
    rejectedPhysicalMainlineCount: 0,
    rejectedMissingSourceCodeCount: 0,
    rejectedMissingReferenceCodeCount: 0,
    rejectedRelationRoleFallbackCount: 0,
    confidenceScoreTotal: 0,
    confidenceScoreAverage: 0,
    byReferenceField: {},
    byAuditReasonCode: {},
    byConfidenceLevel: { high: 0, medium: 0, low: 0 },
  }

  for (const item of audit) {
    summary[item.decision === 'accepted' ? 'acceptedCount' : 'rejectedCount'] += 1
    summary.confidenceScoreTotal += item.confidenceScore
    summary.byConfidenceLevel[item.confidenceLevel] += 1
    incrementDecisionBucket(summary.byReferenceField, item.matchedReferenceField, item.decision)
    summary.byAuditReasonCode[item.reasonCode] = (summary.byAuditReasonCode[item.reasonCode] ?? 0) + 1
    if (item.decision === 'accepted') {
      const explicitBusinessGate = item.sourceSeedRuleIds.includes(V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID)
        || item.auditTrace.includes('explicitBusinessGateTemplate=true')
      if (item.autoApplyPolicy === 'confirmed_template_only' && explicitBusinessGate) summary.acceptedRuntimeEligibleCount += 1
      if (item.autoApplyPolicy === 'candidate_only') summary.acceptedCandidateOnlyCount += 1
      if (item.autoApplyPolicy === 'manual_confirm') summary.acceptedManualConfirmCount += 1
    } else if (item.reasonCode === 'rejected_physical_construction_mainline') {
      summary.rejectedPhysicalMainlineCount += 1
    } else if (item.reasonCode === 'rejected_missing_source_code') {
      summary.rejectedMissingSourceCodeCount += 1
    } else if (item.reasonCode === 'rejected_missing_reference_code') {
      summary.rejectedMissingReferenceCodeCount += 1
    } else if (item.reasonCode === 'rejected_relation_role_fallback') {
      summary.rejectedRelationRoleFallbackCount += 1
    }
  }

  summary.confidenceScoreAverage = audit.length > 0
    ? Math.round((summary.confidenceScoreTotal / audit.length) * 10) / 10
    : 0
  return summary
}

export function inspectV1475DependencyIntentTemplates(input: {
  fromCatalogGroup: WbsTemplateCatalogGroup
  fromReferencedCode: string
  metadata: Record<string, unknown>
}): V1475DependencyIntentResolution {
  const roleResolution = normalizeRelationRoleWithAudit(input.metadata.relationRole)
  const fromReferencedCode = normalizeText(input.fromReferencedCode)
  if (!fromReferencedCode) {
    return buildEmptyDependencyIntentResolution()
  }

  const intents: V1475DependencyIntentTemplate[] = []
  const audit: V1475DependencyIntentAuditRecord[] = []
  for (const referenceField of DEPENDENCY_INTENT_REFERENCE_FIELDS) {
    const { field, group } = referenceField
    const targetCodes = readDependencyIntentReferenceCodes(input.metadata, referenceField)
    if (targetCodes.length === 0) continue

    for (const toReferencedCode of targetCodes) {
      if (!toReferencedCode) {
        audit.push({
          decision: 'rejected',
          reasonCode: 'rejected_missing_reference_code',
          confidenceScore: 40,
          confidenceLevel: 'low',
          matchedReferenceField: field,
          referenceGroup: group,
          fromCatalogGroup: input.fromCatalogGroup,
          fromReferencedCode,
          toReferencedCode: '',
          relationRole: roleResolution.relationRole,
          relationshipDomain: 'physical_construction_mainline',
          dependencyType: null,
          lagDays: null,
          scopeRule: null,
          autoApplyPolicy: null,
          sourceSeedRuleIds: [],
          intentCode: null,
          auditTrace: [
            'decision=rejected',
            `matchedReferenceField=${field}`,
            `referenceGroup=${group}`,
            `relationRole=${roleResolution.relationRole}`,
            `fromCatalogGroup=${input.fromCatalogGroup}`,
            `fromReferencedCode=${fromReferencedCode}`,
            'reason=missing_reference_code',
          ],
        })
        continue
      }
      const groupResolution = resolveV1475ReferenceCatalogGroup({
        declaredGroup: group,
        field,
        code: toReferencedCode,
      })
      const effectiveGroup = groupResolution.group
      const explicitGate = findV1475ExplicitBusinessGateTemplate({
        fromCatalogGroup: input.fromCatalogGroup,
        fromReferencedCode,
        toCatalogGroup: effectiveGroup,
        toReferencedCode,
        relationRole: roleResolution.relationRole,
      })

      if (!explicitGate && !shouldEmitV1475DependencyIntent(
        roleResolution.relationRole,
        input.fromCatalogGroup,
        effectiveGroup,
        fromReferencedCode,
        toReferencedCode,
      )) {
        const rejected = buildRejectedDependencyIntentAudit({
          matchedReferenceField: field,
          referenceGroup: effectiveGroup,
          fromCatalogGroup: input.fromCatalogGroup,
          fromReferencedCode,
          toReferencedCode,
          relationRole: roleResolution.relationRole,
          rawRelationRole: roleResolution.fallbackUsed ? roleResolution.rawRelationRole : null,
        })
        audit.push({
          ...rejected,
          matchedReferenceField: field,
          referenceGroup: effectiveGroup,
          fromCatalogGroup: input.fromCatalogGroup,
          fromReferencedCode,
          toReferencedCode,
          relationRole: roleResolution.relationRole,
          relationshipDomain: 'physical_construction_mainline',
          dependencyType: null,
          lagDays: null,
          scopeRule: null,
          autoApplyPolicy: null,
          sourceSeedRuleIds: [],
          intentCode: null,
        })
        continue
      }

      const baseShape = dependencyShapeFor({
        role: roleResolution.relationRole,
        fromGroup: input.fromCatalogGroup,
        toGroup: effectiveGroup,
        metadata: input.metadata,
      })
      const shape = explicitGate
        ? {
          dependencyType: explicitGate.template.dependencyType,
          lagDays: explicitGate.template.lagDays,
          strength: 'hard' as const,
          autoApplyPolicy: 'confirmed_template_only' as const,
          policySource: 'explicit_business_gate_template' as const,
        }
        : baseShape
      const inferredScope = scopeRuleForDependencyIntent({
        role: roleResolution.relationRole,
        fromGroup: input.fromCatalogGroup,
        toGroup: effectiveGroup,
        toReferencedCode,
        metadata: input.metadata,
      })
      const scope = explicitGate
        ? { scopeRule: explicitGate.template.scopeRule, scopeRuleSource: 'explicit_business_gate_template' }
        : inferredScope
      const confidenceAdjustment = normalizeConfidenceAdjustment(input.metadata.dependencyIntentConfidenceAdjustment)
        + (explicitGate?.template.confidenceAdjustment ?? 0)
      const dependencyIntentReason = normalizeText(input.metadata.dependencyIntentReason)
      const confidence = scoreAcceptedDependencyIntentConfidence({
        relationRole: roleResolution.relationRole,
        scopeRule: scope.scopeRule,
        autoApplyPolicy: shape.autoApplyPolicy,
        matchedReferenceField: field,
        referenceGroup: effectiveGroup,
        rawRelationRole: roleResolution.fallbackUsed ? roleResolution.rawRelationRole : null,
        referenceGroupNormalized: groupResolution.normalized,
        confidenceAdjustment,
        policySource: shape.policySource,
        scopeRuleSource: scope.scopeRuleSource,
        dependencyIntentReason,
      })
      const auditReasonCode: V1475DependencyIntentAuditReasonCode = shape.autoApplyPolicy === 'confirmed_template_only'
        ? groupResolution.normalized
          ? 'accepted_business_constraint_reference_field_normalized'
          : 'accepted_business_constraint_confirmed_template_only'
        : shape.autoApplyPolicy === 'candidate_only'
          ? 'accepted_business_constraint_candidate_only'
          : 'accepted_business_constraint_manual_confirm'
      const intentCode = `dep-intent:${input.fromCatalogGroup}:${fromReferencedCode}:${effectiveGroup}:${toReferencedCode}:${roleResolution.relationRole}`
      const intent: V1475DependencyIntentTemplate = {
        intentCode,
        fromCatalogGroup: input.fromCatalogGroup,
        fromReferencedCode,
        toCatalogGroup: effectiveGroup,
        toReferencedCode,
        relationRole: roleResolution.relationRole,
        relationshipDomain: 'business_constraint',
        dependencyType: shape.dependencyType,
        lagDays: shape.lagDays,
        scopeRule: scope.scopeRule,
        strength: shape.strength,
        autoApplyPolicy: shape.autoApplyPolicy,
        sourceSeedRuleIds: explicitGate
          ? ['v1.4.7.5:dependencyIntentTemplates', V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID]
          : ['v1.4.7.5:dependencyIntentTemplates'],
        conflictPolicy: 'explicit_dependency_wins',
        materializeDirection: explicitGate?.materializeDirection ?? 'source_depends_on_target',
        matchedReferenceField: field,
        confidenceScore: confidence.confidenceScore,
        confidenceLevel: confidence.confidenceLevel,
        auditReasonCode,
        auditTrace: [
          ...confidence.auditTrace,
          ...groupResolution.auditTrace,
          ...(explicitGate ? [
            'explicitBusinessGateTemplate=true',
            `explicitBusinessGateTemplateCode=${explicitGate.template.templateCode}`,
            `materializeDirection=${explicitGate.materializeDirection}`,
          ] : []),
        ],
      }
      intents.push(intent)
      audit.push({
        decision: 'accepted',
        reasonCode: auditReasonCode,
        confidenceScore: confidence.confidenceScore,
        confidenceLevel: confidence.confidenceLevel,
        matchedReferenceField: field,
        referenceGroup: effectiveGroup,
        fromCatalogGroup: input.fromCatalogGroup,
        fromReferencedCode,
        toReferencedCode,
        relationRole: roleResolution.relationRole,
        relationshipDomain: 'business_constraint',
        dependencyType: shape.dependencyType,
        lagDays: shape.lagDays,
        scopeRule: scope.scopeRule,
        autoApplyPolicy: shape.autoApplyPolicy,
        sourceSeedRuleIds: explicitGate
          ? ['v1.4.7.5:dependencyIntentTemplates', V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID]
          : ['v1.4.7.5:dependencyIntentTemplates'],
        intentCode,
        auditTrace: [
          ...confidence.auditTrace,
          ...groupResolution.auditTrace,
          ...(explicitGate ? [
            'explicitBusinessGateTemplate=true',
            `explicitBusinessGateTemplateCode=${explicitGate.template.templateCode}`,
            `materializeDirection=${explicitGate.materializeDirection}`,
          ] : []),
        ],
      })
    }
  }

  return {
    intents,
    audit,
    summary: summarizeDependencyIntentResolution(audit),
  }
}

export function resolveV1475DependencyIntentTemplates(input: {
  fromCatalogGroup: WbsTemplateCatalogGroup
  fromReferencedCode: string
  metadata: Record<string, unknown>
}): V1475DependencyIntentTemplate[] {
  return inspectV1475DependencyIntentTemplates(input).intents
}
