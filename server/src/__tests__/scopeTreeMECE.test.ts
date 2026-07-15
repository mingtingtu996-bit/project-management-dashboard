/**
 * Scope Tree MECE (Mutually Exclusive, Collectively Exhaustive) Pressure Test
 *
 * Validates that the 7-type engineering object model can correctly represent
 * ALL physical spaces of real construction projects without overlap or gaps.
 *
 * Test scenarios cover the full spectrum of Chinese construction project types.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { EngineeringObjectType } from '../types/db.js'

const root = resolve(__dirname, '../../..')

function readSource(path: string) {
  return readFileSync(resolve(root, path), 'utf8')
}

// ============================================================
// Helpers: simulate scope tree building (mirrors wizard logic)
// ============================================================

type ObjectType = Exclude<EngineeringObjectType, 'engineering'>

interface ScopeNode {
  id: string
  type: ObjectType
  name: string
  parentId: string | null
  children: ScopeNode[]
  metadata: Record<string, unknown>
}

const VALID_CHILDREN: Record<ObjectType, ObjectType[]> = {
  phase: ['section', 'building', 'basement', 'physical_zone'],
  section: ['building', 'basement', 'physical_zone'],
  building: ['floor', 'physical_zone', 'functional_area'],
  basement: ['floor', 'physical_zone', 'functional_area'],
  floor: ['functional_area'],
  physical_zone: ['floor', 'functional_area'],
  functional_area: [],
}

let idCounter = 0
function makeNode(type: ObjectType, name: string, metadata: Record<string, unknown> = {}, children: ScopeNode[] = []): ScopeNode {
  idCounter += 1
  const id = `test_${idCounter}`
  const node: ScopeNode = { id, type, name, parentId: null, metadata, children: [] }
  node.children = children.map(c => ({ ...c, parentId: id }))
  return node
}

function building(name: string, meta: Record<string, unknown>, children: ScopeNode[] = []) {
  return makeNode('building', name, { coverageRole: 'exclusive_scope', areaAccountingMode: 'counted', childrenComplete: true, ...meta }, children)
}
function basement(name: string, meta: Record<string, unknown>, children: ScopeNode[] = []) {
  return makeNode('basement', name, { coverageRole: 'exclusive_scope', areaAccountingMode: 'counted', childrenComplete: true, ...meta }, children)
}
function floor(name: string, order: number, meta: Record<string, unknown> = {}) {
  return makeNode('floor', name, { floorOrder: order, coverageRole: 'exclusive_scope', areaAccountingMode: 'counted', ...meta })
}
function physicalZone(name: string, meta: Record<string, unknown>, children: ScopeNode[] = []) {
  return makeNode('physical_zone', name, { coverageRole: 'exclusive_scope', areaAccountingMode: 'counted', childrenComplete: true, ...meta }, children)
}
function functionalArea(name: string, meta: Record<string, unknown> = {}) {
  return makeNode('functional_area', name, { coverageRole: 'overlay_trigger', areaAccountingMode: 'not_counted', ...meta })
}
function spatialPartition(name: string, meta: Record<string, unknown> = {}) {
  return makeNode('functional_area', name, { coverageRole: 'exclusive_scope', areaAccountingMode: 'counted', partitionMode: 'spatial_partition', ...meta })
}
function phase(name: string, children: ScopeNode[] = []) {
  return makeNode('phase', name, {}, children)
}
function section(name: string, children: ScopeNode[] = []) {
  return makeNode('section', name, {}, children)
}

// ============================================================
// Validation logic (mirrors backend)
// ============================================================

function validateParentChild(parentType: ObjectType, childType: ObjectType): boolean {
  return VALID_CHILDREN[parentType].includes(childType)
}

function validateDecompositionAxis(parent: ScopeNode): { valid: boolean; error?: string } {
  const childTypes = new Set(parent.children.map(c => c.type))
  const hasFloor = childTypes.has('floor')
  const hasPhysicalZone = childTypes.has('physical_zone')
  if (hasFloor && hasPhysicalZone) {
    return { valid: false, error: `${parent.name}: cannot mix floor and physical_zone as direct children` }
  }
  return { valid: true }
}

const LEDGER_TYPES = new Set<ObjectType>(['building', 'basement', 'floor', 'physical_zone', 'functional_area'])

function isCountedNode(node: ScopeNode): boolean {
  // phase and section are organizational, never counted
  if (!LEDGER_TYPES.has(node.type)) return false
  if (node.type === 'functional_area' && node.metadata.partitionMode === 'spatial_partition') return true
  return node.metadata.coverageRole !== 'overlay_trigger' && node.metadata.areaAccountingMode !== 'not_counted'
}

function flattenNodes(nodes: ScopeNode[]): ScopeNode[] {
  return nodes.flatMap(n => [n, ...flattenNodes(n.children)])
}

function validateTree(roots: ScopeNode[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const all = flattenNodes(roots)

  for (const node of all) {
    // Validate parent-child relationships
    for (const child of node.children) {
      if (!validateParentChild(node.type, child.type)) {
        errors.push(`${node.name} (${node.type}) cannot contain ${child.name} (${child.type})`)
      }
    }
    // Validate decomposition axis
    if (['building', 'basement', 'physical_zone'].includes(node.type)) {
      const result = validateDecompositionAxis(node)
      if (!result.valid) errors.push(result.error!)
    }
    // Validate sibling uniqueness (same type + same name under same parent)
    const siblingKeys = new Set<string>()
    for (const child of node.children) {
      if (!isCountedNode(child)) continue
      const key = `${child.type}:${child.name}`
      if (siblingKeys.has(key)) {
        errors.push(`${node.name}: duplicate sibling ${child.type} "${child.name}"`)
      }
      siblingKeys.add(key)
    }
  }
  return { valid: errors.length === 0, errors }
}

function countExclusiveNodes(roots: ScopeNode[]): number {
  return flattenNodes(roots).filter(isCountedNode).length
}

function getExclusiveLeaves(roots: ScopeNode[]): ScopeNode[] {
  const all = flattenNodes(roots)
  return all.filter(node => {
    if (!isCountedNode(node)) return false
    // A leaf is a counted node with no counted children
    const hasCountedChild = node.children.some(c => isCountedNode(c))
    return !hasCountedChild
  })
}

// ============================================================
// Test Scenarios
// ============================================================

describe('Scope Tree MECE Pressure Test', () => {

  describe('Scenario 1: School campus (5 independent buildings + outdoor)', () => {
    const tree = [
      building('1#教学楼', { functionalUsage: '教学楼', standardFloorCount: 5 }, [
        floor('L1', 1), floor('L2', 2), floor('L3', 3), floor('L4', 4), floor('L5', 5),
      ]),
      building('2#实验楼', { functionalUsage: '实验楼', standardFloorCount: 5 }, [
        floor('L1', 1), floor('L2', 2), floor('L3', 3), floor('L4', 4), floor('L5', 5),
      ]),
      building('3#宿舍楼', { functionalUsage: '宿舍楼', standardFloorCount: 8 }, [
        floor('L1', 1), floor('L2', 2), floor('L3', 3), floor('L4', 4),
        floor('L5', 5), floor('L6', 6), floor('L7', 7), floor('L8', 8),
      ]),
      building('1#食堂', { functionalUsage: '食堂', standardFloorCount: 3 }, [
        floor('L1', 1), floor('L2', 2), floor('L3', 3),
      ]),
      building('1#体育馆', { functionalUsage: '体育馆', standardFloorCount: 2 }, [
        floor('L1', 1), floor('L2', 2),
      ]),
      physicalZone('室外总平', { physicalCategory: '室外道路' }),
    ]

    it('passes structural validation', () => {
      const result = validateTree(tree)
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    })

    it('all buildings are exclusive scope leaves at building level', () => {
      const buildings = tree.filter(n => n.type === 'building')
      expect(buildings).toHaveLength(5)
      buildings.forEach(b => expect(b.metadata.coverageRole).toBe('exclusive_scope'))
    })

    it('floor counts match declared standardFloorCount', () => {
      tree.filter(n => n.type === 'building').forEach(b => {
        const floors = b.children.filter(c => c.type === 'floor')
        expect(floors.length).toBe(b.metadata.standardFloorCount)
      })
    })

    it('exclusive leaves cover all physical space', () => {
      const leaves = getExclusiveLeaves(tree)
      // 5+5+8+3+2 floors + 1 outdoor zone = 24 leaves
      expect(leaves.length).toBe(24)
    })
  })

  describe('Scenario 2: Residential complex (3 towers + shared basement + outdoor)', () => {
    const tree = [
      building('1#楼', { functionalUsage: '住宅楼', standardFloorCount: 22 }, [
        ...Array.from({ length: 22 }, (_, i) => floor(`L${i + 1}`, i + 1)),
      ]),
      building('2#楼', { functionalUsage: '住宅楼', standardFloorCount: 22 }, [
        ...Array.from({ length: 22 }, (_, i) => floor(`L${i + 1}`, i + 1)),
      ]),
      building('3#楼', { functionalUsage: '住宅楼', standardFloorCount: 22 }, [
        ...Array.from({ length: 22 }, (_, i) => floor(`L${i + 1}`, i + 1)),
      ]),
      basement('地下车库', { basementLevelCount: 2, basementAreaM2: 45000 }, [
        floor('B1', -1),
        floor('B2', -2),
      ]),
      physicalZone('室外总平', { physicalCategory: '室外道路' }),
    ]

    it('passes structural validation', () => {
      expect(validateTree(tree).valid).toBe(true)
    })

    it('basement is independent from buildings (shared basement pattern)', () => {
      const basements = tree.filter(n => n.type === 'basement')
      expect(basements).toHaveLength(1)
      expect(basements[0].children.filter(c => c.type === 'floor')).toHaveLength(2)
    })

    it('exclusive leaves = 22*3 + 2 + 1 = 69', () => {
      expect(getExclusiveLeaves(tree).length).toBe(69)
    })
  })

  describe('Scenario 3: Complex (tower + podium + shared basement) — the hardest case', () => {
    // Tower starts at L5 (above podium roof), podium has L1-L4
    const tree = [
      building('1#塔楼', { functionalUsage: '住宅楼', structuralRole: 'tower', towerStartFloorOrder: 5, standardFloorCount: 28 }, [
        ...Array.from({ length: 28 }, (_, i) => floor(`T${i + 5}`, i + 5)),
      ]),
      building('2#塔楼', { functionalUsage: '酒店客房楼', structuralRole: 'tower', towerStartFloorOrder: 5, standardFloorCount: 20 }, [
        ...Array.from({ length: 20 }, (_, i) => floor(`T${i + 5}`, i + 5)),
      ]),
      building('裙房', { functionalUsage: '商业', structuralRole: 'podium', standardFloorCount: 4 }, [
        floor('P1', 1), floor('P2', 2), floor('P3', 3), floor('P4', 4),
        floor('RF', 5, { floorUsage: 'podium_roof' }),
      ]),
      basement('地下室', { basementLevelCount: 3, basementAreaM2: 52000 }, [
        floor('B1', -1), floor('B2', -2), floor('B3', -3),
      ]),
      physicalZone('室外总平', { physicalCategory: '室外道路' }),
    ]

    it('passes structural validation', () => {
      const result = validateTree(tree)
      expect(result.errors).toEqual([])
    })

    it('tower floors start above podium (no overlap in floor order)', () => {
      const tower1 = tree.find(n => n.name === '1#塔楼')!
      const podium = tree.find(n => n.name === '裙房')!
      const towerMinOrder = Math.min(...tower1.children.map(c => c.metadata.floorOrder as number))
      const podiumMaxOrder = Math.max(...podium.children.filter(c => c.metadata.floorUsage !== 'podium_roof').map(c => c.metadata.floorOrder as number))
      expect(towerMinOrder).toBeGreaterThan(podiumMaxOrder)
    })

    it('structuralRole metadata is present on tower and podium', () => {
      expect(tree.find(n => n.name === '1#塔楼')!.metadata.structuralRole).toBe('tower')
      expect(tree.find(n => n.name === '2#塔楼')!.metadata.structuralRole).toBe('tower')
      expect(tree.find(n => n.name === '裙房')!.metadata.structuralRole).toBe('podium')
    })

    it('exclusive leaves = 28 + 20 + 5 + 3 + 1 = 57', () => {
      expect(getExclusiveLeaves(tree).length).toBe(57)
    })

    it('no floor order collision across tower and podium at same elevation', () => {
      const allFloors = flattenNodes(tree).filter(n => n.type === 'floor')
      // Group by parent building
      const byParent = new Map<string, ScopeNode[]>()
      for (const f of allFloors) {
        const key = f.parentId ?? 'root'
        if (!byParent.has(key)) byParent.set(key, [])
        byParent.get(key)!.push(f)
      }
      // Within each parent, floor orders must be unique
      for (const [, floors] of byParent) {
        const orders = floors.map(f => f.metadata.floorOrder as number)
        expect(new Set(orders).size).toBe(orders.length)
      }
    })
  })

  describe('Scenario 4: Hospital (4 independent buildings + shared basement)', () => {
    const tree = [
      building('1#住院楼', { functionalUsage: '住院楼', standardFloorCount: 22 }, [
        ...Array.from({ length: 22 }, (_, i) => floor(`L${i + 1}`, i + 1)),
      ]),
      building('2#医技楼', { functionalUsage: '医技楼', standardFloorCount: 5 }, [
        floor('L1', 1),
        floor('L2', 2, { floorUsage: 'standard' }),
        floor('L3', 3),
        floor('L4', 4),
        floor('L5', 5),
      ]),
      building('3#门诊楼', { functionalUsage: '门诊楼', standardFloorCount: 8 }, [
        ...Array.from({ length: 8 }, (_, i) => floor(`L${i + 1}`, i + 1)),
      ]),
      building('4#传染门诊', { functionalUsage: '传染门诊', standardFloorCount: 3 }, [
        floor('L1', 1),
        floor('L2', 2),
        floor('L3', 3),
      ]),
      basement('医院地下室', { basementLevelCount: 2, basementAreaM2: 32000 }, [
        floor('B1', -1),
        floor('B2', -2),
      ]),
      physicalZone('室外总平', { physicalCategory: '室外道路' }),
    ]

    it('passes structural validation', () => {
      expect(validateTree(tree).valid).toBe(true)
    })

    it('functional areas as overlay triggers do not break MECE', () => {
      // Add functional areas to 医技楼 L2 (surgery center) and 传染门诊 L1 (three zones)
      const medTech = tree.find(n => n.name === '2#医技楼')!
      medTech.children[1].children = [
        functionalArea('手术中心', { functionalCategory: '洁净区', specialRoomType: '手术室' }),
      ]
      const infectious = tree.find(n => n.name === '4#传染门诊')!
      infectious.children[0].children = [
        functionalArea('清洁区', { functionalCategory: '清洁区' }),
        functionalArea('半污染区', { functionalCategory: '半污染区' }),
        functionalArea('污染区', { functionalCategory: '污染区' }),
      ]
      expect(validateTree(tree).valid).toBe(true)
      // Functional areas are NOT counted as exclusive leaves
      const leaves = getExclusiveLeaves(tree)
      const faLeaves = leaves.filter(n => n.type === 'functional_area')
      expect(faLeaves).toHaveLength(0)
    })

    it('spatial_partition functional areas ARE counted as exclusive leaves', () => {
      const infectious = tree.find(n => n.name === '4#传染门诊')!
      infectious.children[0].children = [
        spatialPartition('清洁区', { functionalCategory: '清洁区', areaM2: 200 }),
        spatialPartition('半污染区', { functionalCategory: '半污染区', areaM2: 150 }),
        spatialPartition('污染区', { functionalCategory: '污染区', areaM2: 250 }),
      ]
      const leaves = getExclusiveLeaves(tree)
      const partitionLeaves = leaves.filter(n => n.metadata.partitionMode === 'spatial_partition')
      expect(partitionLeaves).toHaveLength(3)
    })

    it('exclusive leaves = 22+5+8+3+2+1 = 41 (without spatial partitions)', () => {
      // Reset children to no functional areas
      tree.find(n => n.name === '4#传染门诊')!.children[0].children = []
      tree.find(n => n.name === '2#医技楼')!.children[1].children = []
      expect(getExclusiveLeaves(tree).length).toBe(41)
    })
  })

  describe('Scenario 5: Large building with construction zones (东区/西区)', () => {
    const tree = [
      building('1#住院楼', { functionalUsage: '住院楼', decompositionMode: 'by_physical_zone' }, [
        physicalZone('东区', { physicalCategory: '地下室分区' }, [
          floor('L1', 1), floor('L2', 2), floor('L3', 3), floor('L4', 4), floor('L5', 5),
          floor('L6', 6), floor('L7', 7), floor('L8', 8), floor('L9', 9), floor('L10', 10), floor('L11', 11),
        ]),
        physicalZone('西区', { physicalCategory: '地下室分区' }, [
          floor('L1', 1), floor('L2', 2), floor('L3', 3), floor('L4', 4), floor('L5', 5),
          floor('L6', 6), floor('L7', 7), floor('L8', 8), floor('L9', 9), floor('L10', 10), floor('L11', 11),
        ]),
      ]),
      physicalZone('室外总平', { physicalCategory: '室外道路' }),
    ]

    it('passes structural validation (building → physical_zone → floor)', () => {
      expect(validateTree(tree).valid).toBe(true)
    })

    it('building uses by_physical_zone decomposition', () => {
      expect(tree[0].metadata.decompositionMode).toBe('by_physical_zone')
    })

    it('cannot mix floor and physical_zone under same building', () => {
      const badTree = [
        building('1#住院楼', { functionalUsage: '住院楼' }, [
          physicalZone('东区', { physicalCategory: '地下室分区' }),
          floor('L1', 1), // INVALID: mixing floor with physical_zone
        ]),
      ]
      const result = validateTree(badTree)
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('cannot mix floor and physical_zone')
    })

    it('exclusive leaves = 11+11+1 = 23', () => {
      expect(getExclusiveLeaves(tree).length).toBe(23)
    })
  })

  describe('Scenario 6: Basement with zone partitioning', () => {
    const tree = [
      building('1#楼', { functionalUsage: '住宅楼', standardFloorCount: 22 }, [
        ...Array.from({ length: 22 }, (_, i) => floor(`L${i + 1}`, i + 1)),
      ]),
      basement('地下室', { basementLevelCount: 2, decompositionMode: 'by_physical_zone' }, [
        physicalZone('地库一区', { physicalCategory: '地下室分区' }, [
          floor('B1', -1), floor('B2', -2),
        ]),
        physicalZone('地库二区', { physicalCategory: '地下室分区' }, [
          floor('B1', -1), floor('B2', -2),
        ]),
      ]),
      physicalZone('室外总平', { physicalCategory: '室外道路' }),
    ]

    it('passes structural validation (basement → physical_zone → floor)', () => {
      expect(validateTree(tree).valid).toBe(true)
    })

    it('exclusive leaves = 22 + 2 + 2 + 1 = 27', () => {
      expect(getExclusiveLeaves(tree).length).toBe(27)
    })
  })

  describe('Scenario 7: Industrial plant (steel frame + cleanroom)', () => {
    const tree = [
      building('1#主厂房', { functionalUsage: '主厂房', standardFloorCount: 2 }, [
        floor('L1', 1),
        floor('L2', 2),
      ]),
      building('2#公辅', { functionalUsage: '公辅', standardFloorCount: 2 }, [
        floor('L1', 1), floor('L2', 2),
      ]),
      building('3#仓库', { functionalUsage: '仓库', standardFloorCount: 1 }, [
        floor('L1', 1),
      ]),
      physicalZone('室外管网', { physicalCategory: '管网分区' }),
      physicalZone('室外道路', { physicalCategory: '室外道路' }),
    ]

    it('passes structural validation', () => {
      expect(validateTree(tree).valid).toBe(true)
    })

    it('multiple physical_zones at root are valid and exclusive', () => {
      const zones = tree.filter(n => n.type === 'physical_zone')
      expect(zones).toHaveLength(2)
      expect(zones[0].name).not.toBe(zones[1].name)
    })

    it('exclusive leaves = 2+2+1+1+1 = 7', () => {
      expect(getExclusiveLeaves(tree).length).toBe(7)
    })
  })

  describe('Scenario 8: Phased project with sections', () => {
    const tree = [
      phase('一期', [
        section('A标段', [
          building('1#楼', { functionalUsage: '住宅楼', standardFloorCount: 22 }, [
            ...Array.from({ length: 22 }, (_, i) => floor(`L${i + 1}`, i + 1)),
          ]),
          building('2#楼', { functionalUsage: '住宅楼', standardFloorCount: 22 }, [
            ...Array.from({ length: 22 }, (_, i) => floor(`L${i + 1}`, i + 1)),
          ]),
        ]),
        basement('一期地下室', { basementLevelCount: 2 }, [
          floor('B1', -1), floor('B2', -2),
        ]),
      ]),
      phase('二期', [
        building('3#楼', { functionalUsage: '住宅楼', standardFloorCount: 22 }, [
          ...Array.from({ length: 22 }, (_, i) => floor(`L${i + 1}`, i + 1)),
        ]),
      ]),
      physicalZone('室外总平', { physicalCategory: '室外道路' }),
    ]

    it('passes structural validation with phase/section hierarchy', () => {
      expect(validateTree(tree).valid).toBe(true)
    })

    it('phase and section are not counted as exclusive scope', () => {
      const phases = flattenNodes(tree).filter(n => n.type === 'phase')
      const sections = flattenNodes(tree).filter(n => n.type === 'section')
      phases.forEach(p => expect(isCountedNode(p)).toBe(false))
      sections.forEach(s => expect(isCountedNode(s)).toBe(false))
    })

    it('exclusive leaves = 22+22+22+2+1 = 69', () => {
      expect(getExclusiveLeaves(tree).length).toBe(69)
    })
  })

  describe('Scenario 9: Special floor types (pilotis, refuge, mechanical, roof)', () => {
    const tree = [
      building('1#楼', { functionalUsage: '住宅楼', standardFloorCount: 24 }, [
        floor('L1', 1, { floorUsage: 'ground_pilotis' }),
        ...Array.from({ length: 11 }, (_, i) => floor(`L${i + 2}`, i + 2)),
        floor('L13', 13, { floorUsage: 'refuge' }),
        ...Array.from({ length: 9 }, (_, i) => floor(`L${i + 14}`, i + 14)),
        floor('L23', 23, { floorUsage: 'mechanical' }),
        floor('RF', 24, { floorUsage: 'roof' }),
      ]),
    ]

    it('passes structural validation', () => {
      expect(validateTree(tree).valid).toBe(true)
    })

    it('special floors are still exclusive_scope and counted', () => {
      const allFloors = flattenNodes(tree).filter(n => n.type === 'floor')
      expect(allFloors).toHaveLength(24)
      allFloors.forEach(f => {
        expect(f.metadata.coverageRole).toBe('exclusive_scope')
        expect(f.metadata.areaAccountingMode).toBe('counted')
      })
    })

    it('floor orders are unique and sequential', () => {
      const orders = flattenNodes(tree).filter(n => n.type === 'floor').map(f => f.metadata.floorOrder as number)
      expect(new Set(orders).size).toBe(orders.length)
      expect(Math.min(...orders)).toBe(1)
      expect(Math.max(...orders)).toBe(24)
    })

    it('floorUsage metadata is preserved', () => {
      const floors = flattenNodes(tree).filter(n => n.type === 'floor')
      expect(floors.find(f => f.metadata.floorOrder === 1)!.metadata.floorUsage).toBe('ground_pilotis')
      expect(floors.find(f => f.metadata.floorOrder === 13)!.metadata.floorUsage).toBe('refuge')
      expect(floors.find(f => f.metadata.floorOrder === 23)!.metadata.floorUsage).toBe('mechanical')
      expect(floors.find(f => f.metadata.floorOrder === 24)!.metadata.floorUsage).toBe('roof')
    })
  })

  describe('Scenario 10: Data center (dual buildings + power center)', () => {
    const tree = [
      building('1#机房楼', { functionalUsage: '机房楼', standardFloorCount: 5 }, [
        ...Array.from({ length: 5 }, (_, i) => floor(`L${i + 1}`, i + 1)),
      ]),
      building('2#动力中心', { functionalUsage: '动力中心', standardFloorCount: 2 }, [
        floor('L1', 1), floor('L2', 2),
      ]),
      basement('地下室', { basementLevelCount: 1 }, [
        floor('B1', -1),
      ]),
      physicalZone('室外管网', { physicalCategory: '管网分区' }),
      physicalZone('室外道路', { physicalCategory: '室外道路' }),
    ]

    it('passes structural validation', () => {
      expect(validateTree(tree).valid).toBe(true)
    })

    it('exclusive leaves = 5+2+1+1+1 = 10', () => {
      expect(getExclusiveLeaves(tree).length).toBe(10)
    })
  })

  // ============================================================
  // Negative tests: things that SHOULD fail
  // ============================================================

  describe('Negative: invalid structures that violate MECE', () => {
    it('rejects functional_area as child of phase', () => {
      expect(validateParentChild('phase', 'functional_area')).toBe(false)
    })

    it('rejects building as child of floor', () => {
      expect(validateParentChild('floor', 'building')).toBe(false)
    })

    it('rejects floor as child of functional_area', () => {
      expect(validateParentChild('functional_area', 'floor')).toBe(false)
    })

    it('rejects basement as child of building', () => {
      expect(validateParentChild('building', 'basement')).toBe(false)
    })

    it('detects mixed decomposition axis', () => {
      const badBuilding = building('1#楼', { functionalUsage: '住宅楼' }, [
        floor('L1', 1),
        physicalZone('东区', { physicalCategory: '地下室分区' }),
      ])
      const result = validateDecompositionAxis(badBuilding)
      expect(result.valid).toBe(false)
    })

    it('detects duplicate sibling names', () => {
      const badTree = [
        building('1#楼', { functionalUsage: '住宅楼' }, [
          floor('L1', 1),
          floor('L1', 2), // same name, different order — still a duplicate name
        ]),
      ]
      const result = validateTree(badTree)
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('duplicate sibling')
    })
  })

  // ============================================================
  // Code contract: verify runtime model matches test assumptions
  // ============================================================

  describe('Code contract: runtime model alignment', () => {
    it('backend VALID_CHILDREN includes building → physical_zone', () => {
      const source = readSource('server/src/types/db.ts')
      expect(source).toContain("building: ['floor', 'physical_zone', 'functional_area']")
    })

    it('backend VALID_CHILDREN includes physical_zone → floor', () => {
      const source = readSource('server/src/types/db.ts')
      expect(source).toContain("physical_zone: ['floor', 'functional_area']")
    })

    it('backend enforces decomposition axis validation', () => {
      const source = readSource('server/src/services/engineeringObjectService.ts')
      expect(source).toContain('validateDecompositionAxis')
      expect(source).toContain('DECOMPOSITION_PARENT_TYPES')
      expect(source).toContain('DECOMPOSITION_CHILD_MODES')
    })

    it('backend supports partitionMode for functional_area', () => {
      const source = readSource('server/src/routes/projectWizard.ts')
      expect(source).toContain('readPartitionMode')
      expect(source).toContain("partitionMode === 'spatial_partition'")
    })

    it('frontend wizard VALID_CHILDREN consumes the shared engineering-object scope contract', () => {
      const shared = readSource('client/src/lib/engineeringObjectScope.ts')
      const source = readSource('client/src/components/project/wizard/Step3EngineeringScopeScale.tsx')
      expect(shared).toContain('export const ENGINEERING_OBJECT_VALID_CHILDREN')
      expect(shared).toContain("building: ['floor', 'physical_zone', 'functional_area']")
      expect(shared).toContain("floor: ['functional_area']")
      expect(shared).toContain("physical_zone: ['floor', 'functional_area']")
      expect(source).toContain('ENGINEERING_OBJECT_VALID_CHILDREN')
      expect(source).toContain('const CHILD_TYPES = ENGINEERING_OBJECT_VALID_CHILDREN')
    })

    it('frontend scope dialog VALID_CHILDREN consumes the shared engineering-object scope contract', () => {
      const shared = readSource('client/src/lib/engineeringObjectScope.ts')
      const source = readSource('client/src/pages/GanttView/EngineeringObjectsDialog.tsx')
      expect(shared).toContain('export const ENGINEERING_OBJECT_VALID_CHILDREN')
      expect(shared).toContain("building: ['floor', 'physical_zone', 'functional_area']")
      expect(shared).toContain("floor: ['functional_area']")
      expect(shared).toContain("physical_zone: ['floor', 'functional_area']")
      expect(source).toContain('ENGINEERING_OBJECT_VALID_CHILDREN')
      expect(source).toContain('const VALID_CHILD_TYPES = ENGINEERING_OBJECT_VALID_CHILDREN')
    })

    it('childrenComplete defaults to true only for independently partitioned physical scopes', () => {
      const source = readSource('server/src/services/engineeringObjectService.ts')
      expect(source).toContain('childrenComplete')
      expect(source).toContain("['basement', 'physical_zone'].includes(childType)")
    })
  })
})
