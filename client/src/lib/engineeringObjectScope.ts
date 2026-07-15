import type { EngineeringObjectType } from '@/types'

export type EngineeringObjectDecompositionChildMode = 'by_floor' | 'by_physical_zone'
export type EngineeringObjectCoverageRole = 'exclusive_scope' | 'overlay_trigger' | 'reference_marker'
export type EngineeringObjectAreaAccountingMode = 'counted' | 'not_counted' | 'derived_from_children'

export const ENGINEERING_OBJECT_ROOT_TYPES = [
  'phase',
  'section',
  'building',
  'basement',
  'physical_zone',
] as const satisfies readonly EngineeringObjectType[]

export const ENGINEERING_OBJECT_PHYSICAL_LEDGER_TYPES = [
  'building',
  'basement',
  'floor',
  'physical_zone',
] as const satisfies readonly EngineeringObjectType[]

export const ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES: Partial<Record<EngineeringObjectType, EngineeringObjectDecompositionChildMode>> = {
  floor: 'by_floor',
  physical_zone: 'by_physical_zone',
}

export const ENGINEERING_OBJECT_VALID_CHILDREN = {
  phase: ['section', 'building', 'basement', 'physical_zone'],
  section: ['building', 'basement', 'physical_zone'],
  building: ['floor', 'physical_zone', 'functional_area'],
  basement: ['floor', 'physical_zone', 'functional_area'],
  floor: ['functional_area'],
  physical_zone: ['floor', 'functional_area'],
  functional_area: [],
} as const satisfies Record<EngineeringObjectType, readonly EngineeringObjectType[]>

export const ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES = [
  'building',
  'basement',
  'physical_zone',
] as const satisfies readonly EngineeringObjectType[]

export const ENGINEERING_OBJECT_SCOPE_OPTION_FIELDS = {
  phase: 'phases',
  section: 'sections',
  building: 'buildings',
  basement: 'basements',
  floor: 'floors',
  physical_zone: 'physicalZones',
  functional_area: 'functionalAreas',
} as const satisfies Record<EngineeringObjectType, keyof {
  phases: unknown
  sections: unknown
  buildings: unknown
  basements: unknown
  floors: unknown
  physicalZones: unknown
  functionalAreas: unknown
}>

export function getEngineeringObjectDefaultCoverageRole(type: EngineeringObjectType): EngineeringObjectCoverageRole {
  return type === 'functional_area' ? 'overlay_trigger' : 'exclusive_scope'
}

export function getEngineeringObjectDefaultAreaAccountingMode(type: EngineeringObjectType): EngineeringObjectAreaAccountingMode {
  return type === 'functional_area' ? 'not_counted' : 'counted'
}
