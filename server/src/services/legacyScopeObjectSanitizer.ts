const LEGACY_SCOPE_OBJECT_FIELDS = new Set([
  'zone_object_id',
  'professional_object_id',
  'scope_dimensions',
  'project_scope_dimensions',
  'legacy_object_type',
])

const PROTOTYPE_POLLUTION_FIELDS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  '__defineGetter__',
  '__defineSetter__',
  'constructor.prototype',
  'constructor.prototype.polluted',
])

function normalizeUnsafeFieldName(value: unknown) {
  return String(value ?? '').trim()
}

export function isUnsafePrototypePollutionField(value: unknown): boolean {
  const normalized = normalizeUnsafeFieldName(value)
  if (!normalized) return false
  return PROTOTYPE_POLLUTION_FIELDS.has(normalized)
}

function stripLegacyScopeObjectFields(value: unknown, strippedFields: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripLegacyScopeObjectFields(item, strippedFields))
      .filter((item) => item !== undefined)
  }

  if (!value || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  const nodeName = normalizeUnsafeFieldName(record.name ?? record.title)
  if (isUnsafePrototypePollutionField(nodeName)) {
    strippedFields.add(nodeName)
    return undefined
  }

  const cleaned: Record<string, unknown> = {}
  for (const [key, childValue] of Object.entries(record)) {
    if (LEGACY_SCOPE_OBJECT_FIELDS.has(key) || isUnsafePrototypePollutionField(key)) {
      strippedFields.add(key)
      continue
    }
    const sanitizedChild = stripLegacyScopeObjectFields(childValue, strippedFields)
    if (sanitizedChild !== undefined) {
      cleaned[key] = sanitizedChild
    }
  }
  return cleaned
}

export function sanitizeLegacyScopeObjectFields<T = unknown>(payload: T) {
  const strippedFields = new Set<string>()
  return {
    payload: stripLegacyScopeObjectFields(payload ?? {}, strippedFields) as T,
    strippedFields: [...strippedFields].sort(),
  }
}
