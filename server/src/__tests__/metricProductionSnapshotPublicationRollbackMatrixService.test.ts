import { describe, expect, it } from 'vitest'

import {
  buildMetricProductionSnapshotPublicationRollbackMatrix,
  buildV14223MetricProductionSnapshotPublicationRollbackMatrix,
} from '../services/metricProductionSnapshotPublicationRollbackMatrixService.js'

describe('metricProductionSnapshotPublicationRollbackMatrixService', () => {
  it('keeps the metric closure matrix incomplete until every production snapshot publication and rollback surface has evidence', () => {
    const matrix = buildMetricProductionSnapshotPublicationRollbackMatrix({
      evidence: [{
        surface: 'metric_producer_contract',
        status: 'verified',
        evidenceRefs: ['server/src/services/metricRegistryService.ts'],
      }],
    })

    expect(matrix.status).toBe('metric_production_snapshot_publication_rollback_incomplete')
    expect(matrix.canDeclareMetricProductionSnapshotPublicationRollbackComplete).toBe(false)
    expect(matrix.requiredSurfaces).toEqual([
      'metric_producer_contract',
      'snapshot_persistence',
      'dashboard_consumer_contract',
      'metric_publication_record',
      'metric_rollback_path',
    ])
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'snapshot_persistence',
        status: 'incomplete',
        missingReasons: ['snapshot_persistence_evidence_required'],
      }),
      expect.objectContaining({
        surface: 'metric_publication_record',
        status: 'incomplete',
        missingReasons: ['metric_publication_record_evidence_required'],
      }),
      expect.objectContaining({
        surface: 'metric_rollback_path',
        status: 'incomplete',
        missingReasons: ['metric_rollback_path_evidence_required'],
      }),
    ]))
  })

  it('confirms only the listed current metric production snapshot publication and rollback surfaces', () => {
    const matrix = buildV14223MetricProductionSnapshotPublicationRollbackMatrix()

    expect(matrix).toEqual(expect.objectContaining({
      status: 'metric_production_snapshot_publication_rollback_confirmed',
      canDeclareMetricProductionSnapshotPublicationRollbackComplete: true,
    }))
    expect(matrix.rows.every((row) => row.status === 'confirmed')).toBe(true)
    expect(matrix.requiredSurfaces).toEqual([
      'metric_producer_contract',
      'snapshot_persistence',
      'dashboard_consumer_contract',
      'metric_publication_record',
      'metric_rollback_path',
    ])
  })

  it('does not allow required metric closure surfaces to be bypassed as not applicable', () => {
    const matrix = buildMetricProductionSnapshotPublicationRollbackMatrix({
      evidence: [
        {
          surface: 'metric_producer_contract',
          status: 'verified',
          evidenceRefs: ['metricRegistryService'],
        },
        {
          surface: 'snapshot_persistence',
          status: 'not_applicable',
          reason: 'snapshot is not used by this metric',
          evidenceRefs: ['manual note'],
        },
        {
          surface: 'dashboard_consumer_contract',
          status: 'verified',
          evidenceRefs: ['dashboard consumer contract'],
        },
        {
          surface: 'metric_publication_record',
          status: 'verified',
          evidenceRefs: ['metricRuntimePublicationService'],
        },
        {
          surface: 'metric_rollback_path',
          status: 'verified',
          evidenceRefs: ['metric rollback path'],
        },
      ],
    })

    expect(matrix.status).toBe('metric_production_snapshot_publication_rollback_incomplete')
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'snapshot_persistence',
        status: 'incomplete',
        missingReasons: ['snapshot_persistence_verified_status_required'],
      }),
    ]))
  })
})
