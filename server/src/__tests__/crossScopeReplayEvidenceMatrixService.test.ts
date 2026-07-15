import { describe, expect, it } from 'vitest'

import {
  buildCrossScopeReplayEvidenceMatrix,
  buildV14223CrossScopeReplayEvidenceMatrix,
} from '../services/crossScopeReplayEvidenceMatrixService.js'

describe('crossScopeReplayEvidenceMatrixService', () => {
  it('keeps cross-scope replay evidence incomplete until every current-snapshot surface has evidence', () => {
    const matrix = buildCrossScopeReplayEvidenceMatrix({
      evidence: [{
        surface: 'anchor_upgrade_strategy_cross_scope_gate',
        status: 'verified',
        evidenceRefs: ['algorithmAssetAnchorUpgradeStrategyService'],
      }],
    })

    expect(matrix.status).toBe('cross_scope_replay_evidence_incomplete')
    expect(matrix.canDeclareCrossScopeReplayEvidenceComplete).toBe(false)
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'cross_project_replay_threshold_evidence',
        status: 'incomplete',
        missingReasons: ['cross_project_replay_threshold_evidence_evidence_required'],
      }),
      expect.objectContaining({
        surface: 'cross_company_replay_threshold_evidence',
        status: 'incomplete',
        missingReasons: ['cross_company_replay_threshold_evidence_evidence_required'],
      }),
      expect.objectContaining({
        surface: 'manual_anchor_single_replay_blocker',
        status: 'incomplete',
        missingReasons: ['manual_anchor_single_replay_blocker_evidence_required'],
      }),
    ]))
  })

  it('does not allow required cross-scope replay surfaces to be bypassed as not applicable', () => {
    const matrix = buildCrossScopeReplayEvidenceMatrix({
      evidence: [
        {
          surface: 'anchor_upgrade_strategy_cross_scope_gate',
          status: 'verified',
          evidenceRefs: ['algorithmAssetAnchorUpgradeStrategyService'],
        },
        {
          surface: 'cross_project_replay_threshold_evidence',
          status: 'verified',
          evidenceRefs: ['project replay report'],
        },
        {
          surface: 'cross_company_replay_threshold_evidence',
          status: 'not_applicable',
          reason: 'single company asset',
          evidenceRefs: ['manual note'],
        },
        {
          surface: 'scenario_diversity_replay_threshold_evidence',
          status: 'verified',
          evidenceRefs: ['scenario replay report'],
        },
        {
          surface: 'manual_anchor_single_replay_blocker',
          status: 'not_applicable',
          reason: 'manual anchor not present',
          evidenceRefs: ['manual note'],
        },
        {
          surface: 'replay_evidence_only_no_publish_rights',
          status: 'verified',
          evidenceRefs: ['algorithmAssetGovernanceProtocolService'],
        },
      ],
    })

    expect(matrix.status).toBe('cross_scope_replay_evidence_incomplete')
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'cross_company_replay_threshold_evidence',
        status: 'incomplete',
        missingReasons: ['cross_company_replay_threshold_evidence_verified_status_required'],
      }),
      expect.objectContaining({
        surface: 'manual_anchor_single_replay_blocker',
        status: 'incomplete',
        missingReasons: ['manual_anchor_single_replay_blocker_verified_status_required'],
      }),
    ]))
  })

  it('confirms current v1.4.22.3 cross-project and cross-company replay evidence without granting publish rights', () => {
    const matrix = buildV14223CrossScopeReplayEvidenceMatrix()

    expect(matrix.status).toBe('cross_scope_replay_evidence_confirmed')
    expect(matrix.canDeclareCrossScopeReplayEvidenceComplete).toBe(true)
    expect(matrix.requiredSurfaces).toEqual([
      'anchor_upgrade_strategy_cross_scope_gate',
      'cross_project_replay_threshold_evidence',
      'cross_company_replay_threshold_evidence',
      'scenario_diversity_replay_threshold_evidence',
      'manual_anchor_single_replay_blocker',
      'replay_evidence_only_no_publish_rights',
    ])
    expect(matrix.rows.every((row) => row.status === 'confirmed')).toBe(true)
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'cross_scope_replay_matrix_is_current_snapshot_only',
      'cross_scope_replay_evidence_does_not_grant_publish_rights',
      'single_candidate_or_single_replay_cannot_upgrade_manual_anchor',
      'new_replay_scope_or_asset_type_must_reenter_review_required',
    ]))
  })
})
