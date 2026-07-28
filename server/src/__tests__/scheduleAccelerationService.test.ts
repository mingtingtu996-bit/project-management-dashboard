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
  evaluateBaselineTargetAlignment as evaluateBaselineTargetAlignmentRaw,
  evaluateRuntimeDelayRecovery as evaluateRuntimeDelayRecoveryRaw,
  evaluateRuntimeDelayRecoveryWithCriticalPath as evaluateRuntimeDelayRecoveryWithCriticalPathRaw,
  evaluateScheduleTargetFeasibility as evaluateScheduleTargetFeasibilityRaw,
  recordScheduleAccelerationRuntimeConsumption,
  type ScheduleAccelerationRow,
} from '../services/scheduleAccelerationService.js'
import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import { buildT2RhythmProductionCapacityEvidence } from '../services/t2RhythmProductionCapacityEvidenceService.js'
import { buildT2RhythmScheduleCandidateNetwork } from '../services/t2RhythmScheduleCandidateNetworkService.js'
import { evaluateT2RhythmScheduleCandidateNetwork } from '../services/t2RhythmScheduleCandidateNetworkEvaluationService.js'
import { selectT2RhythmSchedulePhase1Network } from '../services/t2RhythmSchedulePhase1SelectionService.js'
import type {
  ConstructionOrganizationPlanOptionEngineEvaluationSummary,
  ConstructionOrganizationPlanOptionProjectOrganizationScheme,
} from '../services/constructionOrganizationScenarioSelector.js'

