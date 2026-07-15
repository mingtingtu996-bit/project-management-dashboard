export type DurationAccuracyReplayScenario =
  | 'high_frequency_work'
  | 'long_tail_low_frequency'
  | 'new_company_cold_start'

export type DurationAccuracyReplayBasis =
  | 'seed_only'
  | 'company_blend'
  | 'cold_start_baseline'
  | 'residual_overlay'

export type DurationAccuracyReplayPredictionEventEvidence = {
  id?: string | null
  rollbackTarget?: string | null
  basisSnapshot?: Record<string, unknown> | null
  overlaySnapshot?: Record<string, unknown> | null
  parameterSnapshot?: Record<string, unknown> | null
}

export type DurationAccuracyReplayAcceptanceSample = {
  sampleId: string
  actualDurationDays: number
  seedOnlyDurationDays?: number | null
  companyBlendDurationDays?: number | null
  coldStartBaselineDurationDays?: number | null
  residualOverlayDurationDays?: number | null
  predictionEvent?: DurationAccuracyReplayPredictionEventEvidence | null
}

export type DurationAccuracyReplayAcceptanceDataset = {
  datasetKey: string
  scenario: DurationAccuracyReplayScenario
  acceptedSampleCount?: number | null
  samples: DurationAccuracyReplayAcceptanceSample[]
}

export type DurationAccuracyReplayVariantSummary = {
  basis: DurationAccuracyReplayBasis
  sampleCount: number
  coverage: number
  maeDays: number | null
  biasDays: number | null
  maeImprovementDays: number | null
  overcompensationRate: number | null
}

export type DurationAccuracyRollbackEvidence = {
  rollbackReady: boolean
  rollbackTargets: string[]
  missingReasons: string[]
}

export type DurationAccuracyReplayCanaryGate = {
  passed: boolean
  rollbackReady: boolean
  reasons: string[]
}

export type DurationAccuracyReplayDatasetReport = {
  datasetKey: string
  scenario: DurationAccuracyReplayScenario
  acceptedSampleCount: number
  variants: DurationAccuracyReplayVariantSummary[]
  rollbackEvidence: DurationAccuracyRollbackEvidence
  canaryGate: DurationAccuracyReplayCanaryGate
}

export type DurationAccuracyReplayAcceptanceReport = {
  datasetCount: number
  requiredScenarioCoverage: Record<DurationAccuracyReplayScenario, boolean>
  overallCanaryReady: boolean
  datasets: DurationAccuracyReplayDatasetReport[]
}

export type DurationAccuracyReplayAcceptanceInput = {
  datasets: DurationAccuracyReplayAcceptanceDataset[]
  minAcceptedSamplesForCanary?: number
  maxOvercompensationRate?: number
  minMaeImprovement?: number
}

const BASIS_ORDER: DurationAccuracyReplayBasis[] = [
  'seed_only',
  'company_blend',
  'cold_start_baseline',
  'residual_overlay',
]

