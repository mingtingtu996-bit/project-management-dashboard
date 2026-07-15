// v1.4.22.1 §7.3: Step 3 - Engineering scope and scale tree editor
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import {
  ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES,
  ENGINEERING_OBJECT_PHYSICAL_LEDGER_TYPES,
  ENGINEERING_OBJECT_ROOT_TYPES,
  ENGINEERING_OBJECT_VALID_CHILDREN,
  getEngineeringObjectDefaultAreaAccountingMode,
  getEngineeringObjectDefaultCoverageRole,
} from '@/lib/engineeringObjectScope'
import type { EngineeringObjectType } from '@/types'
import { SCOPE_MODELING_STAGE_ORDER, type ScopeModelingStage, type WizardDraftPayload } from './types'
import { BuildingNodeEditor } from './BuildingNodeEditor'
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

type ObjectType = Exclude<EngineeringObjectType, 'engineering'>

interface ScopeNode {
  id: string
  type: ObjectType
  name: string
  parentId: string | null
  children: ScopeNode[]
  expanded: boolean
  metadata: Record<string, unknown>
}

const ROOT_ID = 'scope-root'
const TYPE_LABELS: Record<ObjectType, string> = {
  phase: '分期',
  section: '标段',
  building: '单体',
  basement: '地下室',
  floor: '楼层',
  physical_zone: '物理区域',
  functional_area: '功能区',
}
const TYPE_COLORS: Record<ObjectType, string> = {
  phase: 'bg-blue-100 text-blue-700',
  section: 'bg-amber-100 text-amber-700',
  building: 'bg-slate-100 text-slate-700',
  basement: 'bg-indigo-100 text-indigo-700',
  floor: 'bg-slate-100 text-slate-600',
  physical_zone: 'bg-blue-100 text-blue-700',
  functional_area: 'bg-emerald-100 text-emerald-700',
}
const CHILD_TYPES = ENGINEERING_OBJECT_VALID_CHILDREN as Record<ObjectType, readonly ObjectType[]>
const PHYSICAL_LEDGER_TYPES = new Set<ObjectType>(ENGINEERING_OBJECT_PHYSICAL_LEDGER_TYPES)
const DECOMPOSITION_PARENT_TYPES = new Set<ObjectType>(['building', 'basement', 'floor', 'physical_zone'])
const ROOT_CHILD_TYPE_SET = new Set<ObjectType>(ENGINEERING_OBJECT_ROOT_TYPES as readonly ObjectType[])
const AUTO_PARENT_ID = '__auto__'

type PhysicalSpaceInputType = 'building' | 'basement' | 'outdoor_site' | 'independent_zone'
type DecompositionMode = 'by_floor' | 'by_physical_zone' | 'tower_podium'
type TemplateSupport = 'supported' | 'partial' | 'manual'
type IndependentZoneOption = { value: string; label: string; templateSupport: TemplateSupport }
type ScopeDescriptionParseResult = { nodes: ScopeNode[]; summary: string }
type ParsedPhaseSectionRef = { phaseNumber?: number; sectionNumber?: number }
type BuildingAssignmentFact = {
  buildingNumbers: number[]
  phaseNumber?: number
  sectionNumber?: number
  usageText?: string
  floorCount?: number
}
type IndependentZoneAssignmentFact = {
  phaseNumber?: number
  sectionNumber?: number
  option: IndependentZoneOption
}
type BasementAssignmentFact = {
  name: string
  levelCount: number
  serviceBuildingNumbers: number[]
}
type ServiceScopeCopy = {
  panelLabel: string
  allLabel: string
  customLabel: string
  customFieldsetLabel: string
  savedLabel: string
  emptyLabel: string
}

const SCOPE_MODELING_STEPS: Array<{ key: ScopeModelingStage; label: string; hint: string }> = [
  { key: 'spaces', label: '项目空间', hint: '录入地上、地下、场地范围' },
  { key: 'subdivision', label: '细化空间', hint: '补充特殊楼层与排程分区' },
  { key: 'review', label: '确认范围', hint: '确认必要信息后生成 WBS' },
]

function normalizeScopeModelingStage(value: unknown): ScopeModelingStage {
  return SCOPE_MODELING_STAGE_ORDER.includes(value as ScopeModelingStage)
    ? value as ScopeModelingStage
    : 'spaces'
}

const PHYSICAL_SPACE_TYPE_LABELS: Record<PhysicalSpaceInputType, string> = {
  building: '单体建筑',
  basement: '地下空间',
  outdoor_site: '室外总平',
  independent_zone: '独立工程区',
}

const FLOOR_USAGE_LABELS: Record<string, string> = {
  standard: '标准层',
  ground_pilotis: '架空层',
  refuge: '避难层',
  mechanical: '设备层',
  transfer: '转换层',
  roof: '屋面层',
  mezzanine: '夹层',
  podium_roof: '裙房屋面',
  canopy: '雨棚/连廊层',
}

const SPACE_DETAIL_STYLES = {
  above: {
    title: '地上单体',
    hint: '楼栋、塔楼等主要竖向空间',
    frame: 'border-blue-100 bg-blue-50/40',
    rail: 'bg-blue-600',
  },
  shared: {
    title: '公共共享空间',
    hint: '共享裙房、公共连通空间',
    frame: 'border-blue-100 bg-blue-50/50',
    rail: 'bg-blue-600',
  },
  underground: {
    title: '地下空间',
    hint: '地下室、地下车库等整体地下范围',
    frame: 'border-indigo-100 bg-indigo-50/45',
    rail: 'bg-indigo-500',
  },
  outdoor: {
    title: '室外总平',
    hint: '道路、园建、管网等场地范围',
    frame: 'border-emerald-100 bg-emerald-50/45',
    rail: 'bg-emerald-500',
  },
  independent: {
    title: '独立工程区',
    hint: '独立构筑物或场地设施',
    frame: 'border-amber-100 bg-amber-50/45',
    rail: 'bg-amber-500',
  },
} as const

type SpaceDetailTone = keyof typeof SPACE_DETAIL_STYLES

const BUILDING_USAGE_OPTIONS_BY_BUSINESS: Record<string, string[]> = {
  civil_residential: ['住宅楼', '配套用房', '商业裙房', '综合楼'],
  civil_office_commercial: ['写字楼', '商业', '商业裙房', '配套用房', '综合楼'],
  civil_complex: ['住宅楼', '写字楼', '商业', '酒店客房楼', '商业裙房', '综合楼'],
  hospital: ['住院楼', '医技楼', '门诊楼', '感染楼', '行政科研楼', '教学科研楼', '综合楼'],
  hotel: ['酒店客房楼', '裙房商业', '会议中心', '后勤楼', '综合楼'],
  industrial_general: ['主厂房', '仓库', '动力站房', '研发办公楼', '综合楼'],
  industrial_logistics: ['物流仓库', '分拣中心', '办公楼', '动力站房', '综合楼'],
  industrial_cleanroom: ['洁净厂房', '动力站房', '仓库', '研发办公楼', '综合楼'],
  industrial: ['主厂房', '仓库', '动力站房', '研发办公楼', '综合楼'],
  data_center: ['机房楼', '运维楼', '动力中心', '综合楼'],
  transportation_hub: ['站房', '换乘中心', '配套办公楼', '综合楼'],
  sports_culture: ['比赛馆', '训练馆', '文化展演楼', '配套服务楼', '综合楼'],
  tod_upper_cover: ['上盖塔楼', '商业裙房', '换乘配套楼', '综合楼'],
  renovation_seismic: ['既有建筑', '加固楼', '改造楼', '综合楼'],
  renovation_energy: ['既有建筑', '节能改造楼', '配套用房', '综合楼'],
  renovation_heritage: ['既有建筑', '文保建筑', '配套用房', '综合楼'],
  renovation: ['既有建筑', '加固楼', '改造楼', '综合楼'],
  modular_building: ['模块化单体', '配套楼', '综合楼'],
  school: ['教学楼', '实验楼', '宿舍楼', '食堂', '体育馆', '综合楼'],
  general_civil: ['住宅楼', '写字楼', '商业', '综合楼'],
}

