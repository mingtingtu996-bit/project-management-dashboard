import { performance } from 'node:perf_hooks'
import { readFileSync } from 'node:fs'
import { readJsonFile, writeJsonFile } from './jsonEvidenceUtils.js'

import {
  buildCompanySummaryResponse,
  type CompanySummaryResponse,
} from '../services/companySummaryService.js'
import type { ProjectExecutionSummary } from '../services/projectExecutionSummaryService.js'
import { mapProjectHealthStatus } from '../utils/projectHealthStatus.js'

type ScenarioStatus = 'pass' | 'fail'
type ScenarioCount = 50 | 100 | 500 | number

export type CompanySummaryRouteEvidenceScenario = {
  projectCount: number
  diagnosticRunId?: string | null
  routeInvocationId?: string | null
  requestId?: string | null
  method?: string | null
  routePath?: string | null
  p50Ms: number
  p95Ms: number
  p99Ms: number
  dbQueryLogCaptured?: boolean
  cacheHitEvidenceCaptured?: boolean
  networkLatencyCaptured?: boolean
  dbQueryLog?: {
    coldRequestQueryCount: number | null
    warmRequestQueryCount: number | null
    tableNames: string[]
  } | null
  cacheEvidence?: {
    cacheKey: string | null
    coldCacheHit: boolean | null
    warmCacheHit: boolean | null
  } | null
  responseShape?: {
    projectCount: number | null
    rankingCount: number | null
    healthHistoryPeriods: number | null
  } | null
}

export type CompanySummaryRouteEvidenceAssessmentScenario = CompanySummaryRouteEvidenceScenario & {
  budgetMs: number
  status: ScenarioStatus
  runtimeEvidenceGap: {
    missingRealDbQueryLog: boolean
    missingRouteCacheHitEvidence: boolean
    missingNetworkLatency: boolean
    missingProductionLikeP95: boolean
    missingRouteInvocationEvidence: boolean
    missingLatencyPercentileOrder: boolean
    missingTimingSanityEvidence: boolean
    missingDbQueryLogDetail: boolean
    missingCacheHitDetail: boolean
    missingResponseShapeEvidence: boolean
    missingRouteCorrelationEvidence: boolean
  }
}

export type CompanySummaryRouteEvidenceAssessment = {
  evidenceFile: string | null
  environment: string | null
  evidenceRef: string | null
  diagnosticRunId: string | null
  expectedDiagnosticRunId: string | null
  diagnosticRunIdMatches: boolean
  missingEvidenceMetadata: boolean
  nonLiveEvidenceMetadata: boolean
  status: ScenarioStatus
  requiredProjectCounts: number[]
  missingProjectCounts: number[]
  scenarios: CompanySummaryRouteEvidenceAssessmentScenario[]
}

export type CompanySummarySyntheticPressureScenario = {
  projectCount: number
  iterations: number
  budgetMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  maxMs: number
  dbQueryCount: 0
  cacheSimulation: 'cold_build_only'
  runtimeEvidenceGap: {
    missingRealDbQueryLog: true
    missingRouteCacheHitEvidence: true
    missingNetworkLatency: true
    missingProductionLikeP95: true
  }
  status: ScenarioStatus
  resultShape: {
    projectCount: number
    rankingCount: number
    healthHistoryPeriods: number
  }
}

export type CompanySummarySyntheticPressureReport = {
  reportCode: 'c18_l14_company_summary_synthetic_pressure'
  evidenceKind: 'synthetic_local_budget'
  generatedAt: string
  diagnosticRunId: string
  outputFile: string | null
  missingArchivedJson: boolean
  routeEvidenceFile: string | null
  routeEvidenceAssessment: CompanySummaryRouteEvidenceAssessment | null
  liveEvidenceRequired: true
  requireLiveEvidence: boolean
  liveEvidenceRequiredReason: string
  liveDbEvidenceChecklist: string[]
  scenarios: CompanySummarySyntheticPressureScenario[]
}

