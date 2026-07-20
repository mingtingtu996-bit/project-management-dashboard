import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const BUILDER_PATH = path.resolve('project-testing/tools/build-default-master-plan-runtime-publication-evidence.mjs')
const CHECKER_PATH = path.resolve('project-testing/tools/check-default-master-plan-production-readiness.mjs')
const PUBLICATION_KEY = 'duration-learning-runtime:wbs-reference-days:facade-v3'

test('blocks a retired WBS runtime publication even when its legacy row is otherwise complete', async () => {
  await withEvidenceFiles(async ({ publicationExport, consumptionExport, outputPath }) => {
    await writeJson(publicationExport, withExportMetadata({
      wbs_template_runtime_publications: [{
        publication_key: PUBLICATION_KEY,
        asset_kind: 'default_master_plan',
        asset_version_id: 'baseline-1',
        company_id: 'company-1',
        project_id: 'project-1',
        runtime_publication_status: 'runtime_published',
        published_at: '2026-07-01T08:00:00.000Z',
      }],
    }, 'wbs_template_runtime_publications'))
    await writeJson(consumptionExport, canonicalConsumptionExport())

    const evidence = await runBuilder({ publicationExport, consumptionExport, outputPath })
    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /legacy_runtime_publication_source_rejected/)
  })
})

test('blocks canonical publication evidence when trusted consumption export is missing', async () => {
  await withEvidenceFiles(async ({ publicationExport, outputPath }) => {
    await writeJson(publicationExport, canonicalPublicationExport())
    const evidence = await runBuilder({ publicationExport, outputPath })
    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /runtime_consumptions_export_required/)
    assert.match(evidence.blockers.join('\n'), /trusted_runtime_consumption_required/)
  })
})

test('builds canonical runtime evidence only from an exact publication and baseline consumption pair', async () => {
  await withEvidenceFiles(async ({ root, publicationExport, consumptionExport, outputPath }) => {
    const outputRoot = path.join(root, 'out')
    const profileReport = path.join(root, 'profiles.json')
    const residentialReport = path.join(root, 'residential.md')
    await writeProfileReport(profileReport)
    await writeResidentialReport(residentialReport)
    await writeJson(publicationExport, canonicalPublicationExport())
    await writeJson(consumptionExport, canonicalConsumptionExport())

    const evidence = await runBuilder({
      publicationExport,
      consumptionExport,
      outputPath,
      includeReleaseLineage: true,
    })
    assert.equal(evidence.schemaVersion, 'workbuddy-default-master-plan-runtime-publication-evidence/v2')
    assert.equal(evidence.status, 'runtime_consumed')
    assert.equal(evidence.publication.source, 'duration_learning_runtime_publications')
    assert.equal(evidence.publication.assetKey, 'wbs_reference_days')
    assert.equal(evidence.publication.artifactKey, 'facade-v3')
    assert.equal(evidence.trustedConsumptionCount, 1)
    assert.equal(evidence.consumptions[0].source, 'duration_learning_runtime_consumptions')
    assert.equal(evidence.consumptions[0].projectId, 'project-1')
    assert.equal(evidence.consumptions[0].baselineId, 'baseline-1')
    assert.match(evidence.publicationEvidenceRef, /^duration_learning_runtime_publications_export:/)
    assert.match(evidence.consumptionEvidenceRef, /^duration_learning_runtime_consumptions_export:/)

    try {
      await execFileAsync(process.execPath, [
        CHECKER_PATH,
        '--profile-report', profileReport,
        '--residential-report', residentialReport,
        '--runtime-publication-evidence', outputPath,
        '--output-root', outputRoot,
      ], { cwd: path.resolve('.') })
    } catch (error) {
      if (Number(error?.code) !== 1) throw error
    }
    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')
    assert.equal(publicationGate.status, 'pass')
    assert.equal(publicationGate.evidence.trustedConsumptionCount, 1)
  })
})

