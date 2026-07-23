import { describe, expect, it, vi } from 'vitest'

import { readTaskStructuredCauseAuthority } from '../services/taskStructuredCauseAuthorityService.js'

const scope = {
  companyId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  taskId: '33333333-3333-4333-8333-333333333333',
}

function confirmedPrimary(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    company_id: scope.companyId,
    project_id: scope.projectId,
    subject_type: 'task',
    subject_id: scope.taskId,
    event_type: 'completion',
    status: 'confirmed',
    cause_code: 'material_shortage',
    cause_role: 'primary',
    taxonomy_version: 'v1.0.0',
    confirmation_source: 'user_confirmed',
    confirmed_at: '2026-07-20T00:00:00.000Z',
    responsibility_class: 'contractor_attributable',
    review_reason_codes: [],
    ...overrides,
  }
}

async function read(rows: Array<Record<string, unknown>>) {
  const queryExec = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows, rowCount: rows.length }))
  const result = await readTaskStructuredCauseAuthority(scope, { queryExec })
  return { result, queryExec }
}

describe('taskStructuredCauseAuthorityService', () => {
  it('treats only a truly empty query result as zero-cause benchmark eligible', async () => {
    const { result, queryExec } = await read([])

    expect(result).toMatchObject({
      causeBenchmarkEligible: true,
      confirmedPrimaryCause: null,
      resolution: { availability: 'unavailable', causeCode: null, reviewReasonCodes: [] },
      snapshot: { confirmed_count: 0, candidate_count: 0, confirmed_causes: [] },
    })
    expect(queryExec.mock.calls[0]?.[0]).toContain('event_type')
    expect(queryExec.mock.calls[0]?.[0]).toContain('confirmed_at')
  })

  it('selects exactly one valid confirmed primary while preserving contributing evidence', async () => {
    const contributing = confirmedPrimary({
      id: '55555555-5555-4555-8555-555555555555',
      cause_code: 'weather_impact',
      cause_role: 'contributing',
      event_type: 'delay',
    })
    const { result } = await read([confirmedPrimary(), contributing])

    expect(result.causeBenchmarkEligible).toBe(true)
    expect(result.confirmedPrimaryCause).toEqual({
      attributionId: '44444444-4444-4444-8444-444444444444',
      causeCode: 'material_shortage',
      taxonomyVersion: 'v1.0.0',
      confirmedAt: '2026-07-20T00:00:00.000Z',
      eventType: 'completion',
    })
    expect(result.snapshot.confirmed_causes).toHaveLength(2)
  })

  it.each([
    ['scope mismatch', { project_id: '66666666-6666-4666-8666-666666666666' }, 'structured_cause_scope_mismatch'],
    ['unknown taxonomy code', { cause_code: 'legacy_weather_delay' }, 'structured_cause_code_invalid'],
    ['taxonomy version drift', { taxonomy_version: 'v0.9.0' }, 'structured_cause_taxonomy_version_invalid'],
    ['invalid role', { cause_role: 'owner' }, 'structured_cause_role_invalid'],
    ['invalid event', { event_type: 'closure' }, 'structured_cause_event_invalid'],
    ['invalid id', { id: 'not-a-uuid' }, 'structured_cause_id_invalid'],
    ['missing confirmed timestamp', { confirmed_at: null }, 'structured_cause_confirmed_at_required'],
    ['malformed confirmation source', { confirmation_source: 'candidate' }, 'structured_cause_confirmation_source_invalid'],
  ])('fails closed for %s', async (_name, overrides, reason) => {
    const { result } = await read([confirmedPrimary(overrides)])

    expect(result.causeBenchmarkEligible).toBe(false)
    expect(result.confirmedPrimaryCause).toBeNull()
    expect(result.resolution).toEqual(expect.objectContaining({
      availability: 'unavailable',
      causeCode: null,
      reviewReasonCodes: [reason],
    }))
  })

  it('fails closed for ambiguous confirmed primary authority', async () => {
    const { result } = await read([
      confirmedPrimary(),
      confirmedPrimary({ id: '77777777-7777-4777-8777-777777777777', cause_code: 'quality_rework' }),
    ])

    expect(result.causeBenchmarkEligible).toBe(false)
    expect(result.resolution.reviewReasonCodes).toContain('structured_cause_primary_ambiguous')
  })

  it('fails closed when an active candidate primary conflicts with confirmed authority', async () => {
    const { result } = await read([
      confirmedPrimary(),
      confirmedPrimary({
        id: '88888888-8888-4888-8888-888888888888',
        status: 'candidate',
        cause_code: 'quality_rework',
        confirmation_source: 'candidate',
        confirmed_at: null,
      }),
    ])

    expect(result.causeBenchmarkEligible).toBe(false)
    expect(result.resolution).toEqual(expect.objectContaining({
      availability: 'review_required',
      reviewReasonCodes: ['structured_cause_candidate_primary_conflict'],
    }))
  })

  it('fails closed when the authority query cannot be read', async () => {
    const result = await readTaskStructuredCauseAuthority(scope, {
      queryExec: vi.fn(async () => { throw new Error('rls denied') }),
    })

    expect(result.causeBenchmarkEligible).toBe(false)
    expect(result.resolution.reviewReasonCodes).toEqual(['structured_cause_read_failed'])
  })
})
