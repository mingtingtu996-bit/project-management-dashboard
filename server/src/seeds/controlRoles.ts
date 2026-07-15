export type QualityControlRole =
  | 'none'
  | 'precondition_control'
  | 'process_control'
  | 'hidden_control'
  | 'test_control'
  | 'acceptance_gate'
  | 'defect_rework'

export type SafetyControlRole =
  | 'none'
  | 'hazardous_work'
  | 'special_plan_control'
  | 'safety_acceptance'
  | 'protective_measure'
  | 'temporary_facility_safety'
  | 'operation_permit'
  | 'monitoring_control'
  | 'daily_safety_check'

export type InspectionAcceptanceRole =
  | 'none'
  | 'self_check'
  | 'mutual_check'
  | 'hidden_acceptance'
  | 'material_retest'
  | 'third_party_test'
  | 'special_acceptance'
  | 'completion_acceptance'

export type DocumentEvidenceRole =
  | 'none'
  | 'technical_record'
  | 'inspection_record'
  | 'test_report'
  | 'approval_document'
  | 'handover_document'
  | 'commercial_document'

export type CommercialControlRole =
  | 'none'
  | 'quantity_measurement'
  | 'variation_claim'
  | 'price_approval'
  | 'progress_payment'
  | 'settlement'
  | 'cost_evidence'

export type ManagementControlRole =
  | 'none'
  | 'planning_control'
  | 'organization_control'
  | 'technical_control'
  | 'resource_control'
  | 'site_readiness_control'
  | 'interface_coordination'
  | 'issue_rectification'
  | 'progress_control'
  | 'handover_control'

export type WbsTemplateControlRoles = {
  qualityControlRole: QualityControlRole
  safetyControlRole: SafetyControlRole
  inspectionAcceptanceRole: InspectionAcceptanceRole
  documentEvidenceRole: DocumentEvidenceRole
  commercialControlRole: CommercialControlRole
  managementControlRole: ManagementControlRole
}

export const QUALITY_CONTROL_ROLES: QualityControlRole[] = [
  'none',
  'precondition_control',
  'process_control',
  'hidden_control',
  'test_control',
  'acceptance_gate',
  'defect_rework',
]

export const SAFETY_CONTROL_ROLES: SafetyControlRole[] = [
  'none',
  'hazardous_work',
  'special_plan_control',
  'safety_acceptance',
  'protective_measure',
  'temporary_facility_safety',
  'operation_permit',
  'monitoring_control',
  'daily_safety_check',
]

export const INSPECTION_ACCEPTANCE_ROLES: InspectionAcceptanceRole[] = [
  'none',
  'self_check',
  'mutual_check',
  'hidden_acceptance',
  'material_retest',
  'third_party_test',
  'special_acceptance',
  'completion_acceptance',
]

export const DOCUMENT_EVIDENCE_ROLES: DocumentEvidenceRole[] = [
  'none',
  'technical_record',
  'inspection_record',
  'test_report',
  'approval_document',
  'handover_document',
  'commercial_document',
]

export const COMMERCIAL_CONTROL_ROLES: CommercialControlRole[] = [
  'none',
  'quantity_measurement',
  'variation_claim',
  'price_approval',
  'progress_payment',
  'settlement',
  'cost_evidence',
]

export const MANAGEMENT_CONTROL_ROLES: ManagementControlRole[] = [
  'none',
  'planning_control',
  'organization_control',
  'technical_control',
  'resource_control',
  'site_readiness_control',
  'interface_coordination',
  'issue_rectification',
  'progress_control',
  'handover_control',
]

const CONTROL_ROLE_KEYS = [
  'qualityControlRole',
  'safetyControlRole',
  'inspectionAcceptanceRole',
  'documentEvidenceRole',
  'commercialControlRole',
  'managementControlRole',
] as const

function includesAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

function isStructuralSettlementJointText(text: string) {
  return includesAny(text, [
    '\u6c89\u964d\u7f1d',
    '\u4f38\u7f29\u7f1d',
    '\u53d8\u5f62\u7f1d',
  ])
}

