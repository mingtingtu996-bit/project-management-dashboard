import { query as rawQuery } from '../database.js'
import {
  isStructuredCauseCode,
  STRUCTURED_CAUSE_TAXONOMY_VERSION,
  type StructuredCauseCode,
} from '../domain/structuredCauseTaxonomy.js'
import type { CanonicalCauseResolution } from './structuredCauseAttributionService.js'

type QueryResult = { rows?: unknown[] | null }
type QueryExec = (sql: string, params?: unknown[]) => Promise<QueryResult | unknown[]>

type StructuredCauseRow = {
  id?: unknown
  company_id?: unknown
  project_id?: unknown
  subject_type?: unknown
  subject_id?: unknown
  event_type?: unknown
  status?: unknown
  cause_code?: unknown
  cause_role?: unknown
  taxonomy_version?: unknown
  confirmation_source?: unknown
  confirmed_at?: unknown
  responsibility_class?: unknown
  review_reason_codes?: unknown
}

export type ConfirmedTaskPrimaryCause = {
  attributionId: string
  causeCode: StructuredCauseCode
  taxonomyVersion: typeof STRUCTURED_CAUSE_TAXONOMY_VERSION
  confirmedAt: string
  eventType: 'delay' | 'completion'
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function timestamp(value: unknown) {
  const normalized = text(value)
  return normalized && Number.isFinite(Date.parse(normalized)) ? new Date(normalized).toISOString() : null
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
}

function reviewReasons(value: unknown) {
  if (typeof value === 'string') {
    try {
      return reviewReasons(JSON.parse(value))
    } catch {
      return []
    }
  }
  return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : []
}

function unavailable(reviewReasonCodes: string[] = []): CanonicalCauseResolution {
  return {
    availability: 'unavailable',
    causeCode: null,
    taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
    reviewReasonCodes,
  }
}

function emptySnapshot() {
  return {
    schema_version: 'structured_cause_snapshot/v1',
    confirmed_count: 0,
    candidate_count: 0,
    confirmed_causes: [] as Array<Record<string, unknown>>,
  }
}

function rowReason(row: StructuredCauseRow, scope: {
  companyId: string
  projectId: string
  taskId: string
}) {
  if (
    text(row.company_id) !== scope.companyId
    || text(row.project_id) !== scope.projectId
    || text(row.subject_type) !== 'task'
    || text(row.subject_id) !== scope.taskId
  ) return 'structured_cause_scope_mismatch'
  if (!isUuid(row.id)) return 'structured_cause_id_invalid'
  if (!['delay', 'completion'].includes(text(row.event_type))) return 'structured_cause_event_invalid'
  if (!['confirmed', 'candidate'].includes(text(row.status))) return 'structured_cause_status_invalid'
  if (!['primary', 'contributing', 'transmitted'].includes(text(row.cause_role))) return 'structured_cause_role_invalid'
  if (!isStructuredCauseCode(row.cause_code)) return 'structured_cause_code_invalid'
  if (text(row.taxonomy_version) !== STRUCTURED_CAUSE_TAXONOMY_VERSION) {
    return 'structured_cause_taxonomy_version_invalid'
  }
  if (text(row.status) === 'confirmed') {
    if (!['deterministic_policy', 'user_confirmed'].includes(text(row.confirmation_source))) {
      return 'structured_cause_confirmation_source_invalid'
    }
    if (!timestamp(row.confirmed_at)) return 'structured_cause_confirmed_at_required'
  } else if (text(row.confirmation_source) !== 'candidate' || text(row.confirmed_at)) {
    return 'structured_cause_confirmation_source_invalid'
  }
  return null
}

export async function readTaskStructuredCauseAuthority(
  scope: { companyId: string; projectId: string; taskId: string },
  dependencies: { queryExec?: QueryExec } = {},
) {
  try {
    const result = await (dependencies.queryExec ?? rawQuery as QueryExec)(
      `SELECT id, company_id, project_id, subject_type, subject_id, event_type, status,
              cause_code, cause_role, taxonomy_version, confirmation_source, confirmed_at,
              responsibility_class, review_reason_codes
         FROM public.structured_cause_attributions
        WHERE company_id = $1
          AND project_id = $2
          AND subject_type = 'task'
          AND subject_id = $3
          AND event_type IN ('delay', 'completion')
          AND status IN ('confirmed', 'candidate')
        ORDER BY confirmed_at DESC NULLS LAST, id ASC`,
      [scope.companyId, scope.projectId, scope.taskId],
    )
    const rows = (Array.isArray(result) ? result : result.rows ?? []) as StructuredCauseRow[]
    if (rows.length === 0) {
      return {
        snapshot: emptySnapshot(),
        resolution: unavailable(),
        causeBenchmarkEligible: true,
        confirmedPrimaryCause: null as ConfirmedTaskPrimaryCause | null,
      }
    }

    const invalidReasons = [...new Set(rows.map((row) => rowReason(row, scope)).filter((reason) => reason !== null))]
    const validRows = rows.filter((row) => !rowReason(row, scope))
    const confirmedRows = validRows.filter((row) => text(row.status) === 'confirmed')
    const candidateRows = validRows.filter((row) => text(row.status) === 'candidate')
    const confirmedPrimaryRows = confirmedRows.filter((row) => text(row.cause_role) === 'primary')
    const candidatePrimaryRows = candidateRows.filter((row) => text(row.cause_role) === 'primary')
    const confirmedCauses = confirmedRows.map((row) => {
      const confirmationSource = text(row.confirmation_source)
      const responsibilityClass = text(row.responsibility_class)
      return {
        attribution_id: text(row.id),
        cause_code: text(row.cause_code),
        cause_role: text(row.cause_role),
        taxonomy_version: text(row.taxonomy_version),
        event_type: text(row.event_type),
        confirmation_source: confirmationSource,
        confirmed_at: timestamp(row.confirmed_at),
        ...(confirmationSource === 'user_confirmed' && responsibilityClass
          ? { user_confirmed_context: { responsibility_class: responsibilityClass } }
          : {}),
      }
    }).sort((left, right) => (
      Number(right.cause_role === 'primary') - Number(left.cause_role === 'primary')
      || left.cause_role.localeCompare(right.cause_role)
      || left.cause_code.localeCompare(right.cause_code)
      || left.attribution_id.localeCompare(right.attribution_id)
    ))
    const snapshot = {
      schema_version: 'structured_cause_snapshot/v1',
      confirmed_count: confirmedCauses.length,
      candidate_count: candidateRows.length,
      confirmed_causes: confirmedCauses,
    }

    if (invalidReasons.length > 0) {
      return {
        snapshot,
        resolution: unavailable(invalidReasons),
        causeBenchmarkEligible: false,
        confirmedPrimaryCause: null as ConfirmedTaskPrimaryCause | null,
      }
    }
    if (confirmedPrimaryRows.length > 1) {
      return {
        snapshot,
        resolution: unavailable(['structured_cause_primary_ambiguous']),
        causeBenchmarkEligible: false,
        confirmedPrimaryCause: null as ConfirmedTaskPrimaryCause | null,
      }
    }
    if (confirmedPrimaryRows.length === 0) {
      const candidate = candidatePrimaryRows[0]
      return {
        snapshot,
        resolution: candidate && isStructuredCauseCode(candidate.cause_code)
          ? {
              availability: 'review_required' as const,
              causeCode: candidate.cause_code,
              taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
              reviewReasonCodes: reviewReasons(candidate.review_reason_codes),
            }
          : unavailable(['structured_cause_primary_required']),
        causeBenchmarkEligible: false,
        confirmedPrimaryCause: null as ConfirmedTaskPrimaryCause | null,
      }
    }

    const primary = confirmedPrimaryRows[0]
    const causeCode = primary.cause_code as StructuredCauseCode
    const conflictingCandidate = candidatePrimaryRows.some((row) => row.cause_code !== causeCode)
    if (conflictingCandidate) {
      return {
        snapshot,
        resolution: {
          availability: 'review_required' as const,
          causeCode,
          taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
          reviewReasonCodes: ['structured_cause_candidate_primary_conflict'],
        },
        causeBenchmarkEligible: false,
        confirmedPrimaryCause: null as ConfirmedTaskPrimaryCause | null,
      }
    }

    const confirmedAt = timestamp(primary.confirmed_at) as string
    const eventType = text(primary.event_type) as 'delay' | 'completion'
    return {
      snapshot,
      resolution: {
        availability: 'available' as const,
        causeCode,
        taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
        reviewReasonCodes: [],
      },
      causeBenchmarkEligible: true,
      confirmedPrimaryCause: {
        attributionId: text(primary.id),
        causeCode,
        taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
        confirmedAt,
        eventType,
      } satisfies ConfirmedTaskPrimaryCause,
    }
  } catch {
    return {
      snapshot: emptySnapshot(),
      resolution: unavailable(['structured_cause_read_failed']),
      causeBenchmarkEligible: false,
      confirmedPrimaryCause: null as ConfirmedTaskPrimaryCause | null,
    }
  }
}
