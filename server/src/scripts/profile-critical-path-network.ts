import { performance } from 'node:perf_hooks'
import { readFileSync } from 'node:fs'
import { readJsonFile, writeJsonFile } from './jsonEvidenceUtils.js'

import type {
  CriticalPathSyntheticNetworkProfileOptions,
  CriticalPathSyntheticNetworkProfileResult,
} from '../services/projectCriticalPathService.js'

export type CriticalPathSyntheticPressureScenarioCode = 'resource_chain_1000'
type CriticalPathSyntheticPressureStatus = 'pass' | 'fail'

export type CriticalPathSyntheticPressureRunner = (
  options: CriticalPathSyntheticNetworkProfileOptions,
) => CriticalPathSyntheticNetworkProfileResult

export type CriticalPathSyntheticPressureScenario = CriticalPathSyntheticNetworkProfileResult & {
  scenarioCode: CriticalPathSyntheticPressureScenarioCode
  status: CriticalPathSyntheticPressureStatus
  budgetMs: number
  elapsedMs: number
  runtimeEvidenceGap: {
    missingPersistedNetworkData: true
    missingConcurrentSweepAndRouteRun: true
    missingDbWriteTiming: true
    missingConnectionPoolEvidence: true
    missingFinalProjectionReadback: true
    missingProjectRouteEvidence: true
  }
  reason?: string
}

export type CriticalPathDbEvidenceScenario = {
  scenarioCode: CriticalPathSyntheticPressureScenarioCode
  diagnosticRunId?: string | null
  refreshRequestId?: string | null
  readbackRequestId?: string | null
  dbWriteTraceId?: string | null
  projectId?: string | null
  routeMethod?: string | null
  routePath?: string | null
  readbackRouteMethod?: string | null
  readbackRoutePath?: string | null
  persistedTaskCount: number
  persistedDependencyEdgeCount: number
  concurrentSweepAndRouteRunObserved?: boolean
  dbWriteP95Ms: number
  dbWriteBudgetMs: number
  connectionPoolObserved?: boolean
  lockWaitObserved?: boolean
  finalProjectionReadbackObserved?: boolean
  finalProjectionReadbackProjectId?: string | null
  finalProjectedFloatTaskCount: number
  finalCriticalTaskCount: number
  finalProjectDurationDays: number
}

export type CriticalPathDbEvidenceAssessmentScenario = CriticalPathDbEvidenceScenario & {
  status: CriticalPathSyntheticPressureStatus
  runtimeEvidenceGap: {
    missingPersistedNetworkData: boolean
    missingConcurrentSweepAndRouteRun: boolean
    missingDbWriteTiming: boolean
    missingConnectionPoolEvidence: boolean
    missingFinalProjectionReadback: boolean
    missingProjectRouteEvidence: boolean
    missingDiagnosticRunCorrelationEvidence: boolean
  }
}

export type CriticalPathDbEvidenceAssessment = {
  evidenceFile: string | null
  environment: string | null
  evidenceRef: string | null
  diagnosticRunId: string | null
  expectedDiagnosticRunId: string | null
  diagnosticRunIdMatches: boolean
  missingEvidenceMetadata: boolean
  nonLiveEvidenceMetadata: boolean
  status: CriticalPathSyntheticPressureStatus
  requiredScenarioCodes: CriticalPathSyntheticPressureScenarioCode[]
  missingScenarioCodes: CriticalPathSyntheticPressureScenarioCode[]
  scenarios: CriticalPathDbEvidenceAssessmentScenario[]
}

export type CriticalPathSyntheticPressureReport = {
  reportCode: 'c18_l12_critical_path_synthetic_pressure'
  evidenceKind: 'synthetic_local_cpm_network'
  generatedAt: string
  diagnosticRunId: string
  outputFile: string | null
  missingArchivedJson: boolean
  dbEvidenceFile: string | null
  dbEvidenceAssessment: CriticalPathDbEvidenceAssessment | null
  liveEvidenceRequired: true
  requireLiveEvidence: boolean
  liveEvidenceRequiredReason: string
  liveDbEvidenceChecklist: string[]
  scenarios: CriticalPathSyntheticPressureScenario[]
}