function withTrustedT2LiveReplayGate<T extends {
  scheduleTrustEvidence: Record<string, unknown>
}>(evaluation: T): T {
  return {
    ...evaluation,
    scheduleTrustEvidence: {
      ...evaluation.scheduleTrustEvidence,
      standardLibraryTrustGateStatus: 'shadow_replay_ready_not_publishable',
      standardLibraryTrustBoundary: 'archived_live_shadow_replay_only',
      canTrustForRealScheduleCalibration: true,
      standardLibraryTrustGateReleaseBlockers: [],
    },
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

function identifiedConstructionCalendar() {
  return {
    basis: 'official_construction_calendar_seed' as const,
    windows: [],
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    availability: 'available' as const,
    unavailableReason: null,
  }
}

function shiftGregorianDateOnly(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function withIdentifiedConstructionCalendar<T extends { context?: unknown }>(params: T): T {
  const context = params.context && typeof params.context === 'object' && !Array.isArray(params.context)
    ? params.context as Record<string, unknown>
    : {}
  const hasExplicitCalendar = Object.prototype.hasOwnProperty.call(context, 'constructionCalendar')
    || Object.prototype.hasOwnProperty.call(context, 'workCalendar')
  if (hasExplicitCalendar) return params
  return {
    ...params,
    context: {
      ...context,
      constructionCalendar: identifiedConstructionCalendar(),
    },
  }
}

function evaluateScheduleTargetFeasibility(
  params: Parameters<typeof evaluateScheduleTargetFeasibilityRaw>[0],
) {
  return evaluateScheduleTargetFeasibilityRaw(withIdentifiedConstructionCalendar(params))
}

function evaluateBaselineTargetAlignment(
  params: Parameters<typeof evaluateBaselineTargetAlignmentRaw>[0],
) {
  return evaluateBaselineTargetAlignmentRaw(withIdentifiedConstructionCalendar(params))
}

function evaluateRuntimeDelayRecovery(
  params: Parameters<typeof evaluateRuntimeDelayRecoveryRaw>[0],
) {
  return evaluateRuntimeDelayRecoveryRaw(withIdentifiedConstructionCalendar(params))
}

function evaluateRuntimeDelayRecoveryWithCriticalPath(
  params: Parameters<typeof evaluateRuntimeDelayRecoveryWithCriticalPathRaw>[0],
) {
  return evaluateRuntimeDelayRecoveryWithCriticalPathRaw(withIdentifiedConstructionCalendar(params))
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
          projectRemainingForecastFinishDate: '2026-06-30',
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
            total_float_days: 2,
            free_float_days: 1,
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

  it('does not fall back to row dates when the runtime E4 forecast finish is unavailable', () => {
    const feasibility = evaluateRuntimeDelayRecovery({
      rows: [
        buildRow({
          clientRowId: 'runtime-row-with-legacy-finish',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-30',
          },
        }),
      ],
      targetEndDate: '2026-06-20',
      mode: 'compression_preview',
      context: {
        constructionCalendar: identifiedConstructionCalendar(),
        runtime: {
          projectRemainingForecastFinishDate: null,
        },
      },
    })

    expect(feasibility).toBeUndefined()
  })

  it('keeps target overshoot as a Gregorian date shift while production recovery fails closed without calendar identity', () => {
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

    expect(feasibility?.overshootDays).toBe(3)
    expect(feasibility?.overshoot).toEqual(expect.objectContaining({
      value: 3,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'available',
    }))
    expect(feasibility?.recoverable).toEqual(expect.objectContaining({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }))
    expect(feasibility?.unrecoverable).toEqual(expect.objectContaining({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
    }))
    expect(feasibility?.recoverableDays).toBeNull()
    expect(feasibility?.unrecoverableDays).toBeNull()
    expect(feasibility?.strategies).toEqual([])
    expect(feasibility?.accelerationProposal).toBeUndefined()
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

  it('uses construction organization scenario selection as a first-class acceleration context', () => {
    const rows = [
      buildRow({
        clientRowId: 'row-basement',
        values: {
          ...buildRow().values,
          title: '地下室整体结构',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-09-30',
          standard_task_metadata: {
            criticalPathEligible: true,
            resourceProfile: { resourceClass: 'concrete_pour' },
            executionPhase: 'basement',
          },
        },
      }),
      buildRow({
        clientRowId: 'row-tower',
        values: {
          title: '塔楼主体结构',
          planned_start_date: '2026-09-01',
          planned_end_date: '2027-03-31',
          duration_contribution_mode: 'duration_bearing',
          row_projection_mode: 'schedule_row',
          standard_task_metadata: {
            criticalPathEligible: true,
            resourceProfile: { resourceClass: 'rebar' },
            executionPhase: 'superstructure',
          },
        },
        predecessorDependencies: [{
          clientRowId: 'row-basement',
          dependencyType: 'SS',
          lagDays: 30,
          source: 'project_organization_scenario',
          relationRole: 'workflow',
        }],
      }),
    ]
    const planOptionNetworkEvaluation = {
      evaluationRole: 'virtual_plan_option_network_cpm_for_e3_e5' as const,
      e3NetworkBasis: 'combined_virtual_dependency_network_cpm_evaluated_not_persisted' as const,
      projectDurationDays: 207,
      networkSchedule: [
        { nodeId: 'release_core_basement', startDay: 0, finishDay: 54, durationDays: 54, totalFloatDays: 0, isCritical: true },
        { nodeId: 'release_tower_lane', startDay: 20, finishDay: 200, durationDays: 180, totalFloatDays: 0, isCritical: true },
        { nodeId: 'release_handoff', startDay: 200, finishDay: 207, durationDays: 7, totalFloatDays: 0, isCritical: true },
      ],
      criticalNodeIds: ['release_core_basement', 'release_tower_lane', 'release_handoff'],
      edgeCount: 2,
      e5RecoverableSpanDays: 8,
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesCriticalPathFacts: false as const,
    }
    const projectOrganizationScheme: ConstructionOrganizationPlanOptionProjectOrganizationScheme = {
      source: 'project_organization_policy_scheme_candidate',
      evaluationRole: 'business_type_scheme_family_for_e1_e3_e5_candidate_evaluation',
      policyId: 'project-organization-general-civil-multi-building-v1',
      sourceVersion: 'v1.4.22-project-organization-20260620',
      strategy: 'shared_basement_podium_then_multi_tower_lane_network',
      variantCode: 'general_civil_multi_building',
      selectionSignals: [],
      schemeFamily: 'shared_works_then_multi_building_lane',
      primaryInterfaceSequence: ['shared_basement_release', 'podium_interface', 'tower_lane_release', 'site_outdoor_handover'],
      interfaceGateTags: ['shared_basement_gate', 'podium_gate', 'tower_lane_gate', 'outdoor_site_gate'],
      laneRole: 'primary_building_lane',
      lanePrefix: 'tower_lane',
      networkPolicy: {
        sharedWorksRelease: 'before_primary_lanes',
        primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
        interfaceGatePolicy: 'business_type_governed_gate_network',
      },
      confidence: 'high',
      organizationNetwork: {
        stages: [
          { code: 'shared_basement_release', label: 'shared basement release', phase: 'basement', durationDays: 42 },
          { code: 'tower_lane_release', label: 'tower lane release', phase: 'tower', durationDays: 42 },
          { code: 'site_outdoor_handover', label: 'site outdoor handover', phase: 'handoff', durationDays: 28 },
        ],
        dependencies: [
          {
            fromStageCode: 'shared_basement_release',
            toStageCode: 'tower_lane_release',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'policy_interface:shared_basement_to_tower_lane',
          },
          {
            fromStageCode: 'tower_lane_release',
            toStageCode: 'site_outdoor_handover',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'policy_interface:tower_lane_to_site_handover',
          },
        ],
      },
      rationale: 'Fixture policy: shared basement and podium release before staggered tower lanes.',
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
    }
    const planOptionEngineEvaluationSummary: ConstructionOrganizationPlanOptionEngineEvaluationSummary = {
      source: 'construction_organization_plan_option_engine_evaluation_summary' as const,
      evaluationRole: 'candidate_option_e1_e3_e5_summary_not_runtime_execution' as const,
      e1: {
        input: 'selected_virtual_work_packages' as const,
        output: 'virtual_work_package_duration_proxy_pending_generated_row_projection' as const,
        selectedWorkPackageCount: 1,
        selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
        writesReferenceDuration: false as const,
      },
      e3: {
        input: 'combined_virtual_dependency_network' as const,
        output: 'virtual_cpm_duration_and_critical_nodes' as const,
        projectDurationDays: 207,
        criticalNodeCount: 3,
        edgeCount: 2,
        writesCriticalPathSnapshot: false as const,
      },
      e5: {
        input: 'use_case_acceleration_recovery_evaluation' as const,
        output: 'bounded_recovery_factor_hint' as const,
        recoveryFactorHint: 1.07,
        recoverableSpanDays: 8,
        writesAccelerationDraft: false as const,
      },
      projectOrganization: projectOrganizationScheme,
      boundary: {
        candidateOnly: true as const,
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
        writesCriticalPathFacts: false as const,
      },
    }
    const generatedRowProjection = {
      source: 'construction_organization_plan_option_generated_row_projection' as const,
      optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
      projectionBasis: 'generated_wbs_rows_mapped_to_virtual_plan_option_nodes' as const,
      generatedScheduleSpanDays: 215,
      virtualProjectDurationDays: 207,
      spanDeltaDays: 8,
      dependencyAlignmentScore: 1,
      projectionConfidence: 'high' as const,
      mappedNodeCount: 3,
      generatedRowMatchCount: 5,
      unmappedNodeIds: [],
      phaseCoverage: [],
      candidateDependencyPreview: {
        source: 'construction_organization_candidate_dependency_preview' as const,
        previewBasis: 'virtual_dependency_edges_mapped_to_generated_wbs_row_carriers' as const,
        materializationReadiness: {
          source: 'construction_organization_candidate_materialization_readiness' as const,
          readiness: 'ready_for_manual_materialization_preview' as const,
          reasons: ['all_virtual_dependency_edges_have_generated_row_carriers'],
          previewEdgeCount: 2,
          unresolvedEdgeCount: 0,
          writesTaskDependencies: false as const,
          writesPlanDates: false as const,
          writesCriticalPathFacts: false as const,
        },
        previewEdges: [
          {
            fromVirtualNodeId: 'release_core_basement',
            toVirtualNodeId: 'release_tower_lane',
            fromGeneratedRowIds: ['row-basement'],
            toGeneratedRowIds: ['row-tower'],
            dependencyType: 'SS' as const,
            lagDays: 20,
            intent: 'core_basement_release_before_tower_lane_start',
            materializationStatus: 'preview_only' as const,
            writesTaskDependencies: false as const,
          },
          {
            fromVirtualNodeId: 'release_tower_lane',
            toVirtualNodeId: 'release_handoff',
            fromGeneratedRowIds: ['row-tower'],
            toGeneratedRowIds: ['row-handoff'],
            dependencyType: 'FS' as const,
            lagDays: 0,
            intent: 'tower_lane_completion_before_handoff',
            materializationStatus: 'preview_only' as const,
            writesTaskDependencies: false as const,
          },
        ],
        unresolvedEdges: [],
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesCriticalPathFacts: false as const,
      },
      candidateMaterializationEvaluation: {
        source: 'construction_organization_candidate_materialization_evaluation' as const,
        materializationBasis: 'preview_edges_checked_against_generated_wbs_row_dates' as const,
        previewEdgeCount: 2,
        satisfiedEdgeCount: 2,
        violatedEdgeCount: 0,
        unresolvedEdgeCount: 0,
        materializedNetworkSpanDays: 215,
        materializationScore: 1,
        violationDetails: [],
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesCriticalPathFacts: false as const,
      },
      materializationDecision: {
        source: 'construction_organization_candidate_materialization_decision' as const,
        decision: 'ready_for_manual_materialization' as const,
        allowManualMaterialization: true,
        reasons: ['all_virtual_dependency_edges_have_generated_row_carriers'],
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesCriticalPathFacts: false as const,
      },
      materializationReviewPackage: {
        source: 'construction_organization_candidate_materialization_review_package' as const,
        packageBasis: 'manual_review_package_from_generated_row_preview_edges' as const,
        optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
        status: 'ready_for_manual_review' as const,
        allowManualReview: true,
        proposedDependencyEdgeCount: 2,
        blockedReasons: ['all_virtual_dependency_edges_have_generated_row_carriers'],
        proposedDependencyEdges: [
          {
            fromGeneratedRowId: 'row-basement',
            toGeneratedRowId: 'row-tower',
            dependencyType: 'SS' as const,
            lagDays: 20,
            intent: 'core_basement_release_before_tower_lane_start',
            fromVirtualNodeId: 'release_core_basement',
            toVirtualNodeId: 'release_tower_lane',
            operation: 'propose_create_dependency' as const,
            writesTaskDependencies: false as const,
          },
          {
            fromGeneratedRowId: 'row-tower',
            toGeneratedRowId: 'row-handoff',
            dependencyType: 'FS' as const,
            lagDays: 0,
            intent: 'tower_lane_completion_before_handoff',
            fromVirtualNodeId: 'release_tower_lane',
            toVirtualNodeId: 'release_handoff',
            operation: 'propose_create_dependency' as const,
            writesTaskDependencies: false as const,
          },
        ],
        reviewRequired: true as const,
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesCriticalPathFacts: false as const,
      },
      generatedRowNetworkEvaluation: {
        source: 'generated_wbs_row_candidate_network_cpm' as const,
        networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges' as const,
        projectedNetworkSpanDays: 215,
        previewEdgeCount: 2,
        unresolvedEdgeCount: 0,
        criticalGeneratedRowIds: ['row-basement', 'row-tower'],
        materializationStatus: 'fully_mapped_read_only' as const,
        rowSchedule: [
          { generatedRowId: 'row-basement', startDay: 0, finishDay: 122, durationDays: 122, totalFloatDays: 0, isCritical: true },
          { generatedRowId: 'row-tower', startDay: 30, finishDay: 215, durationDays: 185, totalFloatDays: 0, isCritical: true },
        ],
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesCriticalPathFacts: false as const,
      },
      gapReasons: ['selected_by_generated_row_projection_alignment'],
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesCriticalPathFacts: false as const,
    }
    const planOptionUseCaseEvaluations = {
      newProjectPlanning: {
        useCase: 'new_project_planning' as const,
        optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
        optionScore: 78,
        rankBasis: ['default_new_project_planning_option', 'uses_existing_wizard_project_facts'],
        actionability: 'actionable_candidate' as const,
        recoveryFactorHint: 1.07,
        e5RecoverableSpanDays: 8,
        factCoverage: {
          source: 'wizard_project_generation_fact_coverage' as const,
          usesExistingWizardFactsOnly: true as const,
          consumedFactKeys: ['businessType', 'projectTypeCode', 'methodVariantCodes', 'buildingCount'],
          sidecarFactKeys: ['towerCraneCount'],
          missingFactKeys: [],
          completenessScore: 1,
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver' as const,
        },
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
      },
      startingLineOnboarding: {
        useCase: 'starting_line_onboarding' as const,
        optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
        optionScore: 68,
        rankBasis: ['no_starting_line_context'],
        actionability: 'evidence_only' as const,
        recoveryFactorHint: 1.07,
        e5RecoverableSpanDays: 8,
        factCoverage: {
          source: 'wizard_project_generation_fact_coverage' as const,
          usesExistingWizardFactsOnly: true as const,
          consumedFactKeys: ['businessType', 'projectTypeCode', 'methodVariantCodes', 'buildingCount'],
          sidecarFactKeys: ['towerCraneCount'],
          missingFactKeys: [],
          completenessScore: 1,
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver' as const,
        },
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
      },
      accelerationRecovery: {
        useCase: 'acceleration_recovery' as const,
        optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
        optionScore: 91,
        rankBasis: ['e5_recoverable_span_priority', 'bounded_recovery_factor_only'],
        actionability: 'actionable_candidate' as const,
        recoveryFactorHint: 1.07,
        e5RecoverableSpanDays: 8,
        factCoverage: {
          source: 'wizard_project_generation_fact_coverage' as const,
          usesExistingWizardFactsOnly: true as const,
          consumedFactKeys: ['businessType', 'projectTypeCode', 'methodVariantCodes', 'buildingCount'],
          sidecarFactKeys: ['towerCraneCount'],
          missingFactKeys: [],
          completenessScore: 1,
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver' as const,
        },
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
      },
    }

    const feasibility = evaluateScheduleTargetFeasibility({
      rows,
      targetEndDate: '2027-02-28',
      mode: 'compression_preview',
      context: {
        constructionOrganizationScenario: {
          source: 'construction_organization_scenario_selector',
          sourceVersion: 'v1.4.22-construction-organization-scenario-20260620',
          recommendedScenarioIds: ['tower_lane_early_release_after_core_basement'],
          scenarioRecommendations: {
            newProjectPlanning: {
              useCase: 'new_project_planning',
              optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
              selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
              recommendationBasis: ['default_new_project_planning_option'],
              confidence: 'medium',
              actionability: 'actionable_candidate',
              recoveryFactorHint: 1.07,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
            },
            startingLineOnboarding: {
              useCase: 'starting_line_onboarding',
              optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
              selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
              recommendationBasis: ['no_starting_line_context'],
              confidence: 'medium',
              actionability: 'evidence_only',
              recoveryFactorHint: 1.07,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
            },
            accelerationRecovery: {
              useCase: 'acceleration_recovery',
              optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
              selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
              recommendationBasis: ['e5_recoverable_span_priority'],
              confidence: 'medium',
              actionability: 'actionable_candidate',
              recoveryFactorHint: 1.09,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
            },
          },
          recommendedPlanOption: {
            optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
            source: 'construction_organization_plan_option',
            selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
            projectOrganizationScheme,
            combinedScore: 73,
            confidence: 'medium',
            selectionReasons: ['alternative_basement_tower_release_candidate'],
            excludedScenarioIds: [],
            excludedReasons: [],
            combinedVirtualNetwork: {
              source: 'construction_organization_virtual_network',
              nodes: [
                { id: 'release_core_basement', label: 'core basement release', phase: 'basement', durationDays: 54 },
                { id: 'release_tower_lane', label: 'tower lane early superstructure', phase: 'tower', durationDays: 180 },
                { id: 'release_handoff', label: 'tower and shared basement interface handoff', phase: 'handoff', durationDays: 7 },
              ],
              dependencies: [
                { fromNodeId: 'release_core_basement', toNodeId: 'release_tower_lane', dependencyType: 'SS', lagDays: 20, intent: 'core_basement_release_before_tower_lane_start' },
                { fromNodeId: 'release_tower_lane', toNodeId: 'release_handoff', dependencyType: 'FS', lagDays: 0, intent: 'tower_lane_completion_before_handoff' },
              ],
              totalSpanDays: 207,
              criticalNodeIds: ['release_handoff'],
              writesTaskDependencies: false,
              writesPlanDates: false,
            },
            evaluation: {
              evaluationRole: 'combined_plan_option_score_for_e1_e3_e5',
              e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
              e3NetworkBasis: 'combined_virtual_dependency_network_not_persisted',
              e5AccelerationBasis: 'plan_option_recovery_factor_hint',
              networkEvaluation: planOptionNetworkEvaluation,
              engineEvaluationSummary: planOptionEngineEvaluationSummary,
              generatedRowProjection,
              useCaseEvaluations: planOptionUseCaseEvaluations,
              recoveryFactorHint: 1.07,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
            },
          },
          planOptions: [{
            optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
            source: 'construction_organization_plan_option',
            selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
            projectOrganizationScheme,
            combinedScore: 73,
            confidence: 'medium',
            selectionReasons: ['alternative_basement_tower_release_candidate'],
            excludedScenarioIds: [],
            excludedReasons: [],
            combinedVirtualNetwork: {
              source: 'construction_organization_virtual_network',
              nodes: [
                { id: 'release_core_basement', label: 'core basement release', phase: 'basement', durationDays: 54 },
                { id: 'release_tower_lane', label: 'tower lane early superstructure', phase: 'tower', durationDays: 180 },
                { id: 'release_handoff', label: 'tower and shared basement interface handoff', phase: 'handoff', durationDays: 7 },
              ],
              dependencies: [
                { fromNodeId: 'release_core_basement', toNodeId: 'release_tower_lane', dependencyType: 'SS', lagDays: 20, intent: 'core_basement_release_before_tower_lane_start' },
                { fromNodeId: 'release_tower_lane', toNodeId: 'release_handoff', dependencyType: 'FS', lagDays: 0, intent: 'tower_lane_completion_before_handoff' },
              ],
              totalSpanDays: 207,
              criticalNodeIds: ['release_handoff'],
              writesTaskDependencies: false,
              writesPlanDates: false,
            },
            evaluation: {
              evaluationRole: 'combined_plan_option_score_for_e1_e3_e5',
              e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
              e3NetworkBasis: 'combined_virtual_dependency_network_not_persisted',
              e5AccelerationBasis: 'plan_option_recovery_factor_hint',
              networkEvaluation: planOptionNetworkEvaluation,
              engineEvaluationSummary: planOptionEngineEvaluationSummary,
              generatedRowProjection,
              useCaseEvaluations: planOptionUseCaseEvaluations,
              recoveryFactorHint: 1.07,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
            },
          }],
          planOptionComparisonPackage: {
            source: 'construction_organization_plan_option_comparison_package',
            totalOptionCount: 1,
            recommendedOptionIdsByUseCase: {
              newProjectPlanning: 'construction_org_option:tower_lane_early_release_after_core_basement',
              startingLineOnboarding: 'construction_org_option:tower_lane_early_release_after_core_basement',
              accelerationRecovery: 'construction_org_option:tower_lane_early_release_after_core_basement',
            },
            canAutoMaterializeSelectedOption: false,
            comparisonBasis: [
              'candidate_option_e1_e3_e5_summary',
              'use_case_specific_recommendation_scores',
              'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            ],
            options: [{
              source: 'construction_organization_plan_option_comparison_item',
              optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
              selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
              combinedScore: 73,
              confidence: 'medium',
              isRecommendedFor: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
              nextGovernanceAction: 'manual_review_handoff',
              nextGovernanceReasons: [
                'ready_for_manual_review_handoff',
                'all_virtual_dependency_edges_have_generated_row_carriers',
              ],
              systemRecommendationBasis: {
                source: 'construction_organization_plan_option_system_recommendation_basis',
                recommendationRole: 'read_only_candidate_ranking_from_e1_e3_e5_and_generated_row_projection',
                recommendedForUseCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
                rankingSignals: [
                  'candidate_option_e1_e3_e5_summary',
                  'generated_row_projection_alignment',
                  'generated_row_candidate_network_cpm',
                  'generated_row_reference_duration_projection',
                  'candidate_materialization_decision',
                ],
                e1: {
                  selectedWorkPackageCount: 1,
                  hasGeneratedRowReferenceEvidence: true,
                  matchedReferenceRowCount: 1,
                  totalRecommendedDurationDays: 180,
                  writesReferenceDuration: false,
                },
                e3: {
                  projectDurationDays: 207,
                  previewEdgeCount: 2,
                  unresolvedEdgeCount: 0,
                  criticalNodeCount: 1,
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesCriticalPathFacts: false,
                },
                e5: {
                  recoveryFactorHint: 1.07,
                  e5RecoverableSpanDays: 8,
                  writesAccelerationDraft: false,
                },
                materialization: {
                  decision: 'ready_for_manual_materialization',
                  allowManualMaterialization: true,
                  reasons: ['all_virtual_dependency_edges_have_generated_row_carriers'],
                },
                boundaryPolicy: {
                  candidateOnly: true,
                  readOnlyRecommendation: true,
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                  writesCriticalPathFacts: false,
                  writesAccelerationDraft: false,
                },
              },
              useCaseScores: {
                newProjectPlanning: {
                  optionScore: 78,
                  actionability: 'actionable_candidate',
                  e5RecoverableSpanDays: 8,
                  recoveryFactorHint: 1.07,
                  rankBasis: ['default_new_project_planning_option', 'uses_existing_wizard_project_facts'],
                },
                startingLineOnboarding: {
                  optionScore: 68,
                  actionability: 'evidence_only',
                  e5RecoverableSpanDays: 8,
                  recoveryFactorHint: 1.07,
                  rankBasis: ['no_starting_line_context'],
                },
                accelerationRecovery: {
                  optionScore: 91,
                  actionability: 'actionable_candidate',
                  e5RecoverableSpanDays: 8,
                  recoveryFactorHint: 1.07,
                  rankBasis: ['e5_recoverable_span_priority', 'bounded_recovery_factor_only'],
                },
              },
              e1: {
                selectedWorkPackageCount: 1,
                selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
                writesReferenceDuration: false,
              },
              e3: {
                projectDurationDays: 207,
                criticalNodeCount: 1,
                edgeCount: 2,
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              },
              e5: {
                recoveryFactorHint: 1.07,
                e5RecoverableSpanDays: 8,
                writesAccelerationDraft: false,
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
              },
              boundaryPolicy: {
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
                writesCriticalPathFacts: false,
                writesAccelerationDraft: false,
              },
            }],
            boundaryPolicy: [
              'candidate_only',
              'writes_task_dependencies_false',
              'writes_plan_dates_false',
              'requires_domain_writer_release_exit_before_materialization',
            ],
          },
          organizationDecisionReport: {
            source: 'construction_organization_decision_report',
            reportRole: 'product_best_scheme_read_model',
            optionCount: 1,
            candidateCount: 1,
            recommendedPlanOptionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
            recommendedScenarioIds: ['tower_lane_early_release_after_core_basement'],
            projectOrganizationScheme,
            selectedByUseCase: {
              newProjectPlanning: {
                source: 'construction_organization_use_case_decision_report',
                useCase: 'new_project_planning',
                optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
                selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
                actionability: 'actionable_candidate',
                confidence: 'medium',
                decisionBasis: ['default_new_project_planning_option'],
                optionScore: 78,
                virtualProjectDurationDays: 207,
                e5RecoverableSpanDays: 8,
                recoveryFactorHint: 1.07,
                nextGovernanceAction: 'manual_review_handoff',
                nextGovernanceReasons: ['ready_for_manual_review_handoff'],
                excludedAlternatives: [],
                factCoverage: null,
                boundaryPolicy: {
                  recommendedBySystem: true,
                  candidateOnly: true,
                  resourcesAreSidecarSignals: true,
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                  writesCriticalPathFacts: false,
                  writesAccelerationDraft: false,
                },
              },
              startingLineOnboarding: {
                source: 'construction_organization_use_case_decision_report',
                useCase: 'starting_line_onboarding',
                optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
                selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
                actionability: 'evidence_only',
                confidence: 'medium',
                decisionBasis: ['no_starting_line_context'],
                optionScore: 68,
                virtualProjectDurationDays: 207,
                e5RecoverableSpanDays: 8,
                recoveryFactorHint: 1.07,
                nextGovernanceAction: 'generated_row_projection_required',
                nextGovernanceReasons: ['no_starting_line_context'],
                excludedAlternatives: [],
                factCoverage: null,
                boundaryPolicy: {
                  recommendedBySystem: true,
                  candidateOnly: true,
                  resourcesAreSidecarSignals: true,
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                  writesCriticalPathFacts: false,
                  writesAccelerationDraft: false,
                },
              },
              accelerationRecovery: {
                source: 'construction_organization_use_case_decision_report',
                useCase: 'acceleration_recovery',
                optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
                selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
                actionability: 'actionable_candidate',
                confidence: 'medium',
                decisionBasis: ['e5_recoverable_span_priority', 'bounded_recovery_factor_only'],
                optionScore: 91,
                virtualProjectDurationDays: 207,
                e5RecoverableSpanDays: 8,
                recoveryFactorHint: 1.07,
                nextGovernanceAction: 'manual_review_handoff',
                nextGovernanceReasons: ['ready_for_manual_review_handoff'],
                excludedAlternatives: [],
                factCoverage: null,
                boundaryPolicy: {
                  recommendedBySystem: true,
                  candidateOnly: true,
                  resourcesAreSidecarSignals: true,
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                  writesCriticalPathFacts: false,
                  writesAccelerationDraft: false,
                },
              },
            },
            decisionSignals: {
              usesExistingWizardFactsOnly: true,
              decisionFactKeys: ['businessType', 'buildingCount'],
              contextFactKeys: ['projectGenerationFacts'],
              sidecarFactKeys: ['towerCraneCount'],
              resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            },
            engineEvidence: {
              e1: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
              e3: 'combined_virtual_dependency_network_cpm_evaluated_not_persisted',
              e5: 'bounded_recovery_factor_hint',
            },
            productCloseoutReadiness: {
              source: 'construction_organization_product_closeout_readiness_from_decision_report',
              status: 'candidate_recommendation_only_runtime_closeout_required',
              canDeclareConstructionOrganizationProductOutcomeCloseout: false,
              requiredCloseoutEvidence: [
                'constructionOrganizationProductOutcomeCloseoutMatrixService',
                'constructionOrganizationPlanNetworkDraftService.runtimeCloseoutClaim',
                'constructionOrganizationPlanNetworkDraftService.runtimeRecommendedOption',
                'constructionOrganizationPlanNetworkRuntimeEvidenceService',
              ],
              missingBeforeProductCloseout: [
                'real_runtime_evidence_source_required',
                'runtime_use_case_coverage_required',
                'runtime_option_network_coverage_required',
                'runtime_ready_option_closeout_claim_coverage_required',
                'site_adoption_of_runtime_recommended_option_required',
              ],
              nextEvidenceActions: [
                'collect_real_runtime_evidence_for_business_type',
                'collect_runtime_use_case_evidence_for_business_type',
                'collect_runtime_option_network_evidence_for_business_type',
                'record_site_adoption_for_business_type',
              ],
              boundaryPolicy: {
                readOnlyCandidateReport: true,
                productCloseoutRequiresRuntimeMatrix: true,
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
                writesCriticalPathFacts: false,
                writesAccelerationDraft: false,
              },
            },
            boundaryPolicy: {
              candidateOnly: true,
              readOnlyBestScheme: true,
              runtimeMaterializationRequiresGovernance: true,
              resourcesAreSidecarSignals: true,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
          confidence: 'medium',
          frontendInputRequired: false,
          boundaryPolicy: {
            directSeedMutation: false,
            resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            virtualNetworkPolicy: 'scenario_candidates_are_evaluated_as_virtual_networks_before_any_write',
          },
          candidates: [{
            scenarioId: 'tower_lane_early_release_after_core_basement',
            category: 'basement_tower_release',
            label: 'tower lane early release after core basement',
            feasibility: 'recommended',
            score: 73,
            selectionReasons: ['alternative_basement_tower_release_candidate'],
            rejectionReasons: [],
            virtualNetworkHints: {
              dependencyIntents: ['core_basement_release_before_tower_lane_start'],
              releasePolicy: 'staggered_tower_lane_release_virtual_network',
              evaluationRole: 'candidate_virtual_network_only',
            },
            evaluation: {
              evaluationRole: 'candidate_network_score_for_e1_e3_e5',
              compositeScore: 73,
              e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
              e3NetworkBasis: 'virtual_dependency_network_not_persisted',
              e5AccelerationBasis: 'scenario_recovery_factor_hint',
              recoveryFactorHint: 1.06,
              scheduleRiskLevel: 'medium',
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
            },
            virtualNetwork: {
              source: 'construction_organization_virtual_network',
              nodes: [
                { id: 'core_basement', label: 'core basement release', phase: 'basement', durationDays: 54 },
                { id: 'tower_lane', label: 'tower lane early superstructure', phase: 'tower', durationDays: 180 },
                { id: 'handoff', label: 'tower and shared basement interface handoff', phase: 'handoff', durationDays: 7 },
              ],
              dependencies: [
                { fromNodeId: 'core_basement', toNodeId: 'tower_lane', dependencyType: 'SS', lagDays: 20, intent: 'core_basement_release_before_tower_lane_start' },
                { fromNodeId: 'tower_lane', toNodeId: 'handoff', dependencyType: 'FS', lagDays: 0, intent: 'tower_lane_completion_before_handoff' },
              ],
              totalSpanDays: 207,
              criticalNodeIds: ['handoff'],
              writesTaskDependencies: false,
              writesPlanDates: false,
            },
          }],
          factBasis: { usesExistingWizardFactsOnly: true },
        },
      },
    })

    expect(feasibility?.accelerationProposal?.calculationBasis).toEqual(expect.objectContaining({
      constructionOrganizationScenario: expect.objectContaining({
        source: 'construction_organization_scenario_selector',
        recommendedScenarioIds: ['tower_lane_early_release_after_core_basement'],
        recommendedPlanOption: expect.objectContaining({
          optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
          selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
          recoveryFactorHint: 1.07,
          networkEvaluation: expect.objectContaining({
            evaluationRole: 'virtual_plan_option_network_cpm_for_e3_e5',
            projectDurationDays: 207,
            e5RecoverableSpanDays: 8,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
          }),
          engineEvaluationSummary: expect.objectContaining({
            source: 'construction_organization_plan_option_engine_evaluation_summary',
            evaluationRole: 'candidate_option_e1_e3_e5_summary_not_runtime_execution',
            e1: expect.objectContaining({
              input: 'selected_virtual_work_packages',
              output: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
              writesReferenceDuration: false,
            }),
            e3: expect.objectContaining({
              projectDurationDays: 207,
              criticalNodeCount: 3,
              writesCriticalPathSnapshot: false,
            }),
            e5: expect.objectContaining({
              recoveryFactorHint: 1.07,
              recoverableSpanDays: 8,
              writesAccelerationDraft: false,
            }),
            boundary: expect.objectContaining({
              candidateOnly: true,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesCriticalPathFacts: false,
            }),
          }),
          virtualNetworkTotalSpanDays: 207,
          virtualNetworkCriticalNodeIds: ['release_handoff'],
          useCaseEvaluations: expect.objectContaining({
            accelerationRecovery: expect.objectContaining({
              useCase: 'acceleration_recovery',
              rankBasis: expect.arrayContaining(['e5_recoverable_span_priority']),
              e5RecoverableSpanDays: 8,
              factCoverage: expect.objectContaining({
                source: 'wizard_project_generation_fact_coverage',
                resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
              }),
            }),
            startingLineOnboarding: expect.objectContaining({
              actionability: 'evidence_only',
              rankBasis: expect.arrayContaining(['no_starting_line_context']),
            }),
          }),
          boundaryPolicy: expect.objectContaining({
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
          }),
        }),
        planOptions: [expect.objectContaining({
          optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
          selectedScenarioIds: ['tower_lane_early_release_after_core_basement'],
          combinedScore: 73,
          recoveryFactorHint: 1.07,
          networkEvaluation: expect.objectContaining({
            projectDurationDays: 207,
            e5RecoverableSpanDays: 8,
          }),
          engineEvaluationSummary: expect.objectContaining({
            source: 'construction_organization_plan_option_engine_evaluation_summary',
            e3: expect.objectContaining({ projectDurationDays: 207 }),
            e5: expect.objectContaining({ recoverableSpanDays: 8 }),
          }),
          generatedRowProjection: expect.objectContaining({
            dependencyAlignmentScore: expect.any(Number),
            candidateDependencyPreview: expect.objectContaining({
              source: 'construction_organization_candidate_dependency_preview',
              materializationReadiness: expect.objectContaining({
                source: 'construction_organization_candidate_materialization_readiness',
                readiness: 'ready_for_manual_materialization_preview',
                previewEdgeCount: 2,
                unresolvedEdgeCount: 0,
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              }),
              previewEdgeCount: 2,
              unresolvedEdgeCount: 0,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
            candidateMaterializationEvaluation: expect.objectContaining({
              source: 'construction_organization_candidate_materialization_evaluation',
              materializationBasis: 'preview_edges_checked_against_generated_wbs_row_dates',
              previewEdgeCount: 2,
              satisfiedEdgeCount: 2,
              violatedEdgeCount: 0,
              unresolvedEdgeCount: 0,
              materializationScore: 1,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
            materializationDecision: expect.objectContaining({
              source: 'construction_organization_candidate_materialization_decision',
              decision: 'ready_for_manual_materialization',
              allowManualMaterialization: true,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
            materializationReviewPackage: expect.objectContaining({
              source: 'construction_organization_candidate_materialization_review_package',
              packageBasis: 'manual_review_package_from_generated_row_preview_edges',
              status: 'ready_for_manual_review',
              allowManualReview: true,
              proposedDependencyEdgeCount: 2,
              proposedDependencyEdges: expect.arrayContaining([
                expect.objectContaining({
                  operation: 'propose_create_dependency',
                  writesTaskDependencies: false,
                }),
              ]),
              reviewRequired: true,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
            generatedRowNetworkEvaluation: expect.objectContaining({
              source: 'generated_wbs_row_candidate_network_cpm',
              networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
              projectedNetworkSpanDays: 215,
              previewEdgeCount: 2,
              unresolvedEdgeCount: 0,
              criticalGeneratedRowIds: ['row-basement', 'row-tower'],
              materializationStatus: 'fully_mapped_read_only',
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
          }),
          virtualNetworkTotalSpanDays: 207,
          useCaseEvaluations: expect.objectContaining({
            accelerationRecovery: expect.objectContaining({
              useCase: 'acceleration_recovery',
              e5RecoverableSpanDays: 8,
            }),
          }),
        })],
        scenarioRecommendations: expect.objectContaining({
          accelerationRecovery: expect.objectContaining({
            useCase: 'acceleration_recovery',
            optionId: 'construction_org_option:tower_lane_early_release_after_core_basement',
            recoveryFactorHint: 1.09,
            actionability: 'actionable_candidate',
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
          }),
        }),
        resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        candidateEvaluations: [expect.objectContaining({
          scenarioId: 'tower_lane_early_release_after_core_basement',
          recoveryFactorHint: 1.06,
          virtualNetworkTotalSpanDays: 207,
          virtualNetworkCriticalNodeIds: ['handoff'],
        })],
      }),
      constructionOrganizationRecoveryFactor: expect.any(Number),
    }))
    expect((feasibility?.accelerationProposal?.calculationBasis as any)?.constructionOrganizationRecoveryFactor).toBe(1.09)
  })

  it('derives construction organization scenario from hydrated project generation facts when runtime rows have no scenario metadata', () => {
    const rows = [
      buildRow({
        clientRowId: 'row-basement',
        values: {
          ...buildRow().values,
          title: 'shared basement structure',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-09-30',
          standard_task_metadata: {
            criticalPathEligible: true,
            resourceProfile: { resourceClass: 'concrete_pour' },
            executionPhase: 'basement',
          },
        },
      }),
      buildRow({
        clientRowId: 'row-tower',
        values: {
          title: 'tower superstructure',
          planned_start_date: '2026-09-15',
          planned_end_date: '2027-03-31',
          duration_contribution_mode: 'duration_bearing',
          row_projection_mode: 'schedule_row',
          standard_task_metadata: {
            criticalPathEligible: true,
            resourceProfile: { resourceClass: 'rebar' },
            executionPhase: 'superstructure',
          },
        },
        predecessorDependencies: [],
      }),
    ]

    const feasibility = evaluateScheduleTargetFeasibility({
      rows,
      targetEndDate: '2027-02-28',
      mode: 'compression_preview',
      context: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'frame_shear_wall',
          methodVariantCodes: ['pile', 'vertical_only', 'no_horizontal_strut'],
          buildingPatternCodes: ['multi_tower'],
          climateSignals: ['plum_rain'],
          weatherImpactBands: ['earthwork_rain'],
          buildingCount: 3,
          basementLevelCount: 2,
          basementAreaM2: 26000,
          foundationDepthM: 5.5,
          highestBuildingFloorCount: 26,
          scopeOrganizationFacts: {
            buildingObjectCount: 3,
            sharedBasementObjectCount: 1,
            sharedBasementServiceTargetCount: 3,
            organizationSignals: [
              'multi_building_scope_objects',
              'shared_basement_service_range',
            ],
          },
          towerCraneCount: 2,
        },
      } as any,
    })

    expect(feasibility?.accelerationProposal?.calculationBasis?.constructionOrganizationScenario).toEqual(expect.objectContaining({
      source: 'construction_organization_scenario_selector',
      recommendedScenarioIds: expect.arrayContaining([
        'pile_before_excavation',
        'shared_basement_first_then_tower',
      ]),
        projectOrganizationPolicy: expect.objectContaining({
          source: 'project_construction_organization_policy_seed',
          policyId: 'project-organization-general-civil-multi-building-v1',
        strategy: 'shared_basement_podium_then_multi_tower_lane_network',
        schemeFamily: 'shared_works_then_multi_building_lane',
        primaryInterfaceSequence: expect.arrayContaining([
          'shared_basement_release',
          'tower_lane_release',
        ]),
        interfaceGateTags: expect.arrayContaining([
          'shared_basement_gate',
          'tower_lane_gate',
        ]),
        resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
      }),
      factBasis: expect.objectContaining({
        projectOrganizationPolicy: expect.objectContaining({
          policyId: 'project-organization-general-civil-multi-building-v1',
          schemeFamily: 'shared_works_then_multi_building_lane',
          }),
        }),
        organizationDecisionReport: expect.objectContaining({
          source: 'construction_organization_decision_report',
          reportRole: 'product_best_scheme_read_model',
          selectedByUseCase: expect.objectContaining({
            accelerationRecovery: expect.objectContaining({
              source: 'construction_organization_use_case_decision_report',
              useCase: 'acceleration_recovery',
              decisionBasis: expect.arrayContaining(['e5_recoverable_span_priority']),
              selectedScenarioIds: expect.arrayContaining(['tower_lane_early_release_after_core_basement']),
              e5RecoverableSpanDays: expect.any(Number),
              recoveryFactorHint: expect.any(Number),
              boundaryPolicy: expect.objectContaining({
                candidateOnly: true,
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesAccelerationDraft: false,
              }),
            }),
          }),
          productCloseoutReadiness: expect.objectContaining({
            source: 'construction_organization_product_closeout_readiness_from_decision_report',
            status: 'candidate_recommendation_only_runtime_closeout_required',
            canDeclareConstructionOrganizationProductOutcomeCloseout: false,
            missingBeforeProductCloseout: expect.arrayContaining([
              'real_runtime_evidence_source_required',
              'runtime_use_case_coverage_required',
              'runtime_option_network_coverage_required',
              'site_adoption_of_runtime_recommended_option_required',
            ]),
          }),
          boundaryPolicy: expect.objectContaining({
            readOnlyBestScheme: true,
            runtimeMaterializationRequiresGovernance: true,
            writesAccelerationDraft: false,
          }),
        }),
      recommendedPlanOption: expect.objectContaining({
        selectedScenarioIds: expect.arrayContaining([
          'pile_before_excavation',
          'shared_basement_first_then_tower',
        ]),
        projectOrganizationScheme: expect.objectContaining({
          source: 'project_organization_policy_scheme_candidate',
          evaluationRole: 'business_type_scheme_family_for_e1_e3_e5_candidate_evaluation',
          policyId: 'project-organization-general-civil-multi-building-v1',
          schemeFamily: 'shared_works_then_multi_building_lane',
          primaryInterfaceSequence: expect.arrayContaining(['shared_basement_release']),
          interfaceGateTags: expect.arrayContaining(['shared_basement_gate']),
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
        }),
        engineEvaluationSummary: expect.objectContaining({
          projectOrganization: expect.objectContaining({
            schemeFamily: 'shared_works_then_multi_building_lane',
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
          }),
        }),
        useCaseEvaluations: expect.objectContaining({
          accelerationRecovery: expect.objectContaining({
            useCase: 'acceleration_recovery',
            factCoverage: expect.objectContaining({
              consumedFactKeys: expect.arrayContaining([
                'businessType',
                'methodVariantCodes',
                'buildingCount',
                'scopeOrganizationFacts',
              ]),
              sidecarFactKeys: expect.arrayContaining(['towerCraneCount']),
              resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            }),
          }),
        }),
        boundaryPolicy: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
        }),
      }),
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
          projectRemainingForecastFinishDate: '2026-12-31',
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
      context: {
        ...factContext.scheduleAccelerationContext,
        runtime: {
          ...factContext.scheduleAccelerationContext.runtime,
          projectRemainingForecastFinishDate: '2026-12-31',
        },
      },
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

  it('splits proposal recovery budget from seeded profile ratios instead of a hardcoded 50/50 split', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'cleanroom-structure',
          values: {
            title: 'Hospital cleanroom structure',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-08-31',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            duration_suggestion: { recommendedDurationDays: 92, conservativeDurationDays: 92 },
            standard_task_metadata: {
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'concrete_pour' },
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'cleanroom-hvac',
          values: {
            title: 'Cleanroom HVAC commissioning',
            planned_start_date: '2026-09-01',
            planned_end_date: '2026-12-31',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            duration_suggestion: { recommendedDurationDays: 122, conservativeDurationDays: 122 },
            standard_task_metadata: {
              executionPhase: 'cleanroom_hvac',
              resourceProfile: { resourceClass: 'hvac' },
            },
          },
          predecessorDependencies: [{
            clientRowId: 'cleanroom-structure',
            dependencyType: 'FS',
            lagDays: 12,
            source: 'cross_item_workflow',
            relationRole: 'workflow',
          }],
        }),
      ],
      targetEndDate: '2026-10-31',
      mode: 'compression_preview',
      context: {
        projectTypeCodes: ['hospital'],
        climateSignals: ['winter_restricted'],
      },
    })

    const proposal = feasibility?.accelerationProposal
    const fastTrack = proposal?.actions.find((action) => action.type === 'fast_track')

    expect(proposal?.calculationBasis.fastTrackBudgetRatio).toBe(0.027)
    expect(fastTrack?.recoverDays ?? 0).toBeLessThanOrEqual(4)
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
      context: {
        asOfDate: '2026-06-01',
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
      },
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
      recoverDuration: expect.objectContaining({
        unit: 'construction_production_day',
        availability: 'available',
      }),
      durationAdjustments: expect.arrayContaining([
        expect.objectContaining({
          clientRowId: 'structure',
          currentDurationDays: 10,
          proposedDurationDays: expect.any(Number),
          recoverDays: expect.any(Number),
          currentDuration: expect.objectContaining({ unit: 'construction_production_day' }),
          proposedDuration: expect.objectContaining({ unit: 'construction_production_day' }),
          recoverDuration: expect.objectContaining({ unit: 'construction_production_day' }),
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
          currentDuration: expect.objectContaining({ unit: 'construction_production_day' }),
          proposedDuration: expect.objectContaining({ unit: 'construction_production_day' }),
          recoverDuration: expect.objectContaining({ unit: 'construction_production_day' }),
          changedFields: expect.arrayContaining(['planned_end_date']),
          visualDiff: expect.objectContaining({
            durationDeltaDays: expect.any(Number),
            durationDelta: expect.objectContaining({
              unit: 'construction_production_day',
              availability: 'available',
            }),
            startDelta: expect.objectContaining({
              unit: 'calendar_day',
              calendarRef: 'gregorian',
              calendarVersion: 'ISO-8601',
              availability: 'available',
            }),
            endDelta: expect.objectContaining({
              unit: 'calendar_day',
              calendarRef: 'gregorian',
              calendarVersion: 'ISO-8601',
              availability: 'available',
            }),
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
        type: 'update_row',
        rowId: 'structure',
        values: expect.objectContaining({
          planned_end_date: expect.any(String),
        }),
      }),
      expect.objectContaining({
        type: 'update_row',
        rowId: 'fitout',
        values: expect.objectContaining({
          planned_start_date: expect.any(String),
        }),
      }),
    ]))

  })

  it('moves proposed plan dates by Gregorian calendar days without skipping construction shutdowns', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'structure-calendar-shift',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            duration_suggestion: { recommendedDurationDays: 10 },
          },
        }),
        buildRow({
          clientRowId: 'fitout-calendar-shift',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-20',
            duration_suggestion: { recommendedDurationDays: 10 },
          },
          predecessorDependencies: [{
            clientRowId: 'structure-calendar-shift',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'cross_item_workflow',
            relationRole: 'workflow',
          }],
        }),
      ],
      targetEndDate: '2026-06-15',
      mode: 'compression_preview',
      context: {
        asOfDate: '2026-06-01',
        constructionCalendar: {
          ...identifiedConstructionCalendar(),
          windows: [
            {
              holidayCode: 'structure_shutdown',
              startDate: '2026-06-04',
              endDate: '2026-06-04',
              counts_as_construction_shutdown: true,
            },
            {
              holidayCode: 'fitout_shutdown',
              startDate: '2026-06-14',
              endDate: '2026-06-14',
              counts_as_construction_shutdown: true,
            },
          ],
        },
      },
    })

    const crashAdjustment = feasibility?.accelerationProposal?.rescheduleDraft?.taskDateAdjustments
      .find((adjustment) => adjustment.reschedulePolicy === 'resource_crash_preview')
    expect(crashAdjustment).toBeDefined()
    expect(crashAdjustment?.proposedEndDate).toBe(shiftGregorianDateOnly(
      crashAdjustment?.currentStartDate ?? '',
      Math.max(0, (crashAdjustment?.proposedDurationDays ?? 1) - 1),
    ))
  })

  it('does not expose a reschedule draft when task edits do not recover the project terminal finish', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'early-compressible',
          values: {
            ...buildRow().values,
            title: 'Early compressible activity',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure_rhythm',
              resourceProfile: { resourceClass: 'rebar' },
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'terminal-hard-wait',
          values: {
            ...buildRow().values,
            title: 'Terminal curing wait',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-08-31',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              executionPhase: 'acceptance_handover',
              constraintType: 'curing_wait',
              resourceProfile: { resourceClass: 'concrete_pour' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-08-01',
      mode: 'compression_preview',
    })

    expect(feasibility?.overshootDays).toBeGreaterThan(0)
    expect(feasibility?.accelerationProposal?.totalRecoverDays).toBe(0)
    expect(feasibility?.accelerationProposal?.rescheduleDraft).toBeUndefined()
    expect(feasibility?.accelerationProposal?.remainingGapDays).toBe(feasibility?.overshootDays)
  })

  it('constrains fast-track recovery budget by critical candidate duration instead of the whole schedule span', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-upstream',
          values: {
            title: 'Critical structure upstream',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-01-10',
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
          clientRowId: 'critical-downstream',
          values: {
            title: 'Critical structure downstream',
            planned_start_date: '2026-01-11',
            planned_end_date: '2026-01-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'superstructure',
              resourceProfile: { resourceClass: 'formwork' },
            },
          },
          predecessorDependencies: [{
            clientRowId: 'critical-upstream',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'cross_item_workflow',
            relationRole: 'workflow',
          }],
        }),
        buildRow({
          clientRowId: 'noncritical-long-tail',
          values: {
            title: 'Noncritical landscaping long tail',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-04-10',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              executionPhase: 'landscaping',
              resourceProfile: { resourceClass: 'general_crew' },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-03-31',
      mode: 'compression_preview',
    })

    const basis = feasibility?.accelerationProposal?.calculationBasis

    expect(basis).toEqual(expect.objectContaining({
      naturalDurationDays: 100,
      criticalCandidateDays: 20,
      fastTrackBudgetRatio: 0.08,
      fastTrackBudgetDays: 2,
    }))
    const fastTrack = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'fast_track')
    expect(fastTrack?.recoverDays ?? 0).toBeLessThanOrEqual(1)
  })

  it('does not generate hold-point fast-track drafts before acceptance gates are released', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'rough-in',
          values: {
            ...buildRow().values,
            title: 'MEP rough-in',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              criticalPathEligible: true,
              executionPhase: 'mep_rough_in',
              resourceProfile: { resourceClass: 'electrical' },
            },
          },
          predecessorDependencies: [],
        }),
        buildRow({
          clientRowId: 'concealed-acceptance',
          values: {
            ...buildRow().values,
            title: '隐蔽验收',
            planned_start_date: '2026-06-21',
            planned_end_date: '2026-06-22',
            duration_contribution_mode: 'duration_bearing',
            row_projection_mode: 'schedule_row',
            standard_task_metadata: {
              gateRelation: 'acceptance_gate',
              qualityControlRole: 'acceptance_gate',
              criticalPathEligible: true,
              executionPhase: 'hidden_acceptance',
              resourceProfile: { resourceClass: 'electrical' },
            },
          },
          predecessorDependencies: [{
            clientRowId: 'rough-in',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'dependency_intent_template',
            relationRole: 'inspection',
          }],
        }),
      ],
      targetEndDate: '2026-06-15',
      mode: 'compression_preview',
    })

    const fastTrack = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'fast_track') as any
    const crashing = feasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing') as any
    expect(fastTrack?.affectedRowIds ?? []).not.toContain('concealed-acceptance')
    expect(crashing?.durationAdjustments?.map((adjustment: any) => adjustment.clientRowId) ?? []).not.toContain('concealed-acceptance')
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

  it('uses the conservative recoverable band when deciding target feasibility', () => {
    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'long-critical-terminal',
          values: {
            ...buildRow().values,
            title: 'Long critical terminal work',
            planned_start_date: '2026-01-01',
            planned_end_date: '2026-12-31',
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
      targetEndDate: '2026-11-21',
      mode: 'compression_preview',
    }) as any

    expect(feasibility.overshootDays).toBeGreaterThan(30)
    expect(feasibility.unrecoverableDays).toBe(0)
    expect(feasibility.recoverableDaysConfidenceBand.conservativeDays).toBeLessThan(feasibility.overshootDays)
    expect(feasibility.verdict).toBe('requires_scope_change')
    expect(feasibility.accelerationProposal?.verdict).toBe('needs_scope_decision')
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
          projectRemainingForecastFinishDate: '2026-07-20',
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

  it('surfaces T2 rhythm schedule evidence in E5 compression previews without materializing template dependencies or dates', () => {
    const t2Evidence = {
      source: 'project_remaining_duration_forecast_e4_row_evidence',
      evidenceRowCount: 1,
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      canEnterC1913Phase1Selection: true,
      requiresManualReview: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      t2RhythmScheduleCandidateNetworkEvaluation: {
        source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
        status: 'phase1_readonly_evaluation_ready',
        candidateId: 't2-network-residential-standard-floor',
        networkSpanDays: 7,
      },
      durationInputAssembly: {
        source: 'duration_input_assembler',
        assemblyGate: {
          status: 'compatible_candidate',
          canEnterC1913Phase1Selection: true,
          requiresManualReview: false,
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
      },
    }

    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-with-t2-evidence',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-07-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            durationForecast: {
              forecastSources: {
                t2RhythmScheduleEvidence: t2Evidence,
                t2RhythmScheduleCandidateNetworkEvaluation: t2Evidence.t2RhythmScheduleCandidateNetworkEvaluation,
                durationInputAssembly: t2Evidence.durationInputAssembly,
              },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-07-01',
      mode: 'compression_preview',
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-07-20',
          t2RhythmScheduleEvidence: t2Evidence,
        } as any,
      },
    })

    const basis = feasibility?.accelerationProposal?.calculationBasis as any

    expect(feasibility?.accelerationProposal?.totalRecoverDays).toBeGreaterThan(0)
    expect(basis?.t2RhythmScheduleEvidence).toEqual(expect.objectContaining({
      source: 'schedule_acceleration_e5_readonly_context',
      evidenceRowCount: 1,
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      canEnterC1913Phase1Selection: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      runtimeProjectRemainingEvidence: expect.objectContaining({
        source: 'project_remaining_duration_forecast_e4_row_evidence',
      }),
      rowEvidence: expect.arrayContaining([
        expect.objectContaining({
          clientRowId: 'critical-with-t2-evidence',
          t2RhythmScheduleCandidateNetworkEvaluation: expect.objectContaining({
            candidateId: 't2-network-residential-standard-floor',
          }),
        }),
      ]),
    }))
    expect(feasibility?.accelerationProposal?.rescheduleDraft?.source).toBe('target_end_compression')
    expect(basis?.t2RhythmScheduleEvidence?.writesTaskDependencies).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesPlanDates).toBe(false)
  })

  it('surfaces T2 phase-1 selection and production capacity coverage in E5 calculation basis', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })
    const productionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableParallelWorkfaces: 3,
        availableCrewStreams: 3,
        evidenceRefs: ['resource_sidecar:e5-capacity'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 3,
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })
    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'e5-c19-13-compatible-t2-network',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'basement-first-option',
        assumptions: ['basement_first_then_tower'],
      },
      productionCapacityEvidence,
    })
    const evaluation = withTrustedT2LiveReplayGate(evaluateT2RhythmScheduleCandidateNetwork(network))
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'e5-c19-13-phase1-selection',
      evaluations: [evaluation],
    })

    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-with-real-t2-chain',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-07-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            durationForecast: {
              forecastSources: {
                t2RhythmScheduleCandidatePackage: candidatePackage,
                t2RhythmProductionCapacityEvidence: productionCapacityEvidence,
                t2RhythmScheduleCandidateNetwork: network,
                t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
                t2RhythmSchedulePhase1Selection: phase1Selection,
                durationInputAssembly: {
                  source: 'duration_input_assembler',
                  assemblyGate: {
                    status: 'compatible_candidate',
                    canEnterC1913Phase1Selection: true,
                    requiresManualReview: false,
                    conflictCodes: [],
                    productionCapacityEvidenceStatus: 'ready',
                    productionCapacityMissingEvidenceCodes: [],
                  },
                  mutationBoundary: {
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesCriticalPathFacts: false,
                    writesSeed: false,
                    writesBaseline: false,
                    writesRuntimePublications: false,
                  },
                },
              },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-07-01',
      mode: 'compression_preview',
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-07-20',
        },
      },
    })

    const basis = feasibility?.accelerationProposal?.calculationBasis as any

    expect(basis?.t2RhythmScheduleEvidence).toEqual(expect.objectContaining({
      canEnterC1913Phase1Selection: true,
      requiresManualReview: false,
      productionCapacityCoverage: expect.objectContaining({
        source: 't2_rhythm_production_capacity_coverage',
        status: 'capacity_supported',
        canEnterC1913Phase1Selection: true,
        availableParallelWorkfaces: 3,
        availableCrewStreams: 3,
      }),
      phase1Selection: expect.objectContaining({
        source: 't2_rhythm_schedule_phase1_selection',
        status: 'phase1_selection_ready',
        selectedCandidateId: 'e5-c19-13-compatible-t2-network',
        combinationConsistencyGate: expect.objectContaining({
          status: 'pass',
        }),
      }),
      readinessSummary: expect.objectContaining({
        source: 'schedule_acceleration_t2_readiness_summary',
        phase1SelectionStatus: 'phase1_selection_ready',
        productionCapacityCoverageStatus: 'capacity_supported',
        assemblyGateStatus: 'compatible_candidate',
        selectedCandidateId: 'e5-c19-13-compatible-t2-network',
        canEnterC1913Phase1Selection: true,
        requiresManualReview: false,
      }),
    }))
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.blockingReasons).toEqual([])
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.conflictCodes).toEqual([])
    expect(basis?.t2RhythmScheduleEvidence?.writesTaskDependencies).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesPlanDates).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesCriticalPathFacts).toBe(false)
  })

  it('blocks E5 phase-1 T2 readiness when production capacity evidence is incomplete', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })
    const productionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableParallelWorkfaces: 3,
        evidenceRefs: ['resource_sidecar:e5-partial-capacity'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 3,
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })
    const phase1Selection = {
      source: 't2_rhythm_schedule_phase1_selection',
      status: 'phase1_selection_ready',
      selectedCandidateId: 'e5-c19-13-stale-phase1-selection',
      combinationConsistencyGate: {
        status: 'pass',
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

    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-with-partial-t2-capacity',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-07-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            durationForecast: {
              forecastSources: {
                t2RhythmScheduleCandidatePackage: candidatePackage,
                t2RhythmProductionCapacityEvidence: productionCapacityEvidence,
                t2RhythmSchedulePhase1Selection: phase1Selection,
              },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-07-01',
      mode: 'compression_preview',
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-07-20',
        },
      },
    })

    const basis = feasibility?.accelerationProposal?.calculationBasis as any

    expect(basis?.t2RhythmScheduleEvidence).toEqual(expect.objectContaining({
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      productionCapacityCoverage: expect.objectContaining({
        source: 't2_rhythm_production_capacity_coverage',
        status: 'evidence_incomplete',
        canEnterC1913Phase1Selection: false,
      }),
      readinessSummary: expect.objectContaining({
        source: 'schedule_acceleration_t2_readiness_summary',
        phase1SelectionStatus: 'phase1_selection_ready',
        productionCapacityCoverageStatus: 'evidence_incomplete',
        selectedCandidateId: 'e5-c19-13-stale-phase1-selection',
        canEnterC1913Phase1Selection: false,
        requiresManualReview: true,
      }),
    }))
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.blockingReasons).toEqual(
      expect.arrayContaining(['production_capacity_evidence_partial', 'crew_stream_capacity_missing']),
    )
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.conflictCodes).toEqual(
      expect.arrayContaining(['production_capacity_evidence_missing']),
    )
    expect(basis?.t2RhythmScheduleEvidence?.writesTaskDependencies).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesPlanDates).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesCriticalPathFacts).toBe(false)
  })

  it('blocks E5 phase-1 T2 readiness when the L3 standard-library live replay trust gate is not trustworthy', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })
    const productionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableParallelWorkfaces: 3,
        availableCrewStreams: 3,
        evidenceRefs: ['resource_sidecar:e5-trust-gate'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 3,
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })
    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'e5-c19-13-trust-gate-network',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'basement-first-option',
        assumptions: ['basement_first_then_tower'],
      },
      productionCapacityEvidence,
    })
    const evaluation = evaluateT2RhythmScheduleCandidateNetwork(network)
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'e5-c19-13-trust-gate-selection',
      evaluations: [evaluation],
    })

    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-with-untrusted-t2-standard-library',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-07-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            durationForecast: {
              forecastSources: {
                t2RhythmScheduleCandidatePackage: candidatePackage,
                t2RhythmProductionCapacityEvidence: productionCapacityEvidence,
                t2RhythmScheduleCandidateNetwork: network,
                t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
                t2RhythmSchedulePhase1Selection: phase1Selection,
                durationInputAssembly: {
                  source: 'duration_input_assembler',
                  assemblyGate: {
                    status: 'candidate_conflict',
                    canEnterC1913Phase1Selection: false,
                    requiresManualReview: true,
                    conflictCodes: ['t2_standard_library_live_replay_not_trustworthy'],
                    productionCapacityEvidenceStatus: 'ready',
                    productionCapacityMissingEvidenceCodes: [],
                    standardLibraryTrustGateStatus: 'not_trustworthy_for_real_schedule',
                    standardLibraryTrustBoundary: 'blocked_live_replay_evidence',
                    standardLibraryTrustBlockingReasons: [
                      'usable_live_replay_samples_required',
                      'manual_annotation_gap_closure_required',
                    ],
                  },
                  inputChannels: {
                    t2RhythmStandardLibraryTrustGate: {
                      source: 'explicit_input',
                      status: 'candidate_conflict',
                      tier: 'T2',
                      assetSource: 't2_rhythm_standard_library_live_replay_trust_gate',
                      canTrustForRealScheduleCalibration: false,
                      trustBoundary: 'blocked_live_replay_evidence',
                    },
                  },
                  mutationBoundary: {
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesCriticalPathFacts: false,
                    writesSeed: false,
                    writesBaseline: false,
                    writesRuntimePublications: false,
                  },
                },
              },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-07-01',
      mode: 'compression_preview',
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-07-20',
        },
      },
    })

    const basis = feasibility?.accelerationProposal?.calculationBasis as any

    expect(basis?.t2RhythmScheduleEvidence).toEqual(expect.objectContaining({
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      readinessSummary: expect.objectContaining({
        source: 'schedule_acceleration_t2_readiness_summary',
        phase1SelectionStatus: 'manual_review_required',
        productionCapacityCoverageStatus: 'capacity_supported',
        assemblyGateStatus: 'candidate_conflict',
        standardLibraryTrustGateStatus: 'not_trustworthy_for_real_schedule',
        standardLibraryTrustBoundary: 'blocked_live_replay_evidence',
        canEnterC1913Phase1Selection: false,
        requiresManualReview: true,
      }),
    }))
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.blockingReasons).toEqual(
      expect.arrayContaining([
        'usable_live_replay_samples_required',
        'manual_annotation_gap_closure_required',
      ]),
    )
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.conflictCodes).toEqual(
      expect.arrayContaining(['t2_standard_library_live_replay_not_trustworthy']),
    )
    expect(basis?.t2RhythmScheduleEvidence?.writesTaskDependencies).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesPlanDates).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesCriticalPathFacts).toBe(false)
  })

  it('blocks E5 phase-1 T2 readiness when the L3 standard-library live replay trust gate is missing', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })
    const productionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableParallelWorkfaces: 3,
        availableCrewStreams: 3,
        evidenceRefs: ['resource_sidecar:e5-missing-trust-gate'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 3,
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })
    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'e5-c19-13-missing-trust-gate-network',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'basement-first-option',
        assumptions: ['basement_first_then_tower'],
      },
      productionCapacityEvidence,
    })
    const evaluation = evaluateT2RhythmScheduleCandidateNetwork(network)
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'e5-c19-13-missing-trust-gate-selection',
      evaluations: [evaluation],
    })

    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-with-missing-t2-standard-library-trust-gate',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-07-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            durationForecast: {
              forecastSources: {
                t2RhythmScheduleCandidatePackage: candidatePackage,
                t2RhythmProductionCapacityEvidence: productionCapacityEvidence,
                t2RhythmScheduleCandidateNetwork: network,
                t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
                t2RhythmSchedulePhase1Selection: phase1Selection,
                durationInputAssembly: {
                  source: 'duration_input_assembler',
                  assemblyGate: {
                    status: 'candidate_conflict',
                    canEnterC1913Phase1Selection: false,
                    requiresManualReview: true,
                    conflictCodes: ['t2_standard_library_live_replay_trust_gate_missing'],
                    productionCapacityEvidenceStatus: 'ready',
                    productionCapacityMissingEvidenceCodes: [],
                    standardLibraryTrustGateStatus: 'missing',
                    standardLibraryTrustBoundary: 'blocked_live_replay_evidence',
                    standardLibraryTrustBlockingReasons: [
                      't2_standard_library_live_replay_trust_gate_missing',
                      'archived_live_replay_required',
                    ],
                  },
                  inputChannels: {},
                  mutationBoundary: {
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesCriticalPathFacts: false,
                    writesSeed: false,
                    writesBaseline: false,
                    writesRuntimePublications: false,
                  },
                },
              },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-07-01',
      mode: 'compression_preview',
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-07-20',
        },
      },
    })

    const basis = feasibility?.accelerationProposal?.calculationBasis as any

    expect(basis?.t2RhythmScheduleEvidence).toEqual(expect.objectContaining({
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      readinessSummary: expect.objectContaining({
        source: 'schedule_acceleration_t2_readiness_summary',
        phase1SelectionStatus: 'manual_review_required',
        productionCapacityCoverageStatus: 'capacity_supported',
        assemblyGateStatus: 'candidate_conflict',
        standardLibraryTrustGateStatus: 'missing',
        standardLibraryTrustBoundary: 'blocked_live_replay_evidence',
        canEnterC1913Phase1Selection: false,
        requiresManualReview: true,
      }),
    }))
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.blockingReasons).toEqual(
      expect.arrayContaining([
        't2_standard_library_live_replay_trust_gate_missing',
        'archived_live_replay_required',
      ]),
    )
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.conflictCodes).toEqual(
      expect.arrayContaining(['t2_standard_library_live_replay_trust_gate_missing']),
    )
    expect(basis?.t2RhythmScheduleEvidence?.writesTaskDependencies).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesPlanDates).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesCriticalPathFacts).toBe(false)
  })

  it('blocks E5 phase-1 T2 readiness when selector receipt audit evidence is missing', () => {
    const staleEvaluationWithoutSelectorReceipts = {
      source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
      status: 'phase1_readonly_evaluation_ready',
      candidateId: 'e5-c19-13-stale-selector-receipt-network',
      canEnterC1913Phase1Selection: true,
      scheduleTrustEvidence: {
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        selectionReceiptCount: 0,
        selectorReceiptAuditStatus: 'missing',
        productionCapacityCoverage: {
          source: 't2_rhythm_production_capacity_coverage',
          status: 'capacity_supported',
          canEnterC1913Phase1Selection: true,
          availableParallelWorkfaces: 3,
          availableCrewStreams: 3,
          blockingReasons: [],
        },
      },
      conflictSummary: {
        conflictCount: 0,
        conflictCodes: [],
        priorityOverrideBlocked: false,
      },
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
      },
    }
    const stalePhase1Selection = {
      source: 't2_rhythm_schedule_phase1_selection',
      status: 'phase1_selection_ready',
      selectedCandidateId: 'e5-c19-13-stale-selector-receipt-network',
      combinationConsistencyGate: {
        receiptRequired: true,
        selectorReceiptRequired: true,
        status: 'pass',
        rejectedConflictCandidateCount: 0,
        rejectedMissingReceiptCandidateCount: 0,
        rejectedMissingSelectorReceiptCandidateCount: 0,
      },
      selectionBasis: {
        strategy: 'assembly_compatible_then_shorter_span',
        assemblyFeasibilityRequired: true,
        selectorReceiptRequired: true,
        linearPriorityCanOverrideAssemblyConflict: false,
        rankSignals: ['template_assembly_compatibility_receipt', 'selector_receipt_audit_trail'],
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

    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-with-missing-selector-receipt',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-07-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            durationForecast: {
              forecastSources: {
                t2RhythmScheduleCandidateNetworkEvaluation: staleEvaluationWithoutSelectorReceipts,
                t2RhythmSchedulePhase1Selection: stalePhase1Selection,
              },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-07-01',
      mode: 'compression_preview',
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-07-20',
        },
      },
    })

    const basis = feasibility?.accelerationProposal?.calculationBasis as any

    expect(basis?.t2RhythmScheduleEvidence).toEqual(expect.objectContaining({
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      readinessSummary: expect.objectContaining({
        source: 'schedule_acceleration_t2_readiness_summary',
        phase1SelectionStatus: 'phase1_selection_ready',
        productionCapacityCoverageStatus: 'capacity_supported',
        selectorReceiptAuditStatus: 'missing',
        selectionReceiptCount: 0,
        selectedCandidateId: 'e5-c19-13-stale-selector-receipt-network',
        canEnterC1913Phase1Selection: false,
        requiresManualReview: true,
      }),
    }))
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.blockingReasons).toEqual(
      expect.arrayContaining(['selector_receipt_missing']),
    )
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.conflictCodes).toEqual(
      expect.arrayContaining(['selector_receipt_missing']),
    )
    expect(basis?.t2RhythmScheduleEvidence?.writesTaskDependencies).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesPlanDates).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesCriticalPathFacts).toBe(false)
  })

  it('blocks E5 phase-1 T2 readiness when phase-1 selection points at a different candidate than the evaluated network', () => {
    const evaluation = {
      source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
      status: 'phase1_readonly_evaluation_ready',
      candidateId: 'e5-c19-15a-current-evaluation-network',
      canEnterC1913Phase1Selection: true,
      scheduleTrustEvidence: {
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        selectionReceiptCount: 1,
        selectorReceiptAuditStatus: 'ready',
        standardLibraryTrustGateStatus: 'shadow_replay_ready_not_publishable',
        standardLibraryTrustBoundary: 'archived_live_shadow_replay_only',
        standardLibraryTrustBlockingReasons: [],
        productionCapacityCoverage: {
          source: 't2_rhythm_production_capacity_coverage',
          status: 'capacity_supported',
          canEnterC1913Phase1Selection: true,
          availableParallelWorkfaces: 3,
          availableCrewStreams: 3,
          blockingReasons: [],
        },
      },
      conflictSummary: {
        conflictCount: 0,
        conflictCodes: [],
        priorityOverrideBlocked: false,
      },
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
      },
    }
    const mismatchedPhase1Selection = {
      source: 't2_rhythm_schedule_phase1_selection',
      status: 'phase1_selection_ready',
      selectedCandidateId: 'e5-c19-15a-stale-selected-network',
      selectedEvaluation: {
        candidateId: 'e5-c19-15a-stale-selected-network',
      },
      combinationConsistencyGate: {
        receiptRequired: true,
        selectorReceiptRequired: true,
        status: 'pass',
        rejectedConflictCandidateCount: 0,
        rejectedMissingReceiptCandidateCount: 0,
        rejectedMissingSelectorReceiptCandidateCount: 0,
      },
      selectionBasis: {
        strategy: 'assembly_compatible_then_shorter_span',
        assemblyFeasibilityRequired: true,
        selectorReceiptRequired: true,
        linearPriorityCanOverrideAssemblyConflict: false,
        rankSignals: ['template_assembly_compatibility_receipt', 'selector_receipt_audit_trail'],
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

    const feasibility = evaluateScheduleTargetFeasibility({
      rows: [
        buildRow({
          clientRowId: 'critical-with-mismatched-phase1-selection',
          values: {
            ...buildRow().values,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-07-20',
            is_critical: true,
            total_float_days: 0,
            free_float_days: 0,
            durationForecast: {
              forecastSources: {
                t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
                t2RhythmSchedulePhase1Selection: mismatchedPhase1Selection,
              },
            },
          },
          predecessorDependencies: [],
        }),
      ],
      targetEndDate: '2026-07-01',
      mode: 'compression_preview',
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-07-20',
        },
      },
    })

    const basis = feasibility?.accelerationProposal?.calculationBasis as any

    expect(basis?.t2RhythmScheduleEvidence).toEqual(expect.objectContaining({
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      readinessSummary: expect.objectContaining({
        source: 'schedule_acceleration_t2_readiness_summary',
        phase1SelectionStatus: 'phase1_selection_ready',
        productionCapacityCoverageStatus: 'capacity_supported',
        selectedCandidateId: 'e5-c19-15a-stale-selected-network',
        canEnterC1913Phase1Selection: false,
        requiresManualReview: true,
      }),
    }))
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.blockingReasons).toEqual(
      expect.arrayContaining(['phase1_selection_candidate_mismatch']),
    )
    expect(basis?.t2RhythmScheduleEvidence?.readinessSummary?.conflictCodes).toEqual(
      expect.arrayContaining(['phase1_selection_candidate_mismatch']),
    )
    expect(basis?.t2RhythmScheduleEvidence?.writesTaskDependencies).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesPlanDates).toBe(false)
    expect(basis?.t2RhythmScheduleEvidence?.writesCriticalPathFacts).toBe(false)
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
          publicationKey: 'duration_learning_runtime:dependency_rule_candidate:dependency-v7',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['runtime_publication:dependency-rule:dependency-v7'],
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-v7',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['runtime_publication:critical-path-rule:critical-v7'],
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
        'duration_learning_runtime:dependency_rule_candidate:dependency-v7',
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
      context: {
        runtime: {
          projectRemainingForecastFinishDate: '2026-01-30',
        },
      },
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeConsumerObservedAt: '2026-06-15T09:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'duration_learning_runtime:dependency_rule_candidate:dependency-v7',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['runtime_publication:dependency-rule:dependency-v7'],
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-v7',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['runtime_publication:critical-path-rule:critical-v7'],
        },
      ],
    })

    expect(feasibility?.scenario).toBe('runtime_delay_recovery')
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'dependency_rule_candidate',
        'duration_learning_runtime:dependency_rule_candidate:dependency-v7',
        'scheduleAccelerationService',
        'schedule_acceleration',
      ],
    ])
  })
})
