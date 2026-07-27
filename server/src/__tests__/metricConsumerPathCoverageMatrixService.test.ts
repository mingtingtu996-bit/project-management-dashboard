import { describe, expect, it } from 'vitest'

import {
  buildMetricConsumerPathCoverageMatrix,
  buildV14223MetricConsumerPathCoverageMatrix,
} from '../services/metricConsumerPathCoverageMatrixService.js'

describe('metricConsumerPathCoverageMatrixService', () => {
  it('keeps metric consumer coverage incomplete until every current consumer path has evidence', () => {
    const matrix = buildMetricConsumerPathCoverageMatrix({
      evidence: [{
        consumerPath: 'dashboard_summary_cards',
        status: 'verified',
        evidenceRefs: ['server/src/routes/dashboard.ts'],
      }],
    })

    expect(matrix.status).toBe('metric_consumer_path_coverage_incomplete')
    expect(matrix.canDeclareMetricConsumerPathCoverageComplete).toBe(false)
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        consumerPath: 'reports_trend_routes',
        status: 'incomplete',
        missingReasons: ['reports_trend_routes_evidence_required'],
      }),
      expect.objectContaining({
        consumerPath: 'company_cockpit_summary_routes',
        status: 'incomplete',
        missingReasons: ['company_cockpit_summary_routes_evidence_required'],
      }),
      expect.objectContaining({
        consumerPath: 'metric_runtime_consumer_gate',
        status: 'incomplete',
        missingReasons: ['metric_runtime_consumer_gate_evidence_required'],
      }),
    ]))
  })

  it('does not allow a required current consumer path to be bypassed as not applicable', () => {
    const matrix = buildMetricConsumerPathCoverageMatrix({
      evidence: [
        {
          consumerPath: 'dashboard_summary_cards',
          status: 'not_applicable',
          reason: 'dashboard cards temporarily hidden',
          evidenceRefs: ['server/src/routes/dashboard.ts'],
        },
        {
          consumerPath: 'reports_trend_routes',
          status: 'verified',
          evidenceRefs: ['server/src/routes/reports.ts'],
        },
        {
          consumerPath: 'company_cockpit_summary_routes',
          status: 'verified',
          evidenceRefs: ['server/src/services/companySummaryService.ts'],
        },
        {
          consumerPath: 'project_execution_summary_service',
          status: 'verified',
          evidenceRefs: ['server/src/services/projectExecutionSummaryService.ts'],
        },
        {
          consumerPath: 'project_daily_snapshot_history',
          status: 'verified',
          evidenceRefs: ['server/src/services/projectDailySnapshotService.ts'],
        },
        {
          consumerPath: 'metric_runtime_consumer_gate',
          status: 'verified',
          evidenceRefs: ['server/src/services/metricRuntimePublicationService.ts'],
        },
      ],
    })

    expect(matrix.status).toBe('metric_consumer_path_coverage_incomplete')
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        consumerPath: 'dashboard_summary_cards',
        status: 'incomplete',
        missingReasons: ['dashboard_summary_cards_verified_status_required'],
      }),
    ]))
  })

  it('confirms current v1.4.22.3 metric consumer paths without granting future consumer coverage', () => {
    const matrix = buildV14223MetricConsumerPathCoverageMatrix()

    expect(matrix.status).toBe('metric_consumer_path_coverage_confirmed')
    expect(matrix.canDeclareMetricConsumerPathCoverageComplete).toBe(true)
    expect(matrix.requiredConsumerPaths).toEqual([
      'dashboard_summary_cards',
      'reports_trend_routes',
      'company_cockpit_summary_routes',
      'project_execution_summary_service',
      'project_daily_snapshot_history',
      'metric_runtime_consumer_gate',
    ])
    expect(matrix.rows.every((row) => row.status === 'confirmed')).toBe(true)
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'metric_consumer_matrix_is_current_snapshot_only',
      'metric_consumer_coverage_does_not_grant_metric_publish_rights',
      'new_metric_consumer_path_must_reenter_review_required',
    ]))
  })
})
