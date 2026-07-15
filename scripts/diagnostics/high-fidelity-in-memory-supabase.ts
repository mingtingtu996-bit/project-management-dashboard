import { supabase } from '../../server/src/services/dbService.js'

export type SyntheticRow = Record<string, unknown>

function normalizeDate(value: unknown) {
  const text = String(value ?? '')
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text
}

function parseNotIn(value: unknown) {
  return String(value ?? '')
    .replace(/[()]/g, '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildSingleColumnIndex(rows: SyntheticRow[], column: string) {
  const index = new Map<string, SyntheticRow[]>()
  for (const row of rows) {
    const key = String(row[column] ?? '')
    const list = index.get(key) ?? []
    list.push(row)
    index.set(key, list)
  }
  return index
}

function rowsFromIndex(index: Map<string, SyntheticRow[]>, value: unknown) {
  if (Array.isArray(value)) {
    const rows: SyntheticRow[] = []
    const seen = new Set<SyntheticRow>()
    for (const item of value) {
      for (const row of index.get(String(item ?? '')) ?? []) {
        if (seen.has(row)) continue
        rows.push(row)
        seen.add(row)
      }
    }
    return rows
  }
  return index.get(String(value ?? '')) ?? []
}

export function installHighFidelityInMemorySupabase(tables: Record<string, SyntheticRow[]>) {
  const indexes: Record<string, Record<string, Map<string, SyntheticRow[]>>> = {
    task_progress_snapshots: {
      task_id: buildSingleColumnIndex(tables.task_progress_snapshots ?? [], 'task_id'),
      project_id: buildSingleColumnIndex(tables.task_progress_snapshots ?? [], 'project_id'),
    },
    task_conditions: {
      task_id: buildSingleColumnIndex(tables.task_conditions ?? [], 'task_id'),
    },
    task_obstacles: {
      task_id: buildSingleColumnIndex(tables.task_obstacles ?? [], 'task_id'),
    },
    project_materials: {
      linked_task_id: buildSingleColumnIndex(tables.project_materials ?? [], 'linked_task_id'),
    },
    data_quality_findings: {
      task_id: buildSingleColumnIndex(tables.data_quality_findings ?? [], 'task_id'),
    },
    duration_experience_samples: {
      project_id: buildSingleColumnIndex(tables.duration_experience_samples ?? [], 'project_id'),
    },
    project_schedule_states: {
      project_id: buildSingleColumnIndex(tables.project_schedule_states ?? [], 'project_id'),
    },
  }

  const rowsFor = (table: string) => tables[table] ?? []

  function maybeIndexedRows(table: string, filters: SyntheticRow[]) {
    const tableIndexes = indexes[table]
    if (!tableIndexes) return rowsFor(table)
    for (const filter of filters) {
      if (filter.type !== 'eq' && filter.type !== 'in') continue
      const column = String(filter.column ?? '')
      const index = tableIndexes[column]
      if (!index) continue
      return rowsFromIndex(index, filter.value)
    }
    return rowsFor(table)
  }

  function applyFilters(table: string, filters: SyntheticRow[]) {
    return filters.reduce((result, filter) => {
      if (filter.type === 'eq') return result.filter((row) => row[filter.column as string] === filter.value)
      if (filter.type === 'in') return result.filter((row) => Array.isArray(filter.value) && filter.value.includes(row[filter.column as string]))
      if (filter.type === 'is') return result.filter((row) => row[filter.column as string] === filter.value)
      if (filter.type === 'not_is') return result.filter((row) => row[filter.column as string] !== filter.value)
      if (filter.type === 'not_eq') return result.filter((row) => row[filter.column as string] !== filter.value)
      if (filter.type === 'not_in') {
        const values = parseNotIn(filter.value)
        return result.filter((row) => !values.includes(String(row[filter.column as string] ?? '')))
      }
      if (filter.type === 'gte') return result.filter((row) => normalizeDate(row[filter.column as string]) >= normalizeDate(filter.value))
      if (filter.type === 'lte') return result.filter((row) => normalizeDate(row[filter.column as string]) <= normalizeDate(filter.value))
      return result
    }, maybeIndexedRows(table, filters))
  }

  function applyOrders(rows: SyntheticRow[], orders: SyntheticRow[]) {
    return [...rows].sort((left, right) => {
      for (const order of orders) {
        const direction = order.ascending === false ? -1 : 1
        const leftValue = normalizeDate(left[order.column as string])
        const rightValue = normalizeDate(right[order.column as string])
        if (leftValue < rightValue) return -1 * direction
        if (leftValue > rightValue) return direction
      }
      return 0
    })
  }

  function createBuilder(table: string) {
    const filters: SyntheticRow[] = []
    const orders: SyntheticRow[] = []
    let rowLimit: number | null = null
    const readRows = () => {
      const filtered = applyFilters(table, filters)
      const ordered = applyOrders(filtered, orders)
      return rowLimit == null ? ordered : ordered.slice(0, rowLimit)
    }
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push({ type: 'eq', column, value })
        return builder
      },
      in: (column: string, value: unknown[]) => {
        filters.push({ type: 'in', column, value })
        return builder
      },
      is: (column: string, value: unknown) => {
        filters.push({ type: 'is', column, value })
        return builder
      },
      not: (column: string, operator: string, value: unknown) => {
        filters.push({ type: operator === 'in' ? 'not_in' : operator === 'is' ? 'not_is' : 'not_eq', column, value })
        return builder
      },
      gte: (column: string, value: unknown) => {
        filters.push({ type: 'gte', column, value })
        return builder
      },
      lte: (column: string, value: unknown) => {
        filters.push({ type: 'lte', column, value })
        return builder
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        orders.push({ column, ascending: options?.ascending !== false })
        return builder
      },
      limit: (count: number) => {
        rowLimit = Math.max(0, Number(count) || 0)
        return builder
      },
      maybeSingle: async () => ({ data: readRows()[0] ?? null, error: null }),
      single: async () => ({ data: readRows()[0] ?? null, error: null }),
      upsert: async (rows: SyntheticRow | SyntheticRow[]) => ({ data: Array.isArray(rows) ? rows : [rows], error: null }),
      insert: async (rows: SyntheticRow | SyntheticRow[]) => ({ data: Array.isArray(rows) ? rows : [rows], error: null }),
      update: (patch: SyntheticRow) => ({
        eq: async () => ({ data: patch, error: null }),
      }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        return Promise.resolve({ data: readRows(), error: null }).then(resolve, reject)
      },
    }
    return builder
  }

  ;(supabase as any).from = (table: string) => createBuilder(table)
}
