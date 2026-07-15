import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.LOG_LEVEL ||= 'error'
process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.SUPABASE_ANON_KEY ||= 'local-executable-default-master-plan-simulation-key'
process.env.SUPABASE_SERVICE_KEY ||= process.env.SUPABASE_ANON_KEY

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT_ROOT = path.join(
  REPO_ROOT,
  'project-testing',
  'reports',
  'executable-default-master-plan-20260710',
)
const TSX_BOOTSTRAP_ENV = 'WORKBUDDY_EXECUTABLE_PLAN_SIMULATION_TSX_BOOTSTRAPPED'
const LOCAL_TSX_CLI_MODULE = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')

const BUSINESS_TYPE_LABELS = {
  general_civil: '民用建筑（住宅）',
  hotel: '酒店',
  hospital: '医院',
  school: '学校',
  industrial: '工业厂房',
  data_center: '数据中心',
  transportation_hub: '交通枢纽',
  sports_culture: '体育文化',
  tod_upper_cover: 'TOD 上盖',
  renovation: '改造工程',
  modular_building: '模块化建筑',
}

const READABLE_BUSINESS_TYPE_LABELS = {
  general_civil: '民用建筑（住宅）',
  hotel: '酒店',
  hospital: '医院',
  school: '学校',
  industrial: '工业厂房',
  data_center: '数据中心',
  transportation_hub: '交通枢纽',
  sports_culture: '体育文化',
  tod_upper_cover: 'TOD 上盖',
  renovation: '改造工程',
  modular_building: '模块化建筑',
}

const READABLE_BUSINESS_SUBTYPE_LABELS = {
  civil_residential: '民用建筑（住宅）',
  civil_office_commercial: '民用建筑（办公商业）',
  civil_complex: '民用建筑（多业态综合体）',
  industrial_general: '通用工业厂房',
  industrial_logistics: '智能物流仓储',
  industrial_cleanroom: '洁净生产厂房',
  industrial_heavy: '重型装备制造厂房',
  transport_multimodal: '综合交通枢纽',
  transport_railway_station: '铁路客站',
  transport_metro_interchange: '地铁换乘枢纽',
  transport_bus_terminal: '公路客运站',
  sports_stadium: '体育场',
  sports_indoor_arena: '室内体育馆',
  sports_theater: '剧院',
  sports_exhibition: '展览文化场馆',
  renovation_seismic: '抗震加固改造',
  renovation_energy: '既有建筑节能改造',
  renovation_heritage: '文物建筑保护修缮',
}

function readableBusinessTypeLabel(businessType, businessSubtype = null) {
  return READABLE_BUSINESS_SUBTYPE_LABELS[businessSubtype]
    ?? READABLE_BUSINESS_TYPE_LABELS[businessType]
    ?? businessType
}

function simulationProjectName(businessType, businessSubtype = null) {
  if (businessSubtype === 'civil_residential') return '华东某三栋高层住宅及地下车库项目（模拟）'
  if (businessSubtype === 'civil_office_commercial') return '华东某办公塔楼及商业裙房项目（模拟）'
  if (businessSubtype === 'civil_complex') return '华东某住宅办公商业综合体项目（模拟）'
  return `${readableBusinessTypeLabel(businessType, businessSubtype)}项目（模拟）`
}

const READABLE_PHASE_LABELS = {
  startup_site_setup: '施工准备与现场启动',
  foundation_pit_pile: '基坑、土方与桩基',
  basement_structure: '地下结构',
  superstructure_rhythm: '主体结构节奏',
  secondary_structure_fitout_roughin: '二次结构与初装穿插',
  mep_roughin: '机电预留预埋与安装',
  envelope_roof_facade: '屋面与外立面',
  elevator_installation: '垂直运输与电梯安装',
  interior_fitout_terminal: '室内精装与末端',
  outdoor_municipal_landscape: '室外市政与景观',
  commissioning: '系统调试',
  acceptance_handover: '验收与移交',
}

const SIMULATION_SCALE_PROFILES = {
  general_civil: { totalAreaM2: 120000, buildingCount: 3, standardFloorCount: 24, highestBuildingFloorCount: 32, basementLevelCount: 2, foundationDepthM: 5 },
  hotel: { totalAreaM2: 60000, buildingCount: 1, standardFloorCount: 25, highestBuildingFloorCount: 28, basementLevelCount: 2, foundationDepthM: 5 },
  hospital: { totalAreaM2: 100000, buildingCount: 3, standardFloorCount: 12, highestBuildingFloorCount: 15, basementLevelCount: 2, foundationDepthM: 5 },
  school: { totalAreaM2: 50000, buildingCount: 5, standardFloorCount: 6, highestBuildingFloorCount: 8, basementLevelCount: 1, foundationDepthM: 4 },
  industrial: { totalAreaM2: 80000, buildingCount: 3, standardFloorCount: 2, highestBuildingFloorCount: 4, basementLevelCount: 0, foundationDepthM: 2 },
  data_center: { totalAreaM2: 60000, buildingCount: 2, standardFloorCount: 5, highestBuildingFloorCount: 6, basementLevelCount: 1, foundationDepthM: 4 },
  transportation_hub: { totalAreaM2: 150000, buildingCount: 2, standardFloorCount: 6, highestBuildingFloorCount: 8, basementLevelCount: 2, foundationDepthM: 8 },
  sports_culture: { totalAreaM2: 80000, buildingCount: 1, standardFloorCount: 4, highestBuildingFloorCount: 6, basementLevelCount: 1, foundationDepthM: 4 },
  tod_upper_cover: { totalAreaM2: 180000, buildingCount: 4, standardFloorCount: 30, highestBuildingFloorCount: 35, basementLevelCount: 3, foundationDepthM: 12 },
  renovation: { totalAreaM2: 18000, buildingCount: 1, standardFloorCount: 5, highestBuildingFloorCount: 5, basementLevelCount: 0, foundationDepthM: 0 },
  modular_building: { totalAreaM2: 35000, buildingCount: 4, standardFloorCount: 8, highestBuildingFloorCount: 10, basementLevelCount: 0, foundationDepthM: 2 },
}

export const SIMULATION_SUBTYPE_MATRIX = {
  general_civil: ['civil_residential', 'civil_office_commercial', 'civil_complex'],
  industrial: ['industrial_general', 'industrial_logistics', 'industrial_cleanroom', 'industrial_heavy'],
  transportation_hub: ['transport_multimodal', 'transport_railway_station', 'transport_metro_interchange', 'transport_bus_terminal'],
  sports_culture: ['sports_stadium', 'sports_indoor_arena', 'sports_theater', 'sports_exhibition'],
  renovation: ['renovation_seismic', 'renovation_energy', 'renovation_heritage'],
}

const REPRESENTATIVE_SIMULATION_SUBTYPE = {
  general_civil: 'civil_residential',
  industrial: 'industrial_general',
  transportation_hub: 'transport_multimodal',
  sports_culture: 'sports_stadium',
  renovation: 'renovation_seismic',
}

const SIMULATION_SUBTYPE_FACT_OVERRIDES = {
  civil_residential: { projectTypeCode: 'residential', functionalUsageCodes: ['residential'], functionalCategoryCodes: ['residential'], specialRoomTypeCodes: ['residential_unit'] },
  civil_office_commercial: { projectTypeCode: 'civil_office_commercial', functionalUsageCodes: ['office', 'commercial'], functionalCategoryCodes: ['office_commercial'], specialRoomTypeCodes: ['office_floor', 'commercial_public_area'] },
  civil_complex: { projectTypeCode: 'civil_complex', functionalUsageCodes: ['residential', 'office', 'commercial'], functionalCategoryCodes: ['mixed_use_complex'], specialRoomTypeCodes: ['podium', 'mixed_use_interface'] },
  industrial_general: { projectTypeCode: 'industrial_general', functionalUsageCodes: ['industrial'], functionalCategoryCodes: ['factory'], specialRoomTypeCodes: ['workshop', 'utility_room'] },
  industrial_logistics: { projectTypeCode: 'industrial_logistics', functionalUsageCodes: ['logistics_warehouse'], functionalCategoryCodes: ['automated_warehouse'], specialRoomTypeCodes: ['automated_warehouse', 'high_bay_storage', 'agv_zone'] },
  industrial_cleanroom: { projectTypeCode: 'industrial_cleanroom', functionalUsageCodes: ['process_facility'], functionalCategoryCodes: ['clean_manufacturing'], specialRoomTypeCodes: ['cleanroom', 'clean_utility', 'process_validation'] },
  industrial_heavy: { projectTypeCode: 'industrial_heavy', functionalUsageCodes: ['heavy_manufacturing'], functionalCategoryCodes: ['heavy_equipment'], specialRoomTypeCodes: ['heavy_equipment_bay', 'large_equipment_lifting', 'load_trial'] },
  transport_multimodal: { projectTypeCode: 'transport_multimodal', functionalUsageCodes: ['multimodal_hub'], functionalCategoryCodes: ['transportation'], specialRoomTypeCodes: ['concourse', 'transfer_hall'], physicalZoneTypeCodes: ['station_hall', 'transfer_hall', 'outdoor_site'], hardConstraintCodes: [] },
  transport_railway_station: { projectTypeCode: 'transport_railway_station', functionalUsageCodes: ['railway_station'], functionalCategoryCodes: ['transportation'], specialRoomTypeCodes: ['railway_station', 'platform_interface'], physicalZoneTypeCodes: ['station_hall', 'platform', 'outdoor_site'], hardConstraintCodes: ['operating_line_protection'] },
  transport_metro_interchange: { projectTypeCode: 'transport_metro_interchange', functionalUsageCodes: ['metro_interchange'], functionalCategoryCodes: ['transportation'], specialRoomTypeCodes: ['metro_interchange', 'interchange_passage'], physicalZoneTypeCodes: ['metro_interface', 'interchange_passage'], hardConstraintCodes: ['non_stop_operation', 'night_window'] },
  transport_bus_terminal: { projectTypeCode: 'transport_bus_terminal', functionalUsageCodes: ['bus_terminal'], functionalCategoryCodes: ['transportation'], specialRoomTypeCodes: ['bus_yard', 'charging_system', 'dispatch_system'], physicalZoneTypeCodes: ['station_hall', 'bus_yard', 'outdoor_site'], hardConstraintCodes: [] },
  sports_stadium: { projectTypeCode: 'sports_stadium', functionalUsageCodes: ['stadium'], functionalCategoryCodes: ['sports_venue'], specialRoomTypeCodes: ['stadium_bowl', 'competition_field'], physicalZoneTypeCodes: ['stadium_bowl', 'large_span_roof', 'outdoor_site'] },
  sports_indoor_arena: { projectTypeCode: 'sports_indoor_arena', functionalUsageCodes: ['indoor_arena'], functionalCategoryCodes: ['sports_venue'], specialRoomTypeCodes: ['arena', 'retractable_seating', 'event_floor'] },
  sports_theater: { projectTypeCode: 'sports_theater', functionalUsageCodes: ['theater'], functionalCategoryCodes: ['culture_venue'], specialRoomTypeCodes: ['auditorium', 'stage', 'stage_machinery'] },
  sports_exhibition: { projectTypeCode: 'sports_exhibition', functionalUsageCodes: ['exhibition_venue'], functionalCategoryCodes: ['culture_venue'], specialRoomTypeCodes: ['exhibition_hall', 'collection_storage', 'display_environment'] },
  renovation_seismic: { projectTypeCode: 'renovation_seismic', functionalUsageCodes: ['existing_building'], functionalCategoryCodes: ['seismic_retrofit'], specialRoomTypeCodes: ['structural_reinforcement'] },
  renovation_energy: { projectTypeCode: 'renovation_energy', functionalUsageCodes: ['existing_building'], functionalCategoryCodes: ['energy_retrofit'], specialRoomTypeCodes: ['envelope_energy_retrofit'] },
  renovation_heritage: { projectTypeCode: 'renovation_heritage', functionalUsageCodes: ['heritage_building'], functionalCategoryCodes: ['heritage_conservation'], specialRoomTypeCodes: ['heritage_protection'] },
}

