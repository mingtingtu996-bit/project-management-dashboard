import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { startVitest } from 'vitest/node'

const serverRoot = fileURLToPath(new URL('../', import.meta.url))
const vitestPackageRoot = fileURLToPath(new URL('../node_modules/vitest/', import.meta.url))
const tsTests = ['src/__tests__/businessTypeRegistryGuard.test.ts']

if (!existsSync(vitestPackageRoot)) {
  console.error('[business-type-registry-gate] missing Vitest package under server/node_modules. Install server dependencies first.')
  process.exit(1)
}

const vitest = await startVitest(
  'test',
  tsTests,
  {
    run: true,
    watch: false,
    configFile: false,
    root: serverRoot,
    globals: true,
    environment: 'node',
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
  },
  {
    configFile: false,
    root: serverRoot,
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.{test,spec}.ts'],
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
    },
  },
)

const exitCode = await vitest?.close()
if (typeof exitCode === 'number' && exitCode !== 0) {
  console.error('[business-type-registry-gate] focused guard failed with exit code', exitCode)
  process.exit(exitCode)
}

console.log('[business-type-registry-gate] OK: focused business-type registry guard passed.')
