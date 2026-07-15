import type { Task } from '../types/db.js'

// ============================================================
// WBS semantic inference and recalculation service (v1.4.2)
// ============================================================

export type WbsNodeType = 'division' | 'sub_division' | 'item_work' | 'process' | 'activity_step' | 'custom'

export interface WbsSemanticResult {
  wbs_node_type: WbsNodeType | null
  is_leaf: boolean
  is_wbs_summary: boolean
  is_executable: boolean
  inferred: boolean
}

export interface WbsRecalcResult {
  wbs_code: string
  wbs_level: number
  wbs_path: string
  is_leaf: boolean
  is_wbs_summary: boolean
  is_executable: boolean
  wbs_node_type: WbsNodeType | null
}

const SUMMARY_TYPES: Set<WbsNodeType> = new Set(['division', 'sub_division', 'item_work'])
const LEAF_EXECUTABLE_TYPES: Set<WbsNodeType> = new Set(['process', 'activity_step'])

/**
 * Infer WBS node type from parent type, child presence, and explicit hints.
 */
export function inferWbsNodeType(
  parentType: WbsNodeType | null,
  hasChildren: boolean,
  hint?: WbsNodeType | null,
): WbsNodeType | null {
  if (hint) return hint

  if (!parentType) {
    // A standalone row is executable by default; template/import flows pass
    // explicit summary hints when they are creating a structured tree.
    return hasChildren ? 'division' : 'process'
  }

  // Infer based on parent type
  switch (parentType) {
    case 'division':
      return hasChildren ? 'sub_division' : 'process'
    case 'sub_division':
      return 'item_work'
    case 'item_work':
      return 'process'
    case 'process':
      // Only activity_step is allowed under process
      return 'activity_step'
    case 'activity_step':
      return 'activity_step'
    case 'custom':
      return 'custom'
    default:
      return null
  }
}

/**
 * Derive leaf/summary/executable flags from node type and child presence.
 */
export function deriveWbsFlags(
  wbsNodeType: WbsNodeType | null,
  hasChildren: boolean,
): Pick<WbsSemanticResult, 'is_leaf' | 'is_wbs_summary' | 'is_executable'> {
  if (!wbsNodeType) {
    return { is_leaf: !hasChildren, is_wbs_summary: hasChildren, is_executable: !hasChildren }
  }

  if (SUMMARY_TYPES.has(wbsNodeType)) {
    // If a summary type has no children, it's a compression case => still summary but leaf
    return { is_leaf: !hasChildren, is_wbs_summary: true, is_executable: false }
  }

  if (LEAF_EXECUTABLE_TYPES.has(wbsNodeType)) {
    // If process has activity_step children, it becomes summary
    return { is_leaf: !hasChildren, is_wbs_summary: hasChildren, is_executable: !hasChildren }
  }

  return { is_leaf: !hasChildren, is_wbs_summary: hasChildren, is_executable: !hasChildren }
}

/**
 * Build semantic result from a task row's existing data.
 * Used for reading old tasks: infer from parent/children without writing to DB.
 */
export function inferWbsSemanticsFromTask(
  task: Partial<Task>,
  parentType: WbsNodeType | null,
  hasChildren: boolean,
): WbsSemanticResult {
  const existingType = task.wbs_node_type as WbsNodeType | null
  const categoryType = (task as any).category_type as WbsNodeType | null
  let inferredType = existingType || categoryType

  if (!inferredType) {
    // Legacy inference from existing data
    if (task.is_milestone) {
      inferredType = 'process'
    } else if (hasChildren) {
      inferredType = task.wbs_level === 1 ? 'division' : (task.wbs_level === 2 ? 'sub_division' : 'item_work')
    } else {
      inferredType = 'process'
    }
  }

  const flags = deriveWbsFlags(inferredType, hasChildren)

  return {
    wbs_node_type: inferredType,
    ...flags,
    inferred: !existingType && !categoryType,
  }
}

/**
 * Recalculate WBS code/level/path for a set of sibling tasks under the same parent.
 * `siblings`: sorted array of tasks by sort_order
 * `parentCode`: parent's WBS code (e.g. "1.2") or empty for root
 * `parentPath`: parent's WBS path or null for root
 */
export function recalcWbsForSiblings(
  siblings: Array<{ id: string; sort_order: number }>,
  parentCode: string,
  parentPath: string | null,
): Array<{ id: string; wbs_code: string; wbs_level: number; wbs_path: string }> {
  return siblings.map((sib, idx) => {
    const code = parentCode ? `${parentCode}.${idx + 1}` : `${idx + 1}`
    const level = parentCode ? parentCode.split('.').length + 1 : 1
    const path = parentPath ? `${parentPath}/${sib.id}` : `/${sib.id}`
    return { id: sib.id, wbs_code: code, wbs_level: level, wbs_path: path }
  })
}

/**
 * Validate that engineering_category_id and wbs_node_type are not in conflict.
 * Returns error message or null.
 */
export function validateCategoryNodeTypeConsistency(
  categoryType: WbsNodeType | null,
  wbsNodeType: WbsNodeType | null,
): string | null {
  if (!categoryType || !wbsNodeType) return null
  if (categoryType === wbsNodeType) return null

  // activity_step is a special case — category can be process with node_type activity_step
  if (categoryType === 'process' && wbsNodeType === 'activity_step') return null

  return `engineering_category_id 类型 (${categoryType}) 与 wbs_node_type (${wbsNodeType}) 不一致`
}

/**
 * Build the full recalc result combining code/level/path recalc with type inference.
 */
export function buildWbsRecalcResult(
  taskId: string,
  sortOrder: number,
  siblingIndex: number,
  parentCode: string,
  parentPath: string | null,
  wbsNodeType: WbsNodeType | null,
  hasChildren: boolean,
): WbsRecalcResult {
  const code = parentCode ? `${parentCode}.${siblingIndex + 1}` : `${siblingIndex + 1}`
  const wbs_level = parentCode ? parentCode.split('.').length + 1 : 1
  const wbs_path = parentPath ? `${parentPath}/${taskId}` : `/${taskId}`
  const flags = deriveWbsFlags(wbsNodeType, hasChildren)

  return {
    wbs_code: code,
    wbs_level,
    wbs_path,
    wbs_node_type: wbsNodeType,
    ...flags,
  }
}