function isNonSafetyOpeningContext(text: string) {
  return includesAny(text, [
    '\u6d1e\u53e3\u5c3a\u5bf8',
    '\u95e8\u7a97\u6d1e\u53e3',
    '\u9884\u7559\u6d1e\u53e3',
    '\u73b0\u573a\u6d1e\u53e3\u548c\u63a5\u53e3',
    '\u6d1e\u53e3\u548c\u63a5\u53e3',
    '\u6d1e\u53e3\u548c\u63a5\u9a73',
    '\u6d1e\u53e3\u63a7\u5236\u7ebf',
    '\u6d1e\u53e3\u6536\u53e3',
    '\u6d1e\u53e3\u4fee\u8865',
    '\u6d1e\u53e3\u52a0\u5f3a',
    '\u5929\u7a97\u6d1e\u53e3',
    '\u5377\u5e18\u6d1e\u53e3',
  ])
}

function shouldUseInferredSafetyRole(text: string, inferredRole: SafetyControlRole) {
  if (inferredRole === 'none') return false
  return includesAny(text, [
    '\u5371\u5927',
    '\u9ad8\u652f\u6a21',
    '\u811a\u624b\u67b6',
    '\u5854\u540a',
    '\u65bd\u5de5\u7535\u68af',
    '\u65bd\u5de5\u5347\u964d\u673a',
    '\u4e34\u7535',
    '\u4e34\u8fb9',
    '\u9632\u62a4',
    '\u5b89\u5168\u9632\u62a4',
    '\u9632\u5760',
    '\u9632\u5760\u843d',
    '\u751f\u547d\u7ebf',
    '\u540a\u7bee',
    '\u5378\u6599\u5e73\u53f0',
    '\u52a8\u706b',
    '\u5b89\u5168\u5668',
    '\u95e8\u8054\u9501',
  ])
}

function shouldUseInferredInspectionRole(text: string, inferredRole: InspectionAcceptanceRole) {
  if (inferredRole === 'none') return false
  return includesAny(text, [
    '\u9a8c\u6536',
    '\u68c0\u67e5',
    '\u68c0\u6d4b',
    '\u6d4b\u8bd5',
    '\u8bd5\u9a8c',
    '\u590d\u9a8c',
    '\u590d\u8bd5',
    '\u590d\u67e5',
    '\u590d\u6d4b',
    '\u9690\u853d',
    '\u89c1\u8bc1\u53d6\u6837',
    '\u63a2\u4f24',
    '\u8bd5\u538b',
    '\u901a\u7403',
    '\u901a\u6c34',
    '\u704c\u6c34',
    '\u95ed\u6c34',
    '\u84c4\u6c34',
    '\u6dcb\u6c34',
    '\u8054\u52a8',
    '\u8c03\u8bd5',
  ])
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return allowed.includes(normalized as T) ? normalized as T : null
}

function readRole(metadata: Record<string, unknown> | null | undefined, camelKey: string, snakeKey: string) {
  if (!metadata) return null
  return metadata[camelKey] ?? metadata[snakeKey]
}

export function normalizeQualityControlRole(value: unknown) {
  return normalizeEnum(value, QUALITY_CONTROL_ROLES)
}

export function normalizeSafetyControlRole(value: unknown) {
  return normalizeEnum(value, SAFETY_CONTROL_ROLES)
}

export function normalizeInspectionAcceptanceRole(value: unknown) {
  return normalizeEnum(value, INSPECTION_ACCEPTANCE_ROLES)
}

export function normalizeDocumentEvidenceRole(value: unknown) {
  return normalizeEnum(value, DOCUMENT_EVIDENCE_ROLES)
}

export function normalizeCommercialControlRole(value: unknown) {
  return normalizeEnum(value, COMMERCIAL_CONTROL_ROLES)
}

export function normalizeManagementControlRole(value: unknown) {
  return normalizeEnum(value, MANAGEMENT_CONTROL_ROLES)
}

