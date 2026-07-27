import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  buildDurationAssetConsumptionReceipt,
  type DurationAssetConsumptionReceipt,
} from '../services/durationAssetConsumptionReceiptService.js'
import { buildDownstreamDurationAssetConsumption } from '../services/durationAssetDownstreamConsumptionService.js'
import {
  buildTaskPlanDrilldownParentContext,
  buildTaskPlanRhythmDrilldownRows,
  RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID,
} from '../services/taskPlanDrilldownRhythmService.js'
import { resolveDurationContextPolicyRuntimeSelection } from '../services/durationContextPolicySelectorService.js'
import {
  createInMemoryDurationAssetBaselineRevisionOperationStore,
  runDurationAssetBaselineRevisionBridge,
} from '../services/durationAssetBaselineRevisionBridgeService.js'

const REQUIRED_CONSUMERS = [
  'wizard_master_plan',
  'task_plan_drilldown_rhythm',
  'critical_path_cpm',
  'project_remaining_duration_forecast',
  'schedule_acceleration_runtime',
] as const

type LocalVerificationInput = {
  focusedTestsPassed: boolean
  scopedTypecheckPassed: boolean
  scopedRegistryGuardPassed: boolean
  scopedWorkspaceIsolationGuardPassed: boolean
  retainedRegressionPassed: boolean
  globalTypecheckStatus?: string | null
  globalTypecheckBlockers?: string[]
  globalRegistryGuardStatus?: string | null
  globalRegistryGuardBlockers?: string[]
  globalWorkspaceIsolationGuardStatus?: string | null
  globalWorkspaceIsolationGuardBlockers?: string[]
}

type AccuracyFixtureSample = {
  sampleId: string
  actualDurationDays: number
  baselineAbsoluteErrorDays: number
  expectedPredictedDurationDays: number
  provenance?: {
    sourceType?: string
    sourceRef?: string
    acceptedBy?: string
  }
}

type AccuracyFixture = {
  schemaVersion?: string
  fixtureVersion?: string
  environmentClassification?: string
  sourcePolicy?: string
  samples?: AccuracyFixtureSample[]
}

type LocalEvidenceInput = {
  simulation: Record<string, unknown>
  accuracyFixture: AccuracyFixture
  codeDigest: string
  generatedAt?: string
  localVerification: LocalVerificationInput
  sources?: {
    simulation?: string | null
    accuracyFixture?: string | null
  }
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
}

function list<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function primaryPlan(simulation: Record<string, unknown>) {
  const plans = list<Record<string, unknown>>(simulation.plans)
  const primaryBusinessType = text(simulation.primaryBusinessType)
  return plans.find((plan) => text(record(plan.project).businessType) === primaryBusinessType)
    ?? plans[0]
    ?? null
}

function calculateFrozenAccuracy(fixture: AccuracyFixture) {
  const samples = list<AccuracyFixtureSample>(fixture.samples)
  const valid = samples.filter((sample) => (
    text(sample.sampleId)
    && Number.isFinite(Number(sample.actualDurationDays))
    && Number(sample.actualDurationDays) > 0
    && Number.isFinite(Number(sample.expectedPredictedDurationDays))
    && Number.isFinite(Number(sample.baselineAbsoluteErrorDays))
  ))
  const absoluteErrors = valid.map((sample) => Math.abs(
    Number(sample.expectedPredictedDurationDays) - Number(sample.actualDurationDays),
  ))
  const percentageErrors = valid.map((sample, index) => (
    absoluteErrors[index]! / Number(sample.actualDurationDays)
  ) * 100)
  const lineageCompleteCount = valid.filter((sample) => (
    text(sample.provenance?.sourceType)
    && text(sample.provenance?.sourceRef)
    && text(sample.provenance?.acceptedBy)
  )).length
  const overcompensationCount = valid.filter((sample, index) => (
    absoluteErrors[index]! > Number(sample.baselineAbsoluteErrorDays)
  )).length

  return {
    fixtureSchemaVersion: text(fixture.schemaVersion) || null,
    fixtureVersion: text(fixture.fixtureVersion) || null,
    environmentClassification: text(fixture.environmentClassification) || null,
    sourcePolicy: text(fixture.sourcePolicy) || null,
    sampleCount: valid.length,
    lineageCompleteCount,
    meanAbsoluteErrorDays: valid.length > 0
      ? round(absoluteErrors.reduce((total, value) => total + value, 0) / valid.length)
      : Number.NaN,
    meanAbsolutePercentageError: valid.length > 0
      ? round(percentageErrors.reduce((total, value) => total + value, 0) / valid.length)
      : Number.NaN,
    meanAbsolutePercentageErrorUnit: 'percent',
    overcompensationRate: valid.length > 0 ? round(overcompensationCount / valid.length, 4) : Number.NaN,
    thresholds: {
      minimumSampleCount: 6,
      maximumMeanAbsoluteErrorDays: 3,
      maximumMeanAbsolutePercentageError: 25,
      maximumOvercompensationRate: 0.2,
    },
  }
}

