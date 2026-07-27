import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : join(process.cwd(), 'server'))
const guardPath = resolve(serverRoot, 'scripts', 'guard-route-auth.mjs')

describe('route auth guard', () => {
  it('flags newly added unclassified routes and accepts explicit public approvals', async () => {
    const { evaluateRouteAuthGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-route-auth-'))
    const routesDir = join(fixtureRoot, 'src', 'routes')
    mkdirSync(routesDir, { recursive: true })

    writeFileSync(join(routesDir, 'unsafe.ts'), "import { Router } from 'express'\nconst router = Router()\nrouter.get('/leak', asyncHandler(async (_req, res) => res.json({ ok: true })))\n")
    writeFileSync(join(routesDir, 'safe.ts'), "import { Router } from 'express'\nconst router = Router()\nrouter.use(authenticate)\nrouter.get('/projects', asyncHandler(async (_req, res) => res.json({ ok: true })))\n")
    writeFileSync(join(routesDir, 'public.ts'), "import { Router } from 'express'\nconst router = Router()\n// route-auth-public-approved: health check\n// GET /health\nrouter.get('/health', asyncHandler(async (_req, res) => res.json({ ok: true })))\n")

    const result = evaluateRouteAuthGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({
        filePath: expect.stringContaining('unsafe.ts'),
        method: 'get',
        routePath: '/leak',
      }),
    ])
  })

  it('keeps performance summary behind authenticate instead of a public approval marker', () => {
    const source = readFileSync(resolve(serverRoot, 'src', 'routes', 'performance-reports.ts'), 'utf8')

    expect(source).toMatch(/router\.get\('\/summary',\s*authenticate,/)
    expect(source).not.toMatch(/route-auth-public-approved:[^\n]*summary/)
  })
})
