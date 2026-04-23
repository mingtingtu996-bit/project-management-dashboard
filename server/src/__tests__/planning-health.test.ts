import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateMilestoneIntegrityRows } from '../services/milestoneIntegrityService.js'
import { scorePlanningHealth } from '../services/planningHealthService.js'
import { evaluatePlanningIntegritySnapshot } from '../services/planningIntegrityService.js'
import { detectPassiveReorderWindows } from '../services/systemAnomalyService.js'

function readServerFile(...segments: string[]) {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('planning health contract', () => {
  it('builds an M1-M9 milestone integrity view with stable output shape', () => {
    const milestones = Array.from({ length: 9 }, (_, index) => ({
      id: `milestone-${index + 1}`,
      project_id: 'project-1',
      name: `M${index + 1}`,
      title: `M${index + 1} milestone`,
      target_date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      baseline_date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      current_plan_date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      actual_date: index === 0 ? '2026-04-01T00:00:00.000Z' : null,
      completed_at: null,
      status: index === 0 ? 'completed' : 'in_progress',
      completion_rate: index === 0 ? 100 : 0,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      version: 1,
    })) as any

    const report = evaluateMilestoneIntegrityRows('project-1', milestones)

    expect(report.project_id).toBe('project-1')
    expect(report.items).toHaveLength(9)
    expect(report.items.map((item) => item.milestone_key)).toEqual([
      'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9',
    ])
    expect(report.summary.total).toBe(9)
    expect(report.summary.aligned).toBe(9)
  })

  it('keeps passive reorder detection in 3/5/7 day sliding windows with threshold-based triggers', () => {
    const report = detectPassiveReorderWindows(
      'project-1',
      Array.from({ length: 10 }, (_, index) => ({
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: index < 3 ? `key-task-${index + 1}` : `task-${index + 1}`,
        field_name: 'planned_end_date',
        created_at: index < 5 ? '2026-04-13T08:00:00.000Z' : '2026-04-12T08:00:00.000Z',
        old_value: '2026-04-01T00:00:00.000Z',
        new_value: '2026-04-09T00:00:00.000Z',
      })),
      new Date('2026-04-14T08:00:00.000Z'),
      { keyTaskIds: ['key-task-1', 'key-task-2', 'key-task-3'] },
    )

    expect(report.windows).toEqual([
      expect.objectContaining({
        window_days: 3,
        event_count: 10,
        affected_task_count: 10,
        cumulative_event_count: 10,
        triggered: true,
        average_offset_days: 8,
        key_task_count: 3,
      }),
      expect.objectContaining({
        window_days: 5,
        event_count: 10,
        affected_task_count: 10,
        cumulative_event_count: 10,
        triggered: true,
        average_offset_days: 8,
        key_task_count: 3,
      }),
      expect.objectContaining({
        window_days: 7,
        event_count: 10,
        affected_task_count: 10,
        cumulative_event_count: 10,
        triggered: true,
        average_offset_days: 8,
        key_task_count: 3,
      }),
    ])
  })

  it('does not trigger passive reorder on small churn', () => {
    const report = detectPassiveReorderWindows(
      'project-1',
      [
        {
          project_id: 'project-1',
          entity_type: 'task',
          entity_id: 'task-1',
          field_name: 'planned_end_date',
          created_at: '2026-04-13T08:00:00.000Z',
          old_value: '2026-04-01T00:00:00.000Z',
          new_value: '2026-04-02T00:00:00.000Z',
        },
      ],
      new Date('2026-04-14T08:00:00.000Z'),
    )

    expect(report.windows.every((window) => window.triggered === false)).toBe(true)
    expect(report.windows.every((window) => window.key_task_count === 0)).toBe(true)
  })

  it('aggregates data integrity, mapping integrity and system consistency into one report', () => {
    const integrity = evaluatePlanningIntegritySnapshot({
      project_id: 'project-1',
      tasks: [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'Task 1',
          status: 'in_progress',
          progress: 40,
          participant_unit_id: null,
          responsible_unit: '',
          assignee_unit: '',
          specialty_type: null,
          phase_id: null,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
          version: 1,
        },
      ] as any,
      milestones: [
        {
          id: 'milestone-1',
          project_id: 'project-1',
          name: 'M1',
          title: 'M1 milestone',
          target_date: '2026-04-05',
          baseline_date: '2026-04-05',
          current_plan_date: '2026-04-06',
          actual_date: '2026-04-07T00:00:00.000Z',
          completed_at: '2026-04-07T00:00:00.000Z',
          status: 'completed',
          completion_rate: 0,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
          version: 1,
        },
      ] as any,
      baseline_items: [
        { id: 'baseline-item-1', mapping_status: 'pending' },
        { id: 'baseline-item-2', mapping_status: 'merged' },
      ] as any,
      monthly_plan_items: [
        { id: 'monthly-item-1', commitment_status: 'carried_over' },
      ] as any,
      snapshots: [
        { id: 'snapshot-1', task_id: 'task-1', progress: 30, snapshot_date: '2026-04-01T00:00:00.000Z', created_at: '2026-04-01T00:00:00.000Z' },
      ] as any,
      change_logs: [
        { project_id: 'project-1', entity_type: 'task', entity_id: 'task-1', field_name: 'planned_end_date', created_at: '2026-04-13T08:00:00.000Z' },
      ] as any,
    })

    expect(integrity.milestone_integrity.items).toHaveLength(1)
    expect(integrity.data_integrity).toMatchObject({
      total_tasks: 1,
      missing_participant_unit_count: 1,
      missing_scope_dimension_count: 1,
      missing_progress_snapshot_count: 0,
    })
    expect(integrity.mapping_integrity).toMatchObject({
      baseline_pending_count: 1,
      baseline_merged_count: 1,
      monthly_carryover_count: 1,
    })
    expect(integrity.system_consistency.inconsistent_milestones).toBe(1)
    expect(integrity.passive_reorder.total_events).toBe(1)
  })

  it('converts integrity sections into a planning health score', () => {
    const integrity = evaluatePlanningIntegritySnapshot({
      project_id: 'project-1',
      tasks: [],
      milestones: [],
      baseline_items: [],
      monthly_plan_items: [],
      snapshots: [],
      change_logs: [],
    })

    const health = scorePlanningHealth(integrity)
    expect(health.project_id).toBe('project-1')
    expect(health.breakdown.total_score).toBe(health.score)
    expect(['healthy', 'warning', 'critical']).toContain(health.status)
    expect(['健康', '亚健康', '危险']).toContain(health.label)
  })

  it('locks the async trigger and scheduler contracts in source text', () => {
    const tasksRouteSource = readServerFile('src', 'routes', 'tasks.ts')
    expect(tasksRouteSource).toContain('updateTaskInMainChain(')
    expect(tasksRouteSource).toContain('closeTaskInMainChain(')
    expect(tasksRouteSource).toContain('reopenTaskInMainChain(')

    const taskWriteChainSource = readServerFile('src', 'services', 'taskWriteChainService.ts')
    expect(taskWriteChainSource).toContain('enqueuePassiveReorderDetection(')
    expect(taskWriteChainSource).toContain('SystemAnomalyService')
    expect(taskWriteChainSource).toContain('warningService.evaluate({')
    expect(taskWriteChainSource).toContain('closeDelaySourceRisksForCompletedTask')

    const governanceSource = readServerFile('src', 'services', 'planningGovernanceService.ts')
    expect(governanceSource).toContain('closeout_reminder')
    expect(governanceSource).toContain('reorder_summary')
    expect(governanceSource).toContain('ad_hoc_cross_month_reminder')
    expect(governanceSource).toContain('mapping_orphan_pointer')
    expect(governanceSource).toContain('milestone_blocked')
    expect(governanceSource).toContain('milestone_missing_data')
    expect(governanceSource).toContain('milestone_needs_attention')

    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('PlanningGovernanceJob')
    expect(schedulerSource).toContain('planningGovernanceJob.start()')
    expect(schedulerSource).toContain('planningGovernanceJob.stop()')
    expect(schedulerSource).toContain('daily_01_00')
    expect(schedulerSource).toContain('notifications_written')
    expect(schedulerSource).toContain('closeout_notifications')
    expect(schedulerSource).toContain('reorder_notifications')
    expect(schedulerSource).toContain('ad_hoc_notifications')
  })
})
