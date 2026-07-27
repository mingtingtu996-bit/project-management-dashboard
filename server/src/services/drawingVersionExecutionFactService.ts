import { recordChangedExecutionFacts } from './executionFactGovernanceService.js'

export interface DrawingVersionCurrentFactRow {
  id?: string | null
  is_current_version?: boolean | number | string | null
}

export interface RecordDrawingVersionCurrentFactChangesInput {
  projectId: string
  sourceModule: string
  sourceMutationId: string
  observedAt: string
  actorUserId?: string | null
  before: DrawingVersionCurrentFactRow[]
  after: DrawingVersionCurrentFactRow[]
}

function normalizeId(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeCurrent(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

export async function recordDrawingVersionCurrentFactChanges(
  input: RecordDrawingVersionCurrentFactChangesInput,
) {
  const beforeById = new Map(
    input.before
      .map((row) => [normalizeId(row.id), row] as const)
      .filter(([id]) => Boolean(id)),
  )

  for (const row of input.after) {
    const entityId = normalizeId(row.id)
    if (!entityId) continue
    const previous = beforeById.get(entityId)
    const previousValue = previous ? normalizeCurrent(previous.is_current_version) : null
    const nextValue = normalizeCurrent(row.is_current_version)
    if (previous && previousValue === nextValue) continue

    await recordChangedExecutionFacts({
      projectId: input.projectId,
      entityType: 'drawing_version',
      entityId,
      sourceModule: input.sourceModule,
      sourceMutationId: `${input.sourceMutationId}:drawing_version:${entityId}`,
      actorUserId: input.actorUserId ?? null,
      observedAt: input.observedAt,
      changes: [{
        factType: 'drawing_version.current',
        previousValue,
        nextValue,
        force: previous == null,
      }],
    })
  }
}
