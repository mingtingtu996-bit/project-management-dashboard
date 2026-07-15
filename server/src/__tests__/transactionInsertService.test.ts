import { describe, expect, it, vi } from 'vitest'
import { insertRows, insertRowsReturning } from '../services/transactionInsertService.js'

describe('transaction insert service', () => {
  it('supports bulk insert without returning large rows', async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 2 })),
    }

    const rowCount = await insertRows(client, 'task_baseline_items', [
      {
        id: 'item-1',
        project_id: 'project-1',
        generation_metadata: { large: 'metadata' },
      },
      {
        id: 'item-2',
        project_id: 'project-1',
        generation_metadata: { large: 'metadata' },
      },
    ])

    expect(rowCount).toBe(2)
    expect(client.query).toHaveBeenCalledTimes(1)
    const [sql, values] = client.query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('INSERT INTO "task_baseline_items"')
    expect(sql).not.toContain('RETURNING')
    expect(values).toEqual([
      'item-1',
      'project-1',
      { large: 'metadata' },
      'item-2',
      'project-1',
      { large: 'metadata' },
    ])
  })

  it('stringifies opt-in json columns before returning bulk insert rows', async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [{ id: 'item-1' }], rowCount: 1 })),
    }

    await insertRowsReturning(client, 'task_baseline_items', [
      {
        id: 'item-1',
        project_id: 'project-1',
        scope_snapshot: { building: 'A' },
        seed_versions: [{ seed_version_id: 'seed-1', source: 'calendar' }],
      },
    ], {
      jsonColumns: ['scope_snapshot', 'seed_versions'],
    })

    const [sql, values] = client.query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('INSERT INTO "task_baseline_items"')
    expect(sql).toContain('RETURNING *')
    expect(values).toEqual([
      'item-1',
      'project-1',
      '{"building":"A"}',
      '[{"seed_version_id":"seed-1","source":"calendar"}]',
    ])
  })
})
