import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

const state = vi.hoisted(() => {
  const projectMaterials: Array<Record<string, unknown>> = []
  const participantUnits: Array<Record<string, unknown>> = []
  const tasks: Array<Record<string, unknown>> = []
  const taskConditions: Array<Record<string, unknown>> = []
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    const projectId = String(params[0] ?? '')
    let rows: Array<Record<string, unknown>> = []

    if (normalized.includes('from project_materials')) {
      rows = projectMaterials.filter((row) => row.project_id === projectId && row.record_status === 'active')
    } else if (normalized.includes('from participant_units')) {
      const ids = Array.isArray(params[1]) ? params[1].map(String) : []
      rows = participantUnits.filter((row) => row.project_id === projectId && ids.includes(String(row.id)))
    } else if (normalized.includes('from task_conditions')) {
      const materialIds = Array.isArray(params[1]) ? params[1].map(String) : []
      rows = taskConditions.filter((row) => {
        if (row.project_id !== projectId) return false
        return materialIds.includes(String(row.source_ref_id ?? row.source_entity_id ?? ''))
      })
    } else if (normalized.includes('from tasks')) {
      const ids = Array.isArray(params[1]) ? params[1].map(String) : []
      rows = tasks.filter((row) => {
        if (row.project_id !== projectId) return false
        if (normalized.includes('participant_unit_id::text = any')) return ids.includes(String(row.participant_unit_id))
        if (normalized.includes('id::text = any')) return ids.includes(String(row.id))
        return true
      })
    }

    return { rows, rowCount: rows.length }
  })

  return {
    projectMaterials,
    participantUnits,
    tasks,
    taskConditions,
    query,
  }
})

vi.mock('../database.js', () => ({
  query: state.query,
}))

const {
  buildMaterialReportSummary,
  clearMaterialReportCache,
  listProjectMaterials,
} = await import('../services/materialReportsService.js')

describe('materialReportsService', () => {
  beforeEach(() => {
    state.projectMaterials.splice(0, state.projectMaterials.length)
    state.participantUnits.splice(0, state.participantUnits.length)
    state.tasks.splice(0, state.tasks.length)
    state.taskConditions.splice(0, state.taskConditions.length)
    clearMaterialReportCache('project-1')
    vi.clearAllMocks()
  })

  it('links tasks through the canonical title column', async () => {
    state.projectMaterials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      material_name: '铝板',
      specialty_type: '幕墙',
      requires_sample_confirmation: true,
      sample_confirmed: false,
      record_status: 'active',
      expected_arrival_date: '2026-04-25',
      actual_arrival_date: null,
      requires_inspection: true,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z',
    })
    state.participantUnits.push({
      id: 'unit-1',
      project_id: 'project-1',
      unit_name: '幕墙单位',
    })
    state.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      title: '幕墙龙骨安装',
      planned_start_date: '2026-04-28',
      start_date: null,
      status: 'pending',
    })
    const rows = await listProjectMaterials('project-1')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'material-1',
      participant_unit_id: 'unit-1',
      participant_unit_name: '幕墙单位',
      linked_task_id: 'task-1',
      linked_task_title: '幕墙龙骨安装',
      linked_task_start_date: '2026-04-28',
      linked_task_status: 'pending',
      linked_task_buffer_days: 3,
    })
    const taskQueries = state.query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => /from\s+tasks/i.test(sql))
    expect(taskQueries).not.toHaveLength(0)
    expect(taskQueries.every((sql) => !/\bname\b/i.test(sql))).toBe(true)
  })

  it('uses project_material source entity task conditions as explicit material links', async () => {
    state.projectMaterials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      material_name: 'Panel',
      specialty_type: 'facade',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      record_status: 'active',
      expected_arrival_date: '2026-04-25',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z',
    })
    state.tasks.push(
      {
        id: 'fallback-task',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        title: 'Fallback task',
        planned_start_date: '2026-04-28',
        start_date: null,
        status: 'pending',
      },
      {
        id: 'explicit-task',
        project_id: 'project-1',
        participant_unit_id: 'unit-2',
        title: 'Explicit material task',
        planned_start_date: '2026-04-26',
        start_date: null,
        status: 'not_started',
      },
    )
    state.taskConditions.push({
      project_id: 'project-1',
      task_id: 'explicit-task',
      source_ref_id: null,
      source_type: null,
      source_entity_type: 'project_material',
      source_entity_id: 'material-1',
    })

    const rows = await listProjectMaterials('project-1')

    expect(rows[0]).toMatchObject({
      linked_task_id: 'explicit-task',
      linked_task_title: 'Explicit material task',
      linked_task_start_date: '2026-04-26',
      linked_task_status: 'not_started',
      linked_task_buffer_days: 1,
    })
  })

  it('returns category distribution for the materials summary pie chart', async () => {
    const baseRow = {
      project_id: 'project-1',
      participant_unit_id: null,
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-25',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      record_status: 'active',
      version: 1,
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z',
    }

    state.projectMaterials.push(
      { ...baseRow, id: 'material-steel', material_name: '钢筋', specialty_type: '主体结构' },
      { ...baseRow, id: 'material-concrete', material_name: 'C30混凝土', specialty_type: '主体结构' },
      { ...baseRow, id: 'material-pipe', material_name: 'PVC排水管', specialty_type: '给排水' },
      { ...baseRow, id: 'material-electric', material_name: '电缆桥架', specialty_type: '电气' },
      { ...baseRow, id: 'material-other', material_name: '成品木门', specialty_type: '装饰' },
    )

    const summary = await buildMaterialReportSummary('project-1')

    expect(summary.byCategory).toEqual([
      { category: '钢材', count: 1, percentage: 20 },
      { category: '混凝土', count: 1, percentage: 20 },
      { category: '管材', count: 1, percentage: 20 },
      { category: '电气', count: 1, percentage: 20 },
      { category: '其他', count: 1, percentage: 20 },
    ])
  })
})
