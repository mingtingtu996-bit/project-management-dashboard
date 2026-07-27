import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  withDatabaseTransaction: vi.fn(),
  recordAcceptancePlanExecutionFacts: vi.fn(),
  transactionActive: false,
  factTransactionStates: [] as boolean[],
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

vi.mock('../database.js', () => ({
  withDatabaseTransaction: mocks.withDatabaseTransaction,
}))

vi.mock('../services/acceptancePlanExecutionFactService.js', () => ({
  recordAcceptancePlanExecutionFacts: mocks.recordAcceptancePlanExecutionFacts,
}))

const {
  deriveExecutionGateSeedTemplates,
  syncExecutionGateSeedTemplatesForTask,
} = await import('../services/executionGateSeedService.js')

describe('executionGateSeedService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.executeSQL.mockResolvedValue([])
    mocks.transactionActive = false
    mocks.factTransactionStates.length = 0
    mocks.withDatabaseTransaction.mockImplementation(async (work: () => Promise<unknown>) => {
      mocks.transactionActive = true
      try {
        return await work()
      } finally {
        mocks.transactionActive = false
      }
    })
    mocks.recordAcceptancePlanExecutionFacts.mockImplementation(async () => {
      mocks.factTransactionStates.push(mocks.transactionActive)
      return []
    })
  })

  it('derives condition and acceptance gate templates from GB50300-backed task metadata', () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      title: 'Basement waterproof concealed acceptance',
      standard_work_code: '01-07-01-P06',
      standard_work_name: 'Basement waterproof inspection',
      standard_task_metadata: {
        stableCode: '01-07-01-P06',
        sourceStandard: 'GB50300-2013',
        sourceClauseRef: 'GB50300 general quality acceptance flow',
        preconditionTemplates: ['material_accepted', 'drawing_reviewed'],
        acceptanceCheckpoints: ['self_check', 'concealed_acceptance', 'record_archive'],
      },
    }

    const result = deriveExecutionGateSeedTemplates(task as any)

    expect(result.conditionTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conditionCode: 'seed:precondition:material_accepted',
        conditionType: '材料',
        requiredForStart: true,
        blockingLevel: 'hard',
        sourceEntityType: 'algorithm_seed',
        sourceEntityId: 'gb50300:01-07-01-P06:precondition:material_accepted',
        impactMode: 'start_wait',
        impactOwnership: 'condition',
      }),
      expect.objectContaining({
        conditionCode: 'seed:precondition:drawing_reviewed',
        conditionType: '图纸',
        sourceEntityId: 'gb50300:01-07-01-P06:precondition:drawing_reviewed',
      }),
    ]))
    expect(result.acceptanceGateTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gateCode: 'seed:acceptance:concealed_acceptance',
        gateType: 'quality_acceptance',
        gateName: 'Concealed acceptance',
        sourceEntityType: 'algorithm_seed',
        sourceEntityId: 'gb50300:01-07-01-P06:acceptance:concealed_acceptance',
        impactMode: 'finish_gate',
        impactOwnership: 'acceptance',
      }),
    ]))
    expect(result.summary).toEqual(expect.objectContaining({
      sourceStandard: 'GB50300-2013',
      conditionTemplateCount: 2,
      acceptanceGateTemplateCount: 3,
    }))
  })

  it('derives acceptance gates from standard internal flow acceptance_gate metadata', () => {
    const task = {
      id: 'task-2',
      project_id: 'project-1',
      title: 'Entity quality check',
      standard_task_metadata: {
        stableCode: '02-01-03-P16',
        internalFlow: {
          ruleId: 'stable-code-02-01-03-P13-to-02-01-03-P16',
          relationKind: 'acceptance_gate',
          predecessorStableCodes: ['02-01-03-P13'],
          predecessorNames: ['Impermeability pressure test'],
          evidenceCodes: ['GB50300', 'GB50204'],
        },
      },
    }

    const result = deriveExecutionGateSeedTemplates(task as any)

    expect(result.acceptanceGateTemplates).toEqual([
      expect.objectContaining({
        gateCode: 'seed:internal_flow:stable-code-02-01-03-P13-to-02-01-03-P16',
        gateType: 'internal_flow_acceptance_gate',
        sourceEntityType: 'algorithm_seed',
        sourceEntityId: 'standard_internal_flow:stable-code-02-01-03-P13-to-02-01-03-P16:02-01-03-P16',
        impactMode: 'finish_gate',
        impactOwnership: 'acceptance',
      }),
    ])
  })

  it('derives default material, drawing, and quality acceptance gates from task requirement flags', () => {
    const result = deriveExecutionGateSeedTemplates({
      id: 'task-default-gates',
      project_id: 'project-1',
      title: 'Standard masonry process',
      standard_work_code: '03-02-01-P04',
      material_required: true,
      drawing_required: true,
      acceptance_required: true,
      quality_required: true,
      standard_task_metadata: {
        sourceStandard: 'GB50300-2013',
        sourceClauseRef: 'GB50300 common construction quality acceptance',
      },
    } as any)

    expect(result.conditionTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conditionCode: 'seed:requirement:material_required',
        conditionType: '材料',
        sourceEntityId: 'gb50300:03-02-01-P04:requirement:material_required',
        impactMode: 'start_wait',
        impactOwnership: 'condition',
      }),
      expect.objectContaining({
        conditionCode: 'seed:requirement:drawing_required',
        conditionType: '图纸',
        sourceEntityId: 'gb50300:03-02-01-P04:requirement:drawing_required',
      }),
    ]))
    expect(result.acceptanceGateTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gateCode: 'seed:requirement:gb50300_quality_acceptance',
        gateType: 'quality_acceptance',
        sourceEntityId: 'gb50300:03-02-01-P04:requirement:gb50300_quality_acceptance',
        impactMode: 'finish_gate',
        impactOwnership: 'acceptance',
      }),
    ]))
    expect(result.summary).toEqual(expect.objectContaining({
      conditionTemplateCount: 2,
      acceptanceGateTemplateCount: 1,
    }))
  })

  it('carries evidence version, validity window, stale policy, and responsibility hints into derived gate templates', () => {
    const result = deriveExecutionGateSeedTemplates({
      id: 'task-governed-gates',
      project_id: 'project-1',
      title: 'Facade sealant acceptance',
      planned_end_date: '2026-06-15',
      participant_unit_id: 'unit-facade',
      standard_task_metadata: {
        stableCode: '04-01-01-P09',
        sourceStandard: 'GB50300-2013',
        sourceClauseRef: 'GB50300 common acceptance',
        evidenceVersion: 'GB50300-2013@2026-05',
        validUntil: '2027-12-31',
        stalePolicy: 'warn_only_replay_required',
        typicalResponsibilityRole: 'specialty_subcontractor',
        preconditionTemplates: ['material_accepted'],
        acceptanceCheckpoints: ['self_check'],
      },
    } as any)

    expect(result.conditionTemplates[0]).toEqual(expect.objectContaining({
      evidenceVersion: 'GB50300-2013@2026-05',
      validUntil: '2027-12-31',
      stalePolicy: 'warn_only_replay_required',
      staleReason: null,
      responsibility: expect.objectContaining({
        ownerUnitId: 'unit-facade',
        ownerRole: 'specialty_subcontractor',
        basis: 'task_participant_unit_and_seed_role',
      }),
    }))
    expect(result.acceptanceGateTemplates[0]).toEqual(expect.objectContaining({
      evidenceVersion: 'GB50300-2013@2026-05',
      validUntil: '2027-12-31',
      stalePolicy: 'warn_only_replay_required',
      responsibility: expect.objectContaining({
        ownerUnitId: 'unit-facade',
        ownerRole: 'specialty_subcontractor',
      }),
    }))
  })

  it('marks expired seed evidence as candidate-only without dropping the generated gate', () => {
    const result = deriveExecutionGateSeedTemplates({
      id: 'task-stale-gate',
      project_id: 'project-1',
      title: 'Basement waterproof check',
      standard_work_code: '01-07-01-P06',
      standard_task_metadata: {
        sourceStandard: 'GB50300-2013',
        validUntil: '2025-12-31',
        stalePolicy: 'candidate_until_revalidated',
        preconditionTemplates: ['drawing_reviewed'],
      },
    } as any, new Date('2026-05-26T00:00:00.000Z'))

    expect(result.conditionTemplates).toHaveLength(1)
    expect(result.conditionTemplates[0]).toEqual(expect.objectContaining({
      sourceEntityId: 'gb50300:01-07-01-P06:precondition:drawing_reviewed',
      validUntil: '2025-12-31',
      stalePolicy: 'candidate_until_revalidated',
      staleReason: 'evidence_expired',
      runtimePolicy: 'candidate_only',
    }))
  })

  it('derives gate-only templates from process constraint effects without adding duration days', () => {
    const result = deriveExecutionGateSeedTemplates({
      id: 'task-process-constraint',
      project_id: 'project-1',
      title: 'Concrete curing release',
      standard_task_metadata: {
        stableCode: '02-01-03-P08',
        processConstraintEffect: {
          ruleCode: 'constraint_concrete_curing_release',
          constraintType: 'curing',
          applicationMode: 'gate_wait',
          impactMode: 'gate_wait',
          gateRequired: true,
          sourceStandard: 'GB50300-2013',
          sourceClauseRef: 'Concrete curing acceptance before next workface',
          confidence: 0.88,
          businessReason: 'Curing release must be confirmed before downstream handover.',
        },
      },
    } as any)

    expect(result.conditionTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conditionCode: 'seed:process_constraint:constraint_concrete_curing_release',
        conditionType: '其他',
        sourceEntityId: 'gb50300:02-01-03-P08:process_constraint:constraint_concrete_curing_release',
        impactMode: 'start_wait',
        impactOwnership: 'condition',
      }),
    ]))
    expect(result.acceptanceGateTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gateCode: 'seed:process_constraint:constraint_concrete_curing_release',
        gateType: 'quality_acceptance',
        sourceEntityId: 'gb50300:02-01-03-P08:process_constraint_acceptance:constraint_concrete_curing_release',
        impactMode: 'finish_gate',
        impactOwnership: 'acceptance',
      }),
    ]))
    expect(result.conditionTemplates[0]).not.toHaveProperty('durationDays')
    expect(result.acceptanceGateTemplates[0]).not.toHaveProperty('durationDays')
  })

  it('writes missing seed-backed gates idempotently without satisfying them', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim()
      if (normalized.includes('from task_conditions')) return []
      if (normalized.includes('from acceptance_plans')) return []
      return []
    })

    const result = await syncExecutionGateSeedTemplatesForTask({
      task: {
        id: 'task-3',
        project_id: 'project-1',
        title: 'Facade waterproof acceptance',
        planned_end_date: '2026-06-10',
        standard_task_metadata: {
          stableCode: '04-01-01-P07',
          sourceStandard: 'GB50300-2013',
          preconditionTemplates: ['working_face_released'],
          acceptanceCheckpoints: ['self_check', 'water_test_acceptance'],
        },
      } as any,
      actorId: 'user-1',
    })

    expect(result).toEqual(expect.objectContaining({
      createdConditionCount: 1,
      createdAcceptanceGateCount: 2,
      skippedConditionCount: 0,
      skippedAcceptanceGateCount: 0,
    }))

    const conditionInsert = mocks.executeSQL.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO task_conditions'))
    expect(conditionInsert).toBeTruthy()
    expect(conditionInsert?.[0]).toContain('source_entity_type')
    expect(conditionInsert?.[0]).toContain('source_entity_id')
    expect(conditionInsert?.[0]).toContain('required_for_start')
    expect(conditionInsert?.[1]).toEqual(expect.arrayContaining([
      'task-3',
      'project-1',
      'algorithm_seed',
      'gb50300:04-01-01-P07:precondition:working_face_released',
      false,
      'hard',
    ]))
    const conditionGovernanceMetadata = JSON.parse(String(conditionInsert?.[1]?.[15] ?? '{}'))
    expect(conditionGovernanceMetadata).toEqual(expect.objectContaining({
      evidenceVersion: expect.any(String),
      validUntil: null,
      stalePolicy: 'warn_only',
      staleReason: null,
    }))

    const acceptanceInsert = mocks.executeSQL.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO acceptance_plans'))
    expect(acceptanceInsert).toBeTruthy()
    expect(acceptanceInsert?.[1]).toEqual(expect.arrayContaining([
      'project-1',
      'pending',
      '2026-06-10',
    ]))
    expect(acceptanceInsert?.[1]).toEqual(expect.arrayContaining([
      expect.stringContaining('gb50300:04-01-01-P07:acceptance:self_check'),
    ]))
    const acceptanceNotes = JSON.parse(String(acceptanceInsert?.[1]?.[9] ?? '{}'))
    expect(acceptanceNotes).toEqual(expect.objectContaining({
      evidenceVersion: expect.any(String),
      stalePolicy: 'warn_only',
      staleReason: null,
    }))

    const acceptanceLinkInsert = mocks.executeSQL.mock.calls.find(([sql]) => (
      String(sql).includes('INSERT INTO project_entity_links')
    ))
    expect(acceptanceLinkInsert?.[1]).toEqual(expect.arrayContaining([
      'project-1',
      'task-3',
    ]))
    expect(mocks.recordAcceptancePlanExecutionFacts).toHaveBeenCalledTimes(2)
    expect(mocks.recordAcceptancePlanExecutionFacts.mock.calls.map(([input]) => input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceModule: 'executionGateSeedService',
          next: { status: 'pending', actual_date: null },
          forceInitial: true,
        }),
      ]),
    )
    expect(mocks.factTransactionStates).toEqual([true, true])
  })

  it('normalizes Date task dates before writing seed-backed acceptance planned_date', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim()
      if (normalized.includes('from task_conditions')) return []
      if (normalized.includes('from acceptance_plans')) return []
      return []
    })

    await syncExecutionGateSeedTemplatesForTask({
      task: {
        id: 'task-date-backed-gate',
        project_id: 'project-1',
        title: 'Facade waterproof acceptance',
        planned_end_date: new Date('2026-06-21T08:30:00.000Z'),
        standard_task_metadata: {
          stableCode: '04-01-01-P07',
          sourceStandard: 'GB50300-2013',
          acceptanceCheckpoints: ['self_check'],
        },
      } as any,
      actorId: 'user-1',
    })

    const acceptanceInsert = mocks.executeSQL.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO acceptance_plans'))
    expect(acceptanceInsert).toBeTruthy()
    expect(acceptanceInsert?.[1]?.[7]).toBe('2026-06-21')
    expect(String(acceptanceInsert?.[1]?.[7] ?? '')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('deduplicates acceptance gates by parsed notes instead of SQL LIKE matching', async () => {
    const acceptanceSelects: string[] = []
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim()
      if (normalized.includes('from task_conditions')) return []
      if (normalized.includes('from project_entity_links')) {
        return [{ source_entity_id: 'existing-self-check' }]
      }
      if (normalized.includes('from acceptance_plans')) {
        acceptanceSelects.push(sql)
        return [
          {
            id: 'existing-self-check',
            notes: JSON.stringify({
              sourceEntityId: 'gb50300:04-01-01-P07:acceptance:self_check',
            }),
          },
        ]
      }
      return []
    })

    const result = await syncExecutionGateSeedTemplatesForTask({
      task: {
        id: 'task-existing-acceptance',
        project_id: 'project-1',
        title: 'Facade waterproof acceptance',
        planned_end_date: '2026-06-10',
        standard_task_metadata: {
          stableCode: '04-01-01-P07',
          sourceStandard: 'GB50300-2013',
          acceptanceCheckpoints: ['self_check'],
        },
      } as any,
      actorId: 'user-1',
    })

    expect(result).toEqual(expect.objectContaining({
      createdAcceptanceGateCount: 0,
      skippedAcceptanceGateCount: 1,
    }))
    expect(acceptanceSelects).toHaveLength(1)
    expect(acceptanceSelects[0]).toContain('notes')
    expect(acceptanceSelects[0]).not.toMatch(/\bLIKE\b/i)
    expect(mocks.executeSQL.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO acceptance_plans'))).toBe(false)
  })
})
