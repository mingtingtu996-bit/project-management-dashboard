import type {
  PlanningSurface,
  PlanningTableCommitRequest,
  PlanningTableOperation,
} from '@/components/planning/PlanningCommitModel'

type RowRecord = Record<string, unknown> & { id: string }

export type { PlanningSurface }

export type PlanningTreeHarnessField = {
  key: string
  dataType?: 'text' | 'number' | 'date' | 'percent' | 'enum' | 'lookup' | 'boolean'
  editableIn?: PlanningSurface[]
  requiredIn?: PlanningSurface[]
  validators?: Array<{
    type: string
    params?: Record<string, unknown>
    severity?: 'block_save' | 'confirm' | 'hint'
  }>
}

export type PlanningTreeHarnessFieldRegistry = {
  registryVersion?: string
  fields?: PlanningTreeHarnessField[]
}

export type PlanningTreeHarnessOptions = {
  fieldRegistry?: PlanningTreeHarnessFieldRegistry
  permissions?: unknown
  serverState?: {
    projectId?: string
    resourceId?: string | null
    baseRevision?: string | number | null
  } & Record<string, unknown>
}

export interface PlanningTreeHarness {
  enterEdit(): Promise<void>
  cancelEdit(): Promise<void>
  editCell(rowId: string, field: string, value: unknown): Promise<void>
  pasteAt(rowId: string, field: string, tsv: string): Promise<void>
  fillDown(range: unknown, value: unknown): Promise<void>
  deleteRow(rowId: string): Promise<void>
  undo(): Promise<void>
  redo(): Promise<void>
  clickSave(): Promise<PlanningTableCommitRequest>
  applyServerResult(serverResult: unknown): Promise<void>
  getRows(): RowRecord[]
}

type Snapshot = {
  rows: RowRecord[]
}

