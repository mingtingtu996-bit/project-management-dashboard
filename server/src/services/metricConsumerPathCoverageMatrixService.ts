export type MetricConsumerPath =
  | 'dashboard_summary_cards'
  | 'reports_trend_routes'
  | 'company_cockpit_summary_routes'
  | 'project_execution_summary_service'
  | 'project_daily_snapshot_history'
  | 'metric_runtime_consumer_gate'

export type MetricConsumerPathEvidence = {
  consumerPath: MetricConsumerPath | string
  status: 'verified' | 'not_applicable'
  evidenceRefs?: string[]
  reason?: string
}

export type MetricConsumerPathCoverageMatrixInput = {
  evidence: MetricConsumerPathEvidence[]
}

export type MetricConsumerPathCoverageMatrixRow = {
  consumerPath: string
  status: 'confirmed' | 'incomplete'
  missingReasons: string[]
}

export type MetricConsumerPathCoverageMatrix = {
  status: 'metric_consumer_path_coverage_confirmed' | 'metric_consumer_path_coverage_incomplete'
  canDeclareMetricConsumerPathCoverageComplete: boolean
  requiredConsumerPaths: string[]
  rows: MetricConsumerPathCoverageMatrixRow[]
  boundaryPolicy: string[]
}

const REQUIRED_METRIC_CONSUMER_PATHS = [
  'dashboard_summary_cards',
  'reports_trend_routes',
  'company_cockpit_summary_routes',
  'project_execution_summary_service',
  'project_daily_snapshot_history',
  'metric_runtime_consumer_gate',
] as const

const METRIC_CONSUMER_PATH_BOUNDARY_POLICY = [
  'metric_consumer_matrix_is_current_snapshot_only',
  'metric_consumer_coverage_does_not_grant_metric_publish_rights',
  'metric_consumer_coverage_does_not_replace_metric_source_registration',
  'new_metric_consumer_path_must_reenter_review_required',
] as const

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEvidenceRef(evidence: MetricConsumerPathEvidence) {
  return (evidence.evidenceRefs ?? []).some(hasText)
}

function reasonsForConsumerPath(
  consumerPath: typeof REQUIRED_METRIC_CONSUMER_PATHS[number],
  evidence: MetricConsumerPathEvidence | undefined,
) {
  if (!evidence) return [`${consumerPath}_evidence_required`]

  const reasons: string[] = []
  if (evidence.status !== 'verified') reasons.push(`${consumerPath}_verified_status_required`)
  if (!hasEvidenceRef(evidence)) reasons.push(`${consumerPath}_evidence_ref_required`)
  if (evidence.status === 'not_applicable' && !hasText(evidence.reason)) {
    reasons.push(`${consumerPath}_not_applicable_requires_reason`)
  }
  return reasons
}

function verified(
  consumerPath: MetricConsumerPath,
  evidenceRefs: string[],
): MetricConsumerPathEvidence {
  return {
    consumerPath,
    status: 'verified',
    evidenceRefs,
  }
}

export function buildMetricConsumerPathCoverageMatrix(
  input: MetricConsumerPathCoverageMatrixInput,
): MetricConsumerPathCoverageMatrix {
  const rows = REQUIRED_METRIC_CONSUMER_PATHS.map((consumerPath) => {
    const missingReasons = reasonsForConsumerPath(
      consumerPath,
      input.evidence.find((evidence) => evidence.consumerPath === consumerPath),
    )
    return {
      consumerPath,
      status: missingReasons.length > 0 ? 'incomplete' as const : 'confirmed' as const,
      missingReasons,
    }
  })
  const canDeclareMetricConsumerPathCoverageComplete = rows.every((row) => row.status === 'confirmed')

  return {
    status: canDeclareMetricConsumerPathCoverageComplete
      ? 'metric_consumer_path_coverage_confirmed'
      : 'metric_consumer_path_coverage_incomplete',
    canDeclareMetricConsumerPathCoverageComplete,
    requiredConsumerPaths: [...REQUIRED_METRIC_CONSUMER_PATHS],
    rows,
    boundaryPolicy: [...METRIC_CONSUMER_PATH_BOUNDARY_POLICY],
  }
}

export function buildV14223MetricConsumerPathCoverageMatrix(): MetricConsumerPathCoverageMatrix {
  return buildMetricConsumerPathCoverageMatrix({
    evidence: [
      verified('dashboard_summary_cards', [
        'server/src/routes/dashboard.ts consumes projectExecutionSummaryService summaries for dashboard project cards',
        'server/src/__tests__/dashboardTodayLiveRoute.test.ts',
        'server/src/__tests__/projectCreationSummaryChain.test.ts',
      ]),
      verified('reports_trend_routes', [
        'server/src/routes/reports.ts consumes projectExecutionSummaryService and project_daily_snapshot trend rows',
        'server/src/__tests__/reportsRoutes.test.ts',
      ]),
      verified('company_cockpit_summary_routes', [
        'server/src/routes/dashboard.ts exposes /api/company/dashboard/company-summary backed by companySummaryService',
        'server/src/services/companySummaryService.ts consumes ProjectExecutionSummary and project_daily_snapshot history',
        'server/src/__tests__/companySummaryRoutes.test.ts',
      ]),
      verified('project_execution_summary_service', [
        'server/src/services/projectExecutionSummaryService.ts is the project-level summary SSOT for dashboard/report consumers',
        'server/src/__tests__/projectExecutionSummary.test.ts',
      ]),
      verified('project_daily_snapshot_history', [
        'server/src/services/projectDailySnapshotService.ts writes the project_daily_snapshot history layer',
        'server/src/__tests__/projectDailySnapshotService.test.ts',
        'server/src/__tests__/schedulerJobContracts.test.ts',
      ]),
      verified('metric_runtime_consumer_gate', [
        'server/src/services/metricRuntimePublicationService.ts resolves only scoped runtime-published metric publications for consumers',
        'server/src/__tests__/metricRuntimePublicationService.test.ts',
      ]),
    ],
  })
}
