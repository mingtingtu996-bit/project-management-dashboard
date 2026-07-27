import {
  recordChangedExecutionFacts,
  type BuildChangedExecutionFactInputsInput,
  type ExecutionFactQueryExecutor,
} from './executionFactGovernanceService.js'

type AcceptancePlanFactRow = Record<string, any>

export type AcceptancePlanExecutionFactInput = {
  projectId: string
  planId: string
  previous: AcceptancePlanFactRow | null
  next: AcceptancePlanFactRow
  sourceMutationId: string
  sourceModule?: string
  observedAt: string
  actorUserId?: string | null
  forceInitial?: boolean
  queryExec?: ExecutionFactQueryExecutor
  isTransactionActive?: () => boolean
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function effectiveAt(value: unknown, observedAt: string) {
  const date = normalizeText(value)
  return date ? new Date(`${date}T00:00:00.000Z`).toISOString() : observedAt
}

export async function recordAcceptancePlanExecutionFacts(input: AcceptancePlanExecutionFactInput) {
  const forceInitial = input.forceInitial === true
  const factInput: BuildChangedExecutionFactInputsInput = {
    projectId: input.projectId,
    entityType: 'acceptance_plan',
    entityId: input.planId,
    sourceModule: input.sourceModule ?? 'acceptance-plans',
    sourceMutationId: input.sourceMutationId,
    actorUserId: input.actorUserId ?? null,
    observedAt: input.observedAt,
    changes: [
      {
        factType: 'acceptance_plan.status',
        previousValue: input.previous?.status ?? null,
        nextValue: input.next.status ?? null,
        force: forceInitial,
        effectiveAt: input.observedAt,
      },
      {
        factType: 'acceptance_plan.actual_date',
        previousValue: input.previous?.actual_date ?? null,
        nextValue: input.next.actual_date ?? null,
        force: forceInitial,
        effectiveAt: effectiveAt(input.next.actual_date, input.observedAt),
      },
    ],
  }
  const executionOptions = input.queryExec || input.isTransactionActive
    ? {
        ...(input.queryExec ? { queryExec: input.queryExec } : {}),
        ...(input.isTransactionActive ? { isTransactionActive: input.isTransactionActive } : {}),
      }
    : undefined
  if (executionOptions) {
    await recordChangedExecutionFacts(factInput, executionOptions)
    return
  }
  await recordChangedExecutionFacts(factInput)
}
