// v1.4.4: DTO stripping — remove forbidden fields from task responses

const FORBIDDEN_TASK_FIELDS = [
  'task_code',
  'task_code_version',
  'task_code_rule_id',
  'task_code_generated_at',
  'zone_object_id',
  'professional_object_id',
  'scope_dimensions',
  'project_scope_dimensions',
  'legacy_object_type',
] as const

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function hasRecordValue(record: Record<string, unknown>) {
  return Object.keys(record).length > 0
}

function readFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function readDurationSuggestion(task: Record<string, unknown>) {
  const direct = readRecord(task.duration_suggestion ?? task.durationSuggestion)
  if (hasRecordValue(direct)) return direct
  const metadata = readRecord(task.standard_task_metadata ?? task.standardTaskMetadata)
  return readRecord(metadata.durationSuggestion ?? metadata.duration_suggestion)
}

function buildDurationRiskRangeForClient(task: Record<string, unknown>) {
  const suggestion = readDurationSuggestion(task)
  if (!hasRecordValue(suggestion)) return null
  const riskRange = readRecord(suggestion.durationRiskRange ?? suggestion.duration_risk_range)
  const p20 = readFiniteNumber(
    suggestion.riskP20DurationDays
      ?? suggestion.risk_p20_duration_days
      ?? riskRange.p20Days
      ?? riskRange.p20_days,
  )
  const p50 = readFiniteNumber(
    suggestion.riskP50DurationDays
      ?? suggestion.risk_p50_duration_days
      ?? riskRange.p50Days
      ?? riskRange.p50_days
      ?? suggestion.recommendedDurationDays
      ?? suggestion.recommended_duration_days
      ?? suggestion.planReferenceDays
      ?? suggestion.plan_reference_days,
  )
  const p80 = readFiniteNumber(
    suggestion.riskP80DurationDays
      ?? suggestion.risk_p80_duration_days
      ?? riskRange.p80Days
      ?? riskRange.p80_days
      ?? suggestion.conservativeDurationDays
      ?? suggestion.conservative_duration_days,
  )
  if (p20 === null && p50 === null && p80 === null) return null
  return {
    p20,
    p50,
    p80,
    range: {
      ...riskRange,
      ...(p20 !== null ? { p20_days: p20 } : {}),
      ...(p50 !== null ? { p50_days: p50 } : {}),
      ...(p80 !== null ? { p80_days: p80 } : {}),
    },
  }
}

export function sanitizeTaskForClient(task: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const key of Object.keys(task)) {
    if (!FORBIDDEN_TASK_FIELDS.includes(key as any)) {
      sanitized[key] = task[key]
    }
  }
  const durationRisk = buildDurationRiskRangeForClient(task)
  if (durationRisk) {
    if (durationRisk.p20 !== null) sanitized.duration_risk_p20_days = durationRisk.p20
    if (durationRisk.p50 !== null) sanitized.duration_risk_p50_days = durationRisk.p50
    if (durationRisk.p80 !== null) sanitized.duration_risk_p80_days = durationRisk.p80
    sanitized.duration_risk_range = durationRisk.range
  }
  return sanitized
}

export function sanitizeTasksForClient(tasks: Record<string, unknown>[]): Record<string, unknown>[] {
  return tasks.map(sanitizeTaskForClient)
}
