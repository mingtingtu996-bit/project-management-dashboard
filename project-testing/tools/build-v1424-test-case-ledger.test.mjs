import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

function runLedger(outputDir) {
  return spawnSync(process.execPath, ['project-testing/tools/build-v1424-test-case-ledger.mjs', '--release-dir', outputDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

async function readJson(path) {
  return JSON.parse(await readFile(join(repoRoot, path), 'utf8'))
}

test('builds v1.4.24 test case ledger artifacts with complete baseline case classes', async () => {
  const outputDir = `.tmp/v1424-ledger-${Date.now()}`

  try {
    const result = runLedger(outputDir)
    assert.equal(result.status, 0, result.stderr)

    const matrix = await readJson(`${outputDir}/v1424-test-case-matrix.json`)
    const coverage = await readJson(`${outputDir}/v1424-baseline-test-coverage-map.json`)
    const falseGreen = await readJson(`${outputDir}/v1424-false-green-audit.json`)
    const markdown = await readFile(join(repoRoot, outputDir, 'v1424-test-case-ledger.md'), 'utf8')

    const requiredBaselines = ['PB-01', 'PB-02', 'PB-03', 'PB-04', 'PB-05', 'PB-06', 'PB-07', 'PB-08', 'PB-09', 'PB-10', 'PB-11', 'PB-12', 'PB-T01', 'PB-T02', 'PB-T03', 'PB-T04']
    assert.equal(matrix.status, 'case-ledger-ready-not-executed')
    assert.ok(matrix.cases.length >= requiredBaselines.length * 4)
    assert.deepEqual(Object.keys(coverage.baselines), requiredBaselines)

    for (const baselineId of requiredBaselines) {
      const entry = coverage.baselines[baselineId]
      assert.ok(entry.classCoverage.normal.length >= 1, `${baselineId} missing normal case`)
      assert.ok(entry.classCoverage.boundary.length >= 1, `${baselineId} missing boundary case`)
      assert.ok(entry.classCoverage.exception.length >= 1, `${baselineId} missing exception case`)
      assert.ok(entry.classCoverage.security.length >= 1, `${baselineId} missing security case`)
    }

    const baselineDensityMinimums = Object.fromEntries(
      requiredBaselines.map((baselineId) => [
        baselineId,
        baselineId === 'PB-09'
          ? { normal: 5, boundary: 5, exception: 5, security: 5 }
          : { normal: 3, boundary: 3, exception: 3, security: 3 },
      ]),
    )
    for (const [baselineId, minimums] of Object.entries(baselineDensityMinimums)) {
      const entry = coverage.baselines[baselineId]
      for (const [caseClass, minimum] of Object.entries(minimums)) {
        assert.ok(
          entry.classCoverage[caseClass].length >= minimum,
          `${baselineId} ${caseClass} density too thin: expected >= ${minimum}, got ${entry.classCoverage[caseClass].length}`,
        )
      }
    }
    const pb09Entry = coverage.baselines['PB-09']
    for (const caseClass of ['normal', 'boundary', 'exception', 'security']) {
      assert.ok(
        pb09Entry.classCoverage[caseClass].length >= 5,
        `PB-09 ${caseClass} must stay at >=5 executable cases for the complex business loop`,
      )
    }
    const pb09Cases = matrix.cases.filter((item) => item.baselineIds.includes('PB-09'))
    assert.ok(pb09Cases.length >= 20)
    for (const testCase of pb09Cases) {
      assert.ok(testCase.input.executionTarget, `${testCase.caseId} missing PB-09 execution target`)
      assert.ok(testCase.input.testData, `${testCase.caseId} missing PB-09 test data`)
      assert.ok(testCase.input.readback, `${testCase.caseId} missing PB-09 readback`)
      assert.ok(testCase.input.evidenceContract?.path, `${testCase.caseId} missing PB-09 evidence contract`)
      assert.ok(
        testCase.input.evidenceContract.requiredFields.includes('targetIds') &&
          testCase.input.evidenceContract.requiredFields.includes('statusOrExitCode') &&
          testCase.input.evidenceContract.requiredFields.includes('readback') &&
          testCase.input.evidenceContract.requiredFields.includes('cleanup'),
        `${testCase.caseId} PB-09 evidence contract is not executable enough`,
      )
      if (testCase.caseClass === 'security') {
        assert.ok(testCase.input.roleMatrix, `${testCase.caseId} missing role matrix`)
        assert.ok(testCase.input.crossTenantResult, `${testCase.caseId} missing cross tenant result`)
      }
      if (testCase.caseClass === 'exception') {
        assert.ok(testCase.input.failureMode, `${testCase.caseId} missing failure mode`)
        assert.ok(testCase.input.postFailureReadback, `${testCase.caseId} missing post-failure readback`)
      }
    }

    assert.ok(matrix.cases.every((item) => item.executionStatus === 'not-executed'))
    assert.ok(matrix.cases.every((item) => item.steps.length > 0 && item.expected.length > 0 && item.failIf.length > 0))
    const densityCases = matrix.cases.filter((item) => item.caseId.includes('-DENSITY-'))
    assert.ok(densityCases.length > 0)
    for (const testCase of densityCases) {
      assert.ok(testCase.input.executionTarget, `${testCase.caseId} missing executable target`)
      assert.ok(testCase.input.testData, `${testCase.caseId} missing test data`)
      assert.ok(testCase.input.readback, `${testCase.caseId} missing readback definition`)
      assert.ok(testCase.input.evidenceContract?.path, `${testCase.caseId} missing evidence contract path`)
      assert.ok(
        testCase.input.evidenceContract.requiredFields.includes('targetIds') &&
          testCase.input.evidenceContract.requiredFields.includes('statusOrExitCode') &&
          testCase.input.evidenceContract.requiredFields.includes('readback') &&
          testCase.input.evidenceContract.requiredFields.includes('cleanup'),
        `${testCase.caseId} evidence contract is not executable enough`,
      )
      assert.doesNotMatch(testCase.steps.join('\n'), /执行对应(?: API\/浏览器)?入口|检查边界提示\/状态机\/readback/)
    }
    assert.ok(matrix.cases.some((item) => item.caseId === 'C15-LEARN-01'))
    assert.ok(matrix.cases.some((item) => item.caseId === 'C19-ROLLBACK-01'))
    assert.ok(matrix.cases.some((item) => item.caseId === 'PERF-COMPANY-SUMMARY-01'))
    const companyCreateSwitchCase = matrix.cases.find((item) => item.caseId === 'PB01-COMPANY-CREATE-SWITCH-01')
    assert.ok(companyCreateSwitchCase)
    assert.deepEqual(companyCreateSwitchCase.baselineIds, ['PB-01', 'PB-07', 'PB-11'])
    assert.equal(companyCreateSwitchCase.caseClass, 'boundary')
    assert.ok(companyCreateSwitchCase.evidence.includes('project-testing/artifacts/browser-checks/workspace-company-create-switch/workspace-company-create-switch-browser-check.json'))
    assert.ok(companyCreateSwitchCase.existingCoverage.includes('client/src/hooks/__tests__/useWorkspaceData.test.tsx'))
    assert.ok(companyCreateSwitchCase.existingCoverage.includes('scripts/verify-workspace-company-create-switch-browser.mjs'))
    assert.ok(coverage.baselines['PB-01'].caseIds.includes('PB01-COMPANY-CREATE-SWITCH-01'))
    assert.ok(coverage.baselines['PB-07'].caseIds.includes('PB01-COMPANY-CREATE-SWITCH-01'))
    assert.ok(coverage.baselines['PB-11'].caseIds.includes('PB01-COMPANY-CREATE-SWITCH-01'))
    const runtimeRollbackCase = matrix.cases.find((item) => item.caseId === 'PB04-ROLLBACK-BOUNDARY-01')
    assert.ok(runtimeRollbackCase)
    assert.equal(
      runtimeRollbackCase.existingCoverage.includes('wbsTemplateRuntimePublicationService.test.ts'),
      false,
    )
    assert.ok(runtimeRollbackCase.existingCoverage.includes('durationLearningRuntimePublicationService.test.ts'))
    assert.ok(runtimeRollbackCase.existingCoverage.includes('durationLearningRuntimeConsumptionService.test.ts'))
    assert.equal(falseGreen.schemaVersion, 'workbuddy/v1424-false-green-audit/v1')
    assert.equal(falseGreen.scanPolicy.scope, 'test-scripts-release-evidence-only')
    assert.ok(falseGreen.scannedRoots.includes(outputDir))
    assert.equal(
      falseGreen.summary.findingCount,
      falseGreen.summary.bySeverity['suspect-fake-green'] + falseGreen.summary.bySeverity['supporting-only'],
    )
    assert.equal(
      falseGreen.summary.findingCount,
      falseGreen.summary.byClassification['hard-gate-review-required'] +
        falseGreen.summary.byClassification['supporting-only-not-pass-evidence'],
    )
    assert.deepEqual(
      falseGreen.summary.rulesWithFindings,
      falseGreen.summary.byRule.map((entry) => entry.ruleId),
    )
    assert.ok(falseGreen.summary.byRule.every((entry) => entry.findingCount > 0))
    assert.ok(falseGreen.summary.byRule.every((entry) => entry.classification === 'hard-gate-review-required' || entry.classification === 'supporting-only-not-pass-evidence'))
    assert.deepEqual(
      falseGreen.summary.classificationLegend.map((entry) => entry.classification).sort(),
      ['hard-gate-review-required', 'supporting-only-not-pass-evidence'].sort(),
    )
    assert.ok(falseGreen.summary.topFiles.length > 0)
    assert.ok(falseGreen.summary.topFiles.length <= 20)
    assert.ok(
      falseGreen.summary.topFiles.every((entry) =>
        entry.classificationCounts &&
        Number.isInteger(entry.classificationCounts['hard-gate-review-required']) &&
        Number.isInteger(entry.classificationCounts['supporting-only-not-pass-evidence']),
      ),
    )
    assert.ok(falseGreen.summary.reviewPriority.length > 0)
    assert.ok(falseGreen.summary.reviewPriority.length <= 10)
    assert.ok(falseGreen.summary.reviewPriority.every((entry) => entry.priority === 'P0-review-suspect-fake-green' || entry.priority === 'P1-review-supporting-only'))
    assert.ok(falseGreen.summary.reviewPriority.every((entry) => entry.classification === 'hard-gate-review-required' || entry.classification === 'supporting-only-not-pass-evidence'))
    assert.equal(
      falseGreen.scannedRoots.includes('project-testing/reports/release-v1.4.24-20260702-125254'),
      false,
    )
    assert.ok(
      falseGreen.findings.every((finding) =>
        finding.file.startsWith('project-testing/tools/') ||
        finding.file.startsWith(`${outputDir}/`) ||
        finding.file.startsWith('scripts/') ||
        finding.file.includes('/__tests__/') ||
        /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(finding.file),
      ),
    )
    assert.equal(falseGreen.findings.some((finding) => finding.file === 'server/src/auth/permissionBypass.ts'), false)
    assert.equal(falseGreen.findings.some((finding) => finding.file === 'project-testing/tools/build-v1424-test-case-ledger.mjs'), false)
    assert.equal(falseGreen.findings.some((finding) => finding.file.endsWith('/v1424-false-green-audit.json')), false)
    assert.equal(falseGreen.findings.some((finding) => finding.file.endsWith('/v1424-test-case-ledger.md')), false)
    assert.equal(falseGreen.findings.some((finding) => finding.file.includes('/logs/')), false)
    assert.ok(
      falseGreen.findings
        .filter((finding) => finding.severity === 'suspect-fake-green')
        .every((finding) => finding.classification === 'hard-gate-review-required' && finding.releaseGateUse.startsWith('review-required;')),
    )
    assert.ok(
      falseGreen.findings
        .filter((finding) => finding.severity === 'supporting-only')
        .every((finding) => finding.classification === 'supporting-only-not-pass-evidence' && finding.releaseGateUse.startsWith('supporting-only;')),
    )
    assert.match(markdown, /# v1\.4\.24 测试用例台账/)
    assert.match(markdown, /## 假绿审计汇总/)
    assert.match(markdown, /优先审查文件/)
  } finally {
    await rm(join(repoRoot, outputDir), { recursive: true, force: true })
  }
})

test('builds v1.4.24 ledger into an absolute release directory', async () => {
  const outputDir = resolve(repoRoot, `.tmp/v1424-ledger-absolute-${Date.now()}`)
  try {
    const result = runLedger(outputDir)
    assert.equal(result.status, 0, result.stderr)

    const matrix = JSON.parse(await readFile(join(outputDir, 'v1424-test-case-matrix.json'), 'utf8'))
    const falseGreen = JSON.parse(await readFile(join(outputDir, 'v1424-false-green-audit.json'), 'utf8'))

    assert.equal(matrix.status, 'case-ledger-ready-not-executed')
    assert.ok(falseGreen.scannedRoots.includes(outputDir.replace(/\\/g, '/')) || falseGreen.scannedRoots.includes(outputDir))
    assert.equal(
      falseGreen.scannedRoots.includes('project-testing/reports/release-v1.4.24-20260702-125254'),
      false,
    )
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})
