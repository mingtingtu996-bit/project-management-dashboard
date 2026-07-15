export type MetricProductionSnapshotPublicationRollbackSurface =
  | 'metric_producer_contract'
  | 'snapshot_persistence'
  | 'dashboard_consumer_contract'
  | 'metric_publication_record'
  | 'metric_rollback_path'

export type MetricProductionSnapshotPublicationRollbackEvidence = {
  surface: MetricProductionSnapshotPublicationRollbackSurface | string
  status: 'verified' | 'not_applicable'
  evidenceRefs?: string[]
  reason?: string
}

export type MetricProductionSnapshotPublicationRollbackMatrixInput = {
  evidence: MetricProductionSnapshotPublicationRollbackEvidence[]
}

export type MetricProductionSnapshotPublicationRollbackMatrixRow = {
  surface: string
  status: 'confirmed' | 'incomplete'
  missingReasons: string[]
}

export type MetricProductionSnapshotPublicationRollbackMatrix = {
  status: 'metric_production_snapshot_publication_rollback_confirmed' | 'metric_production_snapshot_publication_rollback_incomplete'
  canDeclareMetricProductionSnapshotPublicationRollbackComplete: boolean
  requiredSurfaces: string[]
  rows: MetricProductionSnapshotPublicationRollbackMatrixRow[]
}

const REQUIRED_METRIC_PRODUCTION_SNAPSHOT_PUBLICATION_ROLLBACK_SURFACES = [
  'metric_producer_contract',
  'snapshot_persistence',
  'dashboard_consumer_contract',
  'metric_publication_record',
  'metric_rollback_path',
] as const

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEvidenceRef(evidence: MetricProductionSnapshotPublicationRollbackEvidence) {
  return (evidence.evidenceRefs ?? []).some(hasText)
}

function reasonsForSurface(
  surface: typeof REQUIRED_METRIC_PRODUCTION_SNAPSHOT_PUBLICATION_ROLLBACK_SURFACES[number],
  evidence: MetricProductionSnapshotPublicationRollbackEvidence | undefined,
) {
  if (!evidence) return [`${surface}_evidence_required`]

  const reasons: string[] = []
  if (evidence.status !== 'verified') reasons.push(`${surface}_verified_status_required`)
  if (!hasEvidenceRef(evidence)) reasons.push(`${surface}_evidence_ref_required`)
  if (evidence.status === 'not_applicable' && !hasText(evidence.reason)) {
    reasons.push(`${surface}_not_applicable_requires_reason`)
  }
  return reasons
}

function verified(
  surface: MetricProductionSnapshotPublicationRollbackSurface,
  evidenceRefs: string[],
): MetricProductionSnapshotPublicationRollbackEvidence {
  return {
    surface,
    status: 'verified',
    evidenceRefs,
  }
}

export function buildMetricProductionSnapshotPublicationRollbackMatrix(
  input: MetricProductionSnapshotPublicationRollbackMatrixInput,
): MetricProductionSnapshotPublicationRollbackMatrix {
  const rows = REQUIRED_METRIC_PRODUCTION_SNAPSHOT_PUBLICATION_ROLLBACK_SURFACES.map((surface) => {
    const missingReasons = reasonsForSurface(
      surface,
      input.evidence.find((evidence) => evidence.surface === surface),
    )
    return {
      surface,
      status: missingReasons.length > 0 ? 'incomplete' as const : 'confirmed' as const,
      missingReasons,
    }
  })
  const canDeclareMetricProductionSnapshotPublicationRollbackComplete = rows.every((row) => row.status === 'confirmed')

  return {
    status: canDeclareMetricProductionSnapshotPublicationRollbackComplete
      ? 'metric_production_snapshot_publication_rollback_confirmed'
      : 'metric_production_snapshot_publication_rollback_incomplete',
    canDeclareMetricProductionSnapshotPublicationRollbackComplete,
    requiredSurfaces: [...REQUIRED_METRIC_PRODUCTION_SNAPSHOT_PUBLICATION_ROLLBACK_SURFACES],
    rows,
  }
}

export function buildV14223MetricProductionSnapshotPublicationRollbackMatrix(): MetricProductionSnapshotPublicationRollbackMatrix {
  return buildMetricProductionSnapshotPublicationRollbackMatrix({
    evidence: [
      verified('metric_producer_contract', [
        'server/src/services/metricRegistryService.ts is the metric definition and producer contract registry',
      ]),
      verified('snapshot_persistence', [
        'server/src/services/projectDailySnapshotService.ts writes project_daily_snapshot and metric_value_snapshots from registered metrics',
        'server/src/__tests__/projectDailySnapshotService.test.ts',
      ]),
      verified('dashboard_consumer_contract', [
        'server/src/routes/dashboard.ts consumes shared summary/snapshot metric contracts instead of defining a separate metric caliber',
        'server/src/routes/reports.ts consumes project_daily_snapshot for trend metrics',
        'server/src/__tests__/reportsRoutes.test.ts',
        'server/src/__tests__/companySummaryRoutes.test.ts',
      ]),
      verified('metric_publication_record', [
        'server/src/services/metricRuntimePublicationService.ts persists metric runtime publication rows without mutating snapshots or project facts',
        'server/src/__tests__/metricRuntimePublicationService.test.ts',
        'server/migrations/204_v14223_metric_runtime_publications.sql',
      ]),
      verified('metric_rollback_path', [
        'server/src/services/metricRuntimePublicationService.ts marks scoped metric runtime publication rows runtime_rolled_back',
        'server/src/__tests__/metricRuntimePublicationService.test.ts',
        'server/migrations/204_v14223_metric_runtime_publications.sql',
      ]),
    ],
  })
}
