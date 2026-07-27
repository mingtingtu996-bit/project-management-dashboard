import { orderedInclusiveDurationDays, signedDurationDayDelta } from '../utils/durationDays.js'
import { resolveDefaultMasterPlanOperationalRowFloor } from './defaultMasterPlanRowVolumePolicy.js'
import { buildConstructionProductionDayRiskDistribution } from './durationMetricService.js'
import type { ConstructionCalendarContext } from './constructionCalendar.js'

export type ExecutableDefaultMasterPlanAssemblyRow = {
  clientRowId: string
  parentClientRowId: string | null
  sortOrder: number
  values: Record<string, unknown>
  predecessorClientRowIds: string[]
  predecessorDependencies: Array<{
    clientRowId: string
    [key: string]: unknown
  }>
  rowProjectionMode?: string | null
  executionPhase?: string | null
  executionLane?: string | null
  planItemKind?: string | null
  scheduleParticipation?: string | null
  linkedProjectionSource?: Record<string, unknown> | null
  durationSuggestion?: unknown
}

export type ExecutableDefaultMasterPlanAssemblyInput = {
  rows: ExecutableDefaultMasterPlanAssemblyRow[]
  businessType: string
  businessSubtype?: string | null
  methodVariantCodes?: string[]
  basementLevelCount?: number | null
  masterPlanProfile: {
    rowCountRange: [number, number]
  }
}

export type ExecutableDefaultMasterPlanAssemblySummary = {
  source: 'executable_default_master_plan_assembly'
  version: 'v1.4.23.1-executable-assembly-v1'
  status: 'executable_default_master_plan_ready' | 'executable_default_master_plan_blocked'
  businessType: string
  assetAuthority: 'system_standard_seed'
  calibrationPolicy: 'optional_runtime_overlay'
  scheduleRowCount: number
  recommendedMinimumScheduleRowCount: number
  minimumScheduleRowCount: number
  maximumScheduleRowCount: number
  availableScheduleRowCount: number
  operationalRowFloor: number
  assetInventoryExhausted: boolean
  assetInventoryShortfallRowCount: number
  assetInventoryShortfallAccepted: boolean
  rawPromotionCandidateRowCount: number
  promotableBeforeDurationAuthorityRowCount: number
  promotionCandidateMissingDurationAuthorityRowCount: number
  promotionCandidateMissingDurationAuthorityReasonCounts: Record<string, number>
  promotionCandidateMissingDurationAuthoritySamples: Array<{
    stableCode: string
    title: string
    executionPhase: string
    templateGroup: string
    reasonCode: string
  }>
  compactedPromotionCandidateRowCount: number
  promotionCandidateCountsByTemplateGroup: Record<string, number>
  promotionCandidateCountsByScopeMode: Record<string, number>
  promotedLinkedProjectionRowCount: number
  retainedLinkedProjectionRowCount: number
  durationBearingScheduleRowCount: number
  executableScheduleRowCount: number
  summaryScheduleRowCount: number
  visibleDependencyCount: number
  totalDependencyCount: number
  visibleDependencyCoverageRate: number
  coveredExecutionPhases: string[]
  missingExecutionPhases: string[]
  invalidDurationRowCount: number
  methodConflictCount: number
  durationAssetSemanticMismatchCount: number
  dependencyCycleRowCount: number
  schedulePropagationCycleRowCount: number
  networkComponentCount: number
  networkRootCount: number
  networkSinkCount: number
  syntheticDependencyPhaseInversionCount: number
  lateActivityPhaseMisclassificationCount: number
  skippedCyclicSiblingDependencyCount: number
  semanticFallbackDependencyCount: number
  heuristicStaggerDependencyCount: number
  sequencingGapCount: number
  sequencingGapSamples: Array<{
    predecessorStableCode: string
    predecessorTitle: string
    successorStableCode: string
    successorTitle: string
    executionPhase: string
    executionLane: string
    sequencingBasis: 'execution_phase_order_fallback' | 'heuristic_stagger'
  }>
  nonBlockingGovernanceWarningCodes: string[]
  primaryNetworkBridgeDependencyCount: number
  primaryControlSpineDependencyCount: number
  readinessReasonCodes: string[]
  readyForWizardCommit: boolean
  commitPolicy: 'wizard_commit_transactional_tasks_and_dependencies'
  mutationBoundary: 'assembly_only_no_db_write'
}

const SYSTEM_STANDARD_DURATION_SOURCE = 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules'
const STANDARD_SEED_ONLY_DURATION_SOURCE = 'standard_work_duration_seed'
const SYSTEM_STANDARD_DURATION_TRUTH_SOURCE = 'system_standard_executable_master_plan'
const EXECUTION_PHASE_SEQUENCE: Record<string, number> = {
  startup_site_setup: 10,
  foundation_pit_pile: 20,
  basement_waterproof_handover: 30,
  basement_structure: 30,
  superstructure_rhythm: 40,
  secondary_structure_fitout_roughin: 50,
  mep_roughin: 60,
  envelope_roof_facade: 60,
  elevator_installation: 70,
  interior_fitout_terminal: 70,
  outdoor_municipal_landscape: 80,
  commissioning: 90,
  acceptance_handover: 100,
}
const LATE_ACTIVITY_TITLE_PATTERN = /联调|调试|试车|试生产|试运营|试运行|排演|演练|投运|运营移交|负荷试验/i
const SHORT_MASTER_CONTROL_GATE_TITLE_PATTERN = /验收|检测|试验|调试|联调|试运行|演练|送电|确认|移交|交付|投产|\b(?:commission(?:ing)?|test(?:ing)?|trial(?:\s+run)?|handover|acceptance|energization|rehearsal|cutover)\b/i
const NO_BASEMENT_INCOMPATIBLE_TITLE_PATTERN = /地下结构|地下室|地下连续墙|基坑支护|基坑降水|支护降水|出正负零|diaphragm\s*wall|basement/i

function text(value: unknown) {
  return String(value ?? '').trim()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function positiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function truthy(value: unknown) {
  return value === true || value === 1 || value === '1' || text(value).toLowerCase() === 'true'
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function metadataOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  return record(row.values.standard_task_metadata ?? row.values.standardTaskMetadata)
}

function rowProjectionModeOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  return text(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode)
}

function isDedicatedBusinessTypeProfileRow(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const businessTypeMasterPlan = record(metadataOf(row).businessTypeMasterPlan)
  const businessType = text(businessTypeMasterPlan.businessType ?? row.values.business_type)
  return ['renovation', 'modular_building'].includes(businessType)
    && text(businessTypeMasterPlan.source) === 'managed_frontier_default_master_plan'
}

function isBusinessTypeSpecialtyProfileRow(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const businessTypeMasterPlan = record(metadataOf(row).businessTypeMasterPlan)
  return text(businessTypeMasterPlan.source) === 'managed_frontier_default_master_plan'
    && text(businessTypeMasterPlan.profileSourceType) === 'business_type_master_plan_profile_v1'
}

function durationModeOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  return text(row.values.duration_contribution_mode ?? metadata.durationContributionMode)
}

function planItemKindOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  return text(row.values.plan_item_kind ?? row.planItemKind ?? metadata.planItemKind)
}

function isRecordOnlyWbsSummaryRow(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  return truthy(row.values.is_wbs_summary ?? metadata.isWbsSummary ?? metadata.is_wbs_summary)
    && durationModeOf(row) === 'record_only'
}

function executionPhaseOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  return text(row.values.execution_phase ?? row.executionPhase ?? metadata.executionPhase)
}

function masterPlanVisibilityClassOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  const decision = record(metadata.masterPlanVisibilityDecision ?? metadata.master_plan_visibility_decision)
  return text(row.values.master_plan_visibility_class ?? decision.visibilityClass ?? decision.visibility_class)
}

function stableCodeOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  return text(row.values.standard_work_code ?? metadata.stableCode ?? row.values.template_node_id ?? row.clientRowId)
}

function titleOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  return text(row.values.title ?? row.values.name ?? row.values.standard_work_name)
}

function organizationLaneOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  const organization = record(metadata.projectOrganization ?? metadata.project_organization)
  return text(
    row.values.organization_lane
      ?? organization.organizationLane
      ?? organization.organization_lane,
  )
}

function buildingSequenceNumberOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  const organization = record(metadata.projectOrganization ?? metadata.project_organization)
  return positiveNumber(
    row.values.building_sequence_number
      ?? organization.buildingSequenceNumber
      ?? organization.building_sequence_number,
  )
}

function organizationLaneRoleOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  const organization = record(metadata.projectOrganization ?? metadata.project_organization)
  return text(
    row.values.organization_lane_role
      ?? organization.organizationLaneRole
      ?? organization.organization_lane_role,
  )
}

function organizationLaneSequenceNumberOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  const organization = record(metadata.projectOrganization ?? metadata.project_organization)
  const laneIndex = Number(
    row.values.organization_lane_index
      ?? organization.organizationLaneIndex
      ?? organization.organization_lane_index,
  )
  return Number.isFinite(laneIndex) && laneIndex >= 0
    ? Math.floor(laneIndex) + 1
    : buildingSequenceNumberOf(row)
}

function candidateCompactionKey(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const promotionEligibility = record(metadataOf(row).masterControlPromotionEligibility)
  const preserveOrganizationLane = truthy(promotionEligibility.eligible)
    && text(promotionEligibility.scopeMode) === 'organization_lane_control'
  return [
    stableCodeOf(row),
    executionPhaseOf(row),
    preserveOrganizationLane ? organizationLaneOf(row) : '',
    preserveOrganizationLane ? String(buildingSequenceNumberOf(row) ?? '') : '',
  ].join('|')
}

const PROJECT_LEVEL_PROMOTION_STABLE_CODES = new Set([
  'MIC-06-01-02',
])

function candidateScopeCompactionGroupKey(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  return [
    stableCodeOf(row),
    executionPhaseOf(row),
    text(row.values.template_group ?? metadata.templateGroup),
  ].join('|')
}

function isSharedPromotionScope(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const lane = organizationLaneOf(row)
  return !lane || ['shared_works', 'project_control', 'project_level_window'].includes(lane)
}

function compactMasterControlPromotionCandidates(rows: ExecutableDefaultMasterPlanAssemblyRow[]) {
  const groups = new Map<string, ExecutableDefaultMasterPlanAssemblyRow[]>()
  for (const row of rows) {
    const key = candidateScopeCompactionGroupKey(row)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  const candidateRows: ExecutableDefaultMasterPlanAssemblyRow[] = []
  const representativeByRawCandidateId = new Map<string, ExecutableDefaultMasterPlanAssemblyRow>()
  for (const group of groups.values()) {
    const sorted = [...group].sort(compareCompactionRows)
    const sharedRows = sorted.filter(isSharedPromotionScope)
    const laneRows = sorted.filter((row) => !isSharedPromotionScope(row))
    const laneKeys = unique(laneRows.map((row) => (
      `${organizationLaneOf(row)}|${buildingSequenceNumberOf(row) ?? ''}`
    )))
    const projectLevelOnly = PROJECT_LEVEL_PROMOTION_STABLE_CODES.has(stableCodeOf(sorted[0]!))
    const preferredRows = projectLevelOnly
      ? [sharedRows[0] ?? sorted[0]!]
      : laneKeys.length <= 1 && sharedRows.length > 0
        ? [sharedRows[0]!]
        : laneKeys.length > 1
          ? laneRows
          : sorted
    const representativeByKey = new Map<string, ExecutableDefaultMasterPlanAssemblyRow>()
    for (const row of preferredRows) {
      const key = candidateCompactionKey(row)
      if (!representativeByKey.has(key)) representativeByKey.set(key, row)
    }
    const representatives = [...representativeByKey.values()]
    candidateRows.push(...representatives)
    for (const row of sorted) {
      const exactRepresentative = representativeByKey.get(candidateCompactionKey(row))
      const sameLaneRepresentative = representatives.find((candidate) => (
        organizationLaneOf(candidate) === organizationLaneOf(row)
        && buildingSequenceNumberOf(candidate) === buildingSequenceNumberOf(row)
      ))
      representativeByRawCandidateId.set(
        row.clientRowId,
        exactRepresentative ?? sameLaneRepresentative ?? representatives[0]!,
      )
    }
  }
  return {
    candidateRows,
    representativeByRawCandidateId,
  }
}

function compareCompactionRows(
  left: ExecutableDefaultMasterPlanAssemblyRow,
  right: ExecutableDefaultMasterPlanAssemblyRow,
) {
  const leftShared = organizationLaneOf(left) === 'shared_works'
  const rightShared = organizationLaneOf(right) === 'shared_works'
  if (leftShared !== rightShared) return leftShared ? -1 : 1
  return compareRows(left, right)
}

function hasValidPlanWindow(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const start = text(row.values.planned_start_date ?? row.values.start_date).slice(0, 10)
  const end = text(row.values.planned_end_date ?? row.values.end_date).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false
  return orderedInclusiveDurationDays(start, end) !== null
}

function planWindowDurationDays(row: ExecutableDefaultMasterPlanAssemblyRow) {
  if (!hasValidPlanWindow(row)) return null
  const start = text(row.values.planned_start_date ?? row.values.start_date).slice(0, 10)
  const end = text(row.values.planned_end_date ?? row.values.end_date).slice(0, 10)
  return orderedInclusiveDurationDays(start, end)
}

function referenceDurationDaysOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const storedSuggestion = record(row.values.duration_suggestion)
  const runtimeSuggestion = record(row.durationSuggestion)
  return positiveNumber(row.values.smart_reference_days)
    ?? positiveNumber(runtimeSuggestion.planReferenceDays)
    ?? positiveNumber(runtimeSuggestion.recommendedDurationDays)
    ?? positiveNumber(storedSuggestion.planReferenceDays)
    ?? positiveNumber(storedSuggestion.recommendedDurationDays)
    ?? planWindowDurationDays(row)
}

function originalProjectionModeOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const source = record(row.linkedProjectionSource ?? row.values.linked_projection_source)
  const metadata = metadataOf(row)
  const projectionPolicy = record(metadata.masterPlanProjectionPolicy)
  return text(source.originalRowProjectionMode ?? projectionPolicy.originalRowProjectionMode)
}

function canPromote(row: ExecutableDefaultMasterPlanAssemblyRow) {
  if (rowProjectionModeOf(row) !== 'linked_projection') return false
  const metadata = metadataOf(row)
  const visibilityDecision = record(metadata.masterPlanVisibilityDecision)
  const promotionEligibility = record(metadata.masterControlPromotionEligibility)
  if (visibilityDecision.policyVersion === 'v1.4.23.1-master-plan-visibility-v1'
    && visibilityDecision.visibleOnMasterPlan === false
    && !truthy(promotionEligibility.eligible)) return false
  const originalProjectionMode = originalProjectionModeOf(row)
  const eligibleContractualGate = originalProjectionMode === 'gate_marker'
    && planItemKindOf(row) === 'milestone'
    && truthy(promotionEligibility.eligible)
  if (originalProjectionMode !== 'schedule_row' && !eligibleContractualGate) return false
  if (['document_task', 'management_task', 'safety_control'].includes(planItemKindOf(row))) return false
  if (!hasValidPlanWindow(row)) return false
  return referenceDurationDaysOf(row) !== null
}

const METHOD_VARIANT_CODE_ALIASES: Record<string, string> = {
  pile_foundation: 'bored_pile',
  cast_in_place_pile: 'bored_pile',
  bored_cast_in_place_pile: 'bored_pile',
  rotary_drilling_pile: 'bored_pile',
  vertical_retaining_support: 'diaphragm_wall',
  vertical_retaining: 'diaphragm_wall',
  underground_diaphragm_wall: 'diaphragm_wall',
  smw_pile: 'smw_wall',
  smw: 'smw_wall',
  trd: 'trd_wall',
  soil_nailing: 'soil_nail_wall',
  soil_nail: 'soil_nail_wall',
  phc_pile: 'precast_pile',
  static_press_pile: 'precast_pile',
  cfg: 'cfg_pile',
  raft: 'raft_foundation',
  spread: 'spread_foundation',
  independent_foundation: 'spread_foundation',
  sheet_pile: 'sheet_pile_support',
  secant_pile: 'secant_pile_support',
  gravity_retaining_wall: 'gravity_wall',
  internal_support: 'internal_strut',
  horizontal_strut: 'internal_strut',
  anchor_cable: 'anchor_support',
}

const METHOD_VARIANT_GROUPS = [
  [
    { code: 'spread_foundation', titlePattern: /无筋扩展基础|钢筋混凝土扩展基础|独立基础|spread foundation/i },
    { code: 'raft_foundation', titlePattern: /筏型与箱型基础|筏板基础|箱型基础|raft foundation/i },
    { code: 'steel_composite_foundation', titlePattern: /钢结构基础|钢管混凝土结构基础|型钢混凝土结构基础/i },
    { code: 'precast_pile', titlePattern: /预制桩基础|预制管桩|PHC 管桩|静压桩|precast pile|static press/i },
    { code: 'bored_pile', titlePattern: /泥浆护壁成孔灌注桩|钻孔灌注桩|旋挖灌注桩|bored cast|rotary drilling/i },
    { code: 'dry_bored_pile', titlePattern: /干作业成孔桩|dry bored pile/i },
    { code: 'long_auger_pile', titlePattern: /长螺旋钻孔压灌桩|long auger/i },
    { code: 'driven_cast_pile', titlePattern: /沉管灌注桩|driven cast/i },
    { code: 'steel_pile', titlePattern: /钢桩基础|steel pile/i },
    { code: 'rock_anchor_foundation', titlePattern: /岩石锚杆基础|rock anchor foundation/i },
    { code: 'caisson_foundation', titlePattern: /沉井与沉箱基础|caisson foundation/i },
    { code: 'cfg_pile', titlePattern: /\bCFG\b|CFG 桩/i },
  ],
  [
    { code: 'diaphragm_wall', titlePattern: /地下连续墙|diaphragm wall/i },
    { code: 'smw_wall', titlePattern: /\bSMW\b|SMW 工法/i },
    { code: 'trd_wall', titlePattern: /\bTRD\b|TRD 等厚/i },
    { code: 'soil_nail_wall', titlePattern: /土钉墙|soil nail/i },
    { code: 'bored_pile_support', titlePattern: /灌注桩排桩围护墙|排桩支护|bored pile support/i },
    { code: 'sheet_pile_support', titlePattern: /板桩围护墙|sheet pile support/i },
    { code: 'secant_pile_support', titlePattern: /咬合桩围护墙|secant pile support/i },
    { code: 'gravity_wall', titlePattern: /水泥土重力式挡墙|gravity wall/i },
    { code: 'combined_structure_support', titlePattern: /与主体结构相结合的基坑支护|combined structure support/i },
  ],
  [
    { code: 'internal_strut', titlePattern: /内支撑|internal strut/i },
    { code: 'anchor_support', titlePattern: /锚杆|锚索支护|anchor cable/i },
    { code: 'no_horizontal_strut', titlePattern: /(?!)/ },
  ],
] as const

