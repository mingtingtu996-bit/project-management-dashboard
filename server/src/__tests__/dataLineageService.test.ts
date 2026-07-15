import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { recordLineageInTransaction } from '../services/dataLineageService.js'

vi.mock('../database.js', () => ({
  query: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('dataLineageService', () => {
  it('keeps lineage record-existence checks on code-owned SQL templates', () => {
    const source = readFileSync(
      resolve(fileURLToPath(new URL('..', import.meta.url)), 'services', 'dataLineageService.ts'),
      'utf8',
    )

    expect(source).not.toContain('FROM public.${tableName}')
    expect(source).not.toContain('SELECT ${idColumn}')
    expect(source).toContain('LINEAGE_ENTITY_RECORD_CHECKS')
  })

  it('writes lineage events with the schema-backed changed_at column', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })

        if (sql.includes('FROM data_lineage_entity_types')) {
          return {
            rows: [
              {
                entity_type: params?.[0],
                table_name: null,
                id_column: 'id',
                project_id_column: 'project_id',
                is_project_scoped: true,
                is_global_reference: false,
                is_business_lineage_allowed: true,
              },
            ],
          }
        }

        if (sql.includes('FROM data_lineage_relation_rules')) {
          return { rows: [{ exists: 1 }] }
        }

        return { rows: [], rowCount: 1 }
      }),
    }

    await recordLineageInTransaction(client, {
      projectId: 'project-1',
      sourceEntityType: 'task',
      sourceEntityId: 'task-1',
      relationType: 'generates',
      targetEntityType: 'task_baseline_item',
      targetEntityId: 'baseline-item-1',
    })

    const eventInsert = queries.find((entry) => entry.sql.includes('INSERT INTO data_lineage_events'))

    expect(eventInsert?.sql).toContain('changed_at')
    expect(eventInsert?.sql).not.toContain('created_at')
  })

  it('reuses an existing active lineage link for duplicate source-target pairs', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })

        if (sql.includes('FROM data_lineage_entity_types')) {
          return {
            rows: [
              {
                entity_type: params?.[0],
                table_name: null,
                id_column: 'id',
                project_id_column: 'project_id',
                is_project_scoped: true,
                is_global_reference: false,
                is_business_lineage_allowed: true,
              },
            ],
          }
        }

        if (sql.includes('FROM data_lineage_relation_rules')) {
          return { rows: [{ exists: 1 }] }
        }

        if (sql.includes('INSERT INTO data_lineage_links')) {
          return { rows: [{ id: 'existing-link-id' }], rowCount: 1 }
        }

        return { rows: [], rowCount: 1 }
      }),
    }

    const id = await recordLineageInTransaction(client, {
      projectId: 'project-1',
      sourceEntityType: 'task_dependency',
      sourceEntityId: 'dependency-1',
      relationType: 'depends_on',
      targetEntityType: 'task',
      targetEntityId: 'task-1',
    })

    const linkInsert = queries.find((entry) => entry.sql.includes('INSERT INTO data_lineage_links'))
    const eventInsert = queries.find((entry) => entry.sql.includes('INSERT INTO data_lineage_events'))

    expect(id).toBe('existing-link-id')
    expect(linkInsert?.sql).toContain('ON CONFLICT')
    expect(linkInsert?.sql).toContain("WHERE mapping_status = 'active'")
    expect(linkInsert?.sql).toContain('RETURNING id')
    expect(eventInsert?.params?.[2]).toBe('existing-link-id')
  })
})
