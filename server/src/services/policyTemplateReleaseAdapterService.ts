import {
  mapAcceptancePolicyAutoPublishRunToRecord,
  type AcceptancePolicyAutoPublishRun,
  type AcceptancePolicyAutoPublishRunRecord,
} from './acceptanceTemplatePolicyUpdateService.js'
import type { AlgorithmAssetReleaseExitResult } from './algorithmAssetReleaseExitService.js'
import {
  mapCertificatePolicyAutoPublishRunToRecord,
  type CertificatePolicyAutoPublishRun,
  type CertificatePolicyAutoPublishRunRecord,
} from './certificateTemplatePolicyUpdateService.js'

export type PolicyTemplateReleaseAdapterStatus = 'release_record_ready' | 'blocked'
export type PolicyTemplateReleaseTargetTable =
  | 'certificate_template_policy_auto_publish_runs'
  | 'acceptance_template_policy_auto_publish_runs'

export type PolicyTemplateReleaseRecordResult<TRecord> = {
  status: PolicyTemplateReleaseAdapterStatus
  targetTable: PolicyTemplateReleaseTargetTable
  canPersist: boolean
  rollbackTarget: string | null
  reasons: string[]
  runRecord: TRecord | null
}

type BuildPolicyTemplateReleaseRecordInput<TRun, TRecord> = {
  run: TRun
  releaseExit: AlgorithmAssetReleaseExitResult
  targetTable: PolicyTemplateReleaseTargetTable
  expectedAdapterKey: string
  expectedAssetPrefix: string
  mapRunToRecord: (run: TRun) => TRecord
}

function releaseExitReasons(
  releaseExit: AlgorithmAssetReleaseExitResult,
  expectedAdapterKey: string,
  expectedAssetPrefix: string,
) {
  const reasons: string[] = []
  const releasePackage = releaseExit.releasePackage

  if (releaseExit.status !== 'release_package_ready' || !releasePackage) {
    reasons.push('release_exit_package_required')
  }

  if (releasePackage) {
    if (releasePackage.adapterKey !== expectedAdapterKey) {
      reasons.push('release_adapter_key_mismatch')
    }
    if (releasePackage.targetSurface !== 'system_seed') {
      reasons.push('policy_template_release_requires_system_seed_target')
    }
    if (!releasePackage.assetKey.startsWith(expectedAssetPrefix)) {
      reasons.push('policy_template_release_asset_prefix_mismatch')
    }
    if (!releasePackage.rollbackTarget) {
      reasons.push('rollback_target_required')
    }
  }

  return reasons
}

function attachReleaseExitToAutomationQuality<TRecord>(
  record: TRecord,
  releaseExit: AlgorithmAssetReleaseExitResult,
): TRecord {
  const releasePackage = releaseExit.releasePackage
  if (!releasePackage) return record

  return {
    ...(record as Record<string, unknown>),
    automation_quality: {
      ...((record as { automation_quality?: Record<string, unknown> }).automation_quality ?? {}),
      releaseExit: {
        status: releaseExit.status,
        releaseAction: releaseExit.releaseAction,
        adapterKey: releasePackage.adapterKey,
        assetKey: releasePackage.assetKey,
        eventKey: releasePackage.eventKey,
        targetSurface: releasePackage.targetSurface,
        rollbackTarget: releasePackage.rollbackTarget,
        publishAnchor: releasePackage.publishAnchor,
        automationMaturity: releasePackage.automationMaturity,
        learningMaturity: releasePackage.learningMaturity,
        learningTarget: releasePackage.learningTarget,
      },
    },
  } as TRecord
}

function buildPolicyTemplateReleaseRecord<TRun, TRecord>(
  input: BuildPolicyTemplateReleaseRecordInput<TRun, TRecord>,
): PolicyTemplateReleaseRecordResult<TRecord> {
  const reasons = releaseExitReasons(
    input.releaseExit,
    input.expectedAdapterKey,
    input.expectedAssetPrefix,
  )
  const rollbackTarget = input.releaseExit.releasePackage?.rollbackTarget ?? null

  if (reasons.length > 0) {
    return {
      status: 'blocked',
      targetTable: input.targetTable,
      canPersist: false,
      rollbackTarget,
      reasons,
      runRecord: null,
    }
  }

  return {
    status: 'release_record_ready',
    targetTable: input.targetTable,
    canPersist: true,
    rollbackTarget,
    reasons,
    runRecord: attachReleaseExitToAutomationQuality(
      input.mapRunToRecord(input.run),
      input.releaseExit,
    ),
  }
}

export function buildCertificateTemplatePolicyReleaseRecord(
  input: {
    run: CertificatePolicyAutoPublishRun
    releaseExit: AlgorithmAssetReleaseExitResult
  },
): PolicyTemplateReleaseRecordResult<CertificatePolicyAutoPublishRunRecord> {
  return buildPolicyTemplateReleaseRecord({
    run: input.run,
    releaseExit: input.releaseExit,
    targetTable: 'certificate_template_policy_auto_publish_runs',
    expectedAdapterKey: 'certificateTemplatePolicyReleaseAdapter',
    expectedAssetPrefix: 'certificate.policy_update.',
    mapRunToRecord: mapCertificatePolicyAutoPublishRunToRecord,
  })
}

export function buildAcceptanceTemplatePolicyReleaseRecord(
  input: {
    run: AcceptancePolicyAutoPublishRun
    releaseExit: AlgorithmAssetReleaseExitResult
  },
): PolicyTemplateReleaseRecordResult<AcceptancePolicyAutoPublishRunRecord> {
  return buildPolicyTemplateReleaseRecord({
    run: input.run,
    releaseExit: input.releaseExit,
    targetTable: 'acceptance_template_policy_auto_publish_runs',
    expectedAdapterKey: 'acceptanceTemplatePolicyReleaseAdapter',
    expectedAssetPrefix: 'acceptance.policy_update.',
    mapRunToRecord: mapAcceptancePolicyAutoPublishRunToRecord,
  })
}
