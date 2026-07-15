import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server'))

describe('planning blocking status contract', () => {
  it('keeps baseline confirmation blocking checks aligned with Chinese and canonical resolved statuses', () => {
    const source = readFileSync(resolve(serverRoot, 'src/routes/task-baselines.ts'), 'utf8')

    expect(source).toContain("const SATISFIED_CONDITION_STATUSES = new Set(['completed', 'satisfied', 'confirmed', '已完成', '已满足', '已确认'])")
    expect(source).toContain("const RESOLVED_OBSTACLE_STATUSES = new Set(['resolved', 'closed', '已解决', '已关闭'])")
    expect(source).toContain('SATISFIED_CONDITION_STATUSES.has(status)')
    expect(source).toContain('RESOLVED_OBSTACLE_STATUSES.has(status)')
  })
})