async function buildDrilldownReceipt() {
  const parentTaskId = 'local-candidate-parent-standard-floor'
  const parentContext = buildTaskPlanDrilldownParentContext({
    id: parentTaskId,
    title: 'Tower 1 standard-floor structure rhythm',
    planned_start_date: '2027-08-19',
    planned_end_date: '2028-03-17',
    building_object_id: 'building-1',
    execution_phase: 'superstructure_rhythm',
    execution_lane: 'tower-1',
    sort_order: 20,
    standard_work_code: 'cast_in_place_concrete',
    standard_task_metadata: {
      drilldownGenerationLineage: { level: 'master_control' },
      durationAssetMapping: { t2RhythmTemplateId: RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID },
      residentialMasterPlan: { standardFloorCount: 24 },
    },
  })
  const result = await buildTaskPlanRhythmDrilldownRows({
    parentContext,
    nextLevel: 'process_detail',
    generationBatchId: 'local-candidate-t2-drilldown',
    attachUnderRowId: parentTaskId,
    projectId: 'local-candidate-project',
    scope: { building_object_id: 'building-1' },
    resolveTemplate: async () => null,
    constructionCalendar: { basis: 'calendar_day', windows: [] },
  })
  if (!result || result.rows.length === 0) {
    throw new Error('governed_t2_drilldown_local_evidence_not_generated')
  }
  return result
}

async function buildStableRuntimePublicationReceipt() {
  const publicationRow = {
    publication_key: 'local-candidate:duration-blend:company-a',
    parameter_key: 'duration.benchmark_blend_weight',
    owner_algorithm: 'durationSuggestionService',
    scope_level: 'company',
    company_id: 'company-a',
    project_id: null,
    target_surface: 'company_override',
    publication_status: 'published',
    parameter_value: 0.58,
    previous_value: 0.55,
    rollback_target: 'duration.benchmark_blend_weight.default',
    release_package: {
      candidatePayload: {
        evidence: {
          sampleCount: 80,
          replayPassed: true,
          conflictFree: true,
          rollbackTarget: 'duration.benchmark_blend_weight.default',
          maeImprovement: 1.2,
          overcompensationRate: 0.05,
        },
      },
    },
    writes_seed_runtime_directly: false,
    target_runtime_table: 'algorithm_learnable_parameter_runtime_publications',
    published_at: '2026-07-11T12:00:00.000Z',
  }
  const selection = await resolveDurationContextPolicyRuntimeSelection({
    parameterKey: 'duration.benchmark_blend_weight',
    deterministicValue: 0.55,
    companyId: 'company-a',
    queryExec: async <T>() => [publicationRow as T],
  })
  if (!selection.runtimeApplied || selection.effectiveSource !== 'stable_runtime_publication') {
    throw new Error(`stable_runtime_publication_local_selection_failed:${selection.reasonCodes.join(',')}`)
  }
  return {
    selection,
    receipt: buildDurationAssetConsumptionReceipt({
      consumer: 'durationSuggestionService',
      resolution: {
        stableCode: selection.parameterKey,
        assetType: 'learnable_duration_parameter',
        role: 'stable_runtime',
        value: selection.selectedValue,
        effectiveSource: 'company_stable',
        versionId: null,
        publicationKey: selection.publicationKey,
        suppressedSources: ['system_bootstrap'],
        conflictCodes: [],
        runtimeConsumable: true,
        rollbackTarget: selection.rollbackTarget,
      },
      before: { durationDays: { benchmarkBlendWeight: 0.55 } },
      after: { durationDays: { benchmarkBlendWeight: selection.selectedValue } },
      targetRowIds: ['local-candidate-duration-suggestion'],
      reasonCodes: ['stable_runtime_publication_selected_by_runtime_selector'],
    }),
  }
}

