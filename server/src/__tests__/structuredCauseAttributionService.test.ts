import { describe, expect, it, vi } from 'vitest'

import {
  STRUCTURED_CAUSE_TAXONOMY,
  buildStructuredCauseCandidates,
  confirmStructuredCauseAttribution,
  getStructuredCauseAttributionQualityMetrics,
  inferAndPersistTaskStructuredCauseAttributions,
  listStructuredCauseAttributions,
  loadTaskStructuredCauseEvidence,
  persistStructuredCauseCandidates,
  recordBaselinePublicationStructuredCause,
  recordUserConfirmedStructuredCauseAttribution,
} from '../services/structuredCauseAttributionService.js'
import { getMetricDefinition } from '../services/metricRegistryService.js'

describe('structuredCauseAttributionService', () => {
  it('parameterizes event and role filters while preserving backend newest-first order', async () => {
    const newestPrimaryDelay = {
      id: 'cause-new',
      event_type: 'delay',
      cause_role: 'primary',
      created_at: '2026-07-23T02:00:00.000Z',
    }
    const oldestPrimaryDelay = {
      id: 'cause-old',
      event_type: 'delay',
      cause_role: 'primary',
      created_at: '2026-07-22T02:00:00.000Z',
    }
    const queryExec = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      }

      expect(sql).toContain('($6::text IS NULL OR event_type = $6)')
      expect(sql).toContain('($7::text IS NULL OR cause_role = $7)')
      expect(sql).toContain('ORDER BY created_at DESC, id DESC')
      if (params[5] === 'delay' && params[6] === 'primary') {
        return { rows: [newestPrimaryDelay, oldestPrimaryDelay], rowCount: 2 }
      }
      if (params[5] === 'completion' && params[6] === 'contributing') {
        return {
          rows: [{ id: 'cause-completion', event_type: 'completion', cause_role: 'contributing' }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })

    const primaryDelayRows = await listStructuredCauseAttributions({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      status: 'confirmed',
      eventType: 'delay',
      causeRole: 'primary',
    }, { queryExec })
    const contributingCompletionRows = await listStructuredCauseAttributions({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      status: 'confirmed',
      eventType: 'completion',
      causeRole: 'contributing',
    }, { queryExec })
    await listStructuredCauseAttributions({
      companyId: 'company-1',
      projectId: 'project-1',
    }, { queryExec })

    expect(primaryDelayRows).toEqual([newestPrimaryDelay, oldestPrimaryDelay])
    expect(contributingCompletionRows).toEqual([
      expect.objectContaining({ id: 'cause-completion', event_type: 'completion', cause_role: 'contributing' }),
    ])
    const listCalls = queryExec.mock.calls.filter(([sql]) => String(sql).includes('FROM public.structured_cause_attributions'))
    expect(listCalls.map(([, params]) => params)).toEqual([
      ['company-1', 'project-1', 'task', null, 'confirmed', 'delay', 'primary'],
      ['company-1', 'project-1', 'task', null, 'confirmed', 'completion', 'contributing'],
      ['company-1', 'project-1', null, null, null, null, null],
    ])
  })

  it('records a baseline publication change log and its confirmed cause in one supplied transaction boundary', async () => {
    let changeLogId = ''
    const queryExec = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO public.change_logs')) {
        changeLogId = String(params?.[0] ?? '')
        return { rows: [{ id: changeLogId }], rowCount: 1 }
      }
      if (sql.includes('FROM public.change_logs')) {
        expect(params).toEqual([changeLogId, 'project-1'])
        return { rows: [{ id: changeLogId, project_id: 'project-1' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        expect(params?.[3]).toBe(changeLogId)
        return {
          rows: [{
            id: 'cause-baseline-1',
            subject_type: 'baseline_change',
            subject_id: changeLogId,
            cause_code: 'design_change',
            status: 'confirmed',
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })
    let transactionCallCount = 0
    const withTransaction = async <T>(work: () => Promise<T>): Promise<T> => {
      transactionCallCount += 1
      return work()
    }

    const result = await recordBaselinePublicationStructuredCause({
      companyId: 'company-1',
      projectId: 'project-1',
      baselineId: 'baseline-2',
      previousStatus: 'draft',
      nextStatus: 'confirmed',
      causeCode: 'design_change',
      rawText: '设计变更确认后调整主体结构节点。',
      actorId: 'user-1',
    }, {
      queryExec,
      withTransaction,
    })

    expect(transactionCallCount).toBe(1)
    expect(changeLogId).not.toBe('')
    expect(result).toEqual(expect.objectContaining({
      changeLogId,
      attribution: expect.objectContaining({
        subject_type: 'baseline_change',
        subject_id: changeLogId,
        status: 'confirmed',
      }),
    }))
    const changeLogInsert = queryExec.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.change_logs'))
    expect(changeLogInsert?.[1]).toEqual(expect.arrayContaining([
      'project-1',
      'baseline-2',
      '设计变更确认后调整主体结构节点。',
      'user-1',
    ]))
    expect(String(changeLogInsert?.[0])).toContain("'baseline_publish'")
    expect(String(changeLogInsert?.[1]?.[9])).toContain('"causeCode":"design_change"')
  })

  it('rejects a cross-tenant baseline publication cause before creating its change log', async () => {
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-2' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    await expect(recordBaselinePublicationStructuredCause({
      companyId: 'company-1',
      projectId: 'project-1',
      baselineId: 'baseline-2',
      previousStatus: 'draft',
      nextStatus: 'confirmed',
      causeCode: 'design_change',
      rawText: '设计变更确认后调整主体结构节点。',
      actorId: 'user-1',
    }, {
      queryExec,
      withTransaction: async (work) => work(),
    })).rejects.toMatchObject({ code: 'CAUSE_ATTRIBUTION_TENANT_MISMATCH' })

    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.change_logs'))).toBe(false)
  })

  it('publishes a controlled business taxonomy without conflating contractual responsibility', () => {
    const codes = STRUCTURED_CAUSE_TAXONOMY.map((entry) => entry.code)

    expect(codes).toEqual(expect.arrayContaining([
      'predecessor_delay',
      'material_shortage',
      'labor_shortage',
      'equipment_unavailable',
      'design_change',
      'drawing_delay',
      'quality_rework',
      'weather_impact',
      'owner_decision',
      'government_inspection',
      'site_capacity_pressure',
      'other',
    ]))
    expect(STRUCTURED_CAUSE_TAXONOMY.every((entry) => !('responsibilityClass' in entry))).toBe(true)
  })

  it('auto-confirms a well-grounded material cause and keeps dependency transmission separate', () => {
    const candidates = buildStructuredCauseCandidates({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      subjectId: 'task-1',
      eventType: 'delay',
      impactDays: 8,
      windowStart: '2026-04-01',
      windowEnd: '2026-04-20',
      evidence: [
        {
          sourceType: 'task_obstacle',
          sourceId: 'obstacle-1',
          occurredAt: '2026-04-02T00:00:00.000Z',
          attributes: { obstacleType: 'material', severity: 'high' },
        },
        {
          sourceType: 'material_arrival',
          sourceId: 'material-1',
          occurredAt: '2026-04-03T00:00:00.000Z',
          attributes: { expectedArrivalDate: '2026-04-03', actualArrivalDate: '2026-04-12' },
        },
        {
          sourceType: 'task_dependency',
          sourceId: 'dependency-1',
          occurredAt: '2026-04-01T00:00:00.000Z',
          attributes: { upstreamTaskId: 'task-upstream', upstreamDelayDays: 5 },
        },
      ],
    })

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        causeCode: 'material_shortage',
        causeRole: 'primary',
        status: 'confirmed',
        autoConfirmed: true,
        responsibilityClass: null,
        evidenceRefs: expect.arrayContaining([
          'task_obstacle:obstacle-1',
          'material_arrival:material-1',
        ]),
      }),
      expect.objectContaining({
        causeCode: 'predecessor_delay',
        causeRole: 'transmitted',
        status: 'candidate',
        autoConfirmed: false,
        responsibilityClass: null,
      }),
    ]))
  })

  it('keeps manual text as review-required raw evidence', () => {
    const candidates = buildStructuredCauseCandidates({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      subjectId: 'task-1',
      eventType: 'delay',
      rawText: 'material not delivered',
      evidence: [],
    })

    expect(candidates).toEqual([
      expect.objectContaining({
        causeCode: 'other',
        availability: 'review_required',
        rawText: 'material not delivered',
        status: 'candidate',
        autoConfirmed: false,
        reviewReasonCodes: ['manual_text_requires_user_confirmation'],
      }),
    ])
  })

  it('rejects offline labels as new production evidence', () => {
    expect(() => buildStructuredCauseCandidates({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      subjectId: 'task-1',
      eventType: 'completion',
      rawText: '现场临时协调后恢复',
      evidence: [
        {
          sourceType: 'offline_label' as never,
          sourceId: 'label-1',
          attributes: { suggestedCauseCode: 'labor_shortage', confidence: 0.99 },
        },
        {
          sourceType: 'manual_text',
          sourceId: 'text-1',
          attributes: { text: '现场临时协调后恢复' },
        },
      ],
    })).toThrowError(/CAUSE_EVIDENCE_SOURCE_UNSUPPORTED/)
  })

  it('uses nonblank manual evidence text for candidate identity and persistence fallback', async () => {
    const scope = {
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task' as const,
      subjectId: 'task-1',
      eventType: 'delay' as const,
      evidence: [{
        sourceType: 'manual_text' as const,
        sourceId: 'task:task-1:delay_reason',
        attributes: { text: 'Evidence fallback text' },
      }],
    }
    const [omitted] = buildStructuredCauseCandidates(scope)
    const [whitespace] = buildStructuredCauseCandidates({ ...scope, rawText: '   ' })
    const [direct] = buildStructuredCauseCandidates({
      ...scope,
      rawText: '  evidence   FALLBACK text  ',
      evidence: [],
    })

    for (const candidate of [omitted, whitespace]) {
      expect(candidate).toEqual(expect.objectContaining({
        causeCode: 'other',
        availability: 'review_required',
        status: 'candidate',
        autoConfirmed: false,
        rawText: 'Evidence fallback text',
        responsibilityBasis: null,
        reviewReasonCodes: ['manual_text_requires_user_confirmation'],
      }))
    }
    expect(whitespace.dedupeKey).toBe(omitted.dedupeKey)
    expect(direct.dedupeKey).toBe(omitted.dedupeKey)
    expect(buildStructuredCauseCandidates({
      ...scope,
      rawText: '   ',
      evidence: [{
        sourceType: 'manual_text',
        sourceId: 'empty-manual-text',
        attributes: { text: '\t' },
      }],
    })).toEqual([])

    let insertParams: unknown[] | undefined
    const queryExec = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.tasks') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 'task-1' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        insertParams = params
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 0 }
    })
    const [persisted] = await persistStructuredCauseCandidates(
      { ...scope, rawText: '   ' },
      { queryExec, withTransaction: async (work) => work() },
    )

    expect(insertParams?.[9]).toBe('Evidence fallback text')
    expect(persisted).toEqual(expect.objectContaining({
      rawText: 'Evidence fallback text',
      dedupeKey: omitted.dedupeKey,
    }))
  })

  it('persists manual other candidates with collision-proof idempotent identity', async () => {
    const scope = {
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task' as const,
      subjectId: 'task-1',
      eventType: 'delay' as const,
      windowStart: '2026-04-01',
      windowEnd: '2026-04-20',
    }
    const existingOther = buildStructuredCauseCandidates({
      ...scope,
      evidence: [{
        sourceType: 'task_obstacle',
        sourceId: 'obstacle-unclassified',
        attributes: { obstacleType: 'unclassified' },
      }],
    })[0]
    const stored = new Map<string, Record<string, unknown>>([[
      existingOther.dedupeKey,
      {
        id: 'confirmed-other-1',
        dedupe_key: existingOther.dedupeKey,
        cause_code: 'other',
        cause_role: 'primary',
        status: 'confirmed',
        auto_confirmed: false,
        confirmation_source: 'user_confirmed',
        raw_text: null,
        review_reason_codes: [],
      },
    ]])
    let nextId = 1
    let lastUpsertSql = ''
    const queryExec = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.tasks') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 'task-1' }], rowCount: 1 }
      }
      if (!sql.includes('INSERT INTO public.structured_cause_attributions')) {
        return { rows: [], rowCount: 0 }
      }
      lastUpsertSql = sql

      const evidenceSourceTypes = JSON.parse(String(params[11])) as string[]
      const incoming = {
        id: `manual-other-${nextId}`,
        dedupe_key: String(params[20]),
        cause_code: String(params[5]),
        prefilled_cause_code: String(params[5]),
        prefill_modified: null,
        cause_role: String(params[6]),
        responsibility_class: null,
        responsibility_basis: params[8],
        status: String(params[16]),
        auto_confirmed: params[17] === true,
        confirmation_source: String(params[18]),
        confirmed_by: null,
        confirmed_at: null,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
        raw_text: params[9],
        review_reason_codes: JSON.parse(String(params[19])) as string[],
        evidence_source_types: evidenceSourceTypes,
      }
      const current = stored.get(incoming.dedupe_key)
      if (!current) {
        nextId += 1
        stored.set(incoming.dedupe_key, incoming)
        return { rows: [{ ...incoming }], rowCount: 1 }
      }

      const resetsManualConflict = /EXCLUDED\.evidence_source_types\s+@>\s+'\["manual_text"\]'::jsonb/.test(sql)
      if (evidenceSourceTypes.includes('manual_text') && resetsManualConflict) {
        Object.assign(current, {
          cause_code: incoming.cause_code,
          prefilled_cause_code: incoming.prefilled_cause_code,
          prefill_modified: incoming.prefill_modified,
          status: 'candidate',
          auto_confirmed: false,
          confirmation_source: 'candidate',
          responsibility_class: null,
          responsibility_basis: null,
          confirmed_by: null,
          confirmed_at: null,
          rejected_by: null,
          rejected_at: null,
          rejection_reason: null,
          raw_text: incoming.raw_text,
          review_reason_codes: ['manual_text_requires_user_confirmation'],
        })
      } else {
        current.status = ['confirmed', 'rejected'].includes(String(current.status))
          ? current.status
          : incoming.status
        current.auto_confirmed = current.auto_confirmed === true || incoming.auto_confirmed
      }
      return { rows: [{ ...current }], rowCount: 1 }
    })
    const manualInput = (rawText: string) => ({
      ...scope,
      rawText,
      evidence: [],
    })
    const dependencies = {
      queryExec,
      withTransaction: async <T>(work: () => Promise<T>) => work(),
    }

    const [created] = await persistStructuredCauseCandidates(
      manualInput('Material not delivered'),
      dependencies,
    )
    expect(stored.size).toBe(2)
    expect(created).toEqual(expect.objectContaining({
      status: 'candidate',
      auto_confirmed: false,
      confirmation_source: 'candidate',
      review_reason_codes: ['manual_text_requires_user_confirmation'],
    }))
    expect(created.dedupe_key).not.toBe(existingOther.dedupeKey)

    const persistedManual = stored.get(String(created.dedupe_key))!
    Object.assign(persistedManual, {
      cause_code: 'material_shortage',
      prefilled_cause_code: 'other',
      prefill_modified: true,
      status: 'confirmed',
      auto_confirmed: true,
      confirmation_source: 'user_confirmed',
      responsibility_class: 'contractor_attributable',
      responsibility_basis: 'supplier_default',
      confirmed_by: 'reviewer-1',
      confirmed_at: '2026-04-21T08:00:00.000Z',
      rejected_by: 'reviewer-2',
      rejected_at: '2026-04-22T08:00:00.000Z',
      rejection_reason: 'stale rejection decision',
      review_reason_codes: [],
    })
    const [repeated] = await persistStructuredCauseCandidates(
      manualInput('  material   NOT delivered  '),
      dependencies,
    )
    expect(stored.size).toBe(2)
    expect(repeated).toEqual(expect.objectContaining({
      id: created.id,
      dedupe_key: created.dedupe_key,
      cause_code: 'other',
      prefilled_cause_code: 'other',
      prefill_modified: null,
      status: 'candidate',
      auto_confirmed: false,
      confirmation_source: 'candidate',
      responsibility_class: null,
      responsibility_basis: null,
      confirmed_by: null,
      confirmed_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      raw_text: 'material   NOT delivered',
      review_reason_codes: ['manual_text_requires_user_confirmation'],
    }))
    expect(lastUpsertSql).toContain('evidence_refs = EXCLUDED.evidence_refs')
    expect(lastUpsertSql).toContain('evidence_source_types = EXCLUDED.evidence_source_types')
    for (const field of [
      'cause_code',
      'prefilled_cause_code',
      'prefill_modified',
      'status',
      'auto_confirmed',
      'confirmation_source',
      'raw_text',
      'review_reason_codes',
      'responsibility_class',
      'responsibility_basis',
      'confirmed_by',
      'confirmed_at',
      'rejected_by',
      'rejected_at',
      'rejection_reason',
    ]) {
      expect(lastUpsertSql).toMatch(new RegExp(
        `(?:^|\\n)\\s*${field}\\s*=\\s*CASE[\\s\\S]*?manual_text[\\s\\S]*?THEN\\s+EXCLUDED\\.${field}`,
      ))
    }

    const [different] = await persistStructuredCauseCandidates(
      manualInput('Supplier approval pending'),
      dependencies,
    )
    expect(stored.size).toBe(3)
    expect(different.dedupe_key).not.toBe(created.dedupe_key)
  })

  it('rejects cross-tenant persistence before writing candidate rows', async () => {
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-other' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    await expect(persistStructuredCauseCandidates({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      subjectId: 'task-1',
      eventType: 'delay',
      evidence: [],
    }, {
      queryExec,
      withTransaction: async (work) => work(),
    })).rejects.toMatchObject({ code: 'CAUSE_ATTRIBUTION_TENANT_MISMATCH' })

    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.structured_cause_attributions'))).toBe(false)
  })

  it('serializes concurrent delay/completion candidate primaries on one task authority row', async () => {
    const activeRows: Array<Record<string, unknown>> = []
    let nextId = 1
    let taskLockOwner: string | null = null
    const taskLockWaiters: Array<() => void> = []
    let secondTransactionStarted!: () => void
    const secondTransaction = new Promise<void>((resolve) => { secondTransactionStarted = resolve })

    const dependenciesFor = (name: 'first' | 'second') => {
      const queryExec = vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM public.projects')) {
          return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
        }
        if (sql.includes('FROM public.tasks') && sql.includes('FOR UPDATE')) {
          if (taskLockOwner && taskLockOwner !== name) {
            await new Promise<void>((resolve) => taskLockWaiters.push(resolve))
          }
          taskLockOwner = name
          return { rows: [{ id: 'task-1' }], rowCount: 1 }
        }
        if (sql.includes("SET status = 'superseded'")) {
          for (const row of activeRows) {
            if (
              ['candidate', 'confirmed'].includes(String(row.status))
              && row.cause_role === 'primary'
              && row.dedupe_key !== params[3]
            ) row.status = 'superseded'
          }
          return { rows: [], rowCount: 0 }
        }
        if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
          if (name === 'first') await secondTransaction
          const dedupeKey = String(params[20])
          const existing = activeRows.find((row) => row.dedupe_key === dedupeKey)
          if (existing) return { rows: [{ ...existing }], rowCount: 1 }
          const row = {
            id: `candidate-${nextId++}`,
            event_type: String(params[4]),
            cause_code: String(params[5]),
            cause_role: String(params[6]),
            status: String(params[16]),
            dedupe_key: dedupeKey,
          }
          activeRows.push(row)
          return { rows: [{ ...row }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      })
      return {
        queryExec,
        withTransaction: async <T>(work: () => Promise<T>) => {
          if (name === 'second') secondTransactionStarted()
          try {
            return await work()
          } finally {
            if (taskLockOwner === name) {
              taskLockOwner = null
              taskLockWaiters.shift()?.()
            }
          }
        },
      }
    }
    const input = (eventType: 'delay' | 'completion', rawText: string) => ({
      companyId: 'company-1', projectId: 'project-1', subjectType: 'task' as const, subjectId: 'task-1',
      eventType, rawText, evidence: [],
    })

    await Promise.all([
      persistStructuredCauseCandidates(input('delay', 'Material delay'), dependenciesFor('first')),
      persistStructuredCauseCandidates(input('completion', 'Completion review'), dependenciesFor('second')),
    ])

    const activePrimaries = activeRows.filter((row) => (
      ['candidate', 'confirmed'].includes(String(row.status)) && row.cause_role === 'primary'
    ))
    expect(activePrimaries).toHaveLength(1)
    expect(activePrimaries[0]).toEqual(expect.objectContaining({ event_type: 'completion' }))
  })

  it('requires explicit confirmation before assigning contractual responsibility', async () => {
    const lifecycle: string[] = []
    const registeredEffects: Array<() => Promise<void>> = []
    const enqueueDurationExperienceRebuild = vi.fn(async () => {
      lifecycle.push('enqueue')
      return { id: 'queue-confirm-1' }
    })
    const completeDurationExperienceRebuild = vi.fn(async () => {
      lifecycle.push('complete')
    })
    const rebuildTaskDurationExperienceSample = vi.fn(async () => {
      lifecycle.push('rebuild')
      return true
    })
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.tasks') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 'task-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.structured_cause_attributions')) {
        return {
          rows: [{
            id: 'attribution-1',
            company_id: 'company-1',
            project_id: 'project-1',
            subject_type: 'task',
            subject_id: 'task-1',
            event_type: 'delay',
            cause_code: 'material_shortage',
            cause_role: 'primary',
            status: 'candidate',
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE public.structured_cause_attributions') && sql.includes('RETURNING')) {
        lifecycle.push('confirm')
        return {
          rows: [{
            id: 'attribution-1',
            status: 'confirmed',
            responsibility_class: 'contractor_attributable',
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })

    const result = await confirmStructuredCauseAttribution({
      attributionId: 'attribution-1',
      companyId: 'company-1',
      projectId: 'project-1',
      actorId: 'user-1',
      responsibilityClass: 'contractor_attributable',
      responsibilityBasis: 'user_confirmed_contract_boundary',
    }, {
      queryExec,
      withTransaction: async (work) => work(),
      registerPostCommitEffect: async (_label, effect) => {
        lifecycle.push('register')
        registeredEffects.push(effect)
      },
      enqueueDurationExperienceRebuild,
      completeDurationExperienceRebuild,
      rebuildTaskDurationExperienceSample,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'confirmed',
      responsibility_class: 'contractor_attributable',
    }))
    const statements = queryExec.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim())
    const identityRead = statements.findIndex((sql) => (
      sql.includes('FROM public.structured_cause_attributions') && !sql.includes('FOR UPDATE')
    ))
    const taskLock = statements.findIndex((sql) => sql.includes('FROM public.tasks') && sql.includes('FOR UPDATE'))
    const attributionLock = statements.findIndex((sql) => (
      sql.includes('FROM public.structured_cause_attributions') && sql.includes('FOR UPDATE')
    ))
    expect(identityRead).toBeGreaterThanOrEqual(0)
    expect(taskLock).toBeGreaterThan(identityRead)
    expect(attributionLock).toBeGreaterThan(taskLock)
    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes("confirmation_source = 'user_confirmed'"))).toBe(true)
    const supersede = queryExec.mock.calls.find(([sql]) => String(sql).includes("SET status = 'superseded'"))
    expect(supersede?.[0]).toContain("event_type IN ('delay', 'completion')")
    expect(supersede?.[0]).toContain("status IN ('candidate', 'confirmed')")
    expect(enqueueDurationExperienceRebuild).toHaveBeenCalledWith({
      companyId: 'company-1', projectId: 'project-1', taskId: 'task-1', actorId: 'user-1',
      trigger: 'structured_cause_user_confirmation',
    })
    expect(lifecycle).toEqual(['confirm', 'enqueue', 'register'])
    expect(rebuildTaskDurationExperienceSample).not.toHaveBeenCalled()
    expect(registeredEffects).toHaveLength(1)
    await registeredEffects[0]()
    expect(rebuildTaskDurationExperienceSample).toHaveBeenCalledWith({
      companyId: 'company-1', projectId: 'project-1', taskId: 'task-1', actorId: 'user-1',
      trigger: 'structured_cause_user_confirmation',
    })
    expect(completeDurationExperienceRebuild).toHaveBeenCalledWith('queue-confirm-1')
    expect(lifecycle).toEqual(['confirm', 'enqueue', 'register', 'rebuild', 'complete'])
  })

  it('keeps the inferred prefill and records whether a user changed it during confirmation', async () => {
    const queryExec = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM public.tasks') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 'task-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.structured_cause_attributions')) {
        return {
          rows: [{
            id: 'attribution-1',
            company_id: 'company-1',
            project_id: 'project-1',
            subject_type: 'task',
            subject_id: 'task-1',
            event_type: 'delay',
            cause_code: 'material_shortage',
            prefilled_cause_code: 'material_shortage',
            cause_role: 'primary',
            status: 'candidate',
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE public.structured_cause_attributions') && sql.includes('RETURNING')) {
        expect(sql).toContain('prefilled_cause_code IS DISTINCT FROM')
        expect(params).toContain('design_change')
        return {
          rows: [{
            id: 'attribution-1',
            cause_code: 'design_change',
            prefilled_cause_code: 'material_shortage',
            prefill_modified: true,
            status: 'confirmed',
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })

    const result = await confirmStructuredCauseAttribution({
      attributionId: 'attribution-1',
      companyId: 'company-1',
      projectId: 'project-1',
      actorId: 'user-1',
      causeCode: 'design_change',
    }, {
      queryExec,
      withTransaction: async (work) => work(),
      registerPostCommitEffect: async () => undefined,
      enqueueDurationExperienceRebuild: async () => ({ id: 'queue-prefill-1' }),
      completeDurationExperienceRebuild: async () => undefined,
      rebuildTaskDurationExperienceSample: async () => true,
    })

    expect(result).toEqual(expect.objectContaining({
      cause_code: 'design_change',
      prefilled_cause_code: 'material_shortage',
      prefill_modified: true,
    }))
  })

  it('returns tenant-scoped cause-quality metrics and conservative revision signals', async () => {
    const queryExec = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      }
      if (sql.includes('confirmed_count')) {
        expect(sql).toContain('company_id = $1')
        expect(sql).toContain('project_id = $2')
        expect(params).toEqual(['company-1', 'project-1'])
        return {
          rows: [{
            confirmed_count: '25',
            other_count: '6',
            prefill_reviewed_count: '20',
            prefill_modified_count: '7',
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })

    const result = await getStructuredCauseAttributionQualityMetrics({
      companyId: 'company-1',
      projectId: 'project-1',
    }, { queryExec })

    expect(result).toEqual(expect.objectContaining({
      companyId: 'company-1',
      projectId: 'project-1',
      otherRate: {
        metricKey: 'structured_cause_other_rate',
        numerator: 6,
        denominator: 25,
        value: 24,
        availability: 'ready',
      },
      prefillModificationRate: {
        metricKey: 'structured_cause_prefill_modification_rate',
        numerator: 7,
        denominator: 20,
        value: 35,
        availability: 'ready',
      },
    }))
    expect(result.revisionSignals).toEqual([
      expect.objectContaining({
        candidateType: 'taxonomy_revision',
        reasonCode: 'structured_cause_other_rate_above_threshold',
      }),
      expect.objectContaining({
        candidateType: 'inference_rule_revision',
        reasonCode: 'structured_cause_prefill_modification_rate_above_threshold',
      }),
    ])
  })

  it('registers cause-quality metrics without making them daily snapshot facts', () => {
    expect(getMetricDefinition('structured_cause_other_rate')).toEqual(expect.objectContaining({
      source: 'structuredCauseAttributionService',
      dataType: 'percentage',
      snapshotPolicy: 'none',
    }))
    expect(getMetricDefinition('structured_cause_prefill_modification_rate')).toEqual(expect.objectContaining({
      source: 'structuredCauseAttributionService',
      dataType: 'percentage',
      snapshotPolicy: 'none',
    }))
  })

  it('records a user-confirmed risk cause only after tenant and subject scope checks', async () => {
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.risks')) {
        return { rows: [{ project_id: 'project-1' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        return {
          rows: [{
            id: 'cause-risk-1',
            status: 'confirmed',
            cause_code: 'material_shortage',
            confirmation_source: 'user_confirmed',
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })

    const result = await recordUserConfirmedStructuredCauseAttribution({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'risk',
      subjectId: 'risk-1',
      eventType: 'closure',
      causeCode: 'material_shortage',
      causeRole: 'primary',
      rawText: 'Material delivery recovered after supplier replacement.',
      actorId: 'user-1',
      responsibilityClass: 'contractor_attributable',
      responsibilityBasis: 'Confirmed by the project editor.',
    }, {
      queryExec,
      withTransaction: async (work) => work(),
    })

    expect(result).toEqual(expect.objectContaining({
      id: 'cause-risk-1',
      status: 'confirmed',
      confirmation_source: 'user_confirmed',
    }))
    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes('FROM public.risks'))).toBe(true)
    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes("status = 'superseded'"))).toBe(true)
    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.structured_cause_attributions'))).toBe(true)
  })

  it('supersedes stale task primaries across delay/completion and rebuilds duration evidence after commit', async () => {
    const lifecycle: string[] = []
    const registeredEffects: Array<() => Promise<void>> = []
    const enqueueDurationExperienceRebuild = vi.fn(async () => {
      lifecycle.push('enqueue')
      return { id: 'queue-record-1' }
    })
    const completeDurationExperienceRebuild = vi.fn(async () => {
      lifecycle.push('complete')
    })
    const rebuildTaskDurationExperienceSample = vi.fn(async () => {
      lifecycle.push('rebuild')
      return true
    })
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (sql.includes('FROM public.tasks')) return { rows: [{ id: 'task-1' }], rowCount: 1 }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        lifecycle.push('confirm')
        return { rows: [{ id: 'confirmed-1', status: 'confirmed', cause_code: 'material_shortage' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    await recordUserConfirmedStructuredCauseAttribution({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      subjectId: 'task-1',
      eventType: 'delay',
      causeCode: 'material_shortage',
      causeRole: 'primary',
      rawText: 'Original material delay wording.',
      actorId: 'user-1',
    }, {
      queryExec,
      withTransaction: async (work) => work(),
      registerPostCommitEffect: async (_label, effect) => {
        lifecycle.push('register')
        registeredEffects.push(effect)
      },
      enqueueDurationExperienceRebuild,
      completeDurationExperienceRebuild,
      rebuildTaskDurationExperienceSample,
    })

    const supersede = queryExec.mock.calls.find(([sql]) => String(sql).includes("SET status = 'superseded'"))
    const statements = queryExec.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim())
    const taskLockIndex = statements.findIndex((sql) => sql.includes('FROM public.tasks') && sql.includes('FOR UPDATE'))
    const supersedeIndex = statements.findIndex((sql) => sql.includes("SET status = 'superseded'"))
    const insertIndex = statements.findIndex((sql) => sql.includes('INSERT INTO public.structured_cause_attributions'))
    expect(taskLockIndex).toBeGreaterThan(0)
    expect(taskLockIndex).toBeLessThan(supersedeIndex)
    expect(supersedeIndex).toBeLessThan(insertIndex)
    expect(supersede?.[0]).toContain("event_type IN ('delay', 'completion')")
    expect(supersede?.[0]).toContain("status IN ('candidate', 'confirmed')")
    expect(supersede?.[0]).toContain('dedupe_key <>')
    expect(enqueueDurationExperienceRebuild).toHaveBeenCalledWith({
      companyId: 'company-1', projectId: 'project-1', taskId: 'task-1', actorId: 'user-1',
      trigger: 'structured_cause_user_confirmation',
    })
    expect(lifecycle).toEqual(['confirm', 'enqueue', 'register'])
    expect(rebuildTaskDurationExperienceSample).not.toHaveBeenCalled()
    expect(registeredEffects).toHaveLength(1)

    await registeredEffects[0]()
    expect(rebuildTaskDurationExperienceSample).toHaveBeenCalledOnce()
    expect(rebuildTaskDurationExperienceSample).toHaveBeenCalledWith({
      companyId: 'company-1',
      projectId: 'project-1',
      taskId: 'task-1',
      actorId: 'user-1',
      trigger: 'structured_cause_user_confirmation',
    })
    expect(completeDurationExperienceRebuild).toHaveBeenCalledWith('queue-record-1')
    expect(lifecycle).toEqual(['confirm', 'enqueue', 'register', 'rebuild', 'complete'])
  })

  it('does not take the task-primary lock or supersede authority for a contributing task cause', async () => {
    const enqueueDurationExperienceRebuild = vi.fn()
    const registerPostCommitEffect = vi.fn()
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (sql.includes('FROM public.tasks')) return { rows: [{ id: 'task-1' }], rowCount: 1 }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        return { rows: [{ id: 'contributing-1', cause_role: 'contributing', status: 'confirmed' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    await recordUserConfirmedStructuredCauseAttribution({
      companyId: 'company-1', projectId: 'project-1', subjectType: 'task', subjectId: 'task-1',
      eventType: 'delay', causeCode: 'weather_impact', causeRole: 'contributing',
      rawText: 'Weather contributed to delay.', actorId: 'user-1',
    }, {
      queryExec,
      withTransaction: async (work) => work(),
      enqueueDurationExperienceRebuild,
      registerPostCommitEffect,
    })

    const statements = queryExec.mock.calls.map(([sql]) => String(sql))
    expect(statements.some((sql) => sql.includes('FROM public.tasks') && sql.includes('FOR UPDATE'))).toBe(false)
    expect(statements.some((sql) => sql.includes("SET status = 'superseded'"))).toBe(false)
    expect(enqueueDurationExperienceRebuild).not.toHaveBeenCalled()
    expect(registerPostCommitEffect).not.toHaveBeenCalled()
  })

  it('retains durable rebuild work when the post-commit rebuild fails', async () => {
    const registeredEffects: Array<() => Promise<void>> = []
    const enqueueDurationExperienceRebuild = vi.fn(async () => ({ id: 'queue-failed-rebuild' }))
    const completeDurationExperienceRebuild = vi.fn(async () => undefined)
    const rebuildTaskDurationExperienceSample = vi.fn(async () => {
      throw new Error('rebuild unavailable')
    })
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (sql.includes('FROM public.tasks')) return { rows: [{ id: 'task-1' }], rowCount: 1 }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        return { rows: [{ id: 'confirmed-1', status: 'confirmed' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    await recordUserConfirmedStructuredCauseAttribution({
      companyId: 'company-1', projectId: 'project-1', subjectType: 'task', subjectId: 'task-1',
      eventType: 'completion', causeCode: 'material_shortage', causeRole: 'primary',
      rawText: 'Confirmed after completion.', actorId: 'user-1',
    }, {
      queryExec,
      withTransaction: async (work) => work(),
      enqueueDurationExperienceRebuild,
      completeDurationExperienceRebuild,
      registerPostCommitEffect: async (_label, effect) => { registeredEffects.push(effect) },
      rebuildTaskDurationExperienceSample,
    })

    expect(enqueueDurationExperienceRebuild).toHaveBeenCalledOnce()
    expect(registeredEffects).toHaveLength(1)
    await expect(registeredEffects[0]()).rejects.toThrow('rebuild unavailable')
    expect(completeDurationExperienceRebuild).not.toHaveBeenCalled()
  })

  it('rolls back confirmation and registers no effect when durable enqueue fails', async () => {
    let rolledBack = false
    const enqueueDurationExperienceRebuild = vi.fn(async () => {
      throw new Error('queue unavailable')
    })
    const registerPostCommitEffect = vi.fn()
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (sql.includes('FROM public.tasks')) return { rows: [{ id: 'task-1' }], rowCount: 1 }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        return { rows: [{ id: 'confirmed-1', status: 'confirmed' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    await expect(recordUserConfirmedStructuredCauseAttribution({
      companyId: 'company-1', projectId: 'project-1', subjectType: 'task', subjectId: 'task-1',
      eventType: 'completion', causeCode: 'material_shortage', causeRole: 'primary',
      rawText: 'Confirmed after completion.', actorId: 'user-1',
    }, {
      queryExec,
      withTransaction: async (work) => {
        try {
          return await work()
        } catch (error) {
          rolledBack = true
          throw error
        }
      },
      enqueueDurationExperienceRebuild,
      registerPostCommitEffect,
    })).rejects.toThrow('queue unavailable')

    expect(rolledBack).toBe(true)
    expect(registerPostCommitEffect).not.toHaveBeenCalled()
  })

  it('discards the task sample rebuild effect when confirmation rolls back', async () => {
    let pendingEffects: Array<() => Promise<void>> = []
    const rebuildTaskDurationExperienceSample = vi.fn(async () => true)
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (sql.includes('FROM public.tasks')) return { rows: [{ id: 'task-1' }], rowCount: 1 }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) throw new Error('confirmation write failed')
      return { rows: [], rowCount: 0 }
    })

    await expect(recordUserConfirmedStructuredCauseAttribution({
      companyId: 'company-1', projectId: 'project-1', subjectType: 'task', subjectId: 'task-1',
      eventType: 'completion', causeCode: 'material_shortage', causeRole: 'primary',
      rawText: 'Original material delay wording.', actorId: 'user-1',
    }, {
      queryExec,
      withTransaction: async (work) => {
        try {
          return await work()
        } catch (error) {
          pendingEffects = []
          throw error
        }
      },
      registerPostCommitEffect: async (_label, effect) => { pendingEffects.push(effect) },
      rebuildTaskDurationExperienceSample,
    })).rejects.toThrow('confirmation write failed')

    expect(pendingEffects).toHaveLength(0)
    expect(rebuildTaskDurationExperienceSample).not.toHaveBeenCalled()
  })

  it('fails closed without an unscoped subject lookup when the subject is outside the project', async () => {
    const queryExec = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.issues')) {
        expect(sql).toContain('AND project_id = $2')
        expect(params).toEqual(['issue-1', 'project-1'])
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 0 }
    })

    await expect(recordUserConfirmedStructuredCauseAttribution({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'issue',
      subjectId: 'issue-1',
      eventType: 'closure',
      causeCode: 'quality_rework',
      causeRole: 'primary',
      rawText: 'Rework was completed.',
      actorId: 'user-1',
    }, {
      queryExec,
      withTransaction: async (work) => work(),
    })).rejects.toMatchObject({ code: 'CAUSE_ATTRIBUTION_SUBJECT_NOT_FOUND' })

    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.structured_cause_attributions'))).toBe(false)
  })

  it('loads task evidence from existing fact tables without relying on free text as the primary source', async () => {
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (sql.includes('FROM public.task_obstacles')) {
        return { rows: [{ id: 'obstacle-1', obstacle_type: 'material', severity: 'high', created_at: '2026-04-02' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.task_conditions')) {
        return { rows: [{ id: 'condition-1', condition_type: 'design-change', name: 'Drawing approval', created_at: '2026-04-03' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.task_dependencies')) {
        return { rows: [{ id: 'dependency-1', dependency_task_id: 'upstream-1', upstream_delay_days: 5 }], rowCount: 1 }
      }
      if (sql.includes('FROM public.material_arrival_to_condition')) {
        return { rows: [{ id: 'arrival-1', material_id: 'material-1', expected_arrival_date: '2026-04-01', actual_arrival_date: '2026-04-10' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.task_duration_forecasts')) {
        return {
          rows: [{ id: 'forecast-1', factor_summary: { factors: [{ key: 'weather_forecast_impact', reason: 'rain' }] } }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })

    const evidence = await loadTaskStructuredCauseEvidence({
      companyId: 'company-1',
      projectId: 'project-1',
      taskId: 'task-1',
      windowStart: '2026-04-01',
      windowEnd: '2026-04-20',
    }, { queryExec })

    expect(evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'task_obstacle', sourceId: 'obstacle-1' }),
      expect.objectContaining({ sourceType: 'task_condition', sourceId: 'condition-1' }),
      expect.objectContaining({ sourceType: 'task_dependency', sourceId: 'dependency-1' }),
      expect.objectContaining({ sourceType: 'material_arrival', sourceId: 'arrival-1' }),
      expect.objectContaining({
        sourceType: 'forecast_factor',
        sourceId: 'forecast-1:weather_forecast_impact',
        attributes: expect.objectContaining({ factorKey: 'weather_forecast_impact' }),
      }),
    ]))
    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes('manual_text'))).toBe(false)
  })

  it('binds only the parameters referenced by each task evidence query', async () => {
    const queryExec = vi.fn(async (sql: string, params: unknown[] = []) => {
      const referencedParameters = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]))
      const expectedParameterCount = referencedParameters.length > 0
        ? Math.max(...referencedParameters)
        : 0

      expect(params).toHaveLength(expectedParameterCount)
      if (sql.includes('FROM public.projects')) {
        return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    await loadTaskStructuredCauseEvidence({
      companyId: 'company-1',
      projectId: 'project-1',
      taskId: 'task-1',
      windowStart: '2026-04-01',
      windowEnd: '2026-04-20',
    }, { queryExec })
  })

  it('infers and persists task causes from facts before completion learning consumes them', async () => {
    const queryExec = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (sql.includes('FROM public.tasks')) return { rows: [{ id: 'task-1' }], rowCount: 1 }
      if (sql.includes('FROM public.task_obstacles')) {
        return { rows: [{ id: 'obstacle-1', obstacle_type: 'material', severity: 'high', created_at: '2026-04-02' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.task_conditions')) return { rows: [], rowCount: 0 }
      if (sql.includes('FROM public.task_dependencies')) return { rows: [], rowCount: 0 }
      if (sql.includes('FROM public.material_arrival_to_condition')) {
        return { rows: [{ id: 'arrival-1', material_id: 'material-1', expected_arrival_date: '2026-04-04', actual_arrival_date: '2026-04-12' }], rowCount: 1 }
      }
      if (sql.includes('FROM public.task_duration_forecasts')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        return { rows: [{ id: 'cause-1', cause_code: 'material_shortage', status: 'confirmed' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    const rows = await inferAndPersistTaskStructuredCauseAttributions({
      task: {
        id: 'task-1',
        project_id: 'project-1',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
        actual_start_date: '2026-04-01',
        actual_end_date: '2026-04-18',
        delay_reason: 'Material delivery recovered after supplier replacement.',
      },
    }, {
      queryExec,
      withTransaction: async (work) => work(),
    })

    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({
      cause_code: 'material_shortage',
      status: 'confirmed',
    })]))
    const insertCall = queryExec.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.structured_cause_attributions'))
    expect(insertCall?.[1]).toEqual(expect.arrayContaining([
      'company-1',
      'project-1',
      'task',
      'task-1',
      'delay',
      'material_shortage',
    ]))
  })
})
