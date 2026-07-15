import { describe, expect, it } from 'vitest'

import { createAlgorithmAssetCandidateEvent } from '../services/algorithmAssetCandidateEventAdapterService.js'
import { buildAlgorithmAssetReleaseExitPackage } from '../services/algorithmAssetReleaseExitService.js'
import {
  buildAcceptanceTemplatePolicyReleaseRecord,
  buildCertificateTemplatePolicyReleaseRecord,
} from '../services/policyTemplateReleaseAdapterService.js'
import { publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots } from '../services/acceptanceTemplatePolicyUpdateService.js'
import { publishCertificatePolicyAutoPublishPlan } from '../services/certificateTemplatePolicyUpdateService.js'

function buildReadyReleaseExit(assetKey: string, sourceSystem: string, rollbackTarget: string) {
  const candidateEvent = createAlgorithmAssetCandidateEvent({
    assetKey,
    sourceSystem,
    assetType: 'template',
    allowSystemReleaseScope: true,
    candidatePayload: { sourceSystem },
    learningTarget: 'template_structure',
    learningMaturity: 'system_curated_learning',
    publishAnchor: 'trusted_source_auto_publish',
    automationMaturity: 'auto_publish',
    requestedRuntimeEffect: 'bounded_calibration',
    evidence: {
      sourceHealthPassed: true,
      conflictFree: true,
      rollbackTarget,
    },
  })

  return buildAlgorithmAssetReleaseExitPackage({
    candidateEvent,
    conflictResult: 'no_conflict_publish_allowed',
    replaySummary: {
      replayPassed: true,
      runtimeImpact: 'publish_gate_evidence',
    },
    releaseAdapter: {
      adapterKey: sourceSystem,
      targetSurface: 'system_seed',
      supportsRollback: true,
    },
    platformPolicy: {
      systemAutoPublishPolicyReady: true,
      impactMonitoringReady: true,
      platformReleaseExitReady: true,
    },
  })
}

describe('policyTemplateReleaseAdapterService', () => {
  it('builds a certificate policy release record only from a ready release-exit package', () => {
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })
    const update = run.autoPublishedUpdates[0]
    const releaseExit = buildReadyReleaseExit(
      `certificate.policy_update.${update.assetCode}`,
      'certificateTemplatePolicyReleaseAdapter',
      `certificate-template-policy:${run.seedVersion}`,
    )

    const result = buildCertificateTemplatePolicyReleaseRecord({ run, releaseExit })

    expect(result).toEqual(expect.objectContaining({
      status: 'release_record_ready',
      targetTable: 'certificate_template_policy_auto_publish_runs',
      canPersist: true,
      rollbackTarget: `certificate-template-policy:${run.seedVersion}`,
    }))
    expect(result.runRecord).toEqual(expect.objectContaining({
      run_id: run.runId,
      publication_status: 'published',
      automation_quality: expect.objectContaining({
        releaseExit: expect.objectContaining({
          adapterKey: 'certificateTemplatePolicyReleaseAdapter',
          assetKey: `certificate.policy_update.${update.assetCode}`,
          targetSurface: 'system_seed',
          rollbackTarget: `certificate-template-policy:${run.seedVersion}`,
        }),
      }),
    }))
  })

  it('blocks certificate policy release records when release-exit has not produced a handoff package', () => {
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })
    const update = run.autoPublishedUpdates[0]
    const candidateEvent = createAlgorithmAssetCandidateEvent({
      assetKey: `certificate.policy_update.${update.assetCode}`,
      sourceSystem: 'certificateTemplatePolicyReleaseAdapter',
      assetType: 'template',
      allowSystemReleaseScope: true,
      learningTarget: 'template_structure',
      learningMaturity: 'system_curated_learning',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        sourceHealthPassed: true,
        conflictFree: true,
        rollbackTarget: `certificate-template-policy:${run.seedVersion}`,
      },
    })
    const releaseExit = buildAlgorithmAssetReleaseExitPackage({
      candidateEvent,
      conflictResult: 'no_conflict_publish_allowed',
      releaseAdapter: {
        adapterKey: 'certificateTemplatePolicyReleaseAdapter',
        targetSurface: 'system_seed',
        supportsRollback: true,
      },
    })

    const result = buildCertificateTemplatePolicyReleaseRecord({ run, releaseExit })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      canPersist: false,
      runRecord: null,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'release_exit_package_required',
    ]))
  })

  it('builds an acceptance policy release record only from a ready release-exit package', async () => {
    const run = await publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots({ asOfDate: '2026-09-01' })
    const update = run.autoPublishedUpdates[0]
    const releaseExit = buildReadyReleaseExit(
      `acceptance.policy_update.${update.assetCode}`,
      'acceptanceTemplatePolicyReleaseAdapter',
      `acceptance-template-policy:${run.seedVersion}`,
    )

    const result = buildAcceptanceTemplatePolicyReleaseRecord({ run, releaseExit })

    expect(result).toEqual(expect.objectContaining({
      status: 'release_record_ready',
      targetTable: 'acceptance_template_policy_auto_publish_runs',
      canPersist: true,
      rollbackTarget: `acceptance-template-policy:${run.seedVersion}`,
    }))
    expect(result.runRecord).toEqual(expect.objectContaining({
      run_id: run.runId,
      publication_status: 'published',
      automation_quality: expect.objectContaining({
        releaseExit: expect.objectContaining({
          adapterKey: 'acceptanceTemplatePolicyReleaseAdapter',
          assetKey: `acceptance.policy_update.${update.assetCode}`,
          targetSurface: 'system_seed',
          rollbackTarget: `acceptance-template-policy:${run.seedVersion}`,
        }),
      }),
    }))
  })
})