const DURATION_ASSET_SEMANTIC_RULES = [
  { key: 'foundation_support', seedPattern: /foundation_pit_(?:retaining_support|diaphragm_wall)|expert_foundation_pit_support/, titlePattern: /基坑|支护|基坑围护|连续墙|排桩|板桩|咬合桩|挡墙|降水|内支撑|锚索|锚杆|注浆|模块基础|吊装道路|anchor|lift.path/ },
  { key: 'pile_foundation', seedPattern: /pile_foundation|bored_cast_in_place_pile|expert_pile_foundation/, titlePattern: /桩|成孔|成桩|承台|桩基/ },
  { key: 'earthwork', seedPattern: /earthwork/, titlePattern: /土方|开挖|回填|场地平整/ },
  { key: 'waterproof', seedPattern: /basement_waterproof|roof_waterproof/, titlePattern: /防水|保温|闭水|回填|密封|屋面|外围护/ },
  { key: 'concrete_structure', seedPattern: /basement_structure|shallow_foundation_concrete_structure|cast_in_place_(?:concrete|formwork)|cushion_and_blinding/, titlePattern: /混凝土|主体结构|地下(?:室)?结构|塔楼结构|裙房|首层|转换层|屋面层|机房结构|模板|钢筋|垫层|正负零|结构施工|结构验收|基础|承台|地梁/ },
  { key: 'steel_structure', seedPattern: /steel_erection|large_span_roof_structure/, titlePattern: /钢结构|钢构件|钢构|桁架|大跨度|网架|屋盖|楼承板|高强螺栓|焊接|金属围护|站房|枢纽|场馆/ },
  { key: 'masonry', seedPattern: /masonry/, titlePattern: /砌体|二次结构|填充墙/ },
  { key: 'mep', seedPattern: /mep_plumbing_fire_pipe/, titlePattern: /机电|给水|排水|消防|管道|管线|通风|排烟|空调|电气|照明|布线|报警|设备监控|医气|医疗气体|污水|医废|阀箱|气源站|真空|压缩空气|变配电|供电|动力接驳|弱电|声光电|设备安装|管井|预留预埋/ },
  { key: 'cleanroom_hvac', seedPattern: /hvac_cleanroom/, titlePattern: /洁净空调|净化空调|高效过滤|压差|HEPA|送风末端|洁净验证|季节工况|手术部洁净|医气|医疗气体|医疗设备/ },
  { key: 'interior_finish', seedPattern: /interior_(?:public|unit)_finish/, titlePattern: /装修|内装|精装|地面|地坪|抹灰|门窗|墙顶|彩钢板|涂饰|吊顶|卫浴|客房|大堂|宴会|围护结构|气密窗|手术室墙顶|末端安装/ },
  { key: 'exterior_insulation', seedPattern: /exterior_insulation_finish/, titlePattern: /外墙|外立面|外窗|保温|节能|气密|热桥/ },
  { key: 'facade', seedPattern: /curtain_wall/, titlePattern: /幕墙|外立面|门窗|外围护|围护防水|防水与密封|围护系统节能/ },
  { key: 'elevator', seedPattern: /elevator/, titlePattern: /电梯|垂直运输/ },
  { key: 'outdoor', seedPattern: /outdoor_utilities/, titlePattern: /室外|道路|景观|管网|场坪|绿化/ },
  { key: 'single_commissioning', seedPattern: /single_system_commissioning/, titlePattern: /单机调试|单系统调试/ },
  { key: 'integrated_commissioning', seedPattern: /integrated_commissioning/, titlePattern: /联调|调试|验收|移交|投产|开业|试运营|整改|销项|验证|演练|试车/ },
  { key: 'modular', seedPattern: /pc_component_hoisting/, titlePattern: /模块|吊装|运输|连接|装配|混凝土结构|砌体结构/ },
  { key: 'renovation', seedPattern: /renovation_retrofit/, titlePattern: /改造|拆除|拆改|鉴定|加固|补强|植筋|粘钢|碳纤维|恢复|导改|切换|既有结构|混凝土结构|砌体结构/ },
  { key: 'site_setup', seedPattern: /site_setup_temp_works/, titlePattern: /施工准备|场地移交|临建|围挡|临时道路|临水|临电|塔吊|深化设计|工厂生产|吊装道路|运营线保护|监测|临时防护/ },
  { key: 'specialist_design_procurement', seedPattern: /specialist_design_procurement_release/, titlePattern: /深化|选型|技术规格|采购释放|design|selection|procurement/ },
  { key: 'long_lead_manufacture_delivery', seedPattern: /long_lead_equipment_manufacture_delivery/, titlePattern: /长周期|订货|排产|制造|FAT|到货|进场|long.lead|manufactur|factory.acceptance|delivery/ },
] as const

type DurationAssetAuthority = {
  mapping: Record<string, unknown>
  calculation: Record<string, unknown>
  sourceStableCode: string
  sourceClientRowId: string
  sourceExecutionPhase: string
  sourceExecutionLane: string
  sourceStartDate: string | null
  sourceReferenceDurationDays: number | null
  initialScheduleAuthority: boolean
}

function durationAssetMappingOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  return record(metadata.durationAssetMapping ?? row.values.duration_asset_mapping)
}

function durationAssetCalculationOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  return record(metadata.durationAssetCalculation ?? row.values.duration_asset_calculation)
}

function durationSuggestionOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const runtimeSuggestion = record(row.durationSuggestion)
  return Object.keys(runtimeSuggestion).length > 0
    ? runtimeSuggestion
    : record(row.values.duration_suggestion)
}

function durationAssetSeedStableCode(
  mapping: Record<string, unknown>,
  calculation: Record<string, unknown> = {},
) {
  return text(
    mapping.standardWorkDurationSeedStableCode
      ?? mapping.standard_work_duration_seed_stable_code
      ?? calculation.standardWorkDurationSeedStableCode
      ?? calculation.standard_work_duration_seed_stable_code,
  )
}

function durationSemanticRuleForAuthority(authority: Pick<DurationAssetAuthority, 'mapping' | 'calculation'>) {
  const seedStableCode = durationAssetSeedStableCode(authority.mapping, authority.calculation)
  return DURATION_ASSET_SEMANTIC_RULES.find((rule) => rule.seedPattern.test(seedStableCode)) ?? null
}

export function isExecutableDurationAssetSemanticallyCompatible(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  mapping = durationAssetMappingOf(row),
  calculation = durationAssetCalculationOf(row),
) {
  const seedStableCode = durationAssetSeedStableCode(mapping, calculation)
  if (!seedStableCode) return false
  const rowStableCode = stableCodeOf(row)
  if (seedStableCode === 'interior_public_finish' && rowStableCode === 'BTMP-HTL-01') return true
  if (seedStableCode === 'site_setup_temp_works' && ['BTMP-RNV-01', 'BTMP-RNV-02'].includes(rowStableCode)) return true
  const rule = DURATION_ASSET_SEMANTIC_RULES.find((candidate) => candidate.seedPattern.test(seedStableCode))
  return !rule || rule.titlePattern.test(
    `${titleOf(row)} ${stableCodeOf(row)} ${text(row.values.execution_lane ?? row.executionLane)}`,
  )
}

function normalizedMethodVariantCodeSet(methodVariantCodes: string[]) {
  return new Set(methodVariantCodes.map((value) => {
    const normalized = text(value).toLowerCase()
    return METHOD_VARIANT_CODE_ALIASES[normalized] ?? normalized
  }).filter(Boolean))
}

function usesUnselectedMethodAlternative(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  methodVariantCodes: string[],
) {
  const title = titleOf(row)
  const selectedCodes = normalizedMethodVariantCodeSet(methodVariantCodes)
  for (const group of METHOD_VARIANT_GROUPS) {
    const matched = group.find((option) => option.titlePattern.test(title))
    if (!matched) continue
    const selected = group.find((option) => selectedCodes.has(option.code))
    if (!selected || matched.code !== selected.code) return true
  }
  return false
}

export function countExecutableDefaultMasterPlanMethodConflicts(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
) {
  return METHOD_VARIANT_GROUPS.reduce((count, group) => {
    const matchedFamilyCount = group.filter((option) => rows.some((row) => option.titlePattern.test(titleOf(row)))).length
    return count + Math.max(0, matchedFamilyCount - 1)
  }, 0)
}

function canPromoteForBusinessType(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  businessType: string,
  methodVariantCodes: string[],
  basementLevelCount: number | null | undefined,
) {
  if (!canPromote(row)) return false
  if (usesUnselectedMethodAlternative(row, methodVariantCodes)) return false
  if (basementLevelCount === 0 && NO_BASEMENT_INCOMPATIBLE_TITLE_PATTERN.test(titleOf(row))) return false
  if (businessType !== 'renovation') return true
  const title = titleOf(row)
  const dedicatedRenovationSignal = /改造|拆除|拆改|鉴定|加固|恢复|导改|切换|renovation|retrofit/i.test(title)
  if (dedicatedRenovationSignal) return true
  return !/基坑|土方|桩基|地下结构|正负零|电梯安装|earthwork|pile|basement/i.test(title)
}

function rowScore(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  const kind = text(row.values.plan_item_kind ?? row.planItemKind ?? metadata.planItemKind)
  const category = text(row.values.category_type ?? row.values.wbs_node_type)
  const executionNature = text(row.values.execution_nature ?? metadata.executionNature)
  const policy = record(metadata.generationDepthPolicy)
  const promotionEligibility = record(metadata.masterControlPromotionEligibility)
  let score = 0
  if (truthy(row.values.is_executable)) score += 80
  if (!truthy(row.values.is_wbs_summary)) score += 35
  if (durationModeOf(row) === 'duration_bearing') score += 50
  if (executionNature === 'field_execution') score += 30
  if (kind === 'work_task') score += 25
  if (category === 'process') score += 20
  if (category === 'sub_division') score += 35
  if (category === 'item_work') score += 8
  const referenceDurationDays = referenceDurationDaysOf(row)
  if (category === 'item_work' && referenceDurationDays !== null && referenceDurationDays < 15) score -= 35
  if ((row.predecessorDependencies ?? []).length > 0) score += 10
  if (row.parentClientRowId) score += 5
  if (text(policy.governance && record(policy.governance).curationStatus) === 'seeded') score += 12
  if (truthy(promotionEligibility.eligible)) score += Math.max(0, Number(promotionEligibility.score) || 0)
  if (['management_task', 'document_task', 'safety_control', 'inspection_task'].includes(kind)) score -= 60
  if (kind === 'milestone') score -= 30
  return score
}

function compareRows(left: ExecutableDefaultMasterPlanAssemblyRow, right: ExecutableDefaultMasterPlanAssemblyRow) {
  const byScore = rowScore(right) - rowScore(left)
  if (byScore) return byScore
  const byStart = text(left.values.planned_start_date).localeCompare(text(right.values.planned_start_date))
  if (byStart) return byStart
  const bySort = left.sortOrder - right.sortOrder
  if (bySort) return bySort
  return stableCodeOf(left).localeCompare(stableCodeOf(right), 'zh-Hans-CN')
}

function masterControlSelectionBucket(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  const promotionEligibility = record(metadata.masterControlPromotionEligibility)
  const templateGroup = text(row.values.template_group ?? metadata.templateGroup) || 'unclassified'
  const organizationLane = text(promotionEligibility.scopeMode) === 'organization_lane_control'
    ? organizationLaneOf(row) || `building_${buildingSequenceNumberOf(row) ?? 'unassigned'}`
    : 'project_control'
  return [executionPhaseOf(row), organizationLane, templateGroup].join('|')
}

function t2RhythmTemplateIdOfAuthority(authority: Pick<DurationAssetAuthority, 'mapping' | 'calculation'>) {
  return text(
    authority.mapping.t2RhythmTemplateId
      ?? authority.mapping.t2_rhythm_template_id
      ?? authority.calculation.t2RhythmTemplateId
      ?? authority.calculation.t2_rhythm_template_id,
  )
}

function pickT2RhythmAuthorityFields(...sources: Record<string, unknown>[]) {
  return Object.fromEntries(sources.flatMap((source) => (
    Object.entries(source).filter(([key]) => key.toLowerCase().startsWith('t2'))
  )))
}

function selectT2RhythmAuthorityForRow(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  directAuthorities: DurationAssetAuthority[],
) {
  const phase = executionPhaseOf(row)
  const rowLane = text(row.values.execution_lane ?? row.executionLane)
  const compare = (left: DurationAssetAuthority, right: DurationAssetAuthority) => (
    Number(right.initialScheduleAuthority) - Number(left.initialScheduleAuthority)
    || Number(right.sourceExecutionLane === rowLane) - Number(left.sourceExecutionLane === rowLane)
    || left.sourceStableCode.localeCompare(right.sourceStableCode, 'zh-Hans-CN')
  )
  const samePhase = directAuthorities
    .filter((authority) => authority.sourceExecutionPhase === phase && t2RhythmTemplateIdOfAuthority(authority))
    .sort(compare)[0]
  if (samePhase) return samePhase

  const initialProfileAuthorities = directAuthorities
    .filter((authority) => authority.initialScheduleAuthority && t2RhythmTemplateIdOfAuthority(authority))
    .sort(compare)
  const profileTemplateIds = unique(initialProfileAuthorities.map(t2RhythmTemplateIdOfAuthority))
  return profileTemplateIds.length === 1 ? initialProfileAuthorities[0] ?? null : null
}

function buildDescendantProcessRollupAuthority(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  directAuthorities: DurationAssetAuthority[],
): DurationAssetAuthority | null {
  const suggestion = durationSuggestionOf(row)
  const reasonCode = text(suggestion.businessReasonCode ?? suggestion.business_reason_code)
  if (!['MANAGED_FRONTIER_DESCENDANT_ROLLUP', 'ITEM_PACK_DESCENDANT_ROLLUP'].includes(reasonCode)) return null

  const reasonParams = record(suggestion.businessReasonParams ?? suggestion.business_reason_params)
  const rollup = record(reasonParams.descendantRollup ?? reasonParams.descendant_rollup)
  const durationSeedStableCodes = unique(array(
    rollup.durationSeedStableCodes ?? rollup.duration_seed_stable_codes,
  ).map(text))
  const durationSeedResolverVersionIds = unique(array(
    rollup.durationSeedResolverVersionIds ?? rollup.duration_seed_resolver_version_ids,
  ).map(text))
  const durationSeedResolutions = array(
    rollup.durationSeedResolutions ?? rollup.duration_seed_resolutions,
  ).map(record).filter((resolution) => text(resolution.stableCode ?? resolution.stable_code))
  const factorAvailability = record(suggestion.factorAvailability ?? suggestion.factor_availability)
  if (durationSeedStableCodes.length === 0 || !truthy(
    factorAvailability.standard_work_duration_seed,
  )) return null

  const phase = executionPhaseOf(row)
  const rowLane = text(row.values.execution_lane ?? row.executionLane)
  const t2Authority = selectT2RhythmAuthorityForRow(row, directAuthorities)
  if (phase !== 'startup_site_setup' && !t2Authority) return null

  const sourceStableCode = stableCodeOf(row)
  const rollupStableCode = `process_rollup:${sourceStableCode}`
  const childProcessStableCodes = unique(array(
    rollup.childProcessStableCodes ?? rollup.child_process_stable_codes,
  ).map(text))
  const t2Fields = t2Authority
    ? pickT2RhythmAuthorityFields(t2Authority.mapping, t2Authority.calculation)
    : {}
  const selectedDurationDays = Math.max(1, Math.round(
    positiveNumber(suggestion.recommendedDurationDays)
      ?? positiveNumber(suggestion.planReferenceDays)
      ?? referenceDurationDaysOf(row)
      ?? 1,
  ))
  const category = text(row.values.category_type ?? row.values.wbs_node_type)
  const masterControlReferenceFloorDays = category === 'sub_division'
    && t2Authority?.sourceReferenceDurationDays
    ? Math.max(1, Math.ceil(t2Authority.sourceReferenceDurationDays * 0.15))
    : null
  const masterControlSelectedDurationDays = Math.max(
    selectedDurationDays,
    masterControlReferenceFloorDays ?? 1,
  )
  const mapping = {
    ...t2Fields,
    source: 'managed_frontier_descendant_process_seed_rollup',
    standardWorkDurationAuthorityMode: 'descendant_process_seed_rollup',
    standardWorkDurationSeedStableCode: rollupStableCode,
    standardWorkDurationSeedSourceStableCodes: durationSeedStableCodes,
    standardWorkDurationSeedResolverSource: text(
      rollup.durationSeedResolverSource ?? rollup.duration_seed_resolver_source,
    ) || 'ts_seed_fallback',
    standardWorkDurationSeedResolverVersionId: text(
      rollup.durationSeedResolverVersionId ?? rollup.duration_seed_resolver_version_id,
    ) || (durationSeedResolverVersionIds.length === 1 ? durationSeedResolverVersionIds[0] : null),
    standardWorkDurationSeedResolverVersionIds: durationSeedResolverVersionIds,
    standardWorkDurationSeedResolutions: durationSeedResolutions,
    descendantProcessStableCodes: childProcessStableCodes,
    mutationBoundary: 'assembly_only_no_db_write',
  }
  const calculation = {
    ...t2Fields,
    ...mapping,
    selectedDurationDays: masterControlSelectedDurationDays,
    ...(masterControlReferenceFloorDays
      ? { masterControlReferenceFloorDays }
      : {}),
    rollupSource: text(rollup.source) || 'contextual_descendant_rollup',
    rollupChildProcessCount: childProcessStableCodes.length,
    rollupDurationSeedCount: durationSeedStableCodes.length,
  }
  return {
    mapping,
    calculation,
    sourceStableCode,
    sourceClientRowId: row.clientRowId,
    sourceExecutionPhase: phase,
    sourceExecutionLane: rowLane,
    sourceStartDate: dateTextOf(row, 'start'),
    sourceReferenceDurationDays: masterControlSelectedDurationDays,
    initialScheduleAuthority: false,
  }
}

