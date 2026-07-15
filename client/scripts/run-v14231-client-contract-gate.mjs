import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startVitest } from 'vitest/node'

const clientRoot = fileURLToPath(new URL('../', import.meta.url))
const vitestPackageRoot = path.join(clientRoot, 'node_modules', 'vitest')

const clientContractTests = [
  'src/__tests__/v14231ClientContractGateManifest.test.ts',
  'src/__tests__/contracts/durationSurface.contract.test.ts',
  'src/__tests__/frontendBiAggregationGuard.test.ts',
  'src/__tests__/xlsxDependencyGuard.test.ts',
  'src/components/project/__tests__/Step4KeyFeaturesConstraints.test.tsx',
  'src/lib/__tests__/spreadsheetExportSecurity.test.ts',
  'src/services/__tests__/v14231ReadinessApi.test.ts',
  'src/services/__tests__/wbsTemplateGenerationApi.test.ts',
]

const missingClientContractTests = clientContractTests.filter(
  (testFile) => !existsSync(path.join(clientRoot, testFile)),
)

if (missingClientContractTests.length > 0) {
  console.error(
    '[v14231-client-contract-gate] missing client contract test files:',
    missingClientContractTests.join(', '),
  )
  process.exit(1)
}

const testConfig = {
  globals: true,
  environment: 'jsdom',
  isolate: true,
  setupFiles: ['./src/test/setup.ts'],
  include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  deps: {
    optimizer: {
      client: {
        enabled: false,
        force: true,
        include: [
          'react',
          'react-dom',
          'react-router-dom',
          'lucide-react',
          '@radix-ui/react-dialog',
          '@radix-ui/react-slot',
          '@radix-ui/react-primitive',
          '@radix-ui/react-dismissable-layer',
          '@radix-ui/react-focus-scope',
          '@radix-ui/react-portal',
          '@radix-ui/react-presence',
          '@radix-ui/react-context',
        ],
      },
    },
  },
}

if (!existsSync(vitestPackageRoot)) {
  console.error('[v14231-client-contract-gate] missing Vitest package under client/node_modules. Install client dependencies first.')
  process.exit(1)
}

const vitest = await startVitest(
  'test',
  clientContractTests,
  {
    run: true,
    watch: false,
    reporters: ['basic'],
    configFile: false,
    root: clientRoot,
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: [
        { find: '@', replacement: path.resolve(clientRoot, './src') },
      ],
    },
    test: testConfig,
  },
  {
    configFile: false,
    root: clientRoot,
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: [
        { find: '@', replacement: path.resolve(clientRoot, './src') },
      ],
    },
    test: testConfig,
  },
)

const exitCode = await vitest?.close()
const processExitCode = typeof process.exitCode === 'number' ? process.exitCode : 0
const finalExitCode = typeof exitCode === 'number' ? exitCode : processExitCode
if (finalExitCode !== 0) {
  console.error('[v14231-client-contract-gate] client contract gate failed with exit code', finalExitCode)
  process.exit(finalExitCode)
}

console.log('[v14231-client-contract-gate] OK: client contract gate passed.')
