import {
  PLANNING_TABLE_OPERATION_TYPES,
  type PlanningSurface,
  type PlanningTableCommitRequest,
  type PlanningTableOperation,
  type PlanningTableOperationType,
  type PlanningTableValidationIssue,
} from '../types/planningTable.js'
import type { ApiResponse } from '../types/index.js'
import {
  PLANNING_FIELD_REGISTRY,
  PLANNING_FIELD_REGISTRY_VERSION,
  type PlanningFieldDefinition,
  type PlanningFieldValidator,
} from './planningFieldRegistryService.js'
import {
  validateWbsPlanRollupRows,
  type WbsPlanRollupValidationIssue,
} from './wbsPlanRollupService.js'

const OPERATION_TYPES = new Set<string>(PLANNING_TABLE_OPERATION_TYPES)
const ROW_OPERATION_TYPES = new Set<string>([
  'update_cell',
  'update_row',
  'delete_row',
  'move_row',
  'indent_row',
  'outdent_row',
  'mark_milestone',
  'set_predecessors',
])
const FIELD_WRITE_OPERATION_TYPES = new Set<string>(['create_row', 'update_cell', 'update_row'])
const FIELD_DEFINITIONS_BY_KEY = new Map(PLANNING_FIELD_REGISTRY.map((field) => [field.key, field]))
const LEGACY_RESPONSIBLE_UNIT_FIELDS = new Set(['responsible_unit', 'assignee_unit'])

export interface PlanningTableCommitValidationOptions {
  expectedSurface?: PlanningSurface
  allowEmptyOperations?: boolean
  enforceFieldRegistryVersion?: boolean
  requireUuidProjectId?: boolean
  validateFieldAccess?: boolean
}

export interface PlanningTableCommitValidationResult {
  ok: boolean
  request: PlanningTableCommitRequest | null
  issues: PlanningTableValidationIssue[]
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readPlainRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {}
}

