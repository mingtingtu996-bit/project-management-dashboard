import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

import { startVitest } from 'vitest/node'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(scriptDir, '..')
const vitestPackageRoot = path.join(serverRoot, 'node_modules', 'vitest')

function isWithin(child, parent) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function normalizeTestArg(arg) {
  const normalized = String(arg)
  if (normalized.startsWith('-')) return normalized
  const slash = normalized.replace(/\\/g, '/')
  if (path.isAbsolute(normalized) && isWithin(normalized, serverRoot)) {
    return path.relative(serverRoot, normalized)
  }
  if (slash.startsWith('server/')) return slash.slice('server/'.length)
  if (slash.startsWith('src/')) return normalized
  return normalized
}

const testFiles = process.argv.slice(2).map(normalizeTestArg)
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
      fileParallelism: false,
      minWorkers: 1,
      maxWorkers: 1,
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
const testConfig = {
  globals: true,
  environment: 'node',
  include: ['src/**/*.{test,spec}.ts'],
  projects: serverTestProjects,
  fileParallelism: false,
  minWorkers: 1,
  maxWorkers: 1,
  env: serverTestEnv,
}

if (!fs.existsSync(vitestPackageRoot)) {
  console.error('[vitest-guard] missing Vitest package under server/node_modules. Install server dependencies first.')
  process.exit(1)
}

const vitest = await startVitest(
  'test',
  testFiles,
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
  console.error('[vitest-guard] focused Vitest guard failed with exit code', finalExitCode)
  process.exit(finalExitCode)
}
