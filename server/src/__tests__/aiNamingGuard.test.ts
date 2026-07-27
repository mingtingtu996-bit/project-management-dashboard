import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const { evaluateAiNamingGuard } = await import('../../scripts/guard-ai-naming.mjs')

const tempRoots: string[] = []

function createFixture(files: Record<string, string>) {
  const root = join(tmpdir(), `ai-naming-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(root, relativePath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
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

describe('AI naming guard', () => {
  it('allows ordinary words that contain ai as lowercase letters', () => {
    const root = createFixture({
      'client/src/main.ts': `
        const email = 'owner@example.com'
        const details = { chain: 'baseline', available: true }
        export const value = [email, details]
      `,
      'server/src/routes/health.ts': `
        export const route = 'maintain-detail'
      `,
    })

    expect(evaluateAiNamingGuard(root)).toEqual([])
  })

  it('blocks product-facing AI labels and retired duration AI routes', () => {
    const root = createFixture({
      'client/src/App.tsx': `
        export const title = 'AI 助手'
      `,
      'server/src/routes/duration.ts': `
        router.use('/api/ai-duration', durationRouter)
      `,
    })

    expect(evaluateAiNamingGuard(root)).toEqual([
      expect.objectContaining({
        kind: 'product-ai-label',
        file: 'client/src/App.tsx',
      }),
      expect.objectContaining({
        kind: 'legacy-ai-duration-surface',
        file: 'server/src/routes/duration.ts',
      }),
    ])
  })

  it('blocks retired AI duration route registrations in the server entrypoint', () => {
    const root = createFixture({
      'server/src/index.ts': `
        app.use('/api/ai-duration', aiDurationRouter)
        app.use('/api/ai-schedule', aiScheduleRouter)
      `,
    })

    expect(evaluateAiNamingGuard(root)).toEqual([
      expect.objectContaining({
        kind: 'legacy-ai-duration-surface',
        file: 'server/src/index.ts',
      }),
      expect.objectContaining({
        kind: 'legacy-ai-duration-surface',
        file: 'server/src/index.ts',
      }),
    ])
  })
})
