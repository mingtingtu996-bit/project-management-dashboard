import { describe, expect, it } from 'vitest'

import {
  canShowWorkspaceGovernanceExecuteAction,
  DURATION_ACCURACY_ACTION_SURFACE_KEYS,
  getRuleAssetOperationSurfaceKey,
  getWorkspaceActionSurfaceKey,
} from '../v14231PageActionReadiness'

describe('v1.4.23.1 page action readiness mapping', () => {
  it('keeps rule-asset read/review actions separate from publication, replacement and rollback', () => {
    expect(getRuleAssetOperationSurfaceKey('manual_review_handoff', 'construction_organization_plan_network'))
      .toBe('rule_asset_governance_review_action')
    expect(getRuleAssetOperationSurfaceKey('manual_conflict_review', 'construction_organization_plan_network'))
      .toBe('rule_asset_governance_review_action')
    expect(getRuleAssetOperationSurfaceKey('release_exit_handoff', 'policy_template'))
      .toBe('rule_asset_governance_review_action')

    expect(getRuleAssetOperationSurfaceKey('runtime_apply', 'construction_organization_plan_network'))
      .toBe('construction_organization_runtime_publication_action')
    expect(getRuleAssetOperationSurfaceKey('runtime_apply', 'policy_template'))
      .toBe('rule_asset_template_replacement_action')
    expect(getRuleAssetOperationSurfaceKey('runtime_apply', 'template_seed'))
      .toBe('rule_asset_template_replacement_action')
    expect(getRuleAssetOperationSurfaceKey('runtime_apply', 'algorithm_seed'))
      .toBe('rule_asset_stable_publication_action')

    expect(getRuleAssetOperationSurfaceKey('runtime_impact_monitoring', 'construction_organization_plan_network'))
      .toBe('rule_asset_runtime_evidence_action')
    expect(getRuleAssetOperationSurfaceKey('runtime_recommendation_adopt', 'construction_organization_plan_network'))
      .toBe('rule_asset_runtime_evidence_action')
    expect(getRuleAssetOperationSurfaceKey('runtime_rollback_execution', 'construction_organization_plan_network'))
      .toBe('rule_asset_runtime_rollback_action')
    expect(getRuleAssetOperationSurfaceKey('runtime_rollback', 'learnable_parameter'))
      .toBe('rule_asset_runtime_rollback_action')
  })

  it('fails unregistered operation values closed', () => {
    expect(getRuleAssetOperationSurfaceKey('future_direct_write' as never, 'algorithm_seed')).toBeNull()
    expect(getRuleAssetOperationSurfaceKey('runtime_apply', 'future_asset' as never)).toBeNull()
  })

  it('separates ordinary workspace progress from governance/prediction execution', () => {
    expect(getWorkspaceActionSurfaceKey('progress_entry')).toBe('workspace_progress_entry_action')
    expect(getWorkspaceActionSurfaceKey('governance_prediction_execute'))
      .toBe('workspace_governance_prediction_todo_action')
  })

  it('shows a workspace governance execute action only when every command contract is closed', () => {
    const stableSurface = {
      status: 'stable_action' as const,
      boundaryPolicy: {
        canUseAsStableAction: true,
        writesRuntimePublication: false,
        declaresProductionReady: false,
      },
    }
    const closed = {
      surface: stableSurface,
      hasBackendCommand: true,
      hasPermission: true,
      hasFailureSemantics: true,
      hasIdempotency: true,
      hasSourceIdentity: true,
    }

    expect(canShowWorkspaceGovernanceExecuteAction(closed)).toBe(true)
    for (const missing of [
      'hasBackendCommand',
      'hasPermission',
      'hasFailureSemantics',
      'hasIdempotency',
      'hasSourceIdentity',
    ] as const) {
      expect(canShowWorkspaceGovernanceExecuteAction({ ...closed, [missing]: false })).toBe(false)
    }
    expect(canShowWorkspaceGovernanceExecuteAction({ ...closed, surface: null })).toBe(false)
    expect(canShowWorkspaceGovernanceExecuteAction({
      ...closed,
      surface: { ...stableSurface, status: 'needs-gating' },
    })).toBe(false)
  })

  it('registers duration accuracy dangerous actions independently', () => {
    expect(DURATION_ACCURACY_ACTION_SURFACE_KEYS).toEqual({
      autoPublish: 'duration_accuracy_auto_publish_action',
      forceStable: 'duration_accuracy_force_stable_action',
      rollbackClose: 'duration_accuracy_rollback_close_action',
    })
  })
})
