import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { startReadinessQuerySchema } from '../routes/project-start-readiness.js'

function readServerFile(...segments: string[]) {
  const cwd = process.cwd()
  const root = cwd.split(/[\\/]/).pop()?.toLowerCase() === 'server' ? resolve(cwd, '..') : cwd
  return readFileSync(resolve(root, 'server', ...segments), 'utf8')
}

describe('project start-readiness route contract', () => {
  it('rejects impossible calendar dates before orchestrating the read model', () => {
    expect(startReadinessQuerySchema.safeParse({ asOfDate: '2027-02-29' }).success).toBe(false)
    expect(startReadinessQuerySchema.safeParse({ as_of_date: '2028-02-29' }).success).toBe(true)
  })

  it('keeps the route as validated project-scoped orchestration only', () => {
    const source = readServerFile('src', 'routes', 'project-start-readiness.ts')

    expect(source).toContain('requireProjectMember')
    expect(source).toContain('getAuthorizedRequestProjectId')
    expect(source).toContain('getProjectStartReadiness(')
    expect(source).not.toMatch(/\.reduce\s*\(/)
    expect(source).not.toMatch(/\.filter\s*\(/)
    expect(source).not.toContain('task_conditions')
    expect(source).not.toContain('task_dependencies')
  })

  it('mounts the project route before the generic projects router', () => {
    const source = readServerFile('src', 'index.ts')
    const readinessMount = source.indexOf("app.use('/api/projects', projectStartReadinessRouter)")
    const projectsMount = source.indexOf("app.use('/api/projects', projectsRouter)")

    expect(readinessMount).toBeGreaterThan(0)
    expect(projectsMount).toBeGreaterThan(readinessMount)
  })
})
