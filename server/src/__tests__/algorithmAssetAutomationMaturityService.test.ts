import { describe, expect, it } from 'vitest'
import {
  buildAlgorithmAssetAutomationMaturityReview,
} from '../services/algorithmAssetAutomationMaturityService.js'

describe('algorithmAssetAutomationMaturityService', () => {
  it('builds an unlock package for manual assets instead of publishing them', () => {
    const review = buildAlgorithmAssetAutomationMaturityReview({
      assetKey: 'critical.path.manual.rule',
      sourceSystem: 'constructionDependencyRuleSystemService',
      publishAnchor: 'manual_review_required_before_publish',
      automationMaturity: 'manual_required',
      learningMaturity: 'governed_candidate',
      learningTarget: 'dependency_order',
      requestedRuntimeEffect: 'direct_effect_request',
      evidence: {
        conflictFree: true,
      },
    })

    expect(review).toEqual(expect.objectContaining({
      assetKey: 'critical.path.manual.rule',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'manual_required',
      currentRoute: 'manual_unlock_package',
      canWriteRuntimeNow: false,
      canModifyPublishAnchorNow: false,
    }))
    expect(review.automationUnlockCriteria).toEqual(expect.arrayContaining([
      'register_anchor_upgrade_strategy',
      'collect_cross_project_or_cross_company_replay',
      'versioned_governance_audit_required',
      'rollback_target_required',
    ]))
    expect(review.moreVerificationNeeds).toEqual(expect.arrayContaining([
      'cross_project_or_cross_company_replay_required',
      'rollback_target_required',
      'domain_writer_contract_required',
      'consumer_verification_required',
      'impact_monitoring_required',
    ]))
    expect(review.suggestedNextRoutes).toEqual(expect.arrayContaining([
      'auto_review_package',
      'auto_shadow',
    ]))
    expect(review.suggestedNextRoutes).not.toContain('auto_publish')
  })

  it('can suggest canary readiness for manual assets without treating the suggestion as runtime permission', () => {
    const review = buildAlgorithmAssetAutomationMaturityReview({
      assetKey: 'risk.warning.manual.rule',
      sourceSystem: 'riskIssueWarningGovernanceSignalService',
      publishAnchor: 'no_unattended_runtime_auto_publish',
      automationMaturity: 'auto_shadow',
      learningMaturity: 'system_curated_learning',
      learningTarget: 'risk_warning',
      requestedRuntimeEffect: 'direct_effect_request',
      requestAnchorUpgrade: true,
      evidence: {
        replayPassed: true,
        conflictFree: true,
        crossCompanyReplayPassed: true,
        rollbackTarget: 'risk-warning-v4',
        sourceHealthPassed: true,
      },
    })

    expect(review).toEqual(expect.objectContaining({
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_shadow',
      currentRoute: 'manual_unlock_package',
      canWriteRuntimeNow: false,
      canModifyPublishAnchorNow: false,
    }))
    expect(review.suggestedNextRoutes).toEqual(expect.arrayContaining([
      'anchor_upgrade_candidate',
      'auto_canary',
    ]))
    expect(review.moreVerificationNeeds).toEqual(expect.arrayContaining([
      'domain_writer_contract_required',
      'canary_aware_consumer_required',
      'impact_monitoring_required',
      'versioned_anchor_upgrade_approval_required',
    ]))
    expect(review.blockedRuntimeClaims).toEqual(expect.arrayContaining([
      'automation_unlock_is_not_publish_permission',
      'canary_suggestion_is_not_runtime_publication',
      'manual_anchor_requires_versioned_upgrade_before_release_gate',
    ]))
  })
})