export type CompanySummarySyntheticPressureOptions = {
  scenarios?: ScenarioCount[]
  iterations?: number
  now?: Date
  budgetMs?: Record<number, number>
  outputFile?: string | null
  routeEvidenceFile?: string | null
  routeEvidence?: unknown
  requireLiveEvidence?: boolean
  diagnosticRunId?: string | null
}

const DEFAULT_SCENARIOS = [50, 100, 500]
const DEFAULT_ITERATIONS = 20
const DEFAULT_BUDGET_MS: Record<number, number> = {
  50: 50,
  100: 75,
  500: 150,
}
const DEFAULT_ROUTE_BUDGET_MS: Record<number, number> = {
  50: 200,
  100: 300,
  500: 1000,
}
const CANONICAL_COMPANY_SUMMARY_ROUTE = '/api/company/dashboard/company-summary'

function liveDbEvidenceChecklist() {
  return [
    'real /api/company/dashboard/company-summary p50/p95/p99 for 50, 100, and 500 visible projects',
    'DB query count and table grouping for cold cache and warm cache requests',
    'cache hit evidence for repeated reads with the same scoped cache key',
    'timeout budget and error fallback behavior under production-like network latency',
  ]
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

const LIVE_EVIDENCE_ENVIRONMENTS = new Set([
  'staging',
  'stage',
  'production',
  'prod',
  'live',
  'current-live',
  'prod-like',
  'production-like',
  'production_like',
  'productionlike',
])

function hasLiveEvidenceMetadata(params: {
  environment: string | null
  evidenceRef: string | null
  evidenceFile: string | null
}) {
  const environment = normalizeText(params.environment).toLowerCase()
  if (!LIVE_EVIDENCE_ENVIRONMENTS.has(environment)) return false

  const evidenceLocator = [params.evidenceRef, params.evidenceFile]
    .map((value) => normalizeText(value).toLowerCase())
    .join(' ')
  return !/(^|[\\/_\-.])(sample|synthetic|local)([\\/_\-.]|$)/.test(evidenceLocator)
}

function createDefaultDiagnosticRunId(now: Date) {
  return `c18-l14-${now.toISOString().replace(/[:.]/g, '-')}`
}

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readString(value: unknown) {
  const text = normalizeText(value)
  return text.length > 0 ? text : null
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readEvidenceMetadata(value: unknown) {
  const record = readRecord(value)
  if (!record) {
    return { environment: null, evidenceRef: null, diagnosticRunId: null }
  }
  return {
    environment: readString(record.environment),
    evidenceRef: readString(record.evidenceRef ?? record.evidence_ref),
    diagnosticRunId: readString(record.diagnosticRunId ?? record.diagnostic_run_id),
  }
}

function normalizeDbQueryLog(value: unknown): CompanySummaryRouteEvidenceScenario['dbQueryLog'] {
  const record = readRecord(value)
  if (!record) return null
  const rawTableNames = record.tableNames ?? record.table_names
  const tableNames = Array.isArray(rawTableNames)
    ? rawTableNames
      .map((item) => normalizeText(item))
      .filter(Boolean)
    : []
  return {
    coldRequestQueryCount: readNumber(record.coldRequestQueryCount ?? record.cold_request_query_count),
    warmRequestQueryCount: readNumber(record.warmRequestQueryCount ?? record.warm_request_query_count),
    tableNames,
  }
}

function normalizeCacheEvidence(value: unknown): CompanySummaryRouteEvidenceScenario['cacheEvidence'] {
  const record = readRecord(value)
  if (!record) return null
  return {
    cacheKey: readString(record.cacheKey ?? record.cache_key),
    coldCacheHit: readBoolean(record.coldCacheHit ?? record.cold_cache_hit),
    warmCacheHit: readBoolean(record.warmCacheHit ?? record.warm_cache_hit),
  }
}

function normalizeResponseShape(value: unknown): CompanySummaryRouteEvidenceScenario['responseShape'] {
  const record = readRecord(value)
  if (!record) return null
  return {
    projectCount: readNumber(record.projectCount ?? record.project_count),
    rankingCount: readNumber(record.rankingCount ?? record.ranking_count),
    healthHistoryPeriods: readNumber(record.healthHistoryPeriods ?? record.health_history_periods),
  }
}

function normalizeRouteEvidenceScenarios(value: unknown): CompanySummaryRouteEvidenceScenario[] {
  const source = (() => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      return Array.isArray(record.scenarios) ? record.scenarios : []
    }
    return []
  })()

  return source.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const projectCount = readNumber(record.projectCount)
    const p50Ms = readNumber(record.p50Ms)
    const p95Ms = readNumber(record.p95Ms)
    const p99Ms = readNumber(record.p99Ms)
    if (projectCount === null || p50Ms === null || p95Ms === null || p99Ms === null) return []
    return [{
      projectCount,
      diagnosticRunId: readString(record.diagnosticRunId ?? record.diagnostic_run_id),
      routeInvocationId: readString(record.routeInvocationId ?? record.route_invocation_id),
      requestId: readString(record.requestId ?? record.request_id),
      method: normalizeText(record.method).toUpperCase() || null,
      routePath: normalizeText(record.routePath ?? record.route_path ?? record.path ?? record.url) || null,
      p50Ms,
      p95Ms,
      p99Ms,
      dbQueryLogCaptured: record.dbQueryLogCaptured === true,
      cacheHitEvidenceCaptured: record.cacheHitEvidenceCaptured === true,
      networkLatencyCaptured: record.networkLatencyCaptured === true,
      dbQueryLog: normalizeDbQueryLog(record.dbQueryLog ?? record.db_query_log),
      cacheEvidence: normalizeCacheEvidence(record.cacheEvidence ?? record.cache_evidence),
      responseShape: normalizeResponseShape(record.responseShape ?? record.response_shape),
    }]
  })
}

