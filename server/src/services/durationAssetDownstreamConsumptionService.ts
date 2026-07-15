import {
  buildDurationAssetConsumptionReceipt,
  summarizeDurationAssetConsumption,
  type DurationAssetConsumptionReceipt,
  type DurationAssetEffectProjection,
} from './durationAssetConsumptionReceiptService.js'
import type { EffectiveDurationAssetResolution } from './durationAssetRuntimeContractService.js'

function uniqueText(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function resolutionFromUpstreamReceipt(
  receipt: DurationAssetConsumptionReceipt,
): EffectiveDurationAssetResolution<null> {
  const blocked = receipt.status === 'blocked_by_conflict'
  return {
    stableCode: receipt.stableCode,
    assetType: receipt.assetType,
    role: receipt.role,
    value: null,
    effectiveSource: receipt.effectiveSource,
    versionId: receipt.versionId,
    publicationKey: receipt.publicationKey,
    suppressedSources: [],
    conflictCodes: blocked
      ? uniqueText(receipt.reasonCodes.length > 0 ? receipt.reasonCodes : ['upstream_asset_conflict'])
      : [],
    runtimeConsumable: receipt.status === 'effective_applied',
    rollbackTarget: receipt.rollbackTarget,
  }
}

export function buildDownstreamDurationAssetConsumption(input: {
  consumer: string
  upstreamReceipts: DurationAssetConsumptionReceipt[]
  before: DurationAssetEffectProjection
  after: DurationAssetEffectProjection
  targetRowIds: string[]
}) {
  const receipts = input.upstreamReceipts.map((upstream) => {
    const canAffectOfficialOutput = upstream.status === 'effective_applied'
    const downstreamBefore = canAffectOfficialOutput ? input.before : input.after
    return buildDurationAssetConsumptionReceipt({
      consumer: input.consumer,
      resolution: resolutionFromUpstreamReceipt(upstream),
      before: downstreamBefore,
      after: input.after,
      targetRowIds: uniqueText([...upstream.targetRowIds, ...input.targetRowIds]),
      applicable: upstream.status !== 'not_applicable',
      reasonCodes: uniqueText([
        ...upstream.reasonCodes,
        `upstream_consumer:${upstream.consumer}`,
        ...(canAffectOfficialOutput
          ? ['official_downstream_output_consumed_effective_asset']
          : ['candidate_not_authorized_for_official_downstream_output']),
      ]),
    })
  })
  return {
    receipts,
    summary: summarizeDurationAssetConsumption(receipts),
  }
}