function normalizeString(value: unknown) {
  return String(value ?? '').trim()
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

function readValidatorNumberParam(validator: PlanningFieldValidator, key: string) {
  return readNumber(validator.params?.[key])
}

function isValidDateValue(value: unknown) {
  if (!hasFieldValue(value)) return true
  const text = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const [year, month, day] = text.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function buildIssue(
  code: string,
  message: string,
  extra: Partial<PlanningTableValidationIssue> = {},
): PlanningTableValidationIssue {
  return {
    code,
    message,
    severity: 'block_save',
    ...extra,
  }
}

export function readPlanningTableOperationType(operation: PlanningTableOperation): string {
  return normalizeString(operation.type ?? operation.op)
}

export function readPlanningTableOperationRowId(operation: PlanningTableOperation): string {
  return normalizeString(operation.rowId ?? operation.id)
}

export function readPlanningTableOperationValues(operation: PlanningTableOperation): Record<string, unknown> {
  return isPlainRecord(operation.values) ? { ...operation.values } : {}
}

export function isPlanningTableOperationType(value: unknown): value is PlanningTableOperationType {
  return OPERATION_TYPES.has(normalizeString(value))
}

export function getEditablePlanningFieldKeys(surface: PlanningSurface) {
  return new Set(
    PLANNING_FIELD_REGISTRY
      .filter((field) => field.editableIn.includes(surface))
      .map((field) => field.key),
  )
}

function collectOperationFields(operation: PlanningTableOperation) {
  const operationType = readPlanningTableOperationType(operation)
  if (operationType === 'update_cell') {
    const field = normalizeString(operation.field)
    return field ? [field] : []
  }

  if (operationType === 'create_row' || operationType === 'update_row') {
    return Object.keys(readPlanningTableOperationValues(operation))
  }

  return []
}

function collectOperationFieldValues(operation: PlanningTableOperation) {
  const operationType = readPlanningTableOperationType(operation)
  if (operationType === 'update_cell') {
    const field = normalizeString(operation.field)
    return field ? [[field, operation.value] as const] : []
  }

  if (operationType === 'create_row' || operationType === 'update_row') {
    return Object.entries(readPlanningTableOperationValues(operation))
  }

  return []
}

function operationValuesLookExecutable(values: Record<string, unknown>) {
  const rawType = normalizeString(values.wbs_node_type ?? values.category_type ?? values.node_type).toLowerCase()
  if (!rawType) return false
  return ['process', 'task', 'work_step', 'operation', 'executable', '工序', '作业步骤'].includes(rawType)
}

function buildFieldValueIssue(
  code: string,
  message: string,
  operationIndex: number,
  rowId: string | null,
  field: string,
  severity: PlanningTableValidationIssue['severity'] = 'block_save',
  details: Record<string, unknown> = {},
) {
  return buildIssue(code, message, {
    operationIndex,
    rowId,
    field,
    severity,
    details,
  })
}

function readNestedRecordValue(record: Record<string, unknown>, key: string): unknown {
  const value = record[key]
  if (isPlainRecord(value)) return value
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      return isPlainRecord(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function readRollupRowValue(row: unknown, ...keys: string[]) {
  const record = readPlainRecord(row)
  for (const key of keys) {
    if (record[key] !== undefined) return record[key]
  }
  return undefined
}

function readRollupRowMetadataValue(row: unknown, ...keys: string[]) {
  const record = readPlainRecord(row)
  const metadata = {
    ...readPlainRecord(readNestedRecordValue(record, 'standard_task_metadata')),
    ...readPlainRecord(readNestedRecordValue(record, 'standardTaskMetadata')),
  }
  for (const key of keys) {
    if (metadata[key] !== undefined) return metadata[key]
  }
  return undefined
}

function normalizeRollupIssueField(field: string | undefined) {
  if (!field) return null
  if (field === 'parentId') return 'parent_id'
  if (field === 'plannedStartDate') return 'planned_start_date'
  if (field === 'plannedEndDate') return 'planned_end_date'
  if (field === 'plannedDateWindow') return 'planned_end_date'
  if (field === 'referenceDuration') return 'smart_reference_days'
  if (field === 'durationContributionMode') return 'duration_contribution_mode'
  if (field === 'wbsNodeType') return 'wbs_node_type'
  return field
}

function mapWbsRollupIssueSeverity(level: WbsPlanRollupValidationIssue['level']): PlanningTableValidationIssue['severity'] {
  if (level === 'error') return 'block_save'
  if (level === 'warning') return 'confirm'
  return 'hint'
}

function mapWbsRollupIssueToPlanningIssue(issue: WbsPlanRollupValidationIssue): PlanningTableValidationIssue {
  return {
    code: `WBS_ROLLUP_${issue.code}`,
    message: issue.message,
    severity: mapWbsRollupIssueSeverity(issue.level),
    rowId: issue.rowId ?? null,
    field: normalizeRollupIssueField(issue.field),
    details: {
      ...(issue.details ?? {}),
      parentId: issue.parentId ?? null,
      source: 'wbsPlanRollupService',
    },
  }
}

function buildWbsRollupValidationIssuesFromClientContext(clientContext: unknown) {
  const context = readPlainRecord(clientContext)
  const rollupRows = Array.isArray(context.rollupRows) ? context.rollupRows : []
  if (rollupRows.length === 0) return []

  return validateWbsPlanRollupRows(rollupRows, {
    getId: (row) => normalizeString(readRollupRowValue(row, 'id', 'rowId', 'clientRowId', 'tempId')),
    getParentId: (row) => normalizeString(readRollupRowValue(
      row,
      'parent_id',
      'parent_item_id',
      'parentId',
      'parentItemId',
    )) || null,
    getNodeType: (row) => normalizeString(readRollupRowValue(
      row,
      'wbs_node_type',
      'category_type',
      'node_type',
      'engineering_category_type',
      'type',
    )) || null,
    getPlannedStartDate: (row) => readRollupRowValue(
      row,
      'planned_start_date',
      'start_date',
      'plannedStartDate',
      'startDate',
    ),
    getPlannedEndDate: (row) => readRollupRowValue(
      row,
      'planned_end_date',
      'end_date',
      'plannedEndDate',
      'endDate',
    ),
    getReferenceDuration: (row) => readRollupRowValue(
      row,
      'smart_reference_days',
      'referenceDuration',
      'duration',
      'planned_duration_days',
      'plannedDurationDays',
    ),
    getDurationContributionMode: (row) => readRollupRowValue(
      row,
      'duration_contribution_mode',
      'durationContributionMode',
    ) ?? readRollupRowMetadataValue(row, 'durationContributionMode', 'duration_contribution_mode'),
  }).map(mapWbsRollupIssueToPlanningIssue)
}

function validatePlanningFieldValue(
  definition: PlanningFieldDefinition,
  value: unknown,
  operationValues: Record<string, unknown>,
  operationIndex: number,
  rowId: string | null,
) {
  const issues: PlanningTableValidationIssue[] = []

  if (definition.dataType === 'date' && !isValidDateValue(value)) {
    issues.push(buildFieldValueIssue(
      'PLANNING_FIELD_VALUE_DATE_INVALID',
      '日期字段必须是合法日期',
      operationIndex,
      rowId,
      definition.key,
      'block_save',
      { value },
    ))
  }

  for (const validator of definition.validators ?? []) {
    const severity = validator.severity ?? 'block_save'

    if (validator.type === 'required' && !hasFieldValue(value)) {
      issues.push(buildFieldValueIssue(
        'PLANNING_FIELD_VALUE_REQUIRED',
        '必填字段不能为空',
        operationIndex,
        rowId,
        definition.key,
        severity,
      ))
    }

    if (
      validator.type === 'required_for_executable'
      && operationValuesLookExecutable(operationValues)
      && !hasFieldValue(value)
    ) {
      issues.push(buildFieldValueIssue(
        'PLANNING_FIELD_VALUE_REQUIRED_FOR_EXECUTABLE',
        '工序/作业步骤必须填写该字段',
        operationIndex,
        rowId,
        definition.key,
        severity,
      ))
    }

    if (validator.type === 'range' && hasFieldValue(value)) {
      const numericValue = readNumber(value)
      const min = readValidatorNumberParam(validator, 'min')
      const max = readValidatorNumberParam(validator, 'max')
      const belowMin = min !== null && numericValue !== null && numericValue < min
      const aboveMax = max !== null && numericValue !== null && numericValue > max
      if (numericValue === null || belowMin || aboveMax) {
        issues.push(buildFieldValueIssue(
          'PLANNING_FIELD_VALUE_OUT_OF_RANGE',
          '字段数值超出允许范围',
          operationIndex,
          rowId,
          definition.key,
          severity,
          { value, min, max },
        ))
      }
    }

    if (validator.type === 'date_after' && hasFieldValue(value)) {
      const afterField = normalizeString(validator.params?.afterField)
      const afterValue = afterField ? operationValues[afterField] : undefined
      if (!afterField || !hasFieldValue(afterValue) || !isValidDateValue(value) || !isValidDateValue(afterValue)) continue

      if (new Date(String(value)) < new Date(String(afterValue))) {
        issues.push(buildFieldValueIssue(
          'PLANNING_FIELD_VALUE_DATE_ORDER',
          '完成日期不能早于开始日期',
          operationIndex,
          rowId,
          definition.key,
          severity,
          { value, afterField, afterValue },
        ))
      }
    }
  }

  return issues
}

export function validatePlanningTableCommitRequest(
  input: unknown,
  options: PlanningTableCommitValidationOptions = {},
): PlanningTableCommitValidationResult {
  const issues: PlanningTableValidationIssue[] = []
  const body = isPlainRecord(input) ? input : {}
  const projectId = normalizeString(body.projectId)
  const requestedSurface = normalizeString(body.surface)
  const surface = requestedSurface as PlanningSurface
  const expectedSurface = options.expectedSurface

  if (!projectId) {
    issues.push(buildIssue('PROJECT_ID_REQUIRED', 'projectId 不能为空'))
  } else if (options.requireUuidProjectId && !isUuidLike(projectId)) {
    issues.push(buildIssue('PROJECT_ID_INVALID', 'projectId 必须是合法 UUID', {
      details: { projectId },
    }))
  }

  if (!requestedSurface) {
    issues.push(buildIssue('PLANNING_SURFACE_REQUIRED', 'surface 不能为空'))
  } else if (!['baseline', 'monthly_plan', 'task_list'].includes(requestedSurface)) {
    issues.push(buildIssue('PLANNING_SURFACE_INVALID', 'surface 不在共享计划树范围内', {
      details: { surface: requestedSurface },
    }))
  } else if (expectedSurface && requestedSurface !== expectedSurface) {
    issues.push(buildIssue('PLANNING_SURFACE_MISMATCH', 'surface 与当前保存入口不一致', {
      details: { expectedSurface, receivedSurface: requestedSurface },
    }))
  }

  if (options.enforceFieldRegistryVersion !== false && body.fieldRegistryVersion !== PLANNING_FIELD_REGISTRY_VERSION) {
    issues.push(buildIssue('FIELD_REGISTRY_STALE', '字段注册表已更新，请刷新字段配置后重试', {
      details: {
        expectedVersion: PLANNING_FIELD_REGISTRY_VERSION,
        receivedVersion: body.fieldRegistryVersion ?? null,
      },
    }))
  }

  const operations: PlanningTableOperation[] = []
  if (Array.isArray(body.operations)) {
    body.operations.forEach((operation, operationIndex) => {
      if (isPlainRecord(operation)) {
        operations.push(operation as PlanningTableOperation)
        return
      }

      issues.push(buildIssue('PLANNING_OPERATION_INVALID', '操作项必须是对象', {
        operationIndex,
        details: { value: operation ?? null },
      }))
    })
  }

  if (!Array.isArray(body.operations)) {
    issues.push(buildIssue('PLANNING_OPERATIONS_REQUIRED', 'operations 必须是数组'))
  } else if (!options.allowEmptyOperations && operations.length === 0) {
    issues.push(buildIssue('PLANNING_OPERATIONS_EMPTY', 'operations 不能为空'))
  }

  const editableFields = requestedSurface && ['baseline', 'monthly_plan', 'task_list'].includes(requestedSurface)
    ? getEditablePlanningFieldKeys(surface)
    : new Set<string>()

  operations.forEach((operation, operationIndex) => {
    const operationType = readPlanningTableOperationType(operation)
    const rowId = readPlanningTableOperationRowId(operation)

    if (!isPlanningTableOperationType(operationType)) {
      issues.push(buildIssue('PLANNING_OPERATION_TYPE_INVALID', '操作类型不在共享计划树范围内', {
        operationIndex,
        rowId: rowId || null,
        details: { operationType },
      }))
      return
    }

    if (ROW_OPERATION_TYPES.has(operationType) && !rowId) {
      issues.push(buildIssue('PLANNING_OPERATION_ROW_ID_REQUIRED', '行级操作必须携带 rowId', {
        operationIndex,
      }))
    }

    if (operationType === 'update_cell' && !normalizeString(operation.field)) {
      issues.push(buildIssue('PLANNING_OPERATION_FIELD_REQUIRED', '单元格更新必须携带 field', {
        operationIndex,
        rowId: rowId || null,
      }))
    }

    if ((operationType === 'create_row' || operationType === 'update_row') && !isPlainRecord(operation.values)) {
      issues.push(buildIssue('PLANNING_OPERATION_VALUES_REQUIRED', '行创建或行更新必须携带 values 对象', {
        operationIndex,
        rowId: rowId || null,
      }))
    }

    if (operationType === 'set_predecessors' && operation.predecessorTaskIds !== undefined && !Array.isArray(operation.predecessorTaskIds)) {
      issues.push(buildIssue('PLANNING_PREDECESSORS_INVALID', '前置任务必须使用数组传入', {
        operationIndex,
        rowId: rowId || null,
      }))
    }

    if (operationType === 'set_predecessors' && operation.predecessorDependencies !== undefined && !Array.isArray(operation.predecessorDependencies)) {
      issues.push(buildIssue('PLANNING_PREDECESSOR_DEPENDENCIES_INVALID', '结构化前置关系必须使用数组传入', {
        operationIndex,
        rowId: rowId || null,
      }))
    }

    if (!FIELD_WRITE_OPERATION_TYPES.has(operationType)) return

    const operationValues = readPlanningTableOperationValues(operation)
    if (operationType === 'update_cell') {
      const field = normalizeString(operation.field)
      if (field) operationValues[field] = operation.value
    }

    if (options.validateFieldAccess) {
      for (const field of collectOperationFields(operation)) {
        if (editableFields.has(field)) continue
        issues.push(buildIssue('PLANNING_FIELD_NOT_EDITABLE', '字段不允许在当前计划表面编辑', {
          operationIndex,
          rowId: rowId || null,
          field,
          details: { surface: requestedSurface },
        }))
      }
    }

    for (const [field, value] of collectOperationFieldValues(operation)) {
      if (LEGACY_RESPONSIBLE_UNIT_FIELDS.has(field)) {
        issues.push(buildFieldValueIssue(
          'RESPONSIBLE_UNIT_LOOKUP_REQUIRED',
          '责任单位必须通过当前项目的参建单位选择器提交',
          operationIndex,
          rowId || null,
          field,
          'block_save',
          { canonicalField: 'participant_unit_id' },
        ))
        continue
      }
      const definition = FIELD_DEFINITIONS_BY_KEY.get(field)
      if (!definition) continue
      issues.push(...validatePlanningFieldValue(definition, value, operationValues, operationIndex, rowId || null))
    }
  })

  issues.push(...buildWbsRollupValidationIssuesFromClientContext(body.clientContext))
  const hasBlockingIssues = issues.some((issue) => issue.severity === 'block_save')

  return {
    ok: !hasBlockingIssues,
    request: !hasBlockingIssues
      ? {
          projectId,
          surface,
          resourceId: normalizeString(body.resourceId) || null,
          surfaceId: normalizeString(body.surfaceId) || null,
          baseVersion: body.baseVersion as string | number | null | undefined,
          baseRevision: body.baseRevision as string | number | null | undefined,
          fieldRegistryVersion: String(body.fieldRegistryVersion),
          operations,
          clientContext: isPlainRecord(body.clientContext) ? body.clientContext : null,
        }
      : null,
    issues,
  }
}

export function buildPlanningTableValidationErrorResponse(
  issues: PlanningTableValidationIssue[],
  code = 'PLANNING_TABLE_COMMIT_INVALID_REQUEST',
): ApiResponse {
  return {
    success: false,
    error: {
      code,
      message: '共享计划表格提交参数不合法',
      details: { issues },
    },
    timestamp: new Date().toISOString(),
  }
}
