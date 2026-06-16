import { describe, expect, it } from 'vitest'
import {
  buildProjectRemainingDurationForecast,
  recordProjectRemainingDurationForecastRuntimeConsumption,
} from '../services/projectRemainingDurationForecastService.js'
import type { ScheduleAccelerationRow } from '../services/scheduleAccelerationService.js'

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

async function flushRuntimeConsumerRecording() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function row(overrides: Partial<ScheduleAccelerationRow> = {}): ScheduleAccelerationRow {
  return {
    clientRowId: 'task-1',
    values: {
      title: 'Critical structure task',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-20',
      progress: 20,
      status: 'in_progress',
      is_critical: true,
      standard_task_metadata: {
        projectGenerationFacts: {
          businessType: 'general_civil',
          totalAreaM2: 120000,
          highestBuildingFloorCount: 26,
        },
      },
    },
    predecessorDependencies: [],
    rowProjectionMode: 'schedule_row',
    ...overrides,
  }
}

describe('projectRemainingDurationForecastService', () => {
  it('builds a governed project-level remaining forecast from critical path, monthly commitments and external gates', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'critical-structure',
          values: {
            ...row().values,
            planned_end_date: '2026-06-20',
            total_float_days: 0,
          },
        }),
        row({
          clientRowId: 'external-power',
          values: {
            title: 'Permanent power acceptance',
            planned_start_date: '2026-06-18',
            planned_end_date: '2026-06-28',
            progress: 0,
            status: 'todo',
            duration_contribution_mode: 'external_wait',
            standard_task_metadata: {
              constraintType: 'external_interface_wait',
              externalInterfaceCodes: ['permanent_power'],
            },
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
      runtimeExecutionFacts: {
        progressCompletionRatio: 0.35,
        criticalOrNearCriticalTaskCount: 1,
      },
      monthlyCommitments: {
        activeCommitmentCount: 3,
        carryoverCommitmentCount: 1,
        latestCommitmentFinishDate: '2026-06-30',
      },
    })

    expect(forecast).toEqual(expect.objectContaining({
      durationOutputCode: 'project_remaining_forecast',
      durationOutputSemanticFieldName: 'projectRemainingForecastDays',
      projectRemainingForecastDays: 21,
      forecastFinishDate: '2026-06-30',
      targetGapDays: 5,
      rowsEvaluated: 2,
    }))
    expect(forecast.calculationContext).toEqual(expect.objectContaining({
      primaryLayer: 'runtimeExecutionFacts',
      criticalPath: expect.objectContaining({
        remainingTaskCount: 1,
        latestCriticalFinishDate: '2026-06-20',
      }),
      monthlyCommitments: expect.objectContaining({
        activeCommitmentCount: 3,
        carryoverCommitmentCount: 1,
        latestCommitmentFinishDate: '2026-06-30',
      }),
      externalInterfaces: expect.objectContaining({
        hardGateCount: 1,
        latestGateFinishDate: '2026-06-28',
      }),
    }))
  })

  it('does not treat frozen baseline critical flags as the live remaining critical set', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'frozen-baseline-critical-only',
          values: {
            ...row().values,
            planned_end_date: '2026-06-24',
            is_critical: false,
            baseline_is_critical: true,
            total_float_days: 12,
            free_float_days: 8,
          },
        }),
        row({
          clientRowId: 'live-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-06-18',
            is_critical: true,
            baseline_is_critical: false,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
    })

    expect(forecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      remainingTaskCount: 1,
      latestCriticalFinishDate: '2026-06-18',
    }))
  })

  it('uses a fresh E3 critical-path snapshot instead of stale row-level critical flags', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'stale-row-critical',
          values: {
            ...row().values,
            title: 'Stale row projection',
            planned_end_date: '2026-06-30',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
        row({
          clientRowId: 'fresh-e3-critical',
          values: {
            ...row().values,
            title: 'Fresh E3 critical task',
            planned_end_date: '2026-06-18',
            is_critical: false,
            total_float_days: 12,
            free_float_days: 8,
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
      criticalPathSnapshot: {
        projectId: 'project-1',
        autoTaskIds: ['fresh-e3-critical'],
        displayTaskIds: ['fresh-e3-critical'],
        manualAttentionTaskIds: [],
        manualInsertedTaskIds: [],
        watchedTaskIds: [],
        edges: [],
        tasks: [
          {
            taskId: 'fresh-e3-critical',
            title: 'Fresh E3 critical task',
            floatDays: 0,
            durationDays: 9,
            isAutoCritical: true,
            isManualAttention: false,
            isManualInserted: false,
          },
        ],
        primaryChain: null,
        alternateChains: [],
        projectDurationDays: 9,
        calculationStatus: 'fresh',
        calculatedAt: '2026-06-10T00:00:00.000Z',
      },
    })

    expect(forecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      remainingTaskCount: 1,
      latestCriticalFinishDate: '2026-06-18',
    }))
  })

  it('uses E2 task forecast finish dates as row governing finish when present', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'forecasted-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-06-20',
            forecast_finish_date: '2026-06-26',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-26')
    expect(forecast.projectRemainingForecastDays).toBe(17)
    expect(forecast.targetGapDays).toBe(1)
    expect(forecast.calculationContext.criticalPath.latestCriticalFinishDate).toBe('2026-06-26')
  })

  it('widens the project remaining finish with E2 confidence bands, CP span and runtime pressure', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'critical-with-band',
          values: {
            ...row().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            forecast_finish_date: '2026-06-20',
            forecast_p80_finish_date: '2026-06-24',
            critical_path_span_days: 18,
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
      runtimeExecutionFacts: {
        progressCompletionRatio: 0.2,
        resourcePressureScore: 14,
        criticalOrNearCriticalTaskCount: 3,
        evidenceObjects: [
          {
            code: 'resource_pressure_high',
            factType: 'inferred',
            strength: 'inferred',
            sourceType: 'project_schedule_state_window',
            sourceIds: ['critical-with-band'],
            scope: { type: 'project', id: 'project-1' },
            windowDays: 14,
            confidence: 0.82,
            value: 14,
            contributions: [
              {
                code: 'critical_task_backlog',
                label: 'Critical task backlog',
                weight: 0.25,
                value: 1,
                sourceType: 'task_runtime_fields',
              },
            ],
            boundaryPolicy: [
              'does_not_require_manual_site_resource_inputs',
              'does_not_rewrite_task_dates_or_static_project_facts',
            ],
          },
        ],
        runtimeInferenceSummary: {
          factType: 'inferred',
          sourcePolicy: 'existing_execution_state_only',
          confidence: 0.82,
          readinessStatus: 'commercial_ready',
          impactBoundary: 'runtime_adjustment_allowed',
          sourceWindowDays: 14,
          inferredSignalCodes: ['resource_pressure_high'],
        },
      },
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-28')
    expect(forecast.projectRemainingForecastDays).toBe(19)
    expect(forecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      latestCriticalFinishDate: '2026-06-20',
      confidenceBandFinishDate: '2026-06-24',
      criticalPathSpanFinishDate: '2026-06-27',
    }))
    expect(forecast.calculationContext.runtimeAdjustment).toEqual(expect.objectContaining({
      pressureProgressExtraDays: 1,
      adjustedInternalFinishDate: '2026-06-28',
      evidenceObjects: expect.arrayContaining([
        expect.objectContaining({
          code: 'resource_pressure_high',
          factType: 'inferred',
          sourceType: 'project_schedule_state_window',
          boundaryPolicy: expect.arrayContaining([
            'does_not_require_manual_site_resource_inputs',
            'does_not_rewrite_task_dates_or_static_project_facts',
          ]),
        }),
      ]),
      runtimeInferenceSummary: expect.objectContaining({
        factType: 'inferred',
        sourcePolicy: 'existing_execution_state_only',
        impactBoundary: 'runtime_adjustment_allowed',
      }),
    }))
  })

  it('adds merge bias when several near-critical chains carry similar P80 spread', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: ['chain-a', 'chain-b', 'chain-c'].map((clientRowId) => row({
        clientRowId,
        values: {
          ...row().values,
          title: `Parallel critical chain ${clientRowId}`,
          forecast_finish_date: '2026-06-30',
          forecast_p80_finish_date: '2026-07-04',
          is_critical: true,
          total_float_days: 0,
          free_float_days: 0,
        },
      })),
      asOfDate: '2026-06-10',
    })

    expect(forecast.forecastFinishDate).toBe('2026-07-04')
    expect(forecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      mergeBiasDays: 2,
      mergeBiasChainCount: 3,
      confidenceBandFinishDate: '2026-07-04',
      mergeBiasedFinishDate: '2026-07-02',
      confidenceBandDecision: expect.objectContaining({
        status: 'applied',
        governingFinishSource: 'confidence_band',
        governingFinishDate: '2026-07-04',
      }),
    }))
  })

  it('lets the confidence band govern when it is later than merge bias', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: ['chain-a', 'chain-b', 'chain-c'].map((clientRowId) => row({
        clientRowId,
        values: {
          ...row().values,
          title: `Parallel critical chain ${clientRowId}`,
          forecast_finish_date: '2026-06-30',
          forecast_p80_finish_date: '2026-07-04',
          is_critical: true,
          total_float_days: 0,
          free_float_days: 0,
        },
      })),
      asOfDate: '2026-06-10',
    })

    expect(forecast.forecastFinishDate).toBe('2026-07-04')
    expect(forecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      mergeBiasDays: 2,
      mergeBiasedFinishDate: '2026-07-02',
      confidenceBandFinishDate: '2026-07-04',
      confidenceBandDecision: expect.objectContaining({
        status: 'applied',
        governingFinishSource: 'confidence_band',
        governingFinishDate: '2026-07-04',
        mergeBiasApplied: true,
      }),
    }))
  })

  it('marks merge-bias confidence evidence as unavailable when critical rows have no confidence bands', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: ['chain-a', 'chain-b'].map((clientRowId) => row({
        clientRowId,
        values: {
          ...row().values,
          title: `Parallel critical chain ${clientRowId}`,
          forecast_finish_date: '2026-06-30',
          is_critical: true,
          total_float_days: 0,
          free_float_days: 0,
        },
      })),
      asOfDate: '2026-06-10',
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-30')
    expect(forecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      confidenceBandFinishDate: null,
      mergeBiasDays: 0,
      confidenceBandDecision: expect.objectContaining({
        status: 'missing_confidence_band',
        governingFinishSource: 'deterministic_finish',
        confidenceBandMissingCount: 2,
      }),
    }))
  })

  it('uses E2 remaining days as catch-up work for overdue unfinished tasks', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'overdue-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-06-05',
            remaining_duration_days: 4,
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-12',
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-13')
    expect(forecast.projectRemainingForecastDays).toBe(4)
    expect(forecast.targetGapDays).toBe(1)
    expect(forecast.calculationContext.criticalPath.latestCriticalFinishDate).toBe('2026-06-13')
  })

  it('overlaps external hard-gate remaining windows with internal work', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'internal-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-06-30',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
        row({
          clientRowId: 'external-archive',
          values: {
            title: 'Archive acceptance',
            planned_start_date: '2026-06-18',
            planned_end_date: '2026-06-22',
            progress: 0,
            status: 'todo',
            duration_contribution_mode: 'external_wait',
            standard_task_metadata: {
              constraintType: 'external_interface_wait',
              externalInterfaceCodes: ['archive_acceptance'],
            },
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-07-02',
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-30')
    expect(forecast.projectRemainingForecastDays).toBe(21)
    expect(forecast.targetGapDays).toBe(0)
    expect(forecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      hardGateCount: 1,
      latestGateFinishDate: '2026-06-22',
      serialRemainingDays: 0,
      overlappedRemainingDays: 5,
      overlappedGateFinishDate: '2026-06-22',
      gateTailDaysAfterInternal: 0,
      serializedGateFinishDate: null,
    }))
  })

  it('overlaps an external hard-gate window with internal work instead of appending the full gate after it', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'internal-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-06-30',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
        row({
          clientRowId: 'external-archive',
          values: {
            title: 'Archive acceptance',
            planned_start_date: '2026-06-18',
            planned_end_date: '2026-06-22',
            progress: 0,
            status: 'todo',
            duration_contribution_mode: 'external_wait',
            standard_task_metadata: {
              constraintType: 'external_interface_wait',
              externalInterfaceCodes: ['archive_acceptance'],
            },
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-07-02',
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-30')
    expect(forecast.projectRemainingForecastDays).toBe(21)
    expect(forecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      hardGateCount: 1,
      latestGateFinishDate: '2026-06-22',
      overlappedRemainingDays: 5,
      overlappedGateFinishDate: '2026-06-22',
      gateTailDaysAfterInternal: 0,
    }))
  })

  it('overlaps multiple external hard-gate windows instead of summing them serially', () => {
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'internal-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-06-30',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
        row({
          clientRowId: 'external-power',
          values: {
            title: 'Permanent power acceptance',
            planned_start_date: '2026-06-18',
            planned_end_date: '2026-07-04',
            progress: 0,
            status: 'todo',
            remaining_duration_days: 5,
            duration_contribution_mode: 'external_wait',
            standard_task_metadata: {
              constraintType: 'external_interface_wait',
              externalInterfaceCodes: ['permanent_power'],
            },
          },
        }),
        row({
          clientRowId: 'external-archive',
          values: {
            title: 'Archive acceptance',
            planned_start_date: '2026-06-18',
            planned_end_date: '2026-07-08',
            progress: 0,
            status: 'todo',
            remaining_duration_days: 7,
            duration_contribution_mode: 'external_wait',
            standard_task_metadata: {
              constraintType: 'external_interface_wait',
              externalInterfaceCodes: ['archive_acceptance'],
            },
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-07-02',
    })

    expect(forecast.forecastFinishDate).toBe('2026-07-08')
    expect(forecast.projectRemainingForecastDays).toBe(29)
    expect(forecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      hardGateCount: 2,
      latestGateFinishDate: '2026-07-08',
      serialRemainingDays: 8,
      overlappedRemainingDays: 7,
      overlappedGateFinishDate: '2026-07-08',
      gateTailDaysAfterInternal: 8,
      serializedGateFinishDate: '2026-07-08',
    }))
  })

  it('records a v1.4.22.4 prediction event for project remaining forecasts when a recorder is provided', () => {
    const recordedEvents: unknown[] = []

    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'critical-structure',
          values: {
            ...row().values,
            project_id: 'project-1',
            planned_end_date: '2026-06-20',
            forecast_finish_date: '2026-06-22',
            total_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
      monthlyCommitments: {
        activeCommitmentCount: 2,
        carryoverCommitmentCount: 1,
        latestCommitmentFinishDate: '2026-06-24',
      },
      predictionEventRecorder: (event) => {
        recordedEvents.push(event)
      },
    })

    expect(forecast.projectRemainingForecastDays).toBe(15)
    expect(recordedEvents).toHaveLength(1)
    expect(recordedEvents[0]).toEqual(expect.objectContaining({
      engineCode: 'project_remaining_forecast',
      outputKind: 'project_remaining_forecast',
      projectId: 'project-1',
      predictionBasis: 'runtime_project_remaining_forecast',
      predictionSource: 'projectRemainingDurationForecastService',
      modelVersion: 'project_remaining_forecast_v1',
      predictedAt: '2026-06-10',
      predictedFinishDate: '2026-06-24',
      predictedDurationDays: 15,
      runtimeConsumptionState: 'runtime_snapshot',
      seedLineage: expect.objectContaining({
        durationOutputCode: 'project_remaining_forecast',
      }),
      networkLineage: expect.objectContaining({
        rowCount: 1,
        criticalRemainingTaskCount: 1,
        activeMonthlyCommitmentCount: 2,
        carryoverMonthlyCommitmentCount: 1,
        latestCommitmentFinishDate: '2026-06-24',
      }),
    }))
  })

  it('records runtime consumer evidence from buildProjectRemainingDurationForecast when published artifacts are consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'critical-structure',
          values: {
            ...row().values,
            project_id: 'project-1',
            planned_end_date: '2026-06-20',
            forecast_finish_date: '2026-06-22',
            total_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
      projectId: 'project-1',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeConsumerObservedAt: '2026-06-15T07:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'forecast_residual_overlay',
          publicationKey: 'forecast_residual_overlay_runtime:overlay-v5',
          publicationStatus: 'published',
        },
        {
          assetKey: 'wbs_reference_days',
          publicationKey: 'wbs_reference_days_runtime:reference-v5',
          publicationStatus: 'runtime_published',
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'critical_path_rule_runtime:critical-v5',
          publicationStatus: 'canary',
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'dependency_rule_runtime:dependency-v5',
          publicationStatus: 'published',
        },
      ],
    })

    expect(forecast.durationOutputCode).toBe('project_remaining_forecast')
    await flushRuntimeConsumerRecording()

    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'forecast_residual_overlay',
        'forecast_residual_overlay_runtime:overlay-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'wbs_reference_days',
        'wbs_reference_days_runtime:reference-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'critical_path_rule_candidate',
        'critical_path_rule_runtime:critical-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
    ])
  })

  it('records v1.4.22.5 runtime consumer evidence for project remaining forecast artifacts', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const forecast = buildProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'critical-structure',
          values: {
            ...row().values,
            project_id: 'project-1',
            planned_end_date: '2026-06-20',
            forecast_finish_date: '2026-06-22',
            total_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
    })

    const result = await recordProjectRemainingDurationForecastRuntimeConsumption({
      queryExec,
      projectId: 'project-1',
      forecast,
      observedAt: '2026-06-15T07:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'forecast_residual_overlay',
          publicationKey: 'forecast_residual_overlay_runtime:overlay-v5',
          publicationStatus: 'published',
        },
        {
          assetKey: 'wbs_reference_days',
          publicationKey: 'wbs_reference_days_runtime:reference-v5',
          publicationStatus: 'runtime_published',
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'critical_path_rule_runtime:critical-v5',
          publicationStatus: 'canary',
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'dependency_rule_runtime:dependency-v5',
          publicationStatus: 'published',
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 3,
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
        'forecast_residual_overlay',
        'forecast_residual_overlay_runtime:overlay-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'wbs_reference_days',
        'wbs_reference_days_runtime:reference-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'critical_path_rule_candidate',
        'critical_path_rule_runtime:critical-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
    ])
  })
})
