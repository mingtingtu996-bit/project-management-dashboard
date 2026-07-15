import { beforeEach, describe, expect, it, vi } from 'vitest'

const ids = {
  project: '11111111-1111-4111-8111-111111111111',
  task: '22222222-2222-4222-8222-222222222222',
  materialA: '33333333-3333-4333-8333-333333333333',
  materialB: '44444444-4444-4444-8444-444444444444',
}

const state = vi.hoisted(() => ({
  conditions: [] as Array<Record<string, unknown>>,
  materials: [] as Array<Record<string, unknown>>,
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM public.task_conditions')) {
      const projectId = String(params[0] ?? '')
      const taskId = String(params[1] ?? '')
      return {
        rows: state.conditions.filter((row) => row.project_id === projectId && row.task_id === taskId),
        rowCount: state.conditions.length,
      }
    }

    if (sql.includes('FROM public.project_materials')) {
      const projectId = String(params[0] ?? '')
      const materialIds = new Set(params[1] as string[])
      return {
        rows: state.materials.filter((row) =>
          row.project_id === projectId
          && materialIds.has(String(row.id))
          && (row.record_status ?? 'active') === 'active',
        ),
        rowCount: state.materials.length,
      }
    }

    if (sql.includes('UPDATE public.project_materials')) {
      const projectId = String(params[0] ?? '')
      const materialIds = new Set(params[1] as string[])
      const nextStatus = String(params[2] ?? '')
      let rowCount = 0
      for (const row of state.materials) {
        if (row.project_id === projectId && materialIds.has(String(row.id)) && (row.record_status ?? 'active') === 'active') {
          row.lifecycle_status = nextStatus
          rowCount += 1
        }
      }
      return { rows: [], rowCount }
    }

    return { rows: [], rowCount: 0 }
  }),
  writeLogs: vi.fn(async () => undefined),
}))

vi.mock('../database.js', () => ({
  query: state.query,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLogs: state.writeLogs,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { applyTaskMaterialLifecycleFeedback } from '../services/materialTaskFeedbackService.js'

describe('materialTaskFeedbackService', () => {
  beforeEach(() => {
    state.conditions.splice(0, state.conditions.length)
    state.materials.splice(0, state.materials.length)
    vi.clearAllMocks()
  })

  it('marks explicitly linked active materials as used when a task starts', async () => {
    state.conditions.push(
      {
        project_id: ids.project,
        task_id: ids.task,
        source_type: 'material',
        source_ref_id: ids.materialA,
        source_entity_id: null,
      },
      {
        project_id: ids.project,
        task_id: ids.task,
        source_type: null,
        source_ref_id: null,
        source_entity_type: 'project_material',
        source_entity_id: ids.materialB,
      },
    )
    state.materials.push(
      { id: ids.materialA, project_id: ids.project, lifecycle_status: 'arrived', record_status: 'active' },
      { id: ids.materialB, project_id: ids.project, lifecycle_status: 'active', record_status: 'active' },
    )

    const result = await applyTaskMaterialLifecycleFeedback({
      previousTask: { id: ids.task, project_id: ids.project, status: 'todo', progress: 0, title: 'task', priority: 'medium', version: 1, created_at: '', updated_at: '' },
      task: { id: ids.task, project_id: ids.project, status: 'in_progress', progress: 1, title: 'task', priority: 'medium', version: 2, created_at: '', updated_at: '' },
      actorId: '55555555-5555-4555-8555-555555555555',
    })

    expect(result).toMatchObject({ event: 'task_started', updatedCount: 2 })
    expect(state.materials.map((row) => row.lifecycle_status)).toEqual(['used', 'used'])
    expect(state.writeLogs).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        entity_type: 'project_material',
        entity_id: ids.materialA,
        field_name: 'lifecycle_status',
        old_value: 'arrived',
        new_value: 'used',
        change_reason: 'task_started',
      }),
    ]))
  })

  it('marks explicitly linked materials as consumed when a task completes', async () => {
    state.conditions.push({
      project_id: ids.project,
      task_id: ids.task,
      source_type: 'material',
      source_ref_id: ids.materialA,
    })
    state.materials.push({ id: ids.materialA, project_id: ids.project, lifecycle_status: 'used', record_status: 'active' })

    const result = await applyTaskMaterialLifecycleFeedback({
      previousTask: { id: ids.task, project_id: ids.project, status: 'in_progress', progress: 60, title: 'task', priority: 'medium', version: 1, created_at: '', updated_at: '' },
      task: { id: ids.task, project_id: ids.project, status: 'completed', progress: 100, title: 'task', priority: 'medium', version: 2, created_at: '', updated_at: '' },
    })

    expect(result).toMatchObject({ event: 'task_completed', updatedCount: 1, materialIds: [ids.materialA] })
    expect(state.materials[0]?.lifecycle_status).toBe('consumed')
  })

  it('moves consumed linked materials back to used when a completed task is reopened', async () => {
    state.conditions.push({
      project_id: ids.project,
      task_id: ids.task,
      source_type: 'material',
      source_ref_id: ids.materialA,
    })
    state.materials.push({ id: ids.materialA, project_id: ids.project, lifecycle_status: 'consumed', record_status: 'active' })

    const result = await applyTaskMaterialLifecycleFeedback({
      previousTask: { id: ids.task, project_id: ids.project, status: 'completed', progress: 100, title: 'task', priority: 'medium', version: 1, created_at: '', updated_at: '', actual_end_date: '2026-06-06' },
      task: { id: ids.task, project_id: ids.project, status: 'in_progress', progress: 80, title: 'task', priority: 'medium', version: 2, created_at: '', updated_at: '', actual_end_date: null },
      actorId: '55555555-5555-4555-8555-555555555555',
    })

    expect(result).toMatchObject({ event: 'task_reopened', updatedCount: 1, materialIds: [ids.materialA] })
    expect(state.materials[0]?.lifecycle_status).toBe('used')
    expect(state.writeLogs).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        entity_type: 'project_material',
        entity_id: ids.materialA,
        field_name: 'lifecycle_status',
        old_value: 'consumed',
        new_value: 'used',
        change_reason: 'task_reopened',
      }),
    ]))
  })

  it('does not infer material usage from participant-unit-only conditions', async () => {
    state.conditions.push({
      project_id: ids.project,
      task_id: ids.task,
      participant_unit_id: 'unit-1',
    })
    state.materials.push({ id: ids.materialA, project_id: ids.project, lifecycle_status: 'arrived', record_status: 'active' })

    const result = await applyTaskMaterialLifecycleFeedback({
      previousTask: { id: ids.task, project_id: ids.project, status: 'todo', progress: 0, title: 'task', priority: 'medium', version: 1, created_at: '', updated_at: '' },
      task: { id: ids.task, project_id: ids.project, status: 'in_progress', progress: 1, title: 'task', priority: 'medium', version: 2, created_at: '', updated_at: '' },
    })

    expect(result.updatedCount).toBe(0)
    expect(state.materials[0]?.lifecycle_status).toBe('arrived')
    expect(state.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE public.project_materials'))).toBe(false)
  })
})