export function readDeclaredControlRoles(metadata?: Record<string, unknown> | null): WbsTemplateControlRoles | null {
  const roles = {
    qualityControlRole: normalizeQualityControlRole(readRole(metadata, 'qualityControlRole', 'quality_control_role')),
    safetyControlRole: normalizeSafetyControlRole(readRole(metadata, 'safetyControlRole', 'safety_control_role')),
    inspectionAcceptanceRole: normalizeInspectionAcceptanceRole(readRole(metadata, 'inspectionAcceptanceRole', 'inspection_acceptance_role')),
    documentEvidenceRole: normalizeDocumentEvidenceRole(readRole(metadata, 'documentEvidenceRole', 'document_evidence_role')),
    commercialControlRole: normalizeCommercialControlRole(readRole(metadata, 'commercialControlRole', 'commercial_control_role')),
    managementControlRole: normalizeManagementControlRole(readRole(metadata, 'managementControlRole', 'management_control_role')),
  }

  return CONTROL_ROLE_KEYS.every((key) => roles[key])
    ? roles as WbsTemplateControlRoles
    : null
}

function inferQualityControlRole(text: string, durationContributionMode: string, planItemKind: string): QualityControlRole {
  const qualityGateModeApplies = durationContributionMode === 'quality_gate'
    && planItemKind !== 'safety_control'
    && planItemKind !== 'management_task'
  if (includesAny(text, ['\u8fd4\u4fee', '\u4fee\u8865', '\u7f3a\u9677', '\u7a7a\u9f13', '\u5f00\u88c2', '\u9500\u9879'])) return 'defect_rework'
  if (includesAny(text, ['CAPA', '\u504f\u5dee\u8c03\u67e5', '\u504f\u5dee\u6574\u6539', '\u7f3a\u9677\u6574\u6539', '\u518d\u6d4b\u8bd5', '\u653e\u884c\u5224\u5b9a'])) return 'defect_rework'
  if (includesAny(text, ['\u9690\u853d', '\u6b62\u6c34', '\u5c01\u5835', '\u9884\u57cb', '\u57cb\u4ef6', '\u5957\u7ba1', '\u9632\u706b\u5c01\u5835'])) return 'hidden_control'
  if (qualityGateModeApplies && includesAny(text, [
    '\u9a8c\u6536',
    '\u79fb\u4ea4',
    '\u4ea4\u63a5',
    '\u7b7e\u8ba4',
    '\u5f52\u6863',
    '\u7ec4\u5377',
    '\u5907\u6848',
    '\u95ed\u5408',
    '\u653e\u884c',
    '\u5408\u683c',
    '\u62a5\u544a',
    '\u8d44\u6599',
    '\u8bb0\u5f55',
    '\u6e05\u5355',
    '\u9500\u9879',
  ])) return 'acceptance_gate'
  if (includesAny(text, ['\u5b9e\u6d4b\u5b9e\u91cf', '\u5b9e\u6d4b', '\u590d\u6d4b', '\u504f\u5dee'])) return 'test_control'
  if (includesAny(text, ['\u57fa\u5c42', '\u542b\u6c34\u7387', '\u539f\u6750\u6599', '\u6750\u6599\u8fdb\u573a', '\u914d\u5408\u6bd4', '\u590d\u6838', '\u786e\u8ba4'])) return 'precondition_control'
  if (includesAny(text, ['\u63a2\u4f24', '\u65e0\u635f', '\u8bd5\u538b', '\u51b2\u6d17', '\u6d88\u6bd2', '\u6dcb\u6c34', '\u84c4\u6c34', '\u95ed\u6c34', '\u6ee1\u6c34', '\u901a\u7403', '\u901a\u6c34', '\u704c\u6c34', '\u8bd5\u5c04', '\u8bd5\u55b7', '\u7edd\u7f18', '\u7167\u5ea6', '\u6f0f\u98ce', '\u6f0f\u5149', '\u98ce\u91cf\u5e73\u8861', '\u6c34\u529b\u5e73\u8861', '\u8bd5\u8fd0\u8f6c', '\u8bd5\u8fd0\u884c', '\u5355\u673a\u8bd5\u8fd0', '\u8054\u52a8\u8c03\u8bd5', '\u8054\u8c03', '\u8c03\u8bd5', '\u6d4b\u8bd5', '\u539a\u5ea6', '\u68c0\u6d4b', '\u8bd5\u9a8c', '\u590d\u9a8c', '\u590d\u8bd5', '\u9001\u68c0', 'FAT', 'SAT', 'UAT', 'IQ', 'OQ', 'PQ', '\u9a8c\u8bc1', '\u5e26\u8f7d', '\u5207\u6362\u6d4b\u8bd5', '\u6f14\u7ec3'])) return 'test_control'
  if (includesAny(text, ['\u9a8c\u6536', '\u901a\u8fc7', '\u6838\u9a8c', '\u5916\u89c2\u68c0\u67e5', '\u8d28\u91cf\u68c0\u67e5', '\u5b89\u88c5\u68c0\u67e5']) || qualityGateModeApplies || planItemKind === 'inspection_task') return 'acceptance_gate'
  if (includesAny(text, ['\u632f\u6363', '\u517b\u62a4', '\u642d\u63a5', '\u6536\u5934', '\u5bc6\u5c01', '\u521d\u62e7', '\u7ec8\u62e7', '\u8fde\u63a5', '\u8282\u70b9', '\u9644\u52a0\u5c42', '\u5de5\u827a\u53c2\u6570\u63a7\u5236', '\u6c89\u964d\u7f1d', '\u4f38\u7f29\u7f1d', '\u53d8\u5f62\u7f1d', '\u5782\u76f4\u5ea6', '\u5e73\u6574\u5ea6', '\u5761\u5ea6', '\u6807\u9ad8'])) return 'process_control'
  return 'none'
}

