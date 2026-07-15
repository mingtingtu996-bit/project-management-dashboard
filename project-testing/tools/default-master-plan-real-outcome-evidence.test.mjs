import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  normalizeRealProductionOutcomeEvidence,
  realProductionOutcomeQualityBlockers,
  validateRealProductionOutcomeEvidence,
  validateRealProductionOutcomeFile,
} from './default-master-plan-real-outcome-evidence.mjs'

test('validates real production outcome identity, environment, status, and evidence ref', () => {
  const blockers = validateRealProductionOutcomeEvidence({
    status: 'draft',
    environment: 'staging',
    baseline_id: 'wrong-baseline',
    project_id: 'project-1',
    publication_key: 'publication-1',
  }, {
    targetEnvironment: 'production',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
  })

  assert.deepEqual(blockers, [
    'real_production_outcome_status_pass_required',
    'real_production_outcome_production_or_live_environment_required',
    'real_production_outcome_environment_mismatch',
    'real_production_outcome_baseline_id_mismatch',
    'real_production_outcome_evidence_ref_required',
    'real_production_outcome_target_required',
    'real_production_outcome_target_supabase_project_ref_required',
    'real_production_outcome_target_database_host_required',
    'real_production_outcome_target_connection_source_required',
    'real_production_outcome_target_environment_required',
    'real_production_outcome_accepted_by_required',
    'real_production_outcome_accepted_at_required',
    'real_production_outcome_approval_ref_required',
    'real_production_outcome_runtime_publication_evidence_ref_required',
    'real_production_outcome_api_read_smoke_evidence_ref_required',
    'real_production_outcome_ui_consumption_smoke_evidence_ref_required',
    'real_production_outcome_critical_path_readback_evidence_ref_required',
    'real_production_outcome_rollback_evidence_ref_required',
  ])
})

test('accepts aliased production outcome fields when the evidence is complete', () => {
  const evidence = normalizeRealProductionOutcomeEvidence({
    status: 'verified',
    target_environment: 'live',
    environment_target: {
      env_file_ref: 'deploy/env/live.env',
      supabase_project_ref: 'live-ref-1',
      database_host: 'db.live-ref-1.supabase.co',
      connection_source: 'SUPABASE_MIGRATION_URL',
      environment: 'live',
    },
    baseline_id: 'baseline-1',
    project_id: 'project-1',
    publication_key: 'publication-1',
    source_evidence_ref: `real-outcome:publication-1#sha256=${'a'.repeat(64)}`,
    reviewed_by: 'operator:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    reviewed_at: '2026-07-02T10:00:00.000Z',
    approval_ref: 'approval:release-window-1',
    runtime_publication_evidence_ref: `wbs_template_runtime_publications_export:project-testing/reports/default-master-plan-production-readiness/runtime-publications.json#sha256=${'1'.repeat(64)}`,
    api_read_smoke_evidence_ref: `api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json#sha256=${'2'.repeat(64)}`,
    ui_consumption_smoke_evidence_ref: `ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/ui-smoke.json#sha256=${'3'.repeat(64)}`,
    critical_path_readback_evidence_ref: `critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=${'4'.repeat(64)}`,
    rollback_evidence_ref: `rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json#sha256=${'5'.repeat(64)}`,
  })

  assert.deepEqual(evidence, {
    status: 'verified',
    environment: 'live',
    target: {
      envFileRef: 'deploy/env/live.env',
      supabaseProjectRef: 'live-ref-1',
      databaseHost: 'db.live-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'live',
    },
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    evidenceRef: `real-outcome:publication-1#sha256=${'a'.repeat(64)}`,
    acceptedBy: 'operator:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-02T10:00:00.000Z',
    approvalRef: 'approval:release-window-1',
    runtimePublicationEvidenceRef: `wbs_template_runtime_publications_export:project-testing/reports/default-master-plan-production-readiness/runtime-publications.json#sha256=${'1'.repeat(64)}`,
    apiReadSmokeEvidenceRef: `api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json#sha256=${'2'.repeat(64)}`,
    uiConsumptionSmokeEvidenceRef: `ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/ui-smoke.json#sha256=${'3'.repeat(64)}`,
    criticalPathReadbackEvidenceRef: `critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=${'4'.repeat(64)}`,
    rollbackEvidenceRef: `rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json#sha256=${'5'.repeat(64)}`,
  })
  assert.deepEqual(validateRealProductionOutcomeEvidence(evidence, {
    targetEnvironment: 'live',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
  }), [])
})

