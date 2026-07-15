export const NON_RESIDENTIAL_MASTER_CONTROL_PROJECTION_VERSION = 'v1.4.23.1-nonres-master-control-projection-20260714'

export type NonResidentialMasterControlPromotionEligibility = {
  source: 'non_residential_master_control_projection_policy'
  version: typeof NON_RESIDENTIAL_MASTER_CONTROL_PROJECTION_VERSION
  businessType: string
  businessSubtype: string
  eligible: boolean
  score: number
  scopeMode: 'project_control' | 'organization_lane_control'
  reasonCodes: string[]
  mutationBoundary: 'classification_only_no_db_write'
}

type ProjectionRow = {
  rowProjectionMode?: string | null
  executionPhase?: string | null
  executionLane?: string | null
  planItemKind?: string | null
  durationSuggestion?: unknown
  values: Record<string, unknown>
}

const NON_RESIDENTIAL_BUSINESS_TYPES = new Set([
  'hotel',
  'hospital',
  'school',
  'industrial',
  'data_center',
  'transportation_hub',
  'sports_culture',
  'tod_upper_cover',
  'renovation',
  'modular_building',
])

const NON_RESIDENTIAL_GENERAL_CIVIL_SUBTYPES = new Set([
  'civil_office_commercial',
  'civil_complex',
])

const DISALLOWED_TEMPLATE_GROUPS = new Set([
  'site_management',
  'danger_control',
  'document_commercial_support',
  'quality_responsibility',
  'project_milestone',
])

const SPECIALTY_TEMPLATE_GROUPS = new Set([
  'cleanroom',
  'data_center',
  'industrial_cleanroom',
  'renovation',
  'campus',
  'tod_upper_cover',
  'modular_mic',
  'hotel',
  'industrial_plant',
  'transportation_hub',
  'sports_culture',
  'steel_structure',
  'airport_terminal',
  'port_terminal',
  'facade',
  'elevator',
  'intelligent',
  'hvac',
  'plumbing',
  'electrical',
  'foundation',
  'prefab',
  'waterproof',
])

const ORGANIZATION_LANE_TEMPLATE_GROUPS = new Set([
  'building_main',
  'decoration',
  'mep',
  'facade',
  'elevator',
  'intelligent',
  'hvac',
  'plumbing',
  'electrical',
  'waterproof',
  'steel_structure',
  'prefab',
  'hotel',
  'data_center',
  'modular_mic',
  'industrial_plant',
  'transportation_hub',
  'sports_culture',
  'renovation',
])

const RESOURCE_OR_GOVERNANCE_ONLY_TITLE = /塔吊|施工升降机|施工电梯|临时设施|临建|脚手架|安全文明|实名制|扬尘|专项管理|住户|商户|协调|窗口管理|资料(?:整理|归档|报审)|报审|台账|技术交底|安全交底/i
const MAJOR_CONTROL_TITLE = /基础|基坑|土方|结构|钢结构|屋面|幕墙|围护|防水|给排水|消防|电气|变配电|供电|通风|空调|智能|智慧校园|开学窗口|开学切换|洁净|医气|医疗|设备|机房|装修|精装|道路|管网|景观|调试|联调|试运行|验收|移交|交付|生产|施工|安装|吊装|改造|加固|拆除|接口|foundation|structure|envelope|facade|roof|mep|fitout|commission|handover|equipment|system/i
const SUPPORTING_DETAIL_TITLE = /准备|保护|样板|检查|检测|复核|标识|清理|修补|记录/i
const CONTRACTUAL_MILESTONE_TITLE = /开工|基础验收|结构验收|封顶|送电|专项验收|竣工验收|备案|试运行|投产|移交|交付|opening|acceptance|handover|energization|commissioning/i
const METHOD_SPECIALTY_MILESTONE_TITLE = /整体提升专项验收|分段吊装专项验收|滑移专项验收/i
const INDUSTRIAL_INTERLEAVED_PACKAGE_CODES = new Set([
  'IPL-02-01-01',
  'IPL-03-01-01',
  'IPL-03-01-02',
])
const BUSINESS_TYPES_WITH_AUTHORED_STEEL_LONG_LEAD_CONTROL = new Set([
  'industrial',
  'transportation_hub',
  'sports_culture',
])
const STEEL_LONG_LEAD_DETAIL_CODES_REPLACED_BY_PROFILE = new Set([
  'STL-01-01-01',
])
const MODULAR_CURATED_MASTER_CONTROL_CODES = new Set([
  'MIC-02-01-01',
  'MIC-02-01-03',
  'MIC-04-01-02',
  'MIC-06-01-03',
  'MIC-06-01-05',
  'MIC-06-01-08',
  'MIC-03-01-02',
])
const RENOVATION_CURATED_MASTER_CONTROL_CODES = new Set([
  'RNV-04-01-05',
  'RNV-04-01-06',
  'RNV-04-01-16',
  'RNV-04-01-22',
])
const SHORT_PHYSICAL_MASTER_CONTROL_MIN_DAYS = 11
const SHORT_MASTER_CONTROL_GATE_TITLE = /\u9A8C\u6536|\u68C0\u6D4B|\u8BD5\u9A8C|\u8C03\u8BD5|\u8054\u8C03|\u8BD5\u8FD0\u884C|\u6F14\u7EC3|\u9001\u7535|\u786E\u8BA4|\u79FB\u4EA4|\u4EA4\u4ED8|\u6295\u4EA7|\b(?:commission(?:ing)?|test(?:ing)?|trial(?:\s+run)?|handover|acceptance|energization|rehearsal|cutover)\b/i
const RENOVATION_DEDICATED_TITLE = /\u6539\u9020|\u6539\u5EFA|\u62C6\u9664|\u62C6\u6539|\u9274\u5B9A|\u52A0\u56FA|\u6062\u590D|\u5BFC\u6539|\u5207\u6362|\u8FC1\u6539|\u4E0D\u505C\u7528|\u8FD0\u8425\u4FDD\u62A4|renovation|retrofit|cutover|decant|tie-in/i

