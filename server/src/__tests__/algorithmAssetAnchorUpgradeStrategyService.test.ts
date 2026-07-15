import { describe, expect, it } from 'vitest'
import {
  evaluateAlgorithmAssetAnchorUpgradeStrategy,
} from '../services/algorithmAssetAnchorUpgradeStrategyService.js'

describe('algorithmAssetAnchorUpgradeStrategyService', () => {
  it('blocks a manual anchor upgrade when evidence is only a single candidate or replay', () => {
    const result = evaluateAlgorithmAssetAnchorUpgradeStrategy({
      assetKey: 'critical.path.manual.rule',
      requestedBy: 'service',
      currentPublishAnchor: 'manual_governance_required',
      requestedPublishAnchor: 'guarded_runtime_auto_publish',
      currentAutomationMaturity: 'manual_required',
      requestedAutomationMaturity: 'auto_publish',
      evidence: {
        strategyKey: 'critical-path-auto-publish',
        strategyVersion: 'v1',
        evidenceThresholdsPassed: true,
        replayPassed: true,
        conflictFree: true,
        singleCandidateOnly: true,
        impactScope: {
          projectCount: 1,
          companyCount: 1,
          scenarioCount: 1,
        },
        rollbackTarget: 'critical-path-v2',
        auditRecordId: 'audit-1',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'upgrade_blocked',
      canGenerateVersionedUpgrade: false,
      canModifyPublishAnchor: false,
      canWriteRuntime: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'single_candidate_or_single_replay_cannot_upgrade_manual_anchor',
      'cross_project_or_cross_company_evidence_required',
    ]))
    expect(result.versionedUpgrade).toBeNull()
  })

  it('generates a versioned upgrade candidate only when strategy, threshold, impact, rollback and audit evidence are complete', () => {
    const result = evaluateAlgorithmAssetAnchorUpgradeStrategy({
      assetKey: 'duration.context.weather_multiplier',
      requestedBy: 'system',
      currentPublishAnchor: 'manual_governance_required',
      requestedPublishAnchor: 'guarded_runtime_auto_publish',
      currentAutomationMaturity: 'manual_required',
      requestedAutomationMaturity: 'auto_canary',
      evidence: {
        strategyKey: 'duration-context-canary-upgrade',
        strategyVersion: 'v3',
        evidenceThresholdsPassed: true,
        replayPassed: true,
        conflictFree: true,
        crossCompanyReplayPassed: true,
        impactScope: {
          projectCount: 18,
          companyCount: 5,
          scenarioCount: 9,
        },
        rollbackTarget: 'duration-context-weather-v2',
        auditRecordId: 'audit-2026-06-14-001',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'upgrade_candidate_ready',
      canGenerateVersionedUpgrade: true,
      canModifyPublishAnchor: false,
      canWriteRuntime: false,
    }))
    expect(result.versionedUpgrade).toEqual(expect.objectContaining({
      assetKey: 'duration.context.weather_multiplier',
      strategyKey: 'duration-context-canary-upgrade',
      strategyVersion: 'v3',
      fromPublishAnchor: 'manual_governance_required',
      toPublishAnchor: 'guarded_runtime_auto_publish',
      fromAutomationMaturity: 'manual_required',
      toAutomationMaturity: 'auto_canary',
      rollbackTarget: 'duration-context-weather-v2',
      auditRecordId: 'audit-2026-06-14-001',
    }))
  })
})
