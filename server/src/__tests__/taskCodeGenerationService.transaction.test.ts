import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const supabase = {
    from: vi.fn((table: string) => {
      throw new Error(`non-transactional supabase access: ${table}`)
    }),
    rpc: vi.fn((name: string) => {
      throw new Error(`non-transactional supabase rpc: ${name}`)
    }),
  }
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

      if (normalized.startsWith('select * from project_task_code_rules')) {
        return {
          rows: [{
            id: 'rule-1',
            rule_version: 'v1',
            delimiter: '-',
            sequence_length: 3,
            include_project: true,
            include_phase: true,
            include_section: true,
            include_building: true,
            include_floor: true,
            include_zone: true,
            include_professional: false,
            include_work_code: true,
            enabled: true,
          }],
          rowCount: 1,
        }
      }

      if (normalized.startsWith('select project_code from projects')) {
        return { rows: [{ project_code: 'PRJ001' }], rowCount: 1 }
      }

      if (normalized.startsWith('select id, object_code from engineering_objects')) {
        return { rows: [{ id: 'building-1', object_code: 'B01' }], rowCount: 1 }
      }

      if (normalized.startsWith('insert into task_code_sequences')) {
        return { rows: [], rowCount: 1 }
      }

      if (normalized.startsWith('select current_value from task_code_sequences')) {
        return { rows: [{ current_value: 7 }], rowCount: 1 }
      }

      if (normalized.startsWith('update task_code_sequences')) {
        return { rows: [], rowCount: 1 }
      }

      throw new Error(`unexpected query: ${sql}`)
    }),
  }
  return { client, queries, supabase }
})

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

describe('transactional task code generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.queries.splice(0, state.queries.length)
    state.client.query.mockClear()
  })

  it('uses only the supplied transaction client while reading rules and generating a code', async () => {
    const { generateTaskCodeInTransaction } = await import('../services/taskCodeGenerationService.js')

    const code = await generateTaskCodeInTransaction(state.client, {
      projectId: 'project-1',
      buildingObjectId: 'building-1',
      standardWorkCode: 'WORK',
    })

    expect(code).toBe('PRJ001-B01-WORK-008')
    expect(state.supabase.from).not.toHaveBeenCalled()
    expect(state.supabase.rpc).not.toHaveBeenCalled()
    expect(state.queries.some((entry) => /from\s+project_task_code_rules/i.test(entry.sql))).toBe(true)
  })

  it('re-reads project_code when a concurrent transaction wins project code generation', async () => {
    const calls: string[] = []
    const client = {
      query: vi.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
        calls.push(normalized)

        if (normalized.startsWith('select project_code from projects')) {
          const selectCount = calls.filter((item) => item.startsWith('select project_code from projects')).length
          return {
            rows: [{ project_code: selectCount === 1 ? null : 'PRJ777' }],
            rowCount: 1,
          }
        }

        if (normalized.startsWith("select nextval('project_code_seq')")) {
          return { rows: [{ val: 777 }], rowCount: 1 }
        }

        if (normalized.startsWith('update projects set project_code')) {
          return { rows: [], rowCount: 0 }
        }

        throw new Error(`unexpected query: ${sql}`)
      }),
    }
    const { ensureProjectCodeInTransaction } = await import('../services/taskCodeGenerationService.js')

    await expect(ensureProjectCodeInTransaction(client, 'project-1')).resolves.toBe('PRJ777')

    expect(calls.filter((item) => item.startsWith('select project_code from projects'))).toHaveLength(2)
  })
})
