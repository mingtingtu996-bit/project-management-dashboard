import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const serverTestEnv = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-key',
  NODE_ENV: 'test',
}

const longRunningServerTests = [
  'src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts',
  'src/__tests__/wbsTemplateGenerationService.test.ts',
  'src/__tests__/constructionDependencyFireL5Coverage.test.ts',
  'src/__tests__/constructionDependencyRuleSystemTrust.test.ts',
  'src/__tests__/highFidelitySyntheticStressService.test.ts',
  'src/__tests__/schedulerJobContracts.test.ts',
  'src/__tests__/wbs-template-governance.test.ts',
  'src/__tests__/wbsGovernanceCandidateAdapters.test.ts',
  'src/__tests__/wbsTemplateGoldenBenchmarkCli.test.ts',
  'src/__tests__/wbsTemplateProjectAE2E.test.ts',
  'src/__tests__/progressKnowledgePlannedScheduleFieldReview.test.ts',
]

const serverTestProjects = [
  {
    test: {
      name: 'server-default',
      globals: true,
      environment: 'node',
      include: ['src/**/*.{test,spec}.ts'],
      exclude: longRunningServerTests,
      pool: 'forks',
      poolOptions: {
        forks: {
          execArgv: ['--max-old-space-size=8192'],
        },
      },
      sequence: {
        groupOrder: 0,
      },
      env: serverTestEnv,
    },
  },
  {
    test: {
      name: 'server-wbs-long',
      globals: true,
      environment: 'node',
      include: longRunningServerTests,
      testTimeout: 360_000,
      pool: 'threads',
      fileParallelism: false,
      minWorkers: 1,
      maxWorkers: 1,
      sequence: {
        groupOrder: 1,
      },
      env: serverTestEnv,
    },
  },
]

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    projects: serverTestProjects,
    env: serverTestEnv,
  },
})
