import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

type Filter = {
  type: 'eq' | 'in'
  column: string
  value: unknown
}

const state = vi.hoisted(() => {
  const projectMaterials: Array<Record<string, unknown>> = []
  const participantUnits: Array<Record<string, unknown>> = []
  const tasks: Array<Record<string, unknown>> = []
  const taskSelects: string[] = []
  let failTaskNameColumnOnce = false

  const matchesFilters = (row: Record<string, unknown>, filters: Filter[]) =>
    filters.every((filter) => {
      if (filter.type === 'eq') return row[filter.column] === filter.value
      if (!Array.isArray(filter.value)) return false
      return filter.value.includes(row[filter.column])
    })

  class QueryBuilder {
    private table: string
    private filters: Filter[] = []
    private selected = '*'

    constructor(table: string) {
      this.table = table
    }

    select(columns: string) {
      this.selected = columns
      return this
    }

    eq(column: string, value: unknown) {
      this.filters.push({ type: 'eq', column, value })
      return this
    }

    in(column: string, value: unknown[]) {
      this.filters.push({ type: 'in', column, value })
      return this
    }

    order() {
      return this
    }

    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(this.execute()).then(resolve, reject)
    }

    private execute() {
      if (this.table === 'project_materials') {
        return {
          data: projectMaterials.filter((row) => matchesFilters(row, this.filters)),
          error: null,
        }
      }

      if (this.table === 'participant_units') {
        return {
          data: participantUnits.filter((row) => matchesFilters(row, this.filters)),
          error: null,
        }
      }

      if (this.table === 'tasks') {
        taskSelects.push(this.selected)
        if (failTaskNameColumnOnce && this.selected.includes('name')) {
          failTaskNameColumnOnce = false
          return {
            data: null,
            error: {
              code: '42703',
              message: 'column tasks.name does not exist',
            },
          }
        }
        return {
          data: tasks.filter((row) => matchesFilters(row, this.filters)),
          error: null,
        }
      }

      return { data: [], error: null }
    }
  }

  return {
    projectMaterials,
    participantUnits,
    tasks,
    taskSelects,
    get failTaskNameColumnOnce() {
      return failTaskNameColumnOnce
    },
    set failTaskNameColumnOnce(value: boolean) {
      failTaskNameColumnOnce = value
    },
    supabase: {
      from: vi.fn((table: string) => new QueryBuilder(table)),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
}))

const { listProjectMaterials } = await import('../services/materialReportsService.js')

describe('materialReportsService', () => {
  beforeEach(() => {
    state.projectMaterials.splice(0, state.projectMaterials.length)
    state.participantUnits.splice(0, state.participantUnits.length)
    state.tasks.splice(0, state.tasks.length)
    state.taskSelects.splice(0, state.taskSelects.length)
    state.failTaskNameColumnOnce = false
    vi.clearAllMocks()
  })

  it('retries task linking without the missing name column', async () => {
    state.projectMaterials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      material_name: '铝板',
      specialty_type: '幕墙',
      requires_sample_confirmation: true,
      sample_confirmed: false,
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
    state.failTaskNameColumnOnce = true

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
    expect(state.taskSelects).toHaveLength(2)
    expect(state.taskSelects[0]).toContain('name')
    expect(state.taskSelects[1]).not.toContain('name')
  })
})