test('validates real production outcome files before production source export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-'))
  const materialPath = path.join(root, 'real-production-outcome.json')
  await writeFile(materialPath, `${JSON.stringify({ status: 'draft' })}\n`, 'utf8')

  try {
    assert.deepEqual(await validateRealProductionOutcomeFile(materialPath, {
      targetEnvironment: 'production',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
    }), [
      'real_production_outcome_status_pass_required',
      'real_production_outcome_environment_required',
      'real_production_outcome_baseline_id_mismatch',
      'real_production_outcome_project_id_mismatch',
      'real_production_outcome_publication_key_mismatch',
      'real_production_outcome_evidence_ref_required',
      'real_production_outcome_target_required',
      'real_production_outcome_target_supabase_project_ref_required',
      'real_production_outcome_target_database_host_required',
      'real_production_outcome_target_connection_source_required',
      'real_production_outcome_target_environment_required',
      'real_production_outcome_accepted_by_required',
      'real_production_outcome_accepted_at_required',
      'real_production_outcome_approval_ref_required',
      'real_production_outcome_runtime_publication_evidence_ref_required',
      'real_production_outcome_api_read_smoke_evidence_ref_required',
      'real_production_outcome_ui_consumption_smoke_evidence_ref_required',
      'real_production_outcome_critical_path_readback_evidence_ref_required',
      'real_production_outcome_rollback_evidence_ref_required',
    ])
    assert.deepEqual(await validateRealProductionOutcomeFile(path.join(root, 'missing.json'), {
      targetEnvironment: 'production',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
    }), ['real_production_outcome_source_file_missing'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports real production outcome quality blockers without rechecking identity', () => {
  assert.deepEqual(realProductionOutcomeQualityBlockers({
    status: 'draft',
    environment: 'staging',
    evidenceRef: '',
  }), [
    'real_production_outcome_status_pass_required',
    'real_production_outcome_production_or_live_environment_required',
    'real_production_outcome_evidence_ref_required',
    'real_production_outcome_target_required',
    'real_production_outcome_target_supabase_project_ref_required',
    'real_production_outcome_target_database_host_required',
    'real_production_outcome_target_connection_source_required',
    'real_production_outcome_target_environment_required',
    'real_production_outcome_accepted_by_required',
    'real_production_outcome_accepted_at_required',
    'real_production_outcome_approval_ref_required',
    'real_production_outcome_runtime_publication_evidence_ref_required',
    'real_production_outcome_api_read_smoke_evidence_ref_required',
    'real_production_outcome_ui_consumption_smoke_evidence_ref_required',
    'real_production_outcome_critical_path_readback_evidence_ref_required',
    'real_production_outcome_rollback_evidence_ref_required',
  ])
})

test('does not accept staging controlled replay as real production outcome material', () => {
  const blockers = validateRealProductionOutcomeEvidence({
    status: 'verified',
    environment: 'staging',
    target: {
      envFileRef: 'server/.env',
      supabaseProjectRef: 'staging-ref-1',
      databaseHost: 'db.staging-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'staging',
    },
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    evidenceRef: 'staging-outcome:publication-1#sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    acceptedBy: 'operator:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-02T10:00:00.000Z',
    approvalRef: 'approval:staging',
    runtimePublicationEvidenceRef: `wbs_template_runtime_publications_export:project-testing/reports/default-master-plan-production-readiness/runtime-publications.json#sha256=${'1'.repeat(64)}`,
    apiReadSmokeEvidenceRef: `api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json#sha256=${'2'.repeat(64)}`,
    uiConsumptionSmokeEvidenceRef: `ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/ui-smoke.json#sha256=${'3'.repeat(64)}`,
    criticalPathReadbackEvidenceRef: `critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=${'4'.repeat(64)}`,
    rollbackEvidenceRef: `rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json#sha256=${'5'.repeat(64)}`,
  }, {
    targetEnvironment: 'staging',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
  })

  assert.deepEqual(blockers, [
    'real_production_outcome_production_or_live_environment_required',
  ])
})
