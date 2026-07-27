// 预警服务 - Phase 2
// 已迁移至直接使用 Supabase SDK（不再依赖 executeSQL 包装层）

import { supabase } from './dbService.js'
import { query as rawQuery } from '../database.js'
import { loadCoveredTaskIdsByAcceptancePlanIds } from './acceptancePlanTaskLinkService.js'
import { hasChangeLog, writeLog } from './changeLogs.js'
import type { Warning, Reminder, Notification } from '../types/db.js'
import { calculateDueStatus } from './dueDateService.js'
import { generateId } from '../utils/id.js'
import { delayDayDelta } from '../utils/durationDays.js'
import { resolveConstructionCalendarContext } from './constructionCalendar.js'
import {
  collapseWarningRedundancy,
  dedupeNotifications,
  escalateObstacleSeverity,
  normalizeNotificationPayload,
} from './warningChainService.js'
import {
  getCriticalPathStagnationThresholdDays,
  getCriticalPathStagnationThresholdMs,
  resolveCriticalPathDelayWarningRule,
  resolveDelayExceededWarningRule,
  resolveObstacleTimeoutWarningRule,
  RISK_ISSUE_WARNING_RULE_REGISTRY,
} from './riskIssueWarningRuleRegistry.js'
import { getProjectCriticalPathSnapshot } from './projectCriticalPathService.js'
import {
  acceptanceStatusLabel as getAcceptanceStatusLabel,
  ACTIVE_ACCEPTANCE_STATUSES,
  normalizeAcceptanceStatus,
} from '../utils/acceptanceStatus.js'
import {
  acknowledgeWarningNotification,
  syncAcceptanceExpiredIssues as syncAcceptanceExpiredIssuesOnChain,
  autoEscalateRisksToIssues as autoEscalateRisksToIssuesOnChain,
  autoEscalateWarnings as autoEscalateWarningsOnChain,
  confirmWarningAsRisk as confirmWarningAsRiskOnChain,
  ensureObstacleEscalatedIssue,
  markObstacleEscalatedIssuePendingManualClose,
  muteWarningNotification,
  syncConditionExpiredIssues as syncConditionExpiredIssuesOnChain,
  syncWarningNotifications,
  notificationToWarning,
} from './upgradeChainService.js'
import { scanPreMilestoneWarnings as scanPreMilestoneWarningsFromService } from './preMilestoneWarningService.js'
import { logger } from '../middleware/logger.js'
import { dataQualityService } from './dataQualityService.js'
import { isProjectActiveStatus } from '../utils/projectStatus.js'
import {
  buildDelayWarningReplayGovernanceReport,
  buildOwnerConfirmationRequests,
  buildImpactSignalCoverageSummary,
  buildImpactSignalWarningDebugReport,
  buildImpactSignalWarningLifecyclePlan,
  buildReplayThresholdAlgorithmSeedCandidate,
  buildReplayThresholdCandidate,
  buildRuleQualityUpdatesFromWarnings,
  resolveWarningImpactSignalPolicy,
  type ScanWarningsFromImpactSignalSummariesOptions,
  scanWarningsFromImpactSignalSummaries,
} from './warningImpactSignalService.js'
import { createAlgorithmSeedUpgradeCandidate } from './algorithmSeedLearningService.js'

export interface WarningEvaluationEvent {
  type:
    | 'obstacle'
    | 'task'
  projectId?: string
  taskId?: string
  obstacle?: {
    id: string
    project_id?: string | null
    task_id?: string | null
    title?: string | null
    description?: string | null
    severity?: 'low' | 'medium' | 'high' | 'warning' | 'critical'
    status?: string | null
    expected_resolution_date?: string | null
    severity_manually_overridden?: boolean | number | string | null
    severity_escalated_at?: string | null
  }
  task?: {
    id: string
    status?: string | null
    progress?: number | null
  }
}

function normalizeObstacleSeverityForEvaluation(value?: string | null): 'warning' | 'critical' {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['critical', '严重'].includes(normalized)) return 'critical'
  return 'warning'
}

function buildObstacleSeverityEscalationReason(obstacle: WarningEvaluationEvent['obstacle'], storedSeverity: string) {
  return [
    'overdue_auto_escalation',
    String(obstacle?.expected_resolution_date ?? '').trim(),
    storedSeverity,
  ].join('|')
}

function normalizeAcceptanceWarningStatus(value?: string | null) {
  return normalizeAcceptanceStatus(value)
}

function acceptanceWarningStatusLabel(value?: string | null) {
  return getAcceptanceStatusLabel(value)
}

const ACCEPTANCE_WARNING_QUERY_STATUSES = [
  ...ACTIVE_ACCEPTANCE_STATUSES,
]

function getAcceptanceWarningName(row: Record<string, unknown>) {
  return String(row.acceptance_name ?? row.plan_name ?? row.type_name ?? row.id ?? '未命名验收').trim() || '未命名验收'
}

function getAcceptanceWarningType(row: Record<string, unknown>) {
  return String(row.type_name ?? row.acceptance_type ?? '验收').trim() || '验收'
}

type ConditionWarningRow = {
  id: string
  task_id?: string | null
  name?: string | null
  target_date?: string | null
  tasks?: {
    project_id?: string | null
    title?: string | null
  } | null
}

type ObstacleWarningRow = {
  id: string
  task_id?: string | null
  obstacle_type?: string | null
  description?: string | null
  severity?: string | null
  status?: string | null
  expected_resolution_date?: string | null
  estimated_resolve_date?: string | null
  created_at?: string | null
  tasks?: {
    project_id?: string | null
    title?: string | null
  } | null
}

type DelayWarningTaskRow = {
  id: string
  project_id?: string | null
  title?: string | null
  delay_count?: number | null
  milestone_title?: string | null
}

type ImpactSignalGovernanceArtifactOptions = {
  scanOptions?: Omit<ScanWarningsFromImpactSignalSummariesOptions, 'policy'> | null
}

function warningCoverageKey(warning: Pick<Warning, 'project_id' | 'task_id' | 'warning_type'> & {
  source_entity_type?: string | null
  source_entity_id?: string | null
}) {
  const sourceKey = warning.source_entity_type && warning.source_entity_id
    ? `${warning.source_entity_type}:${warning.source_entity_id}`
    : warning.task_id || ''
  return [warning.project_id || '', warning.warning_type || '', sourceKey].join('|')
}

function warningTaskTypeKey(warning: Pick<Warning, 'project_id' | 'task_id' | 'warning_type'>) {
  return [warning.project_id || '', warning.warning_type || '', warning.task_id || ''].join('|')
}

function filterLegacyWarningsCoveredByImpactSignals(impactWarnings: Warning[], legacyWarnings: Warning[]) {
  if (impactWarnings.length === 0) return legacyWarnings
  const coveredExact = new Set(impactWarnings.map(warningCoverageKey))
  const coveredTaskType = new Set(impactWarnings.map(warningTaskTypeKey))
  return legacyWarnings.filter((warning) => {
    if (coveredExact.has(warningCoverageKey(warning))) return false
    if (coveredTaskType.has(warningTaskTypeKey(warning))) return false
    return true
  })
}

function readRecord(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {}
    } catch {
      return {}
    }
  }
  return {}
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeOptionalIso(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  return normalizeText(value) || null
}

