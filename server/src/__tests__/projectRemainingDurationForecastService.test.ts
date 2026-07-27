import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildProjectRemainingDurationForecast,
  recordProjectRemainingDurationForecastRuntimeConsumption,
} from '../services/projectRemainingDurationForecastService.js'
import type { ScheduleAccelerationRow } from '../services/scheduleAccelerationService.js'

function productionDayMetric(value: number | null) {
  return {
    value,
    unit: 'construction_production_day' as const,
    calendarRef: null,
    calendarVersion: null,
    timezone: 'Asia/Shanghai',
    asOf: '2026-06-10',
    availability: 'unavailable' as const,
    unavailableReason: 'construction_calendar_identity_missing',
  }
}

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

function buildAvailableProjectRemainingDurationForecast(
  params: Parameters<typeof buildProjectRemainingDurationForecast>[0],
) {
  return buildProjectRemainingDurationForecast({
    constructionCalendar: {
      basis: 'official_construction_calendar_seed',
      windows: [],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    },
    ...params,
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('projectRemainingDurationForecastService', () => {
  it('derives a missing asOf in the construction-calendar timezone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T16:30:00.000Z'))

    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [row()],
      targetEndDate: '2026-07-25',
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          holidayCode: 'identified_calendar_marker',
          startDate: '2026-01-01',
          endDate: '2026-01-01',
          calendarKind: 'compensatory_workday',
        }],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })

    expect(forecast.projectRemainingForecast.asOf).toBe('2026-07-20')
    expect(forecast.targetGap.asOf).toBe('2026-07-20')
  })

  it('builds a governed project-level remaining forecast from critical path, monthly commitments and external gates', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
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
      projectRemainingForecastDays: 19,
      forecastFinishDate: '2026-06-28',
      targetGapDays: 3,
      rowsEvaluated: 2,
    }))
    expect(forecast.projectRemainingForecast).toEqual(expect.objectContaining({
      value: 19,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      availability: 'available',
      unavailableReason: null,
    }))
    expect(forecast.targetGap).toEqual(expect.objectContaining({
      value: 3,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'available',
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
        commitmentFinishSoftSignalDate: '2026-06-30',
        commitmentFinishBeyondForecastDays: 2,
        softSignalPolicy: 'status_only_not_finish_boundary',
      }),
      externalInterfaces: expect.objectContaining({
        hardGateCount: 1,
        latestGateFinishDate: '2026-06-28',
      }),
    }))
  })

  it('keeps confirmed monthly commitments as soft pressure instead of pushing the project finish boundary', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'critical-structure',
          values: {
            ...row().values,
            planned_end_date: '2026-06-20',
            total_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
      monthlyCommitments: {
        activeCommitmentCount: 1,
        carryoverCommitmentCount: 0,
        latestCommitmentFinishDate: '2026-06-30',
      },
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-20')
    expect(forecast.projectRemainingForecastDays).toBe(11)
    expect(forecast.calculationContext.monthlyCommitments).toEqual(expect.objectContaining({
      latestCommitmentFinishDate: '2026-06-30',
      commitmentFinishSoftSignalDate: '2026-06-30',
      commitmentFinishBeyondForecastDays: 10,
      softSignalPolicy: 'status_only_not_finish_boundary',
    }))
  })

  it('excludes WBS summary rollups from the remaining-work forecast boundary', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'project-summary',
          values: {
            ...row().values,
            title: 'Project master-plan summary',
            planned_end_date: '2026-07-31',
            progress: 0,
            status: 'todo',
            is_wbs_summary: true,
            is_executable: false,
            duration_contribution_mode: 'record_only',
          },
        }),
        row({
          clientRowId: 'completed-child',
          values: {
            ...row().values,
            planned_end_date: '2026-06-20',
            actual_end_date: '2026-06-18',
            progress: 100,
            status: 'completed',
          },
        }),
        row({
          clientRowId: 'remaining-critical-child',
          values: {
            ...row().values,
            planned_end_date: '2026-06-25',
            total_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-06-10',
    })

    expect(forecast.rowsEvaluated).toBe(2)
    expect(forecast.forecastFinishDate).toBe('2026-06-25')
  })

  it('does not treat frozen baseline critical flags as the live remaining critical set', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
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
    const forecast = buildAvailableProjectRemainingDurationForecast({
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
            float: productionDayMetric(null),
            durationDays: 9,
            duration: productionDayMetric(null),
            freeFloat: productionDayMetric(null),
            isAutoCritical: true,
            isManualAttention: false,
            isManualInserted: false,
          },
        ],
        primaryChain: null,
        alternateChains: [],
        projectDurationDays: 9,
        projectDuration: productionDayMetric(null),
        calculationStatus: 'fresh',
        calculatedAt: '2026-06-10T00:00:00.000Z',
      },
    })

    expect(forecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      remainingTaskCount: 1,
      latestCriticalFinishDate: '2026-06-18',
    }))
  })

  it('does not use row-level is_critical as direct critical-path fallback without a fresh E3 snapshot', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'stale-critical-flag',
          values: {
            ...row().values,
            title: 'Stale legacy critical flag',
            planned_end_date: '2026-07-05',
            is_critical: true,
            total_float_days: 15,
            free_float_days: 9,
          },
        }),
        row({
          clientRowId: 'live-float-critical',
          values: {
            ...row().values,
            title: 'Live float projection critical task',
            planned_end_date: '2026-06-18',
            is_critical: false,
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

  it('uses E2 task forecast finish dates as row governing finish when present', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
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

  it('separates parallel external waits from finish gates when deriving project remaining duration', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'internal-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-06-20',
            total_float_days: 0,
            free_float_days: 0,
            is_critical: true,
          },
        }),
        row({
          clientRowId: 'power-wait',
          values: {
            title: 'Permanent power approval wait',
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
        row({
          clientRowId: 'handover-gate',
          values: {
            title: 'Project acceptance and handover',
            planned_start_date: '2026-06-21',
            planned_end_date: '2026-06-30',
            progress: 0,
            status: 'todo',
            gateRelation: 'acceptance_gate',
            standard_task_metadata: {
              internalFlowRelationKind: 'acceptance_gate',
              externalInterfaceCodes: ['archive_acceptance'],
              acceptanceRequired: true,
            },
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
    })

    expect(forecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      hardGateCount: 2,
      gateRelationSummary: expect.objectContaining({
        parallelWaitCount: 1,
        finishGateCount: 1,
        totalCount: 2,
      }),
      overlappedRemainingDays: 11,
      overlappedGateFinishDate: '2026-06-28',
      gateTailDaysAfterInternal: 10,
      serialRemainingDays: 10,
      latestGateFinishDate: '2026-06-30',
      serializedGateFinishDate: '2026-06-30',
    }))
    expect(forecast.forecastFinishDate).toBe('2026-06-30')
    expect(forecast.projectRemainingForecastDays).toBeGreaterThanOrEqual(20)
  })

  it('widens the project remaining finish with E2 confidence bands, CP span and runtime pressure', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
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

  it('orders inverted E2 confidence-band dates before choosing the governing project finish', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'critical-inverted-band',
          values: {
            ...row().values,
            planned_end_date: '2026-06-20',
            total_float_days: 0,
            forecast_finish_date: '2026-06-20',
            forecast_p20_finish_date: '2026-07-05',
            forecast_p80_finish_date: '2026-06-18',
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
    })

    expect(forecast.forecastFinishDate).toBe('2026-07-05')
    expect(forecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      optimisticBandFinishDate: '2026-06-18',
      confidenceBandFinishDate: '2026-07-05',
      confidenceBandDecision: expect.objectContaining({
        status: 'applied',
        governingFinishSource: 'confidence_band',
      }),
    }))
    expect((forecast.calculationContext as any).durationPlausibilityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'duration.band.order' }),
    ]))
  })

  it('caps implausible project remaining forecasts instead of allowing unlimited finish expansion', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'critical-impossible-tail',
          values: {
            ...row().values,
            planned_end_date: '2028-12-31',
            total_float_days: 0,
            forecast_finish_date: '2028-12-31',
            forecast_p80_finish_date: '2029-12-31',
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-12-31',
    })

    expect(forecast.projectRemainingForecastDays).toBeLessThanOrEqual(730)
    expect((forecast.calculationContext as any).durationPlausibilityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'duration.max.project_remaining' }),
    ]))
  })

  it('adds merge bias when several near-critical chains carry similar P80 spread', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
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

  it('uses correlated network Monte Carlo when every active task has a probability distribution', () => {
    const probabilityDuration = {
      method: 'pert_from_existing_percentiles',
      source: 'governed_task_percentiles',
      p20RemainingDays: 8,
      p50RemainingDays: 10,
      p80RemainingDays: 15,
      expectedRemainingDays: 11,
      variance: 0.1,
      standardDeviationDays: 2,
      confidenceBandWidthDays: 7,
    }
    const networkRow = (clientRowId: string, predecessorId?: string) => row({
      clientRowId,
      predecessorDependencies: predecessorId
        ? [{ clientRowId: predecessorId, dependencyType: 'FS', lagDays: 0 }]
        : [],
      values: {
        ...row().values,
        project_id: 'project-1',
        planned_start_date: predecessorId ? '2026-06-11' : '2026-06-01',
        planned_end_date: predecessorId ? '2026-06-20' : '2026-06-10',
        remaining_duration_days: 10,
        total_float_days: 0,
        durationForecast: {
          remainingDurationDays: 10,
          probabilityDuration,
        },
      },
    })

    const forecast = buildAvailableProjectRemainingDurationForecast({
      projectId: 'project-1',
      rows: [
        networkRow('chain-a-1'),
        networkRow('chain-a-2', 'chain-a-1'),
        networkRow('chain-b-1'),
        networkRow('chain-b-2', 'chain-b-1'),
      ],
      asOfDate: '2026-06-01',
    })

    const networkProbability = forecast.calculationContext.criticalPath.networkProbability!
    expect(networkProbability).toEqual(expect.objectContaining({
      probabilityBasis: 'monte_carlo',
      simulationCount: 1000,
      scenarioCorrelation: 0.35,
      taskCount: 4,
      dependencyCount: 2,
      fallbackReasons: [],
    }))
    expect(networkProbability.p80RemainingDays).toBeGreaterThan(networkProbability.p50RemainingDays!)
    expect(forecast.calculationContext.criticalPath.mergeBiasDays).toBe(0)
    expect(forecast.calculationContext.criticalPath.confidenceBandDecision).toEqual(expect.objectContaining({
      probabilityBasis: 'monte_carlo',
      governingFinishSource: 'confidence_band',
    }))
    expect(forecast.forecastFinishDate).toBe(networkProbability.p80FinishDate)
  })

  it('lets the confidence band govern when it is later than merge bias', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
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
    const forecast = buildAvailableProjectRemainingDurationForecast({
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
    const forecast = buildAvailableProjectRemainingDurationForecast({
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

  it('projects remaining finish dates on construction production days when a shutdown calendar is supplied', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'shutdown-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-02-15',
            remaining_duration_days: 2,
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-02-14',
      targetEndDate: '2026-02-15',
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          holidayCode: 'spring_festival_2026',
          holidayName: 'Spring Festival construction shutdown',
          startDate: '2026-02-15',
          endDate: '2026-02-17',
          counts_as_construction_shutdown: true,
        }],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })

    expect(forecast.forecastFinishDate).toBe('2026-02-18')
    expect(forecast.projectRemainingForecastDays).toBe(2)
    expect(forecast.targetGapDays).toBe(3)
    expect(forecast.projectRemainingForecast).toEqual(expect.objectContaining({
      value: 2,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      availability: 'available',
    }))
    expect(forecast.targetGap).toEqual(expect.objectContaining({
      value: 3,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'available',
    }))
    expect(forecast.calculationContext.criticalPath.latestCriticalFinishDate).toBe('2026-02-18')
  })

  it('fails the derived finish and target gap closed when production calendar identity is missing', () => {
    const predictionEventRecorder = vi.fn()

    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'unidentified-calendar-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-02-15',
            remaining_duration_days: 2,
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
      ],
      asOfDate: '2026-02-14',
      targetEndDate: '2026-02-15',
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          holidayCode: 'spring_festival_2026',
          holidayName: 'Spring Festival construction shutdown',
          startDate: '2026-02-15',
          endDate: '2026-02-17',
          counts_as_construction_shutdown: true,
        }],
        calendarRef: null,
        calendarVersion: null,
        timezone: 'Asia/Shanghai',
        availability: 'unavailable',
        unavailableReason: 'construction_calendar_identity_missing',
      },
      predictionEventRecorder,
    })

    expect(forecast.projectRemainingForecast).toEqual(expect.objectContaining({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }))
    expect(forecast.projectRemainingForecastDays).toBeNull()
    expect(forecast.forecastFinishDate).toBeNull()
    expect(forecast.targetGapDays).toBeNull()
    expect(forecast.targetGap).toEqual(expect.objectContaining({
      value: null,
      unit: 'calendar_day',
      availability: 'unavailable',
    }))
    expect(predictionEventRecorder).not.toHaveBeenCalled()
  })

  it('uses the construction calendar when deriving external gate remaining days from its planned window', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'internal-critical-before-shutdown',
          values: {
            ...row().values,
            planned_start_date: '2026-02-14',
            planned_end_date: '2026-02-14',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
        row({
          clientRowId: 'parallel-permit-wait',
          values: {
            title: 'Permanent power permit wait',
            planned_start_date: '2026-02-14',
            planned_end_date: '2026-02-18',
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
      asOfDate: '2026-02-14',
      targetEndDate: '2026-02-18',
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          holidayCode: 'spring_festival_2026',
          holidayName: 'Spring Festival construction shutdown',
          startDate: '2026-02-15',
          endDate: '2026-02-17',
          counts_as_construction_shutdown: true,
        }],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })

    expect(forecast.forecastFinishDate).toBe('2026-02-18')
    expect(forecast.projectRemainingForecastDays).toBe(2)
    expect(forecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      overlappedRemainingDays: 2,
      overlappedGateFinishDate: '2026-02-18',
      gateRelationSummary: expect.objectContaining({
        parallelWaitCount: 1,
        finishGateCount: 0,
      }),
    }))
  })

  it('overlaps external hard-gate remaining windows with internal work', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
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
            title: 'Permanent power approval wait',
            planned_start_date: '2026-06-18',
            planned_end_date: '2026-06-22',
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
      targetEndDate: '2026-07-02',
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-30')
    expect(forecast.projectRemainingForecastDays).toBe(21)
    expect(forecast.targetGapDays).toBe(0)
    expect(forecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      hardGateCount: 1,
      latestGateFinishDate: '2026-06-22',
      overlappedRemainingDays: 5,
      overlappedGateFinishDate: '2026-06-22',
      gateTailDaysAfterInternal: 0,
      serialRemainingDays: 0,
      serializedGateFinishDate: null,
      gateRelationSummary: expect.objectContaining({
        parallelWaitCount: 1,
        finishGateCount: 0,
        totalCount: 1,
      }),
    }))
  })

  it('derives external gate treatment from acceptance gate taxonomy even when the row is not marked external_wait', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'internal-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-06-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
        row({
          clientRowId: 'certificate-acceptance-gate',
          values: {
            title: 'Certificate acceptance release',
            planned_start_date: '2026-06-18',
            planned_end_date: '2026-06-25',
            progress: 0,
            status: 'todo',
            duration_contribution_mode: 'quality_gate',
            standard_task_metadata: {
              gateRelation: 'acceptance_gate',
              qualityControlRole: 'acceptance_gate',
            },
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-24',
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-25')
    expect(forecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      hardGateCount: 1,
      latestGateFinishDate: '2026-06-25',
      overlappedGateFinishDate: null,
      overlappedRemainingDays: 0,
      gateTailDaysAfterInternal: 5,
      serialRemainingDays: 5,
      serializedGateFinishDate: '2026-06-25',
      gateRelationSummary: expect.objectContaining({
        parallelWaitCount: 0,
        finishGateCount: 1,
        totalCount: 1,
      }),
    }))
    expect(forecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      remainingTaskCount: 1,
      latestCriticalFinishDate: '2026-06-20',
    }))
  })

  it('overlaps an external hard-gate window with internal work instead of appending the full gate after it', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
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
      gateTailDaysAfterInternal: 0,
      overlappedRemainingDays: 0,
      overlappedGateFinishDate: null,
      serialRemainingDays: 0,
      serializedGateFinishDate: null,
      gateRelationSummary: expect.objectContaining({
        parallelWaitCount: 0,
        finishGateCount: 1,
        totalCount: 1,
      }),
    }))
  })

  it('overlaps multiple external hard-gate windows instead of summing them serially', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
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
      overlappedRemainingDays: 5,
      overlappedGateFinishDate: '2026-07-04',
      gateTailDaysAfterInternal: 8,
      serializedGateFinishDate: '2026-07-08',
      gateRelationSummary: expect.objectContaining({
        parallelWaitCount: 1,
        finishGateCount: 1,
        totalCount: 2,
      }),
    }))
  })

  it('derives five gateRelation kinds and uses them as distinct E4 finish drivers', () => {
    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'internal-critical',
          values: {
            ...row().values,
            planned_end_date: '2026-06-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
          },
        }),
        row({
          clientRowId: 'parallel-utility-wait',
          values: {
            title: 'Permanent power utility wait',
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-18',
            progress: 0,
            status: 'todo',
            duration_contribution_mode: 'external_wait',
            standard_task_metadata: {
              constraintType: 'external_interface_wait',
              externalInterfaceCodes: ['permanent_power'],
            },
          },
        }),
        row({
          clientRowId: 'startup-certificate-gate',
          values: {
            title: 'Construction permit startup gate',
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-16',
            progress: 0,
            status: 'todo',
            duration_contribution_mode: 'external_wait',
            standard_task_metadata: {
              blockingLevel: 'startup_gate',
              certificateType: 'construction_permit',
            },
          },
        }),
        row({
          clientRowId: 'finish-acceptance-gate',
          values: {
            title: 'Completion acceptance finish gate',
            planned_start_date: '2026-06-20',
            progress: 0,
            status: 'todo',
            remaining_duration_days: 3,
            duration_contribution_mode: 'quality_gate',
            standard_task_metadata: {
              gateRelation: 'acceptance_gate',
              acceptanceRequired: true,
            },
          },
        }),
        row({
          clientRowId: 'handover-document-gate',
          values: {
            title: 'Handover archive document transfer',
            planned_start_date: '2026-06-22',
            progress: 0,
            status: 'todo',
            remaining_duration_days: 2,
            duration_contribution_mode: 'handover_marker',
            standard_task_metadata: {
              documentEvidenceRole: 'handover_document',
              gateRelation: 'handover_gate',
            },
          },
        }),
        row({
          clientRowId: 'mixed-archive-acceptance-wait',
          values: {
            title: 'Archive acceptance external wait',
            planned_start_date: '2026-06-18',
            planned_end_date: '2026-06-21',
            progress: 0,
            status: 'todo',
            duration_contribution_mode: 'external_wait',
            standard_task_metadata: {
              externalInterfaceCodes: ['archive_acceptance'],
              acceptanceRequired: true,
            },
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-22',
    })

    expect(forecast.forecastFinishDate).toBe('2026-06-23')
    expect(forecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      hardGateCount: 5,
      startGateFinishDate: '2026-06-16',
      overlappedGateFinishDate: '2026-06-21',
      finishGateFinishDate: '2026-06-22',
      handoverGateFinishDate: '2026-06-23',
      serializedGateFinishDate: '2026-06-23',
      gateTailDaysAfterInternal: 3,
      serialRemainingDays: 3,
      gateRelationSummary: expect.objectContaining({
        parallelWaitCount: 2,
        startGateCount: 1,
        finishGateCount: 2,
        handoverGateCount: 1,
        mixedGateCount: 1,
        totalCount: 5,
        relationKinds: expect.arrayContaining([
          'parallel_wait',
          'start_gate',
          'finish_gate',
          'handover_gate',
          'mixed_gate',
        ]),
      }),
    }))
  })

  it('records a v1.4.22.4 prediction event for project remaining forecasts when a recorder is provided', () => {
    const recordedEvents: unknown[] = []

    const forecast = buildAvailableProjectRemainingDurationForecast({
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

    expect(forecast.projectRemainingForecastDays).toBe(13)
    expect(recordedEvents).toHaveLength(1)
    expect(recordedEvents[0]).toEqual(expect.objectContaining({
      engineCode: 'project_remaining_forecast',
      outputKind: 'project_remaining_forecast',
      projectId: 'project-1',
      predictionBasis: 'runtime_project_remaining_forecast',
      predictionSource: 'projectRemainingDurationForecastService',
      modelVersion: 'project_remaining_forecast_v1',
      predictedAt: '2026-06-10',
      predictedFinishDate: '2026-06-22',
      predictedDurationDays: 13,
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

  it('surfaces T2 rhythm schedule evidence in E4 project remaining forecasts without changing project dates or writing dependencies', () => {
    const recordedEvents: any[] = []
    const t2Assembly = {
      source: 'duration_input_assembler',
      assemblyGate: {
        status: 'compatible_candidate',
        canEnterC1913Phase1Selection: true,
        requiresManualReview: false,
        canWriteTaskDependencies: false,
        canWritePlanDates: false,
        priorityOverrideBlocked: false,
        conflictCodes: [],
      },
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }
    const t2Package = {
      source: 't2_division_rhythm_schedule_candidate_package',
      tier: 'T2',
      status: 'schedulable_candidate',
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      durationContextCandidateCount: 6,
      dependencyCandidateCount: 5,
      scheduleTrustPolicy: {
        autoApply: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        requiresAssemblyCompatibility: true,
        requiresL5Publication: true,
      },
    }
    const t2Evaluation = {
      source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
      status: 'phase1_readonly_evaluation_ready',
      candidateId: 't2-network-residential-standard-floor',
      canEnterC1913Phase1Selection: true,
      networkSpanDays: 7,
      criticalWindowCodes: ['floor_rebar_formwork_mep_embed', 'concrete_pour_curing'],
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
    }

    const forecast = buildAvailableProjectRemainingDurationForecast({
      rows: [
        row({
          clientRowId: 'critical-with-t2-evidence',
          values: {
            ...row().values,
            planned_end_date: '2026-06-20',
            is_critical: true,
            total_float_days: 0,
            durationForecast: {
              remainingDurationDays: 11,
              forecastFinishDate: '2026-06-20',
              forecastSources: {
                t2RhythmScheduleCandidatePackage: t2Package,
                t2RhythmScheduleCandidateNetworkEvaluation: t2Evaluation,
                durationInputAssembly: t2Assembly,
              },
            },
          },
        }),
      ],
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
      predictionEventRecorder: (event) => recordedEvents.push(event),
    })

    expect(forecast.projectRemainingForecastDays).toBe(11)
    expect(forecast.forecastFinishDate).toBe('2026-06-20')
    expect((forecast.calculationContext as any).t2RhythmScheduleEvidence).toEqual(expect.objectContaining({
      source: 'project_remaining_duration_forecast_e4_row_evidence',
      evidenceMode: 'row_projection_only',
      evidenceRowCount: 1,
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      canEnterC1913Phase1Selection: true,
      releaseEvidenceReady: false,
      missingReleaseEvidenceReasons: [
        'archived_phase1_selector_replay_required',
        'runtime_publication_evidence_required',
      ],
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      t2RhythmScheduleCandidatePackage: expect.objectContaining({
        source: 't2_division_rhythm_schedule_candidate_package',
        tier: 'T2',
        status: 'schedulable_candidate',
      }),
      t2RhythmScheduleCandidateNetworkEvaluation: expect.objectContaining({
        source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
        status: 'phase1_readonly_evaluation_ready',
        networkSpanDays: 7,
      }),
      durationInputAssembly: expect.objectContaining({
        source: 'duration_input_assembler',
        assemblyGate: expect.objectContaining({
          status: 'compatible_candidate',
        }),
      }),
    }))
    expect((forecast.calculationContext as any).durationInputAssembly).toEqual(expect.objectContaining({
      source: 'duration_input_assembler',
      assemblyGate: expect.objectContaining({
        status: 'compatible_candidate',
      }),
    }))
    expect(recordedEvents[0].predictionContext.calculationContext.t2RhythmScheduleEvidence).toEqual(expect.objectContaining({
      evidenceMode: 'row_projection_only',
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      releaseEvidenceReady: false,
      missingReleaseEvidenceReasons: [
        'archived_phase1_selector_replay_required',
        'runtime_publication_evidence_required',
      ],
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    expect(recordedEvents[0].predictionContext.calculationContext.durationInputAssembly).toEqual(expect.objectContaining({
      source: 'duration_input_assembler',
    }))
  })

  it('records runtime consumer evidence from buildProjectRemainingDurationForecast when published artifacts are consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const forecast = buildAvailableProjectRemainingDurationForecast({
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
          sourceEvidenceRefs: ['runtime_publication:forecast-residual-overlay:overlay-v5'],
        },
        {
          assetKey: 'wbs_reference_days',
          publicationKey: 'duration_learning_runtime:wbs_reference_days:reference-v5',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['runtime_publication:wbs-reference-days:reference-v5'],
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-v5',
          publicationStatus: 'canary',
          sourceEvidenceRefs: ['runtime_publication:critical-path-rule:critical-v5'],
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'duration_learning_runtime:dependency_rule_candidate:dependency-v5',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['runtime_publication:dependency-rule:dependency-v5'],
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
        'duration_learning_runtime:wbs_reference_days:reference-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'critical_path_rule_candidate',
        'duration_learning_runtime:critical_path_rule_candidate:critical-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
    ])
  })

  it('records the runtime call without fabricating artifact observations when no publication is consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const forecast = buildAvailableProjectRemainingDurationForecast({
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
    })

    expect(forecast.durationOutputCode).toBe('project_remaining_forecast')
    await flushRuntimeConsumerRecording()

    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations')).toHaveLength(0)
  })

  it('records v1.4.22.5 runtime consumer evidence for project remaining forecast artifacts', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const forecast = buildAvailableProjectRemainingDurationForecast({
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
          sourceEvidenceRefs: ['runtime_publication:forecast-residual-overlay:overlay-v5'],
        },
        {
          assetKey: 'wbs_reference_days',
          publicationKey: 'duration_learning_runtime:wbs_reference_days:reference-v5',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['runtime_publication:wbs-reference-days:reference-v5'],
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-v5',
          publicationStatus: 'canary',
          sourceEvidenceRefs: ['runtime_publication:critical-path-rule:critical-v5'],
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'duration_learning_runtime:dependency_rule_candidate:dependency-v5',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['runtime_publication:dependency-rule:dependency-v5'],
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
        'duration_learning_runtime:wbs_reference_days:reference-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'critical_path_rule_candidate',
        'duration_learning_runtime:critical_path_rule_candidate:critical-v5',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
    ])
  })
})
