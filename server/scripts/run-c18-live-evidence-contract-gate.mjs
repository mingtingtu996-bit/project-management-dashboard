import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { startVitest } from 'vitest/node'

const serverRoot = fileURLToPath(new URL('../', import.meta.url))
const vitestPackageRoot = fileURLToPath(new URL('../node_modules/vitest/', import.meta.url))

const c18LiveEvidenceContractTests = [
  'src/__tests__/releaseGateManifestIntegrity.test.ts',
  'src/__tests__/rlsProaclLiveDiagnostic.test.ts',
  'src/__tests__/executeSqlAnonPocLiveDiagnostic.test.ts',
  'src/__tests__/durationCanaryApprovalLiveDiagnostic.test.ts',
  'src/__tests__/criticalPathConcurrencyLiveDiagnostic.test.ts',
  'src/__tests__/acceptanceStatusConcurrencyLiveDiagnostic.test.ts',
  'src/__tests__/wizardCommitLiveDiagnostic.test.ts',
  'src/__tests__/wbsGenerationPressureHarness.test.ts',
  'src/__tests__/warningNotificationSyncLiveDiagnostic.test.ts',
  'src/__tests__/criticalPathSyntheticPressureHarness.test.ts',
  'src/__tests__/companyHealthTrendLiveDiagnostic.test.ts',
  'src/__tests__/companySummaryPressureHarness.test.ts',
  'src/__tests__/spreadsheetMigrationLiveDiagnostic.test.ts',
]

const missingC18LiveEvidenceContractTests = c18LiveEvidenceContractTests.filter(
  (testFile) => !existsSync(fileURLToPath(new URL(`../${testFile}`, import.meta.url))),
)

if (missingC18LiveEvidenceContractTests.length > 0) {
  console.error(
    '[c18-live-evidence-contract-gate] missing C-18 live evidence contract test files:',
    missingC18LiveEvidenceContractTests.join(', '),
  )
  process.exit(1)
}

const testConfig = {
  globals: true,
  environment: 'node',
  include: ['src/**/*.{test,spec}.ts'],
  testTimeout: 60000,
  poolOptions: {
    forks: {
      execArgv: ['--max-old-space-size=8192'],
    },
  },
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    NODE_ENV: 'test',
  },
}

if (!existsSync(vitestPackageRoot)) {
  console.error('[c18-live-evidence-contract-gate] missing Vitest package under server/node_modules. Install server dependencies first.')
  process.exit(1)
}

const vitest = await startVitest(
  'test',
  c18LiveEvidenceContractTests,
  {
    run: true,
    watch: false,
    configFile: false,
    root: serverRoot,
    ...testConfig,
  },
  {
    configFile: false,
    root: serverRoot,
    test: testConfig,
  },
)

const exitCode = await vitest?.close()
const processExitCode = typeof process.exitCode === 'number' ? process.exitCode : 0
const finalExitCode = typeof exitCode === 'number' ? exitCode : processExitCode
if (finalExitCode !== 0) {
  console.error('[c18-live-evidence-contract-gate] C-18.L evidence contract gate failed with exit code', finalExitCode)
  process.exit(finalExitCode)
}

console.log('[c18-live-evidence-contract-gate] OK: C-18.L evidence contract gate passed.')
