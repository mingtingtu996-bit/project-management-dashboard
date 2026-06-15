import { beforeEach, describe, expect, it, vi } from 'vitest'

const criticalPathMocks = vi.hoisted(() => ({
  getProjectCriticalPathSnapshot: vi.fn(),
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  getProjectCriticalPathSnapshot: criticalPathMocks.getProjectCriticalPathSnapshot,
}))

import {
  SCHEDULE_ACCELERATION_PROFILE_SOURCE,
  buildAlgorithmFactContext,
  evaluateBaselineTargetAlignment,
  evaluateRuntimeDelayRecovery,
  evaluateRuntimeDelayRecoveryWithCriticalPath,
  evaluateScheduleTargetFeasibility,
  recordScheduleAccelerationRuntimeConsumption,
  type ScheduleAccelerationRow,
} from '../services/scheduleAccelerationService.js'

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

function callsForTable(calls: Array<{ sql: string, params: unknown[] }>, tableName: string) {
  return calls.filter((call) => call.sql.toLowerCase().includes(tableName))
}

function buildRow(overrides: Partial<ScheduleAccelerationRow> = {}): ScheduleAccelerationRow {
  return {
    clientRowId: 'row-1',
    values: {
      title: '标准层主体结构流水',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-09-30',
      duration_contribution_mode: 'duration_bearing',
      row_projection_mode: 'schedule_row',
      standard_task_metadata: {
        criticalPathEligible: true,
        resourceProfile: { resourceClass: 'rebar' },
        executionPhase: 'superstructure',
      },
    },
    predecessorDependencies: [],
    ...overrides,
  }
}

