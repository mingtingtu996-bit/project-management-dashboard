import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectPassiveReorderWindows } from '../services/systemAnomalyService.js'
import { scorePlanningHealth } from '../services/planningHealthService.js'
import { evaluatePlanningIntegritySnapshot } from '../services/planningIntegrityService.js'

function readServerFile(...segments: string[]) {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

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

  it('does not treat valid monthly carryover as a daily mapping issue', () => {
    const integrity = evaluatePlanningIntegritySnapshot({
      project_id: 'project-2',
      tasks: [],
      milestones: [],
      baseline_items: [],
      monthly_plan_items: [
        { id: 'monthly-previous', commitment_status: 'completed' },
        { id: 'monthly-valid-carryover', commitment_status: 'carried_over', carryover_from_item_id: 'monthly-previous' },
        { id: 'monthly-task-derived', commitment_status: 'carried_over', source_task_id: 'task-1' },
      ],
      snapshots: [],
      change_logs: [],
    })

    expect(integrity.mapping_integrity.monthly_carryover_count).toBe(0)
  })

  it('counts only orphan monthly carryover as a mapping issue', () => {
    const integrity = evaluatePlanningIntegritySnapshot({
      project_id: 'project-2',
      tasks: [],
      milestones: [],
      baseline_items: [],
      monthly_plan_items: [
        { id: 'monthly-orphan-carryover', commitment_status: 'carried_over', carryover_from_item_id: 'missing-monthly-item' },
      ],
      snapshots: [],
      change_logs: [],
    })

    expect(integrity.mapping_integrity.monthly_carryover_count).toBe(1)
  })

  it('counts progress completeness and stale snapshots only for executable tasks using the latest snapshot', () => {
    const integrity = evaluatePlanningIntegritySnapshot({
      project_id: 'project-2',
      tasks: [
        {
          id: 'summary-row',
          project_id: 'project-2',
          title: 'Summary row',
          status: 'not_started',
          participant_unit_id: null,
          wbs_node_type: 'section',
          is_executable: false,
        },
        {
          id: 'executable-with-fresh-latest',
          project_id: 'project-2',
          title: 'Executable task with fresh latest snapshot',
          status: 'in_progress',
          participant_unit_id: 'unit-1',
          building_object_id: 'building-1',
          wbs_node_type: 'process',
          is_executable: true,
        },
        {
          id: 'executable-without-snapshot',
          project_id: 'project-2',
          title: 'Executable task without snapshot',
          status: 'in_progress',
          participant_unit_id: 'unit-1',
          building_object_id: 'building-1',
          wbs_node_type: 'task',
          is_executable: true,
        },
      ],
      milestones: [],
      baseline_items: [],
      monthly_plan_items: [],
      snapshots: [
        {
          id: 'old-snapshot',
          task_id: 'executable-with-fresh-latest',
          progress: 20,
          snapshot_date: '2026-01-01T00:00:00.000Z',
          created_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'fresh-snapshot',
          task_id: 'executable-with-fresh-latest',
          progress: 40,
          snapshot_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
      change_logs: [],
    })

    expect(integrity.data_integrity.total_tasks).toBe(2)
    expect(integrity.data_integrity.missing_participant_unit_count).toBe(0)
    expect(integrity.data_integrity.missing_scope_dimension_count).toBe(0)
    expect(integrity.data_integrity.missing_progress_snapshot_count).toBe(1)
    expect(integrity.system_consistency.stale_snapshot_count).toBe(0)
  })

  it('keeps production table reads on fixed SQL branches instead of dynamic query arguments', () => {
    const source = readServerFile('src', 'services', 'planningIntegrityService.ts')
    const loaderStart = source.indexOf('function loadProductionProjectTableRowsByName')
    const loaderEnd = source.indexOf('async function loadProjectTableRows', loaderStart)
    const productionLoader = source.slice(loaderStart, loaderEnd)

    expect(loaderStart).toBeGreaterThanOrEqual(0)
    expect(loaderEnd).toBeGreaterThan(loaderStart)
    expect(productionLoader).not.toContain('productionSql')
    expect(productionLoader).not.toMatch(/rawQuery\(\s*[A-Za-z_$][\w$]*\s*,/)
    expect(productionLoader).toMatch(/case 'tasks':[\s\S]*?FROM public\.tasks[\s\S]*?WHERE project_id = \$1/)
    expect(productionLoader).toMatch(
      /case 'milestones':[\s\S]*?FROM public\.tasks[\s\S]*?WHERE project_id = \$1 AND is_milestone IS TRUE/,
    )
    expect(productionLoader).not.toContain('public.milestones')
    expect(productionLoader).toContain("rawQuery('SELECT * FROM public.task_baseline_items WHERE project_id = $1'")
    expect(productionLoader).toContain("rawQuery('SELECT * FROM public.monthly_plan_items WHERE project_id = $1'")
  })
})