export type CriticalPathSyntheticPressureOptions = {
  now?: Date
  scenarios?: CriticalPathSyntheticPressureScenarioCode[]
  budgetMs?: Partial<Record<CriticalPathSyntheticPressureScenarioCode, number>>
  runSyntheticNetworkProfile?: CriticalPathSyntheticPressureRunner
  outputFile?: string | null
  dbEvidenceFile?: string | null
  dbEvidence?: unknown
  requireLiveEvidence?: boolean
  diagnosticRunId?: string | null
}

const DEFAULT_SCENARIOS: CriticalPathSyntheticPressureScenarioCode[] = ['resource_chain_1000']
const DEFAULT_BUDGET_MS: Record<CriticalPathSyntheticPressureScenarioCode, number> = {
  resource_chain_1000: 250,
}
const CRITICAL_PATH_REFRESH_ROUTE_PATTERN = /^\/api\/projects\/([^/]+)\/critical-path\/refresh$/
const CRITICAL_PATH_READBACK_ROUTE_PATTERN = /^\/api\/projects\/([^/]+)\/critical-path$/

function liveDbEvidenceChecklist() {
  return [
    'real large-network project with persisted tasks, dependencies, and resource constraints',
    'concurrent sweep plus route recalculation against the same project',
    'DB write timing for critical path snapshot and task float projection',
    'connection-pool, lock wait, and final projection readback evidence',
  ]
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
  return `c18-l12-${now.toISOString().replace(/[:.]/g, '-')}`
}

function readString(value: unknown) {
  const text = normalizeText(value)
  return text.length > 0 ? text : null
}

function readEvidenceMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { environment: null, evidenceRef: null, diagnosticRunId: null }
  }
  const record = value as Record<string, unknown>
  return {
    environment: readString(record.environment),
    evidenceRef: readString(record.evidenceRef ?? record.evidence_ref),
    diagnosticRunId: readString(record.diagnosticRunId ?? record.diagnostic_run_id),
  }
}

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readRouteProjectId(
  method: string | null | undefined,
  routePath: string | null | undefined,
  expectedMethod: string,
  pattern: RegExp,
) {
  if (normalizeText(method).toUpperCase() !== expectedMethod) return null
  const match = normalizeText(routePath).match(pattern)
  return match?.[1] ?? null
}

function normalizeDbEvidenceScenarios(value: unknown): CriticalPathDbEvidenceScenario[] {
  const source = (() => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      return Array.isArray(record.scenarios) ? record.scenarios : []
    }
    return []
  })()
  const allowed = new Set<CriticalPathSyntheticPressureScenarioCode>(DEFAULT_SCENARIOS)
  return source.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const scenarioCode = readString(record.scenarioCode)
    if (!scenarioCode || !allowed.has(scenarioCode as CriticalPathSyntheticPressureScenarioCode)) return []
    const persistedTaskCount = readNumber(record.persistedTaskCount)
    const persistedDependencyEdgeCount = readNumber(record.persistedDependencyEdgeCount)
    const dbWriteP95Ms = readNumber(record.dbWriteP95Ms)
    const dbWriteBudgetMs = readNumber(record.dbWriteBudgetMs)
    const finalProjectedFloatTaskCount = readNumber(record.finalProjectedFloatTaskCount)
    const finalCriticalTaskCount = readNumber(record.finalCriticalTaskCount)
    const finalProjectDurationDays = readNumber(record.finalProjectDurationDays)
    if (
      persistedTaskCount === null ||
      persistedDependencyEdgeCount === null ||
      dbWriteP95Ms === null ||
      dbWriteBudgetMs === null ||
      finalProjectedFloatTaskCount === null ||
      finalCriticalTaskCount === null ||
      finalProjectDurationDays === null
    ) return []
    return [{
      scenarioCode: scenarioCode as CriticalPathSyntheticPressureScenarioCode,
      diagnosticRunId: readString(record.diagnosticRunId ?? record.diagnostic_run_id),
      refreshRequestId: readString(record.refreshRequestId ?? record.refresh_request_id ?? record.routeRequestId ?? record.route_request_id),
      readbackRequestId: readString(record.readbackRequestId ?? record.readback_request_id),
      dbWriteTraceId: readString(record.dbWriteTraceId ?? record.db_write_trace_id),
      projectId: readString(record.projectId ?? record.project_id),
      routeMethod: readString(record.routeMethod ?? record.route_method ?? record.method),
      routePath: readString(record.routePath ?? record.route_path ?? record.path),
      readbackRouteMethod: readString(record.readbackRouteMethod ?? record.readback_route_method),
      readbackRoutePath: readString(record.readbackRoutePath ?? record.readback_route_path),
      persistedTaskCount,
      persistedDependencyEdgeCount,
      concurrentSweepAndRouteRunObserved: record.concurrentSweepAndRouteRunObserved === true,
      dbWriteP95Ms,
      dbWriteBudgetMs,
      connectionPoolObserved: record.connectionPoolObserved === true,
      lockWaitObserved: record.lockWaitObserved === true,
      finalProjectionReadbackObserved: record.finalProjectionReadbackObserved === true,
      finalProjectionReadbackProjectId: readString(
        record.finalProjectionReadbackProjectId ?? record.final_projection_readback_project_id,
      ),
      finalProjectedFloatTaskCount,
      finalCriticalTaskCount,
      finalProjectDurationDays,
    }]
  })
}