describe('scheduleAccelerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    criticalPathMocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      projectId: 'project-default',
      autoTaskIds: [],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: [],
      watchedTaskIds: [],
      edges: [],
      tasks: [],
      projectDurationDays: 0,
    })
  })

  it('evaluates target feasibility as an independent schedule algorithm', () => {
    const rows = [
      buildRow({
        clientRowId: 'row-1',
        values: {
          ...buildRow().values,
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-09-30',
        },
      }),
      buildRow({
        clientRowId: 'row-2',
        values: {
          title: '机电粗装跟进',
          planned_start_date: '2026-09-01',
          planned_end_date: '2026-11-30',
          duration_contribution_mode: 'duration_bearing',
          row_projection_mode: 'schedule_row',
          standard_task_metadata: {
            criticalPathEligible: true,
            resourceProfile: { resourceClass: 'electrical' },
            executionPhase: 'mep_rough_in',
          },
        },
        predecessorDependencies: [{
          clientRowId: 'row-1',
          dependencyType: 'FS',
          lagDays: 0,
          source: 'cross_item_workflow',
          relationRole: 'workflow',
        }],
      }),
      buildRow({
        clientRowId: 'row-hard-wait',
        values: {
          title: '混凝土养护等待',
          planned_start_date: '2026-10-01',
          planned_end_date: '2026-10-28',
          duration_contribution_mode: 'duration_bearing',
          row_projection_mode: 'schedule_row',
          standard_task_metadata: {
            constraintType: 'curing_wait',
            resourceProfile: { resourceClass: 'concrete_pour' },
          },
        },
        predecessorDependencies: [],
      }),
    ]

    const feasibility = evaluateScheduleTargetFeasibility({
      rows,
      targetEndDate: '2026-10-31',
      mode: 'compression_preview',
    })

    expect(feasibility).toEqual(expect.objectContaining({
      mode: 'compression_preview',
      targetEndDate: '2026-10-31',
      naturalEndDate: '2026-11-30',
      overshootDays: 30,
    }))
    expect(feasibility?.accelerationProposal).toEqual(expect.objectContaining({
      mode: 'preview_only',
      source: 'target_end_compression',
      durationOutputCode: 'acceleration_target',
      durationOutputSemanticFieldName: 'accelerationTargetDays',
      accelerationTargetDays: expect.any(Number),
      durationOutputContract: expect.objectContaining({
        code: 'acceleration_target',
        semanticFieldName: 'accelerationTargetDays',
      }),
    }))
    expect((feasibility as any)?.durationOutputCode).toBe('acceleration_target')
    expect((feasibility as any)?.durationOutputSemanticFieldName).toBe('accelerationTargetDays')
    expect((feasibility as any)?.accelerationTargetDays).toBe(
      feasibility?.accelerationProposal?.accelerationTargetDays,
    )
    expect(feasibility?.accelerationProposal?.actions.map((action) => action.type)).toEqual([
      'fast_track',
      'crashing',
      'scope_reduction',
    ])
    expect(feasibility?.accelerationProposal?.protectedConstraints).toEqual([
      expect.objectContaining({
        clientRowId: 'row-hard-wait',
        reasonCode: 'curing_wait',
      }),
    ])
  })

  it('keeps acceleration coefficients in a reusable seed policy', () => {
    expect(SCHEDULE_ACCELERATION_PROFILE_SOURCE).toBe('schedule_acceleration_profile_seed_v1')
  })

  it('uses live E3 criticality and E2 remaining duration when building runtime crashing candidates', () => {
    const feasibility = evaluateRuntimeDelayRecovery({
      rows: [
        buildRow({
          clientRowId: 'running-critical',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            status: 'in_progress',
            progress: 80,
            actual_start_date: '2026-06-01',
            remaining_duration_days: 4,
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'rebar' },
              executionPhase: 'superstructure',
            },
          },
        }),
        buildRow({
          clientRowId: 'long-floating',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-30',
            is_critical: false,
            total_float_days: 15,
            free_float_days: 8,
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'electrical' },
              executionPhase: 'mep_rough_in',
            },
          },
        }),
      ],
      targetEndDate: '2026-06-20',
      mode: 'compression_preview',
      context: {
        runtime: {
          progressCompletionRatio: 0.5,
        },
      },
    })

    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    expect(crashing?.affectedRowIds).toContain('running-critical')
    expect(crashing?.durationAdjustments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'running-critical',
        currentDurationDays: 4,
      }),
    ]))
  })

  it('uses live E3 critical projection before heuristic critical fallbacks when selecting crash targets', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'live-e3-critical',
          values: {
            ...buildRow().values,
            title: 'Live E3 critical work',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-01-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'rebar' },
              executionPhase: 'superstructure',
            },
          },
        }),
        buildRow({
          clientRowId: 'heuristic-fallback-only',
          values: {
            ...buildRow().values,
            title: 'Heuristic fallback only work',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-03-31',
            is_critical: false,
            total_float_days: 30,
            free_float_days: 15,
            standard_task_metadata: {
              criticalPathEligible: true,
              resourceProfile: { resourceClass: 'electrical' },
              executionPhase: 'superstructure',
            },
          },
        }),
      ],
      targetEndDate: '2026-02-28',
      mode: 'compression_preview',
    })

    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    expect(crashing?.durationAdjustments.map((adjustment) => adjustment.clientRowId)).toContain('live-e3-critical')
    expect(crashing?.durationAdjustments.map((adjustment) => adjustment.clientRowId)).not.toContain('heuristic-fallback-only')
  })

  it('calls E3 critical path directly when selecting runtime crashing targets', async () => {
    criticalPathMocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      projectId: 'project-1',
      autoTaskIds: ['e3-critical-only'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: ['e3-critical-only'],
      watchedTaskIds: [],
      edges: [],
      tasks: [{
        taskId: 'e3-critical-only',
        title: 'E3 critical only',
        floatDays: 0,
        durationDays: 20,
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
      }],
      projectDurationDays: 20,
    })

    const feasibility = await evaluateRuntimeDelayRecoveryWithCriticalPath({
      projectId: 'project-1',
      rows: [
        buildRow({
          clientRowId: 'e3-critical-only',
          values: {
            ...buildRow().values,
            title: 'E3 critical only',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-01-20',
            is_critical: false,
            total_float_days: 25,
            free_float_days: 12,
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'rebar' },
              executionPhase: 'miscellaneous',
            },
          },
        }),
        buildRow({
          clientRowId: 'heuristic-fallback-only',
          values: {
            ...buildRow().values,
            title: 'Heuristic fallback only work',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-03-31',
            is_critical: false,
            total_float_days: 30,
            free_float_days: 15,
            standard_task_metadata: {
              criticalPathEligible: true,
              resourceProfile: { resourceClass: 'electrical' },
              executionPhase: 'superstructure',
            },
          },
        }),
      ],
      targetEndDate: '2026-02-28',
      mode: 'compression_preview',
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-03-31',
        },
      },
    })

    expect(criticalPathMocks.getProjectCriticalPathSnapshot).toHaveBeenCalledWith('project-1')
    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    expect(crashing?.durationAdjustments.map((adjustment) => adjustment.clientRowId)).toContain('e3-critical-only')
    expect(crashing?.durationAdjustments.map((adjustment) => adjustment.clientRowId)).not.toContain('heuristic-fallback-only')
  })

  it('anchors runtime overshoot to the E4 project remaining forecast finish date', () => {
    const feasibility = evaluateRuntimeDelayRecovery({
      rows: [
        buildRow({
          clientRowId: 'runtime-row',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
          },
        }),
      ],
      targetEndDate: '2026-06-25',
      mode: 'compression_preview',
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-06-30',
        } as any,
      },
    })

    expect(feasibility?.naturalEndDate).toBe('2026-06-30')
    expect(feasibility?.overshootDays).toBe(5)
  })

  it('calculates target overshoot with shutdown-aware construction production days', () => {
    const rows: ScheduleAccelerationRow[] = [
      buildRow({
        clientRowId: 'shutdown-sensitive',
        values: {
          ...buildRow().values,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-06',
        },
      }),
    ]

    const feasibility = evaluateScheduleTargetFeasibility({
      rows,
      targetEndDate: '2026-05-03',
      mode: 'compression_preview',
      context: {
        constructionCalendar: {
          basis: 'official_construction_calendar_seed',
          windows: [{
            holidayCode: 'project_shutdown_2026',
            holidayName: 'Project shutdown',
            startDate: '2026-05-04',
            endDate: '2026-05-05',
            counts_as_construction_shutdown: true,
          }],
        },
      },
    })

    expect(feasibility?.overshootDays).toBe(1)
  })

  it('can re-evaluate an existing task schedule without WBS template generation', () => {
    const runtimeRows: ScheduleAccelerationRow[] = [
      buildRow({
        clientRowId: 'task-structure',
        values: {
          title: '主体结构施工',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-12-31',
          duration_contribution_mode: 'duration_bearing',
          row_projection_mode: 'schedule_row',
          standard_task_metadata: {
            criticalPathEligible: true,
            executionPhase: 'superstructure',
            resourceProfile: { resourceClass: 'rebar' },
          },
        },
        predecessorDependencies: [],
      }),
      buildRow({
        clientRowId: 'task-fitout',
        values: {
          title: '装饰装修施工',
          planned_start_date: '2027-01-01',
          planned_end_date: '2027-04-30',
          duration_contribution_mode: 'duration_bearing',
          row_projection_mode: 'schedule_row',
          standard_task_metadata: {
            criticalPathEligible: true,
            executionPhase: 'finishing',
            resourceProfile: { resourceClass: 'plaster' },
          },
        },
        predecessorDependencies: [{
          clientRowId: 'task-structure',
          dependencyType: 'FS',
          lagDays: 0,
          source: 'manual',
          relationRole: 'workflow',
        }],
      }),
    ]

    const feasibility = evaluateScheduleTargetFeasibility({
      rows: runtimeRows,
      targetEndDate: '2027-03-31',
      mode: 'compression_preview',
      context: {
        projectTypeCodes: ['residential'],
      climateSignals: ['spring_festival'],
      },
    })

    expect(feasibility?.naturalEndDate).toBe('2027-04-30')
    expect(feasibility?.scenario).toBe('baseline_target_alignment')
    expect(feasibility?.accelerationProposal?.calculationBasis).toEqual(expect.objectContaining({
      policySource: 'schedule_acceleration_profile_seed_v1',
      seasonalFactor: 0.7,
    }))
  })

  it('separates baseline target alignment from runtime delay recovery context', () => {
    const rows: ScheduleAccelerationRow[] = [
      buildRow({
        clientRowId: 'runtime-critical',
        values: {
          title: 'Runtime critical superstructure work',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-12-31',
          duration_contribution_mode: 'duration_bearing',
          row_projection_mode: 'schedule_row',
          total_float_days: 0,
          standard_task_metadata: {
            executionPhase: 'superstructure',
            resourceProfile: { resourceClass: 'rebar' },
          },
        },
        predecessorDependencies: [],
      }),
    ]

    const baseline = evaluateBaselineTargetAlignment({
      rows,
      targetEndDate: '2026-10-31',
      mode: 'compression_preview',
    })
    const runtime = evaluateRuntimeDelayRecovery({
      rows,
      targetEndDate: '2026-10-31',
      mode: 'compression_preview',
      context: {
        runtime: {
          resourcePressureScore: 15,
          hardBlockerCount: 1,
          parallelDensityRatio: 1.9,
          progressCompletionRatio: 0.35,
          criticalOrNearCriticalTaskCount: 1,
          floatingTaskCount: 0,
          scheduleState: 'blocked',
          evidenceCodes: ['resource_pressure_high', 'hard_blocker_present'],
        },
      },
    })

    expect(baseline?.scenario).toBe('baseline_target_alignment')
    expect(runtime?.scenario).toBe('runtime_delay_recovery')
    expect(runtime?.recoverableDays ?? 0).toBeLessThan(baseline?.recoverableDays ?? 0)
    expect(runtime?.accelerationProposal?.calculationBasis?.runtimeContext).toEqual(expect.objectContaining({
      resourcePressureScore: 15,
      hardBlockerCount: 1,
      scheduleState: 'blocked',
    }))
  })

  it('weights runtime execution facts above static project facts for runtime delay recovery', () => {
    const rows: ScheduleAccelerationRow[] = [
      buildRow({
        clientRowId: 'runtime-weighted',
        values: {
          title: 'Runtime weighted superstructure work',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-12-31',
          duration_contribution_mode: 'duration_bearing',
          row_projection_mode: 'schedule_row',
          standard_task_metadata: {
            projectGenerationFacts: {
              businessType: 'general_civil',
              buildingPatternCodes: ['high_rise_core_and_floor_cycle'],
            },
            executionPhase: 'superstructure',
            resourceProfile: { resourceClass: 'rebar' },
          },
        },
        predecessorDependencies: [],
      }),
    ]
    const factContext = buildAlgorithmFactContext({
      phase: 'runtime_forecast',
      rows,
      runtimeExecutionFacts: {
        progressCompletionRatio: 0.4,
        blockedTaskCount: 2,
        hardBlockerCount: 1,
        resourcePressureScore: 14,
        scheduleState: 'blocked',
        evidenceCodes: ['runtime_blocker'],
      },
    })

    expect(factContext.primaryLayer).toBe('runtimeExecutionFacts')
    expect(factContext.weights.runtimeExecutionFacts).toBeGreaterThan(factContext.weights.projectGenerationFacts)

    const runtime = evaluateRuntimeDelayRecovery({
      rows,
      targetEndDate: '2026-10-31',
      mode: 'compression_preview',
      context: factContext.scheduleAccelerationContext,
    })

    expect(runtime?.accelerationProposal?.calculationBasis?.runtimeContext).toEqual(expect.objectContaining({
      hardBlockerCount: 1,
      resourcePressureScore: 14,
      scheduleState: 'blocked',
      factLayer: 'runtimeExecutionFacts',
      staticFactsRole: 'background',
    }))
    expect((runtime?.accelerationProposal?.calculationBasis as any)?.algorithmFactContext).toEqual(expect.objectContaining({
      phase: 'runtime_delay_recovery',
      primaryLayer: 'runtimeExecutionFacts',
      runtimeFactsRole: 'primary',
      projectFactsRole: 'background',
      projectGenerationFactKeys: expect.arrayContaining(['businessType', 'buildingPatternCodes']),
      runtimeExecutionFactKeys: expect.arrayContaining(['hardBlockerCount', 'resourcePressureScore', 'scheduleState']),
    }))
  })

  it('uses profile seed context factors for hospital schedules', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'cleanroom-hvac',
          values: {
            title: 'Cleanroom HVAC commissioning',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-12-31',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              executionPhase: 'cleanroom_hvac',
              resourceProfile: { resourceClass: 'hvac' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-10-31',
      mode: 'compression_preview',
      context: {
        projectTypeCodes: ['hospital'],
        climateSignals: ['winter_restricted'],
      },
    })

    expect(feasibility?.accelerationProposal?.calculationBasis).toEqual(expect.objectContaining({
      projectTypeProfile: 'hospital_cleanroom_conservative',
      fastTrackBudgetRatio: 0.027,
      seasonalFactor: 0.8,
      totalRecoverCapRatio: 0.12,
      policySource: 'schedule_acceleration_profile_seed_v1',
    }))
    const fastTrack = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'fast_track')
    for (const adjustment of fastTrack?.dependencyAdjustments ?? []) {
      expect(Math.max(0, adjustment.lagDaysBefore - adjustment.lagDaysAfter)).toBeLessThanOrEqual(8)
    }
  })

  it('uses projectGenerationFacts snapshot for target acceleration profile selection', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'hospital-cleanroom',
          values: {
            title: 'Hospital cleanroom commissioning',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-12-31',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              projectGenerationFacts: {
                businessType: 'hospital',
                deliveryStandard: 'commissioning_ready',
                methodVariantCodes: ['cleanroom'],
                totalAreaM2: 120000,
                basementLevelCount: 2,
                specialRoomTypeCodes: ['operating_room'],
              },
              criticalPathEligible: true,
              executionPhase: 'cleanroom_hvac',
              resourceProfile: { resourceClass: 'hvac' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-10-31',
      mode: 'compression_preview',
    })

    expect(feasibility?.accelerationProposal?.calculationBasis).toEqual(expect.objectContaining({
      projectTypeProfile: 'hospital_cleanroom_conservative',
    }))
    expect((feasibility?.accelerationProposal?.calculationBasis as any)?.algorithmFactContext).toEqual(expect.objectContaining({
      phase: 'plan_creation',
      primaryLayer: 'projectGenerationFacts',
      projectFactsRole: 'primary',
      runtimeFactsRole: 'background',
      projectGenerationFactKeys: expect.arrayContaining([
        'businessType',
        'deliveryStandard',
        'methodVariantCodes',
        'totalAreaM2',
        'basementLevelCount',
        'specialRoomTypeCodes',
      ]),
    }))
  })

  it('builds preview-only acceleration actions with task duration and dependency diffs', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'structure',
          values: {
            title: 'Structure works',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            duration_suggestion: { recommendedDurationDays: 10 },
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'fitout',
          values: {
            title: 'Fitout works',
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            duration_suggestion: { recommendedDurationDays: 10 },
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'finishing',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [{
            clientRowId: 'structure',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'cross_item_workflow',
            relationRole: 'workflow',
          }],
        }),
      ],
      targetEndDate: '2026-06-15',
      mode: 'compression_preview',
    })

    expect(feasibility?.accelerationProposal).toEqual(expect.objectContaining({
      mode: 'preview_only',
      source: 'target_end_compression',
      commitmentDisclaimer: expect.any(String),
    }))

    const fastTrack = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'fast_track')
    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')

    expect(fastTrack).toEqual(expect.objectContaining({
      type: 'fast_track',
      dependencyAdjustments: expect.arrayContaining([
        expect.objectContaining({
          predecessorClientRowId: 'structure',
          successorClientRowId: 'fitout',
          fromDependencyType: 'FS',
          toDependencyType: 'SS',
          lagDaysAfter: expect.any(Number),
        }),
      ]),
    }))
    expect(crashing).toEqual(expect.objectContaining({
      type: 'crashing',
      durationAdjustments: expect.arrayContaining([
        expect.objectContaining({
          clientRowId: 'structure',
          currentDurationDays: 10,
          proposedDurationDays: expect.any(Number),
          recoverDays: expect.any(Number),
        }),
      ]),
    }))
    expect(feasibility?.accelerationProposal?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'scope_reduction',
        decisionOptions: expect.any(Array),
      }),
    ]))
    expect(feasibility?.accelerationProposal?.rescheduleDraft).toEqual(expect.objectContaining({
      mode: 'proposal_review',
      source: 'target_end_compression',
      writePolicy: 'requires_user_acceptance',
      taskDateAdjustments: expect.arrayContaining([
        expect.objectContaining({
          clientRowId: 'structure',
          currentDurationDays: 10,
          proposedDurationDays: expect.any(Number),
          changedFields: expect.arrayContaining(['planned_end_date']),
          visualDiff: expect.objectContaining({
            durationDeltaDays: expect.any(Number),
            barDeltaKind: 'compressed',
          }),
        }),
        expect.objectContaining({
          clientRowId: 'fitout',
          currentStartDate: '2026-06-11',
          proposedStartDate: expect.not.stringMatching(/^2026-06-11$/),
          changedFields: expect.arrayContaining(['planned_start_date']),
          visualDiff: expect.objectContaining({
            barDeltaKind: 'shifted',
          }),
        }),
      ]),
      dependencyAdjustments: expect.arrayContaining([
        expect.objectContaining({
          predecessorClientRowId: 'structure',
          successorClientRowId: 'fitout',
          fromDependencyType: 'FS',
          toDependencyType: 'SS',
        }),
      ]),
    }))
    expect(feasibility?.accelerationProposal?.rescheduleDraft?.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'update',
        clientRowId: 'structure',
        values: expect.objectContaining({
          planned_end_date: expect.any(String),
          duration_reschedule_source: 'target_end_compression',
        }),
      }),
      expect.objectContaining({
        type: 'update',
        clientRowId: 'fitout',
        values: expect.objectContaining({
          planned_start_date: expect.any(String),
          duration_reschedule_policy: 'dependency_propagation_preview',
        }),
      }),
    ]))
  })

  it('discounts fast-track recoverable days for overlap rework risk instead of taking the full lag delta', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'structure',
          values: {
            ...buildRow().values,
            title: 'Structure works',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'fitout',
          values: {
            ...buildRow().values,
            title: 'Fitout works',
            planned_start_date: '2026-06-21',
            planned_end_date: '2026-07-10',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'finishing',
              resourceProfile: { resourceClass: 'finishing' },
            },
          },
          predecessorDependencies: [{
            clientRowId: 'structure',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'cross_item_workflow',
            relationRole: 'workflow',
          }],
        }),
      ],
      targetEndDate: '2026-06-30',
      mode: 'compression_preview',
    })

    const fastTrack = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'fast_track') as any
    const rawRecoverDays = fastTrack?.dependencyAdjustments?.reduce((sum: number, item: any) => (
      sum + Math.max(1, item.lagDaysBefore - item.lagDaysAfter)
    ), 0)

    expect(rawRecoverDays).toBeGreaterThan(0)
    expect(fastTrack).toEqual(expect.objectContaining({
      rawRecoverDays,
      reworkRiskDiscountDays: expect.any(Number),
      effectiveRecoverDays: expect.any(Number),
    }))
    expect(fastTrack.reworkRiskDiscountDays).toBeGreaterThan(0)
    expect(fastTrack.effectiveRecoverDays).toBeLessThan(rawRecoverDays)
    expect(fastTrack.recoverDays).toBe(fastTrack.effectiveRecoverDays)
  })

  it('exposes recoverable-day confidence bands on feasibility and proposal outputs', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-terminal',
          values: {
            ...buildRow().values,
            title: 'Critical terminal work',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-02-19',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-02-09',
      mode: 'compression_preview',
    }) as any

    expect(feasibility.recoverableDaysConfidenceBand).toEqual(expect.objectContaining({
      optimisticDays: expect.any(Number),
      expectedDays: feasibility.recoverableDays,
      conservativeDays: expect.any(Number),
      basis: 'schedule_acceleration_uncertainty_band',
    }))
    expect(feasibility.accelerationProposal?.recoverableDaysConfidenceBand).toEqual(expect.objectContaining({
      expectedDays: feasibility.accelerationProposal.totalRecoverDays,
      basis: 'schedule_acceleration_uncertainty_band',
    }))
    expect(feasibility.accelerationProposal?.accelerationTargetConfidenceBand).toEqual(expect.objectContaining({
      expectedDays: feasibility.accelerationProposal.accelerationTargetDays,
      basis: 'schedule_acceleration_target_uncertainty_band',
    }))
  })

  it('downgrades null-network fallback instead of trusting summed raw recovery', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'summary-terminal',
          values: {
            ...buildRow().values,
            title: 'Summary terminal package',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-07-30',
            duration_contribution_mode: 'non_duration',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              executionPhase: 'summary',
              resourceProfile: { resourceClass: 'general_crew' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-06-10',
      mode: 'compression_preview',
    }) as any

    expect(feasibility.accelerationProposal?.calculationBasis?.networkFallbackPolicy).toBe('conservative_discounted_raw_recovery')
    expect(feasibility.accelerationProposal?.rescheduleDraft).toBeUndefined()
    expect(feasibility.accelerationProposal?.totalRecoverDays).toBeLessThan(feasibility.overshootDays)
  })

  it('does not use naked recommended duration as a crashing floor', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'structure',
          values: {
            title: 'Structure works',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            duration_suggestion: {
              durationOutputCode: 'contextual_reference',
              durationOutputSemanticFieldName: 'contextualReferenceDays',
              recommendedDurationDays: 97,
              contextualReferenceDays: null,
            },
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'fitout',
          values: {
            title: 'Fitout works',
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'finishing',
              resourceProfile: { resourceClass: 'plaster' },
            },
          },
          predecessorDependencies: [/* keeps the scenario on the same target-compression path */],
        }),
      ],
      targetEndDate: '2026-06-15',
      mode: 'compression_preview',
    })

    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    const structureAdjustment = crashing?.durationAdjustments.find((adjustment) => adjustment.clientRowId === 'structure')

    expect(structureAdjustment).toEqual(expect.objectContaining({
      clientRowId: 'structure',
      currentDurationDays: 10,
      proposedDurationDays: expect.any(Number),
      recoverDays: expect.any(Number),
    }))
    expect(structureAdjustment?.minDurationDays).toBeLessThan(10)
  })

  it('exposes network slack facts on the crashing action instead of leaving them only in runtime telemetry', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-structure',
          values: {
            title: 'Critical structure works',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'floating-fitout',
          values: {
            title: 'Floating fitout works',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-12',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: false,
            total_float_days: 12,
            free_float_days: 8,
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'finishing',
              resourceProfile: { resourceClass: 'plaster' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-06-15',
      mode: 'compression_preview',
    })

    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing') as any

    expect(crashing?.networkSlackFacts).toEqual(expect.objectContaining({
      source: 'schedule_acceleration_network_projection',
      criticalOrNearCriticalTaskCount: 1,
      floatingTaskCount: 1,
      selectedNetworkRecoverDays: expect.any(Number),
      effectiveRecoverDays: crashing?.recoverDays,
    }))
  })

  it('uses runtime network slack counts to adjust recovery budget instead of only echoing them in telemetry', () => {
    const feasibility = evaluateRuntimeDelayRecovery({
      rows: [
        buildRow({
          clientRowId: 'critical-structure',
          values: {
            title: 'Critical structure works',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-07-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-07-01',
      mode: 'compression_preview',
      context: {
        runtime: {
          criticalOrNearCriticalTaskCount: 8,
          floatingTaskCount: 0,
        },
      },
    })

    const runtimeContext = feasibility?.accelerationProposal?.calculationBasis?.runtimeContext

    expect(runtimeContext).toEqual(expect.objectContaining({
      criticalOrNearCriticalTaskCount: 8,
      floatingTaskCount: 0,
      networkSlackRecoveryFactor: expect.any(Number),
    }))
    expect(runtimeContext?.networkSlackRecoveryFactor).toBeLessThan(1)
    expect(runtimeContext?.recoveryBudgetFactor).toBeLessThan(1)
  })

  it('does not use legacy snake_case duration output aliases as a crashing floor', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'structure',
          values: {
            title: 'Structure works',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            duration_suggestion: {
              duration_output_code: 'contextual_reference',
              duration_output_semantic_field_name: 'contextualReferenceDays',
              contextual_reference_days: 97,
              plan_reference_days: 97,
              remaining_forecast_days: 97,
            },
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'fitout',
          values: {
            title: 'Fitout works',
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'finishing',
              resourceProfile: { resourceClass: 'plaster' },
            },
          },
          predecessorDependencies: [/* keeps the scenario on the same target-compression path */],
        }),
      ],
      targetEndDate: '2026-06-15',
      mode: 'compression_preview',
    })

    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    const structureAdjustment = crashing?.durationAdjustments.find((adjustment) => adjustment.clientRowId === 'structure')

    expect(structureAdjustment).toEqual(expect.objectContaining({
      clientRowId: 'structure',
      currentDurationDays: 10,
      proposedDurationDays: expect.any(Number),
      recoverDays: expect.any(Number),
    }))
    expect(structureAdjustment?.minDurationDays).toBeLessThan(10)
  })

  it('keeps accelerated proposed finish dates out of construction shutdown windows', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'structure',
          values: {
            title: 'Structure works',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-05',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-06-04',
      mode: 'compression_preview',
      context: {
        constructionCalendar: {
          basis: 'official_construction_calendar_seed',
          windows: [{
            holidayCode: 'site_shutdown',
            startDate: '2026-06-04',
            endDate: '2026-06-04',
            counts_as_construction_shutdown: true,
          }],
        },
      } as any,
    })

    const adjustment = feasibility?.accelerationProposal?.rescheduleDraft?.taskDateAdjustments
      .find((item) => item.clientRowId === 'structure')
    expect(adjustment).toEqual(expect.objectContaining({
      currentDurationDays: 4,
      proposedDurationDays: 3,
      proposedEndDate: '2026-06-03',
    }))
  })

  it('caps acceleration recovery by the project terminal finish delta instead of summing parallel crashes', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'early-anchor',
          values: {
            title: 'Early non-compressible mobilization',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-01-10',
            duration_contribution_mode: 'non_duration',
            row_projection_mode: 'schedule_row',
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'parallel-a',
          values: {
            title: 'Parallel terminal work A',
            planned_start_date: '2026-04-11',
            planned_end_date: '2026-07-19',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'parallel-b',
          values: {
            title: 'Parallel terminal work B',
            planned_start_date: '2026-04-11',
            planned_end_date: '2026-07-19',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'mep_rough_in',
              resourceProfile: { resourceClass: 'electrical' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-06-19',
      mode: 'compression_preview',
    })

    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    expect(crashing?.durationAdjustments).toHaveLength(2)
    expect(crashing?.durationAdjustments.map((item) => item.recoverDays)).toEqual([18, 18])
    expect(crashing?.recoverDays).toBe(18)
    expect(feasibility?.accelerationProposal?.totalRecoverDays).toBe(18)
    expect(feasibility?.accelerationProposal?.remainingGapDays).toBe(12)
    expect(feasibility?.accelerationTargetDays).toBe(182)
  })

  it('recomputes recoverable days through the dependency network when crashing an upstream critical row', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-upstream',
          values: {
            title: 'Critical upstream work',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-01-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'rebar' },
              executionPhase: 'superstructure',
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'terminal-successor',
          values: {
            title: 'Terminal successor work',
            planned_start_date: '2026-01-21',
            planned_end_date: '2026-02-09',
            duration_contribution_mode: 'non_duration',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'general_crew' },
              executionPhase: 'closeout',
            },
          },
          predecessorDependencies: [{
            clientRowId: 'critical-upstream',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'manual',
            relationRole: 'context',
          }],
        }),
      ],
      targetEndDate: '2026-01-30',
      mode: 'compression_preview',
    })

    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    expect(crashing?.durationAdjustments).toEqual([
      expect.objectContaining({
        clientRowId: 'critical-upstream',
        currentDurationDays: 20,
        proposedDurationDays: 16,
        recoverDays: 4,
      }),
    ])
    expect(feasibility?.recoverableDays).toBe(4)
    expect(feasibility?.strategies.find((strategy) => strategy.type === 'crashing')?.recoverDays).toBe(4)
    expect(feasibility?.accelerationProposal?.totalRecoverDays).toBe(4)
    expect(feasibility?.accelerationProposal?.remainingGapDays).toBe(6)
  })

  it('uses E1 conservative duration as the crash floor for critical duration-bearing rows', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-structure',
          values: {
            title: 'Critical structure work',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-01-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            duration_suggestion: {
              durationOutputCode: 'contextual_reference',
              contextualReferenceDays: 10,
              conservativeDurationDays: 18,
            },
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'rebar' },
              executionPhase: 'superstructure',
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'terminal-successor',
          values: {
            title: 'Terminal successor work',
            planned_start_date: '2026-01-21',
            planned_end_date: '2026-01-30',
            duration_contribution_mode: 'non_duration',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'general_crew' },
              executionPhase: 'closeout',
            },
          },
          predecessorDependencies: [{
            clientRowId: 'critical-structure',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'manual',
            relationRole: 'context',
          }],
        }),
      ],
      targetEndDate: '2026-01-25',
      mode: 'compression_preview',
    })

    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    expect(crashing?.durationAdjustments).toEqual([
      expect.objectContaining({
        clientRowId: 'critical-structure',
        currentDurationDays: 20,
        minDurationDays: 18,
        proposedDurationDays: 18,
        recoverDays: 2,
      }),
    ])
    expect(feasibility?.accelerationProposal?.totalRecoverDays).toBe(2)
    expect(feasibility?.accelerationProposal?.remainingGapDays).toBe(3)
  })

  it('chooses same-resource crashing candidates by marginal network recovery instead of first row order', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'near-critical-nonterminal',
          values: {
            title: 'Near critical but non-terminal branch',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-01-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: false,
            total_float_days: 2,
            free_float_days: 1,
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'rebar' },
              executionPhase: 'superstructure',
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'governing-critical-terminal',
          values: {
            title: 'Governing critical terminal branch',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-01-30',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            standard_task_metadata: {
              resourceProfile: { resourceClass: 'rebar' },
              executionPhase: 'superstructure',
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-01-25',
      mode: 'compression_preview',
    })

    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    expect(crashing?.durationAdjustments.map((item) => item.clientRowId)).toEqual(['governing-critical-terminal'])
    expect(crashing?.recoverDays).toBe(5)
    expect(feasibility?.accelerationProposal?.totalRecoverDays).toBe(5)
    expect(feasibility?.accelerationProposal?.remainingGapDays).toBe(0)
  })

  it('records v1.4.22.5 runtime consumer evidence for dependency-rule artifacts consumed by schedule acceleration', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordScheduleAccelerationRuntimeConsumption({
      queryExec,
      projectId: 'project-1',
      observedAt: '2026-06-15T09:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'dependency_rule_runtime:dependency-v7',
          publicationStatus: 'published',
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'critical_path_rule_runtime:critical-v7',
          publicationStatus: 'runtime_published',
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 1,
      blockedCount: 0,
      reasons: [],
    }))
    expect(result.runtimeCallResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_runtime_call_recorded',
      canPersist: true,
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'dependency_rule_candidate',
        'dependency_rule_runtime:dependency-v7',
        'scheduleAccelerationService',
        'schedule_acceleration',
      ],
    ])
  })

  it('records runtime consumer evidence from evaluateRuntimeDelayRecoveryWithCriticalPath when dependency rules are consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const feasibility = await evaluateRuntimeDelayRecoveryWithCriticalPath({
      projectId: 'project-1',
      rows: [
        buildRow({
          clientRowId: 'critical-task',
          values: {
            ...buildRow().values,
            title: 'Critical dependency-governed task',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-01-30',
            is_critical: true,
            total_float_days: 0,
          },
        }),
      ],
      targetEndDate: '2026-01-25',
      mode: 'compression_preview',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeConsumerObservedAt: '2026-06-15T09:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'dependency_rule_runtime:dependency-v7',
          publicationStatus: 'published',
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'critical_path_rule_runtime:critical-v7',
          publicationStatus: 'runtime_published',
        },
      ],
    })

    expect(feasibility?.scenario).toBe('runtime_delay_recovery')
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'dependency_rule_candidate',
        'dependency_rule_runtime:dependency-v7',
        'scheduleAccelerationService',
        'schedule_acceleration',
      ],
    ])
  })
})