function buildDurationAssetAuthorities(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  initialScheduleRowIds: Set<string>,
) {
  const directAuthorities: DurationAssetAuthority[] = []
  for (const row of rows) {
    if (durationModeOf(row) !== 'duration_bearing') continue
    const mapping = durationAssetMappingOf(row)
    const calculation = durationAssetCalculationOf(row)
    if (!durationAssetSeedStableCode(mapping, calculation)) continue
    directAuthorities.push({
      mapping,
      calculation,
      sourceStableCode: stableCodeOf(row),
      sourceClientRowId: row.clientRowId,
      sourceExecutionPhase: executionPhaseOf(row),
      sourceExecutionLane: text(row.values.execution_lane ?? row.executionLane),
      sourceStartDate: dateTextOf(row, 'start'),
      sourceReferenceDurationDays: referenceDurationDaysOf(row),
      initialScheduleAuthority: initialScheduleRowIds.has(row.clientRowId),
    })
  }
  const rollupAuthorities = rows
    .filter((row) => (
      durationModeOf(row) === 'duration_bearing'
      && !durationAssetSeedStableCode(durationAssetMappingOf(row), durationAssetCalculationOf(row))
    ))
    .map((row) => buildDescendantProcessRollupAuthority(row, directAuthorities))
    .filter((authority): authority is DurationAssetAuthority => Boolean(authority))
  return [...directAuthorities, ...rollupAuthorities]
}

function explainMissingDurationAssetAuthority(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  authorities: DurationAssetAuthority[],
) {
  const ownMapping = durationAssetMappingOf(row)
  const ownCalculation = durationAssetCalculationOf(row)
  if (durationAssetSeedStableCode(ownMapping, ownCalculation)) return 'direct_duration_authority_semantic_mismatch'

  const suggestion = durationSuggestionOf(row)
  const reasonCode = text(suggestion.businessReasonCode ?? suggestion.business_reason_code)
  if (!['MANAGED_FRONTIER_DESCENDANT_ROLLUP', 'ITEM_PACK_DESCENDANT_ROLLUP'].includes(reasonCode)) {
    return 'governed_descendant_rollup_lineage_missing'
  }
  const reasonParams = record(suggestion.businessReasonParams ?? suggestion.business_reason_params)
  const rollup = record(reasonParams.descendantRollup ?? reasonParams.descendant_rollup)
  const durationSeedStableCodes = unique(array(
    rollup.durationSeedStableCodes ?? rollup.duration_seed_stable_codes,
  ).map(text))
  if (durationSeedStableCodes.length === 0) return 'descendant_standard_duration_seed_lineage_missing'
  const factorAvailability = record(suggestion.factorAvailability ?? suggestion.factor_availability)
  if (!truthy(factorAvailability.standard_work_duration_seed)) return 'descendant_standard_duration_seed_not_governed'
  const phase = executionPhaseOf(row)
  if (phase !== 'startup_site_setup' && !selectT2RhythmAuthorityForRow(row, authorities)) {
    return 'same_phase_or_unique_profile_t2_rhythm_authority_missing'
  }
  return 'duration_authority_resolution_failed'
}

function scoreDurationAssetAuthority(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  authority: DurationAssetAuthority,
) {
  if (!isExecutableDurationAssetSemanticallyCompatible(row, authority.mapping, authority.calculation)) {
    return Number.NEGATIVE_INFINITY
  }
  const semanticRule = durationSemanticRuleForAuthority(authority)
  if (!semanticRule && authority.sourceClientRowId !== row.clientRowId) return Number.NEGATIVE_INFINITY
  if (authority.sourceClientRowId === row.clientRowId) return 10_000

  let score = semanticRule ? 200 : 0
  if (authority.sourceExecutionPhase === executionPhaseOf(row)) score += 80
  const rowLane = text(row.values.execution_lane ?? row.executionLane)
  if (rowLane && authority.sourceExecutionLane === rowLane) score += 30
  if (authority.sourceStableCode === stableCodeOf(row)) score += 120
  const rowStart = dateTextOf(row, 'start')
  if (rowStart && authority.sourceStartDate) {
    const distanceDays = Math.abs(signedDurationDayDelta(authority.sourceStartDate, rowStart) ?? 0)
    score -= Math.min(40, distanceDays / 30)
  }
  if (authority.initialScheduleAuthority) score += 10
  return score
}