function inferSafetyControlRole(text: string, packType: string, planItemKind: string): SafetyControlRole {
  if (includesAny(text, ['\u9690\u60a3', '\u5b89\u5168\u5de1\u68c0', '\u5b89\u5168\u68c0\u67e5', '\u6574\u6539\u95ed\u73af'])) return 'daily_safety_check'
  if (includesAny(text, ['\u76d1\u6d4b', '\u89c2\u6d4b', '\u6c89\u964d', '\u4f4d\u79fb']) && !isStructuralSettlementJointText(text)) return 'monitoring_control'
  if (includesAny(text, ['\u52a8\u706b', '\u9ad8\u5904', '\u4f5c\u4e1a\u8bb8\u53ef', '\u8bb8\u53ef\u8bc1'])) return 'operation_permit'
  if (includesAny(text, ['\u4e34\u7535', '\u4e34\u65f6\u7528\u7535', '\u6d88\u9632', '\u6d88\u706b\u6813', '\u706d\u706b\u5668', '\u4e34\u8bbe', '\u4e34\u6c34', '\u4e09\u7ea7\u914d\u7535', 'tn-s', '\u63a5\u5730'])) return 'temporary_facility_safety'
  if (
    includesAny(text, ['\u4e34\u8fb9', '\u9632\u62a4', '\u5b89\u5168\u9632\u62a4', '\u9632\u5760', '\u9632\u5760\u843d', '\u751f\u547d\u7ebf', '\u5b89\u5168\u901a\u9053', '\u9632\u62a4\u68da', '\u56f4\u6321'])
    || (text.includes('\u6d1e\u53e3') && !isNonSafetyOpeningContext(text))
  ) return 'protective_measure'
  if (includesAny(text, ['\u9a8c\u6536', '\u6302\u724c']) && (packType === 'danger_control' || planItemKind === 'safety_control' || includesAny(text, ['\u811a\u624b\u67b6', '\u5854\u540a', '\u65bd\u5de5\u7535\u68af', '\u65bd\u5de5\u5347\u964d\u673a', '\u4e34\u7535', '\u9ad8\u652f\u6a21']))) return 'safety_acceptance'
  if (
    includesAny(text, ['\u4e13\u9879\u65b9\u6848', '\u4e13\u5bb6\u8bba\u8bc1', '\u65b9\u6848\u5ba1\u6279', '\u5b89\u5168\u4ea4\u5e95', '\u5b89\u5168\u6280\u672f\u4ea4\u5e95', 'special plan', 'plan approval'])
    || (includesAny(text, ['\u4ea4\u5e95']) && (packType === 'danger_control' || planItemKind === 'safety_control'))
  ) return 'special_plan_control'
  if (packType === 'danger_control' || planItemKind === 'safety_control' || includesAny(text, ['\u5371\u5927', '\u6df1\u57fa\u5751', '\u9ad8\u652f\u6a21', '\u811a\u624b\u67b6', '\u8d77\u91cd', '\u540a\u88c5', '\u5854\u540a', '\u65bd\u5de5\u7535\u68af', '\u65bd\u5de5\u5347\u964d\u673a', '\u60ac\u6311', '\u9644\u7740\u5347\u964d', '\u5378\u6599\u5e73\u53f0', '\u540a\u7bee', '\u4eba\u5de5\u6316\u5b54'])) return 'hazardous_work'
  return 'none'
}