function hasDbQueryLogDetail(scenario: CompanySummaryRouteEvidenceScenario) {
  const detail = scenario.dbQueryLog
  if (!detail) return false
  const coldCount = detail.coldRequestQueryCount
  const warmCount = detail.warmRequestQueryCount
  return typeof coldCount === 'number' &&
    typeof warmCount === 'number' &&
    coldCount > 0 &&
    warmCount >= 0 &&
    warmCount < coldCount &&
    detail.tableNames.includes('project_daily_snapshot')
}

function hasCacheHitDetail(scenario: CompanySummaryRouteEvidenceScenario) {
  const detail = scenario.cacheEvidence
  return Boolean(
    detail &&
      detail.cacheKey &&
      detail.coldCacheHit === false &&
      detail.warmCacheHit === true,
  )
}

function hasResponseShapeEvidence(scenario: CompanySummaryRouteEvidenceScenario) {
  const shape = scenario.responseShape
  return Boolean(
    shape &&
      shape.projectCount === scenario.projectCount &&
      shape.rankingCount === scenario.projectCount &&
      typeof shape.healthHistoryPeriods === 'number' &&
      shape.healthHistoryPeriods >= 2,
  )
}

function loadRouteEvidence(options: CompanySummarySyntheticPressureOptions) {
  if (options.routeEvidence !== undefined) {
    return {
      ...readEvidenceMetadata(options.routeEvidence),
      scenarios: normalizeRouteEvidenceScenarios(options.routeEvidence),
    }
  }
  const routeEvidenceFile = normalizeText(options.routeEvidenceFile)
  if (!routeEvidenceFile) {
    return { environment: null, evidenceRef: null, diagnosticRunId: null, scenarios: [] }
  }
  const evidence = readJsonFile(routeEvidenceFile)
  return {
    ...readEvidenceMetadata(evidence),
    scenarios: normalizeRouteEvidenceScenarios(evidence),
  }
}