function resolveDurationAssetAuthority(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  authorities: DurationAssetAuthority[],
) {
  const ownMapping = durationAssetMappingOf(row)
  if (truthy(ownMapping.profileActivityDurationAssetAuthority)) {
    const ownAuthority = authorities.find((authority) => authority.sourceClientRowId === row.clientRowId)
    if (ownAuthority) return ownAuthority
  }
  return authorities
    .map((authority) => ({ authority, score: scoreDurationAssetAuthority(row, authority) }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => (
      right.score - left.score
      || left.authority.sourceStableCode.localeCompare(right.authority.sourceStableCode, 'zh-Hans-CN')
      || left.authority.sourceClientRowId.localeCompare(right.authority.sourceClientRowId)
    ))[0]?.authority ?? null
}

function normalizeDurationAuthority(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  selectedDurationAuthority?: DurationAssetAuthority | null,
  options: {
    masterControlReferenceFloorDays?: number | null
  } = {},
) {
  const metadata = metadataOf(row)
  const storedSuggestion = record(row.values.duration_suggestion)
  const runtimeSuggestion = record(row.durationSuggestion)
  const suggestion = Object.keys(runtimeSuggestion).length > 0 ? runtimeSuggestion : storedSuggestion
  const isMilestone = planItemKindOf(row) === 'milestone'
  const rawP50 = Math.max(1, Math.round(
    positiveNumber(suggestion.riskP50DurationDays)
      ?? positiveNumber(suggestion.planReferenceDays)
      ?? positiveNumber(row.values.smart_reference_days)
      ?? referenceDurationDaysOf(row)
      ?? 1,
  ))
  const masterControlReferenceFloorDays = Math.max(
    positiveNumber(selectedDurationAuthority?.calculation.masterControlReferenceFloorDays) ?? 0,
    positiveNumber(options.masterControlReferenceFloorDays) ?? 0,
  ) || null
  const p50 = Math.max(rawP50, Math.round(masterControlReferenceFloorDays ?? 1))
  const existingP20 = positiveNumber(suggestion.riskP20DurationDays)
  const existingP80 = positiveNumber(suggestion.riskP80DurationDays)
  const p20 = isMilestone
    ? 1
    : Math.min(p50, Math.max(Math.ceil(p50 * 0.65), Math.round(existingP20 ?? p50 * 0.85)))
  const p80 = isMilestone
    ? 1
    : Math.max(Math.ceil(p50 * 1.1), Math.round(existingP80 ?? p50 * 1.15))
  const ownDurationAssetMapping = record(
    metadata.durationAssetMapping
      ?? row.values.duration_asset_mapping,
  )
  const ownDurationAssetCalculation = record(
    metadata.durationAssetCalculation
      ?? row.values.duration_asset_calculation,
  )
  const selectedMapping = selectedDurationAuthority?.mapping ?? ownDurationAssetMapping
  const selectedCalculation = selectedDurationAuthority?.calculation ?? ownDurationAssetCalculation
  const ownSeedStableCode = durationAssetSeedStableCode(ownDurationAssetMapping, ownDurationAssetCalculation)
  const selectedSeedStableCode = durationAssetSeedStableCode(selectedMapping, selectedCalculation)
  const semanticRemapApplied = Boolean(
    selectedDurationAuthority
      && (selectedDurationAuthority.sourceClientRowId !== row.clientRowId || ownSeedStableCode !== selectedSeedStableCode),
  )
  const durationAssetMapping: Record<string, unknown> = Object.keys(selectedMapping).length > 0
    ? {
        ...selectedMapping,
        ...(semanticRemapApplied
          ? {
              semanticRemapForExecutableDetail: true,
              semanticRemapFromStableCode: selectedDurationAuthority?.sourceStableCode,
              executableDetailStableCode: stableCodeOf(row),
              inheritancePolicy: 'construction_semantic_duration_asset_match',
            }
          : {}),
      }
    : {}
  const durationAssetCalculation: Record<string, unknown> = Object.keys(selectedCalculation).length > 0
    ? {
        ...selectedCalculation,
        ...(masterControlReferenceFloorDays
          ? {
              masterControlReferenceFloorDays,
              selectedDurationDays: p50,
            }
          : {}),
        ...(semanticRemapApplied
          ? {
              selectedDurationDays: p50,
              semanticRemapForExecutableDetail: true,
              semanticRemapFromStableCode: selectedDurationAuthority?.sourceStableCode,
              executableDetailStableCode: stableCodeOf(row),
              inheritancePolicy: 'construction_semantic_duration_asset_match',
            }
          : {}),
      }
    : {}
  const runtimeCalibrationApplied = truthy(
    durationAssetCalculation.runtimeReferenceDaysConsumed
      ?? durationAssetCalculation.runtime_reference_days_consumed,
  )
  const t2RhythmApplicability = text(
    durationAssetCalculation.t2RhythmApplicability
      ?? durationAssetCalculation.t2_rhythm_applicability
      ?? durationAssetMapping.t2RhythmApplicability
      ?? durationAssetMapping.t2_rhythm_applicability,
  ) || 'required_repetitive_or_workface_activity'
  const usesT2Rhythm = t2RhythmApplicability !== 'not_applicable_one_off_activity'
  const rowDurationSource = usesT2Rhythm
    ? SYSTEM_STANDARD_DURATION_SOURCE
    : STANDARD_SEED_ONLY_DURATION_SOURCE
  const calendarRef = text(metadata.constructionCalendarRef ?? row.values.construction_calendar_ref)
  const calendarVersion = text(metadata.constructionCalendarVersion ?? row.values.construction_calendar_version)
  const calendarTimezone = text(metadata.constructionCalendarTimezone ?? row.values.construction_calendar_timezone) || 'Asia/Shanghai'
  const calendarAvailable = text(metadata.constructionCalendarAvailability ?? row.values.construction_calendar_availability) === 'available'
    && Boolean(calendarRef && calendarVersion)
  const constructionCalendar: ConstructionCalendarContext = calendarAvailable
    ? {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef,
        calendarVersion,
        timezone: calendarTimezone,
        availability: 'available',
        unavailableReason: null,
      }
    : {
        basis: 'calendar_day',
        windows: [],
        calendarRef: calendarRef || null,
        calendarVersion: calendarVersion || null,
        timezone: calendarTimezone,
        availability: 'unavailable',
        unavailableReason: 'construction_calendar_identity_missing',
      }
  const riskAsOf = text(row.values.planned_start_date ?? row.values.start_date)
  const riskTimestamp = /^\d{4}-\d{2}-\d{2}$/.test(riskAsOf) ? `${riskAsOf}T00:00:00.000Z` : null
  const generatedAt = new Date().toISOString()
  const durationRiskDistribution = buildConstructionProductionDayRiskDistribution({
    p20,
    p50,
    p80,
    source: rowDurationSource,
    scope: 'system',
    sampleCount: null,
    generatedAt,
    sourceAsOf: riskTimestamp,
    calendar: constructionCalendar,
    provenanceAvailability: riskTimestamp ? 'available' : 'unavailable',
    unavailableReason: riskTimestamp ? null : 'duration_risk_source_as_of_invalid',
  })
  const nextSuggestion = {
    ...suggestion,
    recommendedDurationDays: Math.max(
      p50,
      Math.round(positiveNumber(suggestion.recommendedDurationDays) ?? p50),
    ),
    conservativeDurationDays: isMilestone
      ? 1
      : Math.max(
          p80,
          Math.round(positiveNumber(suggestion.conservativeDurationDays) ?? p80),
        ),
    riskP20DurationDays: p20,
    riskP50DurationDays: p50,
    riskP80DurationDays: p80,
    durationRiskDistribution,
    durationRiskRange: {
      ...record(suggestion.durationRiskRange),
      source: rowDurationSource,
      evidenceLevel: 'system_standard_asset_l1',
      p20Days: p20,
      p50Days: p50,
      p80Days: p80,
      uncertaintyBandDays: p80 - p20,
      mutationBoundary: 'calculation_only_no_business_fact_write',
      durationRiskDistribution,
    },
    confidenceLevel: 'high',
    confidenceScore: Math.max(0.82, Number(suggestion.confidenceScore) || 0),
    forecastSource: runtimeCalibrationApplied
      ? `${rowDurationSource}+optional_runtime_calibration_overlay`
      : rowDurationSource,
    durationCalibrationSource: rowDurationSource,
    durationProvenance: 'system_standard_asset_backed',
    businessReason: '首版总控计划工期由系统标准工期、T2 节奏、项目规模和施工日历共同计算；真实项目样本仅作为可选校准。',
    businessReasonCode: 'SYSTEM_STANDARD_EXECUTABLE_DEFAULT_MASTER_PLAN',
    businessReasonCodes: ['SYSTEM_STANDARD_EXECUTABLE_DEFAULT_MASTER_PLAN'],
    businessReasonParams: {
      ...record(suggestion.businessReasonParams),
      initialPlanAuthority: 'system_standard_seed',
      durationEvidenceStatus: 'executable_default_master_plan',
      calibrationPolicy: 'optional_runtime_overlay',
      runtimeCalibrationApplied,
    },
    displaySummary: `总控计划参考 ${p50} 天`,
    dataMaturity: text(suggestion.dataMaturity) || 'L1',
    dataMaturityReasons: unique([
      ...array(suggestion.dataMaturityReasons).map(text),
      usesT2Rhythm
        ? 'system standard duration and T2 rhythm assets are complete for initial master-plan generation'
        : 'system standard duration seed and schedule rules cover this one-off control activity',
      runtimeCalibrationApplied ? 'optional runtime calibration overlay applied' : 'runtime calibration is optional and not required',
    ]),
    dataUpgradePath: ['optional_runtime_calibration'],
    dataUpgradeBlockedBy: array(suggestion.dataUpgradeBlockedBy)
      .map(text)
      .filter((code) => code !== 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'),
    factorAvailability: {
      ...record(suggestion.factorAvailability),
      standard_work_duration_seed: true,
      t2_division_rhythm_template_seed: usesT2Rhythm,
      system_schedule_rules: true,
      external_real_plan_evidence: false,
      accepted_project_duration_samples: runtimeCalibrationApplied,
    },
    planDurationTruthSource: SYSTEM_STANDARD_DURATION_TRUTH_SOURCE,
    planReferenceDays: p50,
  }
  const category = text(row.values.category_type ?? row.values.wbs_node_type) || 'item_work'
  const materializeDepth = category === 'process' || category === 'activity_step' ? category : 'item_work'
  const nextMetadata = {
    ...metadata,
    rowProjectionMode: 'schedule_row',
    scheduleParticipation: 'primary_schedule',
    generationDepthPolicy: {
      policyId: 'executable_default_master_plan_managed_frontier_v1',
      materializeDepth,
      durationComputeDepth: materializeDepth,
      confidence: 'high',
      drillDownAvailable: true,
      governance: {
        curationStatus: 'seeded',
        mutationBoundary: 'assembly_only_no_db_write',
      },
    },
    durationEvidence: {
      ...record(metadata.durationEvidence),
      source: 'system_standard_default_master_plan',
      calibrationSource: rowDurationSource,
      maturity: text(suggestion.dataMaturity) || 'L1',
      reviewGate: null,
      calibrationPolicy: 'optional_runtime_overlay',
    },
    durationAssetMapping,
    durationAssetCalculation,
    executableDefaultMasterPlan: {
      source: 'executable_default_master_plan_assembly',
      version: 'v1.4.23.1-executable-assembly-v1',
      status: 'executable_default_master_plan',
      assetAuthority: 'system_standard_seed',
      calibrationPolicy: 'optional_runtime_overlay',
      commitPolicy: 'wizard_commit_transactional_tasks_and_dependencies',
    },
  }
  const calendarBasis = text(metadata.calendarBasis ?? row.values.calendar_basis)
  const planStartDate = dateTextOf(row, 'start')
  const systemStandardPlanEndDate = calendarBasis === 'calendar_day' && planStartDate
    ? shiftDate(planStartDate, p50 - 1)
    : null

  row.durationSuggestion = nextSuggestion
  row.values = {
    ...row.values,
    ...(systemStandardPlanEndDate
      ? {
          planned_end_date: systemStandardPlanEndDate,
          end_date: systemStandardPlanEndDate,
        }
      : {}),
    duration_suggestion: nextSuggestion,
    smart_reference_days: p50,
    duration_calibration_source: rowDurationSource,
    duration_provenance: 'system_standard_asset_backed',
    duration_evidence_source: 'system_standard_default_master_plan',
    duration_review_required: false,
    duration_review_gate: null,
    duration_truth_source: SYSTEM_STANDARD_DURATION_TRUTH_SOURCE,
    duration_asset_mapping: durationAssetMapping,
    duration_asset_calculation: durationAssetCalculation,
    duration_authority: 'system_standard_seed',
    runtime_calibration_policy: 'optional_runtime_overlay',
    default_master_plan_status: 'executable_default_master_plan',
    standard_task_metadata: nextMetadata,
  }
}

function attachMasterControlDrilldownLineage(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const metadata = metadataOf(row)
  row.values = {
    ...row.values,
    standard_task_metadata: {
      ...metadata,
      drilldownGenerationLineage: {
        ...record(metadata.drilldownGenerationLineage ?? metadata.drilldown_generation_lineage),
        level: 'master_control',
        templateId: row.values.source_template_id ?? row.values.template_id ?? null,
        templateNodeId: row.values.source_template_node_id ?? row.values.template_node_id ?? null,
        generationBatchId: row.values.generation_batch_id ?? null,
        source: 'executable_default_master_plan_assembly',
        mutationBoundary: 'generated_row_metadata_only',
      },
    },
  }
}

function masterControlScopeLabel(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  businessType: string,
) {
  const laneRole = organizationLaneRoleOf(row)
  const sequenceNumber = laneRole === 'primary_building_lane'
    ? buildingSequenceNumberOf(row)
    : organizationLaneSequenceNumberOf(row)
  if (!sequenceNumber) return ''
  const organizationLane = organizationLaneOf(row)
  if (laneRole === 'renovation_zone_lane' || businessType === 'renovation' || organizationLane.startsWith('renovation_zone_lane')) {
    return `改造分区${Math.round(sequenceNumber)}`
  }
  if (laneRole === 'functional_zone_lane') {
    const labelByBusinessType: Record<string, string> = {
      hospital: '医疗功能分区',
      school: '校园功能分区',
      industrial: '生产功能分区',
      data_center: '机房功能分区',
      transportation_hub: '枢纽功能分区',
      sports_culture: '场馆功能分区',
    }
    return `${labelByBusinessType[businessType] ?? '功能分区'}${Math.round(sequenceNumber)}`
  }
  if (laneRole === 'factory_site_lane') return `模块施工分区${Math.round(sequenceNumber)}`
  return `${Math.round(sequenceNumber)}#楼`
}

function promoteRow(row: ExecutableDefaultMasterPlanAssemblyRow, businessType: string) {
  const metadata = metadataOf(row)
  const previousVisibilityDecision = record(
    metadata.masterPlanVisibilityDecision ?? metadata.master_plan_visibility_decision,
  )
  const organizationLane = organizationLaneOf(row)
  const currentExecutionLane = text(row.values.execution_lane ?? row.executionLane)
  const promotedExecutionLane = organizationLane && organizationLane !== 'shared_works'
    ? unique([currentExecutionLane, organizationLane]).join(':')
    : currentExecutionLane
  const currentTitle = titleOf(row)
  const buildingLabel = masterControlScopeLabel(row, businessType)
  const promotedTitle = buildingLabel && !currentTitle.includes(buildingLabel)
    ? `${currentTitle}（${buildingLabel}）`
    : currentTitle
  const linkedProjectionSource = {
    ...record(row.linkedProjectionSource ?? row.values.linked_projection_source),
    promotedToExecutableDefaultMasterPlan: true,
    promotedBy: 'executable_default_master_plan_assembly',
  }
  row.rowProjectionMode = 'schedule_row'
  row.scheduleParticipation = 'primary_schedule'
  row.executionLane = promotedExecutionLane
  row.linkedProjectionSource = linkedProjectionSource
  row.values = {
    ...row.values,
    title: promotedTitle,
    name: row.values.name ? promotedTitle : row.values.name,
    execution_lane: promotedExecutionLane,
    row_projection_mode: 'schedule_row',
    schedule_participation: 'primary_schedule',
    linked_projection_source: linkedProjectionSource,
    master_plan_visibility_class: 'primary_control',
    master_plan_visibility_policy_stable_code: 'executable-default-master-plan-promotion',
    source_type: businessType === 'general_civil'
      ? 'asset_backed_default_master_plan'
      : 'managed_frontier_default_master_plan',
    standard_task_metadata: {
      ...metadata,
      rowProjectionMode: 'schedule_row',
      scheduleParticipation: 'primary_schedule',
      masterPlanVisibilityDecision: {
        ...previousVisibilityDecision,
        visibilityClass: 'primary_control',
        visibleOnMasterPlan: true,
        policyStableCode: 'executable-default-master-plan-promotion',
        reasons: unique([
          ...array(previousVisibilityDecision.reasons).map(text),
          'promoted_by_executable_default_master_plan_assembly',
        ]),
        promotion: {
          originalVisibilityClass: text(previousVisibilityDecision.visibilityClass) || null,
          originalVisibleOnMasterPlan: previousVisibilityDecision.visibleOnMasterPlan === true,
          source: 'executable_default_master_plan_assembly',
          mutationBoundary: 'assembly_only_no_db_write',
        },
      },
      masterPlanProjectionPolicy: {
        ...record(metadata.masterPlanProjectionPolicy),
        promotedToExecutableDefaultMasterPlan: true,
        promotedBy: 'executable_default_master_plan_assembly',
      },
    },
  }
}

function dateTextOf(row: ExecutableDefaultMasterPlanAssemblyRow, key: 'start' | 'end') {
  const value = key === 'start'
    ? row.values.planned_start_date ?? row.values.start_date
    : row.values.planned_end_date ?? row.values.end_date
  const normalized = text(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function shiftDate(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function alignPromotedRowsToPhaseAnchors(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
  initialScheduleRowIds: Set<string>,
) {
  const phaseStartByCode = new Map<string, string>()
  for (const row of rows) {
    if (!initialScheduleRowIds.has(row.clientRowId)) continue
    const phase = executionPhaseOf(row)
    const start = dateTextOf(row, 'start')
    if (!phase || !start) continue
    const current = phaseStartByCode.get(phase)
    if (!current || start < current) phaseStartByCode.set(phase, start)
  }
  for (const row of rows) {
    if (!selectedIds.has(row.clientRowId) || initialScheduleRowIds.has(row.clientRowId)) continue
    const phaseAnchor = phaseStartByCode.get(executionPhaseOf(row))
    const start = dateTextOf(row, 'start')
    const end = dateTextOf(row, 'end')
    if (!phaseAnchor || !start || !end || start >= phaseAnchor) continue
    const shiftDays = Math.max(0, signedDurationDayDelta(start, phaseAnchor) ?? 0)
    const shiftedEnd = shiftDate(end, shiftDays)
    row.values = {
      ...row.values,
      planned_start_date: phaseAnchor,
      start_date: phaseAnchor,
      planned_end_date: shiftedEnd,
      end_date: shiftedEnd,
      executable_master_plan_phase_anchor_applied: true,
    }
  }
}

export function resolveExecutableDefaultMasterPlanMinimum(params: {
  recommendedMinimum: number
  maximum: number
  operationalFloor: number
  availableScheduleRowCount?: number
}) {
  const configuredTarget = Math.max(1, Math.min(
    Math.max(1, Math.floor(params.maximum)),
    Math.max(
      Math.max(1, Math.floor(params.operationalFloor)),
      Math.max(1, Math.floor(params.recommendedMinimum)),
    ),
  ))
  if (!Number.isFinite(Number(params.availableScheduleRowCount))) return configuredTarget
  const operationalFloor = Math.max(1, Math.min(
    Math.max(1, Math.floor(params.maximum)),
    Math.max(1, Math.floor(params.operationalFloor)),
  ))
  return Math.max(0, Math.floor(Number(params.availableScheduleRowCount))) >= configuredTarget
    ? configuredTarget
    : operationalFloor
}

export function evaluateExecutableDefaultMasterPlanRowVolumeReadiness(params: {
  availableScheduleRowCount: number
  scheduleRowCount: number
  minimumScheduleRowCount: number
  maximumScheduleRowCount: number
  operationalRowFloor: number
}) {
  const minimum = Math.max(1, Math.floor(params.minimumScheduleRowCount))
  const maximum = Math.max(minimum, Math.floor(params.maximumScheduleRowCount))
  const operationalFloor = Math.min(maximum, Math.max(1, Math.floor(params.operationalRowFloor)))
  const availableScheduleRowCount = Math.max(0, Math.floor(params.availableScheduleRowCount))
  const scheduleRowCount = Math.max(0, Math.floor(params.scheduleRowCount))
  const assetInventoryExhausted = availableScheduleRowCount < operationalFloor
  const assetInventoryShortfallRowCount = Math.max(0, operationalFloor - availableScheduleRowCount)
  const assetInventoryShortfallAccepted = assetInventoryExhausted
    && availableScheduleRowCount > 0
    && assetInventoryShortfallRowCount === 1
    && scheduleRowCount === availableScheduleRowCount
  const reasonCodes = unique([
    ...(assetInventoryExhausted && !assetInventoryShortfallAccepted
      ? ['master_plan_asset_inventory_below_required_minimum']
      : []),
    ...(scheduleRowCount < operationalFloor && !assetInventoryShortfallAccepted
      ? ['master_plan_schedule_below_operational_floor']
      : []),
    ...(scheduleRowCount < minimum && availableScheduleRowCount >= minimum
      ? ['master_plan_schedule_below_configured_minimum']
      : []),
    ...(scheduleRowCount > maximum ? ['master_plan_schedule_above_configured_maximum'] : []),
  ])
  return {
    reasonCodes,
    assetInventoryExhausted,
    assetInventoryShortfallRowCount,
    assetInventoryShortfallAccepted,
    operationalFloor,
  }
}

const EXECUTION_SEMANTIC_SIGNALS = [
  /桩|pile/i,
  /基坑|支护|降水|土方|foundation|earthwork|retaining/i,
  /地下|底板|basement/i,
  /主体|结构|混凝土|钢结构|structure|concrete|steel/i,
  /砌体|二次结构|masonry|secondary/i,
  /机电|给排水|消防|通风|电气|带电|带水|mep|plumbing|hvac|electrical/i,
  /屋面|外立面|幕墙|门窗|防水|roof|facade|envelope|waterproof/i,
  /电梯|垂直运输|elevator|vertical/i,
  /装修|装饰|精装|洁净|手术|fitout|finish|cleanroom/i,
  /室外|道路|景观|管网|outdoor|landscape|utility/i,
  /调试|联调|commissioning|testing/i,
  /验收|移交|竣工|acceptance|handover/i,
  /UPS|电池|柴油发电|供配电|变配电|ATS|power|generator|battery/i,
  /制冷|冷却|冷冻水|精密空调|cooling|chilled|precision.air/i,
  /工艺|动力|PLC|生产线|防爆|环保|process|production.line/i,
  /旅客|闸机|安检|导向|站台|运营指挥|passenger|security|platform|operation/i,
  /场馆|看台|运动面层|声光电|赛事|演出|arena|venue|event|acoustic/i,
  /消防|防排烟|疏散|fire|smoke|evacuation/i,
]

function semanticSignalIndexes(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const haystack = `${titleOf(row)} ${stableCodeOf(row)} ${text(row.values.execution_lane ?? row.executionLane)}`
  return EXECUTION_SEMANTIC_SIGNALS
    .map((pattern, index) => pattern.test(haystack) ? index : -1)
    .filter((index) => index >= 0)
}

const GOVERNED_SPECIALTY_PARENT_ANCHOR_RULES = [
  { childStableCode: /^MIC-06-01-02$/i, parentStableCode: 'BTMP-MOD-01' },
  { childStableCode: /^MIC-02-/i, parentStableCode: 'BTMP-MOD-02' },
  { childStableCode: /^MIC-(?:03|04)-/i, parentStableCode: 'BTMP-MOD-04' },
  { childStableCode: /^MIC-05-/i, parentStableCode: 'BTMP-MOD-05' },
  { childStableCode: /^MIC-06-01-18$/i, parentStableCode: 'BTMP-MOD-06' },
  { childStableCode: /^MIC-06-01-20$/i, parentStableCode: 'BTMP-MOD-09' },
] as const

function governedSpecialtyParentAnchorStableCode(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const stableCode = stableCodeOf(row)
  return GOVERNED_SPECIALTY_PARENT_ANCHOR_RULES.find((rule) => rule.childStableCode.test(stableCode))
    ?.parentStableCode ?? null
}

function selectedPhysicalDependencyEvidence(releasePolicy: string) {
  return {
    source: 'construction_task_dependency_constraint_rule_system',
    evidenceLevel: 'system_standard_dependency_l1',
    productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
    mutationBoundary: 'preview_no_write_wizard_commit_transactional',
    createsProductionTaskDependency: true,
    releasePolicy,
  }
}

function appendPhysicalHandoffDependency(params: {
  predecessor: ExecutableDefaultMasterPlanAssemblyRow
  successor: ExecutableDefaultMasterPlanAssemblyRow
  intentCode: 'executable_default_master_plan_physical_handoff'
    | 'executable_default_master_plan_physical_handoff_convergence'
    | 'executable_default_master_plan_logical_anchor_workface'
  preserveSuccessorStart?: boolean
}) {
  const predecessorStartDay = dateDayNumber(dateTextOf(params.predecessor, 'start'))
  const predecessorEndDay = dateDayNumber(dateTextOf(params.predecessor, 'end'))
  const successorStartDay = dateDayNumber(dateTextOf(params.successor, 'start'))
  const successorEndDay = dateDayNumber(dateTextOf(params.successor, 'end'))
  const logicalAnchorNeedsFinishAlignment = params.intentCode === 'executable_default_master_plan_logical_anchor_workface'
    && predecessorEndDay !== null
    && successorEndDay !== null
    && predecessorEndDay > successorEndDay
  const canFinishStart = predecessorEndDay !== null
    && successorStartDay !== null
    && predecessorEndDay < successorStartDay
  const dependencyType = logicalAnchorNeedsFinishAlignment
    ? 'FF'
    : canFinishStart
      ? 'FS'
      : 'SS'
  const lagDays = dependencyType === 'SS'
    && params.preserveSuccessorStart
    && predecessorStartDay !== null
    && successorStartDay !== null
    ? Math.max(0, successorStartDay - predecessorStartDay)
    : 0
  return appendExecutableDependency(params.successor, {
    clientRowId: params.predecessor.clientRowId,
    dependencyType,
    lagDays,
    intentCode: params.intentCode,
    source: 'dependency_intent_template',
    dependencyRuleEvidence: selectedPhysicalDependencyEvidence(
      params.intentCode === 'executable_default_master_plan_physical_handoff'
        ? 'completed_physical_system_or_workface_releases_downstream_control_activity'
        : params.intentCode === 'executable_default_master_plan_logical_anchor_workface'
          ? 'flat_promoted_master_control_follows_its_governed_logical_workface_without_task_parenting'
          : 'promoted_execution_stream_converges_into_next_business_type_control_gate',
    ),
  })
}

const SYNTHETIC_PROJECT_START_RELEASE_INTENT_PATTERN = /^executable_default_master_plan_(?:component_release|primary_control_spine|startup_release|phase_release)/i

function hasSelectedPhysicalHandoffPath(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  rowById: Map<string, ExecutableDefaultMasterPlanAssemblyRow>,
  selectedIds: Set<string>,
) {
  const queue = [...(row.predecessorDependencies ?? [])]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const dependency = queue.shift()!
    if (SYNTHETIC_PROJECT_START_RELEASE_INTENT_PATTERN.test(text(dependency.intentCode))) continue
    const predecessorId = text(dependency.clientRowId)
    if (!predecessorId || seen.has(predecessorId) || !selectedIds.has(predecessorId)) continue
    seen.add(predecessorId)
    const predecessor = rowById.get(predecessorId)
    if (!predecessor) continue
    const predecessorRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(predecessor)]
    if (predecessorRank !== undefined
      && predecessorRank > EXECUTION_PHASE_SEQUENCE.startup_site_setup
      && predecessorRank < EXECUTION_PHASE_SEQUENCE.commissioning
      && planItemKindOf(predecessor) === 'work_task'
      && durationModeOf(predecessor) !== 'record_only') return true
    queue.push(...(predecessor.predecessorDependencies ?? []))
  }
  return false
}

function attachUnanchoredRowsToPhysicalControls(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
  initialScheduleRowIds: Set<string>,
) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const initialControls = rows.filter((row) => (
    selectedIds.has(row.clientRowId)
    && initialScheduleRowIds.has(row.clientRowId)
    && planItemKindOf(row) === 'work_task'
  ))
  let attachedDependencyCount = 0

  for (const row of rows) {
    if (!selectedIds.has(row.clientRowId)) continue
    if (planItemKindOf(row) !== 'work_task') continue
    if (hasSelectedPhysicalHandoffPath(row, rowById, selectedIds)) continue
    const rowRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(row)]
    const rowStartDay = dateDayNumber(dateTextOf(row, 'start'))
    if (rowRank === undefined || rowRank <= EXECUTION_PHASE_SEQUENCE.startup_site_setup || rowStartDay === null) continue

    const rowSignals = new Set(semanticSignalIndexes(row))
    const candidates = initialControls
      .filter((candidate) => candidate.clientRowId !== row.clientRowId)
      .filter((candidate) => {
        const candidateRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(candidate)]
        const candidateStartDay = dateDayNumber(dateTextOf(candidate, 'start'))
        if (candidateRank === undefined || candidateRank >= rowRank || candidateStartDay === null) return false
        if (candidateStartDay > rowStartDay) return false
        if (isHierarchyAncestor(rowById, candidate.clientRowId, row.clientRowId)) return false
        return !hasSchedulePropagationPath(
          rows.filter((selectedRow) => selectedIds.has(selectedRow.clientRowId)),
          row.clientRowId,
          candidate.clientRowId,
        )
      })
      .map((candidate) => {
        const candidateSignals = semanticSignalIndexes(candidate)
        const sharedSignalCount = candidateSignals.filter((signal) => rowSignals.has(signal)).length
        const candidateRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(candidate)] ?? 0
        const candidateEndDay = dateDayNumber(dateTextOf(candidate, 'end')) ?? Number.NEGATIVE_INFINITY
        return {
          candidate,
          sharedSignalCount,
          phaseDistance: rowRank - candidateRank,
          completedBeforeStart: candidateEndDay < rowStartDay,
          dateDistance: Math.abs(rowStartDay - candidateEndDay),
        }
      })
    if (candidates.length === 0) continue

    const nonStartupCandidates = candidates.filter((candidate) => (
      (EXECUTION_PHASE_SEQUENCE[executionPhaseOf(candidate.candidate)] ?? 0)
        > EXECUTION_PHASE_SEQUENCE.startup_site_setup
    ))
    const physicalCandidates = nonStartupCandidates.length > 0
      ? nonStartupCandidates
      : candidates
    const semanticAnchor = [...physicalCandidates]
      .filter((candidate) => candidate.sharedSignalCount > 0)
      .sort((left, right) => (
        right.sharedSignalCount - left.sharedSignalCount
        || Number(right.completedBeforeStart) - Number(left.completedBeforeStart)
        || left.phaseDistance - right.phaseDistance
        || left.dateDistance - right.dateDistance
      ))[0]?.candidate
    const releaseAnchor = [...physicalCandidates]
      .sort((left, right) => (
        left.phaseDistance - right.phaseDistance
        || Number(right.completedBeforeStart) - Number(left.completedBeforeStart)
        || left.dateDistance - right.dateDistance
        || Number(isBusinessTypeSpecialtyProfileRow(right.candidate)) - Number(isBusinessTypeSpecialtyProfileRow(left.candidate))
      ))[0]?.candidate
    const anchors = unique([semanticAnchor?.clientRowId ?? '', releaseAnchor?.clientRowId ?? ''])
      .map((clientRowId) => rowById.get(clientRowId))
      .filter((anchor): anchor is ExecutableDefaultMasterPlanAssemblyRow => Boolean(anchor))
      .slice(0, 2)
    for (const anchor of anchors) {
      if (appendPhysicalHandoffDependency({
        predecessor: anchor,
        successor: row,
        intentCode: 'executable_default_master_plan_physical_handoff',
        preserveSuccessorStart: true,
      })) attachedDependencyCount += 1
    }
  }
  return attachedDependencyCount
}

const CONTRACTUAL_COMPLETION_FILING_TITLE = /竣工验收备案完成/i
const CONTRACTUAL_PROPERTY_HANDOVER_TITLE = /移交(?:与)?保修启动/i

function contractualCloseoutRoleOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const businessTypeMasterPlan = record(metadataOf(row).businessTypeMasterPlan)
  return text(
    row.values.contractual_closeout_role
      ?? businessTypeMasterPlan.contractualCloseoutRole,
  )
}

function contractualTerminalControlCodeOf(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const businessTypeMasterPlan = record(metadataOf(row).businessTypeMasterPlan)
  return text(
    row.values.contractual_terminal_control_code
      ?? businessTypeMasterPlan.contractualTerminalControlCode,
  )
}

function replaceCloseoutDependency(
  successor: ExecutableDefaultMasterPlanAssemblyRow,
  predecessor: ExecutableDefaultMasterPlanAssemblyRow,
) {
  successor.predecessorDependencies = [{
    clientRowId: predecessor.clientRowId,
    dependencyType: 'FS',
    lagDays: 0,
    intentCode: 'business_type_master_plan_contractual_closeout',
    source: 'dependency_intent_template',
    dependencyRuleEvidence: selectedPhysicalDependencyEvidence(
      'business_type_acceptance_to_contractual_filing_and_property_handover',
    ),
  }]
  successor.predecessorClientRowIds = [predecessor.clientRowId]
}

