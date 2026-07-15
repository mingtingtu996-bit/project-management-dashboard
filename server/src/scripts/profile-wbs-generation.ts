import { performance } from 'node:perf_hooks'
import { readFileSync } from 'node:fs'
import { readJsonFile, writeJsonFile } from './jsonEvidenceUtils.js'

export type WbsGenerationPressureScenarioCode = 'single_batch_501' | 'scope_200x200'
type WbsGenerationPressureStatus = 'pass' | 'fail'

type WbsGenerationPressureOperation = {
  projectId: string
  surface: 'task_list'
  operation: {
    type: 'template_generate'
    generationBatchId: string
    templateId: string
    selectedNodeIds: string[]
    plannedStartDate: string
    scope: {
      buildings?: string[]
      floors?: string[]
    }
  }
}

export type WbsGenerationPressureGenerator = (
  operation: WbsGenerationPressureOperation,
) => Promise<unknown>

export type WbsGenerationSyntheticPressureScenario = {
  scenarioCode: WbsGenerationPressureScenarioCode
  status: WbsGenerationPressureStatus
  expectedGeneratedMainPlanRowCount: number
  generatedMainPlanRowCount: number | null
  rowLimit: number | null
  httpStatusCode: number | null
  errorCode: string | null
  preflightStage: string | null
  materializedRows: number
  elapsedMs: number
  elapsedBudgetMs: number
  withinElapsedBudget: boolean
  fuseResponseShape: {
    hasExpectedHttpStatus: boolean
    hasExpectedErrorCode: boolean
    hasRowLimit: boolean
    hasPreflightStage: boolean
    generationBatchCount: number
    rowLimitExceededBatchCount: number
  }
  reason?: string
}

export type WbsGenerationRouteEvidenceScenario = {
  scenarioCode: WbsGenerationPressureScenarioCode
  diagnosticRunId?: string | null
  routeInvocationId?: string | null
  requestId?: string | null
  method?: string | null
  routePath?: string | null
  buildingCount?: number | null
  floorCount?: number | null
  httpStatusCode: number
  errorCode: string
  generatedMainPlanRowCount: number
  rowLimit: number
  materializedRows: number
  p95Ms: number
  elapsedBudgetMs: number
  memoryObserved?: boolean
  connectionPoolObserved?: boolean
  timeoutBudgetObserved?: boolean
  userVisibleFuseResponseObserved?: boolean
  rowLimitConfigurationObserved?: boolean
}

export type WbsGenerationRouteEvidenceAssessmentScenario = WbsGenerationRouteEvidenceScenario & {
  status: WbsGenerationPressureStatus
  runtimeEvidenceGap: {
    missingMemoryObservation: boolean
    missingConnectionPoolObservation: boolean
    missingTimeoutBudgetEvidence: boolean
    missingUserVisibleFuseResponse: boolean
    missingRowLimitConfigurationEvidence: boolean
    missingProductionLikeP95: boolean
    missingTimingSanityEvidence: boolean
    missingRouteInvocationEvidence: boolean
    missingScopeCardinalityEvidence: boolean
    missingRouteCorrelationEvidence: boolean
  }
}

export type WbsGenerationRouteEvidenceAssessment = {
  evidenceFile: string | null
  environment: string | null
  evidenceRef: string | null
  diagnosticRunId: string | null
  expectedDiagnosticRunId: string | null
  diagnosticRunIdMatches: boolean
  missingEvidenceMetadata: boolean
  nonLiveEvidenceMetadata: boolean
  status: WbsGenerationPressureStatus
  requiredScenarioCodes: WbsGenerationPressureScenarioCode[]
  missingScenarioCodes: WbsGenerationPressureScenarioCode[]
  scenarios: WbsGenerationRouteEvidenceAssessmentScenario[]
}

export type WbsGenerationSyntheticPressureReport = {
  reportCode: 'c18_l10_wbs_generation_synthetic_pressure'
  evidenceKind: 'synthetic_local_row_fuse'
  generatedAt: string
  diagnosticRunId: string
  outputFile: string | null
  missingArchivedJson: boolean
  routeEvidenceFile: string | null
  routeEvidenceAssessment: WbsGenerationRouteEvidenceAssessment | null
  liveEvidenceRequired: true
  requireLiveEvidence: boolean
  liveEvidenceRequiredReason: string
  scenarios: WbsGenerationSyntheticPressureScenario[]
}