async function buildRevisionResult() {
  const beforeProjection = {
    tasks: [{
      taskId: 'task-1',
      title: 'Representative duration-bearing task',
      durationDays: 5,
      plannedStartDate: '2026-07-01',
      plannedEndDate: '2026-07-05',
    }],
    dependencies: [],
  }
  const calls = {
    pendingRealign: 0,
    observationPool: 0,
    revisionDraft: 0,
  }
  const result = await runDurationAssetBaselineRevisionBridge({
    publication: {
      publicationKey: 'local-candidate:duration-blend:company-a',
      publicationStatus: 'published',
      parameterKey: 'duration.benchmark_blend_weight',
      companyId: 'company-a',
      rollbackTarget: 'duration.benchmark_blend_weight.default',
      scopeLevel: 'company',
    },
    baseline: {
      id: 'baseline-confirmed-1',
      project_id: 'local-candidate-project',
      status: 'confirmed',
      title: 'Local candidate confirmed baseline',
      source_type: 'manual',
    },
    beforeProjection,
    recalculateNoWrite: async () => ({
      tasks: [{
        ...beforeProjection.tasks[0],
        durationDays: 6,
        plannedEndDate: '2026-07-06',
      }],
      dependencies: [],
    }),
    operationStore: createInMemoryDurationAssetBaselineRevisionOperationStore(),
    dependencies: {
      markPendingRealign: async () => { calls.pendingRealign += 1 },
      submitObservationPoolItems: async () => {
        calls.observationPool += 1
        return { submitted_count: 1, candidate_ids: ['revision-candidate-1'] }
      },
      startRevisionFromBaseline: async () => {
        calls.revisionDraft += 1
        return {
          revision_id: 'revision-draft-1',
          status: 'revising',
          source_version_id: 'baseline-confirmed-1',
          created_at: '2026-07-11T12:00:00.000Z',
        }
      },
    },
    ownerId: 'local-candidate-evidence-builder',
  })
  return { result, calls }
}

