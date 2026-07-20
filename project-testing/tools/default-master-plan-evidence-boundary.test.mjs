import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NON_PRODUCTION_ENVIRONMENT_BLOCKER,
  REAL_PRODUCTION_OUTCOME_REQUIRED_BLOCKER,
  buildProductionReadinessQualification,
} from './default-master-plan-evidence-boundary.mjs'

const COMPLETE_REAL_OUTCOME_EVIDENCE = {
  status: 'verified',
  environment: 'production',
  evidenceRef: `project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=${'a'.repeat(64)}`,
  target: {
    envFileRef: 'server/.env.production',
    supabaseProjectRef: 'prodref123',
    databaseHost: 'db.prodref123.supabase.co',
    connectionSource: 'SUPABASE_MIGRATION_URL',
    environment: 'production',
  },
  acceptedBy: 'project-manager://zheng-junhong',
  acceptedAt: '2026-07-02T10:00:00.000Z',
  approvalRef: 'approval:default-master-plan-production-outcome',
  runtimePublicationEvidenceRef: `duration_learning_runtime_publications_export:project-testing/reports/default-master-plan-production-readiness/runtime-publication-evidence.json#sha256=${'b'.repeat(64)}`,
  runtimeConsumptionEvidenceRef: `duration_learning_runtime_consumptions_export:project-testing/reports/default-master-plan-production-readiness/runtime-consumption-evidence.json#sha256=${'6'.repeat(64)}`,
  apiReadSmokeEvidenceRef: `api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json#sha256=${'c'.repeat(64)}`,
  uiConsumptionSmokeEvidenceRef: `ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json#sha256=${'d'.repeat(64)}`,
  criticalPathReadbackEvidenceRef: `critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=${'e'.repeat(64)}`,
  rollbackEvidenceRef: `rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/rollback-verification.json#sha256=${'f'.repeat(64)}`,
}

test('production readiness boundary rejects production-looking real outcome evidence without target and material refs', () => {
  const result = buildProductionReadinessQualification([
    {
      label: 'sourceManifest',
      value: {
        realProductionOutcomeEvidence: {
          status: 'verified',
          environment: 'production',
          evidenceRef: `project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=${'a'.repeat(64)}`,
        },
      },
    },
  ])

  assert.equal(result.productionReadyAllowed, false)
  assert.deepEqual(result.blockers, [REAL_PRODUCTION_OUTCOME_REQUIRED_BLOCKER])
  assert.equal(result.realOutcomeMarkerCount, 0)
})

test('production readiness boundary accepts a complete production real outcome evidence marker', () => {
  const result = buildProductionReadinessQualification([
    {
      label: 'sourceManifest',
      value: {
        realProductionOutcomeEvidence: COMPLETE_REAL_OUTCOME_EVIDENCE,
      },
    },
  ])

  assert.equal(result.productionReadyAllowed, true)
  assert.deepEqual(result.blockers, [])
  assert.equal(result.realOutcomeMarkerCount, 1)
})

test('production readiness boundary rejects production evidence whose target is still staging', () => {
  const result = buildProductionReadinessQualification([
    {
      label: 'sourceManifest',
      value: {
        realProductionOutcomeEvidence: {
          ...COMPLETE_REAL_OUTCOME_EVIDENCE,
          target: {
            ...COMPLETE_REAL_OUTCOME_EVIDENCE.target,
            environment: 'staging',
          },
        },
      },
    },
  ])

  assert.equal(result.productionReadyAllowed, false)
  assert.ok(result.blockers.includes(REAL_PRODUCTION_OUTCOME_REQUIRED_BLOCKER))
  assert.ok(result.blockers.includes(NON_PRODUCTION_ENVIRONMENT_BLOCKER))
  assert.equal(result.realOutcomeMarkerCount, 0)
})

test('production readiness boundary rejects real outcome marker with weak material refs', () => {
  const result = buildProductionReadinessQualification([
    {
      label: 'sourceManifest',
      value: {
        realProductionOutcomeEvidence: {
          ...COMPLETE_REAL_OUTCOME_EVIDENCE,
          runtimePublicationEvidenceRef: 'manual-note-runtime-publication',
          runtimeConsumptionEvidenceRef: 'manual-note-runtime-consumption',
          apiReadSmokeEvidenceRef: 'manual-note-api-smoke',
          uiConsumptionSmokeEvidenceRef: 'manual-note-ui-smoke',
          criticalPathReadbackEvidenceRef: 'manual-note-critical-path',
          rollbackEvidenceRef: 'manual-note-rollback',
        },
      },
    },
  ])

  assert.equal(result.productionReadyAllowed, false)
  assert.deepEqual(result.blockers, [REAL_PRODUCTION_OUTCOME_REQUIRED_BLOCKER])
  assert.equal(result.realOutcomeMarkerCount, 0)
})

test('production readiness boundary rejects real outcome marker with weak acceptedBy actor', () => {
  const result = buildProductionReadinessQualification([
    {
      label: 'sourceManifest',
      value: {
        realProductionOutcomeEvidence: {
          ...COMPLETE_REAL_OUTCOME_EVIDENCE,
          acceptedBy: 'unknown',
        },
      },
    },
  ])

  assert.equal(result.productionReadyAllowed, false)
  assert.deepEqual(result.blockers, [REAL_PRODUCTION_OUTCOME_REQUIRED_BLOCKER])
  assert.equal(result.realOutcomeMarkerCount, 0)
})

test('production readiness boundary ignores controlled replay strings inside rejected-marker contracts', () => {
  const result = buildProductionReadinessQualification([
    {
      label: 'durationSampleCollectionPackage',
      value: {
        realDurationSampleMaterialContract: {
          rejectedMarkers: [
            'stagingControlledReplay=true',
            'notRealProductionOutcome=true',
            'metadata.source=default_master_plan_staging_runtime_writer',
          ],
        },
      },
    },
    {
      label: 'sourceManifest',
      value: {
        realProductionOutcomeEvidence: COMPLETE_REAL_OUTCOME_EVIDENCE,
      },
    },
  ])

  assert.equal(result.productionReadyAllowed, true)
  assert.deepEqual(result.blockers, [])
  assert.equal(result.controlledReplayMarkerCount, 0)
  assert.equal(result.realOutcomeMarkerCount, 1)
})
