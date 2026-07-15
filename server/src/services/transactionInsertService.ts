function quoteIdentifier(identifier: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`)
  }
  return `"${identifier}"`
}

function orderedColumns(rows: object[]) {
  const seen = new Set<string>()
  const columns: string[] = []
  for (const row of rows) {
    const record = row as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (record[key] === undefined || seen.has(key)) continue
      seen.add(key)
      columns.push(key)
    }
  }
  return columns
}

type InsertRowsOptions = {
  jsonColumns?: readonly string[]
}

function normalizeParameterValue(column: string, value: unknown, options?: InsertRowsOptions) {
  const normalized = value === undefined ? null : value
  if (normalized === null) return null
  if (!options?.jsonColumns?.includes(column)) return normalized
  if (typeof normalized === 'string') {
    try {
      JSON.parse(normalized)
      return normalized
    } catch {
      return JSON.stringify(normalized)
    }
  }
  return JSON.stringify(normalized)
}

export async function insertRowReturning<T>(
  client: any,
  tableName: string,
  row: Record<string, unknown>,
  options?: InsertRowsOptions,
): Promise<T> {
  const rows = await insertRowsReturning<T>(client, tableName, [row], options)
  return rows[0]
}

export async function insertRowsReturning<T>(
  client: any,
  tableName: string,
  rows: object[],
  options?: InsertRowsOptions,
): Promise<T[]> {
  if (rows.length === 0) return []

  const columns = orderedColumns(rows)
  if (columns.length === 0) return []

  const values: unknown[] = []
  const valueGroups = rows.map((row) => {
    const record = row as Record<string, unknown>
    const placeholders = columns.map((column) => {
      values.push(normalizeParameterValue(column, record[column], options))
      return `$${values.length}`
    })
    return `(${placeholders.join(', ')})`
  })

  const sql = [
    `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')})`,
    `VALUES ${valueGroups.join(', ')}`,
    'RETURNING *',
  ].join(' ')

  const { rows: insertedRows } = await client.query(sql, values)
  return insertedRows as T[]
}

export async function insertRows(
  client: any,
  tableName: string,
  rows: object[],
  options?: InsertRowsOptions,
): Promise<number> {
  if (rows.length === 0) return 0

  const columns = orderedColumns(rows)
  if (columns.length === 0) return 0

  const values: unknown[] = []
  const valueGroups = rows.map((row) => {
    const record = row as Record<string, unknown>
    const placeholders = columns.map((column) => {
      values.push(normalizeParameterValue(column, record[column], options))
      return `$${values.length}`
    })
    return `(${placeholders.join(', ')})`
  })

  const sql = [
    `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')})`,
    `VALUES ${valueGroups.join(', ')}`,
  ].join(' ')

  const result = await client.query(sql, values)
  return Number(result.rowCount ?? rows.length)
}