export function buildSimulationScenarios(probes, options = {}) {
  return probes.flatMap((probe) => {
    const explicitSubtype = String(options.businessSubtype ?? '').trim() || null
    const subtypeCodes = explicitSubtype
      ? [explicitSubtype]
      : options.subtypeMatrix
        ? SIMULATION_SUBTYPE_MATRIX[probe.businessType] ?? [null]
        : [REPRESENTATIVE_SIMULATION_SUBTYPE[probe.businessType] ?? null]
    return subtypeCodes.map((businessSubtype) => ({
      probe,
      businessSubtype,
      scenarioCode: `${probe.businessType}--${businessSubtype ?? 'base'}`,
    }))
  })
}

const PHASE_LABELS = {
  startup_site_setup: '施工准备与现场启动',
  foundation_pit_pile: '基坑、土方与桩基',
  basement_structure: '地下结构',
  superstructure_rhythm: '主体结构节奏',
  secondary_structure_fitout_roughin: '二次结构与初装穿插',
  mep_roughin: '机电预留预埋与安装',
  envelope_roof_facade: '屋面与外立面',
  elevator_installation: '垂直运输与电梯',
  interior_fitout_terminal: '室内精装与末端',
  outdoor_municipal_landscape: '室外市政与景观',
  commissioning: '系统调试',
  acceptance_handover: '验收与移交',
}

const EXECUTION_PHASE_SEQUENCE = {
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
const ZERO_BASEMENT_STRUCTURE_CONTRADICTION_TITLE_PATTERN = /地下结构|地下室|出正负零|basement.structure/i
const SHALLOW_FOUNDATION_CONTRADICTION_TITLE_PATTERN = /地下连续墙|地连墙|基坑支护|支护降水|diaphragm/i
const DEEP_FOUNDATION_DURATION_ASSET_PATTERN = /deep_foundation|foundation_pit_(?:retaining_support|diaphragm_wall|bored_pile_support|sheet_pile_wall|secant_pile_wall|smw_wall|soil_nail_wall|cement_soil_wall|internal_strut|anchor_support|interface_support)/i
const CONTRACTUAL_COMPLETION_FILING_TITLE_PATTERN = /竣工验收备案完成/i
const CONTRACTUAL_PROPERTY_HANDOVER_TITLE_PATTERN = /移交(?:与)?保修启动/i
const SYNTHETIC_PROJECT_START_RELEASE_INTENT_PATTERN = /^executable_default_master_plan_(?:component_release|primary_control_spine|startup_release|phase_release)/i
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

function isDirectEntrypoint() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
}

function isTsxRuntime() {
  return process.execArgv.some((arg) => /(?:^|[\\/])tsx[\\/]/i.test(String(arg)))
}

function runViaTsxAndExit() {
  const result = spawnSync(process.execPath, [
    LOCAL_TSX_CLI_MODULE,
    fileURLToPath(import.meta.url),
    ...process.argv.slice(2),
  ], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      [TSX_BOOTSTRAP_ENV]: '1',
    },
    shell: false,
  })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