function connectContractualCloseoutMilestones(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
  initialScheduleRowIds: Set<string>,
) {
  const selectedRows = rows.filter((row) => selectedIds.has(row.clientRowId))
  const completionFiling = selectedRows.find((row) => (
    planItemKindOf(row) === 'milestone' && contractualCloseoutRoleOf(row) === 'completion_filing'
  )) ?? null
  const propertyHandover = selectedRows.find((row) => (
    planItemKindOf(row) === 'milestone' && contractualCloseoutRoleOf(row) === 'property_handover'
  )) ?? null
  if (!completionFiling) return 0
  const declaredTerminalControlCode = contractualTerminalControlCodeOf(completionFiling)
  const terminalControl = selectedRows
    .filter((row) => initialScheduleRowIds.has(row.clientRowId))
    .filter((row) => planItemKindOf(row) === 'work_task')
    .find((row) => stableCodeOf(row) === declaredTerminalControlCode) ?? null
  if (!terminalControl) return 0
  if (completionFiling) replaceCloseoutDependency(completionFiling, terminalControl)
  if (propertyHandover) replaceCloseoutDependency(propertyHandover, completionFiling ?? terminalControl)
  return Number(Boolean(completionFiling)) + Number(Boolean(propertyHandover))
}

function applyGovernedBusinessTypeSpecialtySequence(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
  businessType: string,
) {
  if (businessType !== 'sports_culture') return 0
  const selectedRows = rows.filter((row) => selectedIds.has(row.clientRowId))
  const rowByCode = new Map(selectedRows.map((row) => [stableCodeOf(row), row]))
  const commissioning = rowByCode.get('BTMP-SPC-05')
  const rehearsal = rowByCode.get('SPC-04-01-01')
  const operationalHandover = rowByCode.get('BTMP-SPC-06')
  if (!commissioning || !rehearsal || !operationalHandover) return 0

  commissioning.predecessorDependencies = (commissioning.predecessorDependencies ?? [])
    .filter((dependency) => text(dependency.clientRowId) !== rehearsal.clientRowId)
  commissioning.predecessorClientRowIds = unique(
    commissioning.predecessorDependencies.map((dependency) => text(dependency.clientRowId)),
  )

  let appliedCount = 0
  if (appendExecutableDependency(rehearsal, {
    clientRowId: commissioning.clientRowId,
    dependencyType: 'FS',
    lagDays: 0,
    intentCode: 'business_type_venue_commissioning_to_full_rehearsal',
    source: 'dependency_intent_template',
    dependencyRuleEvidence: selectedPhysicalDependencyEvidence(
      'venue_system_commissioning_completes_before_event_or_performance_full_rehearsal',
    ),
  })) appliedCount += 1
  if (appendExecutableDependency(operationalHandover, {
    clientRowId: rehearsal.clientRowId,
    dependencyType: 'FS',
    lagDays: 0,
    intentCode: 'business_type_venue_rehearsal_to_operational_handover',
    source: 'dependency_intent_template',
    dependencyRuleEvidence: selectedPhysicalDependencyEvidence(
      'venue_full_rehearsal_completes_before_function_acceptance_and_operational_handover',
    ),
  })) appliedCount += 1
  return appliedCount
}

function convergePhysicalCompletionFrontierIntoContractualFiling(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
) {
  const selectedRows = rows.filter((row) => selectedIds.has(row.clientRowId))
  const rowById = new Map(selectedRows.map((row) => [row.clientRowId, row]))
  const completionFiling = selectedRows.find((row) => (
    planItemKindOf(row) === 'milestone'
    && contractualCloseoutRoleOf(row) === 'completion_filing'
  )) ?? null
  if (!completionFiling) return 0

  const isCompletionHandoff = (
    dependency: ExecutableDefaultMasterPlanAssemblyRow['predecessorDependencies'][number],
  ) => {
    const dependencyType = text(dependency.dependencyType).toUpperCase()
    const lagDays = Number.isFinite(Number(dependency.lagDays)) ? Number(dependency.lagDays) : 0
    return (dependencyType === 'FS' || dependencyType === 'FF') && lagDays >= 0
  }
  const completionConnectedIds = new Set<string>([completionFiling.clientRowId])
  const markCompletionAncestors = (row: ExecutableDefaultMasterPlanAssemblyRow) => {
    for (const dependency of row.predecessorDependencies ?? []) {
      if (!isCompletionHandoff(dependency)) continue
      const predecessor = rowById.get(text(dependency.clientRowId))
      if (!predecessor || completionConnectedIds.has(predecessor.clientRowId)) continue
      completionConnectedIds.add(predecessor.clientRowId)
      markCompletionAncestors(predecessor)
    }
  }
  markCompletionAncestors(completionFiling)

  const physicalRows = selectedRows.filter((row) => (
    planItemKindOf(row) === 'work_task'
    && durationModeOf(row) === 'duration_bearing'
    && !isRecordOnlyWbsSummaryRow(row)
  ))
  const unconnectedRows = physicalRows.filter((row) => !completionConnectedIds.has(row.clientRowId))
  const unconnectedIds = new Set(unconnectedRows.map((row) => row.clientRowId))
  const hasUnconnectedCompletionSuccessor = new Set<string>()
  for (const successor of unconnectedRows) {
    for (const dependency of successor.predecessorDependencies ?? []) {
      const predecessorId = text(dependency.clientRowId)
      if (unconnectedIds.has(predecessorId) && isCompletionHandoff(dependency)) {
        hasUnconnectedCompletionSuccessor.add(predecessorId)
      }
    }
  }
  const completionFrontier = unconnectedRows
    .filter((row) => !hasUnconnectedCompletionSuccessor.has(row.clientRowId))
  const frontierByPhase = new Map<string, ExecutableDefaultMasterPlanAssemblyRow[]>()
  for (const row of completionFrontier) {
    const phase = executionPhaseOf(row) || 'unclassified'
    frontierByPhase.set(phase, [...(frontierByPhase.get(phase) ?? []), row])
  }
  const phaseFrontierRows: ExecutableDefaultMasterPlanAssemblyRow[] = []
  for (const phaseRows of frontierByPhase.values()) {
    const orderedRows = [...phaseRows].sort((left, right) => (
      text(dateTextOf(left, 'end')).localeCompare(text(dateTextOf(right, 'end')))
      || compareRows(left, right)
    ))
    let previous = orderedRows[0] ?? null
    for (const current of orderedRows.slice(1)) {
      if (!previous) {
        previous = current
        continue
      }
      if (hasSchedulePropagationPath(selectedRows, current.clientRowId, previous.clientRowId)) {
        phaseFrontierRows.push(previous)
        previous = current
        continue
      }
      appendExecutableDependency(current, {
        clientRowId: previous.clientRowId,
        dependencyType: 'FF',
        lagDays: 0,
        intentCode: 'executable_default_master_plan_completion_phase_spine',
        source: 'dependency_intent_template',
        dependencyRuleEvidence: selectedPhysicalDependencyEvidence(
          'parallel_physical_completion_frontier_is_phase_aggregated_without_serializing_task_starts',
        ),
      })
      previous = current
    }
    if (previous) phaseFrontierRows.push(previous)
  }

  let attachedDependencyCount = 0
  for (const frontierRow of phaseFrontierRows) {
    if (appendExecutableDependency(completionFiling, {
      clientRowId: frontierRow.clientRowId,
      dependencyType: 'FS',
      lagDays: 0,
      intentCode: 'executable_default_master_plan_contractual_completion_convergence',
      source: 'dependency_intent_template',
      dependencyRuleEvidence: selectedPhysicalDependencyEvidence(
        'parallel_physical_completion_frontier_converges_at_contractual_completion_filing',
      ),
    })) attachedDependencyCount += 1
  }
  return attachedDependencyCount
}

function preservePromotedRowLogicalAnchorsWithoutTaskParenting(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
  initialScheduleRowIds: Set<string>,
  representativeIdByCandidateId: Map<string, string>,
) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const initialRowsByPhase = new Map<string, ExecutableDefaultMasterPlanAssemblyRow[]>()
  for (const row of rows) {
    if (!initialScheduleRowIds.has(row.clientRowId) || planItemKindOf(row) !== 'work_task') continue
    const phase = executionPhaseOf(row)
    if (!phase) continue
    const phaseRows = initialRowsByPhase.get(phase) ?? []
    phaseRows.push(row)
    initialRowsByPhase.set(phase, phaseRows)
  }

  for (const row of rows) {
    if (!selectedIds.has(row.clientRowId) || initialScheduleRowIds.has(row.clientRowId)) continue
    const mappedParentId = row.parentClientRowId
      ? representativeIdByCandidateId.get(row.parentClientRowId) ?? row.parentClientRowId
      : null
    const sourceHierarchyAnchor = mappedParentId
      && selectedIds.has(mappedParentId)
      && mappedParentId !== row.clientRowId
      ? rowById.get(mappedParentId) ?? null
      : null
    const anchors = initialRowsByPhase.get(executionPhaseOf(row)) ?? []
    const governedAnchorStableCode = governedSpecialtyParentAnchorStableCode(row)
    const governedAnchor = governedAnchorStableCode
      ? anchors.find((candidate) => stableCodeOf(candidate) === governedAnchorStableCode)
      : null
    const rowSignals = new Set(semanticSignalIndexes(row))
    const rowStart = dateTextOf(row, 'start') ?? ''
    const rowLane = text(row.values.execution_lane ?? row.executionLane)
    const phaseAnchor = governedAnchor ?? [...anchors]
      .map((candidate) => {
        const candidateSignals = semanticSignalIndexes(candidate)
        const sharedSignals = candidateSignals.filter((signal) => rowSignals.has(signal)).length
        const candidateStart = dateTextOf(candidate, 'start') ?? ''
        const candidateEnd = dateTextOf(candidate, 'end') ?? ''
        const dateOverlap = rowStart && candidateStart && candidateEnd
          && rowStart >= candidateStart && rowStart <= candidateEnd
        const laneMatch = rowLane && rowLane === text(candidate.values.execution_lane ?? candidate.executionLane)
        const startDistance = rowStart && candidateStart
          ? Math.abs(signedDurationDayDelta(candidateStart, rowStart) ?? 0)
          : 3650
        return {
          candidate,
          score: (sharedSignals * 100) + (dateOverlap ? 40 : 0) + (laneMatch ? 25 : 0) - Math.min(30, startDistance / 30),
        }
      })
      .sort((left, right) => right.score - left.score || left.candidate.sortOrder - right.candidate.sortOrder)[0]
      ?.candidate
    const anchor = sourceHierarchyAnchor ?? phaseAnchor ?? null
    row.parentClientRowId = null
    if (!anchor) continue
    const metadata = metadataOf(row)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        executableDefaultMasterPlanParentAnchor: {
          clientRowId: anchor.clientRowId,
          stableCode: stableCodeOf(anchor),
          title: titleOf(anchor),
          policy: sourceHierarchyAnchor
            ? 'source_hierarchy_logical_anchor_without_task_parenting'
            : governedAnchor
              ? 'governed_specialty_logical_anchor_without_task_parenting'
              : 'same_phase_semantic_logical_anchor_without_task_parenting',
          hierarchyPolicy: 'flat_executable_master_controls_with_dependency_and_drilldown_lineage',
        },
      },
    }
  }
}

function attachPromotedRowsToLogicalAnchorWorkfaces(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
  initialScheduleRowIds: Set<string>,
) {
  const selectedRows = rows.filter((row) => selectedIds.has(row.clientRowId))
  const rowById = new Map(selectedRows.map((row) => [row.clientRowId, row]))
  let attachedDependencyCount = 0

  for (const row of selectedRows) {
    if (initialScheduleRowIds.has(row.clientRowId) || planItemKindOf(row) !== 'work_task') continue
    const anchorMetadata = record(metadataOf(row).executableDefaultMasterPlanParentAnchor)
    const anchor = rowById.get(text(anchorMetadata.clientRowId))
    if (!anchor || anchor.clientRowId === row.clientRowId || planItemKindOf(anchor) !== 'work_task') continue
    if (hasSchedulePropagationPath(selectedRows, row.clientRowId, anchor.clientRowId)) continue
    if (appendPhysicalHandoffDependency({
      predecessor: anchor,
      successor: row,
      intentCode: 'executable_default_master_plan_logical_anchor_workface',
      preserveSuccessorStart: true,
    })) attachedDependencyCount += 1
  }
  return attachedDependencyCount
}

function normalizePromotedRowHierarchy(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
) {
  const selectedParentIds = new Set(
    rows
      .filter((row) => selectedIds.has(row.clientRowId))
      .map((row) => text(row.parentClientRowId))
      .filter(Boolean),
  )
  for (const row of rows) {
    if (!selectedIds.has(row.clientRowId)) continue
    const isSummary = selectedParentIds.has(row.clientRowId)
    const planItemKind = planItemKindOf(row)
    const durationContributionMode = durationModeOf(row)
    const isMilestone = planItemKind === 'milestone'
    const isExecutable = !isSummary
      && (planItemKind === 'work_task' || isMilestone)
    const metadata = metadataOf(row)
    const sourceWbsNodeType = text(row.values.wbs_node_type)
    const sourceCategoryType = text(row.values.category_type)
    const normalizedWbsNodeType = isSummary
      ? sourceWbsNodeType || sourceCategoryType || 'sub_division'
      : 'process'
    row.values = {
      ...row.values,
      wbs_node_type: normalizedWbsNodeType,
      category_type: normalizedWbsNodeType,
      plan_item_kind: planItemKind,
      duration_contribution_mode: durationContributionMode,
      duration_evidence_source: 'system_standard_default_master_plan',
      duration_evidence_maturity: text(row.values.duration_evidence_maturity) || 'L1',
      duration_review_required: false,
      duration_review_gate: null,
      is_wbs_summary: isSummary,
      is_executable: isExecutable,
      is_milestone: isMilestone,
      standard_task_metadata: {
        ...metadata,
        planItemKind,
        durationContributionMode,
        isWbsSummary: isSummary,
        isExecutable,
        isMilestone,
        masterPlanWbsSemanticRemap: {
          sourceWbsNodeType: sourceWbsNodeType || null,
          sourceCategoryType: sourceCategoryType || null,
          normalizedWbsNodeType,
          normalizedForPrimaryScheduleWrite: !isSummary,
          policy: 'flat_primary_schedule_rows_are_process_semantics_with_original_lineage_preserved',
        },
      },
    }
  }
}

function normalizePromotedDependenciesToVisibleSchedule(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
  initialScheduleRowIds: Set<string>,
  representativeIdByCandidateId: Map<string, string>,
) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const isGovernedCrossItemDependency = (dependency: { clientRowId: string; [key: string]: unknown }) => {
    const evidence = record(dependency.dependencyRuleEvidence)
    return text(dependency.intentCode).startsWith('cross-item:')
      || text(evidence.relationLayerKey) === 'cross_item_workflow'
      || (evidence.dependencyAssetConsumed === true && text(evidence.dependencyAssetType) === 'cross_item_workflow')
  }
  const resolveSelectedAncestors = (
    dependencyId: string,
    visited = new Set<string>(),
    hiddenPath: string[] = [],
    finishToStartPath = true,
  ): Array<{
    row: ExecutableDefaultMasterPlanAssemblyRow
    hiddenPath: string[]
    finishToStartPath: boolean
  }> => {
    const representativeId = representativeIdByCandidateId.get(dependencyId) ?? dependencyId
    if (selectedIds.has(representativeId)) {
      const selected = rowById.get(representativeId)
      return selected ? [{ row: selected, hiddenPath, finishToStartPath }] : []
    }
    if (visited.has(dependencyId)) return []
    const hidden = rowById.get(dependencyId)
    if (!hidden) return []
    const nextVisited = new Set(visited).add(dependencyId)
    return (hidden.predecessorDependencies ?? [])
      .filter(isGovernedCrossItemDependency)
      .flatMap((dependency) => {
      const dependencyType = text(dependency.dependencyType).toUpperCase() || 'FS'
      return resolveSelectedAncestors(
        text(dependency.clientRowId),
        nextVisited,
        [...hiddenPath, dependencyId],
        finishToStartPath && dependencyType === 'FS',
      )
      })
  }

  for (const row of rows) {
    if (!selectedIds.has(row.clientRowId) || initialScheduleRowIds.has(row.clientRowId)) continue
    const parentId = text(row.parentClientRowId)
    const mapVisibleDependencies = (dependency: { clientRowId: string; [key: string]: unknown }) => {
      const dependencyId = text(dependency.clientRowId)
      const representativeId = representativeIdByCandidateId.get(dependencyId) ?? dependencyId
      if (!representativeId
        || representativeId === row.clientRowId
        || representativeId === parentId) return []
      if (selectedIds.has(representativeId)) {
        return [{
          ...dependency,
          clientRowId: representativeId,
        }]
      }
      const hiddenPredecessor = rowById.get(dependencyId)
      if (!hiddenPredecessor || !isGovernedCrossItemDependency(dependency)) return []
      const directDependencyType = text(dependency.dependencyType).toUpperCase() || 'FS'
      const directLagDays = Number.isFinite(Number(dependency.lagDays))
        ? Math.round(Number(dependency.lagDays))
        : 0
      return resolveSelectedAncestors(dependencyId).flatMap((ancestor) => {
        if (ancestor.row.clientRowId === row.clientRowId || ancestor.row.clientRowId === parentId) return []
        const predecessorPhaseRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(ancestor.row)]
        const successorPhaseRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(row)]
        if (predecessorPhaseRank !== undefined
          && successorPhaseRank !== undefined
          && predecessorPhaseRank > successorPhaseRank) return []
        const preserveFinishToStart = directDependencyType === 'FS' && ancestor.finishToStartPath
        const ancestorEndDay = dateDayNumber(dateTextOf(ancestor.row, 'end'))
        const hiddenEndDay = dateDayNumber(dateTextOf(hiddenPredecessor, 'end'))
        const ancestorStartDay = dateDayNumber(dateTextOf(ancestor.row, 'start'))
        const rowStartDay = dateDayNumber(dateTextOf(row, 'start'))
        const bridgeLagDays = preserveFinishToStart
          ? ancestorEndDay !== null && hiddenEndDay !== null
            ? Math.max(0, hiddenEndDay + directLagDays - ancestorEndDay)
            : Math.max(0, directLagDays)
          : ancestorStartDay !== null && rowStartDay !== null
            ? Math.max(0, rowStartDay - ancestorStartDay)
            : 0
        const previousEvidence = record(dependency.dependencyRuleEvidence)
        return [{
          ...dependency,
          clientRowId: ancestor.row.clientRowId,
          dependencyType: preserveFinishToStart ? 'FS' : 'SS',
          lagDays: bridgeLagDays,
          intentCode: 'executable_default_master_plan_hidden_constraint_bridge',
          hiddenConstraintPath: ancestor.hiddenPath,
          inheritedIntentCode: text(dependency.intentCode) || null,
          dependencyRuleEvidence: {
            ...previousEvidence,
            source: 'executable_default_master_plan_hidden_constraint_bridge',
            evidenceLevel: 'system_standard_dependency_l1',
            productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
            mutationBoundary: 'preview_no_write_wizard_commit_transactional',
            createsProductionTaskDependency: true,
            hiddenConstraintPath: ancestor.hiddenPath,
            bridgeRelationPolicy: preserveFinishToStart
              ? 'preserve_finish_to_start_handoff_through_hidden_rows'
              : 'preserve_candidate_start_release_through_hidden_rows',
          },
        }]
      })
    }
    let visibleDependencies = (row.predecessorDependencies ?? [])
      .flatMap(mapVisibleDependencies)
    const dependenciesByKey = new Map<string, typeof visibleDependencies[number]>()
    for (const dependency of visibleDependencies) {
      const key = [
        dependency.clientRowId,
        text(dependency['dependencyType']),
        text(dependency['lagDays']),
        text(dependency['intentCode']),
      ].join('|')
      if (!dependenciesByKey.has(key)) dependenciesByKey.set(key, dependency)
    }
    row.predecessorDependencies = [...dependenciesByKey.values()]
    row.predecessorClientRowIds = unique(visibleDependencies.map((dependency) => text(dependency.clientRowId)))
  }
}

