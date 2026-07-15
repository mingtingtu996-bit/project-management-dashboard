import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const smokeSource = fs.readFileSync(
  path.join(toolsDir, 'run-wizard-baseline-revision-staging.mjs'),
  'utf8',
)

test('wizard baseline revision staging smoke uses ordinary plan confirmation', () => {
  assert.match(smokeSource, /planQualityDiagnostics/)
  assert.match(smokeSource, /publish edited baseline/)
  assert.match(smokeSource, /Baseline revision smoke/)

  for (const retiredRuntimeContract of [
    'PROJECT_MANAGER_REVIEW_REQUIRED',
    'candidate_governance_review',
    'accepted_for_baseline',
    'reviewed_item_ids',
    'acknowledged_blockers',
    'projectManagerReviewPackage',
    'requiresProjectManagerScopeDecision',
  ]) {
    assert.equal(smokeSource.includes(retiredRuntimeContract), false, retiredRuntimeContract)
  }
})

test('wizard baseline revision staging smoke fails closed on missing task network or CPM readback', () => {
  assert.match(smokeSource, /\/api\/tasks\?projectId=/)
  assert.match(smokeSource, /surface=task_list/)
  assert.match(smokeSource, /taskDependencyReadback/)
  assert.match(smokeSource, /dependencyReadbackCount/)
  assert.match(smokeSource, /wizard task readback is empty/)
  assert.match(smokeSource, /wizard dependency readback is empty/)

  assert.match(smokeSource, /\/api\/projects\/\$\{projectId\}\/critical-path/)
  assert.match(smokeSource, /criticalPathReadback/)
  assert.match(smokeSource, /dependencyEdgeCount/)
  assert.match(smokeSource, /critical path task readback is empty/)
  assert.match(smokeSource, /critical path dependency edge readback is empty/)
  assert.match(smokeSource, /critical path calculation failed/)
})

test('wizard baseline revision staging smoke uses the authenticated active company', () => {
  assert.equal(
    smokeSource.includes("requireValue(args.get('company-id'), 'company-id')"),
    false,
  )
  assert.match(smokeSource, /authBody\?\.data\?\.user\?\.currentCompanyId/)
  assert.match(smokeSource, /company-id does not match the authenticated active company/)
  assert.match(smokeSource, /companyId = activeCompanyId/)
})
