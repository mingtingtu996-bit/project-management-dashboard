import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { projectSearchOwnedTests as configuredProjectSearchOwnedTests } from '../releaseTestOwnership.js'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server'))
const workspaceRoot = resolve(serverRoot, '..')

const projectSearchOwnedTests = [
  'progressKnowledgeCandidateCalibration.test.ts',
  'progressKnowledgeCandidateOnlyReview.test.ts',
  'progressKnowledgeClauseSequenceCandidateReview.test.ts',
  'progressKnowledgeClauseSequenceReadiness.test.ts',
  'progressKnowledgeCompletedProjectTriadCandidates.test.ts',
  'progressKnowledgeExtractionReview.test.ts',
  'progressKnowledgePlannedScheduleFieldReview.test.ts',
  'progressKnowledgeRealProjectSameProjectPairing.test.ts',
  'progressKnowledgeRealProjectSampleDiscovery.test.ts',
  'progressKnowledgeSourceExpansion.test.ts',
  'progressKnowledgeSourceVerification.test.ts',
  'progressKnowledgeValidationDataset.test.ts',
] as const

const portableServerRootTests = [
  'advisorPublicRlsRemainingMigration.test.ts',
  'advisorPublicRlsLiveCatalogMigration.test.ts',
  'algorithmAssetGovernanceDashboardEvidenceService.test.ts',
  'clientErrorsRoute.test.ts',
  'companyProjectTemplatesMigration.test.ts',
  'durationForecastProfileMigration.test.ts',
  'post277AdvisorSecurityRpcAclCloseoutMigration.test.ts',
  'progressKnowledgeAssetsMigration.test.ts',
  'progressKnowledgeSourceExpansion.test.ts',
  'progressKnowledgeValidationDataset.test.ts',
  'projectExecutionSummary.test.ts',
  'projectHealthMigrationCleanup.test.ts',
  'projectTrendAnalyticsService.test.ts',
  'projectWizardMetadataMigration.test.ts',
  'scope-dimensions.test.ts',
  'supabaseAdvisorSecurityCloseoutMigration.test.ts',
  'taskCriticalProjectionMigration.test.ts',
  'v14-object-type-deprecation.test.ts',
  'v14-engineering-objects.test.ts',
  'v14-participant-unit-hardening.test.ts',
  'v14225RuntimeConsumerObservationMigration.test.ts',
  'v14221TaskScopeColumnsMigration.test.ts',
  'warningEscalationRpcMigration.test.ts',
  'v14FullMigrationCoverage.test.ts',
  'warningImpactSignalGovernanceMigration.test.ts',
  'workflowGovernanceContractCleanup.test.ts',
] as const

describe('release server test suite contract', () => {
  it('runs from the server workspace with portable test roots and excludes only project-search-owned tests', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const runnerSource = readFileSync(resolve(serverRoot, 'scripts', 'run-release-tests.mjs'), 'utf8')
    const packageJson = JSON.parse(readFileSync(resolve(serverRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const serverTestsStep = workflow.slice(
      workflow.indexOf('      - name: Server tests'),
      workflow.indexOf('      - name: v1.4.22.3 Governance Gate'),
    )
    const serverQualityJob = workflow.slice(
      workflow.indexOf('  server-quality:'),
      workflow.indexOf('  build-frontend:'),
    )

    expect(packageJson.scripts?.['test:release']).toBe('node scripts/run-release-tests.mjs')
    expect(runnerSource).toContain("new URL('..', import.meta.url)")
    expect(runnerSource).toContain("[vitestCli, 'run']")
    expect(runnerSource).toContain('cwd: serverRoot')
    expect(runnerSource).not.toContain("'--config'")
    expect(configuredProjectSearchOwnedTests).toEqual(
      projectSearchOwnedTests.map((testFile) => `src/__tests__/${testFile}`),
    )
    for (const testFile of portableServerRootTests) {
      const source = readFileSync(resolve(serverRoot, 'src', '__tests__', testFile), 'utf8')
      expect(source, testFile).not.toContain("process.cwd().endsWith('\\\\server')")
    }
    expect(serverQualityJob).toContain('timeout-minutes: 60')
    expect(serverTestsStep).toContain('run: npm run test:release')
    expect(serverTestsStep).not.toContain('working-directory: .')
    expect(serverTestsStep).not.toContain('--root server')

    const vitestCli = resolve(serverRoot, 'node_modules', 'vitest', 'vitest.mjs')
    const scopedTestFiles = [
      ...projectSearchOwnedTests.map((testFile) => `src/__tests__/${testFile}`),
      'src/__tests__/progressKnowledgeAssetsMigration.test.ts',
    ]
    const listed = spawnSync(process.execPath, [vitestCli, 'list', ...scopedTestFiles], {
      cwd: serverRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKBUDDY_RELEASE_TEST_SUITE: 'true',
      },
    })

    expect(listed.status, listed.stderr).toBe(0)
    for (const testFile of projectSearchOwnedTests) {
      expect(listed.stdout).not.toContain(testFile)
      const source = readFileSync(resolve(serverRoot, 'src', '__tests__', testFile), 'utf8')
      expect(source).toMatch(/project-search|public-project-data|external-duration-research/)
    }
    expect(listed.stdout).toContain('progressKnowledgeAssetsMigration.test.ts')
  }, 30_000)
})