function cloneRows(rows: RowRecord[]): RowRecord[] {
  return JSON.parse(JSON.stringify(rows)) as RowRecord[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readRows(input: unknown): RowRecord[] {
  const source = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.rows)
      ? input.rows
      : isRecord(input) && Array.isArray(input.items)
        ? input.items
        : []

  return source.map((row, index) => {
    const record = isRecord(row) ? row : {}
    return {
      ...record,
      id: String(record.id ?? `local-${index + 1}`),
    }
  })
}

function readProjectId(initialData: unknown, rows: RowRecord[], options?: PlanningTreeHarnessOptions) {
  const fromOptions = String(options?.serverState?.projectId ?? '').trim()
  if (fromOptions) return fromOptions

  if (isRecord(initialData)) {
    const fromData = String(initialData.projectId ?? initialData.project_id ?? '').trim()
    if (fromData) return fromData
  }

  const fromFirstRow = String(rows[0]?.project_id ?? '').trim()
  return fromFirstRow || 'project-1'
}

function readResourceId(initialData: unknown, options?: PlanningTreeHarnessOptions) {
  const fromOptions = options?.serverState?.resourceId
  if (fromOptions !== undefined) return fromOptions

  if (isRecord(initialData)) {
    const fromData = initialData.resourceId ?? initialData.surfaceId ?? initialData.id
    if (fromData !== undefined && fromData !== null) return String(fromData)
  }

  return null
}

function getRegistryVersion(options?: PlanningTreeHarnessOptions) {
  return options?.fieldRegistry?.registryVersion ?? 'v1.4.7.6'
}

function hasFieldValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function readNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isValidDateValue(value: unknown) {
  if (!hasFieldValue(value)) return true
  const parsed = new Date(String(value))
  return !Number.isNaN(parsed.getTime())
}

function isExecutableRow(row: RowRecord) {
  const rawType = String(row.wbs_node_type ?? row.category_type ?? row.node_type ?? '').trim().toLowerCase()
  if (!rawType) return false
  return ['process', 'task', 'work_step', 'operation', 'executable', '工序', '作业步骤'].includes(rawType)
}

function collectValidationIssues(surface: PlanningSurface, rows: RowRecord[], options?: PlanningTreeHarnessOptions) {
  const registryFields = options?.fieldRegistry?.fields ?? []
  const issues: string[] = []

  for (const row of rows) {
    for (const field of registryFields) {
      const value = row[field.key]

      if (field.requiredIn?.includes(surface) && !hasFieldValue(value)) {
        issues.push(`${row.id}.${field.key}:required`)
      }

      if (field.dataType === 'date' && !isValidDateValue(value)) {
        issues.push(`${row.id}.${field.key}:date`)
      }

      for (const validator of field.validators ?? []) {
        if (validator.severity && validator.severity !== 'block_save') continue

        if (validator.type === 'required' && !hasFieldValue(value)) {
          issues.push(`${row.id}.${field.key}:required`)
        }

        if (validator.type === 'required_for_executable' && isExecutableRow(row) && !hasFieldValue(value)) {
          issues.push(`${row.id}.${field.key}:required_for_executable`)
        }

        if (validator.type === 'range' && hasFieldValue(value)) {
          const numericValue = readNumber(value)
          const min = readNumber(validator.params?.min)
          const max = readNumber(validator.params?.max)
          if (
            numericValue === null
            || (min !== null && numericValue < min)
            || (max !== null && numericValue > max)
          ) {
            issues.push(`${row.id}.${field.key}:range`)
          }
        }

        if (validator.type === 'date_after' && hasFieldValue(value)) {
          const afterField = String(validator.params?.afterField ?? '').trim()
          const afterValue = afterField ? row[afterField] : undefined
          if (!afterField || !hasFieldValue(afterValue) || !isValidDateValue(value) || !isValidDateValue(afterValue)) {
            continue
          }
          if (new Date(String(value)) < new Date(String(afterValue))) {
            issues.push(`${row.id}.${field.key}:date_after`)
          }
        }
      }
    }
  }

  return issues
}

function assertRowsValid(surface: PlanningSurface, rows: RowRecord[], options?: PlanningTreeHarnessOptions) {
  const issues = collectValidationIssues(surface, rows, options)
  if (issues.length === 0) return
  throw new Error(`Planning validation failed: ${issues.join(', ')}`)
}

function assertEditable(surface: PlanningSurface, field: string, options?: PlanningTreeHarnessOptions) {
  const registryFields = options?.fieldRegistry?.fields ?? []
  if (registryFields.length === 0) return

  const definition = registryFields.find((item) => item.key === field)
  if (!definition) {
    throw new Error(`Field "${field}" is not present in the planning field registry`)
  }

  if (definition.editableIn?.includes(surface)) return
  throw new Error(`Field "${field}" is not editable on ${surface}`)
}

function rowDiff(base: RowRecord | undefined, next: RowRecord) {
  const diff: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(next)) {
    if (key === 'id') continue
    if (JSON.stringify(base?.[key] ?? null) !== JSON.stringify(value ?? null)) {
      diff[key] = value ?? null
    }
  }
  return diff
}

function readServerRows(serverResult: unknown): RowRecord[] | null {
  if (Array.isArray(serverResult)) return readRows(serverResult)
  if (!isRecord(serverResult)) return null
  if (Array.isArray(serverResult.rows)) return readRows(serverResult.rows)
  if (isRecord(serverResult.data) && Array.isArray(serverResult.data.rows)) {
    return readRows(serverResult.data.rows)
  }
  return null
}