function round(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function readPrediction(sample: DurationAccuracyReplayAcceptanceSample, basis: DurationAccuracyReplayBasis) {
  const value = basis === 'seed_only'
    ? sample.seedOnlyDurationDays
    : basis === 'company_blend'
      ? sample.companyBlendDurationDays
      : basis === 'cold_start_baseline'
        ? sample.coldStartBaselineDurationDays
        : sample.residualOverlayDurationDays
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readActual(sample: DurationAccuracyReplayAcceptanceSample) {
  const parsed = Number(sample.actualDurationDays)
  return Number.isFinite(parsed) ? parsed : null
}

function buildVariantSummary(
  dataset: DurationAccuracyReplayAcceptanceDataset,
  basis: DurationAccuracyReplayBasis,
  seedMae: number | null,
): DurationAccuracyReplayVariantSummary {
  const rows = dataset.samples
    .map((sample) => {
      const actual = readActual(sample)
      const prediction = readPrediction(sample, basis)
      const seedPrediction = readPrediction(sample, 'seed_only')
      if (actual === null || prediction === null) return null
      const absoluteError = Math.abs(prediction - actual)
      const seedAbsoluteError = seedPrediction === null ? null : Math.abs(seedPrediction - actual)
      return {
        signedError: actual - prediction,
        absoluteError,
        overcompensated: seedAbsoluteError === null ? null : absoluteError > seedAbsoluteError,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  const mae = average(rows.map((row) => row.absoluteError))
  const bias = average(rows.map((row) => row.signedError))
  const overcompensationRows = rows.filter((row) => row.overcompensated !== null)
  const overcompensationRate = basis === 'seed_only' || overcompensationRows.length === 0
    ? basis === 'seed_only' ? 0 : null
    : overcompensationRows.filter((row) => row.overcompensated).length / overcompensationRows.length

  return {
    basis,
    sampleCount: rows.length,
    coverage: round(dataset.samples.length === 0 ? 0 : rows.length / dataset.samples.length, 3) ?? 0,
    maeDays: round(mae),
    biasDays: round(bias),
    maeImprovementDays: basis === 'seed_only' || mae === null || seedMae === null ? null : round(seedMae - mae),
    overcompensationRate: round(overcompensationRate, 3),
  }
}

function hasRecord(value: unknown) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0)
}

function buildRollbackEvidence(dataset: DurationAccuracyReplayAcceptanceDataset): DurationAccuracyRollbackEvidence {
  const overlaySamples = dataset.samples.filter((sample) => readPrediction(sample, 'residual_overlay') !== null)
  const rollbackTargets = [...new Set(overlaySamples
    .map((sample) => String(sample.predictionEvent?.rollbackTarget ?? '').trim())
    .filter(Boolean))]
  const missingReasons = new Set<string>()

  if (overlaySamples.length === 0) {
    missingReasons.add('residual_overlay_predictions_missing')
  }
  if (overlaySamples.some((sample) => !String(sample.predictionEvent?.rollbackTarget ?? '').trim())) {
    missingReasons.add('rollback_target_missing')
  }
  if (overlaySamples.some((sample) => !hasRecord(sample.predictionEvent?.basisSnapshot))) {
    missingReasons.add('old_basis_snapshot_missing')
  }
  if (overlaySamples.some((sample) => !hasRecord(sample.predictionEvent?.overlaySnapshot))) {
    missingReasons.add('old_overlay_snapshot_missing')
  }
  if (overlaySamples.some((sample) => !hasRecord(sample.predictionEvent?.parameterSnapshot))) {
    missingReasons.add('old_parameter_snapshot_missing')
  }

  return {
    rollbackReady: missingReasons.size === 0,
    rollbackTargets,
    missingReasons: [...missingReasons].sort(),
  }
}

function buildCanaryGate(params: {
  dataset: DurationAccuracyReplayAcceptanceDataset
  variants: DurationAccuracyReplayVariantSummary[]
  rollbackEvidence: DurationAccuracyRollbackEvidence
  minAcceptedSamplesForCanary: number
  maxOvercompensationRate: number
  minMaeImprovement: number
}): DurationAccuracyReplayCanaryGate {
  const reasons: string[] = []
  const seedOnly = params.variants.find((item) => item.basis === 'seed_only')
  const residualOverlay = params.variants.find((item) => item.basis === 'residual_overlay')
  const acceptedSampleCount = Math.max(0, Math.trunc(Number(params.dataset.acceptedSampleCount ?? params.dataset.samples.length) || 0))

  if (acceptedSampleCount < params.minAcceptedSamplesForCanary) reasons.push('insufficient_accepted_samples')
  if (!residualOverlay || residualOverlay.sampleCount === 0) reasons.push('residual_overlay_missing')
  if ((residualOverlay?.maeImprovementDays ?? 0) <= params.minMaeImprovement) reasons.push('mae_not_improved')
  if (Math.abs(residualOverlay?.biasDays ?? 0) > Math.abs(seedOnly?.biasDays ?? 0)) reasons.push('bias_worse_than_seed_only')
  if ((residualOverlay?.overcompensationRate ?? 1) > params.maxOvercompensationRate) reasons.push('overcompensation_rate_exceeded')
  if ((residualOverlay?.coverage ?? 0) < (seedOnly?.coverage ?? 0)) reasons.push('coverage_declined')
  if (!params.rollbackEvidence.rollbackReady) reasons.push('rollback_evidence_missing')

  return {
    passed: reasons.length === 0,
    rollbackReady: params.rollbackEvidence.rollbackReady,
    reasons,
  }
}

function buildDatasetReport(
  dataset: DurationAccuracyReplayAcceptanceDataset,
  options: Required<Pick<DurationAccuracyReplayAcceptanceInput, 'minAcceptedSamplesForCanary' | 'maxOvercompensationRate' | 'minMaeImprovement'>>,
): DurationAccuracyReplayDatasetReport {
  const seedOnlyDraft = buildVariantSummary(dataset, 'seed_only', null)
  const seedMae = seedOnlyDraft.maeDays
  const variants = BASIS_ORDER.map((basis) => basis === 'seed_only'
    ? seedOnlyDraft
    : buildVariantSummary(dataset, basis, seedMae))
  const rollbackEvidence = buildRollbackEvidence(dataset)
  const canaryGate = buildCanaryGate({
    dataset,
    variants,
    rollbackEvidence,
    minAcceptedSamplesForCanary: options.minAcceptedSamplesForCanary,
    maxOvercompensationRate: options.maxOvercompensationRate,
    minMaeImprovement: options.minMaeImprovement,
  })

  return {
    datasetKey: dataset.datasetKey,
    scenario: dataset.scenario,
    acceptedSampleCount: Math.max(0, Math.trunc(Number(dataset.acceptedSampleCount ?? dataset.samples.length) || 0)),
    variants,
    rollbackEvidence,
    canaryGate,
  }
}

export function evaluateDurationAccuracyReplayAcceptance(
  input: DurationAccuracyReplayAcceptanceInput,
): DurationAccuracyReplayAcceptanceReport {
  const options = {
    minAcceptedSamplesForCanary: input.minAcceptedSamplesForCanary ?? 3,
    maxOvercompensationRate: input.maxOvercompensationRate ?? 0.2,
    minMaeImprovement: input.minMaeImprovement ?? 0,
  }
  const datasets = input.datasets.map((dataset) => buildDatasetReport(dataset, options))
  const requiredScenarioCoverage: Record<DurationAccuracyReplayScenario, boolean> = {
    high_frequency_work: datasets.some((dataset) => dataset.scenario === 'high_frequency_work'),
    long_tail_low_frequency: datasets.some((dataset) => dataset.scenario === 'long_tail_low_frequency'),
    new_company_cold_start: datasets.some((dataset) => dataset.scenario === 'new_company_cold_start'),
  }

  return {
    datasetCount: datasets.length,
    requiredScenarioCoverage,
    overallCanaryReady: Object.values(requiredScenarioCoverage).every(Boolean)
      && datasets.length > 0
      && datasets.every((dataset) => dataset.canaryGate.passed),
    datasets,
  }
}
