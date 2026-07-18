import type {
  RuleAssetGovernanceWorkbenchAssetType,
  RuleAssetGovernanceWorkbenchOperationAction,
} from './ruleAssetGovernanceWorkbenchApi'
import {
  canUseV14231ActionableSurfaceAsStableAction,
  type V14231ActionableSurface,
} from './v14231ReadinessApi'

export const RULE_ASSET_ACTION_SURFACE_KEYS = {
  governanceReview: 'rule_asset_governance_review_action',
  stablePublication: 'rule_asset_stable_publication_action',
  templateReplacement: 'rule_asset_template_replacement_action',
  runtimeEvidence: 'rule_asset_runtime_evidence_action',
  runtimeRollback: 'rule_asset_runtime_rollback_action',
  constructionOrganizationPublication: 'construction_organization_runtime_publication_action',
} as const

export const DURATION_ACCURACY_ACTION_SURFACE_KEYS = {
  autoPublish: 'duration_accuracy_auto_publish_action',
  forceStable: 'duration_accuracy_force_stable_action',
  rollbackClose: 'duration_accuracy_rollback_close_action',
} as const

export const WORKSPACE_ACTION_SURFACE_KEYS = {
  progressEntry: 'workspace_progress_entry_action',
  governancePredictionExecute: 'workspace_governance_prediction_todo_action',
} as const

const KNOWN_ASSET_TYPES = new Set<RuleAssetGovernanceWorkbenchAssetType>([
  'learnable_parameter',
  'algorithm_seed',
  'policy_template',
  'forecast_residual_overlay',
  'cold_start_baseline',
  'sample_health',
  'dependency_rule',
  'template_seed',
  'construction_organization_plan_network',
])

const GOVERNANCE_REVIEW_ACTIONS = new Set<RuleAssetGovernanceWorkbenchOperationAction>([
  'release_exit_handoff',
  'manual_review_handoff',
  'manual_conflict_review',
  'manual_review_approval',
])

const RUNTIME_EVIDENCE_ACTIONS = new Set<RuleAssetGovernanceWorkbenchOperationAction>([
  'runtime_impact_monitoring',
  'runtime_consumer_observation',
  'runtime_engine_evidence',
  'runtime_saved_outcome',
  'runtime_recommendation_adopt',
  'runtime_recommendation_decline',
])

export function getRuleAssetOperationSurfaceKey(
  action: RuleAssetGovernanceWorkbenchOperationAction,
  assetType: RuleAssetGovernanceWorkbenchAssetType,
): string | null {
  if (!KNOWN_ASSET_TYPES.has(assetType)) return null
  if (GOVERNANCE_REVIEW_ACTIONS.has(action)) return RULE_ASSET_ACTION_SURFACE_KEYS.governanceReview
  if (RUNTIME_EVIDENCE_ACTIONS.has(action)) return RULE_ASSET_ACTION_SURFACE_KEYS.runtimeEvidence
  if (action === 'runtime_rollback' || action === 'runtime_rollback_execution') {
    return RULE_ASSET_ACTION_SURFACE_KEYS.runtimeRollback
  }
  if (action !== 'runtime_apply') return null
  if (assetType === 'construction_organization_plan_network') {
    return RULE_ASSET_ACTION_SURFACE_KEYS.constructionOrganizationPublication
  }
  if (assetType === 'policy_template' || assetType === 'template_seed') {
    return RULE_ASSET_ACTION_SURFACE_KEYS.templateReplacement
  }
  return RULE_ASSET_ACTION_SURFACE_KEYS.stablePublication
}

export function getWorkspaceActionSurfaceKey(
  action: 'progress_entry' | 'governance_prediction_execute',
) {
  return action === 'progress_entry'
    ? WORKSPACE_ACTION_SURFACE_KEYS.progressEntry
    : WORKSPACE_ACTION_SURFACE_KEYS.governancePredictionExecute
}

export function canShowWorkspaceGovernanceExecuteAction(input: {
  surface: Pick<V14231ActionableSurface, 'status' | 'boundaryPolicy'> | null | undefined
  hasBackendCommand: boolean
  hasPermission: boolean
  hasFailureSemantics: boolean
  hasIdempotency: boolean
  hasSourceIdentity: boolean
}) {
  return canUseV14231ActionableSurfaceAsStableAction(input.surface)
    && input.hasBackendCommand
    && input.hasPermission
    && input.hasFailureSemantics
    && input.hasIdempotency
    && input.hasSourceIdentity
}