function text(value: unknown) {
  return String(value ?? '').trim()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function numberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function positiveNumberOrNull(value: unknown) {
  const number = numberOrNull(value)
  return number !== null && number > 0 ? number : null
}

function projectionReferenceDurationDays(row: ProjectionRow, metadata: Record<string, unknown>) {
  const runtimeSuggestion = record(row.durationSuggestion)
  const storedSuggestion = record(row.values.duration_suggestion)
  const metadataSuggestion = record(metadata.durationSuggestion ?? metadata.duration_suggestion)
  const candidates = [
    row.values.smart_reference_days,
    metadata.smartReferenceDays,
    metadata.smart_reference_days,
    runtimeSuggestion.planReferenceDays,
    runtimeSuggestion.plan_reference_days,
    runtimeSuggestion.recommendedDurationDays,
    runtimeSuggestion.recommended_duration_days,
    storedSuggestion.planReferenceDays,
    storedSuggestion.plan_reference_days,
    storedSuggestion.recommendedDurationDays,
    storedSuggestion.recommended_duration_days,
    metadataSuggestion.planReferenceDays,
    metadataSuggestion.plan_reference_days,
    metadataSuggestion.recommendedDurationDays,
    metadataSuggestion.recommended_duration_days,
  ]
  for (const candidate of candidates) {
    const days = positiveNumberOrNull(candidate)
    if (days !== null) return days
  }
  return null
}

function titleWithoutGeneratedScopeSuffix(title: string) {
  return title.replace(/\s*(?:\([^)]*\)|\uFF08[^\uFF09]*\uFF09)\s*$/u, '').trim()
}

