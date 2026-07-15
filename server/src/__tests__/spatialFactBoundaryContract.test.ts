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

  it('keeps both v1.4 closeout ledgers aligned on the task-level spatial boundary', () => {
    const supplementalPlan = readWorkspaceFile('docs', 'plans', "v1.4.23.1-A体系收口台账与验收门禁矩阵.md")
    const row = extractC143Row(supplementalPlan)

    expect(row).toContain('by-design')
    expect(row).toContain('`tasks`')
    expect(row).toContain('`risks`')
    expect(row).toContain('`project_materials`')
    expect(row).toContain('`construction_drawings`')
    expect(row).toContain('UI')
    expect(row).toContain('API')
  })
})
