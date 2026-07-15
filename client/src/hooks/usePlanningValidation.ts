// v1.4.7.1: Planning tree instant validation (§9.1)
// Lightweight pre-save validation that blocks only basic data integrity issues

import { useMemo } from 'react'

export type ValidationSeverity = 'block_save' | 'confirm' | 'hint'

export interface ValidationIssue {
  rowId: string
  field: string
  message: string
  severity: ValidationSeverity
}

export interface ValidationInput {
  rowId: string
  title?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  progress?: number | null
  isMilestone?: boolean
  isExecutable?: boolean
  parentId?: string | null
  childrenIds?: string[]
  engineeringObjectId?: string | null
  participantUnitId?: string | null
  predecessorIds?: string[]
}

export interface PlanningValidationOptions {
  requireProgress?: boolean
  requireEngineeringObject?: boolean
  requireParticipantUnit?: boolean
}

function isValidDate(value?: string | null): boolean {
  if (!value) return false
  const d = new Date(value)
  return !Number.isNaN(d.getTime())
}

function hasDateValue(value?: string | null) {
  return String(value ?? '').trim().length > 0
}

function hasValue(value?: string | null) {
  return String(value ?? '').trim().length > 0
}

export function validatePlanningRows(
  rows: ValidationInput[],
  options: PlanningValidationOptions = {},
) {
  const requireProgress = options.requireProgress ?? false
  const requireEngineeringObject = options.requireEngineeringObject ?? true
  const requireParticipantUnit = options.requireParticipantUnit ?? true

  const issues: ValidationIssue[] = []
  const rowIds = new Set(rows.map((row) => row.rowId))
  const parentByRowId = new Map(rows.map((row) => [row.rowId, row.parentId ?? null]))

  for (const row of rows) {
    const { rowId } = row
    const hasStartDate = hasDateValue(row.plannedStartDate)
    const hasEndDate = hasDateValue(row.plannedEndDate)

    // Task name required
    if (!(row.title ?? '').trim()) {
      issues.push({ rowId, field: 'title', message: '请输入任务名称', severity: 'block_save' })
    }

    // Executable tasks must have dates
    if (row.isExecutable) {
      if (!hasStartDate) {
        issues.push({ rowId, field: 'planned_start_date', message: '工序/作业步骤必须填写计划日期', severity: 'block_save' })
      }
      if (!hasEndDate) {
        issues.push({ rowId, field: 'planned_end_date', message: '工序/作业步骤必须填写计划日期', severity: 'block_save' })
      }
    } else if (hasStartDate !== hasEndDate) {
      issues.push({
        rowId,
        field: hasStartDate ? 'planned_end_date' : 'planned_start_date',
        message: '计划开始与完成日期需成对填写',
        severity: 'block_save',
      })
    }

    if (hasStartDate && !isValidDate(row.plannedStartDate)) {
      issues.push({ rowId, field: 'planned_start_date', message: '请输入有效日期', severity: 'block_save' })
    }
    if (hasEndDate && !isValidDate(row.plannedEndDate)) {
      issues.push({ rowId, field: 'planned_end_date', message: '请输入有效日期', severity: 'block_save' })
    }

    // Start cannot be after end
    if (isValidDate(row.plannedStartDate) && isValidDate(row.plannedEndDate)) {
      if (new Date(row.plannedStartDate!) > new Date(row.plannedEndDate!)) {
        issues.push({ rowId, field: 'planned_end_date', message: '开始日期不能晚于完成日期', severity: 'block_save' })
      }
    }

    // Progress 0-100
    if (requireProgress && row.isExecutable && row.progress == null) {
      issues.push({ rowId, field: 'progress', message: '请输入目标进度', severity: 'block_save' })
    }
    if (row.progress != null && (row.progress < 0 || row.progress > 100)) {
      issues.push({ rowId, field: 'progress', message: '进度范围 0-100', severity: 'block_save' })
    }

    // v1.4.7.1: active executable tasks must have engineering scope
    if (requireEngineeringObject && row.isExecutable && !hasValue(row.engineeringObjectId)) {
      issues.push({ rowId, field: 'engineering_object_id', message: '请选择工程对象', severity: 'block_save' })
    }

    // v1.4.7.1: active tasks should have participant unit
    if (requireParticipantUnit && row.isExecutable && !hasValue(row.participantUnitId)) {
      issues.push({ rowId, field: 'participant_unit_id', message: '请选择责任单位', severity: 'confirm' })
    }

    // v1.4.7.1: predecessor cannot be self
    if (row.predecessorIds?.includes(row.rowId)) {
      issues.push({ rowId, field: 'predecessors', message: '不能选择自身为前置', severity: 'block_save' })
    }
  }

  // Check for circular parent references
  for (const row of rows) {
    if (row.parentId && !rowIds.has(row.parentId)) {
      issues.push({ rowId: row.rowId, field: 'parent_id', message: '父子层级不能断裂', severity: 'block_save' })
      continue
    }

    let parentId = row.parentId ?? null
    const visitedParentIds = new Set<string>()
    while (parentId) {
      if (parentId === row.rowId || visitedParentIds.has(parentId)) {
        issues.push({ rowId: row.rowId, field: 'parent_id', message: '不能将任务挂到自己的子级下', severity: 'block_save' })
        break
      }
      visitedParentIds.add(parentId)
      parentId = parentByRowId.get(parentId) ?? null
    }
  }

  // Check for predecessor cycles (simple: same predecessor appearing as descendant of self)
  const predecessorGraph = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.predecessorIds?.length) {
      predecessorGraph.set(row.rowId, new Set(row.predecessorIds))
    }
  }
  for (const [rowId, preds] of predecessorGraph) {
    for (const predId of preds) {
      // If predecessor also depends on this task (cycle)
      if (predecessorGraph.has(predId) && predecessorGraph.get(predId)!.has(rowId)) {
        issues.push({ rowId, field: 'predecessors', message: '存在循环依赖，请检查前置链', severity: 'block_save' })
      }
    }
  }

  const blockIssues = issues.filter(i => i.severity === 'block_save')
  const confirmIssues = issues.filter(i => i.severity === 'confirm')
  const hintIssues = issues.filter(i => i.severity === 'hint')

  return {
    valid: blockIssues.length === 0,
    issues,
    blockCount: blockIssues.length,
    confirmCount: confirmIssues.length,
    hintCount: hintIssues.length,
    issuesByRow: issues.reduce((map, issue) => {
      const rowIssues = map.get(issue.rowId) ?? []
      rowIssues.push(issue)
      map.set(issue.rowId, rowIssues)
      return map
    }, new Map<string, ValidationIssue[]>()),
  }
}

export function usePlanningValidation(
  rows: ValidationInput[],
  options: PlanningValidationOptions = {},
) {
  return useMemo(
    () => validatePlanningRows(rows, options),
    [
      rows,
      options.requireEngineeringObject,
      options.requireParticipantUnit,
      options.requireProgress,
    ],
  )
}

export default usePlanningValidation