function assessRouteEvidence(params: {
  scenarios: CompanySummaryRouteEvidenceScenario[]
  environment: string | null
  evidenceRef: string | null
  diagnosticRunId: string | null
  expectedDiagnosticRunId: string
  evidenceFile: string | null
  requiredProjectCounts: number[]
  budgetMs: Record<number, number>
}): CompanySummaryRouteEvidenceAssessment | null {
  if (params.scenarios.length === 0) return null
  const missingEvidenceMetadata = !params.environment || !params.evidenceRef || !params.diagnosticRunId
  const nonLiveEvidenceMetadata = !missingEvidenceMetadata && !hasLiveEvidenceMetadata({
    environment: params.environment,
    evidenceRef: params.evidenceRef,
    evidenceFile: params.evidenceFile,
  })
  const diagnosticRunIdMatches = params.diagnosticRunId === params.expectedDiagnosticRunId
  const scenarioByProjectCount = new Map(params.scenarios.map((scenario) => [scenario.projectCount, scenario]))
  const missingProjectCounts = params.requiredProjectCounts.filter((projectCount) =>
    !scenarioByProjectCount.has(projectCount),
  )
  const scenarios = params.requiredProjectCounts
    .flatMap((projectCount): CompanySummaryRouteEvidenceAssessmentScenario[] => {
      const scenario = scenarioByProjectCount.get(projectCount)
      if (!scenario) return []
      const budgetMs = params.budgetMs[projectCount] ?? DEFAULT_BUDGET_MS[500]
      const runtimeEvidenceGap = {
        missingRealDbQueryLog: scenario.dbQueryLogCaptured !== true,
        missingRouteCacheHitEvidence: scenario.cacheHitEvidenceCaptured !== true,
        missingNetworkLatency: scenario.networkLatencyCaptured !== true,
        missingProductionLikeP95: scenario.p95Ms > budgetMs,
        missingRouteInvocationEvidence: scenario.method !== 'GET' ||
          scenario.routePath !== CANONICAL_COMPANY_SUMMARY_ROUTE,
        missingLatencyPercentileOrder: !(scenario.p50Ms <= scenario.p95Ms && scenario.p95Ms <= scenario.p99Ms),
        missingTimingSanityEvidence: scenario.p50Ms < 0 || scenario.p95Ms < 0 || scenario.p99Ms < 0,
        missingDbQueryLogDetail: !hasDbQueryLogDetail(scenario),
        missingCacheHitDetail: !hasCacheHitDetail(scenario),
        missingResponseShapeEvidence: !hasResponseShapeEvidence(scenario),
        missingRouteCorrelationEvidence: !params.expectedDiagnosticRunId ||
          !diagnosticRunIdMatches ||
          scenario.diagnosticRunId !== params.expectedDiagnosticRunId ||
          !scenario.routeInvocationId ||
          !scenario.requestId,
      }
      const status: ScenarioStatus = Object.values(runtimeEvidenceGap).some(Boolean) ? 'fail' : 'pass'
      return [{
        ...scenario,
        budgetMs,
        status,
        runtimeEvidenceGap,
      }]
    })
  return {
    evidenceFile: params.evidenceFile,
    environment: params.environment,
    evidenceRef: params.evidenceRef,
    diagnosticRunId: params.diagnosticRunId,
    expectedDiagnosticRunId: params.expectedDiagnosticRunId,
    diagnosticRunIdMatches,
    missingEvidenceMetadata,
    nonLiveEvidenceMetadata,
    status: !missingEvidenceMetadata && !nonLiveEvidenceMetadata && diagnosticRunIdMatches && missingProjectCounts.length === 0 && scenarios.every((scenario) => scenario.status === 'pass')
      ? 'pass'
      : 'fail',
    requiredProjectCounts: params.requiredProjectCounts,
    missingProjectCounts,
    scenarios,
  }
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getPreviousMonthKey(date: Date) {
  return formatMonthKey(new Date(date.getFullYear(), date.getMonth() - 1, 1))
}

function makeSyntheticSummary(index: number): ProjectExecutionSummary {
  const health = 45 + (index % 55)
  const overdueMilestones = index % 40 === 0 ? 1 : 0
  const overallProgress = 30 + (index % 70)
  const plannedProgress = Math.min(100, overallProgress + 5)
  return {
    id: `project-${index}`,
    name: `Synthetic Project ${String(index).padStart(4, '0')}`,
    status: index % 7 === 0 ? 'active' : 'not_started',
    statusLabel: index % 7 === 0 ? 'active' : 'not_started',
    plannedStartDate: '2026-01-01',
    plannedEndDate: '2026-12-31',
    futureDueWindow: {
      value: 180 - (index % 180),
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      timezone: 'Asia/Shanghai',
      asOf: '2026-07-01',
      availability: 'available',
      unavailableReason: null,
    },
    actualOverdue: {
      value: index % 30,
      unit: 'construction_production_day',
      calendarRef: 'synthetic-profile-calendar',
      calendarVersion: 'v1',
      timezone: 'Asia/Shanghai',
      asOf: '2026-07-01',
      availability: 'available',
      unavailableReason: null,
    },
    daysUntilPlannedEnd: 180 - (index % 180),
    totalTasks: 100 + (index % 20),
    leafTaskCount: 80 + (index % 10),
    planPhaseCount: 4 + (index % 3),
    completedTaskCount: 20 + (index % 30),
    inProgressTaskCount: 5 + (index % 15),
    delayedTaskCount: index % 9,
    overdueTaskCount: index % 5,
    laggedTaskCount: index % 4,
    delayDays: index % 30,
    delayCount: index % 6,
    overallProgress,
    plannedProgress,
    progressDeviation: overallProgress - plannedProgress,
    progressGap: plannedProgress - overallProgress,
    summaryAsOf: '2026-07-01T00:00:00.000Z',
    taskProgress: overallProgress,
    totalMilestones: 10,
    completedMilestones: index % 10,
    milestoneProgress: (index % 10) * 10,
    riskCount: index % 8,
    activeRiskCount: index % 4,
    activeIssueCount: index % 3,
    pendingConditionCount: index % 5,
    pendingConditionTaskCount: index % 4,
    activeObstacleCount: index % 6,
    activeObstacleTaskCount: index % 5,
    todayTodoCount: index % 7,
    projectTodayActionCount: index % 8,
    preMilestoneCount: 5,
    completedPreMilestoneCount: index % 5,
    activePreMilestoneCount: index % 3,
    overduePreMilestoneCount: index % 2,
    acceptancePlanCount: 4,
    passedAcceptancePlanCount: index % 4,
    inProgressAcceptancePlanCount: index % 2,
    failedAcceptancePlanCount: index % 3 === 0 ? 1 : 0,
    constructionDrawingCount: 6,
    issuedConstructionDrawingCount: index % 6,
    reviewingConstructionDrawingCount: index % 3,
    attentionRequired: health < 60 || overdueMilestones > 0,
    scheduleVarianceDays: index % 15,
    activeDelayedTasks: index % 8,
    activeObstacles: index % 5,
    monthlyCloseStatus: '未开始',
    closeoutOverdueDays: index % 4,
    unreadWarningCount: index % 9,
    highestWarningLevel: index % 11 === 0 ? 'critical' : index % 5 === 0 ? 'warning' : null,
    highestWarningSummary: null,
    shiftedMilestoneCount: index % 3,
    criticalPathAffectedTasks: index % 4,
    responsibilityCoverageRate: 0.8,
    generatedPlanDurationReadinessRate: 0.75,
    dependencyTopologyNonTrivialRate: 0.7,
    responsibleUnitResolutionRate: 0.85,
    preconditionAttachmentRate: 0.9,
    baselineDeviationRate: 0.1,
    monthlyPlanFulfillmentRate: 0.82,
    monthlyPlanConfirmedCount: 2,
    monthlyPlanClosedCount: 1,
    monthlyPlanPendingCloseoutCount: index % 2,
    monthlyProductivityDistribution: {
      monthlyAverageP: null,
      monthlyMaxP: null,
      monthlyMinP: null,
      monthlyP90: null,
      accelerationCaseRatio: null,
      monthlyProductivityCaseCount: 0,
      sampleMaturity: 'none',
      representativeness: {
        sampleCount: 0,
        maturity: 'none',
        buildingGroupCount: 0,
        specialtyGroupCount: 0,
        criticalPathSampleCount: 0,
      },
    },
    planningAlignmentStatus: 'aligned',
    temporaryWithoutBaselineCount: 0,
    planningPendingRealignCount: 0,
    healthStatus: mapProjectHealthStatus(health),
    businessHealthScore: health,
    reliabilityScore: health,
    healthConfidenceScore: 90,
    healthConfidenceFlag: null,
    progressDeliveryScore: health,
    executionStabilityScore: health,
    criticalTargetScore: health,
    businessExceptionScore: health,
    planGovernanceScore: health,
    milestoneOverview: { stats: { overdue: overdueMilestones } } as ProjectExecutionSummary['milestoneOverview'],
    keyNodeSummary: {} as ProjectExecutionSummary['keyNodeSummary'],
    kpiComparisons: {} as ProjectExecutionSummary['kpiComparisons'],
    planningGovernance: {} as ProjectExecutionSummary['planningGovernance'],
  }
}

function makeSyntheticSummaries(projectCount: number) {
  return Array.from({ length: projectCount }, (_, index) => makeSyntheticSummary(index))
}

function makeSyntheticHealthRows(projectCount: number, now: Date) {
  const thisMonth = formatMonthKey(now)
  const lastMonth = getPreviousMonthKey(now)
  return Array.from({ length: projectCount * 2 }, (_, index) => {
    const projectIndex = Math.floor(index / 2)
    const isThisMonth = index % 2 === 1
    return {
      project_id: `project-${projectIndex}`,
      period: isThisMonth ? thisMonth : lastMonth,
      health_score: 45 + (projectIndex % 55),
    }
  })
}

function measureScenario(projectCount: number, iterations: number, budgetMs: number, now: Date) {
  const durations: number[] = []
  let lastResult: CompanySummaryResponse | null = null
  const summaries = makeSyntheticSummaries(projectCount)
  const healthRows = makeSyntheticHealthRows(projectCount, now)

  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now()
    lastResult = buildCompanySummaryResponse(summaries, healthRows, now)
    durations.push(performance.now() - start)
  }

  const p50Ms = roundMs(percentile(durations, 0.5))
  const p95Ms = roundMs(percentile(durations, 0.95))
  const p99Ms = roundMs(percentile(durations, 0.99))
  const maxMs = roundMs(Math.max(...durations))

  return {
    projectCount,
    iterations,
    budgetMs,
    p50Ms,
    p95Ms,
    p99Ms,
    maxMs,
    dbQueryCount: 0,
    cacheSimulation: 'cold_build_only',
    runtimeEvidenceGap: {
      missingRealDbQueryLog: true,
      missingRouteCacheHitEvidence: true,
      missingNetworkLatency: true,
      missingProductionLikeP95: true,
    },
    status: p95Ms <= budgetMs ? 'pass' : 'fail',
    resultShape: {
      projectCount: lastResult?.projectCount ?? 0,
      rankingCount: lastResult?.ranking.length ?? 0,
      healthHistoryPeriods: lastResult?.healthHistory.periods.length ?? 0,
    },
  } satisfies CompanySummarySyntheticPressureScenario
}

