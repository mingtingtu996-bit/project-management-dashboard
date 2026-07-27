import { FORMAL_BUSINESS_TYPE_CODES } from './businessTypeRegistryService.js'
import { getScopeAssignmentRules } from './scopeAssignmentRulesService.js'
import {
  ENGINEERING_OBJECT_TYPES,
  type EngineeringObjectType,
} from '../types/db.js'

export type SpatialSemanticDimension =
  | 'system'
  | 'workface'
  | 'phase_window'
  | 'position_basis'
  | 'physical_space_kind'
  | 'physical_category'
  | 'floor_usage'

export type SpatialSemanticDictionaryEntry = {
  code: string
  dimension: SpatialSemanticDimension
  label: string
  targetEngineeringObjectType: EngineeringObjectType
  aliases: string[]
}

export type SpatialSemanticDictionaryAudit = {
  status: 'ready' | 'blocked'
  entryCount: number
  engineeringObjectTypes: EngineeringObjectType[]
  unknownEngineeringObjectTypes: string[]
  uncoveredEngineeringObjectTypes: EngineeringObjectType[]
  uncoveredScopeAssignmentMetadataValues: string[]
}

const SPATIAL_SEMANTIC_DICTIONARY: SpatialSemanticDictionaryEntry[] = [
  {
    code: 'phase',
    dimension: 'position_basis',
    label: '阶段',
    targetEngineeringObjectType: 'phase',
    aliases: ['phase', 'positionBasis:phase', '阶段'],
  },
  {
    code: 'section',
    dimension: 'position_basis',
    label: '标段',
    targetEngineeringObjectType: 'section',
    aliases: ['section', 'positionBasis:section', '标段', '施工段'],
  },
  {
    code: 'building',
    dimension: 'position_basis',
    label: '单体',
    targetEngineeringObjectType: 'building',
    aliases: ['building', 'positionBasis:building', '楼栋', '单体', 'tower'],
  },
  {
    code: 'basement',
    dimension: 'workface',
    label: '地下室',
    targetEngineeringObjectType: 'basement',
    aliases: ['basement', 'workface:basement', '地下室', '地库', 'basement_workface', 'shared_basement'],
  },
  {
    code: 'standard_floor',
    dimension: 'workface',
    label: '标准层',
    targetEngineeringObjectType: 'floor',
    aliases: ['standard_floor', 'workface:standard_floor', '标准层', '楼层', 'floor', 'positionBasis:floor'],
  },
  {
    code: 'foundation_section',
    dimension: 'workface',
    label: '基础施工段',
    targetEngineeringObjectType: 'basement',
    aliases: ['foundation_section', 'workface:foundation_section', '基础施工段', '基础区段', '基坑区段'],
  },
  {
    code: 'steel_bay',
    dimension: 'workface',
    label: '钢结构跨',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['steel_bay', 'workface:steel_bay', '钢结构跨', '钢结构区段', '钢梁钢柱区'],
  },
  {
    code: 'facade_elevation_zone',
    dimension: 'workface',
    label: '立面作业区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['facade_elevation_zone', 'workface:facade_elevation_zone', '立面作业区', '幕墙立面区', '外立面区'],
  },
  {
    code: 'outdoor_zone',
    dimension: 'workface',
    label: '室外作业区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['outdoor_zone', 'workface:outdoor_zone', '室外作业区', '市政园林作业区'],
  },
  {
    code: 'decoration_room_zone',
    dimension: 'workface',
    label: '装修房间区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['decoration_room_zone', 'workface:decoration_room_zone', '装修房间区', '精装房间区'],
  },
  {
    code: 'prefab_factory_coordination_zone',
    dimension: 'workface',
    label: '预制工厂协同区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['prefab_factory_coordination_zone', 'workface:prefab_factory_coordination_zone', '预制工厂协同区', 'PC工厂协同区'],
  },
  {
    code: 'prefab_floor_zone',
    dimension: 'workface',
    label: '装配式楼层区',
    targetEngineeringObjectType: 'floor',
    aliases: ['prefab_floor_zone', 'workface:prefab_floor_zone', '装配式楼层区', '预制楼层区'],
  },
  {
    code: 'mic_module_zone',
    dimension: 'workface',
    label: '模块单元区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['mic_module_zone', 'workface:mic_module_zone', '模块单元区', 'MIC模块区'],
  },
  {
    code: 'hotel_room_public_zone',
    dimension: 'workface',
    label: '酒店客房公区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['hotel_room_public_zone', 'workface:hotel_room_public_zone', '酒店客房公区', '客房公区'],
  },
  {
    code: 'campus_function_zone',
    dimension: 'workface',
    label: '校园功能区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['campus_function_zone', 'workface:campus_function_zone', '校园功能区', '教学功能区'],
  },
  {
    code: 'renovation_protection_zone',
    dimension: 'workface',
    label: '改造保护区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['renovation_protection_zone', 'workface:renovation_protection_zone', '改造保护区', '文保保护区'],
  },
  {
    code: 'tod_transfer_deck_zone',
    dimension: 'workface',
    label: 'TOD转换盖板区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['tod_transfer_deck_zone', 'workface:tod_transfer_deck_zone', 'TOD转换盖板区', '上盖转换区'],
  },
  {
    code: 'medical_cleanroom_zone',
    dimension: 'workface',
    label: '医疗洁净作业区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['medical_cleanroom_zone', 'workface:medical_cleanroom_zone', '医疗洁净作业区', '手术室洁净区'],
  },
  {
    code: 'data_center_room_zone',
    dimension: 'workface',
    label: '数据机房作业区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['data_center_room_zone', 'workface:data_center_room_zone', '数据机房作业区', 'IDC机房作业区'],
  },
  {
    code: 'mep_system_zone',
    dimension: 'workface',
    label: '机电系统作业区',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['mep_system_zone', 'workface:mep_system_zone', '机电系统作业区', '专业系统作业区'],
  },
  {
    code: 'refuge_floor',
    dimension: 'floor_usage',
    label: '避难层',
    targetEngineeringObjectType: 'floor',
    aliases: ['refuge', 'refuge_floor', '避难层', 'floorUsage:refuge'],
  },
  {
    code: 'outdoor_site',
    dimension: 'physical_space_kind',
    label: '室外总平',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['outdoor_site', 'physicalSpaceKind:outdoor_site', '室外总平', '室外工程', 'outdoor', 'landscape'],
  },
  {
    code: 'shared_podium',
    dimension: 'physical_space_kind',
    label: '共享裙房',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['shared_podium', 'physicalSpaceKind:shared_podium', '裙房', '共享裙房', 'podium'],
  },
  {
    code: 'horizontal_work_zone',
    dimension: 'physical_space_kind',
    label: '水平作业区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['horizontal_work_zone', 'physicalSpaceKind:horizontal_work_zone', '水平作业区', 'work_zone'],
  },
  {
    code: 'independent_engineering_zone',
    dimension: 'physical_space_kind',
    label: '独立工程区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['independent_engineering_zone', 'physicalSpaceKind:independent_engineering_zone', '独立工程区'],
  },
  {
    code: 'functional_area',
    dimension: 'position_basis',
    label: '功能区',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['functional_area', 'positionBasis:functional_area', '功能区'],
  },
  {
    code: 'structural',
    dimension: 'system',
    label: '结构系统',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['structural', 'system:structural', '结构', '主体结构'],
  },
  {
    code: 'mep',
    dimension: 'system',
    label: '机电系统',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['mep', 'system:mep', '机电', 'mechanical_electrical_plumbing'],
  },
  {
    code: 'cleanroom',
    dimension: 'system',
    label: '洁净区',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['cleanroom', 'system:cleanroom', 'system:medical_cleanroom', '洁净区', '洁净室', 'medical_cleanroom_system'],
  },
  {
    code: 'data_center_room',
    dimension: 'system',
    label: '数据中心机房',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['data_center_room', 'system:data_center_room', 'system:data_center', 'data_hall', 'white_space', '机房', '数据机房'],
  },
  {
    code: 'fire',
    dimension: 'system',
    label: '消防系统',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['fire', 'system:fire', '消防', '消防系统', 'fire_protection_system'],
  },
  {
    code: 'hvac',
    dimension: 'system',
    label: '暖通系统',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['hvac', 'system:hvac', '暖通', '暖通系统', '通风空调系统'],
  },
  {
    code: 'plumbing_heating',
    dimension: 'system',
    label: '给排水采暖系统',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['plumbing_heating', 'system:plumbing_heating', '给排水', '采暖', '给排水采暖系统'],
  },
  {
    code: 'electrical',
    dimension: 'system',
    label: '电气系统',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['electrical', 'system:electrical', '电气', '强电', '配电系统'],
  },
  {
    code: 'intelligent',
    dimension: 'system',
    label: '智能化系统',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['intelligent', 'system:intelligent', '智能化', '弱电', '安防系统'],
  },
  {
    code: 'elevator',
    dimension: 'system',
    label: '电梯系统',
    targetEngineeringObjectType: 'functional_area',
    aliases: ['elevator', 'system:elevator', '电梯', '电梯系统', 'lift'],
  },
  {
    code: 'foundation',
    dimension: 'phase_window',
    label: '基础阶段窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['foundation', 'phaseWindow:foundation', '基础', '基础阶段'],
  },
  {
    code: 'basement',
    dimension: 'phase_window',
    label: '地下结构窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['basement', 'phaseWindow:basement', '地下室', '地下结构'],
  },
  {
    code: 'superstructure',
    dimension: 'phase_window',
    label: '主体结构窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['superstructure', 'phaseWindow:superstructure', '主体', '主体结构阶段'],
  },
  {
    code: 'mep',
    dimension: 'phase_window',
    label: '机电阶段窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['mep', 'phaseWindow:mep', '机电', '机电阶段'],
  },
  {
    code: 'decoration',
    dimension: 'phase_window',
    label: '装修阶段窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['decoration', 'phaseWindow:decoration', '装修', '精装阶段'],
  },
  {
    code: 'envelope',
    dimension: 'phase_window',
    label: '围护阶段窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['envelope', 'phaseWindow:envelope', '围护', '幕墙围护阶段'],
  },
  {
    code: 'outdoor',
    dimension: 'phase_window',
    label: '室外阶段窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['outdoor', 'phaseWindow:outdoor', '室外', '室外工程阶段'],
  },
  {
    code: 'commissioning',
    dimension: 'phase_window',
    label: '联调联试窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['commissioning', 'phaseWindow:commissioning', '联调联试', '调试阶段'],
  },
  {
    code: 'handover',
    dimension: 'phase_window',
    label: '移交窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['handover', 'phaseWindow:handover', '移交', '验收移交'],
  },
  {
    code: 'opening',
    dimension: 'phase_window',
    label: '开业筹开窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['opening', 'phaseWindow:opening', '开业', '筹开阶段'],
  },
  {
    code: 'trial_operation',
    dimension: 'phase_window',
    label: '试运行窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['trial_operation', 'phaseWindow:trial_operation', '试运行', '试运营'],
  },
  {
    code: 'factory',
    dimension: 'phase_window',
    label: '工厂预制窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['factory', 'phaseWindow:factory', '工厂', '预制工厂阶段'],
  },
  {
    code: 'renovation',
    dimension: 'phase_window',
    label: '改造窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['renovation', 'phaseWindow:renovation', '改造', '文保改造'],
  },
  {
    code: 'full_project',
    dimension: 'phase_window',
    label: '全项目窗口',
    targetEngineeringObjectType: 'phase',
    aliases: ['full_project', 'phaseWindow:full_project', '全项目', '全周期'],
  },
  {
    code: 'switching_station',
    dimension: 'physical_category',
    label: '开闭站',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['switching_station', 'physicalCategory:switching_station', '开闭站'],
  },
  {
    code: 'fire_pump_room',
    dimension: 'physical_category',
    label: '消防泵房',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['fire_pump_room', 'physicalCategory:fire_pump_room', '消防泵房'],
  },
  {
    code: 'heat_exchange_station',
    dimension: 'physical_category',
    label: '换热站',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['heat_exchange_station', 'physicalCategory:heat_exchange_station', '换热站'],
  },
  {
    code: 'waste_room',
    dimension: 'physical_category',
    label: '垃圾房',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['waste_room', 'physicalCategory:waste_room', '垃圾房'],
  },
  {
    code: 'playground',
    dimension: 'physical_category',
    label: '运动场',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['playground', 'physicalCategory:playground', '运动场'],
  },
  {
    code: 'liquid_oxygen_station',
    dimension: 'physical_category',
    label: '液氧站',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['liquid_oxygen_station', 'physicalCategory:liquid_oxygen_station', '液氧站'],
  },
  {
    code: 'sewage_treatment_station',
    dimension: 'physical_category',
    label: '污水处理站',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['sewage_treatment_station', 'physicalCategory:sewage_treatment_station', '污水处理站'],
  },
  {
    code: 'medical_waste_holding',
    dimension: 'physical_category',
    label: '医疗废物暂存',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['medical_waste_holding', 'physicalCategory:medical_waste_holding', '医疗废物暂存'],
  },
  {
    code: 'hyperbaric_oxygen_chamber',
    dimension: 'physical_category',
    label: '高压氧舱',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['hyperbaric_oxygen_chamber', 'physicalCategory:hyperbaric_oxygen_chamber', '高压氧舱'],
  },
  {
    code: 'substation',
    dimension: 'physical_category',
    label: '变电站',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['substation', 'physicalCategory:substation', '变电站'],
  },
  {
    code: 'generator_yard',
    dimension: 'physical_category',
    label: '发电机区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['generator_yard', 'physicalCategory:generator_yard', '发电机区'],
  },
  {
    code: 'cooling_plant',
    dimension: 'physical_category',
    label: '制冷站',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['cooling_plant', 'physicalCategory:cooling_plant', '制冷站'],
  },
  {
    code: 'railway_operation_zone',
    dimension: 'physical_category',
    label: '铁路运营区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['railway_operation_zone', 'physicalCategory:railway_operation_zone', '铁路运营区'],
  },
  {
    code: 'transfer_passage',
    dimension: 'physical_category',
    label: '换乘通道',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['transfer_passage', 'physicalCategory:transfer_passage', '换乘通道'],
  },
  {
    code: 'traffic_connection_zone',
    dimension: 'physical_category',
    label: '交通接驳区',
    targetEngineeringObjectType: 'physical_zone',
    aliases: ['traffic_connection_zone', 'physicalCategory:traffic_connection_zone', '交通接驳区'],
  },
]

function normalizeToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
}

function cloneEntry(entry: SpatialSemanticDictionaryEntry): SpatialSemanticDictionaryEntry {
  return {
    ...entry,
    aliases: [...entry.aliases],
  }
}

export function listSpatialSemanticDictionary() {
  return SPATIAL_SEMANTIC_DICTIONARY.map(cloneEntry)
}

export function normalizeSpatialSemanticCode(value: unknown): SpatialSemanticDictionaryEntry | null {
  const normalized = normalizeToken(value)
  if (!normalized) return null
  const entry = SPATIAL_SEMANTIC_DICTIONARY.find((item) =>
    normalizeToken(item.code) === normalized
    || item.aliases.some((alias) => normalizeToken(alias) === normalized)
  )
  return entry ? cloneEntry(entry) : null
}

export function getSpatialSemanticDictionaryEntry(value: unknown) {
  return normalizeSpatialSemanticCode(value)
}

function collectScopeAssignmentMetadataValues() {
  const values: string[] = []
  for (const businessType of FORMAL_BUSINESS_TYPE_CODES) {
    for (const rule of getScopeAssignmentRules(businessType)) {
      const metadata = rule.matchMetadata ?? {}
      for (const key of ['physicalSpaceKind', 'physicalCategory', 'floorUsage'] as const) {
        const value = metadata[key]
        if (typeof value === 'string' && value.trim()) values.push(value)
      }
    }
  }
  return Array.from(new Set(values)).sort()
}

