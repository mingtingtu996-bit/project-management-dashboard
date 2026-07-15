import { describe, expect, it } from 'vitest'

import {
  buildDomainReleaseRuntimeClosureMatrix,
  buildV14223DomainReleaseRuntimeClosureMatrix,
} from '../services/domainReleaseRuntimeClosureMatrixService.js'

describe('domainReleaseRuntimeClosureMatrixService', () => {
  it('confirms current registered v1.4.22.3 domain runtime closure only when every required surface is verified', () => {
    const matrix = buildV14223DomainReleaseRuntimeClosureMatrix()

    expect(matrix).toEqual(expect.objectContaining({
      status: 'domain_release_runtime_closure_confirmed',
      canDeclareDomainReleaseRuntimeClosureComplete: true,
      assetTypes: [
        'learnable_parameter',
        'policy_template_entity_projection',
        'forecast_residual_overlay',
        'cold_start_baseline',
        'standard_work_duration_seed_runtime',
        'wbs_template_runtime',
        'construction_dependency_rule_runtime',
        'critical_path_rule_runtime',
        'metric_runtime',
        'seed_override_runtime',
        'construction_organization_plan_network',
        't2_rhythm_schedule_runtime',
      ],
      requiredSurfaces: [
        'asset_type_domain_writer',
        'runtime_consumer_verification',
        'impact_monitoring',
        'release_record',
        'rollback_writer_and_target',
      ],
      boundaryPolicy: expect.arrayContaining([
        'domain_release_runtime_closure_matrix_is_current_registered_asset_types_only',
        'matrix_ready_is_not_future_asset_whitelist',
        'each_asset_type_must_keep_its_own_writer_consumer_monitoring_and_rollback',
        'required_runtime_closure_surfaces_must_be_verified',
      ]),
    }))
    expect(matrix.rows).toHaveLength(60)
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetType: 'learnable_parameter',
        surface: 'asset_type_domain_writer',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('algorithmAssetLearnableParameterReleaseExecutionService.ts'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'policy_template_entity_projection',
        surface: 'runtime_consumer_verification',
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'forecast_residual_overlay',
        surface: 'rollback_writer_and_target',
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'cold_start_baseline',
        surface: 'impact_monitoring',
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'standard_work_duration_seed_runtime',
        surface: 'asset_type_domain_writer',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('standardWorkDurationSeedPublicationService.ts'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'wbs_template_runtime',
        surface: 'release_record',
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'construction_dependency_rule_runtime',
        surface: 'runtime_consumer_verification',
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'critical_path_rule_runtime',
        surface: 'rollback_writer_and_target',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('criticalPathRuleRuntimePublicationService.ts'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'metric_runtime',
        surface: 'rollback_writer_and_target',
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'seed_override_runtime',
        surface: 'impact_monitoring',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('algorithmSeedGovernanceFlow.test.ts'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'construction_organization_plan_network',
        surface: 'asset_type_domain_writer',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('constructionOrganizationPlanNetworkDomainWriter.ts'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'construction_organization_plan_network',
        surface: 'runtime_consumer_verification',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('runtime_consumer_observations'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'construction_organization_plan_network',
        surface: 'impact_monitoring',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('constructionOrganizationPlanNetworkRuntimeEvidenceService.ts'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'construction_organization_plan_network',
        surface: 'release_record',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('construction_organization_plan_network_runtime_publications'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'construction_organization_plan_network',
        surface: 'rollback_writer_and_target',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('rollback_execution'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 't2_rhythm_schedule_runtime',
        surface: 'asset_type_domain_writer',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('t2RhythmScheduleRuntimePublicationService.ts'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 't2_rhythm_schedule_runtime',
        surface: 'runtime_consumer_verification',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('projectCriticalPathService.ts'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 't2_rhythm_schedule_runtime',
        surface: 'impact_monitoring',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('impact_monitoring'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 't2_rhythm_schedule_runtime',
        surface: 'release_record',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('241_v14231_t2_rhythm_schedule_runtime_publications.sql'),
        ]),
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 't2_rhythm_schedule_runtime',
        surface: 'rollback_writer_and_target',
        status: 'confirmed',
        evidenceRefs: expect.arrayContaining([
          expect.stringContaining('restores mapped task date snapshots'),
        ]),
        missingReasons: [],
      }),
    ]))
  })

  it('blocks completion when any current domain runtime surface lacks evidence or a not-applicable reason', () => {
    const matrix = buildDomainReleaseRuntimeClosureMatrix({
      evidence: [{
        assetType: 'learnable_parameter',
        surface: 'asset_type_domain_writer',
        status: 'verified',
        evidenceRefs: ['server/src/services/algorithmAssetLearnableParameterReleaseExecutionService.ts'],
      }, {
        assetType: 'seed_override_runtime',
        surface: 'impact_monitoring',
        status: 'not_applicable',
        evidenceRefs: ['server/src/services/algorithmSeedAutoGovernanceService.ts'],
      }],
    })

    expect(matrix.status).toBe('domain_release_runtime_closure_incomplete')
    expect(matrix.canDeclareDomainReleaseRuntimeClosureComplete).toBe(false)
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetType: 'learnable_parameter',
        surface: 'asset_type_domain_writer',
        status: 'confirmed',
        evidenceRefs: ['server/src/services/algorithmAssetLearnableParameterReleaseExecutionService.ts'],
        missingReasons: [],
      }),
      expect.objectContaining({
        assetType: 'learnable_parameter',
        surface: 'runtime_consumer_verification',
        status: 'incomplete',
        missingReasons: ['learnable_parameter:runtime_consumer_verification_evidence_required'],
      }),
      expect.objectContaining({
        assetType: 'seed_override_runtime',
        surface: 'impact_monitoring',
        status: 'incomplete',
        missingReasons: expect.arrayContaining([
          'seed_override_runtime:impact_monitoring_verified_status_required',
          'seed_override_runtime:impact_monitoring_not_applicable_requires_reason',
        ]),
      }),
    ]))
  })
})