function inferInspectionAcceptanceRole(text: string, planItemKind: string, relationRole: string): InspectionAcceptanceRole {
  if (includesAny(text, ['\u7ae3\u5de5', '\u5907\u6848', '\u7efc\u5408\u9a8c\u6536'])) return 'completion_acceptance'
  if (includesAny(text, ['\u4e13\u9879\u9a8c\u6536', '\u8282\u80fd', '\u6d88\u9632', '\u4eba\u9632', '\u9632\u96f7', '\u73af\u4fdd', '\u5206\u6237\u9a8c\u6536', 'FAT', 'SAT', 'UAT', 'IQ', 'OQ', 'PQ', '\u6295\u8fd0\u9a8c\u6536', '\u53ef\u7528\u6027\u9a8c\u6536', '\u9a8c\u8bc1\u62a5\u544a'])) return 'special_acceptance'
  if (includesAny(text, ['\u7b2c\u4e09\u65b9', '\u59d4\u6258\u68c0\u6d4b', '\u68c0\u6d4b\u59d4\u6258'])) return 'third_party_test'
  if (includesAny(text, [
    '\u89c1\u8bc1\u53d6\u6837',
    '\u590d\u9a8c',
    '\u590d\u8bd5',
    '\u9001\u68c0',
    '\u539f\u6750\u6599',
    '\u6750\u6599\u8fdb\u573a',
    '\u8fde\u63a5\u526f\u6279\u6b21',
    '\u7d27\u56fa\u4ef6\u8fdb\u573a',
    '\u9f99\u9aa8\u6216\u677f\u6750\u8fdb\u573a',
    '\u9762\u5c42\u6750\u6599',
  ])) return 'material_retest'
  if (includesAny(text, ['\u9690\u853d', '\u6b62\u6c34', '\u9884\u57cb', '\u57cb\u4ef6', '\u5c01\u5835', '\u9632\u6c34', '\u9644\u52a0\u5c42'])) return 'hidden_acceptance'
  if (includesAny(text, ['\u4e92\u68c0'])) return 'mutual_check'
  if (includesAny(text, ['\u81ea\u68c0'])) return 'self_check'
  if (planItemKind === 'inspection_task' || relationRole === 'inspection' || includesAny(text, ['\u68c0\u67e5', '\u68c0\u6d4b', '\u6d4b\u8bd5', '\u8bd5\u9a8c', '\u9a8c\u6536', '\u5b9e\u6d4b', '\u590d\u6d4b', '\u504f\u5dee', '\u901a\u7403', '\u901a\u6c34', '\u704c\u6c34', '\u95ed\u6c34', '\u84c4\u6c34', '\u6dcb\u6c34', '\u6f0f\u98ce', '\u6f0f\u5149', '\u8bd5\u5c04', '\u5e26\u8f7d', '\u5207\u6362', '\u6f14\u7ec3', '\u7a33\u5b9a\u6027\u786e\u8ba4'])) return 'self_check'
  return 'none'
}

