// v1.4.2: Unified WBS node type labels — shared across PlanningTreeView, GanttViewRows, and filters.

export function getWbsNodeTypeLabel(nodeType?: string | null, fallbackLabel?: string): string {
  switch (nodeType) {
    case 'division': return '分部工程'
    case 'sub_division': return '子分部工程'
    case 'item_work': return '分项工程'
    case 'process': return '工序'
    case 'activity_step': return '作业步骤'
    default: return fallbackLabel ?? '施工任务'
  }
}