test('blocks canonical consumption whose artifact, project, or baseline identity does not match', async () => {
  await withEvidenceFiles(async ({ publicationExport, consumptionExport, outputPath }) => {
    await writeJson(publicationExport, canonicalPublicationExport())
    await writeJson(consumptionExport, canonicalConsumptionExport({
      artifact_key: 'other-artifact',
      project_id: 'other-project',
      baseline_id: 'other-baseline',
    }))
    const evidence = await runBuilder({ publicationExport, consumptionExport, outputPath })
    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /runtime_consumption_artifact_key_mismatch/)
    assert.match(evidence.blockers.join('\n'), /runtime_consumption_project_id_mismatch/)
    assert.match(evidence.blockers.join('\n'), /runtime_consumption_baseline_id_mismatch/)
  })
})

for (const monitoringStatus of ['failed', 'rollback_pending']) {
  test(`blocks ${monitoringStatus} canonical publication even when a trusted consumption row exists`, async () => {
    await withEvidenceFiles(async ({ publicationExport, consumptionExport, outputPath }) => {
      await writeJson(publicationExport, canonicalPublicationExport({ monitoring_status: monitoringStatus }))
      await writeJson(consumptionExport, canonicalConsumptionExport())
      const evidence = await runBuilder({ publicationExport, consumptionExport, outputPath })
      assert.equal(evidence.status, 'blocked')
      assert.match(evidence.blockers.join('\n'), /runtime_publication_monitoring_status_not_consumable/)
    })
  })
}

test('blocks cross-company trusted consumption and a non-commit consumer surface', async () => {
  await withEvidenceFiles(async ({ publicationExport, consumptionExport, outputPath }) => {
    await writeJson(publicationExport, canonicalPublicationExport())
    await writeJson(consumptionExport, canonicalConsumptionExport({
      company_id: 'other-company',
      consumer_surface: 'preview_only',
    }))
    const evidence = await runBuilder({ publicationExport, consumptionExport, outputPath })
    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /runtime_consumption_company_scope_mismatch/)
    assert.match(evidence.blockers.join('\n'), /runtime_consumption_baseline_company_mismatch/)
    assert.match(evidence.blockers.join('\n'), /runtime_consumption_commit_surface_required/)
  })
})

test('blocks rows with an invalid task-or-baseline subject contract', async () => {
  await withEvidenceFiles(async ({ publicationExport, consumptionExport, outputPath }) => {
    await writeJson(publicationExport, canonicalPublicationExport())
    await writeJson(consumptionExport, canonicalConsumptionExport({ task_id: 'task-1' }))
    const evidence = await runBuilder({ publicationExport, consumptionExport, outputPath })
    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /runtime_consumption_subject_identity_invalid/)
  })
})

test('does not accept user metadata or legacy archive mapping as trusted runtime consumption', async () => {
  await withEvidenceFiles(async ({ publicationExport, consumptionExport, outputPath }) => {
    await writeJson(publicationExport, withExportMetadata({
      duration_learning_legacy_default_master_plan_mappings: [{
        legacy_publication_key: PUBLICATION_KEY,
        company_id: 'company-1',
        project_id: 'project-1',
      }],
    }, 'duration_learning_legacy_default_master_plan_mappings'))
    await writeJson(consumptionExport, withExportMetadata({
      tasks: [{
        id: 'task-1',
        project_id: 'project-1',
        standard_task_metadata: {
          publicationKey: PUBLICATION_KEY,
          assetKey: 'wbs_reference_days',
          artifactKey: 'facade-v3',
        },
      }],
    }, 'tasks'))
    const evidence = await runBuilder({ publicationExport, consumptionExport, outputPath })
    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /legacy_runtime_publication_source_rejected/)
    assert.match(evidence.blockers.join('\n'), /trusted_runtime_consumption_required/)
  })
})

test('blocks canonical exports without auditable real-environment metadata', async () => {
  await withEvidenceFiles(async ({ publicationExport, consumptionExport, outputPath }) => {
    await writeJson(publicationExport, {
      duration_learning_runtime_publications: canonicalPublicationExport().duration_learning_runtime_publications,
    })
    await writeJson(consumptionExport, canonicalConsumptionExport())
    const evidence = await runBuilder({ publicationExport, consumptionExport, outputPath })
    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /runtime_publications_metadata_required/)
  })
})

