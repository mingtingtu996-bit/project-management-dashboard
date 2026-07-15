import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  buildDurationRuntimeConsumptionLocalEvidence,
} from '../scripts/build-duration-runtime-consumption-local-evidence.js'

const wizardReceipt = {
  consumer: 'wizard_master_plan',
  assetType: 'standard_work_duration_seed',
  stableCode: 'cast_in_place_concrete',
  role: 'system_bootstrap',
  effectiveSource: 'system_bootstrap',
  versionId: null,
  publicationKey: null,
  status: 'effective_applied',
  changedFields: ['duration'],
  targetRowIds: ['master-row-1'],
  reasonCodes: [],
  rollbackTarget: null,
}

const accuracyFixture = JSON.parse(readFileSync(fileURLToPath(new URL(
  '../fixtures/duration-accuracy/frozen-accepted-samples.json',
  import.meta.url,
)), 'utf8'))

describe('duration runtime consumption local evidence builder', () => {
  it('uses real local service assembly while preserving candidate-only environment boundaries', async () => {
    const evidence = await buildDurationRuntimeConsumptionLocalEvidence({
      simulation: {
        generatedAt: '2026-07-11T12:00:00.000Z',
        status: 'pass',
        environmentTarget: 'local_static',
        mutationBoundary: 'report_files_only_no_db_writes',
        primaryBusinessType: 'general_civil',
        plans: [{
          project: { businessType: 'general_civil' },
          summary: {
            status: 'pass',
            scheduleRowCount: 102,
            visibleSignificanceLeakRowCount: 0,
            dependencyCycleRowCount: 0,
          },
          generation: {
            defaultPlanOutput: 'master_plan',
            durationAssetConsumptionReceipts: [wizardReceipt],
          },
        }],
      },
      accuracyFixture,
      codeDigest: 'sha256:test-code',
      generatedAt: '2026-07-11T13:00:00.000Z',
      localVerification: {
        focusedTestsPassed: true,
        scopedTypecheckPassed: true,
        scopedRegistryGuardPassed: true,
        globalRegistryGuardStatus: 'blocked_unrelated',
        globalRegistryGuardBlockers: ['parallel-service'],
        scopedWorkspaceIsolationGuardPassed: true,
        globalWorkspaceIsolationGuardStatus: 'blocked_unrelated',
        globalWorkspaceIsolationGuardBlockers: ['activeProjectService.listActiveProjectIds'],
        retainedRegressionPassed: true,
        globalTypecheckStatus: 'blocked_unrelated',
        globalTypecheckBlockers: ['parallel-test.ts'],
      },
    })

    expect(evidence.environmentClassification).toBe('candidate_readonly')
    expect(evidence.mutationBoundary).toBe('local_files_only_no_db_writes')
    expect(evidence.simulation).toEqual(expect.objectContaining({
      status: 'pass',
      environmentTarget: 'local_static',
      masterPlanSimpleAndControlFocused: true,
      drilldownUsesGovernedT2Assets: true,
    }))
    const effectiveConsumers = new Set(evidence.receipts
      .filter((receipt) => receipt.status === 'effective_applied')
      .map((receipt) => receipt.consumer))
    expect(evidence.requiredConsumers.every((consumer) => effectiveConsumers.has(consumer))).toBe(true)
    expect(evidence.receipts).toContainEqual(expect.objectContaining({
      effectiveSource: 'company_stable',
      publicationKey: 'local-candidate:duration-blend:company-a',
      rollbackTarget: 'duration.benchmark_blend_weight.default',
      status: 'effective_applied',
    }))
    expect(evidence.runtimePublicationSelection).toEqual(expect.objectContaining({
      effectiveSource: 'stable_runtime_publication',
      runtimeApplied: true,
    }))
    expect(evidence.revisionResults).toEqual([expect.objectContaining({
      status: 'revision_draft_created',
      revisionStatus: 'revising',
      confirmationRequired: true,
      autoConfirmed: false,
    })])
    expect(evidence.localVerification.accuracy).toEqual(expect.objectContaining({
      sampleCount: 8,
      lineageCompleteCount: 8,
      meanAbsoluteErrorDays: 0.5,
    }))
    expect(evidence.environments).toEqual({ staging: null, productionLive: null })
  })
})