export function auditSpatialSemanticDictionary(): SpatialSemanticDictionaryAudit {
  const engineeringObjectTypes = [...ENGINEERING_OBJECT_TYPES]
  const dictionaryTargets = new Set(SPATIAL_SEMANTIC_DICTIONARY.map((entry) => entry.targetEngineeringObjectType))
  const validEngineeringObjectTypes = new Set(engineeringObjectTypes)
  const unknownEngineeringObjectTypes = Array.from(dictionaryTargets)
    .filter((type) => !validEngineeringObjectTypes.has(type))
  const uncoveredEngineeringObjectTypes = engineeringObjectTypes
    .filter((type) => !dictionaryTargets.has(type))
  const uncoveredScopeAssignmentMetadataValues = collectScopeAssignmentMetadataValues()
    .filter((value) => !normalizeSpatialSemanticCode(value))

  const status = unknownEngineeringObjectTypes.length === 0
    && uncoveredEngineeringObjectTypes.length === 0
    && uncoveredScopeAssignmentMetadataValues.length === 0
    ? 'ready'
    : 'blocked'

  return {
    status,
    entryCount: SPATIAL_SEMANTIC_DICTIONARY.length,
    engineeringObjectTypes,
    unknownEngineeringObjectTypes,
    uncoveredEngineeringObjectTypes,
    uncoveredScopeAssignmentMetadataValues,
  }
}