function applyPromotedSiblingReleaseRhythm(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
  initialScheduleRowIds: Set<string>,
) {
  let skippedCyclicDependencyCount = 0
  const groups = new Map<string, ExecutableDefaultMasterPlanAssemblyRow[]>()
  const parentIdByGroupKey = new Map<string, string>()
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  for (const row of rows) {
    if (!selectedIds.has(row.clientRowId) || initialScheduleRowIds.has(row.clientRowId)) continue
    if (durationModeOf(row) !== 'duration_bearing' || planItemKindOf(row) !== 'work_task') continue
    const parentId = text(row.parentClientRowId)
    if (!parentId) continue
    const key = [parentId, text(row.values.execution_lane ?? row.executionLane)].join('|')
    const siblings = groups.get(key) ?? []
    siblings.push(row)
    groups.set(key, siblings)
    parentIdByGroupKey.set(key, parentId)
  }

  for (const [groupKey, siblings] of groups.entries()) {
    siblings.sort((left, right) => left.sortOrder - right.sortOrder || compareRows(left, right))
    const parentStart = dateTextOf(rowById.get(parentIdByGroupKey.get(groupKey) ?? '') ?? siblings[0], 'start')
    const baseStart = parentStart ?? dateTextOf(siblings[0], 'start')
    let cumulativeReleaseLagDays = 0
    for (let index = 1; index < siblings.length; index += 1) {
      const current = siblings[index]
      const dependencies = current.predecessorDependencies ?? []
      if (dependencies.length > 0) continue
      const currentPhaseRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(current)]
      const priorSiblings = siblings.slice(0, index)
      const semanticCandidates = currentPhaseRank === undefined
        ? []
        : priorSiblings
          .filter((candidate) => {
            const candidateRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(candidate)]
            return candidateRank !== undefined && candidateRank < currentPhaseRank
          })
          .sort((left, right) => (
            (EXECUTION_PHASE_SEQUENCE[executionPhaseOf(right)] ?? 0)
              - (EXECUTION_PHASE_SEQUENCE[executionPhaseOf(left)] ?? 0)
            || right.sortOrder - left.sortOrder
            || compareRows(right, left)
          ))
      const safePredecessor = (candidates: ExecutableDefaultMasterPlanAssemblyRow[]) => (
        candidates.find((candidate) => (
          !(candidate.predecessorDependencies ?? []).some((dependency) => (
            text(dependency.clientRowId) === current.clientRowId
          ))
          && !hasSelectedDependencyPath(rows, selectedIds, current.clientRowId, candidate.clientRowId)
        )) ?? null
      )
      const semanticPredecessor = safePredecessor(semanticCandidates)
      const predecessor = semanticPredecessor ?? safePredecessor([siblings[index - 1]])
      if (!predecessor) {
        skippedCyclicDependencyCount += 1
        continue
      }
      const sequencingBasis = semanticPredecessor
        ? 'execution_phase_order_fallback'
        : 'heuristic_stagger'
      const predecessorStartDay = dateDayNumber(dateTextOf(predecessor, 'start'))
      const predecessorEndDay = dateDayNumber(dateTextOf(predecessor, 'end'))
      const currentStartDay = dateDayNumber(dateTextOf(current, 'start'))
      const semanticCanUseFinishStart = sequencingBasis === 'execution_phase_order_fallback'
        && predecessorEndDay !== null
        && currentStartDay !== null
        && predecessorEndDay < currentStartDay
      const dependencyType = semanticCanUseFinishStart ? 'FS' : 'SS'
      const releaseLagDays = sequencingBasis === 'execution_phase_order_fallback'
        ? dependencyType === 'FS'
          ? 0
          : predecessorStartDay !== null && currentStartDay !== null
            ? Math.max(0, currentStartDay - predecessorStartDay)
            : 0
        : Math.max(1, Math.min(7, Math.round((referenceDurationDaysOf(predecessor) ?? 10) * 0.15)))
      if (sequencingBasis === 'heuristic_stagger') cumulativeReleaseLagDays += releaseLagDays
      current.predecessorDependencies = [
        {
          clientRowId: predecessor.clientRowId,
          dependencyType,
          lagDays: releaseLagDays,
          intentCode: `sequencing_fallback:${sequencingBasis}`,
          source: sequencingBasis,
          sequencingBasis,
          governanceGapCode: 'master_plan_dependency_rule_gap',
          dependencyRuleEvidence: {
            source: sequencingBasis,
            evidenceLevel: sequencingBasis === 'execution_phase_order_fallback'
              ? 'semantic_fallback_l0'
              : 'heuristic_fallback_l0',
            productionWritePolicy: sequencingBasis === 'heuristic_stagger'
              ? 'candidate_only_requires_governed_dependency_rule_publication'
              : 'wizard_commit_transactional_tasks_and_dependencies',
            mutationBoundary: sequencingBasis === 'heuristic_stagger'
              ? 'preview_and_governance_only_no_task_dependency_write'
              : 'preview_no_write_wizard_commit_transactional',
            createsProductionTaskDependency: sequencingBasis !== 'heuristic_stagger',
            publicationStatus: 'fallback_not_published_dependency_rule',
            releasePolicy: sequencingBasis === 'execution_phase_order_fallback'
              ? 'earlier_execution_phase_coarse_release_until_governed_rule_is_published'
              : 'same_parent_same_lane_code_order_stagger_until_governed_rule_is_published',
          },
        },
      ]
      current.predecessorClientRowIds = unique(current.predecessorDependencies.map((dependency) => (
        text(dependency.clientRowId)
      )))
      const metadata = metadataOf(current)
      current.values = {
        ...current.values,
        schedule_authority_policy: sequencingBasis,
        sequencing_basis: sequencingBasis,
        sequencing_governance_gap_code: 'master_plan_dependency_rule_gap',
        sibling_release_lag_days: releaseLagDays,
        sibling_release_cumulative_lag_days: cumulativeReleaseLagDays,
        standard_task_metadata: {
          ...metadata,
          scheduleAuthorityPolicy: sequencingBasis,
          sequencingBasis,
          sequencingGovernanceGapCode: 'master_plan_dependency_rule_gap',
          executableDefaultMasterPlanSiblingRelease: {
            predecessorClientRowId: predecessor.clientRowId,
            dependencyType,
            lagDays: releaseLagDays,
            cumulativeLagDays: cumulativeReleaseLagDays,
            sequencingBasis,
            policy: sequencingBasis === 'execution_phase_order_fallback'
              ? 'earlier_execution_phase_coarse_release_until_governed_rule_is_published'
              : 'same_parent_same_lane_code_order_stagger_until_governed_rule_is_published',
          },
        },
      }
      if (sequencingBasis !== 'heuristic_stagger') continue
      const currentStart = dateTextOf(current, 'start')
      const currentEnd = dateTextOf(current, 'end')
      const targetStart = baseStart ? shiftDate(baseStart, cumulativeReleaseLagDays) : null
      if (!currentStart || !currentEnd || !targetStart || currentStart >= targetStart) continue
      const shiftDays = Math.max(0, signedDurationDayDelta(currentStart, targetStart) ?? 0)
      current.values = {
        ...current.values,
        planned_start_date: targetStart,
        start_date: targetStart,
        planned_end_date: shiftDate(currentEnd, shiftDays),
        end_date: shiftDate(currentEnd, shiftDays),
      }
    }
  }
  return skippedCyclicDependencyCount
}

function summarizeSequencingFallbacks(rows: ExecutableDefaultMasterPlanAssemblyRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const samples: ExecutableDefaultMasterPlanAssemblySummary['sequencingGapSamples'] = []
  let semanticFallbackDependencyCount = 0
  let heuristicStaggerDependencyCount = 0
  for (const successor of rows) {
    for (const dependency of successor.predecessorDependencies ?? []) {
      const sequencingBasis = text(dependency.sequencingBasis)
      if (sequencingBasis === 'execution_phase_order_fallback') semanticFallbackDependencyCount += 1
      else if (sequencingBasis === 'heuristic_stagger') heuristicStaggerDependencyCount += 1
      else continue
      if (samples.length >= 24) continue
      const predecessor = rowById.get(text(dependency.clientRowId))
      samples.push({
        predecessorStableCode: predecessor ? stableCodeOf(predecessor) : text(dependency.clientRowId),
        predecessorTitle: predecessor ? titleOf(predecessor) : '',
        successorStableCode: stableCodeOf(successor),
        successorTitle: titleOf(successor),
        executionPhase: executionPhaseOf(successor),
        executionLane: text(successor.values.execution_lane ?? successor.executionLane),
        sequencingBasis,
      } as ExecutableDefaultMasterPlanAssemblySummary['sequencingGapSamples'][number])
    }
  }
  const sequencingGapCount = semanticFallbackDependencyCount + heuristicStaggerDependencyCount
  return {
    semanticFallbackDependencyCount,
    heuristicStaggerDependencyCount,
    sequencingGapCount,
    sequencingGapSamples: samples,
    nonBlockingGovernanceWarningCodes: sequencingGapCount > 0
      ? ['master_plan_dependency_rule_gap_present']
      : [],
  }
}

function dependencyCoverage(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
) {
  const allIds = new Set(rows.map((row) => row.clientRowId))
  let total = 0
  let visible = 0
  for (const row of rows) {
    if (!selectedIds.has(row.clientRowId)) continue
    for (const dependency of row.predecessorDependencies ?? []) {
      const dependencyId = text(dependency.clientRowId)
      if (!dependencyId || dependencyId === row.clientRowId || !allIds.has(dependencyId)) continue
      total += 1
      if (selectedIds.has(dependencyId)) visible += 1
    }
  }
  return {
    total,
    visible,
    rate: total === 0 ? 1 : Number((visible / total).toFixed(4)),
  }
}

type ExecutableDefaultMasterPlanNetworkAnalysis = {
  acyclic: boolean
  cycleRowIds: string[]
  componentCount: number
  rootIds: string[]
  sinkIds: string[]
  incomingById: Map<string, string[]>
  outgoingById: Map<string, string[]>
}

export function analyzeExecutableDefaultMasterPlanNetwork(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  options: { includeSummaryRows?: boolean } = {},
): ExecutableDefaultMasterPlanNetworkAnalysis {
  const networkRows = options.includeSummaryRows
    ? rows
    : rows.filter((row) => !isRecordOnlyWbsSummaryRow(row))
  const rowIds = new Set(networkRows.map((row) => row.clientRowId).filter(Boolean))
  const incomingById = new Map([...rowIds].map((rowId) => [rowId, [] as string[]]))
  const outgoingById = new Map([...rowIds].map((rowId) => [rowId, [] as string[]]))
  const undirectedById = new Map([...rowIds].map((rowId) => [rowId, new Set<string>()]))

  for (const row of networkRows) {
    for (const dependency of row.predecessorDependencies ?? []) {
      const predecessorId = text(dependency.clientRowId)
      if (!predecessorId || predecessorId === row.clientRowId || !rowIds.has(predecessorId)) continue
      const incoming = incomingById.get(row.clientRowId) ?? []
      if (!incoming.includes(predecessorId)) incoming.push(predecessorId)
      incomingById.set(row.clientRowId, incoming)
      const outgoing = outgoingById.get(predecessorId) ?? []
      if (!outgoing.includes(row.clientRowId)) outgoing.push(row.clientRowId)
      outgoingById.set(predecessorId, outgoing)
      undirectedById.get(predecessorId)?.add(row.clientRowId)
      undirectedById.get(row.clientRowId)?.add(predecessorId)
    }
  }

  const remainingIndegree = new Map([...incomingById].map(([rowId, incoming]) => [rowId, incoming.length]))
  const queue = [...remainingIndegree]
    .filter(([, indegree]) => indegree === 0)
    .map(([rowId]) => rowId)
  const visited = new Set<string>()
  while (queue.length > 0) {
    const rowId = queue.shift()!
    visited.add(rowId)
    for (const successorId of outgoingById.get(rowId) ?? []) {
      const nextIndegree = (remainingIndegree.get(successorId) ?? 0) - 1
      remainingIndegree.set(successorId, nextIndegree)
      if (nextIndegree === 0) queue.push(successorId)
    }
  }

  const componentVisited = new Set<string>()
  let componentCount = 0
  for (const rowId of rowIds) {
    if (componentVisited.has(rowId)) continue
    componentCount += 1
    const stack = [rowId]
    componentVisited.add(rowId)
    while (stack.length > 0) {
      const currentId = stack.pop()!
      for (const neighborId of undirectedById.get(currentId) ?? []) {
        if (componentVisited.has(neighborId)) continue
        componentVisited.add(neighborId)
        stack.push(neighborId)
      }
    }
  }

  return {
    acyclic: visited.size === rowIds.size,
    cycleRowIds: [...rowIds].filter((rowId) => !visited.has(rowId)),
    componentCount,
    rootIds: [...rowIds].filter((rowId) => (incomingById.get(rowId) ?? []).length === 0),
    sinkIds: [...rowIds].filter((rowId) => (outgoingById.get(rowId) ?? []).length === 0),
    incomingById,
    outgoingById,
  }
}

export function analyzeExecutableDefaultMasterPlanSchedulePropagation(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
) {
  const rowIds = new Set(rows.map((row) => row.clientRowId))
  return analyzeExecutableDefaultMasterPlanNetwork(rows.map((row) => ({
    ...row,
    predecessorDependencies: [
      ...(row.predecessorDependencies ?? []),
      ...(row.parentClientRowId && rowIds.has(row.parentClientRowId)
        ? [{
            clientRowId: row.parentClientRowId,
            dependencyType: 'HIERARCHY',
            lagDays: 0,
            intentCode: 'schedule_propagation_parent_to_descendant',
          }]
        : []),
    ],
  })), { includeSummaryRows: true })
}

function hasSelectedDependencyPath(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  selectedIds: Set<string>,
  fromClientRowId: string,
  toClientRowId: string,
) {
  if (fromClientRowId === toClientRowId) return true
  const scheduleRows = rows.filter((row) => selectedIds.has(row.clientRowId))
  const network = analyzeExecutableDefaultMasterPlanNetwork(scheduleRows, { includeSummaryRows: true })
  const seen = new Set([fromClientRowId])
  const queue = [fromClientRowId]
  while (queue.length > 0) {
    const currentId = queue.shift()!
    for (const successorId of network.outgoingById.get(currentId) ?? []) {
      if (successorId === toClientRowId) return true
      if (seen.has(successorId)) continue
      seen.add(successorId)
      queue.push(successorId)
    }
  }
  return false
}

function hasSchedulePropagationPath(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  fromClientRowId: string,
  toClientRowId: string,
) {
  if (fromClientRowId === toClientRowId) return true
  const outgoingById = new Map(rows.map((row) => [row.clientRowId, [] as string[]]))
  for (const row of rows) {
    const parentId = text(row.parentClientRowId)
    if (parentId && outgoingById.has(parentId)) outgoingById.get(parentId)?.push(row.clientRowId)
    for (const dependency of row.predecessorDependencies ?? []) {
      const predecessorId = text(dependency.clientRowId)
      if (predecessorId && outgoingById.has(predecessorId)) {
        outgoingById.get(predecessorId)?.push(row.clientRowId)
      }
    }
  }
  const seen = new Set([fromClientRowId])
  const queue = [fromClientRowId]
  while (queue.length > 0) {
    const currentId = queue.shift()!
    for (const successorId of outgoingById.get(currentId) ?? []) {
      if (successorId === toClientRowId) return true
      if (seen.has(successorId)) continue
      seen.add(successorId)
      queue.push(successorId)
    }
  }
  return false
}

function appendExecutableDependency(
  row: ExecutableDefaultMasterPlanAssemblyRow,
  dependency: { clientRowId: string; [key: string]: unknown },
) {
  const alreadyExists = (row.predecessorDependencies ?? []).some((current) => (
    text(current.clientRowId) === text(dependency.clientRowId)
      && text(current.dependencyType) === text(dependency.dependencyType)
      && Number(current.lagDays ?? 0) === Number(dependency.lagDays ?? 0)
      && text(current.intentCode) === text(dependency.intentCode)
  ))
  if (alreadyExists) return false
  row.predecessorDependencies = [...(row.predecessorDependencies ?? []), dependency]
  row.predecessorClientRowIds = unique([
    ...(row.predecessorClientRowIds ?? []),
    text(dependency.clientRowId),
  ])
  return true
}

function dateDayNumber(date: string | null) {
  return date ? signedDurationDayDelta('1970-01-01', date) : null
}

function compareRowsByPlanStart(
  left: ExecutableDefaultMasterPlanAssemblyRow,
  right: ExecutableDefaultMasterPlanAssemblyRow,
) {
  const byStart = text(dateTextOf(left, 'start')).localeCompare(text(dateTextOf(right, 'start')))
  if (byStart) return byStart
  const byEnd = text(dateTextOf(left, 'end')).localeCompare(text(dateTextOf(right, 'end')))
  if (byEnd) return byEnd
  return left.sortOrder - right.sortOrder || left.clientRowId.localeCompare(right.clientRowId)
}

