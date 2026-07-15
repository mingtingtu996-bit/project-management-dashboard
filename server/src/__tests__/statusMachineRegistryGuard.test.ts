import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const {
  evaluateStatusMachineRegistryGuard,
  formatStatusMachineRegistryGuardFailure,
} = await import('../../scripts/guard-status-machine-registry.mjs')

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server'))

describe('status machine registry guard', () => {
  it('requires non-planning lifecycle domains to have registered transition edges', () => {
    const result = evaluateStatusMachineRegistryGuard(serverRoot)

    expect(result.violations).toEqual([])
    expect(result.requiredDomains).toEqual(expect.arrayContaining([
      'acceptance.lifecycle',
      'material.lifecycle',
      'certificate.lifecycle',
      'drawing.lifecycle',
      'risk.lifecycle',
      'issue.lifecycle',
      'warning.lifecycle',
      'notification.lifecycle',
      'invitation.lifecycle',
      'data_quality.finding_status',
    ]))
    expect(result.transitionDomains).toEqual(expect.arrayContaining(result.requiredDomains))
  })

  it('reads bootstrap transitions without depending on the next declaration name', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'status-machine-registry-'))
    const serviceDir = join(tempRoot, 'src', 'services')
    mkdirSync(serviceDir, { recursive: true })
    writeFileSync(join(serviceDir, 'statusDictionaryService.ts'), `
const BOOTSTRAP_DOMAINS = [
  { domain_key: 'task.lifecycle' },
]

const BOOTSTRAP_TRANSITIONS = [
  { domain_key: 'task.lifecycle', from_status: 'todo', to_status: 'in_progress' },
]

export type StatusDictionaryBootstrapResult = { transitionCount: number }
`)

    try {
      const result = evaluateStatusMachineRegistryGuard(tempRoot)
      expect(result.transitionDomains).toContain('task.lifecycle')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('keeps material runtime lifecycle status registered instead of only derived display status', () => {
    const source = readFileSync(resolve(serverRoot, 'src', 'services', 'statusDictionaryService.ts'), 'utf8')

    expect(source).toContain("'material.lifecycle'")
    expect(source).toContain("{ domain_key: 'material.lifecycle'")
    expect(source).toContain("{ domain_key: 'material.lifecycle', from_status: 'used', to_status: 'consumed'")
  })

  it('formats missing transition coverage with actionable domain names', () => {
    const message = formatStatusMachineRegistryGuardFailure([
      { domainKey: 'material.lifecycle', reason: 'missing_transition_edges' },
    ])

    expect(message).toContain('material.lifecycle')
    expect(message).toContain('missing_transition_edges')
  })

  it('requires risk and issue retention-close write paths to pass through lifecycle transition checks', () => {
    const risksRoute = readFileSync(resolve(serverRoot, 'src', 'routes', 'risks.ts'), 'utf8')
    const issuesRoute = readFileSync(resolve(serverRoot, 'src', 'routes', 'issues.ts'), 'utf8')

    expect(risksRoute).toContain("assertTransition('risk.lifecycle'")
    expect(issuesRoute).toContain("assertTransition('issue.lifecycle'")
    expect(risksRoute.indexOf("assertTransition('risk.lifecycle'")).toBeLessThan(
      risksRoute.indexOf("status: 'closed'"),
    )
    expect(issuesRoute.indexOf("assertTransition('issue.lifecycle'")).toBeLessThan(
      issuesRoute.indexOf("status: 'closed'"),
    )
  })

  it('ships a migration for retention-close lifecycle transition edges', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations', '223_v14231_risk_issue_retention_close_status_transitions.sql'),
      'utf8',
    )

    expect(migration).toContain("('risk.lifecycle', 'identified', 'closed'")
    expect(migration).toContain("('issue.lifecycle', 'open', 'closed'")
    expect(migration).toContain("('issue.lifecycle', 'investigating', 'closed'")
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()')
    expect(migration.indexOf('ADD COLUMN IF NOT EXISTS updated_at')).toBeLessThan(
      migration.indexOf('INSERT INTO public.status_transitions'),
    )
    expect(migration).toMatch(/ON\s+CONFLICT\s*\(\s*domain_key,\s*from_status,\s*to_status,\s*COALESCE\(event_key,\s*''\)\s*\)\s+DO\s+UPDATE/i)
  })
})
