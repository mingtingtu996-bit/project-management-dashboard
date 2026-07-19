import { describe, expect, it } from 'vitest'

import {
  buildAlgorithmAssetIsolationMatrix,
  buildV14223RuntimeAssetIsolationMatrix,
} from '../services/algorithmAssetIsolationMatrixService.js'

describe('algorithmAssetIsolationMatrixService', () => {
  it('blocks completion when only dashboard summary isolation exists', () => {
    const matrix = buildAlgorithmAssetIsolationMatrix({
      assets: [{
        assetKey: 'duration.forecast.residual_overlay',
        assetType: 'forecast_residual_overlay',
        scopeType: 'company',
        evidence: [{
          surface: 'dashboard_summary',
          status: 'verified',
          evidenceRefs: ['algorithmAssetGovernanceDashboardEvidenceService.test.ts'],
        }],
      }],
    })

    expect(matrix).toEqual(expect.objectContaining({
      status: 'isolation_matrix_incomplete',
      canDeclareAssetIsolationComplete: false,
    }))
    expect(matrix.rows[0]).toEqual(expect.objectContaining({
      assetKey: 'duration.forecast.residual_overlay',
      status: 'incomplete',
    }))
    expect(matrix.rows[0].missingReasons).toEqual(expect.arrayContaining([
      'runtime_writer_isolation_required',
      'runtime_consumer_isolation_required',
      'runtime_cache_isolation_required',
      'async_job_isolation_required',
      'rollback_writer_isolation_required',
    ]))
  })

  it('confirms scoped writer consumer cache async and rollback evidence per runtime asset type', () => {
    const matrix = buildAlgorithmAssetIsolationMatrix({
      assets: [
        {
          assetKey: 'duration.forecast.residual_overlay',
          assetType: 'forecast_residual_overlay',
          scopeType: 'company',
          evidence: [
            scoped('runtime_writer', 'persistAlgorithmAssetForecastResidualOverlayEvaluation'),
            scoped('runtime_consumer', 'taskDurationForecastService excludes cross-company and rolled-back overlays'),
            scoped('runtime_cache', 'forecast overlay lookup cache includes company/project scope'),
            scoped('async_job', 'forecast residual monitoring payload carries company/project scope'),
            scoped('rollback_writer', 'rollbackAlgorithmAssetForecastResidualOverlayRuntimePublication'),
          ],
        },
        {
          assetKey: 'duration.cold_start.shared_baseline',
          assetType: 'cold_start_baseline',
          scopeType: 'system',
          evidence: [
            scoped('runtime_writer', 'persistAlgorithmAssetColdStartBaseline enforces anonymous multi-company scope'),
            scoped('runtime_consumer', 'durationSuggestionService excludes cross-company details and rolled-back baseline'),
            scoped('runtime_cache', 'cold-start baseline cache keys include segment/system scope'),
            scoped('async_job', 'cold-start refresh job payload carries segment/system scope'),
            scoped('rollback_writer', 'rollbackAlgorithmAssetColdStartBaselineRuntimePublicationRecord'),
          ],
        },
        {
          assetKey: 'duration.benchmark_blend_weight',
          assetType: 'learnable_parameter_publication',
          scopeType: 'company',
          evidence: [
            scoped('runtime_writer', 'algorithmAssetLearnableParameterReleaseExecutionService'),
            scoped('runtime_consumer', 'algorithmAssetLearnableParameterRuntimeConsumptionService'),
            notApplicable('runtime_cache', 'parameter publication consumer reads committed publication rows without a shared cache'),
            scoped('async_job', 'algorithmAssetLearnableParameterImpactMonitoringJob scopes publication checks'),
            scoped('rollback_writer', 'parameter publication rollback marks only the scoped publication rolled_back'),
          ],
        },
      ],
    })

    expect(matrix).toEqual(expect.objectContaining({
      status: 'isolation_matrix_confirmed',
      canDeclareAssetIsolationComplete: true,
      requiredSurfaces: [
        'runtime_writer',
        'runtime_consumer',
        'runtime_cache',
        'async_job',
        'rollback_writer',
      ],
    }))
    expect(matrix.rows.every((row) => row.status === 'confirmed')).toBe(true)
  })

  it('requires explicit evidence when a surface is marked not applicable', () => {
    const matrix = buildAlgorithmAssetIsolationMatrix({
      assets: [{
        assetKey: 'duration.benchmark_blend_weight',
        assetType: 'learnable_parameter_publication',
        scopeType: 'company',
        evidence: [
          scoped('runtime_writer', 'algorithmAssetLearnableParameterReleaseExecutionService'),
          scoped('runtime_consumer', 'algorithmAssetLearnableParameterRuntimeConsumptionService'),
          { surface: 'runtime_cache', status: 'not_applicable' },
          scoped('async_job', 'algorithmAssetLearnableParameterImpactMonitoringJob scopes publication checks'),
          scoped('rollback_writer', 'parameter publication rollback marks only the scoped publication rolled_back'),
        ],
      }],
    })

    expect(matrix.status).toBe('isolation_matrix_incomplete')
    expect(matrix.rows[0].missingReasons).toEqual(expect.arrayContaining([
      'runtime_cache_not_applicable_requires_reason',
      'runtime_cache_evidence_ref_required',
    ]))
  })

  it('builds the v1.4.22.3 runtime matrix with confirmed evidence and explicit pending asset-type gaps', () => {
    const matrix = buildV14223RuntimeAssetIsolationMatrix()
    const byKey = new Map(matrix.rows.map((row) => [row.assetKey, row]))

    expect(matrix.status).toBe('isolation_matrix_confirmed')
    expect(matrix.canDeclareAssetIsolationComplete).toBe(true)

    expect(byKey.get('algorithm.learnable_parameter.runtime_publication')).toEqual(expect.objectContaining({
      assetType: 'learnable_parameter_publication',
      status: 'confirmed',
      missingReasons: [],
    }))
    expect(byKey.get('policy_template.entity_runtime_publication')).toEqual(expect.objectContaining({
      assetType: 'policy_template_runtime_projection',
      status: 'confirmed',
      missingReasons: [],
    }))
    expect(byKey.get('duration.forecast.residual_overlay')).toEqual(expect.objectContaining({
      assetType: 'forecast_residual_overlay',
      status: 'confirmed',
      missingReasons: [],
    }))
    expect(byKey.get('duration.cold_start.shared_baseline')).toEqual(expect.objectContaining({
      assetType: 'cold_start_baseline',
      status: 'confirmed',
      missingReasons: [],
    }))
    expect(byKey.get('standard_work_duration.seed_version_runtime')).toEqual(expect.objectContaining({
      assetType: 'standard_work_duration_seed_runtime',
      scopeType: 'project_company_industry_global',
      status: 'confirmed',
      missingReasons: [],
    }))

    expect(byKey.get('wbs.template.runtime')).toEqual(expect.objectContaining({
      assetType: 'wbs_template_runtime',
      scopeType: 'project_company_industry_global',
      status: 'confirmed',
      missingReasons: [],
    }))
    expect(byKey.get('dependency.rule.runtime')).toEqual(expect.objectContaining({
      assetType: 'dependency_rule_runtime',
      scopeType: 'project_company_industry_global',
      status: 'confirmed',
      missingReasons: [],
    }))
    expect(byKey.get('critical_path.rule_runtime')).toEqual(expect.objectContaining({
      assetType: 'critical_path_rule_runtime',
      scopeType: 'project_company_industry_global',
      status: 'confirmed',
      missingReasons: [],
    }))
    expect(byKey.get('seed.override.runtime')).toEqual(expect.objectContaining({
      assetType: 'algorithm_seed_override',
      status: 'confirmed',
      missingReasons: [],
    }))
    expect(byKey.get('sample_health.production_consumption')).toEqual(expect.objectContaining({
      assetType: 'sample_health',
      status: 'confirmed',
      missingReasons: [],
    }))
    expect(byKey.get('unknown_scope.candidate_governance')).toEqual(expect.objectContaining({
      assetType: 'unknown_scope_candidate',
      scopeType: 'system_observation',
      status: 'confirmed',
      missingReasons: [],
    }))
  })
})

function scoped(surface: string, evidenceRef: string) {
  return {
    surface,
    status: 'verified' as const,
    companyOrProjectScoped: true,
    evidenceRefs: [evidenceRef],
  }
}

function notApplicable(surface: string, reason: string) {
  return {
    surface,
    status: 'not_applicable' as const,
    reason,
    evidenceRefs: [reason],
  }
}
