import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const CURRENT_RUNTIME_EVIDENCE_TOOLS = {
  'project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs': [
    'duration_learning_runtime_publications',
    'duration_learning_runtime_consumptions',
  ],
  'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs': [
    'runtimePublications',
    'runtimeConsumptions',
    '--runtime-consumptions',
  ],
  'project-testing/tools/build-default-master-plan-real-production-outcome-package.mjs': [
    'duration_learning_runtime_publications_export',
    'duration_learning_runtime_consumptions_export',
  ],
  'project-testing/tools/build-default-master-plan-runtime-publication-evidence.mjs': [
    'CANONICAL_RUNTIME_PUBLICATION_SOURCE',
    'CANONICAL_RUNTIME_CONSUMPTION_SOURCE',
  ],
  'project-testing/tools/check-default-master-plan-evidence-sources.mjs': [
    'duration_learning_runtime_publications',
    'duration_learning_runtime_consumptions',
  ],
  'project-testing/tools/check-default-master-plan-production-readiness.mjs': [
    'duration_learning_runtime_publications',
    'duration_learning_runtime_consumptions',
  ],
  'project-testing/tools/default-master-plan-real-outcome-evidence.mjs': [
    'CANONICAL_RUNTIME_PUBLICATION_REF_PREFIX',
    'CANONICAL_RUNTIME_CONSUMPTION_REF_PREFIX',
  ],
  'project-testing/tools/discover-default-master-plan-production-candidates.mjs': [
    'duration_learning_runtime_publications',
    'duration_learning_runtime_consumptions',
    'JOIN public.projects project',
    'project.company_id = consumption.company_id',
  ],
  'project-testing/tools/export-default-master-plan-production-sources.mjs': [
    'duration_learning_runtime_publications',
    'duration_learning_runtime_consumptions',
    'JOIN public.projects project',
    'baseline_company_id',
  ],
}

const RETIRED_STAGING_WRITER_REFERENCES = [
  'package.json',
  'project-testing/tools/check-testing-center.mjs',
  'project-testing/matrix/release-test-matrix.json',
  'project-testing/README.md',
  'project-data/lineage/writers.json',
]

const LEGACY_COMPATIBILITY_MARKERS_BY_FILE = {
  'project-testing/tools/check-default-master-plan-production-readiness.mjs': [
    "'wbs_template_runtime_publications'",
  ],
}

test('current default master-plan evidence tools use canonical publication and trusted consumption sources only', async () => {
  for (const [filePath, markers] of Object.entries(CURRENT_RUNTIME_EVIDENCE_TOOLS)) {
    const source = await readFile(path.resolve(filePath), 'utf8')
    for (const marker of markers) {
      assert.equal(source.includes(marker), true, `${filePath} must contain canonical marker ${marker}`)
    }
    const currentEvidenceSource = (LEGACY_COMPATIBILITY_MARKERS_BY_FILE[filePath] ?? [])
      .reduce((result, marker) => result.replaceAll(marker, ''), source)
    assert.doesNotMatch(currentEvidenceSource, /wbs_template_runtime_publications/, `${filePath} must not treat the retired WBS publication table as current evidence`)
    assert.doesNotMatch(currentEvidenceSource, /default_master_plan_runtime_publication/, `${filePath} must not accept the retired default-master-plan publication identity`)
  }
})

test('the retired staging runtime writer is absent from executable and governance surfaces', async () => {
  for (const filePath of RETIRED_STAGING_WRITER_REFERENCES) {
    const source = await readFile(path.resolve(filePath), 'utf8')
    assert.doesNotMatch(source, /run-default-master-plan-staging-runtime-evidence/, `${filePath} still references the retired writer`)
    assert.doesNotMatch(source, /evidence:default-master-plan:staging-runtime/, `${filePath} still exposes the retired writer command`)
  }

  await assert.rejects(access(path.resolve('project-testing/tools/run-default-master-plan-staging-runtime-evidence.mjs')))
  await assert.rejects(access(path.resolve('project-testing/tools/run-default-master-plan-staging-runtime-evidence.test.mjs')))

  const testingCenterContract = await readFile(path.resolve('project-testing/tools/testing-center.test.mjs'), 'utf8')
  assert.match(testingCenterContract, /retired legacy staging writer must not remain an executable gate group/)
  assert.match(testingCenterContract, /evidence:default-master-plan:staging-runtime'\], undefined/)

  const readOnlyQueueGuard = await readFile(path.resolve('project-testing/tools/plan-default-master-plan-read-only-evidence-queue.mjs'), 'utf8')
  assert.match(readOnlyQueueGuard, /run-default-master-plan-staging-runtime-evidence\.mjs/)
  assert.match(readOnlyQueueGuard, /evidence:default-master-plan:staging-runtime/)
})

test('legacy source-export aliases remain isolated to the compatibility parser', async () => {
  const metadataSource = await readFile(path.resolve('project-testing/tools/default-master-plan-source-export-metadata.mjs'), 'utf8')
  assert.match(metadataSource, /LEGACY_RUNTIME_SOURCE_ROW_ARRAY_KEYS/)
  assert.match(metadataSource, /legacy_runtime_source_cannot_satisfy_current_evidence/)
  assert.match(metadataSource, /wbs_template_runtime_publications/)
})
