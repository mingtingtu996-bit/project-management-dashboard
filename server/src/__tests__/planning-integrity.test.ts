import { describe, expect, it } from 'vitest'
import { detectPassiveReorderWindows } from '../services/systemAnomalyService.js'
import { scorePlanningHealth } from '../services/planningHealthService.js'
import { evaluatePlanningIntegritySnapshot } from '../services/planningIntegrityService.js'

describe('planning integrity contract', () => {
  it('exposes the shared truth slices without silent success fallbacks', () => {
    const integrity = evaluatePlanningIntegritySnapshot({
      project_id: 'project-2',
      tasks: [],
      milestones: [],
      baseline_items: [],
      monthly_plan_items: [],
      snapshots: [],
      change_logs: [],
    })

    expect(integrity).toHaveProperty('milestone_integrity')
    expect(integrity).toHaveProperty('data_integrity')
    expect(integrity).toHaveProperty('mapping_integrity')
    expect(integrity).toHaveProperty('system_consistency')
    expect(integrity).toHaveProperty('passive_reorder')
    expect(integrity.passive_reorder.windows).toHaveLength(3)
    expect(integrity.passive_reorder.windows.map((window) => window.window_days)).toEqual([3, 5, 7])
  })

  it('thresholds passive reorder by cumulative volume, average offset and key tasks', () => {
    const passiveReorder = detectPassiveReorderWindows(
      'project-2',
      Array.from({ length: 10 }, (_, index) => ({
        project_id: 'project-2',
        entity_type: 'task',
        entity_id: index < 3 ? `key-task-${index + 1}` : `task-${index + 1}`,
        field_name: 'planned_end_date',
        created_at: '2026-04-13T08:00:00.000Z',
        old_value: '2026-04-01T00:00:00.000Z',
        new_value: '2026-04-09T00:00:00.000Z',
      })),
      new Date('2026-04-14T08:00:00.000Z'),
      { keyTaskIds: ['key-task-1', 'key-task-2', 'key-task-3'] },
    )

    expect(passiveReorder.windows.every((window) => window.triggered)).toBe(true)
    expect(passiveReorder.windows.every((window) => window.average_offset_days === 8)).toBe(true)
    expect(passiveReorder.windows.every((window) => window.key_task_count === 3)).toBe(true)

    const health = scorePlanningHealth({
      project_id: 'project-2',
      milestone_integrity: {
        project_id: 'project-2',
        summary: { total: 1, aligned: 1, needs_attention: 0, missing_data: 0, blocked: 0 },
        items: [],
      },
      data_integrity: {
        total_tasks: 1,
        missing_participant_unit_count: 0,
        missing_scope_dimension_count: 0,
        missing_progress_snapshot_count: 0,
      },
      mapping_integrity: {
        baseline_pending_count: 0,
        baseline_merged_count: 0,
        monthly_carryover_count: 0,
      },
      system_consistency: {
        inconsistent_milestones: 0,
        stale_snapshot_count: 0,
      },
      passive_reorder: passiveReorder,
    })

    expect(health.score).toBeLessThan(100)
    expect(health.breakdown.passive_reorder_penalty).toBeGreaterThan(0)
  })

  it('does not trigger passive reorder for a light change set', () => {
    const passiveReorder = detectPassiveReorderWindows(
      'project-2',
      [
        {
          project_id: 'project-2',
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

    expect(passiveReorder.windows.every((window) => window.triggered === false)).toBe(true)
  })
})
