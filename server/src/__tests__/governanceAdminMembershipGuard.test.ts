import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : join(process.cwd(), 'server'))
const guardPath = resolve(serverRoot, 'scripts', 'guard-governance-admin-membership.mjs')

describe('governance admin membership guard', () => {
  it('flags governance routes that trust JWT globalRole as company-admin authorization', async () => {
    const { evaluateGovernanceAdminMembershipGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-governance-admin-'))
    const routesDir = join(fixtureRoot, 'src', 'routes')
    mkdirSync(routesDir, { recursive: true })

    writeFileSync(
      join(routesDir, 'duration-accuracy.ts'),
      "if (isCompanyAdminRole(req.user?.globalRole)) return true\n",
    )
    writeFileSync(
      join(routesDir, 'wbs-template-governance.ts'),
      "async function ensureCompanyGovernanceVisible(req:any){ if (isCompanyAdminRole(req.user?.globalRole)) return true }\n",
    )
    writeFileSync(
      join(routesDir, 'project-materials.ts'),
      "if (isCompanyAdminRole(req.user?.globalRole)) return true\n",
    )
    writeFileSync(
      join(routesDir, 'safe-governance.ts'),
      "const membership = await getCurrentCompanyMembership(req.user.id)\nif (membership?.role === 'company_admin') return true\n",
    )

    const result = evaluateGovernanceAdminMembershipGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({ filePath: expect.stringContaining('duration-accuracy.ts') }),
      expect.objectContaining({ filePath: expect.stringContaining('wbs-template-governance.ts') }),
    ])
  })
})
