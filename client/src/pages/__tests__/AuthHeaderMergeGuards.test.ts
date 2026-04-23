import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function readSource(candidates: string[]) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf8')
    }
  }
  throw new Error(`Unable to locate source file in: ${candidates.join(', ')}`)
}

function expectSafeRequestJsonMerge(source: string) {
  expect(source).toContain("const requestHeaders = {")
  expect(source).toContain("...getAuthHeaders(),")
  expect(source).toContain("...(init?.headers || {}),")
  expect(source).toContain("...init,")
  expect(source).toContain("headers: requestHeaders,")
  expect(source).not.toMatch(/headers:\s*\{\s*\.\.\.getAuthHeaders\(\),[\s\S]{0,160}\.\.\.init,/)
}

describe('auth header merge guards', () => {
  it('keeps authorization headers when JoinProject sends POST requests', () => {
    const source = readSource([
      join(process.cwd(), 'src/pages/JoinProject.tsx'),
      join(process.cwd(), 'client/src/pages/JoinProject.tsx'),
    ])

    expectSafeRequestJsonMerge(source)
  })

  it('keeps authorization headers when team management sends write requests', () => {
    const source = readSource([
      join(process.cwd(), 'src/components/team/ProjectTeamManagementPanel.tsx'),
      join(process.cwd(), 'client/src/components/team/ProjectTeamManagementPanel.tsx'),
    ])

    expectSafeRequestJsonMerge(source)
  })
})