export function evaluateNonResidentialMasterControlPromotion(params: {
  businessType: string
  businessSubtype?: string | null
  row: ProjectionRow
}): NonResidentialMasterControlPromotionEligibility {
  const businessType = text(params.businessType).toLowerCase()
  const businessSubtype = text(params.businessSubtype).toLowerCase()
  const metadata = record(params.row.values.standard_task_metadata ?? params.row.values.standardTaskMetadata)
  const category = text(params.row.values.category_type ?? params.row.values.wbs_node_type)
  const planItemKind = text(params.row.planItemKind ?? params.row.values.plan_item_kind ?? metadata.planItemKind)
  const executionNature = text(params.row.values.execution_nature ?? metadata.executionNature)
  const durationContributionMode = text(params.row.values.duration_contribution_mode ?? metadata.durationContributionMode)
  const referenceDurationDays = projectionReferenceDurationDays(params.row, metadata)
  const templateGroup = text(params.row.values.template_group ?? metadata.templateGroup)
  const stableCode = text(
    params.row.values.standard_work_code
      ?? metadata.stableCode
      ?? params.row.values.template_node_id,
  ).toUpperCase()
  const curatedModularMasterControl = businessType === 'modular_building'
    && MODULAR_CURATED_MASTER_CONTROL_CODES.has(stableCode)
  const curatedRenovationMasterControl = businessType === 'renovation'
    && RENOVATION_CURATED_MASTER_CONTROL_CODES.has(stableCode)
  const title = text(params.row.values.title ?? params.row.values.name ?? params.row.values.standard_work_name)
  const semanticTitle = titleWithoutGeneratedScopeSuffix(title)
  const organization = record(metadata.projectOrganization ?? metadata.project_organization)
  const organizationLane = text(params.row.values.organization_lane ?? organization.organizationLane ?? organization.organization_lane)
  const buildingSequenceNumber = numberOrNull(
    params.row.values.building_sequence_number
      ?? organization.buildingSequenceNumber
      ?? organization.building_sequence_number,
  )
  const contractualMilestone = planItemKind === 'milestone'
    && templateGroup === 'project_milestone'
    && CONTRACTUAL_MILESTONE_TITLE.test(title)
  const governedCoarseSubdivision = category === 'sub_division'
    && !DISALLOWED_TEMPLATE_GROUPS.has(templateGroup)
  const hasOrganizationLane = organizationLane && organizationLane !== 'shared_works'
    || (buildingSequenceNumber ?? 0) > 0
  const scopeMode = hasOrganizationLane && ORGANIZATION_LANE_TEMPLATE_GROUPS.has(templateGroup)
    ? 'organization_lane_control'
    : 'project_control'
  const reasonCodes: string[] = []

  const supportedBusinessType = NON_RESIDENTIAL_BUSINESS_TYPES.has(businessType)
    || (businessType === 'general_civil' && NON_RESIDENTIAL_GENERAL_CIVIL_SUBTYPES.has(businessSubtype))
  if (!supportedBusinessType) reasonCodes.push('not_supported_non_residential_business_type')
  if (businessType === 'industrial' && INDUSTRIAL_INTERLEAVED_PACKAGE_CODES.has(stableCode)) {
    reasonCodes.push('interleaved_equipment_package_requires_process_level_drilldown')
  }
  if (
    BUSINESS_TYPES_WITH_AUTHORED_STEEL_LONG_LEAD_CONTROL.has(businessType)
    && STEEL_LONG_LEAD_DETAIL_CODES_REPLACED_BY_PROFILE.has(stableCode)
  ) {
    reasonCodes.push('steel_long_lead_detail_replaced_by_business_profile_control')
  }
  if (
    category === 'item_work'
    && planItemKind === 'work_task'
    && durationContributionMode === 'duration_bearing'
    && referenceDurationDays !== null
    && referenceDurationDays < SHORT_PHYSICAL_MASTER_CONTROL_MIN_DAYS
    && !SHORT_MASTER_CONTROL_GATE_TITLE.test(semanticTitle)
    && !curatedModularMasterControl
    && !curatedRenovationMasterControl
  ) {
    reasonCodes.push('short_physical_item_belongs_to_execution_drilldown')
  }
  if (
    businessType === 'renovation'
    && !stableCode.startsWith('RNV-')
    && !stableCode.startsWith('BTMP-RNV-')
    && templateGroup !== 'renovation'
    && !RENOVATION_DEDICATED_TITLE.test(semanticTitle)
  ) {
    reasonCodes.push('generic_catalog_row_not_renovation_master_control')
  }
  if (
    businessType === 'modular_building'
    && !stableCode.startsWith('MIC-')
    && !stableCode.startsWith('BTMP-MOD-')
    && templateGroup !== 'modular_mic'
  ) {
    reasonCodes.push('generic_catalog_row_replaced_by_modular_workflow_control')
  }
  if (!['item_work', 'sub_division'].includes(category)) reasonCodes.push('not_master_control_granularity')
  if (['document_task', 'management_task', 'safety_control'].includes(planItemKind)) reasonCodes.push('non_field_plan_item_kind')
  if (executionNature && !['field_execution', 'physical_work'].includes(executionNature) && !contractualMilestone) reasonCodes.push('non_field_execution_nature')
  if (durationContributionMode && durationContributionMode !== 'duration_bearing' && !contractualMilestone) reasonCodes.push('non_duration_bearing_control')
  if (DISALLOWED_TEMPLATE_GROUPS.has(templateGroup) && !contractualMilestone) reasonCodes.push('governance_or_support_template_group')
  if (RESOURCE_OR_GOVERNANCE_ONLY_TITLE.test(title)) reasonCodes.push('resource_or_governance_only_title')
  if (contractualMilestone && METHOD_SPECIALTY_MILESTONE_TITLE.test(title)) reasonCodes.push('method_specialty_milestone_not_project_control')
  if (!MAJOR_CONTROL_TITLE.test(title)
    && !governedCoarseSubdivision
    && !curatedModularMasterControl
    && !curatedRenovationMasterControl) {
    reasonCodes.push('no_major_construction_control_signal')
  }

  const eligible = reasonCodes.length === 0
  let score = 0
  if (eligible) {
    score += contractualMilestone ? 90 : category === 'sub_division' ? 72 : 48
    score += durationContributionMode === 'duration_bearing' ? 30 : contractualMilestone ? 24 : 12
    score += ['field_execution', 'physical_work'].includes(executionNature) ? 24 : contractualMilestone ? 18 : 8
    score += SPECIALTY_TEMPLATE_GROUPS.has(templateGroup) ? 34 : 16
    score += scopeMode === 'organization_lane_control' ? 20 : 12
    score += MAJOR_CONTROL_TITLE.test(title) || curatedModularMasterControl || curatedRenovationMasterControl ? 20 : 0
    score += (referenceDurationDays ?? 0) >= 30 ? 16 : (referenceDurationDays ?? 0) >= 15 ? 8 : 0
    score -= category === 'item_work' && (referenceDurationDays ?? Number.POSITIVE_INFINITY) < 15 ? 12 : 0
    score -= SUPPORTING_DETAIL_TITLE.test(title) ? 14 : 0
  }

  return {
    source: 'non_residential_master_control_projection_policy',
    version: NON_RESIDENTIAL_MASTER_CONTROL_PROJECTION_VERSION,
    businessType,
    businessSubtype,
    eligible,
    score: Math.max(0, score),
    scopeMode,
    reasonCodes: eligible ? ['eligible_existing_asset_master_control_candidate'] : reasonCodes,
    mutationBoundary: 'classification_only_no_db_write',
  }
}
