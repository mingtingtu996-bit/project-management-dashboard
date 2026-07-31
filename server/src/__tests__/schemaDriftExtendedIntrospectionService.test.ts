import { describe, expect, it } from 'vitest'

import {
  buildActualExtendedSchemaCatalog,
  introspectActualExtendedSchema,
} from '../services/schemaDriftExtendedIntrospectionService.js'

describe('schemaDriftExtendedIntrospectionService', () => {
  it('maps PostgreSQL catalog rows into stable extended drift keys', () => {
    const catalog = buildActualExtendedSchemaCatalog({
      triggers: [
        {
          schema_name: 'public',
          table_name: 'tasks',
          trigger_name: 'touch_tasks',
          timing: 'BEFORE',
          event: 'UPDATE',
          orientation: 'ROW',
          condition: null,
          action_statement: 'EXECUTE FUNCTION public.touch_tasks()',
        },
        {
          schema_name: 'public',
          table_name: 'tasks',
          trigger_name: 'touch_tasks',
          timing: 'BEFORE',
          event: 'INSERT',
          orientation: 'ROW',
          condition: null,
          action_statement: 'EXECUTE FUNCTION public.touch_tasks()',
        },
      ],
      functions: [
        {
          schema_name: 'public',
          function_name: 'rebuild_plan',
          identity_arguments: 'uuid, jsonb',
          result_type: 'void',
          language: 'plpgsql',
          security_definer: true,
          volatility: 'v',
          body: 'BEGIN\n  RETURN;\nEND;',
        },
      ],
      views: [
        Object.assign({
          schema_name: 'public',
          view_name: 'task_overview',
          materialized: false,
          definition: 'SELECT tasks.id FROM public.tasks;',
        }, { reloptions: ['security_invoker=true'] }),
      ],
      enums: [
        { schema_name: 'public', enum_name: 'task_priority', label: 'low', sort_order: 1 },
        { schema_name: 'public', enum_name: 'task_priority', label: 'high', sort_order: 2 },
      ],
      extensions: [
        { extension_name: 'pgcrypto', schema_name: 'extensions' },
      ],
      grants: [
        {
          object_type: 'table',
          schema_name: 'public',
          object_name: 'tasks',
          identity_arguments: null,
          grantee: 'authenticated',
          privilege: 'SELECT',
        },
        {
          object_type: 'function',
          schema_name: 'public',
          object_name: 'rebuild_plan',
          identity_arguments: 'uuid, jsonb',
          grantee: 'workbuddy_runtime',
          privilege: 'EXECUTE',
        },
        {
          object_type: 'default_table',
          schema_name: 'public',
          object_name: '*',
          identity_arguments: null,
          grantee: 'workbuddy_runtime',
          privilege: 'SELECT',
        },
      ],
    })

    expect(catalog.triggers).toEqual([
      expect.objectContaining({
        key: 'public.tasks.touch_tasks',
        events: ['insert', 'update'],
        functionName: 'public.touch_tasks',
      }),
    ])
    expect(catalog.functions).toEqual([
      expect.objectContaining({
        key: 'public.rebuild_plan(uuid, jsonb)',
        volatility: 'volatile',
      }),
    ])
    expect(catalog.views).toEqual([
      expect.objectContaining({
        key: 'public.task_overview',
        materialized: false,
        options: ['security_invoker = true'],
      }),
    ])
    expect(catalog.enums).toEqual([
      expect.objectContaining({ key: 'public.task_priority', labels: ['low', 'high'] }),
    ])
    expect(catalog.extensions).toEqual([
      expect.objectContaining({ key: 'pgcrypto', schemaName: 'extensions' }),
    ])
    expect(catalog.grants).toEqual([
      expect.objectContaining({ key: 'default_table:public.*:workbuddy_runtime:select', allowed: true }),
      expect.objectContaining({ key: 'function:public.rebuild_plan(uuid, jsonb):workbuddy_runtime:execute', allowed: true }),
      expect.objectContaining({ key: 'table:public.tasks:authenticated:select', allowed: true }),
    ])
  })

  it('runs catalog queries sequentially on a single PostgreSQL client', async () => {
    let activeQueries = 0
    let maxActiveQueries = 0
    let queryCount = 0

    const client = {
      query: async <T extends Record<string, unknown>>() => {
        queryCount += 1
        activeQueries += 1
        maxActiveQueries = Math.max(maxActiveQueries, activeQueries)
        await new Promise((resolve) => setTimeout(resolve, 1))
        activeQueries -= 1
        return { rows: [] as T[] }
      },
    }

    await introspectActualExtendedSchema(client, {
      schemas: ['public'],
      extensionNames: ['pgcrypto'],
    })

    expect(queryCount).toBe(6)
    expect(maxActiveQueries).toBe(1)
  })
})
