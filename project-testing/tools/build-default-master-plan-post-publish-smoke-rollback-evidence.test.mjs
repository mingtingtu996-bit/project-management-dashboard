import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const BUILDER_PATH = path.resolve('project-testing/tools/build-default-master-plan-post-publish-smoke-rollback-evidence.mjs')
const CHECKER_PATH = path.resolve('project-testing/tools/check-default-master-plan-production-readiness.mjs')

test('blocks post-publish smoke rollback evidence when smoke results are missing or not passing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-post-publish-smoke-'))
  const apiSmoke = path.join(root, 'api-smoke.json')
  const uiSmoke = path.join(root, 'ui-smoke.json')
  const outputPath = path.join(root, 'post-publish-smoke-rollback-evidence.json')

  await writeJson(apiSmoke, {
    status: 'failed',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/api-smoke.json',
  })
  await writeJson(uiSmoke, {
    status: 'pass',
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--environment',
      'local',
      '--api-read-smoke',
      apiSmoke,
      '--ui-consumption-smoke',
      uiSmoke,
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /real_environment_required/)
    assert.match(evidence.blockers.join('\n'), /api_read_smoke_pass_required/)
    assert.match(evidence.blockers.join('\n'), /api_read_smoke_baseline_id_required/)
    assert.match(evidence.blockers.join('\n'), /ui_consumption_smoke_project_id_required/)
    assert.match(evidence.blockers.join('\n'), /critical_path_readback_pass_required/)
    assert.match(evidence.blockers.join('\n'), /critical_path_readback_evidence_ref_required/)
    assert.match(evidence.blockers.join('\n'), /rollback_verification_pass_required/)
    assert.match(evidence.blockers.join('\n'), /rollback_target_required/)
    assert.match(evidence.blockers.join('\n'), /rollback_verification_evidence_ref_required/)
    assert.match(evidence.blockers.join('\n'), /rollback_verification_publication_key_required/)
    assert.equal(evidence.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds post-publish smoke rollback evidence from passing real-environment smoke results', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-post-publish-smoke-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const apiSmoke = path.join(root, 'api-smoke.json')
  const uiSmoke = path.join(root, 'ui-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackSmoke = path.join(root, 'rollback-smoke.json')
  const outputPath = path.join(root, 'post-publish-smoke-rollback-evidence.json')

  await writeProfileReport(profileReport)
  await writeResidentialReport(residentialReport)
  await writeJson(apiSmoke, withExportMetadata(passingSmoke('api-read-smoke'), 'api_read_smoke'))
  await writeJson(uiSmoke, withExportMetadata(passingSmoke('ui-consumption-smoke'), 'ui_consumption_smoke'))
  await writeJson(criticalPathReadback, withExportMetadata(passingSmoke('critical-path-readback'), 'critical_path_readback'))
  await writeJson(rollbackSmoke, withExportMetadata({
    status: 'pass',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json',
  }, 'rollback_verification'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--environment',
      'staging',
      '--tested-at',
      '2026-07-01T08:30:00.000Z',
      '--api-read-smoke',
      apiSmoke,
      '--ui-consumption-smoke',
      uiSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackSmoke,
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.schemaVersion, 'workbuddy-default-master-plan-post-publish-smoke-rollback-evidence/v1')
    assert.equal(evidence.status, 'post_publish_smoke_rollback_passed')
    assert.equal(evidence.environment, 'staging')
    assert.equal(evidence.apiReadSmoke.status, 'pass')
    assert.equal(evidence.rollbackVerification.rollbackTarget, 'rollback:default-master-plan-runtime-publication-1')
    assert.equal(evidence.mutationBoundary.writesProductionTables, false)

    await execFileAsync(process.execPath, [
      CHECKER_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--post-publish-smoke-rollback-evidence',
      outputPath,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const smokeGate = report.gates.find((gate) => gate.id === 'post_publish_smoke_and_rollback_evidence')
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(smokeGate.status, 'pass')
    assert.equal(publicationGate.status, 'blocked')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses hashed source-export refs for smoke evidence even when source files contain legacy refs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-post-publish-smoke-'))
  const apiSmoke = path.join(root, 'api-smoke.json')
  const uiSmoke = path.join(root, 'ui-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackSmoke = path.join(root, 'rollback-smoke.json')
  const outputPath = path.join(root, 'post-publish-smoke-rollback-evidence.json')

  await writeJson(apiSmoke, withExportMetadata(passingSmoke('api-read-smoke'), 'api_read_smoke', 'production'))
  await writeJson(uiSmoke, withExportMetadata(passingSmoke('ui-consumption-smoke'), 'ui_consumption_smoke', 'production'))
  await writeJson(criticalPathReadback, withExportMetadata(passingSmoke('critical-path-readback'), 'critical_path_readback', 'production'))
  await writeJson(rollbackSmoke, withExportMetadata({
    status: 'pass',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
    evidenceRef: 'legacy-rollback-ref:default-master-plan-runtime-publication-1#sha256=8888888888888888888888888888888888888888888888888888888888888888',
  }, 'rollback_verification', 'production'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--environment',
      'production',
      '--api-read-smoke',
      apiSmoke,
      '--ui-consumption-smoke',
      uiSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackSmoke,
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'post_publish_smoke_rollback_passed')
    assert.equal(evidence.apiReadSmoke.evidenceRef, await fileEvidenceRef('api_read_smoke_export', apiSmoke))
    assert.equal(evidence.uiConsumptionSmoke.evidenceRef, await fileEvidenceRef('ui_consumption_smoke_export', uiSmoke))
    assert.equal(evidence.criticalPathReadback.evidenceRef, await fileEvidenceRef('critical_path_readback_export', criticalPathReadback))
    assert.equal(evidence.rollbackVerification.evidenceRef, await fileEvidenceRef('rollback_verification_export', rollbackSmoke))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('links real production outcome evidence when supplied with passing production smoke results', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-post-publish-smoke-'))
  const apiSmoke = path.join(root, 'api-smoke.json')
  const uiSmoke = path.join(root, 'ui-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackSmoke = path.join(root, 'rollback-smoke.json')
  const realOutcome = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'post-publish-smoke-rollback-evidence.json')

  await writeJson(apiSmoke, withExportMetadata(passingSmoke('api-read-smoke'), 'api_read_smoke', 'production'))
  await writeJson(uiSmoke, withExportMetadata(passingSmoke('ui-consumption-smoke'), 'ui_consumption_smoke', 'production'))
  await writeJson(criticalPathReadback, withExportMetadata(passingSmoke('critical-path-readback'), 'critical_path_readback', 'production'))
  await writeJson(rollbackSmoke, withExportMetadata({
    status: 'pass',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json',
  }, 'rollback_verification', 'production'))
  await writeJson(realOutcome, withExportMetadata({
    ...await realProductionOutcomeFixture({
      apiReadSmokeEvidenceRef: await fileEvidenceRef('api_read_smoke_export', apiSmoke),
      uiConsumptionSmokeEvidenceRef: await fileEvidenceRef('ui_consumption_smoke_export', uiSmoke),
      criticalPathReadbackEvidenceRef: await fileEvidenceRef('critical_path_readback_export', criticalPathReadback),
      rollbackEvidenceRef: await fileEvidenceRef('rollback_verification_export', rollbackSmoke),
    }),
  }, 'real_production_outcome', 'production'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--environment',
      'production',
      '--tested-at',
      '2026-07-01T10:30:00.000Z',
      '--api-read-smoke',
      apiSmoke,
      '--ui-consumption-smoke',
      uiSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackSmoke,
      '--real-production-outcome',
      realOutcome,
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'post_publish_smoke_rollback_passed')
    assert.equal(evidence.environment, 'production')
    assert.equal(evidence.realProductionOutcomeEvidence.status, 'verified')
    assert.equal(evidence.realProductionOutcomeEvidence.environment, 'production')
    assert.equal(evidence.realProductionOutcomeEvidence.baselineId, 'baseline-1')
    assert.equal(evidence.realProductionOutcomeEvidence.projectId, 'project-1')
    assert.equal(evidence.realProductionOutcomeEvidence.publicationKey, 'default-master-plan-runtime-publication-1')
    assert.match(evidence.realProductionOutcomeEvidence.evidenceRef, /#sha256=[a-f0-9]{64}$/)
    assert.deepEqual(evidence.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks real production outcome evidence when target fingerprint is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-post-publish-smoke-'))
  const apiSmoke = path.join(root, 'api-smoke.json')
  const uiSmoke = path.join(root, 'ui-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackSmoke = path.join(root, 'rollback-smoke.json')
  const realOutcome = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'post-publish-smoke-rollback-evidence.json')
  const { target: _target, ...realOutcomeWithoutTarget } = await realProductionOutcomeFixture()

  await writeJson(apiSmoke, withExportMetadata(passingSmoke('api-read-smoke'), 'api_read_smoke', 'production'))
  await writeJson(uiSmoke, withExportMetadata(passingSmoke('ui-consumption-smoke'), 'ui_consumption_smoke', 'production'))
  await writeJson(criticalPathReadback, withExportMetadata(passingSmoke('critical-path-readback'), 'critical_path_readback', 'production'))
  await writeJson(rollbackSmoke, withExportMetadata({
    status: 'pass',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json',
  }, 'rollback_verification', 'production'))
  await writeJson(realOutcome, withExportMetadata(realOutcomeWithoutTarget, 'real_production_outcome', 'production'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--environment',
      'production',
      '--tested-at',
      '2026-07-01T10:30:00.000Z',
      '--api-read-smoke',
      apiSmoke,
      '--ui-consumption-smoke',
      uiSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackSmoke,
      '--real-production-outcome',
      realOutcome,
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /real_production_outcome_target_required/)
    assert.match(evidence.blockers.join('\n'), /real_production_outcome_target_supabase_project_ref_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks post-publish smoke rollback evidence when smoke source files lack auditable export metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-post-publish-smoke-'))
  const apiSmoke = path.join(root, 'api-smoke.json')
  const uiSmoke = path.join(root, 'ui-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackSmoke = path.join(root, 'rollback-smoke.json')
  const outputPath = path.join(root, 'post-publish-smoke-rollback-evidence.json')

  await writeJson(apiSmoke, passingSmoke('api-read-smoke'))
  await writeJson(uiSmoke, passingSmoke('ui-consumption-smoke'))
  await writeJson(criticalPathReadback, passingSmoke('critical-path-readback'))
  await writeJson(rollbackSmoke, {
    status: 'pass',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json',
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--environment',
      'staging',
      '--tested-at',
      '2026-07-01T08:30:00.000Z',
      '--api-read-smoke',
      apiSmoke,
      '--ui-consumption-smoke',
      uiSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackSmoke,
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /api_read_smoke_metadata_required/)
    assert.match(evidence.blockers.join('\n'), /ui_consumption_smoke_metadata_required/)
    assert.match(evidence.blockers.join('\n'), /critical_path_readback_metadata_required/)
    assert.match(evidence.blockers.join('\n'), /rollback_verification_metadata_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks post-publish smoke rollback evidence when smoke files hide retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-post-publish-smoke-'))
  const apiSmoke = path.join(root, 'api-smoke.json')
  const uiSmoke = path.join(root, 'ui-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackSmoke = path.join(root, 'rollback-smoke.json')
  const outputPath = path.join(root, 'post-publish-smoke-rollback-evidence.json')

  await writeJson(apiSmoke, withExportMetadata({
    ...passingSmoke('api-read-smoke'),
    sourceMetadata: {
      sourceLineage: [
        { scenarioSource: 'manual_comparison_scenario' },
      ],
    },
  }, 'api_read_smoke'))
  await writeJson(uiSmoke, withExportMetadata(passingSmoke('ui-consumption-smoke'), 'ui_consumption_smoke'))
  await writeJson(criticalPathReadback, withExportMetadata(passingSmoke('critical-path-readback'), 'critical_path_readback'))
  await writeJson(rollbackSmoke, withExportMetadata({
    status: 'pass',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json',
  }, 'rollback_verification'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--environment',
      'staging',
      '--tested-at',
      '2026-07-01T08:30:00.000Z',
      '--api-read-smoke',
      apiSmoke,
      '--ui-consumption-smoke',
      uiSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackSmoke,
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /api_read_smoke_retired_or_low_information_default_master_plan_source/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks post-publish smoke rollback evidence when passing smoke files do not carry runtime lineage identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-post-publish-smoke-'))
  const apiSmoke = path.join(root, 'api-smoke.json')
  const uiSmoke = path.join(root, 'ui-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackSmoke = path.join(root, 'rollback-smoke.json')
  const outputPath = path.join(root, 'post-publish-smoke-rollback-evidence.json')

  await writeJson(apiSmoke, {
    status: 'pass',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/api-smoke.json',
  })
  await writeJson(uiSmoke, {
    status: 'pass',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/ui-smoke.json',
  })
  await writeJson(criticalPathReadback, {
    status: 'pass',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json',
  })
  await writeJson(rollbackSmoke, {
    status: 'pass',
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json',
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--environment',
      'staging',
      '--tested-at',
      '2026-07-01T08:30:00.000Z',
      '--api-read-smoke',
      apiSmoke,
      '--ui-consumption-smoke',
      uiSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackSmoke,
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /api_read_smoke_baseline_id_required/)
    assert.match(evidence.blockers.join('\n'), /api_read_smoke_project_id_required/)
    assert.match(evidence.blockers.join('\n'), /api_read_smoke_publication_key_required/)
    assert.match(evidence.blockers.join('\n'), /ui_consumption_smoke_baseline_id_required/)
    assert.match(evidence.blockers.join('\n'), /critical_path_readback_publication_key_required/)
    assert.match(evidence.blockers.join('\n'), /rollback_verification_baseline_id_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks post-publish smoke rollback evidence when passing smoke files belong to another project or publication', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-post-publish-smoke-'))
  const apiSmoke = path.join(root, 'api-smoke.json')
  const uiSmoke = path.join(root, 'ui-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackSmoke = path.join(root, 'rollback-smoke.json')
  const outputPath = path.join(root, 'post-publish-smoke-rollback-evidence.json')

  await writeJson(apiSmoke, {
    ...passingSmoke('api-read-smoke'),
    baselineId: 'baseline-from-other-chain',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
  })
  await writeJson(uiSmoke, {
    ...passingSmoke('ui-consumption-smoke'),
    baselineId: 'baseline-1',
    projectId: 'project-from-other-chain',
    publicationKey: 'default-master-plan-runtime-publication-1',
  })
  await writeJson(criticalPathReadback, {
    ...passingSmoke('critical-path-readback'),
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'different-publication-key',
  })
  await writeJson(rollbackSmoke, {
    status: 'pass',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    rollbackTarget: 'rollback:different-runtime-publication',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json',
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--environment',
      'staging',
      '--tested-at',
      '2026-07-01T08:30:00.000Z',
      '--api-read-smoke',
      apiSmoke,
      '--ui-consumption-smoke',
      uiSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackSmoke,
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /api_read_smoke_baseline_id_mismatch/)
    assert.match(evidence.blockers.join('\n'), /ui_consumption_smoke_project_id_mismatch/)
    assert.match(evidence.blockers.join('\n'), /critical_path_readback_publication_key_mismatch/)
    assert.match(evidence.blockers.join('\n'), /rollback_target_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function passingSmoke(name) {
  return {
    status: 'pass',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: `project-testing/reports/default-master-plan-production-readiness/${name}.json`,
  }
}

async function realProductionOutcomeFixture(overrides = {}) {
  return {
    status: 'verified',
    environment: 'production',
    target: {
      envFileRef: 'deploy/env/production.env',
      supabaseProjectRef: 'production-ref-1',
      databaseHost: 'db.production-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'production',
    },
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    acceptedBy: 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-01T10:00:00.000Z',
    approvalRef: 'approval:production-release-window-1',
    runtimePublicationEvidenceRef: 'wbs_template_runtime_publications_export:project-testing/reports/default-master-plan-production-readiness/wbs-template-runtime-publications-export.json#sha256=1111111111111111111111111111111111111111111111111111111111111111',
    apiReadSmokeEvidenceRef: 'api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/api-read-smoke-export.json#sha256=2222222222222222222222222222222222222222222222222222222222222222',
    uiConsumptionSmokeEvidenceRef: 'ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke-export.json#sha256=3333333333333333333333333333333333333333333333333333333333333333',
    criticalPathReadbackEvidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback-export.json#sha256=4444444444444444444444444444444444444444444444444444444444444444',
    rollbackEvidenceRef: 'rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/rollback-verification-export.json#sha256=5555555555555555555555555555555555555555555555555555555555555555',
    ...overrides,
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fileEvidenceRef(kind, filePath) {
  const content = await readFile(filePath)
  const sha256 = createHash('sha256').update(content).digest('hex')
  const relativePath = path.relative(path.resolve('.'), filePath).replace(/\\/g, '/')
  return `${kind}:${relativePath}#sha256=${sha256}`
}

function withExportMetadata(payload, source, environment = 'staging') {
  return {
    export_metadata: {
      source,
      exported_at: '2026-07-01T08:00:00.000Z',
      exported_by: 'evidence-exporter-1',
      environment,
    },
    ...payload,
  }
}

async function writeProfileReport(filePath) {
  await writeJson(filePath, {
    businessTypes: [
      'hotel',
      'hospital',
      'school',
      'industrial',
      'data_center',
      'transportation_hub',
      'sports_culture',
      'tod_upper_cover',
      'renovation',
      'modular_building',
    ].map((businessType, index) => ({
      businessType,
      scheduleRowCount: 32 + index,
      profileRowCount: 4,
      profilePhaseAnchorRowCount: 1,
      reviewStatus: 'candidate_master_plan_reviewable',
      profileDurationEvidenceReady: true,
      gaps: [],
    })),
  })
}

async function writeResidentialReport(filePath) {
  await writeFile(filePath, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
}