export function buildCompanySummarySyntheticPressureReport(
  options: CompanySummarySyntheticPressureOptions = {},
): CompanySummarySyntheticPressureReport {
  const now = options.now ?? new Date()
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const scenarios = options.scenarios ?? DEFAULT_SCENARIOS
  const iterations = Math.max(1, Math.trunc(options.iterations ?? DEFAULT_ITERATIONS))
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS
  const routeEvidenceFile = normalizeText(options.routeEvidenceFile)
  const routeEvidence = loadRouteEvidence(options)
  const routeEvidenceAssessment = assessRouteEvidence({
    scenarios: routeEvidence.scenarios,
    environment: routeEvidence.environment,
    evidenceRef: routeEvidence.evidenceRef,
    diagnosticRunId: routeEvidence.diagnosticRunId,
    expectedDiagnosticRunId: diagnosticRunId,
    evidenceFile: routeEvidenceFile || null,
    requiredProjectCounts: DEFAULT_SCENARIOS,
    budgetMs: DEFAULT_ROUTE_BUDGET_MS,
  })

  return {
    reportCode: 'c18_l14_company_summary_synthetic_pressure',
    evidenceKind: 'synthetic_local_budget',
    generatedAt: now.toISOString(),
    diagnosticRunId,
    outputFile: options.outputFile ?? null,
    missingArchivedJson: !options.outputFile,
    routeEvidenceFile: routeEvidenceFile || null,
    routeEvidenceAssessment,
    liveEvidenceRequired: true,
    requireLiveEvidence: options.requireLiveEvidence === true,
    liveEvidenceRequiredReason: 'Synthetic local budget measures CPU-only summary shaping; C-18.L14 still requires real DB query logs, cache hit evidence, and p50/p95/p99 from staging or production-like data.',
    liveDbEvidenceChecklist: liveDbEvidenceChecklist(),
    scenarios: scenarios.map((projectCount) =>
      measureScenario(projectCount, iterations, budgetMs[projectCount] ?? DEFAULT_BUDGET_MS[500], now),
    ),
  }
}

