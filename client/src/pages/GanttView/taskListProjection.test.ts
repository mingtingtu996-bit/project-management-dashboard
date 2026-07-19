import { describe, expect, it } from 'vitest'

import {
  compareTasksByExecutionOrder,
  getTaskExecutionDisplayDepth,
  shouldShowTaskInMainExecutionList,
} from './taskListProjection'
import { getGanttBusinessStatusDisplay } from './ganttViewUtils'
import type { WBSNode } from '../GanttViewTypes'

function task(overrides: Partial<WBSNode>): WBSNode {
  return {
    id: overrides.id ?? 'task',
    project_id: 'project',
    title: overrides.title ?? '任务',
    children: overrides.children ?? [],
    depth: overrides.depth ?? 0,
    created_at: '2026-05-26T00:00:00Z',
    updated_at: '2026-05-26T00:00:00Z',
    ...overrides,
  } as WBSNode
}

describe('task list projection semantics', () => {
  it('keeps execution schedule rows even when they also carry control tags', () => {
    const row = task({
      wbs_node_type: 'process',
      is_executable: true,
      standard_task_metadata: {
        rowProjectionMode: 'schedule_row',
        planItemTags: ['危大'],
        safetyControlRole: 'hazardous_work',
      },
    })

    expect(shouldShowTaskInMainExecutionList(row)).toBe(true)
  })

  it('hides ordinary inline controls, linked projections, and non-key gates from the main task list', () => {
    expect(shouldShowTaskInMainExecutionList(task({
      standard_task_metadata: { rowProjectionMode: 'inline_control' },
    }))).toBe(false)
    expect(shouldShowTaskInMainExecutionList(task({
      standard_task_metadata: { rowProjectionMode: 'linked_projection' },
    }))).toBe(false)
    expect(shouldShowTaskInMainExecutionList(task({
      standard_task_metadata: { planItemKind: 'linked_projection' },
    }))).toBe(false)
    expect(shouldShowTaskInMainExecutionList(task({
      standard_task_metadata: { relationRole: 'projected_link' },
    }))).toBe(false)
    expect(shouldShowTaskInMainExecutionList(task({
      standard_task_metadata: { rowProjectionMode: 'gate_marker', planItemKind: 'inspection_task' },
    }))).toBe(false)
  })

  it('keeps milestones and critical gate markers in the main task list', () => {
    expect(shouldShowTaskInMainExecutionList(task({
      is_milestone: true,
      standard_task_metadata: { rowProjectionMode: 'gate_marker' },
    }))).toBe(true)
    expect(shouldShowTaskInMainExecutionList(task({
      standard_task_metadata: {
        rowProjectionMode: 'gate_marker',
        planItemTags: ['关键节点'],
      },
    }))).toBe(true)
    expect(shouldShowTaskInMainExecutionList(task({
      standard_task_metadata: {
        rowProjectionMode: 'gate_marker',
        safetyControlRole: 'safety_acceptance',
      },
    }))).toBe(true)
  })

  it('does not show division summary rows as execution rows', () => {
    expect(shouldShowTaskInMainExecutionList(task({
      wbs_node_type: 'division',
      standard_task_metadata: { rowProjectionMode: 'schedule_row' },
    }))).toBe(false)
    expect(shouldShowTaskInMainExecutionList(task({
      wbs_node_type: 'sub_division',
      standard_task_metadata: { rowProjectionMode: 'schedule_row' },
    }))).toBe(false)
  })

  it('sorts by execution order before date and WBS fallback', () => {
    const rows = [
      task({
        id: 'later',
        title: '后续任务',
        start_date: '2026-05-01',
        wbs_code: '1.1',
        standard_task_metadata: { executionSortKey: 80_000_001 },
      }),
      task({
        id: 'earlier',
        title: '先行任务',
        start_date: '2026-05-10',
        wbs_code: '9.1',
        standard_task_metadata: { executionSortKey: 20_000_001 },
      }),
      task({
        id: 'fallback',
        title: '无执行键',
        start_date: '2026-04-20',
        wbs_code: '0.1',
      }),
    ].sort(compareTasksByExecutionOrder)

    expect(rows.map((row) => row.id)).toEqual(['earlier', 'later', 'fallback'])
  })

  it('normalizes execution view indentation after division summaries are removed', () => {
    expect(getTaskExecutionDisplayDepth(task({ wbs_node_type: 'item_work', depth: 3 }))).toBe(1)
    expect(getTaskExecutionDisplayDepth(task({ wbs_node_type: 'process', depth: 4 }))).toBe(2)
    expect(getTaskExecutionDisplayDepth(task({ wbs_node_type: 'activity_step', depth: 5 }))).toBe(3)
  })

  it('prefers backend statusDerivation when rendering Gantt business status', () => {
    const display = getGanttBusinessStatusDisplay(
      task({
        status: 'in_progress',
        displayStatus: undefined,
        businessStatus: undefined,
        statusDerivation: {
          businessStatus: { status: 'blocked_by_obstacle', label: '受阻' },
        },
      }),
      { taskConditionMap: {}, obstacleCountMap: {} },
    )

    expect(display).toEqual({
      label: '受阻',
      cls: 'bg-red-100 text-red-700 border border-red-200',
      badge: undefined,
    })
  })

  it('uses backend dueStatus before local end date when rendering Gantt overdue badges', () => {
    const display = getGanttBusinessStatusDisplay(
      task({
        status: 'in_progress',
        end_date: '2020-01-01',
        statusDerivation: {
          businessStatus: { status: 'in_progress', label: '进行中' },
          dueStatus: {
            status: 'normal',
            label: '正常',
            duration: {
              value: 5,
              unit: 'calendar_day',
              calendarRef: 'gregorian',
              calendarVersion: 'ISO-8601',
              timezone: 'Asia/Shanghai',
              asOf: '2026-07-20',
              availability: 'available',
              unavailableReason: null,
            },
          },
        },
      }),
      { taskConditionMap: {}, obstacleCountMap: {} },
    )

    expect(display.badge).toBeUndefined()
  })
})