function normalizePositiveInteger(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.floor(numeric)
}

function parseDueReminderDays(description?: string | null) {
  const text = String(description ?? '')
  const match = text.match(/将于\s*(\d+)\s*天/) ?? text.match(/(\d+)\s*天后到期/)
  return match ? parseInt(match[1], 10) : 0
}

function normalizeFeedbackRuleCode(row: Record<string, any>) {
  const evidence = readRecord(row.evidence)
  return normalizeText(evidence.ruleCode ?? evidence.rule_code ?? row.rule_code)
}

function normalizeFeedbackSeedSource(row: Record<string, any>) {
  const evidence = readRecord(row.evidence)
  return normalizeText(evidence.seedSource ?? evidence.seed_source ?? row.seed_source ?? row.source_entity_type ?? 'owner_confirmation')
}

function ownerConfirmationFeedbackQuality(status: string) {
  if (['confirmed', 'true_positive', 'accepted'].includes(status)) {
    return {
      qualityGrade: 'confirmed',
      runtimeRole: 'normal',
      reason: 'owner_confirmation_confirmed',
    }
  }
  if (['rejected', 'false_positive', 'dismissed'].includes(status)) {
    return {
      qualityGrade: 'owner_rejected',
      runtimeRole: 'explain_only',
      reason: 'owner_confirmation_rejected',
    }
  }
  return null
}

function normalizeImpactSignals(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object')
    : []
}

function readinessSummaryFromTask(row: Record<string, any>) {
  const readiness = readRecord(row.readiness_summary)
  const summary = readRecord(readiness.impactSignalSummary ?? readiness.impact_signal_summary)
  const signals = normalizeImpactSignals(readiness.impactSignals ?? readiness.impact_signals)
  if (Object.keys(summary).length === 0 && signals.length === 0) return null
  return {
    ...summary,
    signals: normalizeImpactSignals(summary.signals).length > 0 ? normalizeImpactSignals(summary.signals) : signals,
  }
}

function forecastSummaryFromRow(row: Record<string, any>) {
  const metadata = readRecord(row.metadata)
  const forecastSources = readRecord(metadata.forecastSources ?? metadata.forecast_sources)
  const summary = readRecord(forecastSources.impactSignalSummary ?? forecastSources.impact_signal_summary)
  const signals = normalizeImpactSignals(forecastSources.impactSignals ?? forecastSources.impact_signals)
  if (Object.keys(summary).length === 0 && signals.length === 0) return null
  return {
    confirmedDelayDays: row.forecast_delay_days ?? summary.confirmedDelayDays,
    ...summary,
    signals: normalizeImpactSignals(summary.signals).length > 0 ? normalizeImpactSignals(summary.signals) : signals,
  }
}

