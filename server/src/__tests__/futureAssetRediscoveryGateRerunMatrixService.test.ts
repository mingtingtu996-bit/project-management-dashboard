import { describe, expect, it } from 'vitest'

import {
  buildFutureAssetRediscoveryGateRerunMatrix,
  buildV14223FutureAssetRediscoveryGateRerunMatrix,
} from '../services/futureAssetRediscoveryGateRerunMatrixService.js'

describe('futureAssetRediscoveryGateRerunMatrixService', () => {
  it('keeps the rerun matrix incomplete until every current-snapshot surface has evidence', () => {
    const matrix = buildFutureAssetRediscoveryGateRerunMatrix({
      evidence: [
        {
          surface: 'fresh_asset_discovery',
          status: 'verified',
          evidenceRefs: ['v14AssetDiscoveryService'],
        },
        {
          surface: 'inventory_diagnostics_rerun',
          status: 'verified',
          evidenceRefs: ['algorithmRuleAssetInventoryService'],
        },
        {
          surface: 'admission_gate_rerun',
          status: 'verified',
          evidenceRefs: ['v14AssetAdmissionAutomationService'],
        },
        {
          surface: 'old_object_rescan',
          status: 'not_applicable',
        },
      ],
    })

    expect(matrix.status).toBe('future_asset_rediscovery_gate_rerun_incomplete')
    expect(matrix.canDeclareFutureAssetRediscoveryGateRerunComplete).toBe(false)
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'old_object_rescan',
        status: 'incomplete',
        missingReasons: expect.arrayContaining(['old_object_rescan_not_applicable_requires_reason']),
      }),
      expect.objectContaining({
        surface: 'llm_candidate_gate_rerun',
        status: 'incomplete',
        missingReasons: ['llm_candidate_gate_rerun_evidence_required'],
      }),
      expect.objectContaining({
        surface: 'governance_gate_rerun',
        status: 'incomplete',
        missingReasons: ['governance_gate_rerun_evidence_required'],
      }),
    ]))
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'future_asset_rerun_matrix_is_current_snapshot_only',
      'ready_matrix_is_not_future_asset_whitelist',
    ]))
  })

  it('does not allow a required rerun surface to be bypassed as not applicable', () => {
    const matrix = buildFutureAssetRediscoveryGateRerunMatrix({
      evidence: [
        {
          surface: 'fresh_asset_discovery',
          status: 'verified',
          evidenceRefs: ['v14AssetDiscoveryService'],
        },
        {
          surface: 'inventory_diagnostics_rerun',
          status: 'verified',
          evidenceRefs: ['algorithmRuleAssetInventoryService'],
        },
        {
          surface: 'admission_gate_rerun',
          status: 'verified',
          evidenceRefs: ['v14AssetAdmissionAutomationService'],
        },
        {
          surface: 'old_object_rescan',
          status: 'not_applicable',
          reason: 'no legacy objects found in this snapshot',
          evidenceRefs: ['manual note'],
        },
        {
          surface: 'llm_candidate_gate_rerun',
          status: 'not_applicable',
          reason: 'no LLM candidates submitted',
          evidenceRefs: ['manual note'],
        },
        {
          surface: 'governance_gate_rerun',
          status: 'verified',
          evidenceRefs: ['verify:v14223-governance'],
        },
      ],
    })

    expect(matrix.status).toBe('future_asset_rediscovery_gate_rerun_incomplete')
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'old_object_rescan',
        status: 'incomplete',
        missingReasons: ['old_object_rescan_verified_status_required'],
      }),
      expect.objectContaining({
        surface: 'llm_candidate_gate_rerun',
        status: 'incomplete',
        missingReasons: ['llm_candidate_gate_rerun_verified_status_required'],
      }),
    ]))
  })

  it('confirms the v1.4.22.3 rerun matrix without granting future automatic release rights', () => {
    const matrix = buildV14223FutureAssetRediscoveryGateRerunMatrix()

    expect(matrix.status).toBe('future_asset_rediscovery_gate_rerun_confirmed')
    expect(matrix.canDeclareFutureAssetRediscoveryGateRerunComplete).toBe(true)
    expect(matrix.requiredSurfaces).toEqual([
      'fresh_asset_discovery',
      'inventory_diagnostics_rerun',
      'admission_gate_rerun',
      'old_object_rescan',
      'llm_candidate_gate_rerun',
      'governance_gate_rerun',
    ])
    expect(matrix.rows.every((row) => row.status === 'confirmed')).toBe(true)
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'fresh_rerun_must_be_repeated_for_new_assets_or_changed_asset_keys',
      'llm_generated_candidates_remain_candidate_only_until_gates_rerun',
      'old_object_rescan_must_not_use_historical_snapshots_as_permanent_evidence',
    ]))
  })
})
