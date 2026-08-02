import type {
  ExecutionFactEvent,
  ExecutionFactType,
} from './executionFactGovernanceService.js'

export const TASK_EXECUTION_FACT_AUTHORITY_TYPES = [
  'task.actual_start_date',
  'task.actual_end_date',
  'task.first_progress_at',
  'task.progress',
  'task.status',
] as const satisfies readonly ExecutionFactType[]

export type TaskExecutionFactAuthorityType = typeof TASK_EXECUTION_FACT_AUTHORITY_TYPES[number]

export interface TaskExecutionFactAuthorityState {
  availability: 'available' | 'unavailable'
  missingFactTypes: TaskExecutionFactAuthorityType[]
}

const TASK_FACT_FIELD_BY_TYPE: Record<TaskExecutionFactAuthorityType, string> = {
  'task.actual_start_date': 'actual_start_date',
  'task.actual_end_date': 'actual_end_date',
  'task.first_progress_at': 'first_progress_at',
  'task.progress': 'progress',
  'task.status': 'status',
}

const authorityStateByProjection = new WeakMap<object, TaskExecutionFactAuthorityState>()

function normalizeFactValue(fact: ExecutionFactEvent): { valid: boolean; value: unknown } {
  if (
    fact.factType === 'task.actual_start_date'
    || fact.factType === 'task.actual_end_date'
    || fact.factType === 'task.first_progress_at'
  ) {
    if (fact.value == null) return { valid: true, value: null }
    const value = String(fact.value).trim()
    return { valid: Boolean(value), value: value || null }
  }
  if (fact.factType === 'task.progress') {
    const value = Number(fact.value)
    return {
      valid: Number.isInteger(value) && value >= 0 && value <= 100,
      value: Number.isFinite(value) ? value : null,
    }
  }
  if (fact.factType === 'task.status') {
    const value = String(fact.value ?? '').trim()
    return { valid: Boolean(value), value: value || null }
  }
  return { valid: false, value: null }
}

export function applyTaskExecutionFactAuthority<T extends object>(
  rows: readonly T[],
  facts: readonly ExecutionFactEvent[],
  requiredFactTypes: readonly TaskExecutionFactAuthorityType[] = TASK_EXECUTION_FACT_AUTHORITY_TYPES,
): T[] {
  const required = new Set(requiredFactTypes)
  const factsByEntity = new Map<string, Map<TaskExecutionFactAuthorityType, ExecutionFactEvent>>()
  for (const fact of facts) {
    if (fact.entityType !== 'task' || !required.has(fact.factType as TaskExecutionFactAuthorityType)) continue
    const entityFacts = factsByEntity.get(fact.entityId) ?? new Map<TaskExecutionFactAuthorityType, ExecutionFactEvent>()
    entityFacts.set(fact.factType as TaskExecutionFactAuthorityType, fact)
    factsByEntity.set(fact.entityId, entityFacts)
  }

  return rows.map((source) => {
    const projection = { ...source } as T
    const row = projection as Record<string, unknown>
    const entityId = String(row.id ?? '').trim()
    const entityFacts = factsByEntity.get(entityId) ?? new Map<TaskExecutionFactAuthorityType, ExecutionFactEvent>()
    const appliedTypes = new Set<TaskExecutionFactAuthorityType>()
    const normalizedValues = new Map<TaskExecutionFactAuthorityType, unknown>()

    for (const factType of requiredFactTypes) {
      row[TASK_FACT_FIELD_BY_TYPE[factType]] = null
      const fact = entityFacts.get(factType)
      if (!fact) continue
      const normalized = normalizeFactValue(fact)
      if (!normalized.valid) continue
      normalizedValues.set(factType, normalized.value)
      appliedTypes.add(factType)
    }

    const missingFactTypes = requiredFactTypes.filter((factType) => !appliedTypes.has(factType))
    if (missingFactTypes.length === 0) {
      for (const factType of requiredFactTypes) {
        row[TASK_FACT_FIELD_BY_TYPE[factType]] = normalizedValues.get(factType) ?? null
      }
    }
    authorityStateByProjection.set(projection, {
      availability: missingFactTypes.length === 0 ? 'available' : 'unavailable',
      missingFactTypes,
    })
    return projection
  })
}

export function readTaskExecutionFactAuthorityState(value: unknown): TaskExecutionFactAuthorityState {
  if (!value || typeof value !== 'object') {
    return {
      availability: 'unavailable',
      missingFactTypes: [...TASK_EXECUTION_FACT_AUTHORITY_TYPES],
    }
  }
  return authorityStateByProjection.get(value) ?? {
    availability: 'unavailable',
    missingFactTypes: [...TASK_EXECUTION_FACT_AUTHORITY_TYPES],
  }
}

export function hasTaskExecutionFactAuthority(value: unknown) {
  return readTaskExecutionFactAuthorityState(value).availability === 'available'
}
