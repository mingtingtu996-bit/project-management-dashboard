import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

describe('project climate route security', () => {
  it('keeps reads member-visible and requires editor permission for every mutation', () => {
    const source = readFileSync(resolve(workspaceRoot, 'server/src/routes/project-climate.ts'), 'utf8')
    const readSection = source.slice(source.indexOf("router.get("), source.indexOf("router.post("))
    const writeSection = source.slice(source.indexOf("router.post("))

    expect(source).toContain('requireProjectEditor')
    expect(readSection.match(/requireProjectMember/g)).toHaveLength(2)
    expect(writeSection.match(/requireProjectEditor/g)).toHaveLength(3)
    expect(writeSection).not.toContain('requireProjectMember')
    expect(writeSection).toContain('createRequestAbortSignal(req, res)')
    expect(writeSection).toContain('syncProjectWeatherForecast(req.params.projectId, { signal })')
  })
})