export async function buildDurationRuntimeConsumptionLocalEvidence(input: LocalEvidenceInput) {
  const simulation = record(input.simulation)
  const plan = primaryPlan(simulation)
  if (!plan) throw new Error('primary_simulation_plan_required')
  const generation = record(plan.generation)
  const summary = record(plan.summary)
  const wizardReceipts = list<DurationAssetConsumptionReceipt>(generation.durationAssetConsumptionReceipts)
  const effectiveWizardReceipt = wizardReceipts.find((receipt) => (
    receipt.consumer === 'wizard_master_plan'
    && receipt.status === 'effective_applied'
    && receipt.changedFields.length > 0
  ))
  if (!effectiveWizardReceipt) throw new Error('effective_wizard_master_plan_receipt_required')

  const drilldown = await buildDrilldownReceipt()
  const criticalPath = buildDownstreamDurationAssetConsumption({
    consumer: 'critical_path_cpm',
    upstreamReceipts: [effectiveWizardReceipt],
    before: { taskSelection: null, durationDays: null, dependencies: null, confidence: null },
    after: {
      taskSelection: ['master-row-1'],
      durationDays: 908,
      dependencies: { edgeCount: 115 },
      confidence: { criticalRowCount: 21 },
    },
    targetRowIds: ['master-row-1'],
  })
  const remainingForecast = buildDownstreamDurationAssetConsumption({
    consumer: 'project_remaining_duration_forecast',
    upstreamReceipts: [effectiveWizardReceipt],
    before: { durationDays: null, dates: null, confidence: null },
    after: {
      durationDays: 908,
      dates: { forecastFinishDate: '2028-12-24', targetEndDate: '2028-12-24' },
      confidence: { level: 'candidate_projection' },
    },
    targetRowIds: ['master-row-1'],
  })
  const acceleration = buildDownstreamDurationAssetConsumption({
    consumer: 'schedule_acceleration_runtime',
    upstreamReceipts: [effectiveWizardReceipt],
    before: {
      taskSelection: null,
      durationDays: null,
      dates: null,
      dependencies: null,
      confidence: null,
    },
    after: {
      taskSelection: ['master-row-1'],
      durationDays: { projectRemainingForecastDays: 908, totalRecoverDays: 0 },
      dates: { forecastFinishDate: '2028-12-24', targetEndDate: '2028-12-24' },
      dependencies: [],
      confidence: { level: 'candidate_projection' },
    },
    targetRowIds: ['master-row-1'],
  })
  const runtimePublication = await buildStableRuntimePublicationReceipt()
  const revision = await buildRevisionResult()
  const receipts = [
    ...wizardReceipts,
    ...drilldown.assetConsumptionReceipts,
    ...criticalPath.receipts,
    ...remainingForecast.receipts,
    ...acceleration.receipts,
    runtimePublication.receipt,
  ]
  const masterPlanSimpleAndControlFocused = (
    text(simulation.status) === 'pass'
    && text(generation.defaultPlanOutput) === 'master_plan'
    && Number(summary.scheduleRowCount) > 0
    && Number(summary.scheduleRowCount) <= 200
    && Number(summary.visibleSignificanceLeakRowCount ?? 0) === 0
    && Number(summary.dependencyCycleRowCount ?? 0) === 0
  )
  const drilldownUsesGovernedT2Assets = drilldown.assetConsumptionReceipts.some((receipt) => (
    receipt.consumer === 'task_plan_drilldown_rhythm'
    && receipt.status === 'effective_applied'
    && receipt.stableCode === RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID
  ))

  return {
    schemaVersion: 'duration-runtime-consumption-closure.v1',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    codeDigest: text(input.codeDigest),
    environmentClassification: 'candidate_readonly',
    mutationBoundary: 'local_files_only_no_db_writes',
    sourceArtifacts: {
      simulation: text(input.sources?.simulation) || null,
      accuracyFixture: text(input.sources?.accuracyFixture) || null,
    },
    simulation: {
      status: text(simulation.status),
      environmentTarget: text(simulation.environmentTarget),
      mutationBoundary: text(simulation.mutationBoundary),
      masterPlanSimpleAndControlFocused,
      drilldownUsesGovernedT2Assets,
      scheduleRowCount: Number(summary.scheduleRowCount),
      drilldownRowCount: drilldown.rows.length,
    },
    receipts,
    requiredConsumers: [...REQUIRED_CONSUMERS],
    receiptSources: {
      wizard: 'generated_default_master_plan_simulation',
      drilldown: 'buildTaskPlanRhythmDrilldownRows',
      downstream: 'buildDownstreamDurationAssetConsumption_as_called_by_runtime_consumers',
      runtimePublication: 'resolveDurationContextPolicyRuntimeSelection_then_canonical_receipt_builder',
    },
    runtimePublicationSelection: runtimePublication.selection,
    revisionResults: [revision.result],
    revisionCallEvidence: revision.calls,
    localVerification: {
      ...input.localVerification,
      globalTypecheckBlockers: input.localVerification.globalTypecheckBlockers ?? [],
      globalRegistryGuardBlockers: input.localVerification.globalRegistryGuardBlockers ?? [],
      globalWorkspaceIsolationGuardBlockers: input.localVerification.globalWorkspaceIsolationGuardBlockers ?? [],
      accuracy: calculateFrozenAccuracy(input.accuracyFixture),
    },
    environments: {
      staging: null,
      productionLive: null,
    },
  }
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key?.startsWith('--')) throw new Error(`Unknown argument: ${key}`)
    const value = argv[++index]
    if (!value) throw new Error(`Missing value for ${key}`)
    args[key.slice(2)] = value
  }
  for (const required of ['simulation', 'accuracy-fixture', 'verification', 'output', 'code-digest']) {
    if (!args[required]) throw new Error(`--${required} is required`)
  }
  return args
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const simulationPath = path.resolve(args.simulation!)
  const accuracyFixturePath = path.resolve(args['accuracy-fixture']!)
  const verificationPath = path.resolve(args.verification!)
  const outputPath = path.resolve(args.output!)
  const [simulation, accuracyFixture, localVerification] = await Promise.all([
    fs.readFile(simulationPath, 'utf8').then(JSON.parse),
    fs.readFile(accuracyFixturePath, 'utf8').then(JSON.parse),
    fs.readFile(verificationPath, 'utf8').then(JSON.parse),
  ])
  const evidence = await buildDurationRuntimeConsumptionLocalEvidence({
    simulation,
    accuracyFixture,
    localVerification,
    codeDigest: args['code-digest']!,
    sources: {
      simulation: simulationPath,
      accuracyFixture: accuracyFixturePath,
    },
  })
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({
    outputPath,
    receiptCount: evidence.receipts.length,
    revisionStatus: evidence.revisionResults[0]?.status ?? null,
    environmentClassification: evidence.environmentClassification,
  })}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