export type WbsGenerationSyntheticPressureOptions = {
  now?: Date
  scenarios?: WbsGenerationPressureScenarioCode[]
  generator?: WbsGenerationPressureGenerator
  elapsedBudgetMs?: number
  outputFile?: string | null
  routeEvidenceFile?: string | null
  routeEvidence?: unknown
  requireLiveEvidence?: boolean
  diagnosticRunId?: string | null
}

const DEFAULT_SCENARIOS: WbsGenerationPressureScenarioCode[] = [
  'single_batch_501',
  'scope_200x200',
]
const CANONICAL_WBS_GENERATE_PREVIEW_ROUTE = '/api/planning/wbs-templates/generate-preview'

function readServerRowLimit() {
  const parsed = Number(process.env.WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT)
  return Math.max(1, Number.isFinite(parsed) ? Math.floor(parsed) : 500)
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function makeBuildings(count: number) {
  return Array.from({ length: count }, (_, index) => `building-${index + 1}`)
}

function makeFloors(count: number) {
  return Array.from({ length: count }, (_, index) => `floor-${index + 1}`)
}

function buildScenarioOperation(
  scenarioCode: WbsGenerationPressureScenarioCode,
): { expectedGeneratedMainPlanRowCount: number; operation: WbsGenerationPressureOperation } {
  const buildings = scenarioCode === 'single_batch_501' ? makeBuildings(501) : makeBuildings(200)
  const floors = scenarioCode === 'scope_200x200' ? makeFloors(200) : undefined
  const expectedGeneratedMainPlanRowCount = scenarioCode === 'single_batch_501'
    ? 501
    : 40_000

  return {
    expectedGeneratedMainPlanRowCount,
    operation: {
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: `c18-l10-${scenarioCode}`,
        templateId: 'china-building-site-management',
        selectedNodeIds: ['SITE-01-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          buildings,
          ...(floors ? { floors } : {}),
        },
      },
    },
  }
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const value = (error as { code?: unknown }).code
  return typeof value === 'string' ? value : null
}

function readErrorStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const value = (error as { statusCode?: unknown }).statusCode
  return typeof value === 'number' ? value : null
}

function readErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') return {}
  const details = (error as { details?: unknown }).details
  return details && typeof details === 'object' ? details as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
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
  return `c18-l10-${now.toISOString().replace(/[:.]/g, '-')}`
}

function readMaterializedRows(result: unknown) {
  if (!result || typeof result !== 'object') return 0
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? rows.length : 0
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(value: unknown) {
  return value === true
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

function normalizeRouteEvidenceScenarios(value: unknown): WbsGenerationRouteEvidenceScenario[] {
  const source = (() => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      return Array.isArray(record.scenarios) ? record.scenarios : []
    }
    return []
  })()

  const allowed = new Set<WbsGenerationPressureScenarioCode>(DEFAULT_SCENARIOS)
  return source.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const scenarioCode = readString(record.scenarioCode)
    if (!scenarioCode || !allowed.has(scenarioCode as WbsGenerationPressureScenarioCode)) return []
    const httpStatusCode = readNumber(record.httpStatusCode)
    const errorCode = readString(record.errorCode)
    const generatedMainPlanRowCount = readNumber(record.generatedMainPlanRowCount)
    const rowLimit = readNumber(record.rowLimit)
    const materializedRows = readNumber(record.materializedRows)
    const p95Ms = readNumber(record.p95Ms)
    const elapsedBudgetMs = readNumber(record.elapsedBudgetMs)
    if (
      httpStatusCode === null ||
      errorCode === null ||
      generatedMainPlanRowCount === null ||
      rowLimit === null ||
      materializedRows === null ||
      p95Ms === null ||
      elapsedBudgetMs === null
    ) return []
    return [{
      scenarioCode: scenarioCode as WbsGenerationPressureScenarioCode,
      diagnosticRunId: readString(record.diagnosticRunId ?? record.diagnostic_run_id),
      routeInvocationId: readString(record.routeInvocationId ?? record.route_invocation_id),
      requestId: readString(record.requestId ?? record.request_id),
      method: readString(record.method),
      routePath: readString(record.routePath ?? record.route_path ?? record.path ?? record.url),
      buildingCount: readNumber(record.buildingCount ?? record.building_count),
      floorCount: readNumber(record.floorCount ?? record.floor_count),
      httpStatusCode,
      errorCode,
      generatedMainPlanRowCount,
      rowLimit,
      materializedRows,
      p95Ms,
      elapsedBudgetMs,
      memoryObserved: readBoolean(record.memoryObserved),
      connectionPoolObserved: readBoolean(record.connectionPoolObserved),
      timeoutBudgetObserved: readBoolean(record.timeoutBudgetObserved),
      userVisibleFuseResponseObserved: readBoolean(record.userVisibleFuseResponseObserved),
      rowLimitConfigurationObserved: readBoolean(record.rowLimitConfigurationObserved),
    }]
  })
}

