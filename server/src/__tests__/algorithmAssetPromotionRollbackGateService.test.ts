import { describe, expect, it } from 'vitest'

import {
  evaluateAlgorithmAssetPromotionCompletion,
  evaluateAlgorithmAssetRollbackCompletion,
} from '../services/algorithmAssetPromotionRollbackGateService.js'

describe('algorithmAssetPromotionRollbackGateService', () => {
  it('does not treat release-exit handoff as completed runtime promotion without writer and consumer verification', () => {
    const result = evaluateAlgorithmAssetPromotionCompletion({
      assetKey: 'duration.context.rain_factor',
      releaseExitStatus: 'release_package_ready',
      releaseExitHandoffReady: true,
      releasePackageId: 'release-package-1',
      targetSurface: 'company_override',
      rollbackTarget: 'rain-factor-v1',
    })

    expect(result).toEqual({
      status: 'promotion_blocked',
      canDeclareRuntimePublished: false,
      runtimePublicationState: 'not_published',
      reasons: [
        'domain_writer_execution_required',
        'release_record_required',
        'consumer_verification_required',
        'impact_monitoring_required',
      ],
    })
  })

  it('allows runtime promotion only after domain writer, release record, consumer verification, monitoring and rollback target are explicit', () => {
    const result = evaluateAlgorithmAssetPromotionCompletion({
      assetKey: 'duration.context.rain_factor',
      releaseExitStatus: 'release_package_ready',
      releaseExitHandoffReady: true,
      releasePackageId: 'release-package-1',
      targetSurface: 'company_override',
      rollbackTarget: 'rain-factor-v1',
      domainWriterExecution: {
        writerKey: 'durationContextCompanyOverrideWriter',
        status: 'runtime_written',
        wroteRuntimeProjection: true,
      },
      releaseRecord: {
        releaseRecordId: 'release-record-1',
        publicationStatus: 'published',
      },
      consumerVerification: {
        consumerKey: 'durationContextService.resource_conflict',
        status: 'verified',
        readsPublishedVersion: true,
      },
      impactMonitoring: {
        status: 'monitoring_armed',
      },
    })

    expect(result).toEqual({
      status: 'runtime_promotion_confirmed',
      canDeclareRuntimePublished: true,
      runtimePublicationState: 'published',
      reasons: [],
    })
  })

  it('does not treat rollback target or audit event as completed rollback until writer disables runtime and consumers stop reading it', () => {
    const result = evaluateAlgorithmAssetRollbackCompletion({
      assetKey: 'duration.context.rain_factor',
      sourcePublicationKey: 'publication-1',
      rollbackTarget: 'rain-factor-v1',
      rollbackAuditRecorded: true,
      rollbackEventRecorded: true,
    })

    expect(result).toEqual({
      status: 'rollback_blocked',
      canDeclareRollbackComplete: false,
      runtimePublicationState: 'rollback_pending',
      reasons: [
        'rollback_writer_execution_required',
        'rollback_disable_or_degrade_required',
        'consumer_no_longer_reads_rolled_back_version_required',
      ],
    })
  })

  it('allows rollback completion only when the domain writer disables runtime and consumer verification rejects the rolled-back version', () => {
    const result = evaluateAlgorithmAssetRollbackCompletion({
      assetKey: 'duration.context.rain_factor',
      sourcePublicationKey: 'publication-1',
      rollbackTarget: 'rain-factor-v1',
      rollbackAuditRecorded: true,
      rollbackEventRecorded: true,
      rollbackWriterExecution: {
        writerKey: 'durationContextCompanyOverrideWriter',
        status: 'runtime_rolled_back',
        disabledRuntimeProjection: true,
      },
      consumerVerification: {
        consumerKey: 'durationContextService.resource_conflict',
        status: 'verified',
        noLongerReadsRolledBackVersion: true,
      },
    })

    expect(result).toEqual({
      status: 'runtime_rollback_confirmed',
      canDeclareRollbackComplete: true,
      runtimePublicationState: 'rolled_back',
      reasons: [],
    })
  })
})
