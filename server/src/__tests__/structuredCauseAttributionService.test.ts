import { describe, expect, it, vi } from 'vitest'

import {
  STRUCTURED_CAUSE_TAXONOMY,
  buildStructuredCauseCandidates,
  confirmStructuredCauseAttribution,
  getStructuredCauseAttributionQualityMetrics,
  inferAndPersistTaskStructuredCauseAttributions,
  loadTaskStructuredCauseEvidence,
  persistStructuredCauseCandidates,
  recordBaselinePublicationStructuredCause,
  recordUserConfirmedStructuredCauseAttribution,
} from '../services/structuredCauseAttributionService.js'
import { getMetricDefinition } from '../services/metricRegistryService.js'

describe('structuredCauseAttributionService', () => {
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

  it('never auto-confirms an offline-model label or an unclassified free-text fallback', () => {
    const candidates = buildStructuredCauseCandidates({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      subjectId: 'task-1',
      eventType: 'completion',
      rawText: '现场临时协调后恢复',
      evidence: [
        {
          sourceType: 'offline_label',
          sourceId: 'label-1',
          attributes: { suggestedCauseCode: 'labor_shortage', confidence: 0.99 },
        },
        {
          sourceType: 'manual_text',
          sourceId: 'text-1',
          attributes: { text: '现场临时协调后恢复' },
        },
      ],
    })

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ causeCode: 'labor_shortage', status: 'candidate', autoConfirmed: false }),
      expect.objectContaining({ causeCode: 'other', status: 'candidate', autoConfirmed: false }),
    ]))
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

  it('requires explicit confirmation before assigning contractual responsibility', async () => {
    const queryExec = vi.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) {
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
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'confirmed',
      responsibility_class: 'contractor_attributable',
    }))
    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes("confirmation_source = 'user_confirmed'"))).toBe(true)
  })

  it('keeps the inferred prefill and records whether a user changed it during confirmation', async () => {
    const queryExec = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FOR UPDATE')) {
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