function inferDocumentEvidenceRole(text: string, planItemKind: string, relationRole: string): DocumentEvidenceRole {
  if (includesAny(text, ['\u5546\u52a1', '\u7b7e\u8bc1', '\u8ba1\u91cf', '\u53d8\u66f4', '\u4ed8\u6b3e', '\u7ed3\u7b97', '\u7d22\u8d54', 'commercial', 'measurement', 'quantity', 'claim', 'payment', 'settlement'])) return 'commercial_document'
  if (includesAny(text, ['\u79fb\u4ea4', '\u4ea4\u63a5', '\u4ea4\u4ed8', '\u7b7e\u8ba4', '\u7ae3\u5de5\u8d44\u6599', '\u7ae3\u5de5\u56fe', '\u5907\u6848', 'SOP', '\u5907\u54c1\u5907\u4ef6'])) return 'handover_document'
  if (includesAny(text, ['\u5ba1\u6279', '\u5ba1\u6838', '\u62a5\u5ba1', '\u4e13\u9879\u65b9\u6848', '\u65b9\u6848', 'approval', 'special plan'])) return 'approval_document'
  if (includesAny(text, ['\u62a5\u544a', '\u63a2\u4f24', '\u68c0\u6d4b', '\u6d4b\u8bd5', '\u8bd5\u9a8c', '\u590d\u9a8c', '\u590d\u8bd5', '\u9001\u68c0', '\u901a\u7403', '\u901a\u6c34', '\u704c\u6c34', '\u95ed\u6c34', '\u84c4\u6c34', '\u6dcb\u6c34', '\u6f0f\u98ce', '\u6f0f\u5149', '\u8bd5\u5c04', '\u8bd5\u8fd0\u8f6c', '\u8bd5\u8fd0\u884c', 'FAT', 'SAT', 'UAT', 'IQ', 'OQ', 'PQ', '\u9a8c\u8bc1', '\u5e26\u8f7d', '\u5207\u6362', '\u6f14\u7ec3'])) return 'test_report'
  if (includesAny(text, ['\u9a8c\u6536', '\u9690\u853d', '\u68c0\u67e5', '\u89c1\u8bc1', '\u53d6\u6837', '\u62a5\u9a8c', '\u5b9e\u6d4b\u5b9e\u91cf', '\u5b9e\u6d4b', '\u590d\u6d4b', '\u504f\u5dee']) || relationRole === 'evidence') return 'inspection_record'
  if (planItemKind === 'document_task' || includesAny(text, ['\u8d44\u6599', '\u8bb0\u5f55', '\u53f0\u8d26', '\u5f52\u6863', '\u7ec4\u5377', '\u4ea4\u5e95', '\u6df1\u5316', '\u56fe\u7eb8', '\u6d4b\u91cf'])) return 'technical_record'
  return 'none'
}

function inferCommercialControlRole(text: string, planItemKind: string, relationRole: string): CommercialControlRole {
  if (includesAny(text, ['\u7ed3\u7b97', '\u7ed3\u7b97\u5ba1\u6838'])) return 'settlement'
  if (includesAny(text, ['\u4ed8\u6b3e', '\u8fdb\u5ea6\u6b3e'])) return 'progress_payment'
  if (includesAny(text, ['\u8ba4\u8d28\u8ba4\u4ef7', '\u8ba4\u4ef7', '\u4ef7\u683c'])) return 'price_approval'
  if (includesAny(text, ['\u7b7e\u8bc1', '\u7d22\u8d54', '\u53d8\u66f4'])) return 'variation_claim'
  if (includesAny(text, ['\u5de5\u7a0b\u91cf', '\u8ba1\u91cf', 'quantity', 'measurement'])) return 'quantity_measurement'
  if (planItemKind === 'commercial_task' || relationRole === 'commercial' || includesAny(text, ['\u5546\u52a1', '\u6210\u672c', '\u53f0\u8d26', '\u5ba1\u51cf'])) return 'cost_evidence'
  return 'none'
}

