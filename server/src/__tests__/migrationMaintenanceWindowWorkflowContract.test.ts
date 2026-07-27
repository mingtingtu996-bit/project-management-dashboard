import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const workspaceRoot = resolve(serverRoot, '..')

describe('migration maintenance window workflow contract', () => {
  it('requires a controlled low-traffic window before staging or production migration writes', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')
    const runbook = readFileSync(resolve(workspaceRoot, 'docs/release-runbook.md'), 'utf8')

    expect(workflow).toContain('migration_maintenance_window_confirmed:')
    expect(workflow).toContain('Confirm controlled migration maintenance window')
    expect(workflow).toContain('MIGRATION_MAINTENANCE_WINDOW_CONFIRMED')
    expect(workflow).toContain('github.event.inputs.migration_maintenance_window_confirmed')
    expect(workflow.indexOf('Confirm controlled migration maintenance window')).toBeLessThan(
      workflow.indexOf('Preflight current migration governance inputs'),
    )
    expect(runbook).toContain('MIGRATION_MAINTENANCE_WINDOW_CONFIRMED=true')
    expect(runbook).toContain('non-concurrent `CREATE INDEX`')
  })
})
