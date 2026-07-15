import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const {
  evaluateProductionReadyClaimsGuard,
  formatProductionReadyClaimsGuardFailure,
} = await import('../../scripts/guard-production-ready-claims.mjs')

const tempRoots: string[] = []
const workspaceRoot = existsSync(resolve(process.cwd(), 'server', 'src'))
  ? process.cwd()
  : resolve(process.cwd(), '..')

function createFixture(files: Record<string, string>) {
  const root = join(tmpdir(), `production-ready-claims-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(root, relativePath)
    mkdirSync(fullPath.slice(0, Math.max(fullPath.lastIndexOf('\\'), fullPath.lastIndexOf('/'))), { recursive: true })
    writeFileSync(fullPath, source)
  }
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('production-ready claims guard', () => {
  it('blocks production-ready claims that do not reference the v1.4.23.1-A / C-13 authority and degradation boundary', () => {
    const root = createFixture({
      'docs/plans/product-readiness-example.md': [
        '# product readiness example',
        '健康度分解已经 production-ready，可以作为核心卖点。',
      ].join('\n'),
    })

    const result = evaluateProductionReadyClaimsGuard(root, {
      scanTargets: ['docs/plans/product-readiness-example.md'],
    })

    expect(result.violations).toEqual([
      expect.objectContaining({
        relativePath: 'docs/plans/product-readiness-example.md',
        line: 2,
        reason: 'missing_v14231_c13_authority+missing_status_or_degradation_boundary',
      }),
    ])
    expect(formatProductionReadyClaimsGuardFailure(result.violations, root)).toContain('v1.4.23.1-A / C-13')
  })

  it('allows guarded production-ready wording when it is tied to C-13 and needs-gating downgrade rules', () => {
    const root = createFixture({
      'docs/plans/product-readiness-example.md': [
        '按 v1.4.23.1-A 的 C-13 状态表消费能力。',
        '只有 C-13 判定为 `production-ready` 的能力可作为主动作；`needs-gating` 必须 display-only 降级。',
      ].join('\n'),
    })

    const result = evaluateProductionReadyClaimsGuard(root, {
      scanTargets: ['docs/plans/product-readiness-example.md'],
    })

    expect(result.violations).toEqual([])
    expect(result.claimCount).toBe(1)
  })

  it('blocks unguarded production-ready claims in server code surfaces too', () => {
    const root = createFixture({
      'server/src/services/demoClaims.ts': [
        'export const claim = "后端整体 production-ready，可以作为商业卖点"',
      ].join('\n'),
    })

    const result = evaluateProductionReadyClaimsGuard(root, {
      scanTargets: ['server/src'],
    })

    expect(result.violations).toEqual([
      expect.objectContaining({
        relativePath: 'server/src/services/demoClaims.ts',
        line: 1,
        reason: 'missing_v14231_c13_authority+missing_status_or_degradation_boundary',
      }),
    ])
  })

  it('allows technical references to the production-ready claims guard itself', () => {
    const root = createFixture({
      'server/package.json': JSON.stringify({
        scripts: {
          'guard:production-ready-claims': 'node scripts/guard-production-ready-claims.mjs',
        },
      }),
    })

    const result = evaluateProductionReadyClaimsGuard(root, {
      scanTargets: ['server/package.json'],
    })

    expect(result.violations).toEqual([])
    expect(result.claimCount).toBe(0)
  })

  it('treats the v1.4.23.1-A ledger itself as the authoritative status source', () => {
    const root = createFixture({
      'docs/plans/v1.4.23.1-A体系收口台账与验收门禁矩阵.md': [
        '本矩阵是页面是否可依赖某项 v1.4 能力的唯一判定入口。',
        '| 状态 | 消费规则 |',
        '|---|---|',
        '| `production-ready` | 可作为主指标、主结论和稳定动作来源 |',
        '| `needs-gating` | 仅 `display-only`，不得触发处置动作 |',
      ].join('\n'),
    })

    const result = evaluateProductionReadyClaimsGuard(root, {
      scanTargets: ['docs/plans/v1.4.23.1-A体系收口台账与验收门禁矩阵.md'],
    })

    expect(result.violations).toEqual([])
  })

  it('keeps current production-ready claims guarded by the v1.4.23.1-A status ledger', () => {
    const result = evaluateProductionReadyClaimsGuard(workspaceRoot)

    expect(result.violations).toEqual([])
    expect(result.scannedFileCount).toBeGreaterThan(0)
  })
})