function inferManagementControlRole(text: string, planItemKind: string): ManagementControlRole {
  if (includesAny(text, ['\u79fb\u4ea4', '\u4ea4\u4ed8', '\u4fdd\u4fee', '\u4ea4\u63a5', 'SOP', '\u8fd0\u7ef4\u57f9\u8bad', '\u5907\u54c1\u5907\u4ef6'])) return 'handover_control'
  if (includesAny(text, ['\u8fdb\u5ea6', '\u7763\u529e', '\u6ede\u540e', '\u7ea0\u504f'])) return 'progress_control'
  if (includesAny(text, ['\u6574\u6539', '\u9500\u9879', '\u95ee\u9898', '\u7f3a\u9677'])) return 'issue_rectification'
  if (includesAny(text, ['\u63a5\u53e3', '\u63a5\u9a73', '\u754c\u9762', '\u534f\u8c03'])) return 'interface_coordination'
  if (includesAny(text, ['\u4e09\u901a\u4e00\u5e73', '\u4e03\u901a\u4e00\u5e73', '\u4f5c\u4e1a\u9762', '\u573a\u5730', '\u4e34\u8bbe', '\u4e34\u6c34', '\u4e34\u7535', '\u56f4\u6321', '\u9053\u8def', '\u5927\u95e8', '\u5f00\u5de5\u6761\u4ef6'])) return 'site_readiness_control'
  if (includesAny(text, ['\u8fdb\u573a', '\u52b3\u52a8\u529b', '\u8bbe\u5907', '\u6750\u6599', '\u673a\u68b0', '\u8c03\u914d'])) return 'resource_control'
  if (includesAny(text, ['\u65b9\u6848', '\u4ea4\u5e95', '\u6df1\u5316', '\u6837\u677f', '\u6280\u672f', '\u56fe\u7eb8', 'URS', 'DQ', '\u9a8c\u8bc1\u8ba1\u5212', '\u9a8c\u8bc1\u811a\u672c'])) return 'technical_control'
  if (includesAny(text, ['\u7ec4\u7ec7', '\u4f1a\u8bae', '\u4f1a\u7b7e', '\u65c1\u7ad9'])) return 'organization_control'
  if (includesAny(text, ['\u8ba1\u5212', '\u7b56\u5212', '\u603b\u63a7', '\u6708\u5ea6', '\u5468\u8ba1\u5212'])) return 'planning_control'
  if (planItemKind === 'management_task') return 'organization_control'
  if (planItemKind === 'milestone' || planItemKind === 'linked_projection') return 'handover_control'
  return 'none'
}

export function inferControlRoles(input: {
  name?: unknown
  metadata?: Record<string, unknown> | null
  packType?: unknown
  planItemKind?: unknown
  relationRole?: unknown
  durationContributionMode?: unknown
  executionNature?: unknown
} = {}): WbsTemplateControlRoles {
  const metadata = input.metadata ?? null
  const text = String(input.name ?? '').trim()
  const packType = String(input.packType ?? metadata?.packType ?? metadata?.pack_type ?? '').trim()
  const planItemKind = String(input.planItemKind ?? metadata?.planItemKind ?? metadata?.plan_item_kind ?? '').trim()
  const relationRole = String(input.relationRole ?? metadata?.relationRole ?? metadata?.relation_role ?? '').trim()
  const durationContributionMode = String(input.durationContributionMode ?? metadata?.durationContributionMode ?? metadata?.duration_contribution_mode ?? '').trim()

  const declaredSafetyControlRole = normalizeSafetyControlRole(readRole(metadata, 'safetyControlRole', 'safety_control_role'))
  const inferredSafetyControlRole = inferSafetyControlRole(text, packType, planItemKind)
  const declaredInspectionAcceptanceRole = normalizeInspectionAcceptanceRole(readRole(metadata, 'inspectionAcceptanceRole', 'inspection_acceptance_role'))
  const inferredInspectionAcceptanceRole = inferInspectionAcceptanceRole(text, planItemKind, relationRole)

  return {
    qualityControlRole: normalizeQualityControlRole(readRole(metadata, 'qualityControlRole', 'quality_control_role'))
      ?? inferQualityControlRole(text, durationContributionMode, planItemKind),
    safetyControlRole: declaredSafetyControlRole && !(declaredSafetyControlRole === 'none' && shouldUseInferredSafetyRole(text, inferredSafetyControlRole))
      ? declaredSafetyControlRole
      : inferredSafetyControlRole,
    inspectionAcceptanceRole: declaredInspectionAcceptanceRole && !(declaredInspectionAcceptanceRole === 'none' && shouldUseInferredInspectionRole(text, inferredInspectionAcceptanceRole))
      ? declaredInspectionAcceptanceRole
      : inferredInspectionAcceptanceRole,
    documentEvidenceRole: normalizeDocumentEvidenceRole(readRole(metadata, 'documentEvidenceRole', 'document_evidence_role'))
      ?? inferDocumentEvidenceRole(text, planItemKind, relationRole),
    commercialControlRole: normalizeCommercialControlRole(readRole(metadata, 'commercialControlRole', 'commercial_control_role'))
      ?? inferCommercialControlRole(text, planItemKind, relationRole),
    managementControlRole: normalizeManagementControlRole(readRole(metadata, 'managementControlRole', 'management_control_role'))
      ?? inferManagementControlRole(text, planItemKind),
  }
}
