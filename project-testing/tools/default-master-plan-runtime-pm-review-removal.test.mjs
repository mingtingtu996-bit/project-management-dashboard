import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const REPO_ROOT = path.resolve('.')

async function source(relativePath) {
  return fs.readFile(path.join(REPO_ROOT, relativePath), 'utf8')
}

test('keeps project-manager simulation offline and out of runtime readiness', async () => {
  const [
    bundle,
    pipeline,
    sourceChecker,
    sourceExporter,
    readiness,
    profileReport,
    runtimeSeedCoverage,
    runtimeTaskAlignment,
    runtimeTaskAlignmentTemplate,
    packageJsonText,
  ] = await Promise.all([
    source('project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs'),
    source('project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs'),
    source('project-testing/tools/check-default-master-plan-evidence-sources.mjs'),
    source('project-testing/tools/export-default-master-plan-production-sources.mjs'),
    source('project-testing/tools/check-default-master-plan-production-readiness.mjs'),
    source('project-testing/tools/generate-default-master-plan-profile-report.mjs'),
    source('project-testing/tools/build-default-master-plan-runtime-seed-coverage-package.mjs'),
    source('project-testing/tools/build-default-master-plan-runtime-task-alignment-refresh-package.mjs'),
    source('project-testing/tools/create-default-master-plan-runtime-task-alignment-review-decisions-template.mjs'),
    source('package.json'),
  ])
  const packageJson = JSON.parse(packageJsonText)

  for (const [name, activeSource] of [
    ['production evidence bundle', bundle],
    ['production evidence pipeline', pipeline],
    ['production source checker', sourceChecker],
  ]) {
    assert.doesNotMatch(activeSource, /pm-review-evidence|--review-evidence|reviewEvidence/, name)
  }
  assert.doesNotMatch(pipeline, /--review-export|reviewExport|TOOLS\.review/)
  assert.doesNotMatch(sourceChecker, /--project-manager-review-evidence-ref|candidate_default_master_plan_review/)
  assert.doesNotMatch(sourceExporter, /candidate_default_master_plan_review|table:\s*'change_logs'|review-duration|--review-export/)

  assert.doesNotMatch(readiness, /fs\.readFile\(review(?:PackageBuilder|RecordExporter|EvidenceBuilder)Path/)
  assert.doesNotMatch(readiness, /pmReviewEvidenceBuilderScansNestedSourceLineage|reviewPackageCandidateBaselineRootSourceGuardCoverage|reviewRecordPackageSourceGuardCoverage/)

  assert.doesNotMatch(profileReport, /candidate_generation_depth_review_required/)
  assert.doesNotMatch(profileReport, /Boolean\(String\(evidence\.reviewer/)
  assert.doesNotMatch(runtimeSeedCoverage, /candidate_generation_depth_review_required/)
  assert.doesNotMatch(runtimeTaskAlignment, /human_project_manager|pm_review/)
  assert.doesNotMatch(runtimeTaskAlignmentTemplate, /human_project_manager/)

  for (const retiredScript of [
    'evidence:default-master-plan:record-review',
    'evidence:default-master-plan:review-package',
    'evidence:default-master-plan:review-record-preflight',
  ]) {
    assert.equal(retiredScript in (packageJson.scripts ?? {}), false, retiredScript)
  }
})