export function shouldFailCompanySummarySyntheticPressureReport(
  report: CompanySummarySyntheticPressureReport,
) {
  return report.scenarios.some((scenario) => scenario.status === 'fail')
    || report.routeEvidenceAssessment?.status === 'fail'
    || (report.requireLiveEvidence && (
      report.routeEvidenceAssessment?.status !== 'pass'
      || report.missingArchivedJson
    ))
}

function parseNumberArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  if (!inline) return undefined
  const value = inline.slice(prefix.length)
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

function parseBooleanFlag(args: string[], name: string) {
  return args.includes(`--${name}`)
}

export function parseCompanySummaryPressureOptionsFromArgs(
  args: string[],
): Pick<CompanySummarySyntheticPressureOptions, 'iterations' | 'outputFile' | 'routeEvidenceFile' | 'requireLiveEvidence' | 'diagnosticRunId'> {
  const iterations = parseNumberArg(args, 'iterations')
  const outputFile = parseStringArg(args, 'output-file')
  const routeEvidenceFile = parseStringArg(args, 'route-evidence-file')
  const requireLiveEvidence = parseBooleanFlag(args, 'require-live-evidence')
  const diagnosticRunId = parseStringArg(args, 'diagnostic-run-id')
  return {
    ...(iterations === undefined ? {} : { iterations }),
    ...(outputFile ? { outputFile } : {}),
    ...(routeEvidenceFile ? { routeEvidenceFile } : {}),
    ...(requireLiveEvidence ? { requireLiveEvidence } : {}),
    ...(diagnosticRunId ? { diagnosticRunId } : {}),
  }
}

function writeReportIfRequested(report: CompanySummarySyntheticPressureReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = buildCompanySummarySyntheticPressureReport(
    parseCompanySummaryPressureOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailCompanySummarySyntheticPressureReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('profile-company-summary.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
