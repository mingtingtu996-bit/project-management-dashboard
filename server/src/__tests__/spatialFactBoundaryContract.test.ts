import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

function readWorkspaceFile(...segments: string[]): string {
  return readFileSync(resolve(workspaceRoot, ...segments), 'utf8')
}

function extractC143Row(planDoc: string): string {
  const row = planDoc
    .split(/\r?\n/)
    .find((line) => line.startsWith('| C-14.3 |'))

  if (!row) {
    throw new Error('Missing C-14.3 row in v1.4.23.1 closeout ledger')
  }

  return row
}

describe('spatial fact boundary contract', () => {
  it('closes C-14.3 as a task-level spatial boundary instead of an unowned gap', () => {
    const planDoc = readWorkspaceFile(
      'docs',
      'plans',
      'v1.4.23.1体系收口台账与验收门禁矩阵.md',
    )
    const row = extractC143Row(planDoc)

    expect(row).toContain('已接受任务级边界为最终口径')
    expect(row).toContain('by-design')
    expect(row).toContain('空间分析仅任务级成立')
    expect(row).toContain('禁止系统级空间下钻')
    expect(row).toContain('持续门禁')
    expect(row).not.toContain('待认领')
    expect(row).not.toContain('收口选择二选一')
  })

  it('keeps the v1.4 authoritative release ledger honest about spatial drill-down limits', () => {
    const planDoc = readWorkspaceFile(
      'docs',
      'plans',
      'v1.4.23.1-A体系收口台账与验收门禁矩阵.md',
    )
    const row = extractC143Row(planDoc)

    expect(row).toContain('当前产品只承诺“任务级空间分析”')
    expect(row).toContain('禁止系统级空间下钻')
    expect(row).toContain('禁止楼栋/楼层/区域维度聚合风险/材料/图纸等 UI 或 API 宣称')
    expect(row).toContain('必须另立专项补空间 FK + 回填 + 权限 + 聚合出口 + 回归门禁')
  })
})
