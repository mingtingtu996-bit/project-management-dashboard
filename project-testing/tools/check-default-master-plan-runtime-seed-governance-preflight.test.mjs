import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRuntimeSeedGovernancePreflight,
} from './check-default-master-plan-runtime-seed-governance-preflight.mjs'

test('marks duration asset seed governance ready only when both strict validations pass', () => {
  const report = buildRuntimeSeedGovernancePreflight({
    validationResults: [
      validationResult('standard_work_duration', true),
      validationResult('t2_division_rhythm_template', true),
    ],
    generatedAt: '2026-07-10T02:00:00.000Z',
  })

  assert.equal(report.status, 'runtime_seed_governance_preflight_ready')
  assert.equal(report.readyForGovernedImport, true)
  assert.deepEqual(report.seedTypesReadyForImport, [
    'standard_work_duration',
    't2_division_rhythm_template',
  ])
  assert.deepEqual(report.blockers, [])
  assert.equal(report.mutationBoundary.readsDatabase, false)
  assert.equal(report.mutationBoundary.writesAlgorithmSeedRecords, false)
})

test('keeps governed import blocked when T2 strict validation fails', () => {
  const report = buildRuntimeSeedGovernancePreflight({
    validationResults: [
      validationResult('standard_work_duration', true),
      validationResult('t2_division_rhythm_template', false, [
        'INVALID_SEED_VERSION',
        'RECORD_EVIDENCE_INCOMPLETE',
      ]),
    ],
    generatedAt: '2026-07-10T02:01:00.000Z',
  })

  assert.equal(report.status, 'runtime_seed_governance_preflight_blocked')
  assert.equal(report.readyForGovernedImport, false)
  assert.deepEqual(report.seedTypesReadyForImport, ['standard_work_duration'])
  assert.deepEqual(report.blockers, [
    'runtime_seed_governance_validation_failed:t2_division_rhythm_template',
  ])
  assert.deepEqual(report.validations[1].issueCodes, [
    'INVALID_SEED_VERSION',
    'RECORD_EVIDENCE_INCOMPLETE',
  ])
})

function validationResult(seedType, ok, issueCodes = []) {
  return {
    seedType,
    validation: {
      ok,
      strict: true,
      entries: [
        {
          seedType,
          seedVersion: `test:${seedType}`,
          expectedCount: 1,
          actualCount: 1,
        },
      ],
      issues: issueCodes.map((code) => ({
        seedType,
        severity: 'error',
        code,
        message: code,
      })),
    },
  }
}