function normalizeRouteEvidence(value: unknown): {
  environment: string | null
  evidenceRef: string | null
  diagnosticRunId: string | null
  scenarios: WbsGenerationRouteEvidenceScenario[]
} {
  return {
    ...readEvidenceMetadata(value),
    scenarios: normalizeRouteEvidenceScenarios(value),
  }
}

function loadRouteEvidence(options: WbsGenerationSyntheticPressureOptions) {
  if (options.routeEvidence !== undefined) {
    return normalizeRouteEvidence(options.routeEvidence)
  }
  const routeEvidenceFile = readString(options.routeEvidenceFile)
  if (!routeEvidenceFile) {
    return { environment: null, evidenceRef: null, diagnosticRunId: null, scenarios: [] }
  }
  return normalizeRouteEvidence(readJsonFile(routeEvidenceFile))
}

function assessRouteEvidence(params: {
  scenarios: WbsGenerationRouteEvidenceScenario[]
  environment: string | null
  evidenceRef: string | null
  diagnosticRunId: string | null
  expectedDiagnosticRunId: string
  evidenceFile: string | null
  requiredScenarioCodes: WbsGenerationPressureScenarioCode[]
}): WbsGenerationRouteEvidenceAssessment | null {
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
  const scenarios = params.requiredScenarioCodes.flatMap((scenarioCode): WbsGenerationRouteEvidenceAssessmentScenario[] => {
    const scenario = scenarioByCode.get(scenarioCode)
    if (!scenario) return []
    const runtimeEvidenceGap = {
      missingMemoryObservation: scenario.memoryObserved !== true,
      missingConnectionPoolObservation: scenario.connectionPoolObserved !== true,
      missingTimeoutBudgetEvidence: scenario.timeoutBudgetObserved !== true,
      missingUserVisibleFuseResponse: scenario.userVisibleFuseResponseObserved !== true ||
        scenario.httpStatusCode !== 413 ||
        scenario.errorCode !== 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED' ||
        scenario.materializedRows !== 0,
      missingRowLimitConfigurationEvidence: scenario.rowLimitConfigurationObserved !== true ||
        scenario.rowLimit <= 0 ||
        scenario.generatedMainPlanRowCount <= scenario.rowLimit,
      missingProductionLikeP95: scenario.p95Ms > scenario.elapsedBudgetMs,
      missingTimingSanityEvidence: scenario.p95Ms < 0 || scenario.elapsedBudgetMs <= 0,
      missingRouteInvocationEvidence: String(scenario.method ?? '').toUpperCase() !== 'POST' ||
        scenario.routePath !== CANONICAL_WBS_GENERATE_PREVIEW_ROUTE,
      missingScopeCardinalityEvidence: scenario.scenarioCode === 'scope_200x200'
        ? scenario.buildingCount !== 200 ||
          scenario.floorCount !== 200 ||
          scenario.buildingCount * scenario.floorCount !== scenario.generatedMainPlanRowCount
        : false,
      missingRouteCorrelationEvidence: !params.expectedDiagnosticRunId ||
        !diagnosticRunIdMatches ||
        scenario.diagnosticRunId !== params.expectedDiagnosticRunId ||
        !scenario.routeInvocationId ||
        !scenario.requestId,
    }
    const status: WbsGenerationPressureStatus = Object.values(runtimeEvidenceGap).some(Boolean) ? 'fail' : 'pass'
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

function readGenerationBatches(details: Record<string, unknown>) {
  const batches = details.generationBatches
  return Array.isArray(batches) ? batches.filter((batch) => batch && typeof batch === 'object') : []
}

function makeFuseResponseShape(params: {
  httpStatusCode: number | null
  errorCode: string | null
  rowLimit: number | null
  preflightStage: string | null
  generationBatches: object[]
}) {
  return {
    hasExpectedHttpStatus: params.httpStatusCode === 413,
    hasExpectedErrorCode: params.errorCode === 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
    hasRowLimit: typeof params.rowLimit === 'number',
    hasPreflightStage: typeof params.preflightStage === 'string',
    generationBatchCount: params.generationBatches.length,
    rowLimitExceededBatchCount: params.generationBatches.filter((batch) =>
      (batch as { rowLimitExceeded?: unknown }).rowLimitExceeded === true,
    ).length,
  }
}

const EMPTY_FUSE_RESPONSE_SHAPE = {
  hasExpectedHttpStatus: false,
  hasExpectedErrorCode: false,
  hasRowLimit: false,
  hasPreflightStage: false,
  generationBatchCount: 0,
  rowLimitExceededBatchCount: 0,
}

async function measureScenario(
  scenarioCode: WbsGenerationPressureScenarioCode,
  generator: WbsGenerationPressureGenerator,
  elapsedBudgetMs: number,
): Promise<WbsGenerationSyntheticPressureScenario> {
  const { expectedGeneratedMainPlanRowCount, operation } = buildScenarioOperation(scenarioCode)
  const startedAt = performance.now()

  try {
    const result = await generator(operation)
    const materializedRows = readMaterializedRows(result)
    return {
      scenarioCode,
      status: 'fail',
      expectedGeneratedMainPlanRowCount,
      generatedMainPlanRowCount: null,
      rowLimit: null,
      httpStatusCode: null,
      errorCode: null,
      preflightStage: null,
      materializedRows,
      elapsedMs: roundMs(performance.now() - startedAt),
      elapsedBudgetMs,
      withinElapsedBudget: false,
      fuseResponseShape: EMPTY_FUSE_RESPONSE_SHAPE,
      reason: `Expected row fuse WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED before materializing ${expectedGeneratedMainPlanRowCount} rows.`,
    }
  } catch (error) {
    const details = readErrorDetails(error)
    const httpStatusCode = readErrorStatusCode(error)
    const errorCode = readErrorCode(error)
    const generatedMainPlanRowCount = readNumber(details.generatedMainPlanRowCount)
    const rowLimit = readNumber(details.rowLimit)
    const preflightStage = readString(details.preflightStage)
    const generationBatches = readGenerationBatches(details)
    const elapsedMs = roundMs(performance.now() - startedAt)
    const withinElapsedBudget = elapsedMs <= elapsedBudgetMs
    const fuseResponseShape = makeFuseResponseShape({
      httpStatusCode,
      errorCode,
      rowLimit,
      preflightStage,
      generationBatches,
    })
    const isExpectedFuse = fuseResponseShape.hasExpectedHttpStatus &&
      fuseResponseShape.hasExpectedErrorCode &&
      fuseResponseShape.hasRowLimit &&
      fuseResponseShape.hasPreflightStage &&
      fuseResponseShape.generationBatchCount > 0 &&
      fuseResponseShape.rowLimitExceededBatchCount === fuseResponseShape.generationBatchCount &&
      generatedMainPlanRowCount === expectedGeneratedMainPlanRowCount &&
      withinElapsedBudget

    return {
      scenarioCode,
      status: isExpectedFuse ? 'pass' : 'fail',
      expectedGeneratedMainPlanRowCount,
      generatedMainPlanRowCount,
      rowLimit,
      httpStatusCode,
      errorCode,
      preflightStage,
      materializedRows: 0,
      elapsedMs,
      elapsedBudgetMs,
      withinElapsedBudget,
      fuseResponseShape,
      ...(isExpectedFuse
        ? {}
        : { reason: `Unexpected WBS generation error: ${error instanceof Error ? error.message : String(error)}` }),
    }
  }
}

export async function buildWbsGenerationSyntheticPressureReport(
  options: WbsGenerationSyntheticPressureOptions = {},
): Promise<WbsGenerationSyntheticPressureReport> {
  const now = options.now ?? new Date()
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const generator = options.generator ?? await loadDefaultWbsGenerationPressureGenerator()
  const scenarios = options.scenarios ?? DEFAULT_SCENARIOS
  const elapsedBudgetMs = Math.max(1, Math.trunc(options.elapsedBudgetMs ?? 1000))
  const routeEvidenceFile = options.routeEvidenceFile ?? null
  const routeEvidence = loadRouteEvidence(options)
  const routeEvidenceAssessment = assessRouteEvidence({
    scenarios: routeEvidence.scenarios,
    environment: routeEvidence.environment,
    evidenceRef: routeEvidence.evidenceRef,
    diagnosticRunId: routeEvidence.diagnosticRunId,
    expectedDiagnosticRunId: diagnosticRunId,
    evidenceFile: routeEvidenceFile,
    requiredScenarioCodes: scenarios,
  })

  return {
    reportCode: 'c18_l10_wbs_generation_synthetic_pressure',
    evidenceKind: 'synthetic_local_row_fuse',
    generatedAt: now.toISOString(),
    diagnosticRunId,
    outputFile: options.outputFile ?? null,
    missingArchivedJson: !options.outputFile,
    routeEvidenceFile,
    routeEvidenceAssessment,
    liveEvidenceRequired: true,
    requireLiveEvidence: options.requireLiveEvidence === true,
    liveEvidenceRequiredReason: `Synthetic local row-fuse evidence uses server row limit ${readServerRowLimit()} and local elapsed budget ${elapsedBudgetMs}ms; C-18.L10 still requires real environment timing, memory, DB connection, and user-facing fuse-response evidence.`,
    scenarios: await Promise.all(scenarios.map((scenarioCode) =>
      measureScenario(scenarioCode, generator, elapsedBudgetMs),
    )),
  }
}

async function loadDefaultWbsGenerationPressureGenerator(): Promise<WbsGenerationPressureGenerator> {
  const service = await import('../services/wbsTemplateGenerationService.js')
  return service.generateWbsTemplateRows as WbsGenerationPressureGenerator
}

export function shouldFailWbsGenerationSyntheticPressureReport(
  report: WbsGenerationSyntheticPressureReport,
) {
  return report.scenarios.some((scenario) => scenario.status === 'fail') ||
    report.routeEvidenceAssessment?.status === 'fail' ||
    (report.requireLiveEvidence && (
      report.routeEvidenceAssessment?.status !== 'pass' ||
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
  const allowed = new Set<WbsGenerationPressureScenarioCode>(DEFAULT_SCENARIOS)
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item): item is WbsGenerationPressureScenarioCode =>
      allowed.has(item as WbsGenerationPressureScenarioCode),
    )
  return parsed.length > 0 ? Array.from(new Set(parsed)) : undefined
}

export function parseWbsGenerationPressureOptionsFromArgs(
  args: string[],
): Pick<WbsGenerationSyntheticPressureOptions, 'scenarios' | 'outputFile' | 'routeEvidenceFile' | 'requireLiveEvidence' | 'diagnosticRunId'> {
  const scenarios = parseScenarioCodes(parseStringArg(args, 'scenarios'))
  const outputFile = parseStringArg(args, 'output-file')
  const routeEvidenceFile = parseStringArg(args, 'route-evidence-file')
  const requireLiveEvidence = parseBooleanFlag(args, 'require-live-evidence')
  const diagnosticRunId = parseStringArg(args, 'diagnostic-run-id')
  return {
    ...(scenarios ? { scenarios } : {}),
    ...(outputFile ? { outputFile } : {}),
    ...(routeEvidenceFile ? { routeEvidenceFile } : {}),
    ...(requireLiveEvidence ? { requireLiveEvidence } : {}),
    ...(diagnosticRunId ? { diagnosticRunId } : {}),
  }
}

function writeReportIfRequested(report: WbsGenerationSyntheticPressureReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildWbsGenerationSyntheticPressureReport(
    parseWbsGenerationPressureOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailWbsGenerationSyntheticPressureReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('profile-wbs-generation.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