function loadDbEvidence(options: CriticalPathSyntheticPressureOptions) {
  if (options.dbEvidence !== undefined) {
    return {
      ...readEvidenceMetadata(options.dbEvidence),
      scenarios: normalizeDbEvidenceScenarios(options.dbEvidence),
    }
  }
  const dbEvidenceFile = readString(options.dbEvidenceFile)
  if (!dbEvidenceFile) {
    return { environment: null, evidenceRef: null, diagnosticRunId: null, scenarios: [] }
  }
  const evidence = readJsonFile(dbEvidenceFile)
  return {
    ...readEvidenceMetadata(evidence),
    scenarios: normalizeDbEvidenceScenarios(evidence),
  }
}

function assessDbEvidence(params: {
  scenarios: CriticalPathDbEvidenceScenario[]
  environment: string | null
  evidenceRef: string | null
  diagnosticRunId: string | null
  expectedDiagnosticRunId: string
  evidenceFile: string | null
  requiredScenarioCodes: CriticalPathSyntheticPressureScenarioCode[]
}): CriticalPathDbEvidenceAssessment | null {
  if (params.scenarios.length === 0) return null
  const missingEvidenceMetadata = !params.environment || !params.evidenceRef || !params.diagnosticRunId
  const nonLiveEvidenceMetadata = !missingEvidenceMetadata && !hasLiveEvidenceMetadata({
    environment: params.environment,
    evidenceRef: params.evidenceRef,
    evidenceFile: params.evidenceFile,
  })
  const diagnosticRunIdMatches = params.diagnosticRunId === params.expectedDiagnosticRunId
  const scenarioByCode = new Map(params.scenarios.map((scenario) => [scenario.scenarioCode, scenario]))
  const missingScenarioCodes = params.requiredScenarioCodes.filter((scenarioCode) =>
    !scenarioByCode.has(scenarioCode),
  )
  const scenarios = params.requiredScenarioCodes.flatMap((scenarioCode): CriticalPathDbEvidenceAssessmentScenario[] => {
    const scenario = scenarioByCode.get(scenarioCode)
    if (!scenario) return []
    const refreshRouteProjectId = readRouteProjectId(
      scenario.routeMethod,
      scenario.routePath,
      'POST',
      CRITICAL_PATH_REFRESH_ROUTE_PATTERN,
    )
    const readbackRouteProjectId = readRouteProjectId(
      scenario.readbackRouteMethod,
      scenario.readbackRoutePath,
      'GET',
      CRITICAL_PATH_READBACK_ROUTE_PATTERN,
    )
    const projectRouteEvidencePresent = Boolean(
      scenario.projectId &&
      refreshRouteProjectId &&
      readbackRouteProjectId &&
      refreshRouteProjectId === scenario.projectId &&
      readbackRouteProjectId === scenario.projectId,
    )
    const runtimeEvidenceGap = {
      missingPersistedNetworkData: scenario.persistedTaskCount < 1000 || scenario.persistedDependencyEdgeCount < 999,
      missingConcurrentSweepAndRouteRun: scenario.concurrentSweepAndRouteRunObserved !== true,
      missingConnectionPoolEvidence: scenario.connectionPoolObserved !== true || scenario.lockWaitObserved !== true,
      missingFinalProjectionReadback: scenario.finalProjectionReadbackObserved !== true ||
        scenario.finalProjectionReadbackProjectId !== scenario.projectId ||
        scenario.finalProjectedFloatTaskCount < 1000 ||
        scenario.finalCriticalTaskCount <= 0 ||
        scenario.finalProjectDurationDays <= 0 ||
        scenario.finalProjectedFloatTaskCount > scenario.persistedTaskCount ||
        scenario.finalCriticalTaskCount > scenario.persistedTaskCount,
      missingDbWriteTiming: scenario.dbWriteP95Ms < 0 ||
        scenario.dbWriteBudgetMs <= 0 ||
        scenario.dbWriteP95Ms > scenario.dbWriteBudgetMs,
      missingProjectRouteEvidence: !projectRouteEvidencePresent,
      missingDiagnosticRunCorrelationEvidence: !params.expectedDiagnosticRunId ||
        !diagnosticRunIdMatches ||
        scenario.diagnosticRunId !== params.expectedDiagnosticRunId ||
        !scenario.refreshRequestId ||
        !scenario.readbackRequestId ||
        !scenario.dbWriteTraceId,
    }
    const status: CriticalPathSyntheticPressureStatus = Object.values(runtimeEvidenceGap).some(Boolean) ? 'fail' : 'pass'
    return [{
      ...scenario,
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
    status: !missingEvidenceMetadata && !nonLiveEvidenceMetadata && diagnosticRunIdMatches && missingScenarioCodes.length === 0 && scenarios.every((scenario) => scenario.status === 'pass')
      ? 'pass'
      : 'fail',
    requiredScenarioCodes: params.requiredScenarioCodes,
    missingScenarioCodes,
    scenarios,
  }
}

function scenarioOptions(
  scenarioCode: CriticalPathSyntheticPressureScenarioCode,
): CriticalPathSyntheticNetworkProfileOptions {
  switch (scenarioCode) {
    case 'resource_chain_1000':
    default:
      return {
        taskCount: 1000,
        resourceCapacity: 1,
        resourceBucketCount: 1,
      }
  }
}

async function loadDefaultRunner(): Promise<CriticalPathSyntheticPressureRunner> {
  const service = await import('../services/projectCriticalPathService.js')
  return service.runCriticalPathSyntheticNetworkProfile
}

async function measureScenario(params: {
  scenarioCode: CriticalPathSyntheticPressureScenarioCode
  budgetMs: number
  runSyntheticNetworkProfile: CriticalPathSyntheticPressureRunner
}): Promise<CriticalPathSyntheticPressureScenario> {
  const options = scenarioOptions(params.scenarioCode)
  const startedAt = performance.now()
  const result = params.runSyntheticNetworkProfile(options)
  const elapsedMs = roundMs(performance.now() - startedAt)
  const status: CriticalPathSyntheticPressureStatus = elapsedMs <= params.budgetMs ? 'pass' : 'fail'

  return {
    scenarioCode: params.scenarioCode,
    status,
    budgetMs: params.budgetMs,
    elapsedMs,
    runtimeEvidenceGap: {
      missingPersistedNetworkData: true,
      missingConcurrentSweepAndRouteRun: true,
      missingDbWriteTiming: true,
      missingConnectionPoolEvidence: true,
      missingFinalProjectionReadback: true,
      missingProjectRouteEvidence: true,
    },
    ...result,
    ...(status === 'pass'
      ? {}
      : { reason: `CPM synthetic network elapsed ${elapsedMs}ms exceeded local budget ${params.budgetMs}ms.` }),
  }
}

export async function buildCriticalPathSyntheticPressureReport(
  options: CriticalPathSyntheticPressureOptions = {},
): Promise<CriticalPathSyntheticPressureReport> {
  const now = options.now ?? new Date()
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const scenarios = options.scenarios ?? DEFAULT_SCENARIOS
  const budgetMs = { ...DEFAULT_BUDGET_MS, ...options.budgetMs }
  const runSyntheticNetworkProfile = options.runSyntheticNetworkProfile ?? await loadDefaultRunner()
  const dbEvidenceFile = options.dbEvidenceFile ?? null
  const dbEvidence = loadDbEvidence(options)
  const dbEvidenceAssessment = assessDbEvidence({
    scenarios: dbEvidence.scenarios,
    environment: dbEvidence.environment,
    evidenceRef: dbEvidence.evidenceRef,
    diagnosticRunId: dbEvidence.diagnosticRunId,
    expectedDiagnosticRunId: diagnosticRunId,
    evidenceFile: dbEvidenceFile,
    requiredScenarioCodes: scenarios,
  })

  return {
    reportCode: 'c18_l12_critical_path_synthetic_pressure',
    evidenceKind: 'synthetic_local_cpm_network',
    generatedAt: now.toISOString(),
    diagnosticRunId,
    outputFile: options.outputFile ?? null,
    missingArchivedJson: !options.outputFile,
    dbEvidenceFile,
    dbEvidenceAssessment,
    liveEvidenceRequired: true,
    requireLiveEvidence: options.requireLiveEvidence === true,
    liveEvidenceRequiredReason: 'Synthetic CPM pressure only exercises local algorithm complexity; C-18.L12 still requires real large-network data, concurrent sweep plus route recalculation, DB write timing, and connection-pool evidence.',
    liveDbEvidenceChecklist: liveDbEvidenceChecklist(),
    scenarios: await Promise.all(scenarios.map((scenarioCode) =>
      measureScenario({
        scenarioCode,
        budgetMs: budgetMs[scenarioCode],
        runSyntheticNetworkProfile,
      }),
    )),
  }
}

export function shouldFailCriticalPathSyntheticPressureReport(
  report: CriticalPathSyntheticPressureReport,
) {
  return report.scenarios.some((scenario) => scenario.status === 'fail') ||
    report.dbEvidenceAssessment?.status === 'fail' ||
    (report.requireLiveEvidence && (
      report.dbEvidenceAssessment?.status !== 'pass' ||
      report.missingArchivedJson
    ))
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

function parseBooleanFlag(args: string[], name: string) {
  return args.includes(`--${name}`)
}

function parseScenarioCodes(value: string | undefined) {
  if (!value) return undefined
  const allowed = new Set<CriticalPathSyntheticPressureScenarioCode>(DEFAULT_SCENARIOS)
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item): item is CriticalPathSyntheticPressureScenarioCode =>
      allowed.has(item as CriticalPathSyntheticPressureScenarioCode),
    )
  return parsed.length > 0 ? Array.from(new Set(parsed)) : undefined
}

export function parseCriticalPathSyntheticPressureOptionsFromArgs(
  args: string[],
): Pick<CriticalPathSyntheticPressureOptions, 'scenarios' | 'outputFile' | 'dbEvidenceFile' | 'requireLiveEvidence' | 'diagnosticRunId'> {
  const scenarios = parseScenarioCodes(parseStringArg(args, 'scenarios'))
  const outputFile = parseStringArg(args, 'output-file')
  const dbEvidenceFile = parseStringArg(args, 'db-evidence-file')
  const requireLiveEvidence = parseBooleanFlag(args, 'require-live-evidence')
  const diagnosticRunId = parseStringArg(args, 'diagnostic-run-id')
  return {
    ...(scenarios ? { scenarios } : {}),
    ...(outputFile ? { outputFile } : {}),
    ...(dbEvidenceFile ? { dbEvidenceFile } : {}),
    ...(requireLiveEvidence ? { requireLiveEvidence } : {}),
    ...(diagnosticRunId ? { diagnosticRunId } : {}),
  }
}

function writeReportIfRequested(report: CriticalPathSyntheticPressureReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildCriticalPathSyntheticPressureReport(
    parseCriticalPathSyntheticPressureOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailCriticalPathSyntheticPressureReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('profile-critical-path-network.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