function countSyntheticDependencyPhaseInversions(rows: ExecutableDefaultMasterPlanAssemblyRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  let count = 0
  for (const successor of rows) {
    const successorRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(successor)]
    if (successorRank === undefined) continue
    for (const dependency of successor.predecessorDependencies ?? []) {
      if (!text(dependency.intentCode).startsWith('executable_default_master_plan_')) continue
      const predecessor = rowById.get(text(dependency.clientRowId))
      if (!predecessor) continue
      const predecessorRank = EXECUTION_PHASE_SEQUENCE[executionPhaseOf(predecessor)]
      if (predecessorRank !== undefined && predecessorRank > successorRank) count += 1
    }
  }
  return count
}

function countLateActivityPhaseMisclassifications(rows: ExecutableDefaultMasterPlanAssemblyRow[]) {
  return rows.filter((row) => (
    executionPhaseOf(row) === 'management_support'
    && LATE_ACTIVITY_TITLE_PATTERN.test(titleOf(row))
  )).length
}

function terminalControlScore(row: ExecutableDefaultMasterPlanAssemblyRow) {
  const title = titleOf(row)
  let score = dateDayNumber(dateTextOf(row, 'end')) ?? 0
  if (executionPhaseOf(row) === 'acceptance_handover') score += 100_000
  if (/竣工|验收|移交|交付|handover|acceptance/i.test(title)) score += 50_000
  if (planItemKindOf(row) === 'milestone') score += 10_000
  return score
}

function isHierarchyAncestor(
  rowById: Map<string, ExecutableDefaultMasterPlanAssemblyRow>,
  ancestorClientRowId: string,
  descendantClientRowId: string,
) {
  const seen = new Set<string>()
  let parentId = text(rowById.get(descendantClientRowId)?.parentClientRowId)
  while (parentId && !seen.has(parentId)) {
    if (parentId === ancestorClientRowId) return true
    seen.add(parentId)
    parentId = text(rowById.get(parentId)?.parentClientRowId)
  }
  return false
}

function dependencyRequiredStartDay(
  predecessor: ExecutableDefaultMasterPlanAssemblyRow,
  successor: ExecutableDefaultMasterPlanAssemblyRow,
  dependency: { clientRowId: string; [key: string]: unknown },
) {
  const predecessorStartDay = dateDayNumber(dateTextOf(predecessor, 'start'))
  if (predecessorStartDay === null) return null
  const predecessorDurationDays = referenceDurationDaysOf(predecessor) ?? 1
  const successorDurationDays = referenceDurationDaysOf(successor) ?? 1
  const lagDays = Number.isFinite(Number(dependency.lagDays)) ? Math.round(Number(dependency.lagDays)) : 0
  const dependencyType = text(dependency.dependencyType).toUpperCase() || 'FS'
  if (dependencyType === 'SS') return predecessorStartDay + lagDays
  if (dependencyType === 'FF') return predecessorStartDay + predecessorDurationDays + lagDays - successorDurationDays
  if (dependencyType === 'SF') return predecessorStartDay + lagDays - successorDurationDays
  return predecessorStartDay + predecessorDurationDays + lagDays
}