export function mountSurface(
  surface: PlanningSurface,
  initialData: unknown,
  options: PlanningTreeHarnessOptions = {},
): PlanningTreeHarness {
  const initialRows = readRows(initialData)
  const projectId = readProjectId(initialData, initialRows, options)
  const resourceId = readResourceId(initialData, options)
  let baseRows = cloneRows(initialRows)
  let rows = cloneRows(initialRows)
  let editing = false
  const undoStack: Snapshot[] = []
  const redoStack: Snapshot[] = []

  const remember = () => {
    undoStack.push({ rows: cloneRows(rows) })
    redoStack.length = 0
  }

  const requireEditing = () => {
    if (!editing) throw new Error('Planning surface is not in edit mode')
  }

  const findRowIndex = (rowId: string) => rows.findIndex((row) => row.id === rowId)

  return {
    async enterEdit() {
      editing = true
    },
    async cancelEdit() {
      rows = cloneRows(baseRows)
      undoStack.length = 0
      redoStack.length = 0
      editing = false
    },
    async editCell(rowId, field, value) {
      requireEditing()
      assertEditable(surface, field, options)
      const index = findRowIndex(rowId)
      if (index < 0) throw new Error(`Row "${rowId}" not found`)
      remember()
      rows[index] = { ...rows[index], [field]: value }
    },
    async pasteAt(rowId, field, tsv) {
      requireEditing()
      assertEditable(surface, field, options)
      const fields = options.fieldRegistry?.fields?.map((item) => item.key) ?? [field]
      const startFieldIndex = fields.indexOf(field)
      const startRowIndex = findRowIndex(rowId)
      if (startRowIndex < 0) throw new Error(`Row "${rowId}" not found`)
      const nextRows = cloneRows(rows)

      tsv.split(/\r?\n/).filter(Boolean).forEach((line, rowOffset) => {
        const rowIndex = startRowIndex + rowOffset
        if (!nextRows[rowIndex]) return
        line.split('\t').forEach((cell, cellOffset) => {
          const targetField = fields[startFieldIndex + cellOffset]
          if (!targetField) return
          assertEditable(surface, targetField, options)
          nextRows[rowIndex] = { ...nextRows[rowIndex], [targetField]: cell }
        })
      })
      remember()
      rows = nextRows
    },
    async fillDown(range, value) {
      requireEditing()
      if (!isRecord(range) || typeof range.field !== 'string' || !Array.isArray(range.rowIds)) {
        throw new Error('fillDown range must include field and rowIds')
      }
      assertEditable(surface, range.field, options)
      remember()
      const rowIds = new Set(range.rowIds.map((item) => String(item)))
      rows = rows.map((row) => (rowIds.has(row.id) ? { ...row, [range.field as string]: value } : row))
    },
    async deleteRow(rowId) {
      requireEditing()
      if (findRowIndex(rowId) < 0) throw new Error(`Row "${rowId}" not found`)
      remember()
      rows = rows.filter((row) => row.id !== rowId)
    },
    async undo() {
      const snapshot = undoStack.pop()
      if (!snapshot) return
      redoStack.push({ rows: cloneRows(rows) })
      rows = cloneRows(snapshot.rows)
    },
    async redo() {
      const snapshot = redoStack.pop()
      if (!snapshot) return
      undoStack.push({ rows: cloneRows(rows) })
      rows = cloneRows(snapshot.rows)
    },
    async clickSave() {
      requireEditing()
      assertRowsValid(surface, rows, options)
      const baseById = new Map(baseRows.map((row) => [row.id, row]))
      const nextById = new Set(rows.map((row) => row.id))
      const operations: PlanningTableOperation[] = []

      rows.forEach((row, index) => {
        const base = baseById.get(row.id)
        if (!base || row.id.startsWith('local-')) {
          operations.push({
            type: 'create_row',
            clientRowId: row.id,
            parentId: String(row.parent_id ?? row.parent_item_id ?? '').trim() || null,
            sortOrder: index,
            values: rowDiff(undefined, row),
          })
          return
        }

        const values = rowDiff(base, row)
        if (Object.keys(values).length > 0) {
          operations.push({ type: 'update_row', rowId: row.id, values })
        }
      })

      baseRows.forEach((row) => {
        if (!nextById.has(row.id)) {
          operations.push({ type: 'delete_row', rowId: row.id })
        }
      })

      return {
        projectId,
        surface,
        resourceId: resourceId ?? undefined,
        fieldRegistryVersion: getRegistryVersion(options),
        baseRevision: options.serverState?.baseRevision ?? undefined,
        operations,
      }
    },
    async applyServerResult(serverResult) {
      const serverRows = readServerRows(serverResult)
      if (serverRows) {
        rows = cloneRows(serverRows)
        baseRows = cloneRows(serverRows)
      } else {
        baseRows = cloneRows(rows)
      }
      editing = false
      undoStack.length = 0
      redoStack.length = 0
    },
    getRows() {
      return cloneRows(rows)
    },
  }
}