export class WarningService {
  async scanExecutionImpactSignalWarnings(
    projectId?: string,
    options: Omit<ScanWarningsFromImpactSignalSummariesOptions, 'policy'> = {},
  ): Promise<Warning[]> {
    try {
      const policy = projectId
        ? await this.resolveRuntimeImpactSignalPolicy(projectId)
        : undefined
      return await scanWarningsFromImpactSignalSummaries(projectId, { ...options, policy }) as Warning[]
    } catch (error) {
      logger.warn('[warningService] impact signal summary scan failed; falling back to legacy scanners', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  async buildImpactSignalWarningDebugReports(
    projectId: string,
    options: ImpactSignalGovernanceArtifactOptions = {},
  ) {
    const scanOptions = options.scanOptions ?? {}
    const [tasksResult, forecastsResult, notificationsResult] = await Promise.all([
      (() => {
        let query = (supabase as any)
          .from('tasks')
          .select('id, project_id, title, readiness_summary, updated_at')
          .eq('project_id', projectId)
        if (Array.isArray(scanOptions.taskIds) && scanOptions.taskIds.length > 0) query = query.in('id', scanOptions.taskIds)
        const changedSince = normalizeOptionalIso(scanOptions.changedSince)
        if (changedSince) query = query.gte('updated_at', changedSince)
        const limit = normalizePositiveInteger(scanOptions.limit)
        if (limit) query = query.limit(limit)
        return query
      })(),
      (() => {
        let query = (supabase as any)
          .from('task_duration_forecasts')
          .select('id, project_id, task_id, forecast_delay_days, metadata, generated_at, is_current')
          .eq('project_id', projectId)
          .eq('is_current', true)
        if (Array.isArray(scanOptions.taskIds) && scanOptions.taskIds.length > 0) query = query.in('task_id', scanOptions.taskIds)
        const changedSince = normalizeOptionalIso(scanOptions.changedSince)
        if (changedSince) query = query.gte('generated_at', changedSince)
        const limit = normalizePositiveInteger(scanOptions.limit)
        if (limit) query = query.limit(limit)
        return query
      })(),
      supabase
        .from('notifications')
        .select('*')
        .eq('project_id', projectId),
    ])

    if (tasksResult.error) throw new Error(tasksResult.error.message)
    if (forecastsResult.error) throw new Error(forecastsResult.error.message)
    if (notificationsResult.error) throw new Error(notificationsResult.error.message)

    const tasks = Array.isArray(tasksResult.data) ? tasksResult.data as Array<Record<string, any>> : []
    const forecasts = Array.isArray(forecastsResult.data) ? forecastsResult.data as Array<Record<string, any>> : []
    const isIncrementalScan = Boolean(
      (Array.isArray(scanOptions.taskIds) && scanOptions.taskIds.length > 0)
        || scanOptions.changedSince
        || scanOptions.limit,
    )
    const activeWarningRows = (Array.isArray(notificationsResult.data) ? notificationsResult.data as Array<Record<string, any>> : [])
    const activeWarnings = activeWarningRows
      .filter((row) => {
        const status = normalizeText(row.warning_lifecycle_status || row.status).toLowerCase()
        const metadata = readRecord(row.metadata)
        return ['active', 'created', 'acknowledged', 'muted'].includes(status)
          && (metadata.delaySignalVersion === 'impact_signal_summary_v1' || row.warning_type || row.category || row.type)
      }) as any[]
    const currentWarnings = await scanWarningsFromImpactSignalSummaries(projectId, scanOptions) as any[]
    const taskById = new Map(tasks.map((task) => [normalizeText(task.id), task]))
    const reports: any[] = []
    let readinessSummaryCount = 0
    let forecastSummaryCount = 0
    const coveredTaskIds = new Set<string>()
    const scannedTaskIds = new Set<string>(tasks.map((task) => normalizeText(task.id)).filter(Boolean))
    for (const forecast of forecasts) {
      const taskId = normalizeText(forecast.task_id)
      if (taskId) scannedTaskIds.add(taskId)
    }

    for (const task of tasks) {
      const summary = readinessSummaryFromTask(task)
      if (!summary) continue
      readinessSummaryCount += 1
      const taskId = normalizeText(task.id)
      if (taskId) coveredTaskIds.add(taskId)
      reports.push(buildImpactSignalWarningDebugReport({
        projectId: normalizeText(task.project_id) || projectId,
        taskId,
        taskTitle: task.title,
        source: 'readiness_summary',
        summary: summary as any,
        ownerships: ['condition', 'obstacle', 'dependency'],
        includeDelayWarning: false,
      }))
    }

    for (const forecast of forecasts) {
      const summary = forecastSummaryFromRow(forecast)
      if (!summary) continue
      forecastSummaryCount += 1
      const taskId = normalizeText(forecast.task_id)
      if (taskId) coveredTaskIds.add(taskId)
      const task = taskById.get(taskId)
      reports.push(buildImpactSignalWarningDebugReport({
        projectId: normalizeText(forecast.project_id) || normalizeText(task?.project_id) || projectId,
        taskId,
        taskTitle: task?.title,
        source: 'duration_forecast',
        summary: summary as any,
        includeDelayWarning: true,
      }))
    }

    const coverageDiagnostics = buildImpactSignalCoverageSummary({
      taskIds: tasks.map((task) => normalizeText(task.id)).filter(Boolean),
      impactWarnings: currentWarnings,
      legacyWarnings: [],
    })

    return {
      projectId,
      generatedAt: new Date().toISOString(),
      coverage: {
        taskCount: tasks.length,
        readinessSummaryCount,
        forecastSummaryCount,
        uncoveredTaskCount: tasks.filter((task) => !coveredTaskIds.has(normalizeText(task.id))).length,
        impactCoveredTaskCount: coverageDiagnostics.impactCoveredTaskCount,
        legacyGapFillCount: coverageDiagnostics.legacyGapFillCount,
        suppressedLegacyDuplicateCount: coverageDiagnostics.suppressedLegacyDuplicateCount,
      },
      lifecycle: buildImpactSignalWarningLifecyclePlan({
        activeWarnings: isIncrementalScan
          ? activeWarnings.filter((warning) => scannedTaskIds.has(normalizeText(warning.task_id)))
          : activeWarnings,
        currentWarnings,
      }),
      coverageDiagnostics,
      reports,
    }
  }

  async buildDelayWarningReplayGovernanceReportFromHistory(projectId: string) {
    const [tasksResult, forecastsResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, project_id, planned_end_date, actual_end_date')
        .eq('project_id', projectId),
      supabase
        .from('task_duration_forecasts')
        .select('id, project_id, task_id, metadata, generated_at')
        .eq('project_id', projectId)
        .order('generated_at', { ascending: true })
        .limit(500),
    ])

    if (tasksResult.error) throw new Error(tasksResult.error.message)
    if (forecastsResult.error) throw new Error(forecastsResult.error.message)

    const tasks = Array.isArray(tasksResult.data) ? tasksResult.data as Array<Record<string, any>> : []
    const forecasts = Array.isArray(forecastsResult.data) ? forecastsResult.data as Array<Record<string, any>> : []
    const forecastsByTask = new Map<string, Array<Record<string, any>>>()
    for (const forecast of forecasts) {
      const taskId = normalizeText(forecast.task_id)
      if (!taskId) continue
      forecastsByTask.set(taskId, [...(forecastsByTask.get(taskId) ?? []), forecast])
    }

    const records = tasks.flatMap((task) => {
      const taskId = normalizeText(task.id)
      const taskForecasts = forecastsByTask.get(taskId) ?? []
      if (!taskId || taskForecasts.length === 0) return []
      const first = taskForecasts[0]
      const last = taskForecasts[taskForecasts.length - 1]
      return [{
        task_id: taskId,
        planned_end_date: task.planned_end_date,
        actual_end_date: task.actual_end_date,
        beforeImpactSignals: normalizeImpactSignals(readRecord(readRecord(first.metadata).forecastSources).impactSignals),
        afterImpactSignals: normalizeImpactSignals(readRecord(readRecord(last.metadata).forecastSources).impactSignals),
      }]
    })

    return buildDelayWarningReplayGovernanceReport(records, {
      calibration: {
        currentThreshold: 0,
        candidateThresholds: [0, 0.35, 0.55, 0.75, 0.95],
        minPrecision: 0.6,
        minRecall: 0.5,
        maxFalsePositiveRate: 0.4,
      },
    })
  }

  async resolveRuntimeImpactSignalPolicy(projectId: string) {
    const query = supabase
      .from('warning_policy_configs')
      .select('project_id, project_type, config, is_active')
      .eq('project_id', projectId)
      .eq('is_active', true)
    const { data, error } = typeof (query as any).maybeSingle === 'function'
      ? await (query as any).maybeSingle()
      : await query

    if (error) throw new Error(error.message)
    const row = readRecord(Array.isArray(data) ? data[0] : data)
    return resolveWarningImpactSignalPolicy({}, {
      projectType: row.project_type,
      governanceConfig: readRecord(row.config) as any,
    })
  }

  async syncImpactSignalWarningLifecycle(
    projectId: string,
    options: ImpactSignalGovernanceArtifactOptions = {},
  ) {
    const report = await this.buildImpactSignalWarningDebugReports(projectId, options)
    let resolvedCount = 0
    let downgradedCount = 0
    const now = new Date().toISOString()

    for (const action of report.lifecycle.actions as Array<Record<string, any>>) {
      if (!action.warningId) continue
      if (action.action === 'resolve') {
        const { error } = await supabase
          .from('notifications')
          .update({
            warning_lifecycle_status: 'resolved',
            status: 'resolved',
            resolved_source: action.reason,
            resolved_at: now,
            updated_at: now,
          })
          .eq('id', action.warningId)
          .eq('project_id', projectId)
        if (error) throw new Error(error.message)
        resolvedCount += 1
      }
      if (action.action === 'downgrade' && action.nextLevel) {
        const { error } = await supabase
          .from('notifications')
          .update({
            warning_level: action.nextLevel,
            warning_lifecycle_status: 'active',
            lifecycle_last_action: 'downgrade',
            lifecycle_action_reason: action.reason,
            updated_at: now,
          })
          .eq('id', action.warningId)
          .eq('project_id', projectId)
        if (error) throw new Error(error.message)
        downgradedCount += 1
      }
    }

    return {
      projectId,
      resolvedCount,
      downgradedCount,
      actionCount: report.lifecycle.actions.length,
    }
  }

  async recordImpactSignalGovernanceArtifacts(
    projectId: string,
    options: ImpactSignalGovernanceArtifactOptions = {},
  ) {
    const [debugReport, replayReport, warnings] = await Promise.all([
      this.buildImpactSignalWarningDebugReports(projectId, options),
      this.buildDelayWarningReplayGovernanceReportFromHistory(projectId),
      this.scanExecutionImpactSignalWarnings(projectId, options.scanOptions ?? {}),
    ])
    const generatedAt = new Date().toISOString()
    let coverageSnapshots = 0
    let thresholdCandidates = 0
    let ownerConfirmations = 0
    let ruleQualityEvents = 0

    const { error: coverageError } = await supabase
      .from('warning_coverage_snapshots')
      .insert({
        project_id: projectId,
        generated_at: generatedAt,
        task_count: debugReport.coverageDiagnostics.taskCount,
        impact_covered_task_count: debugReport.coverageDiagnostics.impactCoveredTaskCount,
        legacy_gap_fill_count: debugReport.coverageDiagnostics.legacyGapFillCount,
        suppressed_legacy_duplicate_count: debugReport.coverageDiagnostics.suppressedLegacyDuplicateCount,
        uncovered_task_count: debugReport.coverageDiagnostics.uncoveredTaskCount,
        metadata: {
          coverage: debugReport.coverage,
          lifecycle: debugReport.lifecycle,
        },
      })
    if (coverageError) throw new Error(coverageError.message)
    coverageSnapshots = 1

    const thresholdCandidate = buildReplayThresholdCandidate(replayReport as any, {
      projectId,
      minSampleCount: 1,
    })
    const { error: thresholdError } = await supabase
      .from('warning_threshold_candidates')
      .insert({
        project_id: projectId,
        status: thresholdCandidate.status,
        approval_mode: thresholdCandidate.approvalMode,
        recommended_policy: thresholdCandidate.recommendedPolicy,
        recommended_threshold: thresholdCandidate.recommendedThreshold,
        current_threshold: thresholdCandidate.currentThreshold,
        sample_count: thresholdCandidate.sampleCount,
        evidence: thresholdCandidate.evidence,
        created_at: generatedAt,
      })
    if (thresholdError) throw new Error(thresholdError.message)
    thresholdCandidates = 1

    const seedCandidate = buildReplayThresholdAlgorithmSeedCandidate(replayReport as any, {
      projectId,
      minSampleCount: 1,
    })
    if (seedCandidate) {
      await createAlgorithmSeedUpgradeCandidate({
        seedType: seedCandidate.seedType,
        stableCode: seedCandidate.stableCode,
        candidatePayload: seedCandidate.candidatePayload,
        candidateSource: seedCandidate.candidateSource,
        projectId: seedCandidate.projectId,
        companyId: seedCandidate.companyId,
        sampleCount: seedCandidate.sampleCount,
        variance: seedCandidate.variance,
        confidenceLevel: seedCandidate.confidenceLevel,
        evidenceSummary: seedCandidate.evidenceSummary,
        actionPolicy: seedCandidate.actionPolicy,
      })
    }

    const confirmationRows = buildOwnerConfirmationRequests(warnings as any).map((request) => ({
      project_id: request.projectId,
      task_id: request.taskId,
      warning_id: request.warningId,
      owner_unit_id: request.ownerUnitId,
      owner_role: request.ownerRole,
      confirmation_type: request.confirmationType,
      status: request.status,
      source_entity_type: request.sourceEntityType,
      source_entity_id: request.sourceEntityId,
      evidence: request.evidence,
      created_at: generatedAt,
    }))
    if (confirmationRows.length > 0) {
      const { error } = await supabase
        .from('warning_owner_confirmations')
        .insert(confirmationRows)
      if (error) throw new Error(error.message)
      ownerConfirmations = confirmationRows.length
    }

    const ruleQualityRows = buildRuleQualityUpdatesFromWarnings(warnings as any).map((update) => ({
      project_id: update.projectId,
      task_id: update.taskId,
      warning_id: update.warningId,
      rule_code: update.ruleCode,
      seed_source: update.seedSource,
      quality_grade: update.qualityGrade,
      runtime_role: update.runtimeRole,
      source_entity_type: update.sourceEntityType,
      source_entity_id: update.sourceEntityId,
      reasons: update.reasons,
      evidence_count: update.evidenceCount,
      created_at: generatedAt,
    }))
    if (ruleQualityRows.length > 0) {
      const { error } = await supabase
        .from('algorithm_seed_quality_events')
        .insert(ruleQualityRows)
      if (error) throw new Error(error.message)
      ruleQualityEvents = ruleQualityRows.length
    }

    return {
      projectId,
      coverageSnapshots,
      thresholdCandidates,
      ownerConfirmations,
      ruleQualityEvents,
    }
  }

  async applyOwnerConfirmationFeedback(projectId: string) {
    const { data, error } = await supabase
      .from('warning_owner_confirmations')
      .select('*')
      .eq('project_id', projectId)

    if (error) throw new Error(error.message)

    const generatedAt = new Date().toISOString()
    const confirmations = (Array.isArray(data) ? data as Array<Record<string, any>> : [])
      .filter((row) => {
        const status = normalizeText(row.status).toLowerCase()
        const feedbackStatus = normalizeText(row.feedback_status).toLowerCase()
        return Boolean(row.resolved_at)
          && feedbackStatus !== 'applied'
          && Boolean(ownerConfirmationFeedbackQuality(status))
          && Boolean(normalizeFeedbackRuleCode(row))
      })

    const feedbackRows = confirmations.map((row) => {
      const status = normalizeText(row.status).toLowerCase()
      const feedback = ownerConfirmationFeedbackQuality(status)!
      return {
        project_id: row.project_id ?? projectId,
        task_id: row.task_id ?? null,
        warning_id: row.warning_id ?? null,
        rule_code: normalizeFeedbackRuleCode(row),
        seed_source: normalizeFeedbackSeedSource(row),
        quality_grade: feedback.qualityGrade,
        runtime_role: feedback.runtimeRole,
        source_entity_type: row.source_entity_type ?? null,
        source_entity_id: row.source_entity_id ?? null,
        reasons: [feedback.reason],
        evidence_count: 1,
        created_at: generatedAt,
      }
    })

    if (feedbackRows.length > 0) {
      const { error: insertError } = await supabase
        .from('algorithm_seed_quality_events')
        .insert(feedbackRows)
      if (insertError) throw new Error(insertError.message)

      for (const confirmation of confirmations) {
        const confirmationId = normalizeText(confirmation.id)
        if (!confirmationId) continue
        const { error: updateError } = await supabase
          .from('warning_owner_confirmations')
          .update({
            feedback_status: 'applied',
            feedback_applied_at: generatedAt,
          })
          .eq('id', confirmationId)
        if (updateError) throw new Error(updateError.message)
      }
    }

    return {
      projectId,
      scannedConfirmations: confirmations.length,
      qualityFeedbackEvents: feedbackRows.length,
    }
  }

  private async scanImpactSignalWarningsByType(projectId: string | undefined, warningTypes: string[]): Promise<Warning[]> {
    const typeSet = new Set(warningTypes)
    const warnings = await this.scanExecutionImpactSignalWarnings(projectId)
    return warnings.filter((warning) => typeSet.has(warning.warning_type))
  }

  /**
   * 扫描条件到期预警
   * 预警规则：条件解决前3天/1天提醒
   */
  async scanConditionWarnings(projectId?: string, preferImpactSignals = true): Promise<Warning[]> {
    if (preferImpactSignals) {
      const signalWarnings = await this.scanImpactSignalWarningsByType(projectId, ['condition_due'])
      if (signalWarnings.length > 0) return signalWarnings
    }

    const now = new Date().toISOString()

    // 查询未满足且 target_date > now 的条件（JOIN tasks 获取 project_id）
    let condQuery = supabase
      .from('task_conditions')
      .select('id, task_id, name, target_date, tasks!inner(project_id, title)')
      .eq('is_satisfied', false)
      .gt('target_date', now)

    if (projectId) {
      condQuery = condQuery.eq('tasks.project_id', projectId)
    }

    const { data: conditionsRaw } = await condQuery
    const conditions = ((conditionsRaw || []) as ConditionWarningRow[]).map((c) => ({
      id: c.id,
      task_id: c.task_id,
      condition_name: c.name,
      target_date: c.target_date,
      project_id: c.tasks?.project_id || '',
      task_title: c.tasks?.title || '',
    }))

    const warnings: Warning[] = []

    for (const condition of conditions) {
      const dueResult = calculateDueStatus(condition.target_date, {
        overdueLabel: '已逾期',
        dueLabel: '天后到期',
        todayLabel: '今天到期',
      })

      if (dueResult.due_status === 'normal' || dueResult.due_status === 'overdue') continue

      const isUrgent = dueResult.due_status === 'urgent'

      warnings.push({
        id: generateId(),
        project_id: condition.project_id,
        task_id: condition.task_id,
        source_entity_type: 'task_condition',
        source_entity_id: condition.id,
        warning_type: 'condition_due',
        warning_level: isUrgent ? 'critical' : 'warning',
        title: isUrgent ? '开工窗口即将关闭（紧急）' : '开工窗口即将关闭',
        description: `任务"${condition.task_title}"的开工窗口${dueResult.due_label}，当前条件"${condition.condition_name}"仍未满足${isUrgent ? '，请立即处理' : ''}`,
        is_acknowledged: false,
        created_at: new Date().toISOString(),
      })
    }

    return warnings
  }

  // workspace-isolation-system-job-approved: unscoped project enumeration requires explicit scheduler capability.
  async scanCriticalPathStagnationWarnings(
    projectId?: string,
    options: { systemJob?: boolean } = {},
  ): Promise<Warning[]> {
    if (!projectId && options.systemJob !== true) {
      throw new Error('critical path stagnation scan requires projectId or systemJob capability')
    }
    const projectIds = projectId
      ? [projectId]
      : (
        ((await supabase.from('projects').select('id, status')).data ?? []) as Array<{ id: string; status?: string | null }>
      )
        .filter((row) => isProjectActiveStatus(row.status))
        .map((row) => String(row.id))

    if (projectIds.length === 0) return []

    const warnings: Warning[] = []

    for (const currentProjectId of projectIds) {
      const calendar = await resolveConstructionCalendarContext({ projectId: currentProjectId })
      const criticalPathSnapshot = await getProjectCriticalPathSnapshot(currentProjectId)
      const criticalTaskIds = criticalPathSnapshot.displayTaskIds
      if (!criticalTaskIds.length) continue

      const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select('id, project_id, title, progress, status')
        .eq('project_id', currentProjectId)
        .in('id', criticalTaskIds)
        .neq('status', 'completed')
        .neq('status', '已完成')

      if (taskError) throw new Error(taskError.message)

      const criticalTasks = (tasks || []) as Array<{
        id: string
        project_id: string
        title: string
        progress?: number | null
        status?: string | null
      }>
      if (!criticalTasks.length) continue

      const taskIds = criticalTasks.map((task) => task.id)
      const { data: snapshots, error: snapshotError } = await supabase
        .from('task_progress_snapshots')
        .select('task_id, progress, snapshot_date, created_at')
        .in('task_id', taskIds)
        .order('snapshot_date', { ascending: false })

      if (snapshotError) throw new Error(snapshotError.message)

      const stagnationDays = getCriticalPathStagnationThresholdDays()
      const threshold = Date.now() - getCriticalPathStagnationThresholdMs()
      const baselineProgress = new Map<string, number>()

      for (const snapshot of (snapshots || []) as Array<Record<string, unknown>>) {
        const taskId = String(snapshot.task_id ?? '')
        if (!taskId || baselineProgress.has(taskId)) continue
        const snapshotAt = new Date(String(snapshot.snapshot_date ?? snapshot.created_at ?? '')).getTime()
        if (!Number.isFinite(snapshotAt) || snapshotAt > threshold) continue
        baselineProgress.set(taskId, Number(snapshot.progress ?? 0))
      }

      warnings.push(
        ...criticalTasks
          .filter((task) => baselineProgress.has(task.id) && Number(task.progress ?? 0) === baselineProgress.get(task.id))
          .map((task) => ({
            id: generateId(),
            project_id: task.project_id,
            task_id: task.id,
            warning_type: 'critical_path_stagnation',
            warning_level: 'critical' as const,
            title: `关键路径任务连续 ${stagnationDays} 天无进度变化`,
            description: `关键路径任务"${task.title}"近 ${stagnationDays} 天进度没有变化，请立即处理`,
            is_acknowledged: false,
            created_at: new Date().toISOString(),
          })),
      )
    }

    return warnings
  }

  // workspace-isolation-system-job-approved: unscoped project enumeration requires explicit scheduler capability.
  async scanCriticalPathDelayWarnings(
    projectId?: string,
    preferImpactSignals = true,
    options: { systemJob?: boolean } = {},
  ): Promise<Warning[]> {
    if (!projectId && options.systemJob !== true) {
      throw new Error('critical path delay scan requires projectId or systemJob capability')
    }
    if (preferImpactSignals) {
      const signalWarnings = await this.scanImpactSignalWarningsByType(projectId, ['critical_path_delay'])
      if (signalWarnings.length > 0) return signalWarnings
    }

    const projectIds = projectId
      ? [projectId]
      : (
        ((await supabase.from('projects').select('id, status')).data ?? []) as Array<{ id: string; status?: string | null }>
      )
        .filter((row) => isProjectActiveStatus(row.status))
        .map((row) => String(row.id))

    if (projectIds.length === 0) return []

    const warnings: Warning[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const currentProjectId of projectIds) {
      const calendar = await resolveConstructionCalendarContext({ projectId: currentProjectId })
      const criticalPathSnapshot = await getProjectCriticalPathSnapshot(currentProjectId)
      const criticalTaskIds = criticalPathSnapshot.displayTaskIds
      if (!criticalTaskIds.length) continue

      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, project_id, title, planned_end_date, status')
        .eq('project_id', currentProjectId)
        .in('id', criticalTaskIds)
        .neq('status', 'completed')
        .neq('status', '已完成')
        .not('planned_end_date', 'is', null)

      if (error) throw new Error(error.message)

      for (const task of (tasks || []) as Array<{ id: string; project_id: string; title: string; planned_end_date: string; status?: string | null }>) {
        const endDate = new Date(task.planned_end_date)
        endDate.setHours(0, 0, 0, 0)
        const delayDays = delayDayDelta(endDate, today, calendar) ?? 0
        if (delayDays <= 0) continue

        const delayRule = resolveCriticalPathDelayWarningRule(delayDays)
        if (!delayRule) continue

        let level: 'info' | 'warning' | 'critical'
        let title: string
        if (delayRule.level === 'critical') {
          level = 'critical'
          title = `关键路径任务已延期 ${delayDays} 天（严重）`
        } else if (delayRule.level === 'warning') {
          level = 'warning'
          title = `关键路径任务已延期 ${delayDays} 天`
        } else {
          level = 'info'
          title = `关键路径任务已延期 ${delayDays} 天（关注）`
        }

        warnings.push({
          id: generateId(),
          project_id: task.project_id,
          task_id: task.id,
          warning_type: 'critical_path_delay',
          warning_level: level,
          title,
          description: `关键路径任务"${task.title}"已超出计划完成日期 ${delayDays} 天`,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        })
      }
    }

    return warnings
  }

  async scanProgressTrendWarnings(projectId?: string): Promise<Warning[]> {
    return await dataQualityService.scanTrendWarnings(projectId)
  }

  /**
   * 扫描阻碍超时预警
   * 预警规则：阻碍超过3天/7天弹窗提醒
   */
  async scanObstacleWarnings(projectId?: string, preferImpactSignals = true): Promise<Warning[]> {
    if (preferImpactSignals) {
      const signalWarnings = await this.scanImpactSignalWarningsByType(projectId, ['obstacle_timeout'])
      if (signalWarnings.length > 0) return signalWarnings
    }

    // status 不等于 '已解决'：Supabase 用 .neq()
    let obsQuery = supabase
      .from('task_obstacles')
      .select('id, task_id, obstacle_type, description, severity, status, estimated_resolve_date, created_at, tasks!inner(project_id, title)')
      .neq('status', '已解决')

    if (projectId) {
      obsQuery = obsQuery.eq('tasks.project_id', projectId)
    }

    const { data: obstaclesRaw } = await obsQuery
    const obstacles = ((obstaclesRaw || []) as ObstacleWarningRow[]).map((o) => ({
      id: o.id,
      task_id: o.task_id,
      obstacle_type: o.obstacle_type,
      obstacle_desc: o.description,
      severity: o.severity,
      status: o.status,
      expected_resolution_date: o.expected_resolution_date ?? o.estimated_resolve_date ?? null,
      created_at: o.created_at,
      project_id: o.tasks?.project_id || '',
      task_title: o.tasks?.title || '',
    }))

    const warnings: Warning[] = []
    const now = new Date()

    for (const obstacle of obstacles) {
      const createdAt = new Date(obstacle.created_at)
      const daysElapsed = Math.ceil(delayDayDelta(createdAt, now) ?? 0)
      const escalation = escalateObstacleSeverity({
        severity: normalizeObstacleSeverityForEvaluation(obstacle.severity),
        status: obstacle.status,
        expected_resolution_date: obstacle.expected_resolution_date,
        now: now.toISOString(),
      })
      const warningLevel = escalation.severity === 'critical' ? 'critical' : 'warning'
      const timeoutRule = resolveObstacleTimeoutWarningRule(daysElapsed)
      if (!timeoutRule) continue

      if (timeoutRule.level === 'warning') {
        warnings.push({
          id: generateId(),
          project_id: obstacle.project_id,
          task_id: obstacle.task_id,
          source_entity_type: 'task_obstacle',
          source_entity_id: obstacle.id,
          warning_type: 'obstacle_timeout',
          warning_level: warningLevel,
          title: `阻碍已持续${RISK_ISSUE_WARNING_RULE_REGISTRY.warningSeverity.obstacleTimeout.warningDays}天`,
          description: `任务"${obstacle.task_title}"的阻碍"${obstacle.obstacle_desc}"已持续${daysElapsed}天，请尽快处理`,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        })
      }

      if (timeoutRule.level === 'critical') {
        warnings.push({
          id: generateId(),
          project_id: obstacle.project_id,
          task_id: obstacle.task_id,
          source_entity_type: 'task_obstacle',
          source_entity_id: obstacle.id,
          warning_type: 'obstacle_timeout',
          warning_level: 'critical',
          title: `阻碍已持续${RISK_ISSUE_WARNING_RULE_REGISTRY.warningSeverity.obstacleTimeout.criticalDays}天以上`,
          description: `任务"${obstacle.task_title}"的阻碍"${obstacle.obstacle_desc}"已持续${daysElapsed}天，需立即处理`,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        })
      }
    }

    return warnings
  }

  /**
   * 扫描验收到期预警
   * 预警规则：验收到期前7天/3天/1天提醒
   */
  async scanAcceptanceWarnings(projectId?: string, preferImpactSignals = true): Promise<Warning[]> {
    if (preferImpactSignals) {
      const signalWarnings = await this.scanImpactSignalWarningsByType(projectId, ['acceptance_expired'])
      if (signalWarnings.length > 0) return signalWarnings
    }

    let acQuery = supabase
      .from('acceptance_plans')
      .select('id, project_id, acceptance_name, acceptance_type, type_name, planned_date, status')
      .in('status', ACCEPTANCE_WARNING_QUERY_STATUSES)

    if (projectId) {
      acQuery = acQuery.eq('project_id', projectId)
    }

    const { data: acceptances, error } = await acQuery
    if (error) throw error
    const coveredTaskIdsByPlanId = await loadCoveredTaskIdsByAcceptancePlanIds(
      (acceptances ?? []).map((row: any) => String(row.id ?? '')),
      projectId,
    )
    const warnings: Warning[] = []

    for (const acceptance of (acceptances || [])) {
      const row = acceptance as Record<string, unknown>
      const plannedDate = String(row.planned_date ?? '').trim()
      const normalizedStatus = normalizeAcceptanceWarningStatus(String(row.status ?? ''))
      const acceptanceName = getAcceptanceWarningName(row)
      const acceptanceType = getAcceptanceWarningType(row)
      const planId = String(row.id ?? '').trim()
      const linkedTaskId = coveredTaskIdsByPlanId.get(planId)?.[0]

      if (normalizedStatus === 'rectifying') {
        const rectificationDue = plannedDate
          ? calculateDueStatus(plannedDate, {
            urgentDays: 3,
            approachingDays: 7,
            overdueLabel: '已逾期',
            dueLabel: '天后到期',
            todayLabel: '今天到期',
          })
          : null

        const overdue = rectificationDue?.due_status === 'overdue'
        warnings.push({
          id: generateId(),
          project_id: String(row.project_id ?? ''),
          task_id: linkedTaskId,
          source_entity_type: 'acceptance_plan',
          source_entity_id: planId,
          warning_type: 'acceptance_expired',
          warning_level: overdue ? 'critical' : 'warning',
          title: overdue ? '验收整改已逾期' : '验收整改待处理',
          description: plannedDate
            ? `${acceptanceType}“${acceptanceName}”当前为${acceptanceWarningStatusLabel(String(row.status ?? ''))}，${rectificationDue?.due_label || '请尽快处理'}`
            : `${acceptanceType}“${acceptanceName}”当前为${acceptanceWarningStatusLabel(String(row.status ?? ''))}，请尽快补正`,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        })
        continue
      }

      if (!plannedDate) continue
      const dueResult = calculateDueStatus(plannedDate, {
        urgentDays: 3,
        approachingDays: 7,
        overdueLabel: '已逾期',
        dueLabel: '天后到期',
        todayLabel: '今天到期',
      })

      if (dueResult.due_status === 'normal') continue

      const daysUntil = dueResult.days_until_due ?? 0
      const warningLevel: 'info' | 'warning' | 'critical' =
        dueResult.due_status === 'approaching'
          ? 'info'
          : dueResult.due_status === 'overdue' || daysUntil <= 1
            ? 'critical'
            : 'warning'

      warnings.push({
        id: generateId(),
        project_id: String(row.project_id ?? ''),
        task_id: linkedTaskId,
        source_entity_type: 'acceptance_plan',
        source_entity_id: planId,
        warning_type: 'acceptance_expired',
        warning_level: warningLevel,
        title: dueResult.due_status === 'overdue' ? '验收已逾期' : '验收即将到期',
        description: `${acceptanceType}“${acceptanceName}”当前为${acceptanceWarningStatusLabel(String(row.status ?? ''))}，${dueResult.due_label}`,
        is_acknowledged: false,
        created_at: new Date().toISOString(),
      })
    }

    return warnings
  }

  /**
   * 扫描延期超次预警
   * 预警规则：任务延期次数超过N次自动升级预警级别
   * - 3-4次延期 → warning级别
   * - ≥5次延期 → critical级别
   */
  async scanDelayExceededWarnings(projectId?: string, preferImpactSignals = true): Promise<Warning[]> {
    if (preferImpactSignals) {
      const signalWarnings = await this.scanImpactSignalWarningsByType(projectId, ['delay_exceeded'])
      if (signalWarnings.length > 0) return signalWarnings
    }

    const params: unknown[] = []
    const projectPredicate = projectId
      ? `AND task.project_id = $${params.push(projectId)}`
      : ''
    const result = await rawQuery(
      `SELECT task.id,
              task.project_id,
              task.title,
              COUNT(change_log.id)::integer AS delay_count,
              milestone.title AS milestone_title
         FROM public.tasks task
         LEFT JOIN public.change_logs change_log
           ON change_log.project_id = task.project_id
          AND change_log.entity_type = 'task'
          AND change_log.entity_id = task.id
          AND change_log.field_name IN ('end_date', 'planned_end_date')
          AND BTRIM(COALESCE(change_log.old_value, ''), '"') ~ '^\\d{4}-\\d{2}-\\d{2}'
          AND BTRIM(COALESCE(change_log.new_value, ''), '"') ~ '^\\d{4}-\\d{2}-\\d{2}'
          AND LEFT(BTRIM(change_log.new_value, '"'), 10)::date
              > LEFT(BTRIM(change_log.old_value, '"'), 10)::date
         LEFT JOIN public.tasks milestone
           ON milestone.id = task.milestone_id
          AND milestone.project_id = task.project_id
          AND milestone.is_milestone IS TRUE
        WHERE LOWER(COALESCE(task.status, '')) NOT IN ('completed', 'cancelled', '已完成', '已取消')
          ${projectPredicate}
        GROUP BY task.id, task.project_id, task.title, milestone.title
       HAVING COUNT(change_log.id) >= 3
        ORDER BY COUNT(change_log.id) DESC`,
      params,
    )
    const taskRows = (result.rows ?? []) as DelayWarningTaskRow[]

    const warnings: Warning[] = []
    const now = new Date()

    for (const task of taskRows) {
      const delayCount = Number(task.delay_count ?? 0)
      const delayRule = resolveDelayExceededWarningRule(delayCount)
      if (!delayRule) continue

      let warningLevel: 'info' | 'warning' | 'critical' = 'warning'
      let title = '延期次数较多'

      if (delayRule.level === 'critical') {
        warningLevel = 'critical'
        title = '频繁延期 - 需立即关注'
      } else if (delayRule.level === 'warning') {
        warningLevel = 'warning'
        title = '连续延期 - 需关注'
      }

      let description = `任务"${task.title}"已延期${delayCount}次`
      const milestoneName = String(task.milestone_title ?? '').trim() || null
      if (milestoneName) {
        description += `，属于里程碑"${milestoneName}"`
      }
      description += '，请及时采取计划纠偏措施'

      warnings.push({
        id: generateId(),
        project_id: task.project_id || '',
        task_id: task.id,
        warning_type: 'delay_exceeded',
        warning_level: warningLevel,
        title,
        description,
        is_acknowledged: false,
        created_at: now.toISOString(),
      })
    }

    return warnings
  }

  async scanPreMilestoneWarnings(
    projectId?: string,
    options: { systemJob?: boolean } = {},
  ): Promise<Warning[]> {
    return scanPreMilestoneWarningsFromService(projectId, options)
  }

  /**
   * 生成弹窗提醒
   */
  async generateReminders(projectId?: string): Promise<Reminder[]> {
    const conditionWarnings = await this.scanConditionWarnings(projectId)
    const obstacleWarnings = await this.scanObstacleWarnings(projectId)
    const acceptanceWarnings = await this.scanAcceptanceWarnings(projectId)

    const reminders: Reminder[] = []
    const now = new Date()

    // P0-1: 条件到期提醒（1天/3天弹窗）
    for (const warning of conditionWarnings) {
      if (warning.warning_type === 'condition_due') {
        const days = parseDueReminderDays(warning.description)
        reminders.push({
          id: generateId(),
          project_id: warning.project_id,
          task_id: warning.task_id,
          reminder_type: days <= 1 ? 'condition_1day' : 'condition_3day',
          reminder_level: warning.warning_level,
          title: warning.title,
          content: warning.description,
          is_dismissed: false,
          trigger_date: now.toISOString(),
          created_at: now.toISOString(),
        })
      }
    }

    // 阻碍提醒（3天/7天弹窗）
    for (const warning of obstacleWarnings) {
      if (warning.warning_type === 'obstacle_timeout') {
        const daysMatch = warning.description.match(/已持续(\d+)天/)
        if (daysMatch) {
          const days = parseInt(daysMatch[1])
          reminders.push({
            id: generateId(),
            project_id: warning.project_id,
            task_id: warning.task_id,
            reminder_type: days >= 7 ? 'obstacle_7day' : 'obstacle_3day',
            reminder_level: warning.warning_level,
            title: warning.title,
            content: warning.description,
            is_dismissed: false,
            trigger_date: now.toISOString(),
            created_at: now.toISOString(),
          })
        }
      }
    }

    // P0-1: 验收到期提醒（1天/3天/7天弹窗）
    for (const warning of acceptanceWarnings) {
      if (warning.warning_type === 'acceptance_expired') {
        const days = parseDueReminderDays(warning.description)
        let reminderType = 'acceptance_7day'
        if (days <= 1) reminderType = 'acceptance_1day'
        else if (days <= 3) reminderType = 'acceptance_3day'
        reminders.push({
          id: generateId(),
          project_id: warning.project_id,
          task_id: warning.task_id,
          reminder_type: reminderType,
          reminder_level: warning.warning_level,
          title: warning.title,
          content: warning.description,
          is_dismissed: false,
          trigger_date: now.toISOString(),
          created_at: now.toISOString(),
        })
      }
    }

    return reminders
  }

  /**
   * 生成通知
   */
  async generateNotifications(projectId?: string): Promise<Notification[]> {
    const warnings = await this.scanAll(projectId)

    return dedupeNotifications(
      warnings.map((warning) =>
        normalizeNotificationPayload({
          ...warning,
          category: warning.warning_type,
          source_entity_id: warning.source_entity_id ?? warning.task_id,
        }),
      ),
    ) as Notification[]
  }

  async scanAll(projectId?: string, options: { systemJob?: boolean } = {}): Promise<Warning[]> {
    if (!projectId && options.systemJob !== true) {
      throw new Error('warning scan requires projectId or systemJob capability')
    }
    const [impactSignalWarnings, preMilestoneWarnings, criticalPathStagnationWarnings, progressTrendWarnings] = await Promise.all([
      this.scanExecutionImpactSignalWarnings(projectId),
      this.scanPreMilestoneWarnings(projectId, options),
      this.scanCriticalPathStagnationWarnings(projectId, options),
      this.scanProgressTrendWarnings(projectId),
    ])

    const [legacyConditionWarnings, legacyObstacleWarnings, legacyAcceptanceWarnings, legacyDelayExceededWarnings, legacyCriticalPathDelayWarnings] = await Promise.all([
      this.scanConditionWarnings(projectId, false),
      this.scanObstacleWarnings(projectId, false),
      this.scanAcceptanceWarnings(projectId, false),
      this.scanDelayExceededWarnings(projectId, false),
      this.scanCriticalPathDelayWarnings(projectId, false, options),
    ])
    const legacyWarnings = filterLegacyWarningsCoveredByImpactSignals(impactSignalWarnings, [
      ...legacyConditionWarnings,
      ...legacyObstacleWarnings,
      ...legacyAcceptanceWarnings,
      ...legacyDelayExceededWarnings,
      ...legacyCriticalPathDelayWarnings,
    ])

    return collapseWarningRedundancy([
      ...impactSignalWarnings,
      ...legacyWarnings,
      ...preMilestoneWarnings,
      ...criticalPathStagnationWarnings,
      ...progressTrendWarnings,
    ])
  }

  async syncActiveWarnings(projectId?: string, options: { systemJob?: boolean } = {}): Promise<Warning[]> {
    const warnings = await this.scanAll(projectId, options)
    return await syncWarningNotifications(warnings, projectId)
  }

  // v1.4.12: read-only query of existing warning notifications — no inserts/updates
  async readActiveWarnings(projectId: string): Promise<Warning[]> {
    if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      try {
        const result = await rawQuery(
          `SELECT *
             FROM public.notifications
            WHERE source_entity_type = 'warning'
              AND project_id = $1
              AND warning_lifecycle_status = ANY($2::text[])
            ORDER BY created_at DESC`,
          [projectId, ['active', 'created']],
        )
        return (result.rows ?? []).map((row: any) => notificationToWarning(row))
      } catch (error) {
        logger.warn('[warningService] direct active warning read failed; falling back to Supabase REST', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('source_entity_type', 'warning')
      .eq('project_id', projectId)
      .in('warning_lifecycle_status', ['active', 'created'])
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row: any) => notificationToWarning(row))
  }

  async acknowledgeWarning(projectId: string, id: string, actorId?: string) {
    return acknowledgeWarningNotification(projectId, id, actorId)
  }

  async muteWarning(projectId: string, id: string, hours = 24, actorId?: string) {
    return muteWarningNotification(projectId, id, hours, actorId)
  }

  async confirmWarningAsRisk(projectId: string, id: string, actorId?: string) {
    return confirmWarningAsRiskOnChain(projectId, id, actorId)
  }

  async syncConditionExpiredIssues(projectId?: string) {
    return await syncConditionExpiredIssuesOnChain(projectId)
  }

  async syncAcceptanceExpiredIssues(projectId?: string) {
    return await syncAcceptanceExpiredIssuesOnChain(projectId)
  }

  async autoEscalateWarnings(projectId?: string) {
    return await autoEscalateWarningsOnChain(projectId)
  }

  async autoEscalateRisksToIssues(projectId?: string) {
    return await autoEscalateRisksToIssuesOnChain(projectId)
  }

  async evaluate(event: WarningEvaluationEvent): Promise<{
    severity?: 'info' | 'warning' | 'critical'
    note?: string | null
    escalated?: boolean
    resolved?: boolean
  }> {
    if (event.type === 'obstacle' && event.obstacle) {
      const obstacle = event.obstacle
      const result = escalateObstacleSeverity({
        severity: normalizeObstacleSeverityForEvaluation(obstacle.severity),
        status: obstacle.status,
        expected_resolution_date: obstacle.expected_resolution_date,
        now: new Date().toISOString(),
      })

      if (result.escalated && obstacle.id) {
        if (Boolean(obstacle.severity_manually_overridden)) {
          return {
            severity: result.severity === 'critical' ? 'critical' : 'warning',
            escalated: false,
          }
        }

        const nextSeverity = result.severity
        const storedSeverity = nextSeverity === 'critical' ? '严重' : obstacle.severity ?? '中'
        const escalationReason = buildObstacleSeverityEscalationReason(obstacle, storedSeverity)
        const escalationTimestamp = new Date().toISOString()
        const hasEscalationTimestamp = Boolean(obstacle.severity_escalated_at)
        const hasEscalationMarker = hasEscalationTimestamp || await hasChangeLog({
          entity_type: 'task_obstacle',
          entity_id: obstacle.id,
          field_name: 'severity_auto_escalation',
          new_value: storedSeverity,
          change_source: 'system_auto',
          change_reason: escalationReason,
        })

        if (String(obstacle.severity ?? '').trim() !== storedSeverity) {
          const { error } = await supabase
            .from('task_obstacles')
            .update({
              severity: storedSeverity,
              severity_escalated_at: obstacle.severity_escalated_at ?? escalationTimestamp,
              severity_manually_overridden: false,
              updated_at: escalationTimestamp,
            })
            .eq('id', obstacle.id)
            .eq('project_id', obstacle.project_id)

          if (error) {
            throw new Error(error.message)
          }

          await writeLog({
            entity_type: 'task_obstacle',
            entity_id: obstacle.id,
            field_name: 'severity',
            old_value: obstacle.severity ?? null,
            new_value: storedSeverity,
            change_source: 'system_auto',
            change_reason: escalationReason,
          })
        } else if (!obstacle.severity_escalated_at) {
          const { error } = await supabase
            .from('task_obstacles')
            .update({
              severity_escalated_at: escalationTimestamp,
              severity_manually_overridden: false,
              updated_at: escalationTimestamp,
            })
            .eq('id', obstacle.id)
            .eq('project_id', obstacle.project_id)

          if (error) {
            throw new Error(error.message)
          }
        }

        if (!hasEscalationMarker) {
          await writeLog({
            entity_type: 'task_obstacle',
            entity_id: obstacle.id,
            field_name: 'severity_auto_escalation',
            old_value: null,
            new_value: storedSeverity,
            change_source: 'system_auto',
            change_reason: escalationReason,
          })
        }

        await ensureObstacleEscalatedIssue({
          id: obstacle.id,
          project_id: obstacle.project_id,
          task_id: obstacle.task_id,
          severity: storedSeverity,
          status: obstacle.status,
          description: obstacle.description ?? null,
        })
      }

      // GAP-10.2g-01: 阻碍解决后，触发关联 obstacle_escalated issue 的来源解除联动
      const resolvedStatuses = ['已解决', 'resolved']
      if (obstacle.id && resolvedStatuses.includes(String(obstacle.status ?? '').toLowerCase())) {
        try {
          await markObstacleEscalatedIssuePendingManualClose(obstacle.id, obstacle.project_id ?? null)
        } catch (linkErr) {
          // 联动失败不阻断主链，仅记录
          console.warn('[warningService] obstacle->issue 来源解除联动失败', linkErr)
        }
      }

      return {
        severity: result.severity === 'critical' ? 'critical' : 'warning',
        escalated: result.escalated,
      }
    }

    if (event.type === 'task' && ['completed', '已完成'].includes(String(event.task?.status ?? ''))) {
      return { resolved: true }
    }

    return {}
  }
}