function buildPrimaryControlChain(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  terminalClientRowId: string,
) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const reverseChain = [terminalClientRowId]
  const seen = new Set(reverseChain)
  let current = rowById.get(terminalClientRowId) ?? null
  while (current) {
    const predecessorCandidates = (current.predecessorDependencies ?? [])
      .map((dependency) => {
        const predecessor = rowById.get(text(dependency.clientRowId))
        return predecessor
          ? { predecessor, requiredStartDay: dependencyRequiredStartDay(predecessor, current!, dependency) }
          : null
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .filter((candidate) => !seen.has(candidate.predecessor.clientRowId))
      .sort((left, right) => (
        (right.requiredStartDay ?? Number.NEGATIVE_INFINITY) - (left.requiredStartDay ?? Number.NEGATIVE_INFINITY)
        || compareRowsByPlanStart(right.predecessor, left.predecessor)
      ))
    const predecessor = predecessorCandidates[0]?.predecessor ?? null
    if (!predecessor) break
    reverseChain.push(predecessor.clientRowId)
    seen.add(predecessor.clientRowId)
    current = predecessor
  }
  return reverseChain.reverse()
}

function primaryNetworkDependencyEvidence(policy: string) {
  return {
    source: 'construction_task_dependency_constraint_rule_system',
    evidenceLevel: 'system_standard_dependency_l1',
    productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
    mutationBoundary: 'preview_no_write_wizard_commit_transactional',
    createsProductionTaskDependency: true,
    releasePolicy: policy,
  }
}

function dedupeExecutableDependenciesByPredecessor(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
) {
  let removedDependencyCount = 0
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  for (const row of rows) {
    const groups = new Map<string, Array<{ clientRowId: string; [key: string]: unknown }>>()
    const retainedProfileAnchors: Array<{ clientRowId: string; [key: string]: unknown }> = []
    for (const dependency of row.predecessorDependencies ?? []) {
      const predecessorId = text(dependency.clientRowId)
      if (!predecessorId || predecessorId === row.clientRowId) continue
      if (!rowById.has(predecessorId)) {
        // The default-plan phase anchor may deliberately point to a linked
        // support row. It is candidate lineage, not a visible-network edge.
        if (text(dependency.intentCode) === 'business_type_profile_phase_anchor') {
          retainedProfileAnchors.push(dependency)
        }
        continue
      }
      groups.set(predecessorId, [...(groups.get(predecessorId) ?? []), dependency])
    }
    const selectedDependencies: Array<{ clientRowId: string; [key: string]: unknown }> = []
    for (const dependencies of groups.values()) {
      const businessDependencies = dependencies.filter((dependency) => (
        !text(dependency.intentCode).startsWith('executable_default_master_plan_')
      ))
      const candidates = businessDependencies.length > 0 ? businessDependencies : dependencies
      const selected = [...candidates].sort((left, right) => {
        const predecessor = rowById.get(text(left.clientRowId))
        if (!predecessor) return 0
        const leftRequiredStart = dependencyRequiredStartDay(predecessor, row, left) ?? Number.NEGATIVE_INFINITY
        const rightRequiredStart = dependencyRequiredStartDay(predecessor, row, right) ?? Number.NEGATIVE_INFINITY
        return rightRequiredStart - leftRequiredStart
          || text(left.intentCode).localeCompare(text(right.intentCode))
      })[0]
      if (selected) selectedDependencies.push(selected)
      removedDependencyCount += Math.max(0, dependencies.length - 1)
    }
    row.predecessorDependencies = [...selectedDependencies, ...retainedProfileAnchors]
    row.predecessorClientRowIds = unique(row.predecessorDependencies.map((dependency) => text(dependency.clientRowId)))
  }
  return removedDependencyCount
}

function stabilizeExecutablePrimaryScheduleNetwork(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
) {
  const networkRows = rows.filter((row) => !isRecordOnlyWbsSummaryRow(row))
  const initialNetwork = analyzeExecutableDefaultMasterPlanNetwork(networkRows)
  if (!initialNetwork.acyclic || networkRows.length === 0) {
    return {
      primaryNetworkBridgeDependencyCount: 0,
      primaryControlSpineDependencyCount: 0,
    }
  }

  const rowById = new Map(networkRows.map((row) => [row.clientRowId, row]))
  const roots = initialNetwork.rootIds
    .map((rowId) => rowById.get(rowId))
    .filter((row): row is ExecutableDefaultMasterPlanAssemblyRow => Boolean(row))
    .sort((left, right) => (
      Number(executionPhaseOf(right) === 'startup_site_setup') - Number(executionPhaseOf(left) === 'startup_site_setup')
      || Number(masterPlanVisibilityClassOf(right) === 'primary_control') - Number(masterPlanVisibilityClassOf(left) === 'primary_control')
      || Number(isDedicatedBusinessTypeProfileRow(right)) - Number(isDedicatedBusinessTypeProfileRow(left))
      || compareRowsByPlanStart(left, right)
    ))
  const projectRoot = roots[0] ?? null
  const sinks = initialNetwork.sinkIds
    .map((rowId) => rowById.get(rowId))
    .filter((row): row is ExecutableDefaultMasterPlanAssemblyRow => Boolean(row))
  const terminal = [...sinks].sort((left, right) => (
    terminalControlScore(right) - terminalControlScore(left)
      || compareRowsByPlanStart(right, left)
  ))[0] ?? null
  if (!projectRoot || !terminal) {
    return {
      primaryNetworkBridgeDependencyCount: 0,
      primaryControlSpineDependencyCount: 0,
    }
  }

  let primaryNetworkBridgeDependencyCount = 0
  let primaryControlSpineDependencyCount = 0
  const otherSinks = sinks
    .filter((row) => row.clientRowId !== terminal.clientRowId)
    .sort((left, right) => (
      (dateDayNumber(dateTextOf(left, 'end')) ?? 0) - (dateDayNumber(dateTextOf(right, 'end')) ?? 0)
        || compareRowsByPlanStart(left, right)
    ))
  for (const sink of otherSinks) {
    if (appendExecutableDependency(terminal, {
      clientRowId: sink.clientRowId,
      dependencyType: 'FS',
      lagDays: 0,
      intentCode: 'executable_default_master_plan_terminal_convergence',
      source: 'dependency_intent_template',
      dependencyRuleEvidence: primaryNetworkDependencyEvidence(
        'completion_stream_to_contractual_handover',
      ),
    })) primaryNetworkBridgeDependencyCount += 1
  }

  const primaryControlChain = buildPrimaryControlChain(networkRows, terminal.clientRowId)
  const primaryChainRootId = primaryControlChain[0] ?? terminal.clientRowId
  const projectRootStartDay = dateDayNumber(dateTextOf(projectRoot, 'start'))
  for (const root of roots) {
    if (root.clientRowId === projectRoot.clientRowId) continue
    if (isDedicatedBusinessTypeProfileRow(root)) continue
    const rootStartDay = dateDayNumber(dateTextOf(root, 'start'))
    const isPrimaryChainRoot = root.clientRowId === primaryChainRootId
    const lagDays = rootStartDay !== null && projectRootStartDay !== null
      ? Math.max(0, rootStartDay - projectRootStartDay)
      : 0
    if (appendExecutableDependency(root, {
      clientRowId: projectRoot.clientRowId,
      dependencyType: 'SS',
      lagDays,
      intentCode: isPrimaryChainRoot
        ? 'executable_default_master_plan_primary_control_spine'
        : 'executable_default_master_plan_component_release',
      source: 'dependency_intent_template',
      dependencyRuleEvidence: primaryNetworkDependencyEvidence(
        isPrimaryChainRoot
          ? 'project_start_to_primary_completion_stream_release'
          : 'project_start_to_secondary_schedule_component_release',
      ),
    })) {
      primaryNetworkBridgeDependencyCount += 1
      if (isPrimaryChainRoot) primaryControlSpineDependencyCount += 1
    }
  }

  dedupeExecutableDependenciesByPredecessor(networkRows)

  return {
    primaryNetworkBridgeDependencyCount,
    primaryControlSpineDependencyCount,
  }
}

export function finalizeExecutableDefaultMasterPlanScheduleNetwork(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
) {
  const scheduleRows = rows.filter((row) => rowProjectionModeOf(row) === 'schedule_row')
  return stabilizeExecutablePrimaryScheduleNetwork(scheduleRows)
}

export function refreshExecutableDefaultMasterPlanAssemblySummary(
  rows: ExecutableDefaultMasterPlanAssemblyRow[],
  summary: ExecutableDefaultMasterPlanAssemblySummary,
) {
  const scheduleRows = rows.filter((row) => rowProjectionModeOf(row) === 'schedule_row')
  const scheduleIds = new Set(scheduleRows.map((row) => row.clientRowId))
  const durationRows = scheduleRows.filter((row) => durationModeOf(row) === 'duration_bearing')
  const invalidDurationRows = durationRows.filter((row) => (
    positiveNumber(row.values.smart_reference_days) === null || !hasValidPlanWindow(row)
  ))
  const durationSemanticMismatchRows = durationRows.filter((row) => (
    !isExecutableDurationAssetSemanticallyCompatible(row)
  ))
  const selectedMethodConflictCount = countExecutableDefaultMasterPlanMethodConflicts(scheduleRows)
  const coverage = dependencyCoverage(rows, scheduleIds)
  const primaryNetwork = analyzeExecutableDefaultMasterPlanNetwork(scheduleRows)
  const schedulePropagationNetwork = analyzeExecutableDefaultMasterPlanSchedulePropagation(scheduleRows)
  const syntheticDependencyPhaseInversionCount = countSyntheticDependencyPhaseInversions(scheduleRows)
  const lateActivityPhaseMisclassificationCount = countLateActivityPhaseMisclassifications(scheduleRows)
  const sequencingFallbacks = summarizeSequencingFallbacks(scheduleRows)
  const expectedExecutionPhases = unique([
    ...summary.coveredExecutionPhases,
    ...summary.missingExecutionPhases,
  ]).filter(Boolean).sort()
  const coveredExecutionPhases = unique(scheduleRows.map(executionPhaseOf)).filter(Boolean).sort()
  const coveredPhaseSet = new Set(coveredExecutionPhases)
  const missingExecutionPhases = expectedExecutionPhases.filter((phase) => !coveredPhaseSet.has(phase))
  const maximum = Math.max(1, summary.maximumScheduleRowCount)
  const effectiveOperationalFloor = Math.min(maximum, Math.max(1, summary.operationalRowFloor))
  const availableScheduleRowCount = Math.max(summary.availableScheduleRowCount, scheduleRows.length)
  const minimum = resolveExecutableDefaultMasterPlanMinimum({
    recommendedMinimum: summary.recommendedMinimumScheduleRowCount,
    maximum,
    operationalFloor: effectiveOperationalFloor,
    availableScheduleRowCount,
  })
  const rowVolumeReadiness = evaluateExecutableDefaultMasterPlanRowVolumeReadiness({
    availableScheduleRowCount,
    scheduleRowCount: scheduleRows.length,
    minimumScheduleRowCount: minimum,
    maximumScheduleRowCount: maximum,
    operationalRowFloor: effectiveOperationalFloor,
  })
  const readinessReasonCodes = unique([
    ...rowVolumeReadiness.reasonCodes,
    ...(invalidDurationRows.length > 0 ? ['master_plan_invalid_duration_rows_present'] : []),
    ...(coverage.rate < 0.9 ? ['master_plan_visible_dependency_coverage_insufficient'] : []),
    ...(missingExecutionPhases.length > 0 ? ['master_plan_required_phase_coverage_incomplete'] : []),
    ...(durationRows.some((row) => row.values.duration_authority !== 'system_standard_seed')
      ? ['master_plan_duration_authority_incomplete']
      : []),
    ...(selectedMethodConflictCount > 0 ? ['master_plan_method_conflict_present'] : []),
    ...(durationSemanticMismatchRows.length > 0 ? ['master_plan_duration_asset_semantic_mismatch'] : []),
    ...(!primaryNetwork.acyclic ? ['master_plan_primary_network_cycle_present'] : []),
    ...(primaryNetwork.componentCount !== 1 ? ['master_plan_primary_network_disconnected'] : []),
    ...(primaryNetwork.rootIds.length !== 1 ? ['master_plan_primary_network_root_count_invalid'] : []),
    ...(primaryNetwork.sinkIds.length !== 1 ? ['master_plan_primary_network_terminal_count_invalid'] : []),
    ...(!schedulePropagationNetwork.acyclic ? ['master_plan_schedule_propagation_cycle_present'] : []),
    ...(syntheticDependencyPhaseInversionCount > 0 ? ['master_plan_synthetic_dependency_phase_inversion'] : []),
    ...(lateActivityPhaseMisclassificationCount > 0 ? ['master_plan_late_activity_phase_misclassified'] : []),
  ])
  const readyForWizardCommit = readinessReasonCodes.length === 0

  Object.assign(summary, {
    status: readyForWizardCommit
      ? 'executable_default_master_plan_ready'
      : 'executable_default_master_plan_blocked',
    scheduleRowCount: scheduleRows.length,
    minimumScheduleRowCount: minimum,
    availableScheduleRowCount,
    assetInventoryExhausted: rowVolumeReadiness.assetInventoryExhausted,
    assetInventoryShortfallRowCount: rowVolumeReadiness.assetInventoryShortfallRowCount,
    assetInventoryShortfallAccepted: rowVolumeReadiness.assetInventoryShortfallAccepted,
    promotedLinkedProjectionRowCount: scheduleRows.filter((row) => (
      truthy(record(row.linkedProjectionSource ?? row.values.linked_projection_source).promotedToExecutableDefaultMasterPlan)
    )).length,
    durationBearingScheduleRowCount: durationRows.length,
    executableScheduleRowCount: scheduleRows.filter((row) => truthy(row.values.is_executable)).length,
    summaryScheduleRowCount: scheduleRows.filter((row) => truthy(row.values.is_wbs_summary)).length,
    visibleDependencyCount: coverage.visible,
    totalDependencyCount: coverage.total,
    visibleDependencyCoverageRate: coverage.rate,
    coveredExecutionPhases,
    missingExecutionPhases,
    invalidDurationRowCount: invalidDurationRows.length,
    methodConflictCount: selectedMethodConflictCount,
    durationAssetSemanticMismatchCount: durationSemanticMismatchRows.length,
    dependencyCycleRowCount: primaryNetwork.cycleRowIds.length,
    schedulePropagationCycleRowCount: schedulePropagationNetwork.cycleRowIds.length,
    networkComponentCount: primaryNetwork.componentCount,
    networkRootCount: primaryNetwork.rootIds.length,
    networkSinkCount: primaryNetwork.sinkIds.length,
    syntheticDependencyPhaseInversionCount,
    lateActivityPhaseMisclassificationCount,
    ...sequencingFallbacks,
    readinessReasonCodes,
    readyForWizardCommit,
  })
  return summary
}

export function assembleExecutableDefaultMasterPlanRows(
  input: ExecutableDefaultMasterPlanAssemblyInput,
): ExecutableDefaultMasterPlanAssemblySummary {
  const [configuredMinimum, configuredMaximum] = input.masterPlanProfile.rowCountRange
  const recommendedMinimum = Math.max(1, Math.floor(configuredMinimum))
  const maximum = Math.max(recommendedMinimum, Math.floor(configuredMaximum))
  const businessType = text(input.businessType)
  const businessSubtype = text(input.businessSubtype)
  const methodVariantCodes = input.methodVariantCodes ?? []
  const initialScheduleRows = input.rows.filter((row) => rowProjectionModeOf(row) === 'schedule_row')
  const initialScheduleRowIds = new Set(initialScheduleRows.map((row) => row.clientRowId))
  const initialContractualMilestoneTitles = new Set(initialScheduleRows
    .filter((row) => planItemKindOf(row) === 'milestone')
    .map((row) => titleOf(row)))
  const initialContractualMilestoneRoles = new Set(initialScheduleRows
    .filter((row) => planItemKindOf(row) === 'milestone')
    .map(contractualCloseoutRoleOf)
    .filter(Boolean))
  const durationAssetAuthorities = buildDurationAssetAuthorities(input.rows, initialScheduleRowIds)
  const suppressResidentialCatalogPromotion = businessType === 'general_civil'
    && (!businessSubtype || ['civil_residential', 'residential'].includes(businessSubtype))
  const promotableBeforeDurationAuthorityRows = suppressResidentialCatalogPromotion
    ? []
    : input.rows.filter((row) => (
        canPromoteForBusinessType(
          row,
          businessType,
          methodVariantCodes,
          input.basementLevelCount,
        )
        && !(planItemKindOf(row) === 'milestone'
          && initialContractualMilestoneTitles.has(titleOf(row)))
        && !(planItemKindOf(row) === 'milestone'
          && !contractualCloseoutRoleOf(row)
          && (
            (initialContractualMilestoneRoles.has('completion_filing')
              && CONTRACTUAL_COMPLETION_FILING_TITLE.test(titleOf(row)))
            || (initialContractualMilestoneRoles.has('property_handover')
              && CONTRACTUAL_PROPERTY_HANDOVER_TITLE.test(titleOf(row)))
          ))
      ))
  const rawCandidateRows = promotableBeforeDurationAuthorityRows.filter((row) => (
    durationModeOf(row) !== 'duration_bearing'
      || resolveDurationAssetAuthority(row, durationAssetAuthorities) !== null
  ))
  const missingDurationAuthorityRows = promotableBeforeDurationAuthorityRows.filter((row) => (
    durationModeOf(row) === 'duration_bearing'
    && resolveDurationAssetAuthority(row, durationAssetAuthorities) === null
  ))
  const missingDurationAuthorityDiagnostics = missingDurationAuthorityRows.map((row) => {
    const metadata = metadataOf(row)
    return {
      stableCode: stableCodeOf(row),
      title: titleOf(row),
      executionPhase: executionPhaseOf(row),
      templateGroup: text(row.values.template_group ?? metadata.templateGroup),
      reasonCode: explainMissingDurationAssetAuthority(row, durationAssetAuthorities),
    }
  })
  const promotionCandidateMissingDurationAuthorityReasonCounts = missingDurationAuthorityDiagnostics
    .reduce<Record<string, number>>((counts, diagnostic) => {
      counts[diagnostic.reasonCode] = (counts[diagnostic.reasonCode] ?? 0) + 1
      return counts
    }, {})
  const candidateCompaction = compactMasterControlPromotionCandidates(rawCandidateRows)
  const candidateRows = candidateCompaction.candidateRows
  const countCandidatesBy = (
    readKey: (row: ExecutableDefaultMasterPlanAssemblyRow) => string,
  ) => candidateRows.reduce<Record<string, number>>((counts, row) => {
    const key = readKey(row) || 'unclassified'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
  const promotionCandidateCountsByTemplateGroup = countCandidatesBy((row) => {
    const metadata = metadataOf(row)
    return text(row.values.template_group ?? metadata.templateGroup)
  })
  const promotionCandidateCountsByScopeMode = countCandidatesBy((row) => (
    text(record(metadataOf(row).masterControlPromotionEligibility).scopeMode)
  ))
  const representativeIdByCandidateId = new Map<string, string>()
  const candidateById = new Map<string, ExecutableDefaultMasterPlanAssemblyRow>()
  for (const row of rawCandidateRows) {
    const representative = candidateCompaction.representativeByRawCandidateId.get(row.clientRowId)
    if (!representative) continue
    representativeIdByCandidateId.set(row.clientRowId, representative.clientRowId)
    candidateById.set(row.clientRowId, representative)
  }
  for (const row of candidateRows) {
    representativeIdByCandidateId.set(row.clientRowId, row.clientRowId)
    candidateById.set(row.clientRowId, row)
  }
  const selectedIds = new Set(initialScheduleRowIds)
  const availableScheduleRowCount = initialScheduleRowIds.size + candidateRows.length
  const rowFloor = resolveDefaultMasterPlanOperationalRowFloor(text(input.businessType))
  const selectionTarget = resolveExecutableDefaultMasterPlanMinimum({
    recommendedMinimum,
    maximum,
    operationalFloor: rowFloor,
  })
  const minimum = resolveExecutableDefaultMasterPlanMinimum({
    recommendedMinimum,
    maximum,
    operationalFloor: rowFloor,
    availableScheduleRowCount,
  })

  const closureFor = (row: ExecutableDefaultMasterPlanAssemblyRow) => {
    const closure = new Map<string, ExecutableDefaultMasterPlanAssemblyRow>()
    const visit = (current: ExecutableDefaultMasterPlanAssemblyRow) => {
      if (selectedIds.has(current.clientRowId) || closure.has(current.clientRowId)) return
      const parent = current.parentClientRowId ? candidateById.get(current.parentClientRowId) : null
      if (parent) visit(parent)
      for (const dependency of current.predecessorDependencies ?? []) {
        const predecessor = candidateById.get(text(dependency.clientRowId))
        if (predecessor) visit(predecessor)
      }
      closure.set(current.clientRowId, current)
    }
    visit(row)
    return [...closure.values()]
  }

  const addWithClosure = (row: ExecutableDefaultMasterPlanAssemblyRow, capacity = maximum) => {
    const closure = closureFor(row)
    if (selectedIds.size + closure.length > capacity) return false
    for (const item of closure) selectedIds.add(item.clientRowId)
    return closure.length > 0
  }

  for (const contractualMilestone of candidateRows.filter((row) => (
    planItemKindOf(row) === 'milestone'
    && (CONTRACTUAL_COMPLETION_FILING_TITLE.test(titleOf(row))
      || CONTRACTUAL_PROPERTY_HANDOVER_TITLE.test(titleOf(row)))
  ))) {
    if (selectedIds.size < maximum) selectedIds.add(contractualMilestone.clientRowId)
  }

  for (const row of input.rows.filter((item) => selectedIds.has(item.clientRowId))) {
    for (const dependency of row.predecessorDependencies ?? []) {
      const predecessor = candidateById.get(text(dependency.clientRowId))
      if (predecessor) addWithClosure(predecessor)
    }
  }

  const sortedCandidates = [...candidateRows].sort(compareRows)
  const candidatePhases = unique(sortedCandidates.map(executionPhaseOf)).sort()
  for (const phase of candidatePhases) {
    const phaseCandidate = sortedCandidates.find((row) => executionPhaseOf(row) === phase && !selectedIds.has(row.clientRowId))
    if (phaseCandidate) addWithClosure(phaseCandidate)
  }

  const candidateBuckets = new Map<string, ExecutableDefaultMasterPlanAssemblyRow[]>()
  for (const row of sortedCandidates) {
    const key = masterControlSelectionBucket(row)
    const bucket = candidateBuckets.get(key) ?? []
    bucket.push(row)
    candidateBuckets.set(key, bucket)
  }
  const orderedBucketKeys = [...candidateBuckets.keys()].sort((left, right) => {
    const leftRow = candidateBuckets.get(left)?.[0]
    const rightRow = candidateBuckets.get(right)?.[0]
    if (!leftRow || !rightRow) return left.localeCompare(right)
    const byRow = compareRows(leftRow, rightRow)
    return byRow || left.localeCompare(right)
  })
  let roundRobinProgress = true
  while (selectedIds.size < selectionTarget && roundRobinProgress) {
    roundRobinProgress = false
    for (const key of orderedBucketKeys) {
      if (selectedIds.size >= selectionTarget) break
      const bucket = candidateBuckets.get(key) ?? []
      const candidate = bucket.find((row) => !selectedIds.has(row.clientRowId))
      if (candidate && addWithClosure(candidate)) roundRobinProgress = true
    }
  }

  if (selectedIds.size < selectionTarget) {
    for (const row of sortedCandidates) {
      if (selectedIds.size >= selectionTarget || selectedIds.size >= maximum) break
      selectedIds.add(row.clientRowId)
    }
  }

  let coverage = dependencyCoverage(input.rows, selectedIds)
  if (coverage.rate < 0.9) {
    const selectedRows = input.rows.filter((row) => selectedIds.has(row.clientRowId))
    for (const row of selectedRows) {
      for (const dependency of row.predecessorDependencies ?? []) {
        const predecessor = candidateById.get(text(dependency.clientRowId))
        if (predecessor) addWithClosure(predecessor)
      }
      coverage = dependencyCoverage(input.rows, selectedIds)
      if (coverage.rate >= 0.9 || selectedIds.size >= maximum) break
    }
  }

  for (const row of input.rows) {
    if (!selectedIds.has(row.clientRowId)) continue
    const promotedToMasterControl = !initialScheduleRowIds.has(row.clientRowId)
    if (promotedToMasterControl) promoteRow(row, businessType)
    if (rowProjectionModeOf(row) === 'schedule_row') {
      const durationAuthority = resolveDurationAssetAuthority(row, durationAssetAuthorities)
      const category = text(row.values.category_type ?? row.values.wbs_node_type)
      const promotedPhysicalControlNeedsFloor = businessType !== 'general_civil'
        && promotedToMasterControl
        && ['item_work', 'sub_division'].includes(category)
        && durationModeOf(row) === 'duration_bearing'
        && !SHORT_MASTER_CONTROL_GATE_TITLE_PATTERN.test(titleOf(row))
      const phaseT2Authority = promotedPhysicalControlNeedsFloor
        ? selectT2RhythmAuthorityForRow(row, durationAssetAuthorities)
        : null
      const masterControlReferenceFloorDays = phaseT2Authority?.sourceReferenceDurationDays
        ? Math.max(11, Math.ceil(phaseT2Authority.sourceReferenceDurationDays * 0.15))
        : null
      if (durationAuthority || durationModeOf(row) !== 'duration_bearing') {
        normalizeDurationAuthority(row, durationAuthority, { masterControlReferenceFloorDays })
      }
      attachMasterControlDrilldownLineage(row)
    }
  }
  const skippedCyclicSiblingDependencyCount = applyPromotedSiblingReleaseRhythm(
    input.rows,
    selectedIds,
    initialScheduleRowIds,
  )
  preservePromotedRowLogicalAnchorsWithoutTaskParenting(
    input.rows,
    selectedIds,
    initialScheduleRowIds,
    representativeIdByCandidateId,
  )
  attachPromotedRowsToLogicalAnchorWorkfaces(
    input.rows,
    selectedIds,
    initialScheduleRowIds,
  )
  normalizePromotedDependenciesToVisibleSchedule(
    input.rows,
    selectedIds,
    initialScheduleRowIds,
    representativeIdByCandidateId,
  )
  applyGovernedBusinessTypeSpecialtySequence(input.rows, selectedIds, businessType)
  connectContractualCloseoutMilestones(
    input.rows,
    selectedIds,
    initialScheduleRowIds,
  )
  alignPromotedRowsToPhaseAnchors(input.rows, selectedIds, initialScheduleRowIds)
  attachUnanchoredRowsToPhysicalControls(
    input.rows,
    selectedIds,
    initialScheduleRowIds,
  )
  convergePhysicalCompletionFrontierIntoContractualFiling(
    input.rows,
    selectedIds,
  )
  normalizePromotedRowHierarchy(input.rows, selectedIds)
  const primaryNetworkStabilization = stabilizeExecutablePrimaryScheduleNetwork(
    input.rows.filter((row) => selectedIds.has(row.clientRowId)),
  )

  const scheduleRows = input.rows.filter((row) => rowProjectionModeOf(row) === 'schedule_row')
  const primaryNetwork = analyzeExecutableDefaultMasterPlanNetwork(scheduleRows)
  const schedulePropagationNetwork = analyzeExecutableDefaultMasterPlanSchedulePropagation(scheduleRows)
  const syntheticDependencyPhaseInversionCount = countSyntheticDependencyPhaseInversions(scheduleRows)
  const lateActivityPhaseMisclassificationCount = countLateActivityPhaseMisclassifications(scheduleRows)
  const sequencingFallbacks = summarizeSequencingFallbacks(scheduleRows)
  const scheduleIds = new Set(scheduleRows.map((row) => row.clientRowId))
  coverage = dependencyCoverage(input.rows, scheduleIds)
  const durationRows = scheduleRows.filter((row) => durationModeOf(row) === 'duration_bearing')
  const invalidDurationRows = durationRows.filter((row) => (
    positiveNumber(row.values.smart_reference_days) === null || !hasValidPlanWindow(row)
  ))
  const durationSemanticMismatchRows = durationRows.filter((row) => (
    !isExecutableDurationAssetSemanticallyCompatible(row)
  ))
  const selectedMethodConflictCount = countExecutableDefaultMasterPlanMethodConflicts(scheduleRows)
  const allPhases = unique(input.rows
    .filter((row) => initialScheduleRowIds.has(row.clientRowId) || candidateById.has(row.clientRowId))
    .map(executionPhaseOf)).filter(Boolean).sort()
  const coveredExecutionPhases = unique(scheduleRows.map(executionPhaseOf)).filter(Boolean).sort()
  const coveredPhaseSet = new Set(coveredExecutionPhases)
  const missingExecutionPhases = allPhases.filter((phase) => !coveredPhaseSet.has(phase))
  const rowVolumeReadiness = evaluateExecutableDefaultMasterPlanRowVolumeReadiness({
    availableScheduleRowCount,
    scheduleRowCount: scheduleRows.length,
    minimumScheduleRowCount: minimum,
    maximumScheduleRowCount: maximum,
    operationalRowFloor: rowFloor,
  })
  const readinessReasonCodes = unique([
    ...rowVolumeReadiness.reasonCodes,
    ...(invalidDurationRows.length > 0 ? ['master_plan_invalid_duration_rows_present'] : []),
    ...(coverage.rate < 0.9 ? ['master_plan_visible_dependency_coverage_insufficient'] : []),
    ...(missingExecutionPhases.length > 0 ? ['master_plan_required_phase_coverage_incomplete'] : []),
    ...(durationRows.some((row) => row.values.duration_authority !== 'system_standard_seed')
      ? ['master_plan_duration_authority_incomplete']
      : []),
    ...(selectedMethodConflictCount > 0 ? ['master_plan_method_conflict_present'] : []),
    ...(durationSemanticMismatchRows.length > 0 ? ['master_plan_duration_asset_semantic_mismatch'] : []),
    ...(!primaryNetwork.acyclic ? ['master_plan_primary_network_cycle_present'] : []),
    ...(primaryNetwork.componentCount !== 1 ? ['master_plan_primary_network_disconnected'] : []),
    ...(primaryNetwork.rootIds.length !== 1 ? ['master_plan_primary_network_root_count_invalid'] : []),
    ...(primaryNetwork.sinkIds.length !== 1 ? ['master_plan_primary_network_terminal_count_invalid'] : []),
    ...(!schedulePropagationNetwork.acyclic ? ['master_plan_schedule_propagation_cycle_present'] : []),
    ...(syntheticDependencyPhaseInversionCount > 0 ? ['master_plan_synthetic_dependency_phase_inversion'] : []),
    ...(lateActivityPhaseMisclassificationCount > 0 ? ['master_plan_late_activity_phase_misclassified'] : []),
  ])
  const readyForWizardCommit = readinessReasonCodes.length === 0

  return {
    source: 'executable_default_master_plan_assembly',
    version: 'v1.4.23.1-executable-assembly-v1',
    status: readyForWizardCommit
      ? 'executable_default_master_plan_ready'
      : 'executable_default_master_plan_blocked',
    businessType,
    assetAuthority: 'system_standard_seed',
    calibrationPolicy: 'optional_runtime_overlay',
    scheduleRowCount: scheduleRows.length,
    recommendedMinimumScheduleRowCount: recommendedMinimum,
    minimumScheduleRowCount: minimum,
    maximumScheduleRowCount: maximum,
    availableScheduleRowCount,
    operationalRowFloor: rowFloor,
    assetInventoryExhausted: rowVolumeReadiness.assetInventoryExhausted,
    assetInventoryShortfallRowCount: rowVolumeReadiness.assetInventoryShortfallRowCount,
    assetInventoryShortfallAccepted: rowVolumeReadiness.assetInventoryShortfallAccepted,
    rawPromotionCandidateRowCount: rawCandidateRows.length,
    promotableBeforeDurationAuthorityRowCount: promotableBeforeDurationAuthorityRows.length,
    promotionCandidateMissingDurationAuthorityRowCount: promotableBeforeDurationAuthorityRows.length - rawCandidateRows.length,
    promotionCandidateMissingDurationAuthorityReasonCounts,
    promotionCandidateMissingDurationAuthoritySamples: missingDurationAuthorityDiagnostics.slice(0, 24),
    compactedPromotionCandidateRowCount: candidateRows.length,
    promotionCandidateCountsByTemplateGroup,
    promotionCandidateCountsByScopeMode,
    promotedLinkedProjectionRowCount: scheduleRows.filter((row) => (
      truthy(record(row.linkedProjectionSource ?? row.values.linked_projection_source).promotedToExecutableDefaultMasterPlan)
    )).length,
    retainedLinkedProjectionRowCount: candidateRows.filter((row) => !selectedIds.has(row.clientRowId)).length,
    durationBearingScheduleRowCount: durationRows.length,
    executableScheduleRowCount: scheduleRows.filter((row) => truthy(row.values.is_executable)).length,
    summaryScheduleRowCount: scheduleRows.filter((row) => truthy(row.values.is_wbs_summary)).length,
    visibleDependencyCount: coverage.visible,
    totalDependencyCount: coverage.total,
    visibleDependencyCoverageRate: coverage.rate,
    coveredExecutionPhases,
    missingExecutionPhases,
    invalidDurationRowCount: invalidDurationRows.length,
    methodConflictCount: selectedMethodConflictCount,
    durationAssetSemanticMismatchCount: durationSemanticMismatchRows.length,
    dependencyCycleRowCount: primaryNetwork.cycleRowIds.length,
    schedulePropagationCycleRowCount: schedulePropagationNetwork.cycleRowIds.length,
    networkComponentCount: primaryNetwork.componentCount,
    networkRootCount: primaryNetwork.rootIds.length,
    networkSinkCount: primaryNetwork.sinkIds.length,
    syntheticDependencyPhaseInversionCount,
    lateActivityPhaseMisclassificationCount,
    skippedCyclicSiblingDependencyCount,
    ...sequencingFallbacks,
    primaryNetworkBridgeDependencyCount: primaryNetworkStabilization.primaryNetworkBridgeDependencyCount,
    primaryControlSpineDependencyCount: primaryNetworkStabilization.primaryControlSpineDependencyCount,
    readinessReasonCodes,
    readyForWizardCommit,
    commitPolicy: 'wizard_commit_transactional_tasks_and_dependencies',
    mutationBoundary: 'assembly_only_no_db_write',
  }
}