async function runBuilder({ publicationExport, consumptionExport, outputPath, includeReleaseLineage = false }) {
  const args = [
    BUILDER_PATH,
    '--runtime-publications', publicationExport,
    ...(consumptionExport ? ['--runtime-consumptions', consumptionExport] : []),
    '--publication-key', PUBLICATION_KEY,
    '--baseline-id', 'baseline-1',
    '--project-id', 'project-1',
    ...(includeReleaseLineage
      ? [
          '--duration-calibration-evidence-ref', 'project-testing/reports/default-master-plan-production-readiness/duration-calibration.json',
          '--dependency-writer-evidence-ref', 'project-testing/reports/default-master-plan-production-readiness/dependency-writer.json',
        ]
      : []),
    '--output', outputPath,
  ]
  await execFileAsync(process.execPath, args, { cwd: path.resolve('.') })
  return JSON.parse(await readFile(outputPath, 'utf8'))
}

async function withEvidenceFiles(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  try {
    await run({
      root,
      publicationExport: path.join(root, 'runtime-publications.json'),
      consumptionExport: path.join(root, 'runtime-consumptions.json'),
      outputPath: path.join(root, 'runtime-publication-evidence.json'),
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function withExportMetadata(payload, source) {
  return {
    export_metadata: {
      source,
      exported_at: '2026-07-01T08:00:00.000Z',
      exported_by: 'evidence-exporter-1',
      environment: 'staging',
    },
    ...payload,
  }
}

function canonicalPublicationExport(overrides = {}) {
  return withExportMetadata({
    duration_learning_runtime_publications: [{
      publication_key: PUBLICATION_KEY,
      asset_key: 'wbs_reference_days',
      artifact_key: 'facade-v3',
      scope_level: 'project',
      company_id: 'company-1',
      project_id: 'project-1',
      publication_stage: 'stable',
      monitoring_status: 'passed',
      previous_publication_key: 'duration-learning-runtime:wbs-reference-days:facade-v2',
      source_evidence_refs: ['duration-learning-candidate:facade-v3'],
      published_at: '2026-07-01T08:00:00.000Z',
      ...overrides,
    }],
  }, 'duration_learning_runtime_publications')
}

function canonicalConsumptionExport(overrides = {}) {
  return withExportMetadata({
    duration_learning_runtime_consumptions: [{
      consumption_key: 'duration-learning-consumption:baseline-item-1',
      company_id: 'company-1',
      project_id: 'project-1',
      publication_key: PUBLICATION_KEY,
      asset_key: 'wbs_reference_days',
      artifact_key: 'facade-v3',
      consumer_key: 'wbsTemplateGenerationService',
      consumer_surface: 'baseline_commit',
      task_id: null,
      baseline_item_id: 'baseline-item-1',
      baseline_id: 'baseline-1',
      baseline_project_id: 'project-1',
      baseline_company_id: 'company-1',
      baseline_authority: 'task_baseline_items_physical_join',
      generation_batch_id: 'generation-batch-1',
      template_id: 'facade-v3',
      duration_day_basis: 'construction_production_day',
      applied_duration_days: 18,
      source_evidence_refs: [`duration_learning_runtime_publications:${PUBLICATION_KEY}`],
      consumption_context: {
        authoritySource: 'runtime_resolver_publication_set',
        scopeLevel: 'project',
      },
      consumed_at: '2026-07-02T08:00:00.000Z',
      ...overrides,
    }],
  }, 'duration_learning_runtime_consumptions')
}

async function writeProfileReport(filePath) {
  await writeJson(filePath, {
    businessTypes: [
      'hotel', 'hospital', 'school', 'industrial', 'data_center',
      'transportation_hub', 'sports_culture', 'tod_upper_cover', 'renovation', 'modular_building',
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
    '- schedule_row: 60',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
}