function parseArgs(argv) {
  const args = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    businessTypes: [],
    businessSubtype: null,
    subtypeMatrix: false,
    primaryBusinessType: 'general_civil',
    plannedStartDate: '2026-07-01',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output-root') {
      args.outputRoot = path.resolve(argv[index + 1])
      index += 1
    } else if (arg === '--business-type') {
      args.businessTypes.push(...String(argv[index + 1] ?? '').split(',').map((item) => item.trim()).filter(Boolean))
      index += 1
    } else if (arg === '--business-subtype') {
      args.businessSubtype = String(argv[index + 1] ?? '').trim() || null
      index += 1
    } else if (arg === '--subtype-matrix') {
      args.subtypeMatrix = true
    } else if (arg === '--primary-business-type') {
      args.primaryBusinessType = String(argv[index + 1] ?? '').trim() || args.primaryBusinessType
      index += 1
    } else if (arg === '--planned-start-date') {
      args.plannedStartDate = String(argv[index + 1] ?? '').trim() || args.plannedStartDate
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/generate-executable-default-master-plan-simulation.mjs [--output-root <dir>] [--business-type <code[,code]>] [--business-subtype <code>] [--subtype-matrix] [--primary-business-type <code>] [--planned-start-date <YYYY-MM-DD>]')
      process.exit(0)
    }
  }
  args.businessTypes = [...new Set(args.businessTypes)]
  return args
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value) {
  return String(value ?? '').trim()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function date(value) {
  const normalized = text(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function inclusiveDays(start, end) {
  if (!start || !end) return null
  return Math.max(1, Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  ) + 1)
}

function dateDayNumber(value) {
  const normalized = date(value)
  if (!normalized) return null
  const parsed = Date.parse(`${normalized}T00:00:00Z`)
  return Number.isNaN(parsed) ? null : Math.round(parsed / 86_400_000)
}

function addCalendarDays(dateText, days) {
  const normalized = date(dateText)
  if (!normalized) return null
  const value = new Date(`${normalized}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + Math.round(days))
  return value.toISOString().slice(0, 10)
}

function generatedRowStart(row) {
  return date(row?.values?.planned_start_date ?? row?.values?.start_date)
}

function generatedRowEnd(row) {
  return date(row?.values?.planned_end_date ?? row?.values?.end_date)
}

function generatedRowReferenceDurationDays(row) {
  const metadata = rowMetadata(row)
  const calculation = record(metadata.durationAssetCalculation ?? row?.values?.duration_asset_calculation)
  return number(calculation.selectedDurationDays ?? calculation.selected_duration_days ?? row?.values?.smart_reference_days)
}

function writeGeneratedRowWindow(row, start, end) {
  row.values = {
    ...row.values,
    planned_start_date: start,
    start_date: start,
    planned_end_date: end,
    end_date: end,
  }
}

function rollupGeneratedSummaryWindows(rows) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const childIdsByParent = new Map()
  for (const row of rows) {
    if (!row.parentClientRowId) continue
    const childIds = childIdsByParent.get(row.parentClientRowId) ?? []
    childIds.push(row.clientRowId)
    childIdsByParent.set(row.parentClientRowId, childIds)
  }
  const visited = new Set()
  const visit = (rowId) => {
    const row = rowById.get(rowId)
    if (!row || visited.has(rowId)) return row
    visited.add(rowId)
    const children = (childIdsByParent.get(rowId) ?? []).map(visit).filter(Boolean)
    if (children.length > 0 && row.values?.is_wbs_summary === true) {
      const starts = children.map(generatedRowStart).filter(Boolean).sort()
      const ends = children.map(generatedRowEnd).filter(Boolean).sort()
      const existingStart = generatedRowStart(row)
      const existingEnd = generatedRowEnd(row)
      const nextStart = [existingStart, starts[0]].filter(Boolean).sort()[0] ?? null
      const nextEnd = [existingEnd, ends.at(-1)].filter(Boolean).sort().at(-1) ?? null
      if (nextStart && nextEnd) writeGeneratedRowWindow(row, nextStart, nextEnd)
    }
    return row
  }
  for (const row of rows) visit(row.clientRowId)
}

function shiftGeneratedRowTree(row, shiftDays, childRowsByParent) {
  const start = generatedRowStart(row)
  const end = generatedRowEnd(row)
  if (start && end) writeGeneratedRowWindow(row, addCalendarDays(start, shiftDays), addCalendarDays(end, shiftDays))
  for (const child of childRowsByParent.get(row.clientRowId) ?? []) {
    shiftGeneratedRowTree(child, shiftDays, childRowsByParent)
  }
}

export function applyWizardDurationDatesForSimulation(rows) {
  for (const row of rows) {
    const values = record(row.values)
    const start = generatedRowStart(row)
    const durationDays = generatedRowReferenceDurationDays(row)
    const isExecutableLeaf = values.is_executable === true
      && values.is_wbs_summary !== true
      && text(values.duration_contribution_mode) === 'duration_bearing'
    if (!isExecutableLeaf || !start || !durationDays || durationDays <= 0) continue
    writeGeneratedRowWindow(row, start, addCalendarDays(start, Math.ceil(durationDays) - 1))
  }

  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const childRowsByParent = new Map()
  for (const row of rows) {
    if (!row.parentClientRowId) continue
    const children = childRowsByParent.get(row.parentClientRowId) ?? []
    children.push(row)
    childRowsByParent.set(row.parentClientRowId, children)
  }
  rollupGeneratedSummaryWindows(rows)

  for (let pass = 0; pass < Math.max(1, rows.length); pass += 1) {
    let changed = false
    for (const row of rows) {
      const currentStart = generatedRowStart(row)
      const currentEnd = generatedRowEnd(row)
      const durationDays = inclusiveDays(currentStart, currentEnd)
      if (!currentStart || !durationDays) continue
      let requiredStart = currentStart
      for (const dependency of row.predecessorDependencies ?? []) {
        const predecessor = rowById.get(text(dependency.clientRowId))
        if (!predecessor) continue
        const predecessorStart = generatedRowStart(predecessor)
        const predecessorEnd = generatedRowEnd(predecessor)
        const lagDays = Math.round(number(dependency.lagDays) ?? 0)
        let candidateStart = null
        if (dependency.dependencyType === 'SS') candidateStart = addCalendarDays(predecessorStart, lagDays)
        else if (dependency.dependencyType === 'FF') candidateStart = addCalendarDays(predecessorEnd, lagDays - durationDays + 1)
        else if (dependency.dependencyType === 'SF') candidateStart = addCalendarDays(predecessorStart, lagDays - durationDays + 1)
        else candidateStart = addCalendarDays(predecessorEnd, lagDays + 1)
        if (candidateStart && candidateStart > requiredStart) requiredStart = candidateStart
      }
      const shiftDays = dateDayNumber(requiredStart) - dateDayNumber(currentStart)
      if (!Number.isFinite(shiftDays) || shiftDays <= 0) continue
      shiftGeneratedRowTree(row, shiftDays, childRowsByParent)
      changed = true
    }
    rollupGeneratedSummaryWindows(rows)
    if (!changed) break
  }
  return rows
}

function escapeCell(value) {
  return text(value).replaceAll('|', '\\|').replaceAll('\n', '<br>') || '-'
}

function rowMetadata(row) {
  return record(row.values?.standard_task_metadata ?? row.values?.standardTaskMetadata)
}

function rowProjectionMode(row) {
  const metadata = rowMetadata(row)
  return text(row.rowProjectionMode ?? row.values?.row_projection_mode ?? metadata.rowProjectionMode)
}

function buildHierarchyLevel(row, rowById) {
  let level = 1
  let parentId = row.parentClientRowId
  const visited = new Set([row.clientRowId])
  while (parentId && rowById.has(parentId) && !visited.has(parentId)) {
    visited.add(parentId)
    level += 1
    parentId = rowById.get(parentId).parentClientRowId
  }
  return level
}

const CONSTRUCTION_METHOD_GROUPS = [
  [
    ['spread_foundation', /无筋扩展基础|钢筋混凝土扩展基础|独立基础/],
    ['raft_foundation', /筏型与箱型基础|筏板基础|箱型基础/],
    ['bored_pile', /泥浆护壁成孔灌注桩|钻孔灌注桩|旋挖灌注桩/],
    ['precast_pile', /预制桩基础|预制管桩|PHC/],
    ['dry_bored_pile', /干作业成孔桩/],
    ['long_auger_pile', /长螺旋钻孔压灌桩/],
    ['driven_cast_pile', /沉管灌注桩/],
    ['steel_pile', /钢桩基础/],
    ['rock_anchor_foundation', /岩石锚杆基础/],
    ['caisson_foundation', /沉井与沉箱基础/],
    ['steel_composite_foundation', /钢结构基础|钢管混凝土结构基础|型钢混凝土结构基础/],
    ['cfg_pile', /\bCFG\b|CFG 桩/],
  ],
  [
    ['diaphragm_wall', /地下连续墙/],
    ['bored_pile_support', /灌注桩排桩围护墙|排桩支护/],
    ['sheet_pile_support', /板桩围护墙/],
    ['secant_pile_support', /咬合桩围护墙/],
    ['smw_wall', /型钢水泥土搅拌墙|SMW/],
    ['gravity_wall', /水泥土重力式挡墙/],
    ['combined_structure_support', /与主体结构相结合的基坑支护/],
    ['trd_wall', /\bTRD\b|TRD 等厚/],
    ['soil_nail_wall', /土钉墙/],
  ],
  [
    ['internal_strut', /内支撑/],
    ['anchor_support', /锚杆|锚索支护/],
  ],
]

const DURATION_SEMANTIC_RULES = [
  { seed: /foundation_pit_(?:retaining_support|diaphragm_wall)|expert_foundation_pit_support/, title: /基坑|支护|基坑围护|连续墙|排桩|板桩|咬合桩|挡墙|降水|内支撑|锚索|锚杆|注浆|模块基础|吊装道路|anchor|lift.path/ },
  { seed: /pile_foundation|bored_cast_in_place_pile|expert_pile_foundation/, title: /桩|成孔|成桩|承台|桩基/ },
  { seed: /earthwork/, title: /土方|开挖|回填|场地平整/ },
  { seed: /basement_waterproof|roof_waterproof/, title: /防水|保温|闭水|回填|密封|屋面|外围护/ },
  { seed: /basement_structure|shallow_foundation_concrete_structure|cast_in_place_(?:concrete|formwork)|cushion_and_blinding/, title: /混凝土|主体结构|地下(?:室)?结构|塔楼结构|裙房|首层|转换层|屋面层|机房结构|模板|钢筋|垫层|正负零|结构施工|结构验收|基础|承台|地梁/ },
  { seed: /steel_erection|large_span_roof_structure/, title: /钢结构|钢构件|钢构|桁架|大跨度|网架|屋盖|楼承板|高强螺栓|焊接|金属围护/ },
  { seed: /masonry/, title: /砌体|二次结构|填充墙/ },
  { seed: /mep_plumbing_fire_pipe/, title: /机电|给水|排水|消防|管道|管线|通风|排烟|空调|电气|照明|布线|报警|设备监控|医气|医疗气体|污水|医废|阀箱|气源站|真空|压缩空气|变配电|供电|动力接驳|弱电|声光电|设备安装|管井|预留预埋/ },
  { seed: /hvac_cleanroom/, title: /洁净空调|净化空调|高效过滤|压差|HEPA|送风末端|洁净验证|季节工况/ },
  { seed: /interior_(?:public|unit)_finish/, title: /装修|内装|精装|地面|地坪|抹灰|门窗|墙顶|彩钢板|涂饰|吊顶|卫浴|客房|大堂|宴会|围护结构|气密窗|手术室墙顶|末端安装/ },
  { seed: /curtain_wall/, title: /幕墙|外立面|门窗|外围护|围护防水|防水与密封|围护系统节能/ },
  { seed: /elevator/, title: /电梯|垂直运输/ },
  { seed: /outdoor_utilities/, title: /室外|道路|景观|管网|场坪|绿化/ },
  { seed: /single_system_commissioning/, title: /单机调试|单系统调试/ },
  { seed: /integrated_commissioning/, title: /联调|调试|验收|移交|投产|开业|试运营|整改|销项|验证|演练|试车/ },
  { seed: /pc_component_hoisting/, title: /模块|吊装|运输|连接|装配|混凝土结构|砌体结构/ },
  { seed: /renovation_retrofit/, title: /改造|拆除|拆改|鉴定|加固|补强|植筋|粘钢|碳纤维|恢复|导改|切换|既有结构|混凝土结构|砌体结构/ },
  { seed: /site_setup_temp_works/, title: /施工准备|场地移交|临建|围挡|临时道路|临水|临电|塔吊|深化设计|工厂生产|吊装道路|运营线保护|监测|临时防护/ },
]

function durationSemanticCompatible(row) {
  const durationContributionMode = text(row.durationContributionMode)
  if (row.isWbsSummary === true || (durationContributionMode && durationContributionMode !== 'duration_bearing')) {
    return true
  }
  const seed = text(row.standardWorkDurationSeedStableCode)
  if (!seed) return false
  if (seed === 'interior_public_finish' && text(row.wbsCode) === 'BTMP-HTL-01') return true
  const rule = DURATION_SEMANTIC_RULES.find((item) => item.seed.test(seed))
  return !rule || rule.title.test(`${text(row.title)} ${text(row.wbsCode)} ${text(row.executionLane)}`)
}

function auditMethodConflicts(rows) {
  let conflictCount = 0
  const conflicts = []
  for (const group of CONSTRUCTION_METHOD_GROUPS) {
    const matchedFamilies = group
      .filter(([, pattern]) => rows.some((row) => pattern.test(text(row.title))))
      .map(([family]) => family)
    if (matchedFamilies.length <= 1) continue
    conflictCount += matchedFamilies.length - 1
    conflicts.push(matchedFamilies)
  }
  return { conflictCount, conflicts }
}

function auditDuplicateDependencyPairs(rows) {
  let duplicateCount = 0
  const pairs = []
  for (const row of rows) {
    const countByPredecessorId = new Map()
    for (const dependency of row.predecessors ?? []) {
      const predecessorId = text(dependency.clientRowId)
      if (!predecessorId) continue
      countByPredecessorId.set(predecessorId, (countByPredecessorId.get(predecessorId) ?? 0) + 1)
    }
    for (const [predecessorId, count] of countByPredecessorId) {
      if (count <= 1) continue
      duplicateCount += count - 1
      pairs.push({
        predecessorClientRowId: predecessorId,
        successorClientRowId: text(row.clientRowId),
        successorWbsCode: text(row.wbsCode),
        relationCount: count,
      })
    }
  }
  return { duplicateCount, pairs }
}

function auditNetwork(rows) {
  const ids = new Set(rows.map((row) => text(row.clientRowId)))
  const outgoing = new Map(rows.map((row) => [text(row.clientRowId), []]))
  const incoming = new Map(rows.map((row) => [text(row.clientRowId), []]))
  const undirected = new Map(rows.map((row) => [text(row.clientRowId), new Set()]))
  for (const row of rows) {
    const to = text(row.clientRowId)
    for (const dependency of row.predecessors ?? []) {
      const from = text(dependency.clientRowId)
      if (!ids.has(from) || from === to) continue
      outgoing.get(from).push(to)
      incoming.get(to).push(from)
      undirected.get(from).add(to)
      undirected.get(to).add(from)
    }
  }
  const indegree = new Map([...incoming].map(([id, values]) => [id, values.length]))
  const queue = [...indegree].filter(([, count]) => count === 0).map(([id]) => id)
  const visitedTopological = []
  while (queue.length > 0) {
    const id = queue.shift()
    visitedTopological.push(id)
    for (const successor of outgoing.get(id)) {
      indegree.set(successor, indegree.get(successor) - 1)
      if (indegree.get(successor) === 0) queue.push(successor)
    }
  }
  const seen = new Set()
  let componentCount = 0
  for (const id of ids) {
    if (seen.has(id)) continue
    componentCount += 1
    const stack = [id]
    seen.add(id)
    while (stack.length > 0) {
      const current = stack.pop()
      for (const neighbor of undirected.get(current)) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        stack.push(neighbor)
      }
    }
  }
  return {
    acyclic: visitedTopological.length === rows.length,
    cycleRowIds: rows.filter((row) => !visitedTopological.includes(text(row.clientRowId))).map((row) => text(row.clientRowId)),
    componentCount,
    rootCount: [...incoming.values()].filter((values) => values.length === 0).length,
    sinkCount: [...outgoing.values()].filter((values) => values.length === 0).length,
    incoming,
    outgoing,
  }
}

function auditSchedulePropagation(rows) {
  return auditNetwork(rows.map((row) => ({
    ...row,
    predecessors: [
      ...(row.predecessors ?? []),
      ...(text(row.parentClientRowId)
        ? [{ clientRowId: text(row.parentClientRowId), dependencyType: 'HIERARCHY', lagDays: 0 }]
        : []),
    ],
  })))
}

function auditDependencyDateConstraints(rows) {
  const rowById = new Map(rows.map((row) => [text(row.clientRowId), row]))
  const violations = []
  for (const successor of rows) {
    const successorStartDay = dateDayNumber(successor.plannedStartDate)
    const successorEndDay = dateDayNumber(successor.plannedEndDate)
    if (successorStartDay === null || successorEndDay === null) continue
    for (const dependency of successor.predecessors ?? []) {
      const predecessor = rowById.get(text(dependency.clientRowId))
      if (!predecessor) continue
      const predecessorStartDay = dateDayNumber(predecessor.plannedStartDate)
      const predecessorEndDay = dateDayNumber(predecessor.plannedEndDate)
      if (predecessorStartDay === null || predecessorEndDay === null) continue
      const lagDays = Number.isFinite(Number(dependency.lagDays))
        ? Math.round(Number(dependency.lagDays))
        : 0
      const dependencyType = text(dependency.dependencyType).toUpperCase() || 'FS'
      const actualDay = dependencyType === 'FF' || dependencyType === 'SF'
        ? successorEndDay
        : successorStartDay
      const requiredDay = dependencyType === 'SS'
        ? predecessorStartDay + lagDays
        : dependencyType === 'FF'
          ? predecessorEndDay + lagDays
          : dependencyType === 'SF'
            ? predecessorStartDay + lagDays
            : predecessorEndDay + lagDays + 1
      if (actualDay >= requiredDay) continue
      violations.push({
        predecessorClientRowId: text(predecessor.clientRowId),
        predecessorWbsCode: text(predecessor.wbsCode),
        predecessorTitle: text(predecessor.title),
        predecessorStartDate: text(predecessor.plannedStartDate),
        predecessorEndDate: text(predecessor.plannedEndDate),
        successorClientRowId: text(successor.clientRowId),
        successorWbsCode: text(successor.wbsCode),
        successorTitle: text(successor.title),
        successorStartDate: text(successor.plannedStartDate),
        successorEndDate: text(successor.plannedEndDate),
        dependencyType,
        lagDays,
        violatedByDays: requiredDay - actualDay,
        intentCode: text(dependency.intentCode),
      })
    }
  }
  return violations
}

function auditParentChildScheduleWindows(rows) {
  const rowById = new Map(rows.map((row) => [text(row.clientRowId), row]))
  const violations = []
  for (const child of rows) {
    const parent = rowById.get(text(child.parentClientRowId))
    if (!parent || parent.isWbsSummary !== true) continue
    const parentStartDay = dateDayNumber(parent.plannedStartDate)
    const parentEndDay = dateDayNumber(parent.plannedEndDate)
    const childStartDay = dateDayNumber(child.plannedStartDate)
    const childEndDay = dateDayNumber(child.plannedEndDate)
    if ([parentStartDay, parentEndDay, childStartDay, childEndDay].some((day) => day === null)) continue
    if (childStartDay >= parentStartDay && childEndDay <= parentEndDay) continue
    violations.push({
      parentClientRowId: text(parent.clientRowId),
      parentWbsCode: text(parent.wbsCode),
      parentTitle: text(parent.title),
      parentStartDate: text(parent.plannedStartDate),
      parentEndDate: text(parent.plannedEndDate),
      childClientRowId: text(child.clientRowId),
      childWbsCode: text(child.wbsCode),
      childTitle: text(child.title),
      childStartDate: text(child.plannedStartDate),
      childEndDate: text(child.plannedEndDate),
    })
  }
  return violations
}

function rowPhysicalScopeKey(row) {
  return text(row.buildingObjectId) || 'project_shared'
}

function auditSpecialtyMainlineSequence(plan, rows) {
  const businessType = text(plan?.project?.businessType)
  const violations = []
  if (businessType === 'industrial') {
    const foundations = rows.filter((row) => text(row.wbsCode) === 'IPL-02-01-01')
    for (const foundation of foundations) {
      const scopeKey = rowPhysicalScopeKey(foundation)
      const equipment = rows.find((row) => (
        text(row.wbsCode) === 'IPL-03-01-01' && rowPhysicalScopeKey(row) === scopeKey
      ))
      const control = rows.find((row) => (
        text(row.wbsCode) === 'IPL-03-01-02' && rowPhysicalScopeKey(row) === scopeKey
      ))
      const foundationStart = dateDayNumber(foundation.plannedStartDate)
      const equipmentStart = dateDayNumber(equipment?.plannedStartDate)
      const equipmentEnd = dateDayNumber(equipment?.plannedEndDate)
      const controlEnd = dateDayNumber(control?.plannedEndDate)
      if (equipment && foundationStart !== null && equipmentStart !== null && foundationStart >= equipmentStart) {
        violations.push({
          code: 'industrial_equipment_foundation_not_released_before_setting',
          scopeKey,
          predecessorWbsCode: text(foundation.wbsCode),
          predecessorTitle: text(foundation.title),
          predecessorStartDate: text(foundation.plannedStartDate),
          successorWbsCode: text(equipment.wbsCode),
          successorTitle: text(equipment.title),
          successorStartDate: text(equipment.plannedStartDate),
        })
      }
      if (equipment && control && equipmentEnd !== null && controlEnd !== null && controlEnd < equipmentEnd) {
        violations.push({
          code: 'industrial_control_integration_finishes_before_equipment_trial',
          scopeKey,
          predecessorWbsCode: text(equipment.wbsCode),
          predecessorTitle: text(equipment.title),
          predecessorEndDate: text(equipment.plannedEndDate),
          successorWbsCode: text(control.wbsCode),
          successorTitle: text(control.title),
          successorEndDate: text(control.plannedEndDate),
        })
      }
    }
  }
  if (businessType === 'modular_building') {
    const factoryTests = rows.filter((row) => text(row.wbsCode) === 'MIC-02-01-02')
    for (const factoryTest of factoryTests) {
      const scopeKey = rowPhysicalScopeKey(factoryTest)
      const hoisting = rows.find((row) => (
        ['MIC-04-01-01', 'MIC-06-01-15'].includes(text(row.wbsCode))
        && rowPhysicalScopeKey(row) === scopeKey
      ))
      const factoryEnd = dateDayNumber(factoryTest.plannedEndDate)
      const hoistingStart = dateDayNumber(hoisting?.plannedStartDate)
      if (!hoisting || factoryEnd === null || hoistingStart === null || factoryEnd < hoistingStart) continue
      violations.push({
        code: 'modular_factory_testing_not_completed_before_site_hoisting',
        scopeKey,
        predecessorWbsCode: text(factoryTest.wbsCode),
        predecessorTitle: text(factoryTest.title),
        predecessorEndDate: text(factoryTest.plannedEndDate),
        successorWbsCode: text(hoisting.wbsCode),
        successorTitle: text(hoisting.title),
        successorStartDate: text(hoisting.plannedStartDate),
      })
    }
  }
  return violations
}

function auditProjectScopeContradictions(plan, rows) {
  const businessType = text(plan?.project?.businessType)
  if (businessType === 'renovation') return []
  const declaredBuildingCount = number(plan?.project?.buildingCount)
  if (!declaredBuildingCount || declaredBuildingCount < 1) return []
  const generatedBuildingObjectIds = [...new Set(rows.map((row) => text(row.buildingObjectId)).filter(Boolean))]
  if (generatedBuildingObjectIds.length <= declaredBuildingCount) return []
  return [{
    businessType,
    declaredBuildingCount,
    generatedBuildingObjectCount: generatedBuildingObjectIds.length,
    generatedBuildingObjectIds,
  }]
}

function auditCriticalPath(plan, network) {
  const rows = plan.rows ?? []
  const criticalRows = rows.filter((row) => row.critical)
  const criticalIds = new Set(criticalRows.map((row) => text(row.clientRowId)))
  const starts = criticalRows.filter((row) => text(row.plannedStartDate) === text(plan.summary?.projectStartDate))
  const ends = criticalRows.filter((row) => text(row.plannedEndDate) === text(plan.summary?.projectEndDate))
  let continuous = false
  const queue = starts.map((row) => text(row.clientRowId))
  const seen = new Set(queue)
  while (queue.length > 0) {
    const current = queue.shift()
    if (ends.some((row) => text(row.clientRowId) === current)) {
      continuous = true
      break
    }
    for (const successor of network.outgoing.get(current) ?? []) {
      if (!criticalIds.has(successor) || seen.has(successor)) continue
      seen.add(successor)
      queue.push(successor)
    }
  }
  return {
    rowCount: criticalRows.length,
    coversProjectStart: starts.length > 0,
    coversProjectEnd: ends.length > 0,
    continuous,
  }
}

function auditSyntheticPhaseInversions(rows) {
  const rowById = new Map(rows.map((row) => [text(row.clientRowId), row]))
  const violations = []
  for (const successor of rows) {
    const successorRank = EXECUTION_PHASE_SEQUENCE[text(successor.executionPhase)]
    if (successorRank === undefined) continue
    for (const dependency of successor.predecessors ?? []) {
      if (!text(dependency.intentCode).startsWith('executable_default_master_plan_')) continue
      const predecessor = rowById.get(text(dependency.clientRowId))
      if (!predecessor) continue
      const predecessorRank = EXECUTION_PHASE_SEQUENCE[text(predecessor.executionPhase)]
      if (predecessorRank === undefined || predecessorRank <= successorRank) continue
      violations.push({
        predecessorWbsCode: text(predecessor.wbsCode),
        predecessorPhase: text(predecessor.executionPhase),
        successorWbsCode: text(successor.wbsCode),
        successorPhase: text(successor.executionPhase),
        intentCode: text(dependency.intentCode),
      })
    }
  }
  return violations
}

function auditProjectFactContradictions(plan, rows) {
  const project = record(plan?.project)
  const basementLevelCount = number(project.basementLevelCount ?? project.basement_level_count)
  const foundationDepthM = number(project.foundationDepthM ?? project.foundation_depth_m)
  if (basementLevelCount !== 0) return []
  const shallowFoundation = foundationDepthM !== null && foundationDepthM < 3

  return rows
    .filter((row) => {
      const titleAndCode = `${text(row.title)} ${text(row.wbsCode)}`
      return text(row.executionPhase) === 'basement_structure'
        || ZERO_BASEMENT_STRUCTURE_CONTRADICTION_TITLE_PATTERN.test(titleAndCode)
        || (shallowFoundation && (
          SHALLOW_FOUNDATION_CONTRADICTION_TITLE_PATTERN.test(titleAndCode)
          || DEEP_FOUNDATION_DURATION_ASSET_PATTERN.test(text(row.standardWorkDurationSeedStableCode))
        ))
    })
    .map((row) => ({
      wbsCode: text(row.wbsCode),
      title: text(row.title),
      executionPhase: text(row.executionPhase),
      standardWorkDurationSeedStableCode: text(row.standardWorkDurationSeedStableCode),
      basementLevelCount,
      foundationDepthM,
    }))
}

function hasPhysicalWorkHandoffPath(row, rowById) {
  const queue = [...(row.predecessors ?? [])]
  const seen = new Set()
  while (queue.length > 0) {
    const dependency = queue.shift()
    if (SYNTHETIC_PROJECT_START_RELEASE_INTENT_PATTERN.test(text(dependency.intentCode))) continue
    const predecessorId = text(dependency.clientRowId)
    if (!predecessorId || seen.has(predecessorId)) continue
    seen.add(predecessorId)
    const predecessor = rowById.get(predecessorId)
    if (!predecessor) continue
    const predecessorRank = EXECUTION_PHASE_SEQUENCE[text(predecessor.executionPhase)]
    if (predecessorRank !== undefined
      && predecessorRank > EXECUTION_PHASE_SEQUENCE.startup_site_setup
      && predecessorRank < EXECUTION_PHASE_SEQUENCE.commissioning
      && predecessor.isMilestone !== true
      && predecessor.durationContributionMode !== 'record_only') return true
    queue.push(...(predecessor.predecessors ?? []))
  }
  return false
}

function auditLateActivitiesMissingPhysicalHandoff(rows) {
  const rowById = new Map(rows.map((row) => [text(row.clientRowId), row]))
  return rows
    .filter((row) => (
      row.isMilestone !== true
      && row.durationContributionMode !== 'record_only'
      && ['commissioning', 'acceptance_handover'].includes(text(row.executionPhase))
      && LATE_ACTIVITY_TITLE_PATTERN.test(text(row.title))
    ))
    .filter((row) => !hasPhysicalWorkHandoffPath(row, rowById))
    .map((row) => ({
      wbsCode: text(row.wbsCode),
      title: text(row.title),
      executionPhase: text(row.executionPhase),
      predecessorWbsCodes: (row.predecessors ?? []).map((dependency) => text(dependency.wbsCode)),
      predecessorIntentCodes: (row.predecessors ?? []).map((dependency) => text(dependency.intentCode)),
    }))
}

function contractualCloseoutRole(row) {
  return text(row.contractualCloseoutRole)
}

function auditContractualCloseoutMissingHandoff(plan, rows) {
  const rowById = new Map(rows.map((row) => [text(row.clientRowId), row]))
  const businessType = text(plan?.project?.businessType)
  const explicitCloseoutRows = rows.filter((row) => contractualCloseoutRole(row))
  if (!NON_RESIDENTIAL_BUSINESS_TYPES.has(businessType) && explicitCloseoutRows.length === 0) return []
  const filing = rows.find((row) => contractualCloseoutRole(row) === 'completion_filing')
    ?? rows.find((row) => CONTRACTUAL_COMPLETION_FILING_TITLE_PATTERN.test(text(row.title)))
  const propertyHandover = rows.find((row) => contractualCloseoutRole(row) === 'property_handover')
    ?? rows.find((row) => CONTRACTUAL_PROPERTY_HANDOVER_TITLE_PATTERN.test(text(row.title)))
  const violations = []
  const terminalControlCode = text(filing?.contractualTerminalControlCode)
  const terminalControl = rows.find((row) => text(row.wbsCode) === terminalControlCode)
  const filingHasDeclaredTerminal = Boolean(filing && terminalControlCode && terminalControl
    && terminalControl.isMilestone !== true
    && terminalControl.durationContributionMode !== 'record_only'
    && ['commissioning', 'acceptance_handover'].includes(text(terminalControl.executionPhase))
    && (filing.predecessors ?? []).some((dependency) => (
      text(dependency.clientRowId) === text(terminalControl.clientRowId)
    )))
  if (!filingHasDeclaredTerminal) {
    violations.push({
      closeoutRole: 'completion_filing',
      wbsCode: text(filing?.wbsCode),
      title: text(filing?.title),
      declaredTerminalControlCode: terminalControlCode,
      predecessorWbsCodes: (filing?.predecessors ?? []).map((dependency) => text(dependency.wbsCode)),
    })
  }

  const propertyHasFiling = Boolean(propertyHandover && filing
    && contractualCloseoutRole(propertyHandover) === 'property_handover'
    && text(propertyHandover.contractualTerminalControlCode) === terminalControlCode
    && (propertyHandover.predecessors ?? []).some((dependency) => (
      text(dependency.clientRowId) === text(filing.clientRowId)
    )))
  if (!propertyHasFiling) {
    violations.push({
      closeoutRole: 'property_handover',
      wbsCode: text(propertyHandover?.wbsCode),
      title: text(propertyHandover?.title),
      declaredTerminalControlCode: text(propertyHandover?.contractualTerminalControlCode),
      predecessorWbsCodes: (propertyHandover?.predecessors ?? []).map((dependency) => text(dependency.wbsCode)),
    })
  }
  return violations
}

export function auditConstructionQuality(plan) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : []
  const networkRows = rows.filter((row) => !(
    row.isWbsSummary === true && row.durationContributionMode === 'record_only'
  ))
  const network = auditNetwork(networkRows)
  const schedulePropagation = auditSchedulePropagation(rows)
  const methods = auditMethodConflicts(rows)
  const duplicateDependencies = auditDuplicateDependencyPairs(rows)
  const syntheticPhaseInversions = auditSyntheticPhaseInversions(rows)
  const projectFactContradictions = auditProjectFactContradictions(plan, rows)
  const lateActivitiesMissingPhysicalHandoff = auditLateActivitiesMissingPhysicalHandoff(rows)
  const contractualCloseoutMissingHandoff = auditContractualCloseoutMissingHandoff(plan, rows)
  const dependencyDateViolations = auditDependencyDateConstraints(rows)
  const parentChildWindowViolations = auditParentChildScheduleWindows(rows)
  const specialtyMainlineViolations = auditSpecialtyMainlineSequence(plan, rows)
  const projectScopeContradictions = auditProjectScopeContradictions(plan, rows)
  const lateActivityPhaseMisclassifications = rows.filter((row) => (
    text(row.executionPhase) === 'management_support'
    && LATE_ACTIVITY_TITLE_PATTERN.test(text(row.title))
  ))
  const durationSemanticMismatches = rows.filter((row) => !durationSemanticCompatible(row))
  const criticalPath = auditCriticalPath({ ...plan, rows: networkRows }, network)
  const scheduleSpanDays = inclusiveDays(plan?.summary?.projectStartDate, plan?.summary?.projectEndDate)
  const blockers = [
    !network.acyclic ? 'dependency_cycle_detected' : null,
    !schedulePropagation.acyclic ? 'schedule_propagation_cycle_detected' : null,
    network.componentCount !== 1 ? 'primary_schedule_network_disconnected' : null,
    network.rootCount !== 1 ? 'primary_schedule_root_not_unique' : null,
    network.sinkCount !== 1 ? 'primary_schedule_terminal_not_unique' : null,
    methods.conflictCount > 0 ? 'mutually_exclusive_method_conflict' : null,
    durationSemanticMismatches.length > 0 ? 'duration_asset_semantic_mismatch' : null,
    duplicateDependencies.duplicateCount > 0 ? 'duplicate_dependency_pair_detected' : null,
    !scheduleSpanDays || scheduleSpanDays > 3650 ? 'schedule_span_exceeds_10_year_safety_cap' : null,
    !criticalPath.coversProjectStart ? 'critical_path_missing_project_start' : null,
    !criticalPath.coversProjectEnd ? 'critical_path_missing_project_end' : null,
    !criticalPath.continuous ? 'critical_path_not_continuous' : null,
    syntheticPhaseInversions.length > 0 ? 'synthetic_dependency_phase_inversion' : null,
    lateActivityPhaseMisclassifications.length > 0 ? 'late_activity_phase_misclassified' : null,
    projectFactContradictions.length > 0 ? 'project_fact_task_contradiction' : null,
    lateActivitiesMissingPhysicalHandoff.length > 0 ? 'late_activity_missing_physical_handoff' : null,
    contractualCloseoutMissingHandoff.length > 0 ? 'contractual_closeout_missing_business_handoff' : null,
    dependencyDateViolations.length > 0 ? 'dependency_date_constraint_violated' : null,
    parentChildWindowViolations.length > 0 ? 'parent_child_schedule_window_violated' : null,
    specialtyMainlineViolations.length > 0 ? 'specialty_mainline_sequence_violated' : null,
    projectScopeContradictions.length > 0 ? 'project_scope_task_contradiction' : null,
  ].filter(Boolean)
  return {
    blockers,
    network: {
      acyclic: network.acyclic,
      cycleRowIds: network.cycleRowIds,
      componentCount: network.componentCount,
      rootCount: network.rootCount,
      sinkCount: network.sinkCount,
    },
    schedulePropagation: {
      acyclic: schedulePropagation.acyclic,
      cycleRowIds: schedulePropagation.cycleRowIds,
    },
    methodConflictCount: methods.conflictCount,
    methodConflicts: methods.conflicts,
    durationSemanticMismatchCount: durationSemanticMismatches.length,
    durationSemanticMismatchRows: durationSemanticMismatches.map((row) => ({
      wbsCode: text(row.wbsCode),
      title: text(row.title),
      standardWorkDurationSeedStableCode: text(row.standardWorkDurationSeedStableCode),
    })),
    duplicateDependencyPairCount: duplicateDependencies.duplicateCount,
    duplicateDependencyPairs: duplicateDependencies.pairs,
    syntheticPhaseInversionCount: syntheticPhaseInversions.length,
    syntheticPhaseInversions,
    projectFactContradictionCount: projectFactContradictions.length,
    projectFactContradictions,
    lateActivityMissingPhysicalHandoffCount: lateActivitiesMissingPhysicalHandoff.length,
    lateActivitiesMissingPhysicalHandoff,
    contractualCloseoutMissingHandoffCount: contractualCloseoutMissingHandoff.length,
    contractualCloseoutMissingHandoff,
    dependencyDateViolationCount: dependencyDateViolations.length,
    dependencyDateViolations,
    parentChildWindowViolationCount: parentChildWindowViolations.length,
    parentChildWindowViolations,
    specialtyMainlineViolationCount: specialtyMainlineViolations.length,
    specialtyMainlineViolations,
    projectScopeContradictionCount: projectScopeContradictions.length,
    projectScopeContradictions,
    lateActivityPhaseMisclassificationCount: lateActivityPhaseMisclassifications.length,
    lateActivityPhaseMisclassifications: lateActivityPhaseMisclassifications.map((row) => ({
      wbsCode: text(row.wbsCode),
      title: text(row.title),
      executionPhase: text(row.executionPhase),
    })),
    scheduleSpanDays,
    scheduleSpanSafetyCapDays: 3650,
    criticalPath,
  }
}

function toPlanRow(row, rowById, criticalIds) {
  const values = record(row.values)
  const metadata = rowMetadata(row)
  const suggestion = record(values.duration_suggestion ?? values.durationSuggestion ?? metadata.durationSuggestion)
  const mapping = record(metadata.durationAssetMapping ?? values.duration_asset_mapping)
  const calculation = record(metadata.durationAssetCalculation ?? values.duration_asset_calculation)
  const visibilityDecision = record(metadata.masterPlanVisibilityDecision)
  const linkedProjectionSource = record(row.linkedProjectionSource ?? values.linked_projection_source)
  const businessTypeMasterPlan = record(metadata.businessTypeMasterPlan)
  const executionPhase = text(row.executionPhase ?? values.execution_phase ?? metadata.executionPhase) || null
  const t2RhythmTemplateId = text(mapping.t2RhythmTemplateId ?? calculation.t2RhythmTemplateId) || null
  const start = date(values.planned_start_date ?? values.start_date)
  const end = date(values.planned_end_date ?? values.end_date)
  const predecessors = (row.predecessorDependencies ?? []).map((dependency) => ({
    clientRowId: text(dependency.clientRowId),
    wbsCode: text(rowById.get(text(dependency.clientRowId))?.values?.standard_work_code),
    title: text(rowById.get(text(dependency.clientRowId))?.values?.title),
    dependencyType: text(dependency.dependencyType) || 'FS',
    lagDays: number(dependency.lagDays) ?? 0,
    intentCode: text(dependency.intentCode) || null,
  }))
  return {
    clientRowId: row.clientRowId,
    parentClientRowId: row.parentClientRowId ?? null,
    sortOrder: row.sortOrder,
    hierarchyLevel: buildHierarchyLevel(row, rowById),
    wbsCode: text(values.standard_work_code ?? metadata.stableCode ?? values.template_node_id ?? row.clientRowId),
    title: text(values.title ?? values.name ?? values.standard_work_name),
    isWbsSummary: values.is_wbs_summary === true || text(values.is_wbs_summary).toLowerCase() === 'true',
    isExecutable: values.is_executable === true || text(values.is_executable).toLowerCase() === 'true',
    isMilestone: values.is_milestone === true || text(values.is_milestone).toLowerCase() === 'true',
    categoryType: text(values.category_type ?? values.wbs_node_type) || null,
    planItemKind: text(row.planItemKind ?? values.plan_item_kind ?? metadata.planItemKind) || null,
    durationContributionMode: text(values.duration_contribution_mode ?? metadata.durationContributionMode) || null,
    executionPhase,
    executionPhaseLabel: PHASE_LABELS[executionPhase] ?? null,
    executionLane: text(row.executionLane ?? values.execution_lane ?? metadata.executionLane) || null,
    contractualCloseoutRole: text(
      values.contractual_closeout_role ?? businessTypeMasterPlan.contractualCloseoutRole,
    ) || null,
    contractualTerminalControlCode: text(
      values.contractual_terminal_control_code ?? businessTypeMasterPlan.contractualTerminalControlCode,
    ) || null,
    organizationLane: text(values.organization_lane) || null,
    buildingObjectId: text(values.building_object_id) || null,
    buildingSequenceNumber: number(values.building_sequence_number),
    plannedStartDate: start,
    plannedEndDate: end,
    calendarDurationDays: inclusiveDays(start, end),
    referenceDurationDays: number(values.smart_reference_days ?? suggestion.planReferenceDays ?? suggestion.riskP50DurationDays),
    riskP20DurationDays: number(suggestion.riskP20DurationDays),
    riskP50DurationDays: number(suggestion.riskP50DurationDays),
    riskP80DurationDays: number(suggestion.riskP80DurationDays),
    durationAuthority: text(values.duration_authority) || null,
    durationCalibrationSource: text(values.duration_calibration_source ?? suggestion.durationCalibrationSource) || null,
    durationProvenance: text(values.duration_provenance ?? suggestion.durationProvenance) || null,
    standardWorkDurationSeedStableCode: text(
      mapping.standardWorkDurationSeedStableCode ?? calculation.standardWorkDurationSeedStableCode,
    ) || null,
    t2RhythmTemplateId,
    t2RhythmApplicability: t2RhythmTemplateId
      ? 'mapped'
      : executionPhase === 'startup_site_setup'
        ? 'not_applicable_one_off_startup'
        : 'required_missing',
    runtimeCalibrationApplied: calculation.runtimeReferenceDaysConsumed === true,
    masterPlanVisibilityClass: text(values.master_plan_visibility_class ?? visibilityDecision.visibilityClass) || null,
    masterPlanVisibilityPolicyStableCode: text(
      values.master_plan_visibility_policy_stable_code ?? visibilityDecision.policyStableCode,
    ) || null,
    masterPlanVisibilityProtected: visibilityDecision.protectedFromAutoHide === true,
    promotedToExecutableDefaultMasterPlan: linkedProjectionSource.promotedToExecutableDefaultMasterPlan === true,
    predecessors,
    predecessorClientRowIds: predecessors.map((item) => item.clientRowId),
    critical: criticalIds.has(row.clientRowId),
  }
}

export function buildSimulationFacts(probe, businessSubtype = null) {
  const scaleProfile = SIMULATION_SCALE_PROFILES[probe.businessType] ?? SIMULATION_SCALE_PROFILES.general_civil
  const resolvedBusinessSubtype = businessSubtype
    ?? REPRESENTATIVE_SIMULATION_SUBTYPE[probe.businessType]
    ?? null
  const subtypeFacts = SIMULATION_SUBTYPE_FACT_OVERRIDES[resolvedBusinessSubtype] ?? {}
  return {
    ...scaleProfile,
    ...subtypeFacts,
    projectName: simulationProjectName(probe.businessType, resolvedBusinessSubtype),
    businessSubtype: resolvedBusinessSubtype,
    planScopeCaliber: 'full_project_master',
    deliveryStandard: 'full_fitout',
    terminalEvent: 'owner_handover',
  }
}

async function generatePlan(params) {
  const {
    probe,
    plannedStartDate,
    generateWbsTemplateRows,
    buildTemplateRecommendation,
    buildWizardTemplateSelection,
    buildDefaultMasterPlanProbeFacts,
    businessSubtype,
  } = params
  const facts = {
    ...buildDefaultMasterPlanProbeFacts(probe),
    ...buildSimulationFacts(probe, businessSubtype),
    projectName: simulationProjectName(probe.businessType, businessSubtype),
  }
  const recommendation = buildTemplateRecommendation(facts)
  const templateSelection = buildWizardTemplateSelection(recommendation)
  const scenarioSuffix = facts.businessSubtype && facts.businessSubtype !== probe.businessType
    ? `-${facts.businessSubtype}`
    : ''
  const generationBatchId = `simulation-executable-default-master-plan-${probe.businessType}${scenarioSuffix}`
  const scenarioCode = `${probe.businessType}--${facts.businessSubtype ?? 'base'}`
  const diagnosticStageTimings = process.env.WORKBUDDY_EXECUTABLE_PLAN_SIMULATION_TRACE === '1'
  const diagnosticStart = Date.now()
  let diagnosticLast = diagnosticStart
  const traceStage = (stage, details = {}) => {
    if (!diagnosticStageTimings) return
    const now = Date.now()
    console.error(JSON.stringify({
      source: 'executable_default_master_plan_simulation_stage_timing',
      generationBatchId,
      stage,
      elapsedMs: now - diagnosticStart,
      deltaMs: now - diagnosticLast,
      ...details,
    }))
    diagnosticLast = now
  }
  const generated = await generateWbsTemplateRows({
    projectId: `wizard-preview:executable-default-master-plan:${probe.businessType}${scenarioSuffix}`,
    surface: 'task_list',
    detailLevel: 'planning_skeleton',
    diagnosticDurationSuggestionMode: 'fast_template',
    algorithmSeedSourcePolicy: 'built_in_only',
    operation: {
      type: 'template_generate',
      diagnosticStageTimings: process.env.WORKBUDDY_EXECUTABLE_PLAN_SIMULATION_TRACE === '1',
      generationBatchId,
      templateIds: templateSelection.templateIds,
      selectedNodesByTemplate: templateSelection.selectedNodesByTemplate,
      selectedNodeIds: [],
      plannedStartDate,
      constructionCalendar: { basis: 'calendar_day', windows: [] },
      detailLevel: 'planning_skeleton',
      generationDepth: 'managed_frontier',
      includeActivitySteps: false,
      projectFacts: {
        ...facts,
        defaultPlanOutput: 'master_plan',
        masterPlanProfile: recommendation.masterPlanProfile,
        foundationMethodCandidates: recommendation.foundationMethodCandidates,
      },
      clientContext: {
        defaultPlanOutput: 'master_plan',
        planOutputLayer: 'master_plan',
        masterPlanProfile: recommendation.masterPlanProfile,
        constructionCalendar: { basis: 'calendar_day', windows: [] },
      },
      scope: {
        scopeExpansionMode: 'project',
        business_type: probe.businessType,
        business_subtype: facts.businessSubtype,
        project_type_code: facts.projectTypeCode ?? probe.projectTypeCode,
        structure_type_code: facts.structureTypeCode ?? probe.structureTypeCode,
        method_variant_codes: facts.methodVariantCodes ?? probe.methodVariantCodes,
        buildingPatternCodes: facts.buildingPatternCodes ?? probe.buildingPatternCodes,
        functionalUsageCodes: facts.functionalUsageCodes ?? probe.functionalUsageCodes,
        functionalCategoryCodes: facts.functionalCategoryCodes ?? probe.functionalCategoryCodes,
        specialRoomTypeCodes: facts.specialRoomTypeCodes ?? probe.specialRoomTypeCodes,
        physicalZoneTypeCodes: facts.physicalZoneTypeCodes ?? probe.physicalZoneTypeCodes,
        hardConstraintCodes: facts.hardConstraintCodes ?? probe.hardConstraintCodes,
        planScopeCaliber: facts.planScopeCaliber,
        deliveryStandard: facts.deliveryStandard,
        terminalEvent: facts.terminalEvent,
        foundationMethodCandidates: recommendation.foundationMethodCandidates,
        building_count: facts.buildingCount,
        standard_floor_count: facts.standardFloorCount,
        highest_building_floor_count: facts.highestBuildingFloorCount,
        basement_level_count: facts.basementLevelCount,
        foundation_depth_m: facts.foundationDepthM,
        total_area_m2: facts.totalAreaM2,
        project_features: {
          ...facts.projectFeatures,
          foundationMethodCandidates: recommendation.foundationMethodCandidates,
        },
      },
    },
  })
  traceStage('wbs_rows_generated', { rowCount: generated.rows.length })
  const datedRows = applyWizardDurationDatesForSimulation(generated.rows)
  traceStage('wizard_duration_dates_applied', { rowCount: datedRows.length })
  const scheduleRows = datedRows.filter((row) => rowProjectionMode(row) === 'schedule_row')
  const rowById = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
  const network = record(generated.candidateNetworkEvaluation)
  const criticalIds = new Set((Array.isArray(network.criticalGeneratedRowIds) ? network.criticalGeneratedRowIds : []).map(text))
  const planRows = scheduleRows.map((row) => toPlanRow(row, rowById, criticalIds))
  traceStage('plan_rows_projected', { rowCount: planRows.length })
  const assembly = record(generated.executableDefaultMasterPlanAssembly)
  const visibilitySummary = record(generated.masterPlanVisibilitySummary)
  const significanceLeakRows = probe.businessType === 'general_civil'
    ? planRows.filter((row) => /塔吊|施工电梯安装与楼层运输保障/.test(row.title))
    : []
  const inventedCrossStreamHandoffCount = planRows.reduce((count, row) => (
    count + row.predecessors.filter((dependency) => (
      dependency.intentCode === 'executable_default_master_plan_schedule_stream_handoff'
    )).length
  ), 0)
  const starts = planRows.map((row) => row.plannedStartDate).filter(Boolean).sort()
  const ends = planRows.map((row) => row.plannedEndDate).filter(Boolean).sort()
  const projectStartDate = starts[0] ?? null
  const projectEndDate = ends.at(-1) ?? null
  const duplicateKeys = new Map()
  for (const row of planRows) {
    const key = [row.wbsCode, row.title, row.executionPhase, row.executionLane].join('|')
    duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + 1)
  }
  const durationRows = planRows.filter((row) => row.durationContributionMode === 'duration_bearing')
  const baseBlockers = [
    assembly.status !== 'executable_default_master_plan_ready' ? 'assembly_not_ready' : null,
    assembly.readyForWizardCommit !== true ? 'wizard_commit_gate_not_ready' : null,
    number(assembly.scheduleRowCount) !== planRows.length ? 'assembly_schedule_row_count_mismatch' : null,
    durationRows.some((row) => row.durationAuthority !== 'system_standard_seed') ? 'duration_authority_gap' : null,
    durationRows.some((row) => !row.standardWorkDurationSeedStableCode || row.t2RhythmApplicability === 'required_missing')
      ? 'duration_asset_mapping_gap'
      : null,
    planRows.some((row) => !row.plannedStartDate || !row.plannedEndDate) ? 'invalid_plan_window' : null,
    [...duplicateKeys.values()].some((count) => count > 1) ? 'indistinguishable_schedule_rows' : null,
    (number(assembly.visibleDependencyCoverageRate) ?? 0) < 0.9 ? 'dependency_coverage_below_90_percent' : null,
    criticalIds.size === 0 ? 'critical_path_missing' : null,
    text(visibilitySummary.version) !== 'v1.4.23.1-master-plan-visibility-v1'
      ? 'master_plan_visibility_policy_not_applied'
      : null,
    (number(visibilitySummary.policyCoverageRate) ?? 0) < 1 ? 'master_plan_visibility_policy_coverage_gap' : null,
    (number(visibilitySummary.phaseCoverageRate) ?? 0) < 1 ? 'master_plan_visibility_phase_coverage_gap' : null,
    (number(visibilitySummary.danglingVisibleDependencyCount) ?? 0) > 0
      ? 'master_plan_visibility_dangling_dependency'
      : null,
    significanceLeakRows.length > 0 ? 'residential_internal_constraint_leaked_to_master_plan' : null,
    inventedCrossStreamHandoffCount > 0 ? 'invented_cross_stream_schedule_handoff' : null,
  ].filter(Boolean)
  const plan = {
    project: {
      projectName: facts.projectName,
      businessType: probe.businessType,
      businessTypeLabel: readableBusinessTypeLabel(probe.businessType, facts.businessSubtype),
      businessSubtype: facts.businessSubtype,
      scenarioCode,
      projectTypeCode: facts.projectTypeCode,
      plannedStartDate,
      planScopeCaliber: facts.planScopeCaliber,
      deliveryStandard: facts.deliveryStandard,
      terminalEvent: facts.terminalEvent,
      totalAreaM2: facts.totalAreaM2,
      buildingCount: facts.buildingCount,
      standardFloorCount: facts.standardFloorCount,
      highestBuildingFloorCount: facts.highestBuildingFloorCount,
      basementLevelCount: facts.basementLevelCount,
      foundationDepthM: facts.foundationDepthM,
      structureTypeCode: facts.structureTypeCode,
      methodVariantCodes: facts.methodVariantCodes,
      foundationMethodCandidates: recommendation.foundationMethodCandidates ?? [],
      buildingPatternCodes: facts.buildingPatternCodes,
      specialRoomTypeCodes: facts.specialRoomTypeCodes,
      hardConstraintCodes: facts.hardConstraintCodes,
    },
    generation: {
      generationBatchId,
      generationDepth: generated.generationDepth,
      defaultPlanOutput: generated.defaultPlanOutput,
      masterPlanProfile: generated.masterPlanProfile,
      executableDefaultMasterPlanAssembly: assembly,
      masterPlanVisibilitySummary: generated.masterPlanVisibilitySummary ?? null,
      durationAssetUtilizationSummary: generated.durationAssetUtilizationSummary ?? null,
      durationAssetConsumptionReceipts: generated.durationAssetConsumptionReceipts ?? [],
      durationAssetConsumptionSummary: generated.durationAssetConsumptionSummary ?? null,
      candidateNetworkEvaluation: generated.candidateNetworkEvaluation ?? null,
      calibrationInputPolicy: 'optional_runtime_overlay_not_supplied_for_this_simulation',
      mutationBoundary: 'local_static_generation_only_no_db_no_task_write_no_dependency_write',
    },
    summary: {
      status: baseBlockers.length === 0 ? 'pass' : 'fail',
      blockers: baseBlockers,
      scheduleRowCount: planRows.length,
      executableRowCount: planRows.filter((row) => row.isExecutable).length,
      summaryRowCount: planRows.filter((row) => row.isWbsSummary).length,
      milestoneRowCount: planRows.filter((row) => row.isMilestone || row.planItemKind === 'milestone').length,
      durationBearingRowCount: durationRows.length,
      systemStandardDurationRowCount: durationRows.filter((row) => row.durationAuthority === 'system_standard_seed').length,
      standardDurationSeedMappedRowCount: durationRows.filter((row) => row.standardWorkDurationSeedStableCode).length,
      t2RhythmMappedRowCount: durationRows.filter((row) => row.t2RhythmTemplateId).length,
      t2RhythmApplicableRowCount: durationRows.filter((row) => row.t2RhythmApplicability !== 'not_applicable_one_off_startup').length,
      t2RhythmNotApplicableRowCount: durationRows.filter((row) => row.t2RhythmApplicability === 'not_applicable_one_off_startup').length,
      runtimeCalibrationAppliedRowCount: durationRows.filter((row) => row.runtimeCalibrationApplied).length,
      criticalRowCount: planRows.filter((row) => row.critical).length,
      visibleDependencyCount: number(assembly.visibleDependencyCount) ?? 0,
      visibleDependencyCoverageRate: number(assembly.visibleDependencyCoverageRate) ?? 0,
      phaseCount: new Set(planRows.map((row) => row.executionPhase).filter(Boolean)).size,
      projectStartDate,
      projectEndDate,
      calendarSpanDays: inclusiveDays(projectStartDate, projectEndDate),
      assetInventoryExhausted: assembly.assetInventoryExhausted === true,
      masterPlanVisibilityPolicyCoverageRate: number(visibilitySummary.policyCoverageRate) ?? 0,
      masterPlanVisibilityPhaseCoverageRate: number(visibilitySummary.phaseCoverageRate) ?? 0,
      hiddenMasterPlanRowCount: number(visibilitySummary.hiddenRowCount) ?? 0,
      hiddenInternalConstraintRowCount: number(visibilitySummary.hiddenInternalConstraintRowCount) ?? 0,
      hiddenDetailPlanRowCount: number(visibilitySummary.hiddenDetailPlanRowCount) ?? 0,
      visibilityDependencyBridgeCount: number(visibilitySummary.dependencyBridgeCount) ?? 0,
      visibleSignificanceLeakRowCount: significanceLeakRows.length,
      inventedCrossStreamHandoffCount,
    },
    rows: planRows,
  }
  const constructionQualityAudit = auditConstructionQuality(plan)
  traceStage('construction_quality_audited', {
    blockerCount: constructionQualityAudit.blockers.length,
  })
  const blockers = [...new Set([...baseBlockers, ...constructionQualityAudit.blockers])]
  plan.generation.constructionQualityAudit = constructionQualityAudit
  plan.summary.status = blockers.length === 0 ? 'pass' : 'fail'
  plan.summary.blockers = blockers
  plan.summary.networkComponentCount = constructionQualityAudit.network.componentCount
  plan.summary.networkRootCount = constructionQualityAudit.network.rootCount
  plan.summary.networkSinkCount = constructionQualityAudit.network.sinkCount
  plan.summary.dependencyCycleRowCount = constructionQualityAudit.network.cycleRowIds.length
  plan.summary.methodConflictCount = constructionQualityAudit.methodConflictCount
  plan.summary.durationAssetSemanticMismatchCount = constructionQualityAudit.durationSemanticMismatchCount
  plan.summary.criticalPathCoversProjectStart = constructionQualityAudit.criticalPath.coversProjectStart
  plan.summary.criticalPathCoversProjectEnd = constructionQualityAudit.criticalPath.coversProjectEnd
  plan.summary.criticalPathContinuous = constructionQualityAudit.criticalPath.continuous
  return plan
}

function buildSummaryMarkdown(report) {
  const lines = [
    '# 11 业态向导可执行总控计划模拟结果',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 本地只读门禁：${report.allReady ? 'PASS' : 'FAIL'}`,
    `- 覆盖业态：${report.businessTypeCount}/11`,
    '- 工期权威：系统标准工期种子 + T2 节奏模板 + 系统排程规则',
    '- 真实项目样本：本次未提供、未消费，仅保留为可选校准层',
    '- 数据边界：未连接真实 DB，未创建任务，未写依赖，未发布 runtime，未形成 production/live 结果证据',
    '',
    '## 业态汇总',
    '',
    '| 业态 | 状态 | 正式行 | 可执行行 | 工期行 | 标准工期映射 | T2 映射 | 依赖覆盖 | 阶段 | 计划窗口 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ]
  for (const plan of report.plans) {
    const summary = plan.summary
    lines.push(`| ${escapeCell(plan.project.businessTypeLabel)} | ${summary.status.toUpperCase()} | ${summary.scheduleRowCount} | ${summary.executableRowCount} | ${summary.durationBearingRowCount} | ${summary.standardDurationSeedMappedRowCount} | ${summary.t2RhythmMappedRowCount}/${summary.t2RhythmApplicableRowCount} | ${(summary.visibleDependencyCoverageRate * 100).toFixed(1)}% | ${summary.phaseCount} | ${summary.projectStartDate} 至 ${summary.projectEndDate} |`)
  }
  lines.push('', '## 门禁边界', '')
  lines.push('- 本报告可以证明当前代码能从向导事实生成完整、资产支撑、依赖闭合的首版总控计划。')
  lines.push('- 本报告不能证明 production/live 数据库写入、租户权限、部署环境、线上性能、现场采纳或生产回滚。')
  lines.push('- 真实项目校准不是首版生成前置；有真实完工样本时可作为可选 overlay 改进 P50/P80。')
  return `${lines.join('\n')}\n`
}

function buildCompletePlanMarkdown(plan) {
  const { project, summary, generation } = plan
  const lines = [
    `# ${project.projectName} - 向导生成完整总控计划`,
    '',
    '## 模拟向导输入',
    '',
    `- 业态：${project.businessTypeLabel}（${project.businessType}）`,
    `- 规模：总建筑面积 ${project.totalAreaM2.toLocaleString('zh-CN')} m²，${project.buildingCount} 栋，标准层 ${project.standardFloorCount} 层，最高 ${project.highestBuildingFloorCount} 层，地下 ${project.basementLevelCount} 层`,
    `- 结构：${project.structureTypeCode}；基础深度：${project.foundationDepthM} m`,
    `- 向导工法：${project.methodVariantCodes.join(', ')}`,
    `- 开工日期：${project.plannedStartDate}；交付口径：${project.deliveryStandard}；终点：${project.terminalEvent}`,
    '- 未输入且未作为生成前置：真实图纸、总分包界面、塔吊/施工电梯配置、劳动力、审图报批、设备采购周期',
    '- 真实项目校准：未提供、未消费；系统标准资产直接生成首版计划',
    '',
    '## 生成结果',
    '',
    `- 状态：${summary.status.toUpperCase()}；装配：${generation.executableDefaultMasterPlanAssembly.status}`,
    `- 计划窗口：${summary.projectStartDate} 至 ${summary.projectEndDate}，日历跨度 ${summary.calendarSpanDays} 天`,
    `- 正式计划行：${summary.scheduleRowCount}；可执行行：${summary.executableRowCount}；汇总行：${summary.summaryRowCount}；里程碑：${summary.milestoneRowCount}`,
    `- 工期行：${summary.durationBearingRowCount}；标准工期映射：${summary.standardDurationSeedMappedRowCount}；T2 映射：${summary.t2RhythmMappedRowCount}/${summary.t2RhythmApplicableRowCount}（一次性启动任务 N/A：${summary.t2RhythmNotApplicableRowCount}）`,
    `- 可见依赖：${summary.visibleDependencyCount}；覆盖率：${(summary.visibleDependencyCoverageRate * 100).toFixed(1)}%；关键路径行：${summary.criticalRowCount}`,
    `- runtime/真实样本校准应用行：${summary.runtimeCalibrationAppliedRowCount}`,
    '- 数据边界：local_static / preview-only；无 DB、任务、依赖或 runtime 写入',
    '',
    '## 完整计划明细',
    '',
    '| 序号 | WBS | 任务 | 层级/类型 | 阶段 | 泳道 | 开始 | 完成 | 日历天 | P50 | 前置任务 | 标准工期资产 | T2 节奏 | 关键 |',
    '|---:|---|---|---|---|---|---|---|---:|---:|---|---|---|---:|',
  ]
  for (const [index, row] of plan.rows.entries()) {
    const rowType = row.isWbsSummary ? '汇总' : row.isMilestone || row.planItemKind === 'milestone' ? '里程碑' : '执行'
    const predecessors = row.predecessors.map((item) => `${item.wbsCode || item.title || item.clientRowId} ${item.dependencyType}${item.lagDays ? `${item.lagDays > 0 ? '+' : ''}${item.lagDays}d` : ''}`).join('<br>')
    const t2Display = row.t2RhythmApplicability === 'not_applicable_one_off_startup'
      ? 'N/A（一次性启动）'
      : row.t2RhythmTemplateId
    lines.push(`| ${index + 1} | ${escapeCell(row.wbsCode)} | ${escapeCell(row.title)} | L${row.hierarchyLevel}/${rowType} | ${escapeCell(row.executionPhaseLabel ?? row.executionPhase)} | ${escapeCell(row.executionLane)} | ${row.plannedStartDate ?? '-'} | ${row.plannedEndDate ?? '-'} | ${row.calendarDurationDays ?? '-'} | ${row.riskP50DurationDays ?? row.referenceDurationDays ?? '-'} | ${escapeCell(predecessors)} | ${escapeCell(row.standardWorkDurationSeedStableCode)} | ${escapeCell(t2Display)} | ${row.critical ? '是' : ''} |`)
  }
  lines.push('', '## 使用说明', '')
  lines.push('- 这是一份向导首版总控计划，可作为现场启动计划和项目经理首次审查底稿。')
  lines.push('- 项目经理仍可在不否定首版可用性的前提下调整合同节点、专项穿插、资源均衡和局部工序。')
  lines.push('- 若后续存在企业真实完工样本，可作为可选校准层修正工期分位值，不是生成这份计划的前置条件。')
  return `${lines.join('\n')}\n`
}

export function buildSimplePlanMarkdown(plan) {
  const { project, summary } = plan
  const businessTypeLabel = readableBusinessTypeLabel(project.businessType, project.businessSubtype)
  const lines = [
    `# ${project.projectName}施工总进度计划`,
    '',
    `- 项目类型：${businessTypeLabel}`,
    `- 项目规模：总建筑面积 ${project.totalAreaM2.toLocaleString('zh-CN')} m2，${project.buildingCount} 栋，地上最高 ${project.highestBuildingFloorCount} 层，地下 ${project.basementLevelCount} 层`,
    `- 计划工期：${summary.projectStartDate} 至 ${summary.projectEndDate}，日历跨度 ${summary.calendarSpanDays} 天`,
    `- 总控计划行：${summary.scheduleRowCount}；里程碑：${summary.milestoneRowCount}；关键路径行：${summary.criticalRowCount}`,
    `- 显著性裁决：已从总控表隐藏 ${summary.hiddenMasterPlanRowCount} 条内部约束或细部任务，阶段覆盖率 ${(summary.masterPlanVisibilityPhaseCoverageRate * 100).toFixed(0)}%`,
    '',
    '| 序号 | WBS | 任务名称 | 类型 | 阶段 | 计划开始 | 计划完成 | 工期（天） | 前置任务 | 关键 |',
    '|---:|---|---|---|---|---|---|---:|---|---:|',
  ]
  for (const [index, row] of plan.rows.entries()) {
    const rowType = row.isWbsSummary
      ? '工作包'
      : row.isMilestone || row.planItemKind === 'milestone'
        ? '里程碑'
        : '任务'
    const predecessors = row.predecessors
      .map((item) => `${item.wbsCode || item.title || item.clientRowId} ${item.dependencyType}${item.lagDays ? `${item.lagDays > 0 ? '+' : ''}${item.lagDays}d` : ''}`)
      .join('<br>')
    lines.push(`| ${index + 1} | ${escapeCell(row.wbsCode)} | ${escapeCell(row.title)} | ${rowType} | ${escapeCell(READABLE_PHASE_LABELS[row.executionPhase] ?? row.executionPhase)} | ${row.plannedStartDate ?? '-'} | ${row.plannedEndDate ?? '-'} | ${row.calendarDurationDays ?? '-'} | ${escapeCell(predecessors)} | ${row.critical ? '是' : ''} |`)
  }
  lines.push('', '> 本表为本地静态向导模拟结果，未连接真实数据库，也未写入项目任务、依赖或运行时策略。')
  return `${lines.join('\n')}\n`
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const fixtureModule = await import(pathToFileURL(path.join(
    REPO_ROOT,
    'project-testing',
    'tools',
    'generate-default-master-plan-profile-report.mjs',
  )).href)
  const [generationModule, recommendationModule, selectionModule] = await Promise.all([
    import(pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'services', 'wbsTemplateGenerationService.ts')).href),
    import(pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'services', 'projectFactsToTemplateService.ts')).href),
    import(pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'services', 'wizardTemplateSelectionService.ts')).href),
  ])
  const selected = args.businessTypes.length > 0
    ? fixtureModule.probes.filter((probe) => args.businessTypes.includes(probe.businessType))
    : fixtureModule.probes
  const scenarios = buildSimulationScenarios(selected, args)
  const plans = []
  for (const scenario of scenarios) {
    plans.push(await generatePlan({
      probe: scenario.probe,
      plannedStartDate: args.plannedStartDate,
      generateWbsTemplateRows: generationModule.generateWbsTemplateRows,
      buildTemplateRecommendation: recommendationModule.buildTemplateRecommendation,
      buildWizardTemplateSelection: selectionModule.buildWizardTemplateSelection,
      buildDefaultMasterPlanProbeFacts: fixtureModule.buildDefaultMasterPlanProbeFacts,
      businessSubtype: scenario.businessSubtype,
    }))
  }
  const primaryPlan = plans.find((plan) => (
    plan.project.businessType === args.primaryBusinessType
    && (!args.businessSubtype || plan.project.businessSubtype === args.businessSubtype)
  )) ?? plans[0]
  const report = {
    generatedAt: new Date().toISOString(),
    source: 'generate-executable-default-master-plan-simulation',
    environmentTarget: 'local_static',
    gateTier: 'local_static',
    status: plans.every((plan) => plan.summary.status === 'pass') ? 'pass' : 'fail',
    allReady: plans.every((plan) => plan.summary.status === 'pass'),
    businessTypeCount: new Set(plans.map((plan) => plan.project.businessType)).size,
    scenarioCount: plans.length,
    primaryBusinessType: primaryPlan?.project.businessType ?? null,
    primaryBusinessSubtype: primaryPlan?.project.businessSubtype ?? null,
    durationAuthority: 'system_standard_seed',
    calibrationPolicy: 'optional_runtime_overlay_not_supplied',
    productionMutationPossible: false,
    mutationBoundary: 'report_files_only_no_db_no_task_write_no_dependency_write_no_runtime_publication',
    durationAssetConsumptionReceipts: plans.flatMap((plan) => (
      plan.generation.durationAssetConsumptionReceipts ?? []
    )),
    plans,
  }
  await fs.mkdir(args.outputRoot, { recursive: true })
  const allPlansJson = path.join(args.outputRoot, 'all-business-type-plans.json')
  const summaryMarkdown = path.join(args.outputRoot, 'all-business-type-summary.md')
  const primaryJson = path.join(args.outputRoot, `${primaryPlan.project.scenarioCode}-complete-plan.json`)
  const primaryMarkdown = path.join(args.outputRoot, `${primaryPlan.project.scenarioCode}-complete-plan.md`)
  const primarySimpleMarkdown = path.join(args.outputRoot, `${primaryPlan.project.scenarioCode}-simple-plan.md`)
  const simplePlanMarkdownPaths = Object.fromEntries(plans.map((plan) => [
    plan.project.scenarioCode,
    path.join(args.outputRoot, `${plan.project.scenarioCode}-simple-plan.md`),
  ]))
  await Promise.all([
    fs.writeFile(allPlansJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fs.writeFile(summaryMarkdown, buildSummaryMarkdown(report), 'utf8'),
    fs.writeFile(primaryJson, `${JSON.stringify(primaryPlan, null, 2)}\n`, 'utf8'),
    fs.writeFile(primaryMarkdown, buildCompletePlanMarkdown(primaryPlan), 'utf8'),
    ...plans.map((plan) => fs.writeFile(
      simplePlanMarkdownPaths[plan.project.scenarioCode],
      buildSimplePlanMarkdown(plan),
      'utf8',
    )),
  ])
  const output = {
    status: report.status,
    environmentTarget: report.environmentTarget,
    gateTier: report.gateTier,
    businessTypeCount: report.businessTypeCount,
    scenarioCount: report.scenarioCount,
    primaryBusinessType: report.primaryBusinessType,
    primaryScheduleRowCount: primaryPlan.summary.scheduleRowCount,
    primaryPlanWindow: {
      start: primaryPlan.summary.projectStartDate,
      end: primaryPlan.summary.projectEndDate,
      calendarSpanDays: primaryPlan.summary.calendarSpanDays,
    },
    outputs: {
      allPlansJson: path.relative(REPO_ROOT, allPlansJson).replaceAll('\\', '/'),
      summaryMarkdown: path.relative(REPO_ROOT, summaryMarkdown).replaceAll('\\', '/'),
      primaryJson: path.relative(REPO_ROOT, primaryJson).replaceAll('\\', '/'),
      primaryMarkdown: path.relative(REPO_ROOT, primaryMarkdown).replaceAll('\\', '/'),
      primarySimpleMarkdown: path.relative(REPO_ROOT, primarySimpleMarkdown).replaceAll('\\', '/'),
      simplePlans: Object.fromEntries(Object.entries(simplePlanMarkdownPaths).map(([scenarioCode, filePath]) => [
        scenarioCode,
        path.relative(REPO_ROOT, filePath).replaceAll('\\', '/'),
      ])),
    },
    mutationBoundary: report.mutationBoundary,
  }
  console.log(JSON.stringify(output, null, 2))
  if (report.status !== 'pass') process.exitCode = 1
}

if (isDirectEntrypoint()) {
  if (!isTsxRuntime() && process.env[TSX_BOOTSTRAP_ENV] !== '1') runViaTsxAndExit()
  await main()
  process.exit(process.exitCode ?? 0)
}
