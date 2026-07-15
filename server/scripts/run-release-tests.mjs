import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const serverRoot = fileURLToPath(new URL('..', import.meta.url))
const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const result = spawnSync(process.execPath, [vitestCli, 'run'], {
  cwd: serverRoot,
  env: {
    ...process.env,
    WORKBUDDY_RELEASE_TEST_SUITE: 'true',
  },
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exitCode = result.status ?? 1
