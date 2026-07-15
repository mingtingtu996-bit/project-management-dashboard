import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionImpactSignal } from '../services/executionImpactSignals.js'

const state = vi.hoisted(() => {
  const tables: Record<string, any[]> = {
    algorithm_seed_quality_events: [],
    algorithm_seed_upgrade_candidates: [],
    warning_coverage_snapshots: [],
    warning_policy_configs: [],
    warning_threshold_candidates: [],
    warning_owner_confirmations: [],
    notifications: [],
    tasks: [],
    task_duration_forecasts: [],
  }
  const queryLog: Array<{ table: string; method: string; column?: string; value?: unknown; values?: unknown[]; count?: number }> = []

  function buildQuery(table: string) {
    const filters: Array<(row: any) => boolean> = []
    let selected = '*'
    const query: any = {
      select: vi.fn((columns?: string) => {
        selected = columns ?? '*'
        queryLog.push({ table, method: 'select', value: selected })
        return query
      }),
      eq: vi.fn((column: string, value: unknown) => {
        queryLog.push({ table, method: 'eq', column, value })
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        queryLog.push({ table, method: 'in', column, values })
        const set = new Set(values.map((value) => String(value ?? '')))
        filters.push((row) => set.has(String(row[column] ?? '')))
        return query
      }),
      gte: vi.fn((column: string, value: unknown) => {
        queryLog.push({ table, method: 'gte', column, value })
        filters.push((row) => String(row[column] ?? '') >= String(value ?? ''))
        return query
      }),
      update: vi.fn((patch: Record<string, unknown>) => {
        const updateFilters: Array<(row: any) => boolean> = []
        const updateQuery: any = {
          eq: vi.fn((column: string, value: unknown) => {
          queryLog.push({ table, method: 'update.eq', column, value })
            updateFilters.push((row) => String(row[column] ?? '') === String(value ?? ''))
            return updateQuery
          }),
          then: vi.fn((resolve: any) => {
            const rows = (tables[table] ?? []).filter((row) => updateFilters.every((filter) => filter(row)))
            rows.forEach((row) => Object.assign(row, patch))
            return resolve({ data: rows, error: null })
          }),
        }
        return updateQuery
      }),
      insert: vi.fn((rows: any) => {
        const nextRows = Array.isArray(rows) ? rows : [rows]
        tables[table].push(...nextRows)
        const result = { data: nextRows, error: null }
        const insertQuery: any = {
          select: vi.fn(() => insertQuery),
          single: vi.fn(() => Promise.resolve({ data: nextRows[0] ?? null, error: null })),
          then: vi.fn((resolve: any) => resolve(result)),
        }
        return insertQuery
      }),
      upsert: vi.fn((rows: any) => {
        const nextRows = Array.isArray(rows) ? rows : [rows]
        tables[table].push(...nextRows)
        return Promise.resolve({ data: nextRows, error: null })
      }),
      order: vi.fn(() => query),
      limit: vi.fn((count?: number) => {
        queryLog.push({ table, method: 'limit', count })
        return query
      }),
      maybeSingle: vi.fn(() => {
        const row = (tables[table] ?? []).find((item) => filters.every((filter) => filter(item)))
        return Promise.resolve({ data: row ? { ...row, _selected: selected } : null, error: null })
      }),
      then: vi.fn((resolve: any) => {
        const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
        return resolve({ data: rows.map((row) => ({ ...row, _selected: selected })), error: null })
      }),
    }
    return query
  }

  return {
    queryLog,
    tables,
    supabase: {
      from: vi.fn((table: string) => buildQuery(table)),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
}))

vi.mock('../database.js', () => ({
  query: vi.fn(),
}))

vi.mock('../services/changeLogs.js', () => ({
  hasChangeLog: vi.fn(),
  writeLog: vi.fn(),
}))

vi.mock('../services/preMilestoneWarningService.js', () => ({
  scanPreMilestoneWarnings: vi.fn(async () => []),
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  getProjectCriticalPathSnapshot: vi.fn(async () => ({ displayTaskIds: [] })),
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: { scanTrendWarnings: vi.fn(async () => []) },
}))

vi.mock('../services/upgradeChainService.js', () => ({
  acknowledgeWarningNotification: vi.fn(),
  autoEscalateRisksToIssues: vi.fn(),
  autoEscalateWarnings: vi.fn(),
  confirmWarningAsRisk: vi.fn(),
  ensureObstacleEscalatedIssue: vi.fn(),
  markObstacleEscalatedIssuePendingManualClose: vi.fn(),
  muteWarningNotification: vi.fn(),
  notificationToWarning: vi.fn((row: any) => row),
  syncAcceptanceExpiredIssues: vi.fn(),
  syncConditionExpiredIssues: vi.fn(),
  syncWarningNotifications: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { WarningService } from '../services/warningService.js'

function signal(overrides: Partial<ExecutionImpactSignal> = {}): ExecutionImpactSignal {
  return {
    signalId: overrides.signalId ?? 'signal-1',
    sourceAlgorithm: overrides.sourceAlgorithm ?? 'condition',
    sourceEntityType: overrides.sourceEntityType ?? 'project_material',
    sourceEntityId: overrides.sourceEntityId ?? 'material-1',
    sourceCategory: overrides.sourceCategory ?? 'material',
    impactOwnership: overrides.impactOwnership ?? 'condition',
    impactMode: overrides.impactMode ?? 'start_wait',
    impactPhase: overrides.impactPhase ?? 'start',
    severity: overrides.severity ?? 'warning',
    runtimePolicy: overrides.runtimePolicy ?? 'deterministic',
    confidence: overrides.confidence ?? 0.8,
    expectedDate: overrides.expectedDate ?? '2026-05-28',
    reason: overrides.reason ?? 'material gate',
    dedupeKey: overrides.dedupeKey ?? 'project:blocker:project_material:material-1:start',
    weightedRiskScore: overrides.weightedRiskScore ?? 0.8,
    metadata: overrides.metadata,
  }
}

describe('warningService impact signal governance diagnostics', () => {
  beforeEach(() => {
    state.tables.algorithm_seed_quality_events.splice(0, state.tables.algorithm_seed_quality_events.length)
    state.tables.algorithm_seed_upgrade_candidates.splice(0, state.tables.algorithm_seed_upgrade_candidates.length)
    state.tables.warning_coverage_snapshots.splice(0, state.tables.warning_coverage_snapshots.length)
    state.tables.warning_policy_configs.splice(0, state.tables.warning_policy_configs.length)
    state.tables.warning_threshold_candidates.splice(0, state.tables.warning_threshold_candidates.length)
    state.tables.warning_owner_confirmations.splice(0, state.tables.warning_owner_confirmations.length)
    state.tables.notifications.splice(0, state.tables.notifications.length)
    state.tables.tasks.splice(0, state.tables.tasks.length)
    state.tables.task_duration_forecasts.splice(0, state.tables.task_duration_forecasts.length)
    state.queryLog.splice(0, state.queryLog.length)
    vi.clearAllMocks()
  })

  it('builds debug reports from stored readiness summaries and current duration forecasts', async () => {
    state.tables.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
      title: 'Task One',
      readiness_summary: {
        impactSignals: [signal({ signalId: 'readiness-signal' })],
        impactSignalSummary: {
          rawCount: 1,
          dedupedCount: 1,
          signals: [signal({ signalId: 'readiness-signal' })],
          weightedRiskScore: 0.8,
        },
      },
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-1',
      project_id: 'project-1',
      task_id: 'task-1',
      is_current: true,
      forecast_delay_days: 2,
      metadata: {
        forecastSources: {
          impactSignals: [signal({ signalId: 'forecast-signal', impactOwnership: 'acceptance', impactMode: 'finish_gate' })],
          impactSignalSummary: {
            rawCount: 1,
            dedupedCount: 1,
            signals: [signal({ signalId: 'forecast-signal', impactOwnership: 'acceptance', impactMode: 'finish_gate' })],
            confirmedDelayDays: 2,
            weightedConfirmedDelayDays: 2,
            weightedRiskScore: 0.8,
          },
        },
      },
    })

    const report = await new WarningService().buildImpactSignalWarningDebugReports('project-1')

    expect(report.projectId).toBe('project-1')
    expect(report.reports).toHaveLength(2)
    expect(report.reports.map((item: any) => item.source)).toEqual(['readiness_summary', 'duration_forecast'])
    expect(report.coverage).toMatchObject({
      taskCount: 1,
      readinessSummaryCount: 1,
      forecastSummaryCount: 1,
      uncoveredTaskCount: 0,
      impactCoveredTaskCount: 1,
      legacyGapFillCount: 0,
      suppressedLegacyDuplicateCount: 0,
    })
  })

  it('builds replay governance reports from historical task rows and forecast signal snapshots', async () => {
    state.tables.tasks.push({
      id: 'task-hit',
      project_id: 'project-1',
      planned_end_date: '2026-05-10',
      actual_end_date: '2026-05-15',
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-hit',
      project_id: 'project-1',
      task_id: 'task-hit',
      metadata: {
        forecastSources: {
          impactSignals: [signal({ signalId: 'hit-signal', weightedRiskScore: 0.9 })],
        },
      },
    })

    const report = await new WarningService().buildDelayWarningReplayGovernanceReportFromHistory('project-1')

    expect(report.sampleCount).toBe(1)
    expect(report.warningPolicy).toMatchObject({
      policy: 'confirmed_or_weighted_risk_score_at_least_threshold',
      appliedMode: 'shadow_only',
    })
    expect(report.evaluation.after.truePositiveCount).toBe(1)
    expect(report.shadowCalibration).toMatchObject({
      appliedMode: 'shadow_only',
    })
  })

  it('includes lifecycle closure candidates for active signal warnings missing from the current scan', async () => {
    state.tables.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
      title: 'Task One',
      readiness_summary: null,
    })
    state.tables.notifications.push({
      id: 'warning-old',
      project_id: 'project-1',
      task_id: 'task-1',
      warning_type: 'condition_due',
      warning_level: 'warning',
      source_entity_type: 'project_material',
      source_entity_id: 'material-old',
      warning_lifecycle_status: 'active',
      metadata: { delaySignalVersion: 'impact_signal_summary_v1' },
      created_at: '2026-05-25T00:00:00.000Z',
    })

    const report = await new WarningService().buildImpactSignalWarningDebugReports('project-1')

    expect(report.lifecycle).toMatchObject({
      activeCount: 1,
      currentCount: 0,
      actions: [expect.objectContaining({
        warningId: 'warning-old',
        action: 'resolve',
      })],
    })
  })

  it('syncs impact signal lifecycle actions into notification status updates', async () => {
    state.tables.notifications.push({
      id: 'warning-old',
      project_id: 'project-1',
      task_id: 'task-1',
      warning_type: 'condition_due',
      warning_level: 'critical',
      source_entity_type: 'project_material',
      source_entity_id: 'material-old',
      warning_lifecycle_status: 'active',
      metadata: { delaySignalVersion: 'impact_signal_summary_v1' },
      created_at: '2026-05-25T00:00:00.000Z',
    })

    const result = await new WarningService().syncImpactSignalWarningLifecycle('project-1')

    expect(result).toMatchObject({
      resolvedCount: 1,
      downgradedCount: 0,
    })
    expect(state.tables.notifications[0]).toMatchObject({
      warning_lifecycle_status: 'resolved',
      resolved_source: 'impact_signal_disappeared',
    })
  })

  it('loads runtime warning policy from governance config rows', async () => {
    state.tables.warning_policy_configs.push({
      project_id: 'project-1',
      project_type: 'hospital',
      is_active: true,
      config: {
        defaultPolicy: { uncertainRiskScoreThreshold: 0.5 },
        thresholdsByProjectType: {
          hospital: { warningWeightedRiskScore: 0.82 },
        },
      },
    })

    const policy = await new WarningService().resolveRuntimeImpactSignalPolicy('project-1')

    expect(policy).toMatchObject({
      thresholdSource: 'governance_config',
      warningWeightedRiskScore: 0.82,
      uncertainRiskScoreThreshold: 0.5,
    })
  })

  it('applies runtime governance policy to impact signal warning scans', async () => {
    state.tables.warning_policy_configs.push({
      project_id: 'project-1',
      project_type: 'hospital',
      is_active: true,
      config: {
        thresholdsByProjectType: {
          hospital: { warningWeightedRiskScore: 0.95 },
        },
      },
    })
    state.tables.tasks.push({
      id: 'task-policy',
      project_id: 'project-1',
      title: 'Policy Task',
      readiness_summary: null,
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-policy',
      project_id: 'project-1',
      task_id: 'task-policy',
      is_current: true,
      forecast_delay_days: 0,
      metadata: {
        forecastSources: {
          impactSignalSummary: {
            rawCount: 1,
            dedupedCount: 1,
            confirmedDelayDays: 0,
            weightedRiskScore: 0.8,
            uncertaintyIndex: 0.8,
            signals: [signal({
              signalId: 'policy-signal',
              runtimePolicy: 'candidate_only',
              impactMode: 'confidence_only',
              weightedRiskScore: 0.8,
            })],
          },
        },
      },
    })

    const warnings = await new WarningService().scanExecutionImpactSignalWarnings('project-1')

    const delayWarning = warnings.find((warning) => (warning as any).metadata?.delayCertainty === 'uncertain_risk') as any

    expect(delayWarning).toBeTruthy()
    expect(delayWarning.metadata.thresholdPolicy).toMatchObject({
      thresholdSource: 'governance_config',
      warningWeightedRiskScore: 0.95,
    })
  })

  it('records coverage, threshold candidate, owner confirmation, and rule-quality governance artifacts', async () => {
    state.tables.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
      title: 'Task One',
      readiness_summary: null,
      planned_end_date: '2026-05-10',
      actual_end_date: '2026-05-15',
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-hit',
      project_id: 'project-1',
      task_id: 'task-1',
      is_current: true,
      forecast_delay_days: 0,
      generated_at: '2026-05-09T00:00:00.000Z',
      metadata: {
        forecastSources: {
          impactSignals: [signal({
            signalId: 'seed-quality',
            sourceEntityType: 'algorithm_seed',
            sourceEntityId: 'seed-quality-1',
            impactOwnership: 'acceptance',
            impactMode: 'confidence_only',
            runtimePolicy: 'candidate_only',
            weightedRiskScore: 0.91,
            metadata: {
              ruleCode: 'GB50300.acceptance.archive',
              seedSource: 'GB50300',
              ruleQuality: { sampleCount: 3, precision: 0.45, falsePositiveRate: 0.35 },
            },
          })],
          impactSignalSummary: {
            rawCount: 2,
            dedupedCount: 2,
            confirmedDelayDays: 0,
            weightedRiskScore: 0.91,
            uncertaintyIndex: 0.88,
            responsibilityBreakdown: [
              { ownerType: 'participant_unit', ownerUnitId: 'unit-main', ownerRole: 'construction', confidence: 0.9 },
            ],
            signals: [
              signal({
                signalId: 'condition',
                impactOwnership: 'condition',
                runtimePolicy: 'candidate_only',
                impactMode: 'confidence_only',
                metadata: {
                  ruleCode: 'GB50300.acceptance.archive',
                  seedSource: 'GB50300',
                  ruleQuality: { sampleCount: 3, precision: 0.45, falsePositiveRate: 0.35 },
                },
              }),
              signal({
                signalId: 'acceptance',
                impactOwnership: 'acceptance',
                runtimePolicy: 'candidate_only',
                impactMode: 'confidence_only',
              }),
            ],
          },
        },
      },
    })

    const result = await new WarningService().recordImpactSignalGovernanceArtifacts('project-1')

    expect(result).toMatchObject({
      coverageSnapshots: 1,
      thresholdCandidates: 1,
      ownerConfirmations: 1,
      ruleQualityEvents: 1,
    })
    expect(state.tables.warning_coverage_snapshots).toHaveLength(1)
    expect(state.tables.warning_threshold_candidates[0]).toMatchObject({ project_id: 'project-1', status: 'candidate' })
    expect(state.tables.algorithm_seed_upgrade_candidates[0]).toMatchObject({
      seed_type: 'risk_issue_warning_rule',
      project_id: 'project-1',
      action_policy: 'candidate_only',
      status: 'candidate_only',
    })
    expect(state.tables.algorithm_seed_upgrade_candidates[0].candidate_payload).toEqual(expect.objectContaining({
      signalConsumptionPolicy: expect.objectContaining({
        inputContract: 'impactSignalSummary_only',
      }),
      isActive: false,
      reviewNeeded: true,
    }))
    expect(state.tables.warning_owner_confirmations[0]).toMatchObject({ project_id: 'project-1', owner_unit_id: 'unit-main' })
    expect(state.tables.algorithm_seed_quality_events[0]).toMatchObject({ rule_code: 'GB50300.acceptance.archive', runtime_role: 'explain_only' })
  })

  it('feeds resolved owner confirmation results back into seed quality events without duplicating confirmed rows', async () => {
    state.tables.warning_owner_confirmations.push({
      id: 'confirmation-true-positive',
      project_id: 'project-1',
      task_id: 'task-confirm',
      warning_id: 'warning-confirmed',
      owner_unit_id: 'unit-main',
      owner_role: 'construction',
      confirmation_type: 'delay_uncertainty_owner_confirmation',
      status: 'confirmed',
      source_entity_type: 'algorithm_seed',
      source_entity_id: 'seed-confirmed',
      evidence: {
        ruleCode: 'GB50300.acceptance.archive',
        seedSource: 'GB50300',
        weightedRiskScore: 0.88,
        uncertaintyIndex: 0.74,
      },
      created_at: '2026-05-25T00:00:00.000Z',
      resolved_at: '2026-05-26T00:00:00.000Z',
    })
    state.tables.warning_owner_confirmations.push({
      id: 'confirmation-false-positive',
      project_id: 'project-1',
      task_id: 'task-false',
      warning_id: 'warning-false',
      owner_unit_id: 'unit-main',
      owner_role: 'construction',
      confirmation_type: 'delay_uncertainty_owner_confirmation',
      status: 'rejected',
      source_entity_type: 'algorithm_seed',
      source_entity_id: 'seed-false',
      evidence: {
        ruleCode: 'internal.flow.material_gate',
        seedSource: 'internal_flow',
        weightedRiskScore: 0.67,
        uncertaintyIndex: 0.51,
      },
      created_at: '2026-05-25T00:00:00.000Z',
      resolved_at: '2026-05-26T00:00:00.000Z',
    })
    state.tables.warning_owner_confirmations.push({
      id: 'confirmation-already-applied',
      project_id: 'project-1',
      task_id: 'task-old',
      warning_id: 'warning-old',
      confirmation_type: 'delay_uncertainty_owner_confirmation',
      status: 'confirmed',
      feedback_status: 'applied',
      source_entity_type: 'algorithm_seed',
      source_entity_id: 'seed-old',
      evidence: { ruleCode: 'old.rule', seedSource: 'GB50300' },
      resolved_at: '2026-05-26T00:00:00.000Z',
    })

    const result = await new WarningService().applyOwnerConfirmationFeedback('project-1')

    expect(result).toMatchObject({
      projectId: 'project-1',
      scannedConfirmations: 2,
      qualityFeedbackEvents: 2,
    })
    expect(state.tables.algorithm_seed_quality_events).toEqual([
      expect.objectContaining({
        project_id: 'project-1',
        task_id: 'task-confirm',
        warning_id: 'warning-confirmed',
        rule_code: 'GB50300.acceptance.archive',
        seed_source: 'GB50300',
        quality_grade: 'confirmed',
        runtime_role: 'normal',
        source_entity_type: 'algorithm_seed',
        source_entity_id: 'seed-confirmed',
        reasons: expect.arrayContaining(['owner_confirmation_confirmed']),
      }),
      expect.objectContaining({
        project_id: 'project-1',
        task_id: 'task-false',
        warning_id: 'warning-false',
        rule_code: 'internal.flow.material_gate',
        seed_source: 'internal_flow',
        quality_grade: 'owner_rejected',
        runtime_role: 'explain_only',
        source_entity_type: 'algorithm_seed',
        source_entity_id: 'seed-false',
        reasons: expect.arrayContaining(['owner_confirmation_rejected']),
      }),
    ])
    expect(state.tables.warning_owner_confirmations.find((row) => row.id === 'confirmation-true-positive')).toMatchObject({
      feedback_status: 'applied',
    })
    expect(state.tables.warning_owner_confirmations.find((row) => row.id === 'confirmation-false-positive')).toMatchObject({
      feedback_status: 'applied',
    })
    const alreadyApplied = state.tables.warning_owner_confirmations.find((row) => row.id === 'confirmation-already-applied')
    expect(alreadyApplied).toMatchObject({
      feedback_status: 'applied',
    })
    expect(alreadyApplied).not.toHaveProperty('feedback_applied_at')
  })

  it('pushes task and time scan bounds into impact signal summary queries', async () => {
    state.tables.tasks.push(
      {
        id: 'task-1',
        project_id: 'project-1',
        title: 'Task One',
        updated_at: '2026-05-26T10:00:00.000Z',
        readiness_summary: {
          impactSignalSummary: {
            rawCount: 1,
            dedupedCount: 1,
            weightedRiskScore: 0.7,
            signals: [signal({ signalId: 'task-1-signal' })],
          },
        },
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        title: 'Task Two',
        updated_at: '2026-05-20T00:00:00.000Z',
        readiness_summary: {
          impactSignalSummary: {
            rawCount: 1,
            dedupedCount: 1,
            weightedRiskScore: 0.7,
            signals: [signal({ signalId: 'task-2-signal', sourceEntityId: 'material-2' })],
          },
        },
      },
    )
    state.tables.task_duration_forecasts.push({
      id: 'forecast-1',
      project_id: 'project-1',
      task_id: 'task-1',
      is_current: true,
      generated_at: '2026-05-26T11:00:00.000Z',
      forecast_delay_days: 1,
      metadata: {
        forecastSources: {
          impactSignalSummary: {
            rawCount: 1,
            dedupedCount: 1,
            confirmedDelayDays: 1,
            weightedConfirmedDelayDays: 1,
            signals: [signal({ signalId: 'forecast-1-signal', impactOwnership: 'acceptance', impactMode: 'finish_gate' })],
          },
        },
      },
    })

    const warnings = await new WarningService().scanExecutionImpactSignalWarnings('project-1', {
      taskIds: ['task-1'],
      changedSince: '2026-05-25T00:00:00.000Z',
      limit: 20,
    })

    expect(warnings.every((warning) => warning.task_id === 'task-1')).toBe(true)
    expect(state.queryLog).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'tasks', method: 'in', column: 'id', values: ['task-1'] }),
      expect.objectContaining({ table: 'tasks', method: 'gte', column: 'updated_at', value: '2026-05-25T00:00:00.000Z' }),
      expect.objectContaining({ table: 'tasks', method: 'limit', count: 20 }),
      expect.objectContaining({ table: 'task_duration_forecasts', method: 'in', column: 'task_id', values: ['task-1'] }),
      expect.objectContaining({ table: 'task_duration_forecasts', method: 'gte', column: 'generated_at', value: '2026-05-25T00:00:00.000Z' }),
      expect.objectContaining({ table: 'task_duration_forecasts', method: 'limit', count: 20 }),
    ]))
  })

  it('does not resolve active warnings for tasks outside an incremental scan window', async () => {
    state.tables.tasks.push(
      {
        id: 'task-changed',
        project_id: 'project-1',
        title: 'Changed task',
        updated_at: '2026-05-26T10:00:00.000Z',
        readiness_summary: null,
      },
      {
        id: 'task-unchanged',
        project_id: 'project-1',
        title: 'Unchanged task',
        updated_at: '2026-05-20T10:00:00.000Z',
        readiness_summary: null,
      },
    )
    state.tables.notifications.push(
      {
        id: 'warning-changed',
        project_id: 'project-1',
        task_id: 'task-changed',
        warning_type: 'condition_due',
        warning_level: 'warning',
        source_entity_type: 'project_material',
        source_entity_id: 'material-changed',
        warning_lifecycle_status: 'active',
        metadata: { delaySignalVersion: 'impact_signal_summary_v1' },
      },
      {
        id: 'warning-unchanged',
        project_id: 'project-1',
        task_id: 'task-unchanged',
        warning_type: 'condition_due',
        warning_level: 'warning',
        source_entity_type: 'project_material',
        source_entity_id: 'material-unchanged',
        warning_lifecycle_status: 'active',
        metadata: { delaySignalVersion: 'impact_signal_summary_v1' },
      },
    )

    const report = await new WarningService().buildImpactSignalWarningDebugReports('project-1', {
      scanOptions: {
        changedSince: '2026-05-25T00:00:00.000Z',
        limit: 20,
      },
    })

    expect(report.lifecycle.actions).toEqual([
      expect.objectContaining({
        warningId: 'warning-changed',
        action: 'resolve',
      }),
    ])
  })
})
