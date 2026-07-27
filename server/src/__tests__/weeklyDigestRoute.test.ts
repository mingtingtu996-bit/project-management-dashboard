import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

function readServerFile(...segments: string[]) {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('weekly digest route guard', () => {
  it('requires authentication before exposing weekly digest reads', () => {
    const source = readServerFile('src', 'routes', 'weekly-digest.ts')

    expect(source).toContain("import { authenticate, requireProjectMember } from '../middleware/auth.js'")
    expect(source).toContain('const router = Router()')
    expect(source).toContain('router.use(authenticate)')
    expect(source).toContain("router.get('/:id/weekly-digest/latest'")
  })

  it('keeps the route at orchestration only and delegates typed duration projection', () => {
    const source = readServerFile('src', 'routes', 'weekly-digest.ts')

    expect(source).toContain('getLatestWeeklyDigestReadModel')
    expect(source).not.toContain("from '../database.js'")
    expect(source).not.toContain("from '../services/dbService.js'")
    expect(source).not.toContain('normalizeDigestRow')
    expect(source).not.toContain('Object.fromEntries')
  })
})
