import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const switchEnvScript = fileURLToPath(new URL('../../../scripts/switch-env.mjs', import.meta.url))

describe('environment switch script', () => {
  it('remains syntactically valid and exposes deterministic usage output', () => {
    const syntaxCheck = spawnSync(process.execPath, ['--check', switchEnvScript], {
      encoding: 'utf8',
    })

    expect(syntaxCheck.status, syntaxCheck.stderr).toBe(0)

    const usageCheck = spawnSync(process.execPath, [switchEnvScript, 'invalid-profile'], {
      encoding: 'utf8',
    })

    expect(usageCheck.status).toBe(1)
    expect(usageCheck.stdout).toContain('用法：')
    expect(usageCheck.stderr).not.toContain('SyntaxError')
  })
})
