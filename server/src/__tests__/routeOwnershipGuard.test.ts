import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : join(process.cwd(), 'server'))
const workspaceRoot = dirname(serverRoot)
const guardPath = resolve(serverRoot, 'scripts', 'guard-route-ownership.mjs')

describe('route ownership guard', () => {
  it('flags index-registered API roots missing from the v1.4.23.1 ownership matrix', async () => {
    const { evaluateRouteOwnershipGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-route-ownership-'))
    const fixtureServerRoot = join(fixtureRoot, 'server')
    const fixtureDocsDir = join(fixtureRoot, 'docs', 'plans')
    mkdirSync(join(fixtureServerRoot, 'src', 'routes'), { recursive: true })
    mkdirSync(fixtureDocsDir, { recursive: true })

    writeFileSync(join(fixtureServerRoot, 'src', 'index.ts'), [
      "import express from 'express'",
      "import knownRouter from './routes/known.js'",
      "import unknownRouter from './routes/unknown.js'",
      "const app = express()",
      "app.use('/api/projects', knownRouter)",
      "app.use('/api/new-shadow-entry', unknownRouter)",
    ].join('\n'))
    writeFileSync(join(fixtureServerRoot, 'src', 'routes', 'known.ts'), 'export default {}\n')
    writeFileSync(join(fixtureServerRoot, 'src', 'routes', 'unknown.ts'), 'export default {}\n')
    writeFileSync(join(fixtureDocsDir, 'v1.4.23.1体系收口台账与验收门禁矩阵.md'), [
      '| 架构单元 | 节奏 / 治理姿态 | 主要内容 | 典型代码入口 | 代码归位状态 | 持续边界 |',
      '|---|---|---|---|---|---|',
      '| 主执行环：建模 | x | x | `projects` | non-live 已收口 | x |',
      '| 底座：平台运行观测 | x | x | `health` | 持续门禁 | x |',
    ].join('\n'))

    const result = evaluateRouteOwnershipGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({
        routeRoot: '/api/new-shadow-entry',
        reason: 'unowned_route_root',
      }),
    ])
  })

  it('requires duplicate index route roots to have an explicit ownership boundary note', async () => {
    const { evaluateRouteOwnershipGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-route-ownership-duplicate-'))
    const fixtureServerRoot = join(fixtureRoot, 'server')
    const fixtureDocsDir = join(fixtureRoot, 'docs', 'plans')
    mkdirSync(join(fixtureServerRoot, 'src', 'routes'), { recursive: true })
    mkdirSync(fixtureDocsDir, { recursive: true })

    writeFileSync(join(fixtureServerRoot, 'src', 'index.ts'), [
      "import express from 'express'",
      "import projectsRouter from './routes/projects.js'",
      "import projectClimateRouter from './routes/project-climate.js'",
      "const app = express()",
      "app.use('/api/projects', projectsRouter)",
      "app.use('/api/projects', projectClimateRouter)",
    ].join('\n'))
    writeFileSync(join(fixtureServerRoot, 'src', 'routes', 'projects.ts'), 'export default {}\n')
    writeFileSync(join(fixtureServerRoot, 'src', 'routes', 'project-climate.ts'), 'export default {}\n')
    writeFileSync(join(fixtureDocsDir, 'v1.4.23.1体系收口台账与验收门禁矩阵.md'), [
      '| 架构单元 | 节奏 / 治理姿态 | 主要内容 | 典型代码入口 | 代码归位状态 | 持续边界 |',
      '|---|---|---|---|---|---|',
      '| 主执行环：建模 | x | x | `projects`、`project-climate` | non-live 已收口 | x |',
    ].join('\n'))

    const result = evaluateRouteOwnershipGuard(fixtureRoot)

    expect(result.violations).toEqual([
      expect.objectContaining({
        routeRoot: '/api/projects',
        reason: 'duplicate_route_root_without_boundary_note',
      }),
    ])
  })

  it('keeps current index routes assigned to the v1.4.23.1 architecture units', async () => {
    const { evaluateRouteOwnershipGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateRouteOwnershipGuard(workspaceRoot)

    expect(result.violations).toEqual([])
    expect(result.routeRoots).toContain('/api/livez')
    expect(result.routeRoots).toContain('/api/readyz')
    expect(result.routeRoots).toContain('/api/auth/login')
    expect(result.routeRoots).toContain('/api/auth/register')
    expect(result.routeRoots).toContain('/api/company/dashboard')
    expect(result.routeRoots).toContain('/api/duration-suggestions')
    expect(result.routeRoots).toContain('/api/admin/duration-assets')
    expect(result.routeRoots).toContain('/api/issues')
    expect(result.routeRoots).toContain('/api/wbs-template-governance')
  })
})