const INDEPENDENT_ZONE_OPTIONS_BY_BUSINESS: Record<string, IndependentZoneOption[]> = {
  civil_residential: [
    { value: 'switching_station', label: '开闭所', templateSupport: 'supported' },
    { value: 'waste_room', label: '垃圾房', templateSupport: 'supported' },
    { value: 'heat_exchange_station', label: '换热站', templateSupport: 'supported' },
    { value: 'fire_pump_room', label: '消防水池泵房', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  civil_office_commercial: [
    { value: 'switching_station', label: '开闭所', templateSupport: 'supported' },
    { value: 'waste_room', label: '垃圾房', templateSupport: 'supported' },
    { value: 'heat_exchange_station', label: '换热站', templateSupport: 'supported' },
    { value: 'fire_pump_room', label: '消防水池泵房', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  civil_complex: [
    { value: 'switching_station', label: '开闭所', templateSupport: 'supported' },
    { value: 'waste_room', label: '垃圾房', templateSupport: 'supported' },
    { value: 'heat_exchange_station', label: '换热站', templateSupport: 'supported' },
    { value: 'fire_pump_room', label: '消防水池泵房', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  hospital: [
    { value: 'liquid_oxygen_station', label: '液氧站', templateSupport: 'supported' },
    { value: 'sewage_treatment_station', label: '污水处理站', templateSupport: 'supported' },
    { value: 'hyperbaric_oxygen_chamber', label: '高压氧舱', templateSupport: 'supported' },
    { value: 'medical_waste_holding', label: '医疗废物暂存点', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  hotel: [
    { value: 'sewage_treatment_station', label: '污水处理站', templateSupport: 'supported' },
    { value: 'heat_exchange_station', label: '换热站', templateSupport: 'supported' },
    { value: 'waste_room', label: '垃圾房', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  school: [
    { value: 'outdoor_sports_field', label: '室外运动场', templateSupport: 'partial' },
    { value: 'switching_station', label: '开闭所', templateSupport: 'supported' },
    { value: 'waste_room', label: '垃圾房', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  industrial_general: [
    { value: 'tank_farm', label: '罐区', templateSupport: 'partial' },
    { value: 'process_unit_yard', label: '露天装置区', templateSupport: 'partial' },
    { value: 'pipe_rack', label: '管廊', templateSupport: 'partial' },
    { value: 'material_yard', label: '堆场', templateSupport: 'manual' },
    { value: 'utility_station', label: '公用工程站', templateSupport: 'partial' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  industrial_logistics: [
    { value: 'material_yard', label: '堆场', templateSupport: 'manual' },
    { value: 'utility_station', label: '公用工程站', templateSupport: 'partial' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  industrial_cleanroom: [
    { value: 'utility_station', label: '公用工程站', templateSupport: 'partial' },
    { value: 'sewage_treatment_station', label: '污水站', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  industrial: [
    { value: 'tank_farm', label: '罐区', templateSupport: 'partial' },
    { value: 'process_unit_yard', label: '露天装置区', templateSupport: 'partial' },
    { value: 'pipe_rack', label: '管廊', templateSupport: 'partial' },
    { value: 'material_yard', label: '堆场', templateSupport: 'manual' },
    { value: 'utility_station', label: '公用工程站', templateSupport: 'partial' },
    { value: 'sewage_treatment_station', label: '污水站', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  data_center: [
    { value: 'substation', label: '变电站', templateSupport: 'supported' },
    { value: 'generator_yard', label: '柴发区', templateSupport: 'supported' },
    { value: 'cooling_plant', label: '冷站', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  tod_upper_cover: [
    { value: 'railway_operation_zone', label: '轨行区', templateSupport: 'supported' },
    { value: 'transfer_passage', label: '换乘通道', templateSupport: 'supported' },
    { value: 'traffic_connection_zone', label: '交通接驳区', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  transportation_hub: [
    { value: 'traffic_connection_zone', label: '交通接驳区', templateSupport: 'supported' },
    { value: 'transfer_passage', label: '换乘通道', templateSupport: 'supported' },
    { value: 'utility_station', label: '配套站房', templateSupport: 'partial' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  sports_culture: [
    { value: 'outdoor_sports_field', label: '室外运动场', templateSupport: 'partial' },
    { value: 'event_service_yard', label: '赛事服务区', templateSupport: 'partial' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  renovation_seismic: [
    { value: 'temporary_relocation_zone', label: '临时迁改区', templateSupport: 'partial' },
    { value: 'protection_scaffold_zone', label: '外立面保护架区', templateSupport: 'partial' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  renovation_energy: [
    { value: 'temporary_relocation_zone', label: '临时迁改区', templateSupport: 'partial' },
    { value: 'protection_scaffold_zone', label: '外立面保护架区', templateSupport: 'partial' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  renovation_heritage: [
    { value: 'temporary_relocation_zone', label: '临时迁改区', templateSupport: 'partial' },
    { value: 'protection_scaffold_zone', label: '外立面保护架区', templateSupport: 'partial' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  renovation: [
    { value: 'temporary_relocation_zone', label: '临时迁改区', templateSupport: 'partial' },
    { value: 'protection_scaffold_zone', label: '外立面保护架区', templateSupport: 'partial' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  modular_building: [
    { value: 'module_staging_yard', label: '模块堆场', templateSupport: 'partial' },
    { value: 'hoisting_yard', label: '吊装作业区', templateSupport: 'partial' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
  general_civil: [
    { value: 'switching_station', label: '开闭所', templateSupport: 'supported' },
    { value: 'waste_room', label: '垃圾房', templateSupport: 'supported' },
    { value: 'heat_exchange_station', label: '换热站', templateSupport: 'supported' },
    { value: 'fire_pump_room', label: '消防水池泵房', templateSupport: 'supported' },
    { value: 'custom_independent_zone', label: '其他独立工程区', templateSupport: 'manual' },
  ],
}

const ALL_INDEPENDENT_ZONE_OPTIONS = Object.values(INDEPENDENT_ZONE_OPTIONS_BY_BUSINESS)
  .flat()
  .filter((option, index, options) => (
    options.findIndex((candidate) => candidate.value === option.value) === index
  ))

function defaultCoverageMetadata(type: ObjectType): Record<string, unknown> {
  if (PHYSICAL_LEDGER_TYPES.has(type)) {
    return {
      coverageRole: getEngineeringObjectDefaultCoverageRole(type),
      areaAccountingMode: getEngineeringObjectDefaultAreaAccountingMode(type),
      ...(type === 'basement' || type === 'physical_zone' ? { childrenComplete: true } : {}),
    }
  }
  if (type === 'functional_area') {
    return {
      coverageRole: getEngineeringObjectDefaultCoverageRole(type),
      areaAccountingMode: getEngineeringObjectDefaultAreaAccountingMode(type),
    }
  }
  return {}
}

function withDefaultCoverageMetadata(type: ObjectType, metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...defaultCoverageMetadata(type),
    ...metadata,
  }
}

function getPrimaryChildType(type: ObjectType): ObjectType | null {
  if (type === 'building') return 'floor'
  if (type === 'basement') return 'floor'
  if (type === 'physical_zone') return 'floor'
  if (type === 'floor') return 'functional_area'
  return CHILD_TYPES[type]?.[0] ?? null
}

function readDecompositionMode(node: ScopeNode): 'by_floor' | 'by_physical_zone' | null {
  const explicit = String(node.metadata?.decompositionMode ?? '')
  if (explicit === 'by_floor' || explicit === 'by_physical_zone') return explicit
  for (const child of node.children) {
    const mode = ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES[child.type]
    if (mode) return mode
  }
  return null
}

function resolveAllowedChildTypes(node: ScopeNode): ObjectType[] {
  const childTypes = [...(CHILD_TYPES[node.type] ?? [])]
  if (!DECOMPOSITION_PARENT_TYPES.has(node.type)) return childTypes
  const mode = readDecompositionMode(node)
  if (mode === 'by_floor') return childTypes.filter((type) => type !== 'physical_zone')
  if (mode === 'by_physical_zone') return childTypes.filter((type) => type !== 'floor')
  return childTypes
}

function applyChildCompletenessMetadata(parent: ScopeNode, childType: ObjectType, metadata: Record<string, unknown>): Record<string, unknown> {
  const mode = ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES[childType]
  if (!mode || !DECOMPOSITION_PARENT_TYPES.has(parent.type)) return metadata
  return {
    ...metadata,
    decompositionMode: mode,
    childrenComplete: true,
  }
}

let nodeIdCounter = 0

function maxNodeIdCounter(nodes: ScopeNode[]): number {
  let max = 0
  const visit = (node: ScopeNode) => {
    const match = /^node_(\d+)$/.exec(node.id)
    if (match) {
      max = Math.max(max, Number(match[1]))
    }
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return max
}

function syncNodeIdCounterFromScopeTree(nodes: ScopeNode[]): void {
  nodeIdCounter = Math.max(nodeIdCounter, maxNodeIdCounter(nodes))
}

function newNode(type: ObjectType, parentId: string | null, name?: string, metadata: Record<string, unknown> = {}, children: ScopeNode[] = []): ScopeNode {
  nodeIdCounter += 1
  const id = `node_${nodeIdCounter}`
  return {
    id,
    type,
    name: name ?? `新${TYPE_LABELS[type]}`,
    parentId,
    children: children.map((child) => reparentNode(child, id)),
    expanded: true,
    metadata: withDefaultCoverageMetadata(type, metadata),
  }
}

function reparentNode(node: ScopeNode, parentId: string | null): ScopeNode {
  return {
    ...node,
    parentId,
    children: node.children.map((child) => reparentNode(child, node.id)),
  }
}

function createFloor(parentId: string, name: string, floorOrder: number, metadata: Record<string, unknown> = {}): ScopeNode {
  return newNode('floor', parentId, name, { floorOrder, ...inferFloorUsageMetadata(name), ...metadata })
}

function inferFloorUsageMetadata(name: string): Record<string, unknown> {
  if (/架空/.test(name)) return { floorUsage: 'ground_pilotis' }
  if (/避难/.test(name)) return { floorUsage: 'refuge' }
  if (/设备|机房/.test(name)) return { floorUsage: 'mechanical' }
  if (/转换/.test(name)) return { floorUsage: 'transfer' }
  if (/裙房屋面/.test(name)) return { floorUsage: 'podium_roof' }
  if (/屋面|屋顶|RF/i.test(name)) return { floorUsage: 'roof' }
  if (/夹层/.test(name)) return { floorUsage: 'mezzanine' }
  if (/雨棚|连廊/.test(name)) return { floorUsage: 'canopy' }
  return {}
}

function createFunctionalArea(parentId: string, name: string, functionalCategory?: string): ScopeNode {
  return newNode('functional_area', parentId, name, functionalCategory ? { functionalCategory } : {})
}

function createBasement(name: string, metadata: Record<string, unknown> = {}, children: ScopeNode[] = []): ScopeNode {
  const basement = newNode('basement', null, name, metadata)
  basement.children = children.map((child) => reparentNode(child, basement.id))
  return basement
}

function createPhysicalZone(name: string, metadata: Record<string, unknown> = {}, children: ScopeNode[] = []): ScopeNode {
  const physicalZone = newNode('physical_zone', null, name, metadata)
  physicalZone.children = children.map((child) => reparentNode(child, physicalZone.id))
  return physicalZone
}

function createBuilding(name: string, metadata: Record<string, unknown>, floors: Array<{ name: string; order: number; functionalAreas?: Array<{ name: string; category?: string }> }> = []): ScopeNode {
  const building = newNode('building', null, name, floors.length > 0
    ? { ...metadata, decompositionMode: 'by_floor', childrenComplete: true }
    : metadata)
  building.children = floors.map((floor) => {
    const floorNode = createFloor(building.id, floor.name, floor.order)
    floorNode.children = (floor.functionalAreas ?? []).map((area) => createFunctionalArea(floorNode.id, area.name, area.category))
    return floorNode
  })
  return building
}

function createPhysicalZoneWithFloors(
  name: string,
  floors: Array<{ name: string; order: number; functionalAreas?: Array<{ name: string; category?: string }> }>,
  metadata: Record<string, unknown> = {},
): ScopeNode {
  const zone = createPhysicalZone(name, {
    ...metadata,
    standardFloorCount: floors.length,
    childrenComplete: true,
  })
  zone.children = floors.map((floor) => {
    const floorNode = createFloor(zone.id, floor.name, floor.order)
    floorNode.children = (floor.functionalAreas ?? []).map((area) => createFunctionalArea(floorNode.id, area.name, area.category))
    return floorNode
  })
  return zone
}

function createBuildingWithPhysicalZones(name: string, metadata: Record<string, unknown>, zones: ScopeNode[]): ScopeNode {
  const building = newNode('building', null, name, {
    ...metadata,
    decompositionMode: 'by_physical_zone',
    childrenComplete: true,
  })
  building.children = zones.map((zone) => reparentNode(zone, building.id))
  return building
}

function createSection(name: string, children: ScopeNode[] = []): ScopeNode {
  const section = newNode('section', null, name)
  section.children = children.map((child) => reparentNode(child, section.id))
  return section
}

function floorRange(start: number, end: number, prefix = 'L'): Array<{ name: string; order: number }> {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const order = start + index
    return { name: `${prefix}${order}`, order }
  })
}

function isUndergroundLevelTarget(node: ScopeNode, path: ScopeNode[] = []): boolean {
  return node.type === 'basement'
    || node.metadata.levelSystem === 'underground'
    || node.metadata.physicalCategory === 'basement_work_zone'
    || path.some((ancestor) => ancestor.type === 'basement')
}

function floorRangeForTarget(target: ScopeNode, start: number, end: number, path: ScopeNode[] = []): Array<{ name: string; order: number }> {
  if (!isUndergroundLevelTarget(target, path)) return floorRange(start, end)
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const level = start + index
    return { name: `B${level}`, order: -level }
  })
}

function parseSkippedFloors(value: string, start: number, end: number): Set<number> {
  return new Set(
    value
      .split(/[,\uFF0C\s]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= start && item <= end),
  )
}

function resolveBusinessScopeKey(businessType?: string | null, businessSubtype?: string | null): string {
  if (businessSubtype && (BUILDING_USAGE_OPTIONS_BY_BUSINESS[businessSubtype] || INDEPENDENT_ZONE_OPTIONS_BY_BUSINESS[businessSubtype])) {
    return businessSubtype
  }
  return businessType ?? ''
}

function getIndependentZoneOptions(businessType?: string | null, businessSubtype?: string | null): IndependentZoneOption[] {
  return INDEPENDENT_ZONE_OPTIONS_BY_BUSINESS[resolveBusinessScopeKey(businessType, businessSubtype)]
    ?? INDEPENDENT_ZONE_OPTIONS_BY_BUSINESS.general_civil
}

function getBuildingUsageOptions(businessType?: string | null, businessSubtype?: string | null): string[] {
  return BUILDING_USAGE_OPTIONS_BY_BUSINESS[resolveBusinessScopeKey(businessType, businessSubtype)]
    ?? BUILDING_USAGE_OPTIONS_BY_BUSINESS.general_civil
}

function normalizeScopeDescription(text: string): string {
  return text
    .replace(/[：]/g, ':')
    .replace(/[，]/g, ',')
    .replace(/[；]/g, ';')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .trim()
}

function resolveUsageFromDescription(text: string, fallback: string): string {
  if (/住宅|住区/.test(text)) return '住宅楼'
  if (/办公|写字/.test(text)) return '写字楼'
  if (/医技/.test(text)) return '医技楼'
  if (/门诊/.test(text)) return '门诊楼'
  if (/住院/.test(text)) return '住院楼'
  if (/酒店|客房/.test(text)) return '酒店客房楼'
  if (/厂房/.test(text)) return '主厂房'
  const usageCandidates = [
    '住院楼',
    '医技楼',
    '门诊楼',
    '住宅楼',
    '写字楼',
    '酒店客房楼',
    '商业',
    '综合楼',
    '机房楼',
    '主厂房',
    '仓库',
    '教学楼',
    '实验楼',
    '宿舍楼',
  ]
  return usageCandidates.find((usage) => text.includes(usage)) ?? fallback
}

function normalizeBuildingName(numberText: string, usage: string, isSingleBuilding: boolean): string {
  if (usage) return `${numberText}#${usage}`
  return `${numberText}#楼`
}

function parseChineseIntegerToken(value: string | undefined): number | null {
  const token = String(value ?? '').trim().replace(/^第/, '')
  if (!token) return null
  if (/^\d+$/.test(token)) return Number(token)
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  if (token === '十') return 10
  if (token.includes('十')) {
    const [tensText, onesText] = token.split('十')
    const tens = tensText ? digits[tensText] ?? 0 : 1
    const ones = onesText ? digits[onesText] ?? 0 : 0
    const parsed = tens * 10 + ones
    return parsed > 0 ? parsed : null
  }
  return digits[token] ?? null
}

function normalizeChineseNumberTokens(text: string): string {
  return text.replace(/第?[零一二两三四五六七八九十]+(?=期|标段|栋|号楼|楼|层|地下室)/g, (match) => {
    const parsed = parseChineseIntegerToken(match)
    return parsed ? String(parsed) : match
  })
}

function normalizeDescriptionForRelationParsing(text: string): string {
  return normalizeChineseNumberTokens(text)
    .replace(/\s+/g, '')
    .replace(/－|—|–/g, '-')
    .replace(/到|至|~/g, '-')
    .replace(/＃/g, '#')
}

function uniqueNumbers(numbers: number[]): number[] {
  return Array.from(new Set(numbers.filter((number) => Number.isFinite(number) && number > 0))).sort((a, b) => a - b)
}

function expandNumberRange(start: number, end: number): number[] {
  const min = Math.min(start, end)
  const max = Math.max(start, end)
  return Array.from({ length: max - min + 1 }, (_, index) => min + index)
}

function parseBuildingNumberList(value: string): number[] {
  const normalized = normalizeDescriptionForRelationParsing(value)
    .replace(/楼栋|楼号|栋楼|楼|栋/g, '')
    .replace(/#/g, '')
  const numbers: number[] = []
  const rangePattern = /(\d+)-(\d+)/g
  let rangeMatch: RegExpExecArray | null
  const consumed: Array<[number, number]> = []
  while ((rangeMatch = rangePattern.exec(normalized)) !== null) {
    numbers.push(...expandNumberRange(Number(rangeMatch[1]), Number(rangeMatch[2])))
    consumed.push([rangeMatch.index, rangeMatch.index + rangeMatch[0].length])
  }
  const singlePattern = /\d+/g
  let singleMatch: RegExpExecArray | null
  while ((singleMatch = singlePattern.exec(normalized)) !== null) {
    const overlapsRange = consumed.some(([start, end]) => singleMatch && singleMatch.index >= start && singleMatch.index < end)
    if (!overlapsRange) numbers.push(Number(singleMatch[0]))
  }
  return uniqueNumbers(numbers)
}

function parsePhaseSectionRef(value: string): ParsedPhaseSectionRef {
  const normalized = normalizeDescriptionForRelationParsing(value)
  const phaseNumber = parseChineseIntegerToken(normalized.match(/(\d+)期/)?.[1] ?? '')
    ?? undefined
  const sectionNumber = parseChineseIntegerToken(normalized.match(/(\d+)(?:个)?标段?/)?.[1] ?? '')
    ?? undefined
  return { phaseNumber, sectionNumber }
}

function formatPhaseName(phaseNumber: number): string {
  return `${phaseNumber}期`
}

function formatSectionName(sectionNumber: number): string {
  return `${sectionNumber}标段`
}

function getIndependentZoneOptionFromDescription(
  text: string,
  businessType?: string | null,
  businessSubtype?: string | null,
): IndependentZoneOption | null {
  const options = getIndependentZoneOptions(businessType, businessSubtype)
  return options.find((option) => text.includes(option.label))
    ?? INDEPENDENT_ZONE_OPTIONS_BY_BUSINESS.general_civil.find((option) => text.includes(option.label))
    ?? ALL_INDEPENDENT_ZONE_OPTIONS.find((option) => option.templateSupport !== 'manual' && text.includes(option.label))
    ?? null
}

function createIndependentZoneFromOption(option: IndependentZoneOption): ScopeNode {
  return createPhysicalZone(option.label, {
    physicalSpaceKind: 'independent_engineering_zone',
    physicalCategory: option.value,
    physicalCategoryLabel: option.label,
    templateSupport: option.templateSupport,
    templateSupportLabel: getTemplateSupportLabel(option.templateSupport),
    parsedFromDescription: true,
  })
}

function createDescriptionBuilding(number: number, fallbackUsage: string, fact?: BuildingAssignmentFact): ScopeNode {
  const usage = resolveUsageFromDescription(fact?.usageText ?? '', fallbackUsage)
  const metadata: Record<string, unknown> = {
    functionalUsage: usage,
    buildingNumber: number,
    parsedFromDescription: true,
  }
  if (fact?.floorCount) metadata.standardFloorCount = fact.floorCount
  return createBuilding(normalizeBuildingName(String(number), usage, false), metadata)
}

function appendServedByScope(target: ScopeNode, scope: ScopeNode): ScopeNode {
  const servedByIds = readStringArray(target.metadata.servedByScopeObjectIds)
  const servedByNames = readStringArray(target.metadata.servedByScopeNames)
  if (servedByIds.includes(scope.id)) return target
  return {
    ...target,
    metadata: {
      ...target.metadata,
      servedByScopeObjectIds: [...servedByIds, scope.id],
      servedByScopeNames: [...servedByNames, scope.name],
    },
  }
}

function createDescriptionSummary(rootNodes: ScopeNode[]): string {
  const flat = flattenNodes(rootNodes)
  const phaseCount = flat.filter((node) => node.type === 'phase').length
  const sectionCount = flat.filter((node) => node.type === 'section').length
  const buildingCount = flat.filter((node) => node.type === 'building').length
  const basementCount = flat.filter((node) => node.type === 'basement').length
  const sharedCount = flat.filter((node) => node.metadata.physicalSpaceKind === 'shared_podium').length
  const outdoorCount = flat.filter((node) => node.metadata.physicalSpaceKind === 'outdoor_site').length
  const independentZoneCount = flat.filter((node) => node.metadata.physicalSpaceKind === 'independent_engineering_zone').length
  return `已生成 ${phaseCount} 个分期、${sectionCount} 个标段、${buildingCount} 栋单体、${sharedCount} 个共享裙房、${basementCount} 个地下空间、${outdoorCount} 个室外总平、${independentZoneCount} 个独立工程区草稿。`
}

function parseBuildingAssignmentFacts(text: string): BuildingAssignmentFact[] {
  const normalized = normalizeDescriptionForRelationParsing(text)
  const clauses = normalized.split(/[,;。]+/).map((clause) => clause.trim()).filter(Boolean)
  const facts: BuildingAssignmentFact[] = []
  for (const clause of clauses) {
    const match = clause.match(/^(?:其中)?([0-9#、,-]+)(?:在|属于|归属|是)(\d+期(?:\d+标段?)?)/)
    if (!match) continue
    const buildingNumbers = parseBuildingNumberList(match[1])
    if (buildingNumbers.length === 0) continue
    const { phaseNumber, sectionNumber } = parsePhaseSectionRef(match[2])
    const floorCount = parseChineseIntegerToken(clause.match(/(\d+)(?:F|层)/)?.[1] ?? '')
      ?? undefined
    facts.push({
      buildingNumbers,
      phaseNumber,
      sectionNumber,
      usageText: clause,
      floorCount,
    })
  }
  return facts
}

function parseIndependentZoneAssignmentFacts(
  text: string,
  businessType?: string | null,
  businessSubtype?: string | null,
): IndependentZoneAssignmentFact[] {
  const normalized = normalizeDescriptionForRelationParsing(text)
  const clauses = normalized.split(/[,;。]+/).map((clause) => clause.trim()).filter(Boolean)
  const facts: IndependentZoneAssignmentFact[] = []
  for (const clause of clauses) {
    const option = getIndependentZoneOptionFromDescription(clause, businessType, businessSubtype)
    if (!option) continue
    const { phaseNumber, sectionNumber } = parsePhaseSectionRef(clause)
    facts.push({ phaseNumber, sectionNumber, option })
  }
  return facts
}

function parseBasementAssignmentFacts(text: string): BasementAssignmentFact[] {
  const normalized = normalizeDescriptionForRelationParsing(text)
  const basementMarkers = Array.from(normalized.matchAll(/(\d+)号地下室/g))
  const facts: BasementAssignmentFact[] = []
  for (let index = 0; index < basementMarkers.length; index += 1) {
    const marker = basementMarkers[index]
    const start = marker.index ?? 0
    const end = basementMarkers[index + 1]?.index ?? normalized.length
    const clause = normalized.slice(start, end)
    const serviceText = clause.match(/(?:是|由|服务|覆盖)([^,;。]+?)(?:共用|共享|服务|覆盖)/)?.[1] ?? ''
    const serviceBuildingNumbers = parseBuildingNumberList(serviceText)
    const levelCount = parseChineseIntegerToken(clause.match(/(?:一共|共|地下)?(\d+)层/)?.[1] ?? '') ?? 0
    if (serviceBuildingNumbers.length === 0 || levelCount <= 0) continue
    facts.push({
      name: `${marker[1]}号地下室`,
      levelCount,
      serviceBuildingNumbers,
    })
  }
  return facts
}

function hasOutdoorSiteFact(text: string): boolean {
  return /室外总平|室外场地|室外工程|场地总平|总平/.test(normalizeDescriptionForRelationParsing(text))
}

function collectDeclaredPhaseSections(text: string): Map<number, number> {
  const normalized = normalizeDescriptionForRelationParsing(text)
  const phaseSectionCounts = new Map<number, number>()
  const totalPhaseCount = parseChineseIntegerToken(normalized.match(/(?:项目)?有(\d+)期/)?.[1] ?? '')
  if (totalPhaseCount) {
    for (let phaseNumber = 1; phaseNumber <= totalPhaseCount; phaseNumber += 1) {
      phaseSectionCounts.set(phaseNumber, phaseSectionCounts.get(phaseNumber) ?? 0)
    }
  }
  const sectionCountPattern = /(\d+)期有(\d+)个?标段/g
  let sectionCountMatch: RegExpExecArray | null
  while ((sectionCountMatch = sectionCountPattern.exec(normalized)) !== null) {
    phaseSectionCounts.set(Number(sectionCountMatch[1]), Number(sectionCountMatch[2]))
  }
  const noSectionPattern = /(\d+)期不分(?:段|标段)?/g
  let noSectionMatch: RegExpExecArray | null
  while ((noSectionMatch = noSectionPattern.exec(normalized)) !== null) {
    phaseSectionCounts.set(Number(noSectionMatch[1]), phaseSectionCounts.get(Number(noSectionMatch[1])) ?? 0)
  }
  return phaseSectionCounts
}

function applyServedByScopeToBuildingNumbers(nodes: ScopeNode[], buildingNumbers: number[], scope: ScopeNode): ScopeNode[] {
  const numberSet = new Set(buildingNumbers)
  return nodes.map((node) => {
    const nextNode = node.type === 'building' && numberSet.has(Number(node.metadata.buildingNumber))
      ? appendServedByScope(node, scope)
      : node
    return {
      ...nextNode,
      children: applyServedByScopeToBuildingNumbers(nextNode.children, buildingNumbers, scope),
    }
  })
}

function applyServedByScopeToTargetIds(nodes: ScopeNode[], targetIds: Set<string>, scope: ScopeNode): ScopeNode[] {
  return nodes.map((node) => {
    const nextNode = targetIds.has(node.id) ? appendServedByScope(node, scope) : node
    return {
      ...nextNode,
      children: applyServedByScopeToTargetIds(nextNode.children, targetIds, scope),
    }
  })
}

function buildRelationBasedScopeTreeFromDescription(
  rawText: string,
  businessType?: string | null,
  businessSubtype?: string | null,
): ScopeDescriptionParseResult | null {
  const text = normalizeScopeDescription(rawText)
  const fallbackUsage = getBuildingUsageOptions(businessType, businessSubtype)[0] ?? '综合楼'
  const phaseSectionCounts = collectDeclaredPhaseSections(text)
  const buildingAssignments = parseBuildingAssignmentFacts(text)
  const independentZoneAssignments = parseIndependentZoneAssignmentFacts(text, businessType, businessSubtype)
  const basementAssignments = parseBasementAssignmentFacts(text)
  const includesOutdoorSite = hasOutdoorSiteFact(text)
  const hasRelationFacts = buildingAssignments.length > 0 || independentZoneAssignments.length > 0 || basementAssignments.length > 0
  if (!hasRelationFacts) {
    return null
  }

  const rootNodes: ScopeNode[] = []
  const phases = new Map<number, ScopeNode>()
  const sections = new Map<string, ScopeNode>()
  const buildingFactsByNumber = new Map<number, BuildingAssignmentFact>()
  const createdBuildingNumbers = new Set<number>()

  const ensurePhase = (phaseNumber: number): ScopeNode => {
    const existing = phases.get(phaseNumber)
    if (existing) return existing
    const phase = newNode('phase', null, formatPhaseName(phaseNumber), {
      organizationScope: 'phase',
      parsedFromDescription: true,
    })
    phases.set(phaseNumber, phase)
    rootNodes.push(phase)
    return phase
  }

  const ensureSection = (phaseNumber: number, sectionNumber: number): ScopeNode => {
    const key = `${phaseNumber}:${sectionNumber}`
    const existing = sections.get(key)
    if (existing) return existing
    const phase = ensurePhase(phaseNumber)
    const section = newNode('section', phase.id, formatSectionName(sectionNumber), {
      organizationScope: 'construction_area_section',
      phaseObjectId: phase.id,
      parsedFromDescription: true,
    })
    sections.set(key, section)
    phase.children = [...phase.children, section]
    return section
  }

  for (const [phaseNumber, sectionCount] of Array.from(phaseSectionCounts.entries()).sort(([a], [b]) => a - b)) {
    ensurePhase(phaseNumber)
    for (let sectionNumber = 1; sectionNumber <= sectionCount; sectionNumber += 1) {
      ensureSection(phaseNumber, sectionNumber)
    }
  }

  for (const fact of buildingAssignments) {
    for (const buildingNumber of fact.buildingNumbers) {
      if (!buildingFactsByNumber.has(buildingNumber)) buildingFactsByNumber.set(buildingNumber, fact)
      if (createdBuildingNumbers.has(buildingNumber)) continue
      const parent = fact.phaseNumber && fact.sectionNumber
        ? ensureSection(fact.phaseNumber, fact.sectionNumber)
        : fact.phaseNumber ? ensurePhase(fact.phaseNumber) : null
      const building = createDescriptionBuilding(buildingNumber, fallbackUsage, fact)
      const mountedBuilding = reparentNode(building, parent?.id ?? null)
      if (parent) {
        parent.children = [...parent.children, mountedBuilding]
      } else {
        rootNodes.push(mountedBuilding)
      }
      createdBuildingNumbers.add(buildingNumber)
    }
  }

  for (const fact of independentZoneAssignments) {
    const parent = fact.phaseNumber && fact.sectionNumber
      ? ensureSection(fact.phaseNumber, fact.sectionNumber)
      : fact.phaseNumber ? ensurePhase(fact.phaseNumber) : null
    const zone = reparentNode(createIndependentZoneFromOption(fact.option), parent?.id ?? null)
    if (parent) {
      parent.children = [...parent.children, zone]
    } else {
      rootNodes.push(zone)
    }
  }

  let nextRootNodes = rootNodes
  for (const fact of basementAssignments) {
    const availableTargets = flattenNodes(nextRootNodes)
      .filter((node) => node.type === 'building' && fact.serviceBuildingNumbers.includes(Number(node.metadata.buildingNumber)))
    const basement = applyScopeServiceTargets(createBasement(fact.name, {
      basementLevelCount: fact.levelCount,
      basementKind: 'common_basement',
      parsedFromDescription: true,
    }), availableTargets)
    nextRootNodes = [...applyServedByScopeToBuildingNumbers(nextRootNodes, fact.serviceBuildingNumbers, basement), basement]
  }

  if (includesOutdoorSite) {
    const outdoorTargets = flattenNodes(nextRootNodes).filter(isServiceTargetCandidate)
    const outdoorSite = applyScopeServiceTargets(createPhysicalZone('室外总平', {
      physicalSpaceKind: 'outdoor_site',
      physicalCategory: 'outdoor_site_plan',
      physicalCategoryLabel: '室外总平',
      parsedFromDescription: true,
    }), outdoorTargets)
    nextRootNodes = [
      ...applyServedByScopeToTargetIds(nextRootNodes, new Set(outdoorTargets.map((target) => target.id)), outdoorSite),
      outdoorSite,
    ]
  }

  if (flattenNodes(nextRootNodes).filter((node) => node.type === 'building' || node.type === 'basement' || node.type === 'physical_zone').length === 0) {
    return null
  }
  return {
    nodes: nextRootNodes,
    summary: createDescriptionSummary(nextRootNodes),
  }
}

function applyScopeServiceTargets(scope: ScopeNode, targets: ScopeNode[]): ScopeNode {
  const serviceTargetObjectIds = targets.map((target) => target.id)
  const serviceTargetNames = targets.map((target) => target.name)
  const serviceTargetKinds = targets.map(getServiceTargetKind)
  return {
    ...scope,
    metadata: {
      ...scope.metadata,
      serviceTargetObjectIds,
      serviceTargetNames,
      serviceTargetKinds,
      serviceRangeSavedAt: new Date().toISOString(),
    },
  }
}

function applyServedByScopes(target: ScopeNode, scopes: ScopeNode[]): ScopeNode {
  return {
    ...target,
    metadata: {
      ...target.metadata,
      servedByScopeObjectIds: scopes.map((scope) => scope.id),
      servedByScopeNames: scopes.map((scope) => scope.name),
    },
  }
}

function parseBuildingRowsFromDescription(segment: string, fallbackUsage: string): ScopeNode[] {
  const buildings: ScopeNode[] = []
  const rangePattern = /(\d+)#\s*[-~至到]\s*(\d+)#([^,;，；。]*?)(\d+)\s*(?:F|层)/gi
  const consumed: Array<[number, number]> = []
  let maxExplicitBuildingNumber = 0
  let rangeMatch: RegExpExecArray | null
  while ((rangeMatch = rangePattern.exec(segment)) !== null) {
    const start = Number(rangeMatch[1])
    const end = Number(rangeMatch[2])
    maxExplicitBuildingNumber = Math.max(maxExplicitBuildingNumber, start, end)
    const usage = resolveUsageFromDescription(rangeMatch[3] ?? '', '住宅楼')
    const floorCount = normalizePositiveInteger(rangeMatch[4], 1)
    for (let number = start; number <= end; number += 1) {
      buildings.push(createBuilding(normalizeBuildingName(String(number), usage, false), {
        functionalUsage: usage,
        standardFloorCount: floorCount,
        parsedFromDescription: true,
      }))
    }
    consumed.push([rangeMatch.index, rangeMatch.index + rangeMatch[0].length])
  }

  const singlePattern = /(\d+)#([^,;，；。#]*?)(\d+)\s*(?:F|层)/gi
  let singleMatch: RegExpExecArray | null
  while ((singleMatch = singlePattern.exec(segment)) !== null) {
    const overlapsRange = consumed.some(([start, end]) => singleMatch && singleMatch.index >= start && singleMatch.index < end)
    if (overlapsRange) continue
    const usage = resolveUsageFromDescription(singleMatch[2] ?? '', '')
    const floorCount = normalizePositiveInteger(singleMatch[3], 1)
    maxExplicitBuildingNumber = Math.max(maxExplicitBuildingNumber, Number(singleMatch[1]))
    buildings.push(createBuilding(normalizeBuildingName(singleMatch[1], usage, true), {
      functionalUsage: usage || '综合楼',
      standardFloorCount: floorCount,
      parsedFromDescription: true,
    }))
    consumed.push([singleMatch.index, singleMatch.index + singleMatch[0].length])
  }

  let nextGeneratedBuildingNumber = maxExplicitBuildingNumber + 1 || 1
  const quantityPattern = /(\d+)\s*栋\s*(?:(\d+)\s*(?:F|层)\s*([^,;，；。]*)|([^,;，；。]*?)(\d+)\s*(?:F|层))/gi
  let quantityMatch: RegExpExecArray | null
  while ((quantityMatch = quantityPattern.exec(segment)) !== null) {
    const overlapsExisting = consumed.some(([start, end]) => quantityMatch && quantityMatch.index >= start && quantityMatch.index < end)
    if (overlapsExisting) continue
    const count = normalizePositiveInteger(quantityMatch[1], 1)
    const floorCount = normalizePositiveInteger(quantityMatch[2] ?? quantityMatch[5], 1)
    const usageText = String(quantityMatch[3] ?? quantityMatch[4] ?? '')
    const usage = resolveUsageFromDescription(usageText, fallbackUsage)
    for (let index = 0; index < count; index += 1) {
      const buildingNumber = nextGeneratedBuildingNumber + index
      buildings.push(createBuilding(`${buildingNumber}#${usage}`, {
        functionalUsage: usage,
        standardFloorCount: floorCount,
        parsedFromDescription: true,
      }))
    }
    nextGeneratedBuildingNumber += count
  }
  return buildings
}

function buildScopeTreeFromDescription(rawText: string, businessType?: string | null, businessSubtype?: string | null): ScopeDescriptionParseResult | null {
  const text = normalizeScopeDescription(rawText)
  if (!text) return null
  const relationBasedResult = buildRelationBasedScopeTreeFromDescription(text, businessType, businessSubtype)
  if (relationBasedResult) return relationBasedResult
  const fallbackUsage = getBuildingUsageOptions(businessType, businessSubtype)[0] ?? '综合楼'
  const segments = text.split(/[;。]+/).map((segment) => segment.trim()).filter(Boolean)
  const rootNodes: ScopeNode[] = []

  for (const segment of segments) {
    const phaseName = segment.match(/(一期|二期|三期|四期|五期|六期|七期|八期|九期|十期|第[一二三四五六七八九十]+期|\d+期)/)?.[1]
    const sectionName = segment.match(/([A-Za-z0-9一二三四五六七八九十]+标)/)?.[1]
    const buildings = parseBuildingRowsFromDescription(segment, fallbackUsage).map((building) => {
      if (!building.metadata.functionalUsage || building.metadata.functionalUsage === '综合楼') {
        return { ...building, metadata: { ...building.metadata, functionalUsage: fallbackUsage } }
      }
      return building
    })
    const sharedScopes: ScopeNode[] = []
    const podiumMatch = segment.match(/(\d+)\s*(?:F|层)?[^,;，；。]*共享[^,;，；。]*裙房/)
    if (podiumMatch && buildings.length > 0) {
      const podiumFloorCount = normalizePositiveInteger(podiumMatch[1], 1)
      const podium = createPhysicalZoneWithFloors('共享裙房', floorRange(1, podiumFloorCount), {
        physicalSpaceKind: 'shared_podium',
        physicalCategory: 'shared_podium',
        physicalCategoryLabel: '共享裙房',
        structuralRole: 'podium',
        functionalUsage: '商业',
        sharedScopeCandidate: true,
        parsedFromDescription: true,
      })
      sharedScopes.push(applyScopeServiceTargets(podium, buildings))
    }
    const servedBuildings = sharedScopes.length > 0
      ? buildings.map((building) => applyServedByScopes(building, sharedScopes))
      : buildings
    const spaces: ScopeNode[] = [...servedBuildings, ...sharedScopes]

    const basementMatch = segment.match(/B\s*(\d+)\s*地下室|地下室\s*B\s*(\d+)|地下\s*(\d+)\s*层/)
    if (basementMatch) {
      const basementLevelCount = normalizePositiveInteger(basementMatch[1] ?? basementMatch[2] ?? basementMatch[3], 1)
      const basement = createBasement('地下室', {
        basementLevelCount,
        basementKind: 'common_basement',
        parsedFromDescription: true,
      })
      spaces.push(servedBuildings.length > 0 ? applyScopeServiceTargets(basement, servedBuildings) : basement)
    }
    if (/室外总平|室外/.test(segment)) {
      const outdoor = createPhysicalZone('室外总平', {
        physicalSpaceKind: 'outdoor_site',
        physicalCategory: 'outdoor_site_plan',
        physicalCategoryLabel: '室外总平',
        parsedFromDescription: true,
      })
      spaces.push(servedBuildings.length > 0 ? applyScopeServiceTargets(outdoor, servedBuildings) : outdoor)
    }
    if (spaces.length === 0) continue

    if (phaseName) {
      const phase = newNode('phase', null, phaseName, { organizationScope: 'phase', parsedFromDescription: true })
      if (sectionName) {
        const section = newNode('section', phase.id, sectionName, {
          organizationScope: 'construction_area_section',
          phaseObjectId: phase.id,
          parsedFromDescription: true,
        })
        section.children = spaces.map((space) => reparentNode(space, section.id))
        phase.children = [section]
      } else {
        phase.children = spaces.map((space) => reparentNode(space, phase.id))
      }
      rootNodes.push(phase)
    } else if (sectionName) {
      const section = newNode('section', null, sectionName, {
        organizationScope: 'construction_area_section',
        parsedFromDescription: true,
      })
      section.children = spaces.map((space) => reparentNode(space, section.id))
      rootNodes.push(section)
    } else {
      rootNodes.push(...spaces.map((space) => reparentNode(space, null)))
    }
  }

  if (rootNodes.length === 0) return null
  const flat = flattenNodes(rootNodes)
  const phaseCount = flat.filter((node) => node.type === 'phase').length
  const sectionCount = flat.filter((node) => node.type === 'section').length
  const buildingCount = flat.filter((node) => node.type === 'building').length
  const basementCount = flat.filter((node) => node.type === 'basement').length
  const sharedCount = flat.filter((node) => node.metadata.physicalSpaceKind === 'shared_podium').length
  const outdoorCount = flat.filter((node) => node.metadata.physicalSpaceKind === 'outdoor_site').length
  return {
    nodes: rootNodes,
    summary: `已生成 ${phaseCount} 个分期、${sectionCount} 个标段、${buildingCount} 栋单体、${sharedCount} 个共享裙房、${basementCount} 个地下空间、${outdoorCount} 个室外总平草稿。`,
  }
}

function getTemplateSupportLabel(support: TemplateSupport): string {
  if (support === 'supported') return '可自动排程'
  if (support === 'partial') return '需复核排程'
  return '需手工补充'
}

function getTemplateSupportHelp(support: TemplateSupport): string {
  if (support === 'supported') return '已匹配专项模板或工效规则，生成时可触发对应工序包。'
  if (support === 'partial') return '已有相近模板或工效规则，生成后建议检查并微调任务清单。'
  return '模板暂未直接覆盖，可先作为物理范围保留，后续在专项特征或任务清单中手工补充。'
}

function getPhysicalSpaceInputType(node: ScopeNode): PhysicalSpaceInputType {
  if (node.type === 'building') return 'building'
  if (node.type === 'basement') return 'basement'
  if (node.type === 'physical_zone' && node.metadata.physicalSpaceKind === 'independent_engineering_zone') {
    return 'independent_zone'
  }
  return 'outdoor_site'
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function findNodePath(nodes: ScopeNode[], id: string, path: ScopeNode[] = []): ScopeNode[] {
  for (const node of nodes) {
    const nextPath = [...path, node]
    if (node.id === id) return nextPath
    const childPath = findNodePath(node.children, id, nextPath)
    if (childPath.length > 0) return childPath
  }
  return []
}

function summarizeStructureFact(node: ScopeNode): string {
  if (node.type === 'building') return String(node.metadata.functionalUsage ?? '未填写用途')
  if (node.type === 'basement') return `${normalizePositiveInteger(node.metadata.basementLevelCount, 1)} 层地下`
  if (node.type === 'physical_zone') {
    if (node.metadata.physicalSpaceKind === 'outdoor_site') return '室外总平'
    if (node.metadata.physicalSpaceKind === 'independent_engineering_zone') return String(node.metadata.physicalCategoryLabel ?? node.metadata.physicalCategory ?? '独立工程区')
    return String(node.metadata.physicalCategoryLabel ?? node.metadata.physicalCategory ?? '未填写区域类型')
  }
  return TYPE_LABELS[node.type]
}

function getFloorUsageLabel(node: ScopeNode): string | null {
  if (node.type !== 'floor') return null
  const usage = String(node.metadata.floorUsage ?? 'standard')
  if (usage === 'standard') return null
  return FLOOR_USAGE_LABELS[usage] ?? usage
}

function getScopeRelationVerb(node: ScopeNode): string {
  if (node.type === 'physical_zone' && node.metadata.physicalSpaceKind === 'outdoor_site') return '覆盖'
  return '服务'
}

function formatNodePath(nodes: ScopeNode[], id: string): string {
  const path = findNodePath(nodes, id)
  return path.length > 0 ? path.map((node) => node.name).join(' / ') : id
}

function canUseLevelDecomposition(node: ScopeNode, path: ScopeNode[] = []): boolean {
  if (node.type === 'building' || node.type === 'basement') return true
  if (node.type === 'floor') return false
  if (node.type !== 'physical_zone') return false
  if (node.metadata.physicalSpaceKind === 'outdoor_site' || node.metadata.physicalSpaceKind === 'independent_engineering_zone') return false
  return node.metadata.structuralRole === 'tower'
    || node.metadata.structuralRole === 'podium'
    || (path.some((ancestor) => ancestor.type === 'building') && !path.some((ancestor) => ancestor.type === 'basement'))
}

function getDecompositionModes(node: ScopeNode, path: ScopeNode[] = []): DecompositionMode[] {
  if (node.type === 'building') return ['by_floor', 'tower_podium']
  if (node.type === 'basement') return ['by_floor']
  if (node.type === 'floor') {
    return path.some((ancestor) => ancestor.type === 'basement') ? ['by_physical_zone'] : []
  }
  if (node.type !== 'physical_zone') return []
  if (node.metadata.physicalSpaceKind === 'independent_engineering_zone') return []
  if (node.metadata.physicalSpaceKind === 'outdoor_site') return ['by_physical_zone']
  if (node.metadata.physicalSpaceKind === 'horizontal_work_zone') return []
  if (canUseLevelDecomposition(node, path)) return ['by_floor']
  return []
}

function getDefaultDecompositionMode(node: ScopeNode | null, path: ScopeNode[] = []): DecompositionMode {
  return node ? getDecompositionModes(node, path)[0] ?? 'by_physical_zone' : 'by_floor'
}

function isPrimarySubdivisionTarget(node: ScopeNode): boolean {
  if (node.type === 'building' || node.type === 'basement') return true
  return node.type === 'physical_zone' && node.metadata.physicalSpaceKind === 'outdoor_site'
}

function isSharedScopeCandidate(node: ScopeNode): boolean {
  if (node.type === 'basement') return true
  if (node.type !== 'physical_zone') return false
  return node.metadata.physicalSpaceKind === 'outdoor_site'
    || node.metadata.sharedScopeCandidate === true
}

function getOrganizationMountOptions(nodes: ScopeNode[]): ScopeNode[] {
  return flattenNodes(nodes).filter((node) => node.type === 'phase' || node.type === 'section')
}

function isServiceTargetCandidate(node: ScopeNode): boolean {
  if (node.type === 'building') return true
  return node.type === 'physical_zone' && node.metadata.physicalSpaceKind === 'independent_engineering_zone'
}

function getServiceTargetKind(node: ScopeNode): string {
  if (node.type === 'building') return 'building'
  if (node.metadata.physicalSpaceKind === 'independent_engineering_zone') return 'independent_engineering_zone'
  return node.type
}

function getInlineServiceCopy(type: PhysicalSpaceInputType): ServiceScopeCopy {
  if (type === 'outdoor_site') {
    return {
      panelLabel: '室外覆盖对象',
      allLabel: '覆盖全部单体和独立工程区',
      customLabel: '指定对象',
      customFieldsetLabel: '指定室外覆盖对象',
      savedLabel: '室外覆盖对象已随项目空间保存',
      emptyLabel: '当前还没有单体或独立工程区可选。先添加覆盖对象后，再添加室外总平。',
    }
  }
  return {
    panelLabel: '地下室服务对象',
    allLabel: '服务全部单体和独立工程区',
    customLabel: '指定对象',
    customFieldsetLabel: '指定地下室服务对象',
    savedLabel: '地下室服务对象已随项目空间保存',
    emptyLabel: '当前还没有单体或独立工程区可选。先添加服务对象后，再添加地下室。',
  }
}

function getSharedScopeCopy(node: ScopeNode): ServiceScopeCopy {
  if (node.type === 'basement') return getInlineServiceCopy('basement')
  if (node.metadata.physicalSpaceKind === 'outdoor_site') return getInlineServiceCopy('outdoor_site')
  return {
    panelLabel: '共享服务对象',
    allLabel: '服务全部单体和独立工程区',
    customLabel: '指定对象',
    customFieldsetLabel: '指定共享服务对象',
    savedLabel: '共享服务对象已保存',
    emptyLabel: '当前还没有可共享的单体或独立工程区。',
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function applyServiceTargetsToScope(
  nodes: ScopeNode[],
  scopeId: string,
  targets: ScopeNode[],
  scopeName: string,
): ScopeNode[] {
  const selectedTargetIds = targets.map((target) => target.id)
  const selectedTargetNames = targets.map((target) => target.name)
  const selectedTargetKinds = targets.map(getServiceTargetKind)
  const withScopeTargets = updateNode(nodes, scopeId, (node) => ({
    ...node,
    metadata: {
      ...node.metadata,
      serviceTargetObjectIds: selectedTargetIds,
      serviceTargetNames: selectedTargetNames,
      serviceTargetKinds: selectedTargetKinds,
      serviceRangeSavedAt: new Date().toISOString(),
    },
  }))
  return flattenNodes(nodes).filter(isServiceTargetCandidate).reduce((currentNodes, target) => (
    updateNode(currentNodes, target.id, (node) => {
      const servedByIds = readStringArray(node.metadata.servedByScopeObjectIds)
      const servedByNames = readStringArray(node.metadata.servedByScopeNames)
      const retainedServedByScopes = servedByIds
        .map((id, index) => ({ id, name: servedByNames[index] ?? id }))
        .filter((scope) => scope.id !== scopeId)
      const nextServedByScopes = selectedTargetIds.includes(target.id)
        ? [...retainedServedByScopes, { id: scopeId, name: scopeName }]
        : retainedServedByScopes
      return {
        ...node,
        metadata: {
          ...node.metadata,
          servedByScopeObjectIds: nextServedByScopes.map((scope) => scope.id),
          servedByScopeNames: nextServedByScopes.map((scope) => scope.name),
        },
      }
    })
  ), withScopeTargets)
}

function isProjectWidePhysicalSpaceType(type: PhysicalSpaceInputType): boolean {
  return type === 'basement' || type === 'outdoor_site'
}

function resolveParentScopeMetadata(nodes: ScopeNode[], parentId: string | null): Record<string, unknown> {
  if (!parentId) return {}
  const path = findNodePath(nodes, parentId)
  const phase = [...path].reverse().find((node) => node.type === 'phase')
  const section = [...path].reverse().find((node) => node.type === 'section')
  return {
    ...(phase ? { phaseObjectId: phase.id } : {}),
    ...(section ? { sectionObjectId: section.id } : {}),
  }
}

function summarizeStructureDecomposition(node: ScopeNode): string {
  const floorCount = flattenNodes(node.children).filter((child) => child.type === 'floor').length
  const zoneCount = node.children.filter((child) => child.type === 'physical_zone').length
  const standardFloorCount = readPositiveInteger(node.metadata.standardFloorCount)
  if (floorCount > 0 && zoneCount > 0) return `${zoneCount} 个分区 / ${floorCount} 个楼层`
  if (floorCount > 0) return `${floorCount} 个楼层`
  if (node.type === 'building' && standardFloorCount && zoneCount > 0) return `${zoneCount} 个分区 / ${standardFloorCount} 层（未展开楼层）`
  if (zoneCount > 0) return `${zoneCount} 个分区`
  if (node.type === 'building' && standardFloorCount) return `${standardFloorCount} 层（未展开楼层）`
  if (node.type === 'basement') {
    return Number.isFinite(Number(node.metadata.basementLevelCount))
      ? `${normalizePositiveInteger(node.metadata.basementLevelCount, 1)} 层地下（可后续细分）`
      : '缺少地下层数'
  }
  if (node.type === 'physical_zone') {
    if (node.metadata.physicalSpaceKind === 'outdoor_site') return '室外总平整体'
    if (node.metadata.physicalSpaceKind === 'shared_podium') return `${standardFloorCount ?? floorCount} 层公共裙房`
    return '末级物理区域'
  }
  return node.type === 'building' ? '缺少楼层信息' : '可按需细分'
}

function structureStatusLabel(node: ScopeNode): string {
  const issue = getStructureReadinessIssue(node)
  return issue ? issue : 'WBS 信息已满足'
}

function isStructureClosed(node: ScopeNode): boolean {
  if (getStructureReadinessIssue(node)) return false
  if (!PHYSICAL_LEDGER_TYPES.has(node.type)) return true
  if (node.type === 'floor') return true
  if (node.type === 'building') {
    const floorCount = flattenNodes(node.children).filter((child) => child.type === 'floor').length
    return floorCount > 0 || Boolean(readPositiveInteger(node.metadata.standardFloorCount))
  }
  if (node.type === 'basement') return Boolean(readPositiveInteger(node.metadata.basementLevelCount))
  return true
}

function hasDanglingServiceRelations(node: ScopeNode, validIds: Set<string>): boolean {
  const relationIds = [
    ...readStringArray(node.metadata.serviceTargetObjectIds),
    ...readStringArray(node.metadata.servedByScopeObjectIds),
  ]
  return relationIds.some((id) => !validIds.has(id))
}

function findDuplicateFloorFact(node: ScopeNode): string | null {
  const floorRows = flattenNodes(node.children).filter((child) => child.type === 'floor')
  const seen = new Set<string>()
  for (const floor of floorRows) {
    const parsedOrder = Number(floor.metadata.floorOrder)
    const order = Number.isFinite(parsedOrder) ? Math.trunc(parsedOrder) : null
    const key = order
      ? `order:${order}`
      : `name:${normalizeFloorNameToken(floor.name)}`
    if (seen.has(key)) return '存在重复楼层'
    seen.add(key)
  }
  return null
}

function readNodeAreaM2(node: ScopeNode): number | null {
  return readPositiveNumber(node.metadata.areaM2)
    ?? readPositiveNumber(node.metadata.basementAreaM2)
}

function findChildAreaOverflow(node: ScopeNode): string | null {
  const parentArea = readNodeAreaM2(node)
  if (!parentArea) return null
  const childArea = node.children.reduce((sum, child) => sum + (readNodeAreaM2(child) ?? 0), 0)
  if (childArea > parentArea + 0.01) return '子空间面积超过父级'
  return null
}

function getStructureReadinessIssue(node: ScopeNode): string | null {
  const duplicateFloorIssue = findDuplicateFloorFact(node)
  if (duplicateFloorIssue) return duplicateFloorIssue
  const areaIssue = findChildAreaOverflow(node)
  if (areaIssue) return areaIssue
  if (!PHYSICAL_LEDGER_TYPES.has(node.type)) return null
  if (node.type === 'floor') return null
  if (node.type === 'building') {
    const floorCount = flattenNodes(node.children).filter((child) => child.type === 'floor').length
    return floorCount > 0 || Boolean(readPositiveInteger(node.metadata.standardFloorCount))
      ? null
      : '缺少楼层信息'
  }
  if (node.type === 'basement') {
    return readPositiveInteger(node.metadata.basementLevelCount) ? null : '缺少地下层数'
  }
  return null
}

function buildClosureDiagnostics(nodes: ScopeNode[]): Array<{ id: string; name: string; status: 'closed' | 'open'; detail: string; issue: string }> {
  const validIds = new Set(flattenNodes(nodes).map((node) => node.id))
  return flattenNodes(nodes)
    .filter((node) => node.type === 'building' || node.type === 'basement' || node.type === 'physical_zone')
    .map((node) => {
      const issue = hasDanglingServiceRelations(node, validIds)
        ? '存在悬空服务关系'
        : getStructureReadinessIssue(node)
      return {
        id: node.id,
        name: node.name,
        status: issue ? 'open' : 'closed',
        detail: summarizeStructureDecomposition(node),
        issue: issue || 'WBS 信息已满足',
      }
    })
}

type AutoWbsPlanHint = {
  id: string
  scopeName: string
  title: string
  detail: string
  support: TemplateSupport
}

type BusinessReviewItem = {
  id: string
  title: string
  detail: string
}

type BusinessReviewChecklist = {
  automaticItems: BusinessReviewItem[]
  missingFactItems: BusinessReviewItem[]
  manualTaskItems: BusinessReviewItem[]
}

const INDEPENDENT_ZONE_WBS_HINTS: Record<string, Omit<AutoWbsPlanHint, 'id' | 'scopeName'>> = {
  switching_station: {
    title: '开闭所：电气供配电',
    detail: '供配电、送电前检查等任务会挂到该独立工程区。',
    support: 'supported',
  },
  fire_pump_room: {
    title: '消防水池泵房：泵房设备 / 消防联动',
    detail: '泵房设备、消防联动和系统调试任务会挂到该独立工程区。',
    support: 'supported',
  },
  heat_exchange_station: {
    title: '换热站：设备机房 / 暖通联调',
    detail: '换热站设备安装、管线接驳和暖通联调任务会挂到该独立工程区。',
    support: 'supported',
  },
  waste_room: {
    title: '垃圾房：排水除臭 / 环卫移交',
    detail: '排水、除臭、环卫移交等任务会挂到该独立工程区。',
    support: 'supported',
  },
  liquid_oxygen_station: {
    title: '液氧站：医用气源 / 联调移交',
    detail: '液氧站设备、管道接驳、试压和医用气源联调任务会挂到该独立工程区。',
    support: 'supported',
  },
  sewage_treatment_station: {
    title: '污水处理站：预处理 / 达标排放',
    detail: '医疗污水或污水处理设备、管线、监测和移交任务会挂到该独立工程区。',
    support: 'supported',
  },
  hyperbaric_oxygen_chamber: {
    title: '高压氧舱：房间接口 / 试运行',
    detail: '高压氧舱接口、消防联动、压力与试运行任务会挂到该独立工程区。',
    support: 'supported',
  },
  medical_waste_holding: {
    title: '医疗废物暂存点：防渗消毒 / 转运移交',
    detail: '医废暂存、防渗、消毒、转运和移交任务会挂到该独立工程区。',
    support: 'supported',
  },
  substation: {
    title: '变电站：供配电 / 送电切换',
    detail: '变电站设备、继保、送电切换和正式移交任务会挂到该独立工程区。',
    support: 'supported',
  },
  generator_yard: {
    title: '柴发区：备用电源 / 油箱排烟',
    detail: '柴发、日用油箱、排烟消音和带载切换任务会挂到该独立工程区。',
    support: 'supported',
  },
  cooling_plant: {
    title: '冷站：冷源设备 / 散热联调',
    detail: '冷站设备、冷却塔或干冷器、管线和联调任务会挂到该独立工程区。',
    support: 'supported',
  },
  railway_operation_zone: {
    title: '轨行区：营业线防护 / 轨道保护',
    detail: '营业线隔离防护、轨道保护监测和运营接口移交任务会挂到该独立工程区。',
    support: 'supported',
  },
  transfer_passage: {
    title: '换乘通道：装修导向 / 开放签认',
    detail: '换乘通道装修、导向、照明广播、无障碍和开放签认任务会挂到该独立工程区。',
    support: 'supported',
  },
  traffic_connection_zone: {
    title: '交通接驳区：站城接口 / 市政接驳',
    detail: '站城商业接口、市政接驳、交通转换和移交任务会挂到该独立工程区。',
    support: 'supported',
  },
}

function normalizeFactCode(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function buildAutoWbsPlanHints(nodes: ScopeNode[]): AutoWbsPlanHint[] {
  return flattenNodes(nodes).flatMap((node): AutoWbsPlanHint[] => {
    if (node.type === 'basement' && readPositiveInteger(node.metadata.basementLevelCount)) {
      return [{
        id: `${node.id}:basement`,
        scopeName: node.name,
        title: '地下室防水 / 基坑',
        detail: '基坑、地下结构、防水和保温类任务会优先挂到该地下空间。',
        support: 'supported',
      }]
    }

    if (node.type === 'floor' && normalizeFactCode(node.metadata.floorUsage) === 'refuge') {
      return [{
        id: `${node.id}:refuge`,
        scopeName: node.name,
        title: '避难层专项',
        detail: '消防、排烟、应急电源等避难层任务会挂到该楼层。',
        support: 'supported',
      }]
    }

    if (node.type !== 'physical_zone') return []

    const physicalSpaceKind = normalizeFactCode(node.metadata.physicalSpaceKind)
    if (physicalSpaceKind === 'outdoor_site') {
      return [{
        id: `${node.id}:outdoor`,
        scopeName: node.name,
        title: '室外工程',
        detail: '室外道路、管网、园建等任务会挂到室外总平。',
        support: 'supported',
      }]
    }

    if (physicalSpaceKind !== 'independent_engineering_zone') return []

    const category = normalizeFactCode(node.metadata.physicalCategory)
    const knownHint = INDEPENDENT_ZONE_WBS_HINTS[category]
    if (knownHint) {
      return [{ id: `${node.id}:${category}`, scopeName: node.name, ...knownHint }]
    }

    const support = node.metadata.templateSupport === 'partial' ? 'partial' : 'manual'
    return [{
      id: `${node.id}:${category || 'manual'}`,
      scopeName: node.name,
      title: `${summarizeStructureFact(node)}：需后续补充任务清单`,
      detail: '当前空间会保留到范围树，生成后需由项目经理补充或复核专项任务。',
      support,
    }]
  })
}

function buildBusinessReviewChecklist(
  diagnostics: Array<{ id: string; name: string; status: 'closed' | 'open'; detail: string; issue: string }>,
  hints: AutoWbsPlanHint[],
): BusinessReviewChecklist {
  const automaticItems = hints
    .filter((hint) => hint.support === 'supported')
    .map((hint) => ({
      id: hint.id,
      title: hint.scopeName,
      detail: hint.title,
    }))

  const missingFactItems = diagnostics
    .filter((item) => item.status === 'open')
    .map((item) => ({
      id: item.id,
      title: item.name,
      detail: `补充${item.issue.replace(/^缺少|^存在/, '')}`,
    }))

  const manualTaskItems = hints
    .filter((hint) => hint.support !== 'supported')
    .map((hint) => ({
      id: hint.id,
      title: hint.scopeName,
      detail: hint.support === 'partial'
        ? '生成后复核专项任务'
        : '后续补充或复核专项任务',
    }))

  return { automaticItems, missingFactItems, manualTaskItems }
}

function countSpecialFloors(node: ScopeNode): number {
  return flattenNodes([node]).filter((item) => item.type === 'floor' && String(item.metadata.floorUsage ?? 'standard') !== 'standard').length
}

function normalizeFloorNameToken(value: string): string {
  return value.trim().replace(/^(\d+)$/i, 'L$1').toUpperCase()
}

function parseFloorNameTokens(value: string): Set<string> {
  return new Set(
    value
      .split(/[,\uFF0C\s]+/)
      .map(normalizeFloorNameToken)
      .filter(Boolean),
  )
}

function joinFloorNameTokens(tokens: Set<string>): string {
  return Array.from(tokens).join(',')
}

function collectFloorRows(node: ScopeNode): ScopeNode[] {
  return flattenNodes([node]).filter((item) => item.type === 'floor')
}

function readKnownLevelCount(node: ScopeNode): number | null {
  if (node.type === 'basement') return readPositiveInteger(node.metadata.basementLevelCount)
  if (node.type === 'building' || node.type === 'physical_zone') return readPositiveInteger(node.metadata.standardFloorCount)
  return null
}

function buildDefaultFloorRowsForTarget(target: ScopeNode, path: ScopeNode[] = []): ScopeNode[] {
  const count = readKnownLevelCount(target)
  if (!count) return []
  return floorRangeForTarget(target, 1, count, path).map((floor) => createFloor(target.id, floor.name, floor.order))
}

function applyFloorUsageToSubtree(node: ScopeNode, floorNames: Set<string>, floorUsage: string): ScopeNode {
  if (node.type === 'floor' && floorNames.has(normalizeFloorNameToken(node.name))) {
    const metadata = { ...node.metadata }
    if (floorUsage === 'standard') {
      delete metadata.floorUsage
    } else {
      metadata.floorUsage = floorUsage
    }
    return { ...node, metadata }
  }
  return {
    ...node,
    children: node.children.map((child) => applyFloorUsageToSubtree(child, floorNames, floorUsage)),
  }
}

function markFloorUsageByName(nodes: ScopeNode[], rootId: string, floorNames: Set<string>, floorUsage: string): ScopeNode[] {
  return nodes.map((node) => (
    node.id === rootId
      ? applyFloorUsageToSubtree(node, floorNames, floorUsage)
      : { ...node, children: markFloorUsageByName(node.children, rootId, floorNames, floorUsage) }
  ))
}

function cloneNode(node: ScopeNode, parentId: string | null, name = `${node.name} 副本`): ScopeNode {
  const cloned = newNode(node.type, parentId, name, stripServiceRelationMetadata(node.metadata))
  cloned.children = node.children.map((child) => cloneNode(child, cloned.id, child.name))
  return cloned
}

function stripServiceRelationMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const next = { ...metadata }
  delete next.serviceTargetObjectIds
  delete next.serviceTargetNames
  delete next.serviceTargetKinds
  delete next.servedByScopeObjectIds
  delete next.servedByScopeNames
  delete next.serviceRangeSavedAt
  return next
}

function flattenNodes(nodes: ScopeNode[]): ScopeNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)])
}

function serializeScopeNodes(nodes: ScopeNode[]): string {
  return JSON.stringify(nodes)
}

function findNode(nodes: ScopeNode[], id: string | null): ScopeNode | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findNode(node.children, id)
    if (child) return child
  }
  return null
}

function containsNode(node: ScopeNode, id: string): boolean {
  return node.children.some((child) => child.id === id || containsNode(child, id))
}

function removeNode(nodes: ScopeNode[], id: string): { nodes: ScopeNode[]; removed: ScopeNode | null } {
  let removed: ScopeNode | null = null
  const next = nodes
    .filter((node) => {
      if (node.id === id) {
        removed = node
        return false
      }
      return true
    })
    .map((node) => {
      const result = removeNode(node.children, id)
      if (result.removed) removed = result.removed
      return { ...node, children: result.nodes }
    })
  return { nodes: next, removed }
}

function buildNodeMap(nodes: ScopeNode[]): Map<string, ScopeNode> {
  return new Map(flattenNodes(nodes).map((node) => [node.id, node]))
}

function sanitizeScopeRelations(nodes: ScopeNode[]): ScopeNode[] {
  const nodeMap = buildNodeMap(nodes)
  const validIds = new Set(nodeMap.keys())
  const sanitizeNode = (node: ScopeNode): ScopeNode => {
    const serviceTargetIds = readStringArray(node.metadata.serviceTargetObjectIds)
    const serviceTargetNames = readStringArray(node.metadata.serviceTargetNames)
    const serviceTargetKinds = readStringArray(node.metadata.serviceTargetKinds)
    const servedByIds = readStringArray(node.metadata.servedByScopeObjectIds)
    const servedByNames = readStringArray(node.metadata.servedByScopeNames)
    const nextMetadata = { ...node.metadata }

    if (serviceTargetIds.length > 0) {
      const retainedTargets = serviceTargetIds
        .map((id, index) => {
          const target = nodeMap.get(id)
          return target
            ? {
                id,
                name: target.name || serviceTargetNames[index] || id,
                kind: getServiceTargetKind(target) || serviceTargetKinds[index] || 'scope',
              }
            : null
        })
        .filter((target): target is { id: string; name: string; kind: string } => Boolean(target && validIds.has(target.id)))
      if (retainedTargets.length > 0) {
        nextMetadata.serviceTargetObjectIds = retainedTargets.map((target) => target.id)
        nextMetadata.serviceTargetNames = retainedTargets.map((target) => target.name)
        nextMetadata.serviceTargetKinds = retainedTargets.map((target) => target.kind)
      } else {
        delete nextMetadata.serviceTargetObjectIds
        delete nextMetadata.serviceTargetNames
        delete nextMetadata.serviceTargetKinds
        delete nextMetadata.serviceRangeSavedAt
      }
    }

    if (servedByIds.length > 0) {
      const retainedServedBy = servedByIds
        .map((id, index) => {
          const scope = nodeMap.get(id)
          return scope
            ? { id, name: scope.name || servedByNames[index] || id }
            : null
        })
        .filter((scope): scope is { id: string; name: string } => Boolean(scope && validIds.has(scope.id)))
      if (retainedServedBy.length > 0) {
        nextMetadata.servedByScopeObjectIds = retainedServedBy.map((scope) => scope.id)
        nextMetadata.servedByScopeNames = retainedServedBy.map((scope) => scope.name)
      } else {
        delete nextMetadata.servedByScopeObjectIds
        delete nextMetadata.servedByScopeNames
      }
    }

    return {
      ...node,
      metadata: nextMetadata,
      children: node.children.map(sanitizeNode),
    }
  }
  return nodes.map(sanitizeNode)
}

function insertNode(nodes: ScopeNode[], parentId: string | null, node: ScopeNode): ScopeNode[] {
  const nextNode = reparentNode(node, parentId)
  if (!parentId) return [...nodes, nextNode]
  return nodes.map((item) => {
    if (item.id === parentId) {
      const parentMetadata = applyChildCompletenessMetadata(item, node.type, item.metadata)
      return { ...item, expanded: true, metadata: parentMetadata, children: [...item.children, nextNode] }
    }
    return { ...item, children: insertNode(item.children, parentId, node) }
  })
}

function updateNode(nodes: ScopeNode[], id: string, updater: (node: ScopeNode) => ScopeNode): ScopeNode[] {
  return nodes.map((node) => (
    node.id === id
      ? updater(node)
      : { ...node, children: updateNode(node.children, id, updater) }
  ))
}

function canDropOn(parent: ScopeNode | null, child: ScopeNode): boolean {
  if (!parent) return ROOT_CHILD_TYPE_SET.has(child.type)
  if (parent.id === child.id || containsNode(child, parent.id)) return false
  return resolveAllowedChildTypes(parent).includes(child.type)
}

type TreeRowProps = {
  node: ScopeNode
  depth: number
  selectedId: string | null
  dropTargetId: string | null
  editable: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onAddChild: (parentId: string, type: ObjectType) => void
  onDelete: (id: string) => void
}

function TreeRow({ node, depth, selectedId, dropTargetId, editable, onSelect, onToggle, onAddChild, onDelete }: TreeRowProps): JSX.Element {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: node.id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: node.id })
  const isDropTarget = dropTargetId === node.id || isOver
  const transformStyle = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
  const primaryChildType = getPrimaryChildType(node.type)
  const allowedChildTypes = resolveAllowedChildTypes(node)
  const ExpandIcon = getWizardScopeIcon('expand')
  const CollapseIcon = getWizardScopeIcon('collapse')
  const AddScopeIcon = getWizardScopeIcon('add_scope')
  const DeleteScopeIcon = getWizardScopeIcon('delete_scope')
  const floorUsageLabel = getFloorUsageLabel(node)
  const hasSpecialFloorUsage = Boolean(floorUsageLabel)
  const isSharedPhysicalScope = node.metadata.physicalSpaceKind === 'shared_podium' || node.metadata.sharedScopeCandidate === true
  const serviceTargetNames = readStringArray(node.metadata.serviceTargetNames)
  const relationVerb = getScopeRelationVerb(node)

  return (
    <div key={node.id} className="select-none">
      <div
        ref={(element) => {
          setDragRef(element)
          setDropRef(element)
        }}
        data-testid={`scope-node-${node.type}-${node.name}`}
        className={`group flex h-9 cursor-pointer items-center gap-1 rounded-lg px-2 transition-colors ${
          selectedId === node.id ? 'bg-blue-50 ring-1 ring-blue-300'
            : hasSpecialFloorUsage ? 'border-l-4 border-blue-400 bg-blue-50/70 hover:bg-blue-50'
              : isSharedPhysicalScope ? 'border-l-4 border-blue-400 bg-blue-50/70 hover:bg-blue-50'
                : 'hover:bg-slate-50'
        } ${isDropTarget ? 'ring-2 ring-blue-300' : ''} ${isDragging ? 'opacity-60' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 8}px`, transform: transformStyle }}
        onClick={() => onSelect(node.id)}
      >
        <Button unstyled
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggle(node.id) }}
          className="rounded p-0.5 transition-colors hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          aria-label={`${node.expanded ? '收起' : '展开'}${node.name}`}
        >
          {node.children.length > 0 || allowedChildTypes.length > 0 ? (
            node.expanded
              ? <CollapseIcon className="h-3.5 w-3.5 text-slate-400" data-testid={wizardIconTestId('collapse')} />
              : <ExpandIcon className="h-3.5 w-3.5 text-slate-400" data-testid={wizardIconTestId('expand')} />
          ) : (
            <span className="block w-3.5" />
          )}
        </Button>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${TYPE_COLORS[node.type]}`}
          {...(editable ? listeners : {})}
          {...(editable ? attributes : {})}
          title={editable ? '拖拽调整层级' : TYPE_LABELS[node.type]}
        >
          {TYPE_LABELS[node.type]}
        </span>
        <span className="ml-1 truncate text-sm text-slate-900">{node.name}</span>
        {floorUsageLabel ? (
          <span className="rounded-lg border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
            {floorUsageLabel}
          </span>
        ) : null}
        {isSharedPhysicalScope ? (
          <span className="rounded-lg border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
            公共物理空间
          </span>
        ) : null}
        {serviceTargetNames.length > 0 ? (
          <span className="max-w-[260px] truncate rounded-lg border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
            {relationVerb}：{serviceTargetNames.join('、')}
          </span>
        ) : null}
        <span className="flex-1" />
        {editable ? (
          <div className="hidden items-center gap-0.5 group-hover:flex">
          {primaryChildType && allowedChildTypes.includes(primaryChildType) ? (
            <Button unstyled
              type="button"
              data-testid={`scope-node-add-child-${node.id}`}
              onClick={(event) => { event.stopPropagation(); onAddChild(node.id, primaryChildType) }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
              title={`在 ${node.name} 下新增${TYPE_LABELS[primaryChildType]}`}
            >
              <AddScopeIcon className="h-3 w-3" data-testid={wizardIconTestId('add_scope')} />
              下级
            </Button>
          ) : null}
          <Button unstyled
            type="button"
            onClick={(event) => { event.stopPropagation(); onDelete(node.id) }}
            className="rounded p-1 transition-colors hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
            title="删除节点"
          >
            <DeleteScopeIcon className="h-3 w-3 text-rose-500" data-testid={wizardIconTestId('delete_scope')} />
          </Button>
          </div>
        ) : null}
      </div>
      {node.expanded && node.children.length > 0
        ? node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              dropTargetId={dropTargetId}
              editable={editable}
              onSelect={onSelect}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))
        : null}
    </div>
  )
}

interface Props { draft: WizardDraftPayload; onUpdate: (u: Partial<WizardDraftPayload>) => void }

function Step3EngineeringScopeScaleComponent({ draft, onUpdate }: Props) {
  const AddScopeIcon = getWizardScopeIcon('add_scope')
  const RecommendationIcon = getWizardScopeIcon('recommendation_draft')
  const ConfiguredIcon = getWizardScopeIcon('configured')
  const PendingIcon = getWizardScopeIcon('pending')
  const EditScopeIcon = getWizardScopeIcon('edit_scope')
  const DeleteScopeIcon = getWizardScopeIcon('delete_scope')
  const CollapseIcon = getWizardScopeIcon('collapse')
  const FloorBatchIcon = getWizardScopeIcon('floor_batch')
  const DuplicateScopeIcon = getWizardScopeIcon('duplicate_scope')
  const draftScopeTree = useMemo(() => (draft.scopeTree as ScopeNode[] | undefined) ?? [], [draft.scopeTree])
  const draftScopeTreeSnapshot = useMemo(() => serializeScopeNodes(draftScopeTree), [draftScopeTree])
  const draftModelingStage = normalizeScopeModelingStage(draft.scopeModelingStage)
  const [nodes, setNodes] = useState<ScopeNode[]>(() => draftScopeTree)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [showFloorBatch, setShowFloorBatch] = useState(false)
  const [floorStart, setFloorStart] = useState(5)
  const [floorEnd, setFloorEnd] = useState(25)
  const [floorTemplate, setFloorTemplate] = useState('L{n}')
  const [skipFloors, setSkipFloors] = useState('13')
  const [showAdvancedTreeEdit, setShowAdvancedTreeEdit] = useState(false)
  const [structureName, setStructureName] = useState('')
  const [structureType, setStructureType] = useState<PhysicalSpaceInputType>('building')
  const [structureFunctionalUsage, setStructureFunctionalUsage] = useState('住宅楼')
  const [independentZoneCategory, setIndependentZoneCategory] = useState('')
  const [structureBasementLevels, setStructureBasementLevels] = useState(2)
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null)
  const [structureEditSaved, setStructureEditSaved] = useState(false)
  const [organizationType, setOrganizationType] = useState<'phase' | 'section'>('phase')
  const [organizationName, setOrganizationName] = useState('')
  const [organizationParentPhaseId, setOrganizationParentPhaseId] = useState('')
  const [structureParentId, setStructureParentId] = useState(AUTO_PARENT_ID)
  const [selectedServiceTargetIds, setSelectedServiceTargetIds] = useState<string[]>([])
  const [contextServiceTargetIds, setContextServiceTargetIds] = useState<string[]>([])
  const [contextServiceRangeSaved, setContextServiceRangeSaved] = useState(false)
  const [showOrganizationPanel, setShowOrganizationPanel] = useState(false)
  const [serviceRangeMode, setServiceRangeMode] = useState<'all' | 'custom'>('all')
  const [inlineServiceSaved, setInlineServiceSaved] = useState(false)
  const [modelingStage, setModelingStage] = useState<ScopeModelingStage>(() => draftModelingStage)
  const [decompositionModeInput, setDecompositionModeInput] = useState<DecompositionMode>('by_floor')
  const [structuredFloorStart, setStructuredFloorStart] = useState(1)
  const [structuredFloorEnd, setStructuredFloorEnd] = useState(26)
  const [structuredSkipFloors, setStructuredSkipFloors] = useState('')
  const [structuredZoneName, setStructuredZoneName] = useState('A区')
  const [structuredZoneStart, setStructuredZoneStart] = useState(5)
  const [structuredZoneEnd, setStructuredZoneEnd] = useState(26)
  const [scopeDescription, setScopeDescription] = useState('')
  const [scopeDescriptionSummary, setScopeDescriptionSummary] = useState('')
  const [subdivisionFeedback, setSubdivisionFeedback] = useState('')
  const [specialFloorInput, setSpecialFloorInput] = useState('')
  const [specialFloorUsage, setSpecialFloorUsage] = useState('refuge')
  const [specialFloorFeedback, setSpecialFloorFeedback] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const selectedNode = useMemo(() => findNode(nodes, selectedId), [nodes, selectedId])
  const editingStructure = useMemo(() => findNode(nodes, editingStructureId), [nodes, editingStructureId])
  const rootDrop = useDroppable({ id: ROOT_ID })
  const closureDiagnostics = useMemo(() => buildClosureDiagnostics(nodes), [nodes])
  const autoWbsPlanHints = useMemo(() => buildAutoWbsPlanHints(nodes), [nodes])
  const businessReviewChecklist = useMemo(
    () => buildBusinessReviewChecklist(closureDiagnostics, autoWbsPlanHints),
    [autoWbsPlanHints, closureDiagnostics],
  )
  const hasManualWbsPlanHint = autoWbsPlanHints.some((item) => item.support !== 'supported')
  const allStructuresClosed = closureDiagnostics.length > 0 && closureDiagnostics.every((item) => item.status === 'closed')
  const buildingUsageOptions = useMemo(() => (
    getBuildingUsageOptions(draft.businessType, draft.businessSubtype)
  ), [draft.businessSubtype, draft.businessType])
  const independentZoneOptions = useMemo(() => (
    getIndependentZoneOptions(draft.businessType, draft.businessSubtype)
  ), [draft.businessSubtype, draft.businessType])
  const selectedIndependentZoneOption = independentZoneOptions.find((option) => option.value === independentZoneCategory)
    ?? independentZoneOptions[0]
  const allNodes = useMemo(() => flattenNodes(nodes), [nodes])
  const organizationNodes = useMemo(() => allNodes.filter((node) => node.type === 'phase' || node.type === 'section'), [allNodes])
  const phaseOptions = useMemo(() => organizationNodes.filter((node) => node.type === 'phase'), [organizationNodes])
  const organizationMountOptions = useMemo(() => getOrganizationMountOptions(nodes), [nodes])
  const effectiveOrganizationParentPhaseId = organizationParentPhaseId && findNode(nodes, organizationParentPhaseId)
    ? organizationParentPhaseId
    : phaseOptions[0]?.id ?? ''
  const effectiveStructureParentId = structureParentId === AUTO_PARENT_ID
    ? (isProjectWidePhysicalSpaceType(structureType) ? '' : organizationMountOptions.at(-1)?.id ?? '')
    : structureParentId && findNode(nodes, structureParentId)
      ? structureParentId
      : ''
  const physicalSpaceOptions = useMemo(() => allNodes.filter((node) => (
    node.type === 'building' || node.type === 'basement' || (
      node.type === 'physical_zone'
      && (
        node.metadata.physicalSpaceKind === 'outdoor_site'
        || node.metadata.physicalSpaceKind === 'independent_engineering_zone'
        || node.metadata.physicalSpaceKind === 'shared_podium'
      )
    )
  )), [allNodes])
  const aboveGroundSpaces = useMemo(() => physicalSpaceOptions.filter((node) => node.type === 'building'), [physicalSpaceOptions])
  const undergroundSpaces = useMemo(() => physicalSpaceOptions.filter((node) => node.type === 'basement'), [physicalSpaceOptions])
  const outdoorSiteSpaces = useMemo(() => physicalSpaceOptions.filter((node) => (
    node.type === 'physical_zone' && node.metadata.physicalSpaceKind === 'outdoor_site'
  )), [physicalSpaceOptions])
  const independentEngineeringSpaces = useMemo(() => physicalSpaceOptions.filter((node) => (
    node.type === 'physical_zone' && node.metadata.physicalSpaceKind === 'independent_engineering_zone'
  )), [physicalSpaceOptions])
  const sharedPublicSpaces = useMemo(() => physicalSpaceOptions.filter((node) => (
    node.type === 'physical_zone' && node.metadata.physicalSpaceKind === 'shared_podium'
  )), [physicalSpaceOptions])
  const hasOutdoorSiteSpace = outdoorSiteSpaces.length > 0
  const selectedSharedScope = selectedNode && isSharedScopeCandidate(selectedNode) ? selectedNode : null
  const selectedSharedScopeCopy = selectedSharedScope ? getSharedScopeCopy(selectedSharedScope) : null
  const shouldShowContextServicePanel = Boolean(
    selectedSharedScope
    && selectedSharedScopeCopy
    && (
      selectedSharedScope.metadata.sharedScopeCandidate === true
      || modelingStage === 'review'
      || showAdvancedTreeEdit
    ),
  )
  const contextualServiceTargetOptions = useMemo(() => allNodes.filter((node) => (
    isServiceTargetCandidate(node) && node.id !== selectedSharedScope?.id
  )), [allNodes, selectedSharedScope?.id])
  const inlineServiceTargetOptions = useMemo(() => allNodes.filter(isServiceTargetCandidate), [allNodes])
  const shouldShowInlineServiceRange = structureType === 'basement' || structureType === 'outdoor_site'
  const inlineServiceCopy = getInlineServiceCopy(structureType)
  const selectedIndependentZoneSupportHelpId = 'independent-zone-template-support-help'
  const subdivisionTargetOptions = useMemo(() => allNodes.filter((node) => (
    isPrimarySubdivisionTarget(node) && getDecompositionModes(node, findNodePath(nodes, node.id)).length > 0
  )), [allNodes, nodes])
  const decompositionTarget = useMemo(() => (
    selectedNode && DECOMPOSITION_PARENT_TYPES.has(selectedNode.type)
      && getDecompositionModes(selectedNode, findNodePath(nodes, selectedNode.id)).length > 0
      ? selectedNode
      : subdivisionTargetOptions[0] ?? null
  ), [nodes, selectedNode, subdivisionTargetOptions])
  const decompositionTargetPath = useMemo(() => (
    decompositionTarget ? findNodePath(nodes, decompositionTarget.id) : []
  ), [decompositionTarget, nodes])
  const availableDecompositionModes = useMemo(() => (
    decompositionTarget ? getDecompositionModes(decompositionTarget, decompositionTargetPath) : []
  ), [decompositionTarget, decompositionTargetPath])
  const decompositionFloorRows = useMemo(() => (
    decompositionTarget ? collectFloorRows(decompositionTarget) : []
  ), [decompositionTarget])
  const knownLevelCountForSpecialFloors = useMemo(() => (
    decompositionTarget ? readKnownLevelCount(decompositionTarget) : null
  ), [decompositionTarget])
  const specialFloorRows = useMemo(() => (
    decompositionFloorRows.filter((floor) => String(floor.metadata.floorUsage ?? 'standard') !== 'standard')
  ), [decompositionFloorRows])
  const selectedSpecialFloorNames = useMemo(() => parseFloorNameTokens(specialFloorInput), [specialFloorInput])
  const canBatchMarkSpecialFloors = decompositionFloorRows.length > 0 || Boolean(knownLevelCountForSpecialFloors)
  const usesBasementLevelCount = decompositionTarget?.type === 'basement' && decompositionModeInput === 'by_floor'
  const isOutdoorSubdivisionTarget = decompositionTarget?.type === 'physical_zone'
    && decompositionTarget.metadata.physicalSpaceKind === 'outdoor_site'
    && decompositionModeInput === 'by_physical_zone'
  const showLevelInputs = (decompositionModeInput === 'by_floor' || decompositionModeInput === 'tower_podium') && !usesBasementLevelCount
  const canUseTowerPodium = availableDecompositionModes.includes('tower_podium')
  const targetBasementLevelCount = normalizePositiveInteger(decompositionTarget?.metadata.basementLevelCount, 1)
  const childSubdivisionParent = useMemo(() => {
    if (!decompositionTarget) return null
    if (isPrimarySubdivisionTarget(decompositionTarget)) return decompositionTarget
    const path = findNodePath(nodes, decompositionTarget.id)
    return [...path].reverse().find((node) => isPrimarySubdivisionTarget(node)) ?? null
  }, [decompositionTarget, nodes])
  const childSubdivisionTargetOptions = useMemo(() => (
    childSubdivisionParent?.children.filter((child) => {
      if (child.type === 'physical_zone' && child.metadata.structuralRole && child.children.length > 0) return false
      return getDecompositionModes(child, findNodePath(nodes, child.id)).length > 0
    }) ?? []
  ), [childSubdivisionParent, nodes])
  const shouldShowNodeProperties = Boolean(selectedNode && (modelingStage === 'review' || showAdvancedTreeEdit))
  const isEditingStructure = Boolean(editingStructure)

  const clearStructureForm = () => {
    setEditingStructureId(null)
    setStructureEditSaved(false)
    setStructureName('')
    setStructureType('building')
    setStructureFunctionalUsage(buildingUsageOptions[0] ?? '综合楼')
    setIndependentZoneCategory('')
    setStructureBasementLevels(2)
    setStructureParentId(AUTO_PARENT_ID)
    setSelectedServiceTargetIds([])
    setServiceRangeMode('all')
    setInlineServiceSaved(false)
  }

  const loadStructureFormFromNode = (node: ScopeNode) => {
    const nextStructureType = getPhysicalSpaceInputType(node)
    const serviceTargetIds = readStringArray(node.metadata.serviceTargetObjectIds)
    const allTargetIds = inlineServiceTargetOptions.map((target) => target.id)
    const coversAllTargets = allTargetIds.length > 0 && allTargetIds.every((id) => serviceTargetIds.includes(id))
    setSelectedId(node.id)
    setEditingStructureId(node.id)
    setStructureEditSaved(false)
    setStructureName(node.name)
    setStructureType(nextStructureType)
    setStructureParentId(node.parentId ?? '')
    setStructureFunctionalUsage(String(node.metadata.functionalUsage ?? '住宅楼'))
    setStructureBasementLevels(normalizePositiveInteger(node.metadata.basementLevelCount, 2))
    setIndependentZoneCategory(String(node.metadata.physicalCategory ?? independentZoneOptions[0]?.value ?? ''))
    if (nextStructureType === 'basement' || nextStructureType === 'outdoor_site') {
      setServiceRangeMode(serviceTargetIds.length === 0 || coversAllTargets ? 'all' : 'custom')
      setSelectedServiceTargetIds(serviceTargetIds)
      setInlineServiceSaved(Boolean(node.metadata.serviceRangeSavedAt))
    } else {
      setServiceRangeMode('all')
      setSelectedServiceTargetIds([])
      setInlineServiceSaved(false)
    }
  }

  const handleSelectSubdivisionTarget = (node: ScopeNode) => {
    setSelectedId(node.id)
    setDecompositionModeInput(getDefaultDecompositionMode(node, findNodePath(nodes, node.id)))
  }
  const renderSpaceCard = (node: ScopeNode) => {
    const Icon = getWizardScopeIcon(node.type)
    const StatusIcon = isStructureClosed(node) ? ConfiguredIcon : PendingIcon
    const statusIconKey = isStructureClosed(node) ? 'configured' : 'pending'
    const isSelected = selectedId === node.id
    const serviceTargetNames = readStringArray(node.metadata.serviceTargetNames)
    const servedByScopeNames = readStringArray(node.metadata.servedByScopeNames)
    const relationVerb = getScopeRelationVerb(node)
    const specialFloorCount = countSpecialFloors(node)
    return (
      <div
        key={node.id}
        onClick={() => loadStructureFormFromNode(node)}
        className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
          isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <Button unstyled
            type="button"
            onClick={() => loadStructureFormFromNode(node)}
            aria-pressed={isSelected}
            className="min-w-0 flex-1 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-blue-600" data-testid={wizardIconTestId(node.type)} />
              <span className="text-sm font-semibold text-slate-900">{node.name}</span>
            </div>
          </Button>
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-4 w-4 ${isStructureClosed(node) ? 'text-emerald-600' : 'text-amber-500'}`} data-testid={wizardIconTestId(statusIconKey)} />
            <Button unstyled
              type="button"
              aria-label={`删除 ${node.name}`}
              title={`删除 ${node.name}`}
              onClick={(event) => {
                event.stopPropagation()
                handleDelete(node.id)
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-100 text-rose-500 transition-colors hover:border-rose-200 hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 outline-none"
            >
              <DeleteScopeIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('delete_scope')} />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">{summarizeStructureFact(node)}</p>
        <p className={`mt-2 text-xs font-medium ${isStructureClosed(node) ? 'text-emerald-700' : 'text-amber-700'}`}>
          {structureStatusLabel(node)} · {summarizeStructureDecomposition(node)}
        </p>
        {specialFloorCount > 0 ? (
          <p className="mt-2 inline-flex rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
            已标注 {specialFloorCount} 个特殊楼层
          </p>
        ) : null}
        {serviceTargetNames.length > 0 ? (
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2">
            <p className="text-xs font-semibold text-blue-700">{relationVerb}对象</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {serviceTargetNames.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-blue-800 ring-1 ring-blue-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                  {name}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {servedByScopeNames.length > 0 ? (
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2">
            <p className="text-xs font-semibold text-blue-700">公共空间关系</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {servedByScopeNames.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-blue-800 ring-1 ring-blue-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                  {name}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }
  const getBuildingDiagramHeight = (node: ScopeNode) => {
    const levelCount = readPositiveInteger(node.metadata.standardFloorCount)
      ?? collectFloorRows(node).length
      ?? 1
    return Math.min(108, Math.max(46, 34 + levelCount * 2.4))
  }
  const renderDiagramBuilding = (node: ScopeNode) => {
    const Icon = getWizardScopeIcon(node.type)
    const isSelected = selectedId === node.id
    return (
      <Button unstyled
        key={node.id}
        type="button"
        onClick={() => loadStructureFormFromNode(node)}
        aria-pressed={isSelected}
        className={`group flex min-w-[96px] max-w-[132px] flex-1 flex-col items-center justify-end rounded-xl border px-2 pb-2 pt-3 text-center transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
          isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-blue-100 bg-white hover:border-blue-300 hover:bg-blue-50'
        }`}
      >
        <div
          className="flex w-full flex-col justify-between rounded-t-xl border border-blue-200 bg-blue-50 px-2 py-2"
          style={{ minHeight: `${getBuildingDiagramHeight(node)}px` }}
        >
          <Icon className="mx-auto h-4 w-4 text-blue-600" data-testid={wizardIconTestId(node.type)} />
          <span className="mt-2 max-w-full truncate text-xs font-semibold text-slate-900">{node.name}</span>
          <span className="mt-1 text-xs leading-4 text-slate-500">{summarizeStructureDecomposition(node)}</span>
        </div>
        <div className="mt-2 h-1.5 w-10 rounded-full bg-blue-300 group-hover:bg-blue-600" aria-hidden="true" />
      </Button>
    )
  }
  const renderDiagramPill = (node: ScopeNode, tone: SpaceDetailTone, relationLabel?: string) => {
    const style = SPACE_DETAIL_STYLES[tone]
    const Icon = getWizardScopeIcon(node.type)
    const isSelected = selectedId === node.id
    return (
      <Button unstyled
        key={node.id}
        type="button"
        onClick={() => loadStructureFormFromNode(node)}
        aria-pressed={isSelected}
        className={`inline-flex min-w-[140px] flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
          isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white/90 hover:border-blue-200 hover:bg-white'
        }`}
      >
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.frame}`}>
          <Icon className="h-4 w-4 text-blue-600" data-testid={wizardIconTestId(node.type)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-900">{node.name}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {relationLabel ?? summarizeStructureDecomposition(node)}
          </span>
        </span>
      </Button>
    )
  }
  const renderSectionDiagram = () => (
    <div className="surface-card p-3" aria-label="项目空间剖面图">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">现场空间剖面</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">按地上、公共共享、地下和场地关系展示，点击任一空间可回填编辑。</p>
        </div>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500 tabular-nums">
          {physicalSpaceOptions.length} 个空间
        </span>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-3">
        <div className="flex items-end gap-2 overflow-x-auto pb-2" aria-label="剖面图地上单体">
          {aboveGroundSpaces.length > 0 ? (
            aboveGroundSpaces.map(renderDiagramBuilding)
          ) : (
            <div className="min-h-24 flex-1 rounded-xl border border-dashed border-blue-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-400">
              暂无地上单体
            </div>
          )}
        </div>
        <div className="relative my-1">
          <div className="h-px w-full border-t border-dashed border-slate-300" aria-hidden="true" />
          <span className="absolute -top-3 left-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-500">±0.000</span>
        </div>
        <div className="grid gap-2 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(180px,260px)]">
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-blue-800">公共共享层</p>
              <span className="text-xs text-blue-700 tabular-nums">{sharedPublicSpaces.length} 项</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {sharedPublicSpaces.length > 0 ? sharedPublicSpaces.map((node) => (
                renderDiagramPill(node, 'shared', readStringArray(node.metadata.serviceTargetNames).length > 0
                  ? `服务 ${readStringArray(node.metadata.serviceTargetNames).join('、')}`
                  : '公共连通空间')
              )) : (
                <p className="rounded-lg border border-dashed border-blue-200 bg-white/70 px-3 py-2 text-xs text-slate-400">暂无共享裙房</p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-800">独立工程区</p>
              <span className="text-xs text-amber-700 tabular-nums">{independentEngineeringSpaces.length} 项</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {independentEngineeringSpaces.length > 0 ? independentEngineeringSpaces.map((node) => renderDiagramPill(node, 'independent')) : (
                <p className="rounded-lg border border-dashed border-amber-200 bg-white/70 px-3 py-2 text-xs text-slate-400">暂无独立工程区</p>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-indigo-800">地下底板 / 地下空间</p>
            <span className="text-xs text-indigo-700 tabular-nums">{undergroundSpaces.length} 项</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {undergroundSpaces.length > 0 ? undergroundSpaces.map((node) => (
              renderDiagramPill(node, 'underground', `${summarizeStructureDecomposition(node)} · ${readStringArray(node.metadata.serviceTargetNames).length > 0 ? `服务 ${readStringArray(node.metadata.serviceTargetNames).join('、')}` : '服务对象待确认'}`)
            )) : (
              <p className="rounded-lg border border-dashed border-indigo-200 bg-white/70 px-3 py-2 text-xs text-slate-400">暂无地下空间</p>
            )}
          </div>
        </div>
        <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-emerald-800">室外场地范围</p>
            <span className="text-xs text-emerald-700 tabular-nums">{outdoorSiteSpaces.length} 项</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {outdoorSiteSpaces.length > 0 ? outdoorSiteSpaces.map((node) => (
              renderDiagramPill(node, 'outdoor', readStringArray(node.metadata.serviceTargetNames).length > 0
                ? `覆盖 ${readStringArray(node.metadata.serviceTargetNames).join('、')}`
                : '道路、园建、管网等场地范围')
            )) : (
              <p className="rounded-lg border border-dashed border-emerald-200 bg-white/70 px-3 py-2 text-xs text-slate-400">暂无室外总平</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
  const renderSpaceDetailBand = (tone: SpaceDetailTone, ariaLabel: string, spaces: ScopeNode[], emptyText: string) => {
    const style = SPACE_DETAIL_STYLES[tone]
    return (
    <div className={`relative overflow-hidden rounded-xl border p-3 ${style.frame}`} aria-label={ariaLabel}>
      <div className={`absolute inset-y-3 left-3 w-1 rounded-full ${style.rail}`} aria-hidden="true" />
      <div className="ml-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/80 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-800">{style.title}</p>
          </div>
          <p className="mt-1 text-xs leading-4 text-slate-500">{style.hint}</p>
        </div>
        <span className="rounded-lg border border-white bg-white/85 px-2 py-1 text-xs text-slate-500 tabular-nums">{spaces.length} 项</span>
      </div>
      {spaces.length === 0 ? (
        <p className="ml-4 px-1 py-4 text-sm text-slate-400">{emptyText}</p>
      ) : (
        <div className="ml-4 grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          {spaces.map(renderSpaceCard)}
        </div>
      )}
    </div>
    )
  }

  useEffect(() => {
    syncNodeIdCounterFromScopeTree(draftScopeTree)
    setNodes((currentNodes) => (
      serializeScopeNodes(currentNodes) === draftScopeTreeSnapshot ? currentNodes : draftScopeTree
    ))
    setSelectedId((currentSelectedId) => (
      currentSelectedId && findNode(draftScopeTree, currentSelectedId) ? currentSelectedId : null
    ))
    setEditingStructureId((currentEditingId) => (
      currentEditingId && findNode(draftScopeTree, currentEditingId) ? currentEditingId : null
    ))
  }, [draftScopeTree, draftScopeTreeSnapshot])

  useEffect(() => {
    setModelingStage((currentStage) => (currentStage === draftModelingStage ? currentStage : draftModelingStage))
  }, [draftModelingStage])

  useEffect(() => {
    if (structureType === 'building' && !buildingUsageOptions.includes(structureFunctionalUsage)) {
      setStructureFunctionalUsage(buildingUsageOptions[0] ?? '综合楼')
    }
  }, [buildingUsageOptions, structureFunctionalUsage, structureType])

  useEffect(() => {
    if (structureType === 'independent_zone' && independentZoneOptions.length > 0) {
      const nextCategory = independentZoneCategory || independentZoneOptions[0].value
      if (!independentZoneOptions.some((option) => option.value === nextCategory)) {
        setIndependentZoneCategory(independentZoneOptions[0].value)
      }
    }
  }, [independentZoneCategory, independentZoneOptions, structureType])

  useEffect(() => {
    if (!decompositionTarget) return
    if (!availableDecompositionModes.includes(decompositionModeInput)) {
      setDecompositionModeInput(getDefaultDecompositionMode(decompositionTarget, decompositionTargetPath))
    }
  }, [availableDecompositionModes, decompositionModeInput, decompositionTarget, decompositionTargetPath])

  useEffect(() => {
    if (!selectedSharedScope) {
      setContextServiceTargetIds([])
      setContextServiceRangeSaved(false)
      return
    }
    setContextServiceTargetIds(readStringArray(selectedSharedScope.metadata.serviceTargetObjectIds))
    setContextServiceRangeSaved(Boolean(selectedSharedScope.metadata.serviceRangeSavedAt))
  }, [selectedSharedScope?.id, selectedSharedScope?.metadata.serviceRangeSavedAt])

  const updateNodes = useCallback((newNodes: ScopeNode[]) => {
    setNodes(newNodes)
    onUpdate({ scopeTree: newNodes as unknown[] })
  }, [onUpdate])

  const updateModelingStage = useCallback((nextStage: ScopeModelingStage) => {
    setModelingStage(nextStage)
    if (draft.scopeModelingStage !== nextStage) {
      onUpdate({ scopeModelingStage: nextStage })
    }
  }, [draft.scopeModelingStage, onUpdate])

  const handleToggle = (id: string) => {
    updateNodes(updateNode(nodes, id, (node) => ({ ...node, expanded: !node.expanded })))
  }

  const handleAddNode = (parentId: string | null, type: ObjectType) => {
    const node = newNode(type, parentId)
    updateNodes(insertNode(nodes, parentId, node))
    setSelectedId(node.id)
  }

  const handleAddSibling = (id: string) => {
    const node = findNode(nodes, id)
    if (!node) return
    handleAddNode(node.parentId, node.type)
  }

  const handleDelete = (id: string) => {
    const result = removeNode(nodes, id)
    updateNodes(sanitizeScopeRelations(result.nodes))
    if (selectedId === id) setSelectedId(null)
    if (editingStructureId === id) clearStructureForm()
  }

  const handleDuplicate = (id: string) => {
    const node = findNode(nodes, id)
    if (!node || node.type !== 'building') return
    const cloned = cloneNode(node, node.parentId)
    updateNodes(insertNode(nodes, node.parentId, cloned))
    setSelectedId(cloned.id)
  }

  const handleAddOrganization = () => {
    const name = organizationName.trim() || (organizationType === 'phase'
      ? `第 ${nodes.filter((node) => node.type === 'phase').length + 1} 期`
      : `${nodes.filter((node) => node.type === 'section').length + 1}标`)
    const parentId = organizationType === 'section' ? effectiveOrganizationParentPhaseId || null : null
    const metadata = organizationType === 'section'
      ? { organizationScope: 'construction_area_section', ...(parentId ? { phaseObjectId: parentId } : {}) }
      : { organizationScope: 'phase' }
    const node = newNode(organizationType, parentId, name, metadata)
    updateNodes(insertNode(nodes, parentId, node))
    setSelectedId(node.id)
    if (organizationType === 'phase') setOrganizationParentPhaseId(node.id)
    setOrganizationName('')
  }

  const resolveStructureName = (selectedIndependentOption?: IndependentZoneOption): string => (
    structureName.trim() || (
      structureType === 'building' ? `${nodes.filter((node) => node.type === 'building').length + 1}#楼`
      : structureType === 'basement' ? '地下室'
      : structureType === 'outdoor_site' ? '室外总平'
      : selectedIndependentOption?.label ?? '独立工程区'
    )
  )

  const buildStructuredStructureMetadata = (
    parentId: string | null,
    baseMetadata: Record<string, unknown> = {},
  ): Record<string, unknown> => {
    const selectedIndependentOption = independentZoneOptions.find((option) => option.value === independentZoneCategory)
      ?? independentZoneOptions[0]
    const metadata: Record<string, unknown> = {
      ...baseMetadata,
      ...resolveParentScopeMetadata(nodes, parentId),
    }
    if (structureType === 'building') metadata.functionalUsage = structureFunctionalUsage
    if (structureType === 'basement') {
      metadata.basementLevelCount = structureBasementLevels
      metadata.basementKind = 'common_basement'
    }
    if (structureType === 'outdoor_site') {
      metadata.physicalSpaceKind = 'outdoor_site'
      metadata.physicalCategory = 'outdoor_site_plan'
      metadata.physicalCategoryLabel = '室外总平'
    }
    if (structureType === 'independent_zone') {
      metadata.physicalSpaceKind = 'independent_engineering_zone'
      metadata.physicalCategory = selectedIndependentOption?.value ?? 'independent_engineering_zone'
      metadata.physicalCategoryLabel = selectedIndependentOption?.label ?? '独立工程区'
      metadata.templateSupport = selectedIndependentOption?.templateSupport ?? 'manual'
      metadata.templateSupportLabel = getTemplateSupportLabel(selectedIndependentOption?.templateSupport ?? 'manual')
    }
    return metadata
  }

  const getSelectedInlineServiceTargets = () => (
    serviceRangeMode === 'all'
      ? inlineServiceTargetOptions
      : inlineServiceTargetOptions.filter((target) => selectedServiceTargetIds.includes(target.id))
  )

  const handleAddStructuredStructure = () => {
    const selectedIndependentOption = independentZoneOptions.find((option) => option.value === independentZoneCategory)
      ?? independentZoneOptions[0]
    const name = resolveStructureName(selectedIndependentOption)
    if (editingStructure) {
      const parentId = editingStructure.parentId
      let nextNodes = updateNode(nodes, editingStructure.id, (node) => ({
        ...node,
        name,
        metadata: withDefaultCoverageMetadata(
          node.type,
          buildStructuredStructureMetadata(parentId, node.metadata),
        ),
      }))
      if (shouldShowInlineServiceRange) {
        const targets = getSelectedInlineServiceTargets()
        nextNodes = applyServiceTargetsToScope(nextNodes, editingStructure.id, targets, name)
        setInlineServiceSaved(targets.length > 0)
      } else {
        setInlineServiceSaved(false)
      }
      updateNodes(nextNodes)
      setSelectedId(editingStructure.id)
      setStructureEditSaved(true)
      return
    }
    const objectType: ObjectType = structureType === 'outdoor_site' || structureType === 'independent_zone'
      ? 'physical_zone'
      : structureType
    const parentId = effectiveStructureParentId || null
    const metadata = buildStructuredStructureMetadata(parentId)
    const node = newNode(objectType, parentId, name, metadata)
    let nextNodes = insertNode(nodes, parentId, node)
    if (shouldShowInlineServiceRange) {
      const targets = getSelectedInlineServiceTargets()
      nextNodes = applyServiceTargetsToScope(nextNodes, node.id, targets, node.name)
      setInlineServiceSaved(targets.length > 0)
    } else {
      setInlineServiceSaved(false)
    }
    updateNodes(nextNodes)
    setSelectedId(node.id)
    setStructureName('')
    if (shouldShowInlineServiceRange && serviceRangeMode === 'custom') setSelectedServiceTargetIds([])
  }

  const handleApplyScopeDescriptionDraft = () => {
    const result = buildScopeTreeFromDescription(scopeDescription, draft.businessType, draft.businessSubtype)
    if (!result) {
      setScopeDescriptionSummary('暂未识别出项目空间，请按示例补充楼栋、地下室、室外总平或分期标段信息。')
      return
    }
    updateNodes(result.nodes)
    const firstPhysicalSpace = flattenNodes(result.nodes).find((node) => (
      node.type === 'building'
      || node.type === 'basement'
      || (node.type === 'physical_zone' && node.metadata.physicalSpaceKind !== 'horizontal_work_zone')
    ))
    setSelectedId(firstPhysicalSpace?.id ?? null)
    setEditingStructureId(null)
    setScopeDescriptionSummary(result.summary)
    setStructureEditSaved(false)
  }

  const handleSaveContextServiceRange = () => {
    if (!selectedSharedScope) return
    const selectedTargets = contextualServiceTargetOptions.filter((target) => contextServiceTargetIds.includes(target.id))
    const nextNodes = applyServiceTargetsToScope(nodes, selectedSharedScope.id, selectedTargets, selectedSharedScope.name)
    updateNodes(nextNodes)
    setContextServiceRangeSaved(true)
  }

  const handleStructuredDecomposition = () => {
    if (!decompositionTarget) return
    const targetId = decompositionTarget.id
    const targetPath = findNodePath(nodes, targetId)
    const targetUsesUndergroundLevels = isUndergroundLevelTarget(decompositionTarget, targetPath)
    const basementLevelCount = normalizePositiveInteger(decompositionTarget.metadata.basementLevelCount, 1)
    const start = usesBasementLevelCount ? 1 : normalizePositiveInteger(structuredFloorStart, 1)
    const end = usesBasementLevelCount ? basementLevelCount : Math.max(start, normalizePositiveInteger(structuredFloorEnd, start))
    const zoneStart = normalizePositiveInteger(structuredZoneStart, start)
    const zoneEnd = Math.max(zoneStart, normalizePositiveInteger(structuredZoneEnd, zoneStart))
    const skippedInputSet = parseSkippedFloors(structuredSkipFloors, start, end)
    let children: ScopeNode[] = []
    let metadata: Record<string, unknown> = {}
    if (decompositionModeInput === 'by_floor') {
      children = floorRangeForTarget(decompositionTarget, start, end, targetPath)
        .filter((floor) => !skippedInputSet.has(Math.abs(floor.order)))
        .map((floor) => createFloor(targetId, floor.name, floor.order))
      metadata = {
        ...applyChildCompletenessMetadata(decompositionTarget, 'floor', decompositionTarget.metadata),
        ...(!targetUsesUndergroundLevels ? { standardFloorCount: children.length } : {}),
      }
    } else if (decompositionModeInput === 'by_physical_zone') {
      const zone = createPhysicalZone(
        structuredZoneName.trim() || (isOutdoorSubdivisionTarget ? 'A区' : '施工分区'),
        {
          physicalSpaceKind: 'horizontal_work_zone',
          physicalCategory: isOutdoorSubdivisionTarget
            ? 'outdoor_physical_zone'
            : targetUsesUndergroundLevels ? 'basement_work_zone' : 'construction_work_zone',
          physicalCategoryLabel: isOutdoorSubdivisionTarget
            ? '室外水平分区'
            : targetUsesUndergroundLevels ? '地下室水平分区' : '水平施工分区',
          childrenComplete: true,
        },
      )
      children = [...decompositionTarget.children, reparentNode(zone, targetId)]
      metadata = applyChildCompletenessMetadata(decompositionTarget, 'physical_zone', decompositionTarget.metadata)
    } else {
      const tower = createPhysicalZoneWithFloors('塔楼区', floorRange(zoneStart, zoneEnd), {
        structuralRole: 'tower',
        functionalUsage: structureFunctionalUsage,
      })
      const podiumEnd = Math.max(1, zoneStart - 1)
      const podium = createPhysicalZoneWithFloors('共享裙房', floorRange(1, podiumEnd), {
        physicalSpaceKind: 'shared_podium',
        physicalCategory: 'shared_podium',
        physicalCategoryLabel: '共享裙房',
        structuralRole: 'podium',
        functionalUsage: '商业',
        sharedScopeCandidate: true,
      })
      metadata = applyChildCompletenessMetadata(decompositionTarget, 'physical_zone', decompositionTarget.metadata)
      let nextNodes = updateNode(nodes, targetId, (node) => ({
        ...node,
        metadata,
        children: [reparentNode(tower, targetId)],
        expanded: true,
      }))
      nextNodes = insertNode(nextNodes, decompositionTarget.parentId ?? null, podium)
      const insertedPodium = findNode(nextNodes, podium.id)
      const nextTarget = findNode(nextNodes, targetId)
      if (insertedPodium && nextTarget) {
        nextNodes = applyServiceTargetsToScope(nextNodes, insertedPodium.id, [nextTarget], insertedPodium.name)
      }
      updateNodes(nextNodes)
      setSubdivisionFeedback('已生成塔楼区，并将共享裙房作为公共物理空间展示在范围树中。')
      return
    }
    updateNodes(updateNode(nodes, targetId, (node) => ({
      ...node,
      metadata,
      children,
      expanded: true,
    })))
    setSubdivisionFeedback(decompositionModeInput === 'by_physical_zone'
      ? '已生成水平分区。'
      : usesBasementLevelCount ? '已按地下室层数生成地下层。' : '已生成楼层。')
  }

  const handleMarkSpecialFloors = () => {
    if (!decompositionTarget) return
    const floorNames = parseFloorNameTokens(specialFloorInput)
    if (floorNames.size === 0) {
      setSpecialFloorFeedback('请输入要标注的楼层，如 L1,L13。')
      return
    }
    const existingFloors = collectFloorRows(decompositionTarget)
    const targetPath = findNodePath(nodes, decompositionTarget.id)
    const floorsForMatching = existingFloors.length > 0
      ? existingFloors
      : buildDefaultFloorRowsForTarget(decompositionTarget, targetPath)
    const matchedFloors = floorsForMatching.filter((floor) => floorNames.has(normalizeFloorNameToken(floor.name)))
    if (matchedFloors.length === 0) {
      setSpecialFloorFeedback('未在当前空间中找到这些楼层，请确认楼层名称。')
      return
    }
    let nextNodes = nodes
    if (existingFloors.length === 0 && floorsForMatching.length > 0) {
      nextNodes = updateNode(nodes, decompositionTarget.id, (node) => ({
        ...node,
        metadata: applyChildCompletenessMetadata(node, 'floor', node.metadata),
        children: floorsForMatching,
        expanded: true,
      }))
    }
    updateNodes(markFloorUsageByName(nextNodes, decompositionTarget.id, floorNames, specialFloorUsage))
    setSpecialFloorFeedback(existingFloors.length === 0
      ? `已自动展开 ${floorsForMatching.length} 层，并标注 ${matchedFloors.length} 个特殊楼层。`
      : `已标注 ${matchedFloors.length} 个楼层。`)
  }

  const toggleSpecialFloorToken = (floorName: string) => {
    const floorNames = parseFloorNameTokens(specialFloorInput)
    const normalizedFloorName = normalizeFloorNameToken(floorName)
    if (floorNames.has(normalizedFloorName)) {
      floorNames.delete(normalizedFloorName)
    } else {
      floorNames.add(normalizedFloorName)
    }
    setSpecialFloorInput(joinFloorNameTokens(floorNames))
    setSpecialFloorFeedback('')
  }

  const handleFloorBatch = () => {
    if (!selectedNode || !['building', 'physical_zone'].includes(selectedNode.type)) return
    const skipSet = parseSkippedFloors(skipFloors, floorStart, floorEnd)
    const floors: ScopeNode[] = []
    for (let i = floorStart; i <= floorEnd; i += 1) {
      if (skipSet.has(i)) continue
      floors.push(createFloor(selectedNode.id, floorTemplate.replace('{n}', String(i)), i))
    }
    updateNodes(updateNode(nodes, selectedNode.id, (node) => ({
      ...node,
      metadata: applyChildCompletenessMetadata(node, 'floor', node.metadata),
      children: [...node.children, ...floors],
      expanded: true,
    })))
    setShowFloorBatch(false)
  }

  const handleMetadataUpdate = (id: string, updates: Record<string, unknown>) => {
    updateNodes(updateNode(nodes, id, (node) => {
      const metadata = withDefaultCoverageMetadata(node.type, { ...node.metadata, ...updates })
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') delete metadata[key]
      }
      return { ...node, metadata }
    }))
  }

  const handleRename = (id: string, name: string) => {
    updateNodes(updateNode(nodes, id, (node) => ({ ...node, name })))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!showAdvancedTreeEdit) return
    setDropTargetId(null)
    const activeId = String(event.active.id)
    const overId = event.over?.id ? String(event.over.id) : null
    if (!overId || activeId === overId) return
    const dragged = findNode(nodes, activeId)
    const parent = overId === ROOT_ID ? null : findNode(nodes, overId)
    if (!dragged || !canDropOn(parent, dragged)) return
    const result = removeNode(nodes, activeId)
    if (!result.removed) return
    updateNodes(sanitizeScopeRelations(insertNode(result.nodes, parent?.id ?? null, result.removed)))
  }

  const activeStageIndex = Math.max(0, SCOPE_MODELING_STEPS.findIndex((step) => step.key === modelingStage))
  const goToPreviousModelingStage = () => {
    updateModelingStage(SCOPE_MODELING_STEPS[Math.max(0, activeStageIndex - 1)].key)
  }
  const goToNextModelingStage = () => {
    updateModelingStage(SCOPE_MODELING_STEPS[Math.min(SCOPE_MODELING_STEPS.length - 1, activeStageIndex + 1)].key)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">工程范围与体量</h2>
      </div>
      <p className="text-sm text-slate-500">
        先用一句话生成空间草稿，再核对地上、地下和场地空间。楼栋层数、地下室层数是生成 WBS 的必要信息；地下层展开、水平分区和特殊楼层主要服务后续排程和差异化模板。
      </p>

      <nav aria-label="范围体量建模步骤" className="grid gap-3 md:grid-cols-3">
        {SCOPE_MODELING_STEPS.map((step, index) => {
          const isActive = step.key === modelingStage
          const isDone = index < activeStageIndex
          return (
            <Button unstyled
              key={step.key}
              type="button"
              onClick={() => updateModelingStage(step.key)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
                isActive ? 'border-blue-500 bg-blue-50 shadow-[var(--el-1)]'
                  : isDone ? 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-300'
                  : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              <div className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                  isActive ? 'bg-blue-600 text-white'
                    : isDone ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {index + 1}
                </span>
                <span className="text-sm font-semibold text-slate-900">{step.label}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{step.hint}</p>
            </Button>
          )
        })}
      </nav>

      <section aria-label="项目空间操作区" className="space-y-4" hidden={modelingStage !== 'spaces'}>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">项目空间</h3>
              <p className="mt-1 text-xs text-slate-500">默认直接录入物理空间；只有项目确实分期、分标段或分施工区时，再打开分期/标段设置。</p>
            </div>
            <Button unstyled
              type="button"
              onClick={() => setShowOrganizationPanel((value) => !value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
            >
              分期/标段设置
            </Button>
          </div>
          {showOrganizationPanel ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">分期/标段</h4>
                  <p className="mt-1 text-xs text-slate-500">只表达现场施工区域组织，如一期、二期、A标、B标。</p>
                </div>
                <Button unstyled
                  type="button"
                  onClick={handleAddOrganization}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
                >
                  <AddScopeIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('add_scope')} />
                  添加组织
                </Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">组织名称</span>
                  <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)}
                    className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500" placeholder="如 一期 / A标" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">组织类型</span>
                  <select value={organizationType} onChange={(event) => setOrganizationType(event.target.value as 'phase' | 'section')}
                    className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <option value="phase">分期</option>
                    <option value="section">施工区域标段</option>
                  </select>
                </label>
                {organizationType === 'section' ? (
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">所属分期</span>
                    <select
                      value={effectiveOrganizationParentPhaseId}
                      onChange={(event) => setOrganizationParentPhaseId(event.target.value)}
                      className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <option value="">项目整体（无分期）</option>
                      {phaseOptions.map((node) => (
                        <option key={node.id} value={node.id}>{node.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-500">
                    分期作为一级组织；标段可挂在分期下。
                  </div>
                )}
                <div className="min-w-[150px] rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-500">
                  已录入 <span className="font-medium text-slate-900 tabular-nums">{organizationNodes.length}</span> 个组织节点
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">推荐路径</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">从描述生成空间草稿</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                适合先用一句话说明分期、标段、楼栋、共享裙房、地下室和室外总平。系统会生成可编辑草稿，后续只改识别不准的地方。
              </p>
            </div>
            <Button unstyled
              type="button"
              onClick={handleApplyScopeDescriptionDraft}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
            >
              <RecommendationIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('recommendation_draft')} />
              从描述生成空间草稿
            </Button>
          </div>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-slate-600">项目范围描述</span>
            <textarea
              value={scopeDescription}
              onChange={(event) => setScopeDescription(event.target.value)}
              className="mt-1 min-h-[88px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              placeholder="如：一期A标：1#-3#住宅楼26层，4层共享商业裙房，B2地下室，室外总平；二期B标：4#楼18层。"
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            生成的是可编辑草稿，会替换当前空间草稿；未识别的独立工程区或特殊空间可继续在“项目有什么”里补充。
          </p>
          {scopeDescriptionSummary ? (
            <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium leading-5 text-blue-700">
              {scopeDescriptionSummary}
            </p>
          ) : null}
        </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{isEditingStructure ? '编辑当前空间' : '项目有什么'}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {isEditingStructure
                ? '正在修改关系图中选中的空间。类型和挂载位置已锁定，避免影响已有楼层和分区。'
                : '用于修正草稿或补充漏项：单体建筑、地下空间、室外总平、独立工程区。室外道路/园建/管网属于室外总平后续细分，不是顶层类型。'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {structureEditSaved ? (
              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                修改已保存
              </span>
            ) : null}
            {isEditingStructure ? (
              <Button unstyled
                type="button"
                onClick={clearStructureForm}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
              >
                新增空间
              </Button>
            ) : null}
            <Button unstyled
              type="button"
              onClick={handleAddStructuredStructure}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
            >
              <AddScopeIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('add_scope')} />
              {isEditingStructure ? '保存修改' : '添加项目空间'}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="block">
              <span className="text-xs font-medium text-slate-600">空间名称</span>
            <input value={structureName} onChange={(event) => {
                setStructureName(event.target.value)
                setStructureEditSaved(false)
              }}
              className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500" placeholder="如 1#楼" />
          </label>
          <label className="block">
              <span className="text-xs font-medium text-slate-600">物理空间类型</span>
            <select
              value={structureType}
              disabled={isEditingStructure}
              onChange={(event) => {
                setStructureType(event.target.value as PhysicalSpaceInputType)
                setStructureEditSaved(false)
              }}
              className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <option value="building">{PHYSICAL_SPACE_TYPE_LABELS.building}</option>
              <option value="basement">{PHYSICAL_SPACE_TYPE_LABELS.basement}</option>
              <option value="outdoor_site">{PHYSICAL_SPACE_TYPE_LABELS.outdoor_site}</option>
              <option value="independent_zone">{PHYSICAL_SPACE_TYPE_LABELS.independent_zone}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">挂载位置</span>
            <select
              value={effectiveStructureParentId}
              disabled={isEditingStructure}
              onChange={(event) => {
                setStructureParentId(event.target.value)
                setStructureEditSaved(false)
              }}
              className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <option value="">项目整体</option>
              {organizationMountOptions.map((node) => (
                <option key={node.id} value={node.id}>{formatNodePath(nodes, node.id)}</option>
              ))}
            </select>
          </label>
          {structureType === 'building' ? (
            <label className="block">
              <span className="text-xs font-medium text-slate-600">功能用途</span>
              <select value={structureFunctionalUsage} onChange={(event) => {
                  setStructureFunctionalUsage(event.target.value)
                  setStructureEditSaved(false)
                }}
                className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                {buildingUsageOptions.map((usage) => (
                  <option key={usage} value={usage}>{usage}</option>
                ))}
              </select>
            </label>
          ) : structureType === 'basement' ? (
            <label className="block">
              <span className="text-xs font-medium text-slate-600">地下层数</span>
              <input type="number" value={structureBasementLevels} onChange={(event) => {
                  setStructureBasementLevels(Number(event.target.value) || 1)
                  setStructureEditSaved(false)
                }}
                className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
            </label>
          ) : structureType === 'outdoor_site' ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              室外总平作为整体空间录入；道路、园建、管网等在空间细分中拆。
            </div>
          ) : (
            <div className="block">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">独立工程区类型</span>
                <select
                  value={independentZoneCategory || (independentZoneOptions[0]?.value ?? '')}
                  onChange={(event) => {
                    setIndependentZoneCategory(event.target.value)
                    setStructureEditSaved(false)
                  }}
                  aria-describedby={selectedIndependentZoneOption ? selectedIndependentZoneSupportHelpId : undefined}
                  className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  {independentZoneOptions.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label} · {getTemplateSupportLabel(type.templateSupport)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedIndependentZoneOption ? (
                <p id={selectedIndependentZoneSupportHelpId} className="mt-1 text-xs leading-5 text-slate-500">
                  {getTemplateSupportHelp(selectedIndependentZoneOption.templateSupport)}
                </p>
              ) : null}
              <p className="mt-1 text-xs leading-5 text-slate-500">
                独立工程区按场地设施或独立构筑物录入，不作为楼栋单体统计。
              </p>
            </div>
          )}
          <div className="min-w-[120px] rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            已录入 <span className="font-medium text-slate-900 tabular-nums">{physicalSpaceOptions.length}</span> 个物理空间
          </div>
        </div>
        {shouldShowInlineServiceRange ? (
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <fieldset aria-label={inlineServiceCopy.panelLabel}>
              <legend className="text-xs font-semibold text-blue-800">{inlineServiceCopy.panelLabel}</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-slate-700">
                  <input
                    type="radio"
                    name="inline-service-range-mode"
                    checked={serviceRangeMode === 'all'}
                    onChange={() => {
                      setServiceRangeMode('all')
                      setSelectedServiceTargetIds([])
                      setInlineServiceSaved(false)
                      setStructureEditSaved(false)
                    }}
                    className="border-slate-300"
                  />
                  {inlineServiceCopy.allLabel}
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-slate-700">
                  <input
                    type="radio"
                    name="inline-service-range-mode"
                    checked={serviceRangeMode === 'custom'}
                    onChange={() => {
                      setServiceRangeMode('custom')
                      setInlineServiceSaved(false)
                      setStructureEditSaved(false)
                    }}
                    className="border-slate-300"
                  />
                  {inlineServiceCopy.customLabel}
                </label>
              </div>
              {serviceRangeMode === 'custom' ? (
                <fieldset aria-label={inlineServiceCopy.customFieldsetLabel} className="mt-3">
                  <legend className="text-xs font-medium text-slate-600">{inlineServiceCopy.customFieldsetLabel}</legend>
                  {inlineServiceTargetOptions.length === 0 ? (
                    <p className="mt-1 rounded-lg bg-white px-3 py-2 text-xs text-slate-500">
                      {inlineServiceCopy.emptyLabel}
                    </p>
                  ) : (
                    <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {inlineServiceTargetOptions.map((target) => (
                        <label key={target.id} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedServiceTargetIds.includes(target.id)}
                            onChange={(event) => {
                              setSelectedServiceTargetIds((current) => (
                                event.target.checked
                                  ? Array.from(new Set([...current, target.id]))
                                  : current.filter((id) => id !== target.id)
                              ))
                              setInlineServiceSaved(false)
                              setStructureEditSaved(false)
                            }}
                            className="rounded border-slate-300"
                          />
                          <span className="min-w-0 flex-1 truncate">{target.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              ) : null}
            </fieldset>
            {inlineServiceSaved ? (
              <p className="mt-2 text-xs font-medium text-blue-700">{inlineServiceCopy.savedLabel}</p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-700">项目空间关系图</p>
            <span className="text-xs text-slate-500 tabular-nums">{nodes.length} 项</span>
          </div>
          {physicalSpaceOptions.length === 0 ? (
            <div className="px-3 py-4 text-sm text-slate-400">
              <p className="font-medium text-slate-500">待添加项目空间</p>
              <p className="mt-1 text-xs">暂无项目空间</p>
            </div>
          ) : (
            <>
            <div className="space-y-4 p-3" aria-label="项目空间关系图">
              {renderSectionDiagram()}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3" aria-label="项目空间明细">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">空间明细</p>
                    <p className="mt-1 text-xs text-slate-500">用于逐项编辑、删除或检查必要信息。</p>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">{physicalSpaceOptions.length} 项</span>
                </div>
                <div className="space-y-3">
                  {renderSpaceDetailBand('above', '地上单体空间带', aboveGroundSpaces, '暂无地上单体')}
                  {renderSpaceDetailBand('shared', '公共共享空间空间带', sharedPublicSpaces, '暂无公共共享空间')}
                  {renderSpaceDetailBand('underground', '地下空间空间带', undergroundSpaces, '暂无地下空间')}
                  {renderSpaceDetailBand('outdoor', '室外总平空间带', outdoorSiteSpaces, '暂无室外总平')}
                  {renderSpaceDetailBand('independent', '独立工程区空间带', independentEngineeringSpaces, '暂无独立工程区')}
                </div>
              </div>
            </div>
            <table className="hidden w-full text-left text-xs" aria-label="已添加项目空间清单">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">名称</th>
                  <th className="px-3 py-2 font-medium">类型</th>
                  <th className="px-3 py-2 font-medium">结构事实</th>
                  <th className="px-3 py-2 font-medium">基础信息</th>
                </tr>
              </thead>
              <tbody>
                {physicalSpaceOptions.map((node) => (
                  <tr key={node.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{node.name}</td>
                    <td className="px-3 py-2 text-slate-600">{TYPE_LABELS[node.type]}</td>
                    <td className="px-3 py-2 text-slate-600">{summarizeStructureFact(node)}</td>
                    <td className="px-3 py-2 text-slate-600">{summarizeStructureDecomposition(node)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          {!hasOutdoorSiteSpace ? (
            <p className="mr-auto max-w-xl rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
              如本次计划覆盖总包或全项目，请确认是否还需要录入室外总平；道路、管网、园建等后续都挂在这里。
            </p>
          ) : null}
          <Button unstyled
            type="button"
            onClick={goToNextModelingStage}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
          >
            下一步：细化空间
          </Button>
        </div>
      </div>
      </section>

      <section aria-label="空间细分操作区" className="rounded-xl border border-slate-200 bg-white p-4" hidden={modelingStage !== 'subdivision'}>
        <h3 className="text-sm font-semibold text-slate-900">细化空间</h3>
        <p className="mt-1 text-xs text-slate-500">楼栋已有层数、地下室已有层数时，已经可以生成 WBS；这里用于补特殊楼层、地下层明细或水平施工分区。</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
            <p className="text-xs font-semibold text-emerald-800">WBS 必要信息</p>
            <p className="mt-1 text-xs leading-5 text-emerald-700">单体用途和层数、地下室层数、室外总平是否纳入本次范围。</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
            <p className="text-xs font-semibold text-blue-800">排程细化信息</p>
            <p className="mt-1 text-xs leading-5 text-blue-700">地下层展开、地下室/室外 A/B 区，主要影响流水段和后续排程颗粒度。</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-700">特殊楼层</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">需要避难层、架空层、设备层等差异化模板时，再展开楼层并标注。</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-700">选择要配置的空间</p>
            <span className="text-xs text-slate-500 tabular-nums">{subdivisionTargetOptions.length} 项</span>
          </div>
          {subdivisionTargetOptions.length === 0 ? (
            <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-400">
              暂无需要细分的空间。请先在项目空间中添加单体、地下空间或室外总平。
            </p>
          ) : (
            <div aria-label="可细分主空间" className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {subdivisionTargetOptions.map((node) => {
                const Icon = getWizardScopeIcon(node.type)
                const isActiveTarget = decompositionTarget?.id === node.id
                return (
                  <Button unstyled
                    key={node.id}
                    type="button"
                    aria-label={`配置 ${formatNodePath(nodes, node.id)}`}
                    aria-pressed={isActiveTarget}
                    onClick={() => handleSelectSubdivisionTarget(node)}
                    className={`rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
                      isActiveTarget
                        ? 'border-blue-500 bg-white shadow-[var(--el-1)] ring-1 ring-blue-200'
                        : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-blue-600" data-testid={wizardIconTestId(node.type)} />
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{formatNodePath(nodes, node.id)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{summarizeStructureFact(node)}</p>
                    <p className={`mt-1 text-xs font-medium ${isStructureClosed(node) ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {structureStatusLabel(node)} · {summarizeStructureDecomposition(node)}
                    </p>
                  </Button>
                )
              })}
            </div>
          )}
          {childSubdivisionTargetOptions.length > 0 ? (
            <div className="mt-4 rounded-lg border border-blue-100 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-blue-800">当前空间下级可继续划分</p>
                  <p className="mt-1 text-xs text-slate-500">
                    下级对象只作为当前空间内部继续细分的入口，不作为新的项目空间。
                  </p>
                </div>
                <span className="text-xs text-blue-700 tabular-nums">{childSubdivisionTargetOptions.length} 项</span>
              </div>
              <div aria-label="当前空间下级可继续划分" className="mt-3 flex flex-wrap gap-2">
                {childSubdivisionTargetOptions.map((child) => {
                  const Icon = getWizardScopeIcon(child.type)
                  const isActiveTarget = decompositionTarget?.id === child.id
                  return (
                    <Button unstyled
                      key={child.id}
                      type="button"
                      aria-pressed={isActiveTarget}
                      onClick={() => handleSelectSubdivisionTarget(child)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
                        isActiveTarget
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" data-testid={wizardIconTestId(child.type)} />
                      继续划分 {child.name}
                    </Button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">当前配置</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {decompositionTarget ? `当前配置：${formatNodePath(nodes, decompositionTarget.id)}` : '当前配置：未选择空间'}
              </p>
            </div>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
              {decompositionTarget ? summarizeStructureDecomposition(decompositionTarget) : '未选择'}
            </span>
          </div>
          {!decompositionTarget ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-400">
              请先点击上方空间卡片，再配置特殊楼层、地下层明细或水平分区。
            </div>
          ) : (
            <div className={`mt-3 grid grid-cols-1 gap-3 ${showLevelInputs ? 'lg:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto]' : 'lg:grid-cols-[1fr_1fr_auto]'}`}>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">细分方式</span>
                <select value={decompositionModeInput} onChange={(event) => setDecompositionModeInput(event.target.value as typeof decompositionModeInput)}
                  className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  {availableDecompositionModes.includes('by_floor') ? (
                    <option value="by_floor">
                      {isUndergroundLevelTarget(decompositionTarget, decompositionTargetPath) ? '地下层' : '楼层'}
                    </option>
                  ) : null}
                  {availableDecompositionModes.includes('by_physical_zone') ? (
                    <option value="by_physical_zone">水平施工分区</option>
                  ) : null}
                  {canUseTowerPodium ? <option value="tower_podium">塔楼+裙房组合</option> : null}
                </select>
              </label>
              {showLevelInputs ? (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">起始层</span>
                    <input type="number" value={decompositionModeInput === 'by_floor' ? structuredFloorStart : structuredZoneStart}
                      onChange={(event) => decompositionModeInput === 'by_floor' ? setStructuredFloorStart(Number(event.target.value) || 1) : setStructuredZoneStart(Number(event.target.value) || 1)}
                      className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">结束层</span>
                    <input type="number" value={decompositionModeInput === 'by_floor' ? structuredFloorEnd : structuredZoneEnd}
                      onChange={(event) => decompositionModeInput === 'by_floor' ? setStructuredFloorEnd(Number(event.target.value) || 1) : setStructuredZoneEnd(Number(event.target.value) || 1)}
                      className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">跳过层</span>
                    <input value={structuredSkipFloors} disabled={decompositionModeInput !== 'by_floor'} onChange={(event) => setStructuredSkipFloors(event.target.value)}
                      className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-blue-500" placeholder="如 13" />
                  </label>
                </>
              ) : usesBasementLevelCount ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                  按已录入的 {targetBasementLevelCount} 层地下室生成 B1-B{targetBasementLevelCount}，不需要重复填写层数。
                </div>
              ) : (
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">分区名称</span>
                  <input value={structuredZoneName} onChange={(event) => setStructuredZoneName(event.target.value)}
                    className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                </label>
              )}
              <Button unstyled type="button" onClick={handleStructuredDecomposition}
                className="mt-5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
                {usesBasementLevelCount ? '生成地下层' : decompositionModeInput === 'by_physical_zone' ? '生成分区' : '生成楼层'}
              </Button>
            </div>
          )}
        </div>
        {decompositionModeInput === 'by_physical_zone' && showLevelInputs ? (
          <label className="mt-3 block max-w-xs">
            <span className="text-xs font-medium text-slate-600">分区名称</span>
            <input value={structuredZoneName} onChange={(event) => setStructuredZoneName(event.target.value)}
              className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
          </label>
        ) : null}
        {decompositionModeInput === 'tower_podium' ? (
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
            塔楼起始层会自动作为共享裙房结束层的下一层；共享裙房会作为公共物理空间展示在范围树中。
          </div>
        ) : null}
        {subdivisionFeedback ? (
          <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium leading-5 text-blue-700">
            {subdivisionFeedback}
          </p>
        ) : null}
        <div className="mt-4 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-700">当前空间细化结果</p>
            <span className="text-xs text-slate-500 tabular-nums">{decompositionTarget ? summarizeStructureDecomposition(decompositionTarget) : '未选择'}</span>
          </div>
          {!decompositionTarget ? (
            <div className="px-3 py-4 text-sm text-slate-400">请选择一个物理空间。</div>
          ) : decompositionTarget.children.length === 0 ? (
            <div className="px-3 py-4 text-sm text-slate-400">尚未细分，可按楼层、地下层或水平施工分区生成。</div>
          ) : (
            <table className="w-full text-left text-xs" aria-label="空间细分结果清单">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">名称</th>
                  <th className="px-3 py-2 font-medium">类型</th>
                  <th className="px-3 py-2 font-medium">范围</th>
                </tr>
              </thead>
              <tbody>
                {decompositionTarget.children.map((child) => (
                  <tr key={child.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{child.name}</td>
                    <td className="px-3 py-2 text-slate-600">{TYPE_LABELS[child.type]}</td>
                    <td className="px-3 py-2 text-slate-600">{summarizeStructureDecomposition(child)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canBatchMarkSpecialFloors ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">特殊楼层</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  默认都是标准层；输入或点选楼层后选择性质。若当前只录了层数、还没展开楼层，系统会自动展开并标注。
                </p>
              </div>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                {specialFloorRows.length} 个已标注
              </span>
            </div>
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-blue-800">楼层性质</p>
                  <p className="mt-1 text-xs leading-5 text-blue-700">先选楼层，再选择性质并标注；默认未标注楼层都按标准层处理。</p>
                </div>
                {selectedSpecialFloorNames.size > 0 ? (
                  <span className="rounded-lg border border-blue-100 bg-white px-2 py-1 text-xs font-medium text-blue-700 tabular-nums">
                    已选择 {selectedSpecialFloorNames.size} 层 · 将标注为 {FLOOR_USAGE_LABELS[specialFloorUsage]}
                  </span>
                ) : (
                  <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
                    先选楼层
                  </span>
                )}
              </div>
              <div aria-label="楼层性质快捷选择" className="mt-3 flex flex-wrap gap-2">
                {Object.entries(FLOOR_USAGE_LABELS).map(([value, label]) => (
                  <Button unstyled
                    key={value}
                    type="button"
                    aria-pressed={specialFloorUsage === value}
                    onClick={() => setSpecialFloorUsage(value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
                      specialFloorUsage === value
                        ? 'border-blue-500 bg-blue-600 text-white shadow-[var(--el-1)]'
                        : 'border-blue-100 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">要标注的楼层</span>
                <input
                  value={specialFloorInput}
                  onChange={(event) => setSpecialFloorInput(event.target.value)}
                  className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  placeholder="如 L1,L13 或 B1,B2"
                />
              </label>
              <Button unstyled
                type="button"
                onClick={handleMarkSpecialFloors}
                className="mt-5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
              >
                标注为{FLOOR_USAGE_LABELS[specialFloorUsage]}
              </Button>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-700">可标注楼层</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 tabular-nums">{decompositionFloorRows.length} 层</span>
                </div>
              </div>
              {decompositionFloorRows.length === 0 && knownLevelCountForSpecialFloors ? (
                <p className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs leading-5 text-blue-700">
                  当前空间已记录 {knownLevelCountForSpecialFloors} 层，但尚未展开楼层。输入 L1、L13 或 B1 后标注，系统会自动生成楼层记录。
                </p>
              ) : null}
              <div aria-label="可标注楼层" className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                {decompositionFloorRows.map((floor) => {
                  const normalizedName = normalizeFloorNameToken(floor.name)
                  const isSelectedFloor = selectedSpecialFloorNames.has(normalizedName)
                  const floorUsageLabel = getFloorUsageLabel(floor)
                  return (
                    <Button unstyled
                      key={floor.id}
                      type="button"
                      onClick={() => toggleSpecialFloorToken(floor.name)}
                      aria-pressed={isSelectedFloor}
                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
                        isSelectedFloor
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : floorUsageLabel
                            ? 'border-blue-200 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-50'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      <span>{floor.name}</span>
                      {floorUsageLabel ? (
                        <span className={`rounded px-1 py-0.5 text-xs ${isSelectedFloor ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'}`}>
                          {floorUsageLabel}
                        </span>
                      ) : null}
                    </Button>
                  )
                })}
              </div>
            </div>
            {specialFloorFeedback ? (
              <p className="mt-2 text-xs font-medium text-blue-700">{specialFloorFeedback}</p>
            ) : null}
            {specialFloorRows.length > 0 ? (
              <table className="mt-3 w-full text-left text-xs" aria-label="已标注特殊楼层">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">楼层</th>
                    <th className="px-3 py-2 font-medium">楼层性质</th>
                  </tr>
                </thead>
                <tbody>
                  {specialFloorRows.map((floor) => (
                    <tr key={floor.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900">{floor.name}</td>
                      <td className="px-3 py-2 text-slate-600">{FLOOR_USAGE_LABELS[String(floor.metadata.floorUsage)] ?? String(floor.metadata.floorUsage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-between gap-3">
          <Button unstyled
            type="button"
            onClick={goToPreviousModelingStage}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
          >
            返回项目空间
          </Button>
          <Button unstyled
            type="button"
            onClick={goToNextModelingStage}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
          >
            下一步：确认范围
          </Button>
        </div>
      </section>

      <section aria-label="确认范围操作区" className="rounded-xl border border-slate-200 bg-white p-4" hidden={modelingStage !== 'review'}>
        <h3 className="text-sm font-semibold text-slate-900">确认范围</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          确认分期、施工区域标段、物理空间和细化层级是否符合现场实际。特殊楼层、地下室面积、人防等局部事实可在下方范围树节点属性中维护。
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">组织节点</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">{organizationNodes.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">物理空间</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">{physicalSpaceOptions.length}</p>
          </div>
          <div className={`rounded-lg border px-3 py-2 ${allStructuresClosed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <p className={`text-xs ${allStructuresClosed ? 'text-emerald-700' : 'text-amber-700'}`}>生成 WBS 必要信息</p>
            <p className={`mt-1 text-sm font-semibold ${allStructuresClosed ? 'text-emerald-700' : 'text-amber-700'}`}>
              {allStructuresClosed ? '已具备' : '仍需补充'}
            </p>
          </div>
        </div>
        {!allStructuresClosed ? (
          <div
            data-testid="scope-readiness-blocked"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
          >
            <p className="text-sm font-semibold text-amber-800">仍有 WBS 必要信息待补充，暂不能生成 WBS</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {closureDiagnostics.filter((item) => item.status === 'open').map((item) => (
                <span key={item.id} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs text-amber-700">
                  {item.name} · {item.issue}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-sm font-semibold text-emerald-700">生成 WBS 的必要信息已具备，可以进入 WBS 生成。</p>
          </div>
        )}
        <section aria-label="生成前业务核对" className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">生成前业务核对</h4>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                先看哪些范围会自动出任务，再补齐会影响工期的关键体量；仅保留范围的空间，生成后在任务清单补充。
              </p>
            </div>
            <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${
              allStructuresClosed
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              {allStructuresClosed ? '可以生成' : '先补信息'}
            </span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-xs font-semibold text-emerald-800">可以自动排程</p>
              {businessReviewChecklist.automaticItems.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {businessReviewChecklist.automaticItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-emerald-100 bg-white px-2 py-1.5">
                      <p className="text-sm font-medium text-slate-900">{item.title} · {item.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-emerald-700">当前只有基础空间范围，暂无提前提示的专项任务。</p>
              )}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-xs font-semibold text-amber-800">需要先补体量</p>
              {businessReviewChecklist.missingFactItems.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {businessReviewChecklist.missingFactItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-amber-100 bg-white px-2 py-1.5">
                      <p className="text-sm font-medium text-slate-900">{item.title} · {item.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-amber-700">楼层、地下层等关键体量已满足。</p>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">生成后补任务</p>
              {businessReviewChecklist.manualTaskItems.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {businessReviewChecklist.manualTaskItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                      <p className="text-sm font-medium text-slate-900">{item.title} · {item.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-slate-500">未发现必须人工补充的独立空间。</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button unstyled
              type="button"
              onClick={() => setModelingStage('spaces')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
            >
              返回项目空间修改空间
            </Button>
            <Button unstyled
              type="button"
              onClick={() => setModelingStage('subdivision')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
            >
              返回细化空间补楼层/地下层
            </Button>
          </div>
        </section>
        <section aria-label="WBS 自动生成依据" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">系统将自动生成</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                根据当前空间，系统会自动带入以下标准或专项任务，并挂到对应空间。
              </p>
            </div>
            <span className="rounded-lg border border-blue-100 bg-white px-2 py-1 text-xs font-medium text-blue-700 tabular-nums">
              {autoWbsPlanHints.filter((item) => item.support === 'supported').length} 项自动识别
            </span>
          </div>
          {autoWbsPlanHints.length > 0 ? (
            <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {autoWbsPlanHints.map((item) => (
                <div key={item.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_auto] sm:items-center">
                  <div>
                    <p className="text-xs text-slate-500">挂接空间</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-900">{item.scopeName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.detail}</p>
                  </div>
                  <span className={`w-fit rounded-lg border px-2 py-1 text-xs font-medium ${
                    item.support === 'supported'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : item.support === 'partial'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}>
                    {getTemplateSupportLabel(item.support)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-500">
              当前空间只作为基础范围挂接，暂未识别到需要提前提示的专项任务包。
            </p>
          )}
          {hasManualWbsPlanHint ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              未自动覆盖的空间需在后续任务清单中补充
            </p>
          ) : null}
        </section>
        <div className="mt-4 flex justify-start">
          <Button unstyled
            type="button"
            onClick={goToPreviousModelingStage}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
          >
            返回细化空间
          </Button>
        </div>
      </section>

      <section aria-label="范围树结果" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-1)]">
        <div className="min-h-[400px]">
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">范围树结果</h3>
              <p className="mt-1 text-xs text-slate-500">上方步骤每次调整后，这里会立即更新空间模型。</p>
            </div>
            <Button unstyled
              type="button"
              onClick={() => setShowAdvancedTreeEdit((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
            >
              <EditScopeIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('edit_scope')} />
              {showAdvancedTreeEdit ? '关闭高级树编辑' : '高级树编辑'}
            </Button>
          </div>
          <div className={`mb-3 rounded-lg border px-3 py-2 ${allStructuresClosed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-center justify-between gap-3">
              <p className={`text-xs font-semibold ${allStructuresClosed ? 'text-emerald-700' : 'text-amber-700'}`}>
                {allStructuresClosed ? '生成 WBS 必要信息已具备' : '仍有 WBS 必要信息待补充'}
              </p>
              <span className={`text-xs tabular-nums ${allStructuresClosed ? 'text-emerald-700' : 'text-amber-700'}`}>
                {closureDiagnostics.filter((item) => item.status === 'closed').length}/{closureDiagnostics.length} 已满足
              </span>
            </div>
            {closureDiagnostics.length === 0 ? (
              <p className="mt-1 text-xs text-amber-700">暂无项目空间，请先在项目空间中添加。</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {closureDiagnostics.map((item) => (
                  <span
                    key={item.id}
                    className={`rounded-lg border px-2 py-1 text-xs ${item.status === 'closed' ? 'border-emerald-200 bg-white text-emerald-700' : 'border-amber-200 bg-white text-amber-700'}`}
                  >
                    {item.name} · {item.status === 'closed' ? '必要信息已满足' : item.issue}
                  </span>
                ))}
              </div>
            )}
          </div>
          {showAdvancedTreeEdit ? (
          <div className="mb-3 flex items-center gap-1 border-b border-slate-100 pb-3">
            <span className="mr-2 text-xs text-slate-400">项目整体：</span>
            {ENGINEERING_OBJECT_ROOT_TYPES.map((type) => (
              <Button unstyled
                key={type}
                type="button"
                data-testid={`scope-root-add-${type}`}
                onClick={() => handleAddNode(null, type)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
              >
                <AddScopeIcon className="h-3 w-3" data-testid={wizardIconTestId('add_scope')} />
                {TYPE_LABELS[type]}
              </Button>
            ))}
          </div>
          ) : null}

          <DndContext
            sensors={sensors}
            onDragOver={(event) => setDropTargetId(event.over?.id ? String(event.over.id) : null)}
            onDragCancel={() => setDropTargetId(null)}
            onDragEnd={handleDragEnd}
          >
            <div
              ref={rootDrop.setNodeRef}
              data-testid="scope-root"
              className={`rounded-lg border border-dashed px-2 py-2 ${rootDrop.isOver || dropTargetId === ROOT_ID ? 'ring-2 ring-blue-300' : 'border-transparent'}`}
            >
              <div className="mb-1 flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-2">
                <CollapseIcon className="h-3.5 w-3.5 text-slate-400" data-testid={wizardIconTestId('collapse')} />
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">项目整体</span>
                <span className="text-sm font-medium text-slate-900">项目整体</span>
              </div>
              {nodes.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                  请先在上方物理空间添加范围
                </div>
              ) : (
                nodes.map((node) => (
                  <TreeRow
                    key={node.id}
                    node={node}
                    depth={1}
                    selectedId={selectedId}
                    dropTargetId={dropTargetId}
                    editable={showAdvancedTreeEdit}
                    onSelect={setSelectedId}
                    onToggle={handleToggle}
                    onAddChild={handleAddNode}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </div>
          </DndContext>

          {showAdvancedTreeEdit && selectedNode && ['building', 'physical_zone'].includes(selectedNode.type) ? (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <Button unstyled
                type="button"
                onClick={() => setShowFloorBatch(!showFloorBatch)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
              >
                <FloorBatchIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('floor_batch')} />
                批量生成楼层
              </Button>
              {showFloorBatch ? (
                <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs text-slate-600" htmlFor="scope-floor-start">起始层</label>
                    <input id="scope-floor-start" type="number" value={floorStart} onChange={(event) => setFloorStart(Number(event.target.value))}
                      className="h-7 w-16 rounded border border-slate-200 px-1 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                    <label className="text-xs text-slate-600" htmlFor="scope-floor-end">结束层</label>
                    <input id="scope-floor-end" type="number" value={floorEnd} onChange={(event) => setFloorEnd(Number(event.target.value))}
                      className="h-7 w-16 rounded border border-slate-200 px-1 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                    <label className="text-xs text-slate-600" htmlFor="scope-floor-template">命名模板</label>
                    <input id="scope-floor-template" type="text" value={floorTemplate} onChange={(event) => setFloorTemplate(event.target.value)}
                      className="h-7 w-20 rounded border border-slate-200 px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                    <label className="text-xs text-slate-600" htmlFor="scope-floor-skip">跳过层</label>
                    <input id="scope-floor-skip" type="text" value={skipFloors} onChange={(event) => setSkipFloors(event.target.value)}
                      placeholder="如 13,14"
                      className="h-7 w-24 rounded border border-slate-200 px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                  </div>
                  <Button unstyled
                    type="button"
                    onClick={handleFloorBatch}
                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  >
                    生成 {Math.max(0, floorEnd - floorStart + 1 - parseSkippedFloors(skipFloors, floorStart, floorEnd).size)} 条楼层记录
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="self-start border-t border-slate-100 pt-3">
          {selectedNode ? (
            <div className="space-y-3">
              {showAdvancedTreeEdit ? (
                <div className="surface-card p-4">
                  <div className="mb-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">高级节点操作</p>
                    <p className="mt-1 truncate text-sm font-medium text-slate-900">{selectedNode.name}</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-xs text-slate-500">新增同级</p>
                      <Button unstyled
                        type="button"
                        data-testid="scope-add-sibling"
                        onClick={() => handleAddSibling(selectedNode.id)}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
                      >
                        <AddScopeIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('add_scope')} />
                        新增同级{TYPE_LABELS[selectedNode.type]}
                      </Button>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs text-slate-500">新增下级</p>
                      {resolveAllowedChildTypes(selectedNode).length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {resolveAllowedChildTypes(selectedNode).map((childType) => (
                            <Button unstyled
                              key={childType}
                              type="button"
                              data-testid={`scope-add-child-${childType}`}
                              onClick={() => handleAddNode(selectedNode.id, childType)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
                            >
                              <AddScopeIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('add_scope')} />
                              新增下级{TYPE_LABELS[childType]}
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                          暂无下级类型，可使用新增同级继续扩展。
                        </p>
                      )}
                    </div>
                    {selectedNode.type === 'building' ? (
                      <div>
                        <p className="mb-1.5 text-xs text-slate-500">复用单体</p>
                        <Button unstyled
                          type="button"
                          onClick={() => handleDuplicate(selectedNode.id)}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
                          title="复制单体"
                        >
                          <DuplicateScopeIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('duplicate_scope')} />
                          复制当前单体
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {shouldShowContextServicePanel && selectedSharedScopeCopy && selectedSharedScope ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-blue-800">{selectedSharedScopeCopy?.panelLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      标记 {selectedSharedScope.name} 对应哪些楼栋或独立工程区，系统会把这个关系写进范围树。
                    </p>
                  </div>
                  {contextualServiceTargetOptions.length === 0 ? (
                    <p className="rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-500">
                      {selectedSharedScopeCopy?.emptyLabel}
                    </p>
                  ) : (
                    <fieldset aria-label={selectedSharedScopeCopy?.customFieldsetLabel}>
                      <legend className="sr-only">{selectedSharedScopeCopy?.customFieldsetLabel}</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {contextualServiceTargetOptions.map((target) => (
                          <label key={target.id} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={contextServiceTargetIds.includes(target.id)}
                              onChange={(event) => {
                                setContextServiceTargetIds((current) => (
                                  event.target.checked
                                    ? Array.from(new Set([...current, target.id]))
                                    : current.filter((id) => id !== target.id)
                                ))
                                setContextServiceRangeSaved(false)
                              }}
                              className="rounded border-slate-300"
                            />
                            <span className="min-w-0 flex-1 truncate">{target.name}</span>
                            <span aria-hidden="true" className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                              {target.type === 'building' ? '楼栋' : '独立工程区'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <div className="mt-3 flex items-center justify-end gap-3">
                    {contextServiceRangeSaved ? (
                      <span className="text-xs font-medium text-blue-700">{selectedSharedScopeCopy?.savedLabel}</span>
                    ) : null}
                    <Button unstyled
                      type="button"
                      onClick={handleSaveContextServiceRange}
                      disabled={contextualServiceTargetOptions.length === 0}
                      className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                    >
                      {contextServiceRangeSaved ? '已保存' : `保存${selectedSharedScopeCopy?.panelLabel ?? '对象'}`}
                    </Button>
                  </div>
                </div>
              ) : null}
              {shouldShowNodeProperties ? (
                <BuildingNodeEditor
                  key={selectedNode.id}
                  node={selectedNode}
                  onRename={(name) => handleRename(selectedNode.id, name)}
                  onUpdate={(updates) => handleMetadataUpdate(selectedNode.id, updates)}
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-sm text-slate-400">选择范围树节点编辑属性</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export function __syncWizardScopeNodeIdCounterForTest(nodes: ScopeNode[]): void {
  syncNodeIdCounterFromScopeTree(nodes)
}

export function __createWizardScopeNodeForTest(type: ObjectType, parentId: string | null, name?: string): ScopeNode {
  return newNode(type, parentId, name)
}

export const Step3EngineeringScopeScale = memo(Step3EngineeringScopeScaleComponent)
