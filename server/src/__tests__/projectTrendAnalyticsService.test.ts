import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('projectTrendAnalyticsService SQL shape', () => {
  it('keeps direct trend reads on fixed project-scope SQL branches', () => {
    const source = readServerFile('src', 'services', 'projectTrendAnalyticsService.ts')

    expect(source).not.toContain("let projectFilter = ''")
    expect(source).not.toContain('+ projectFilter')
    expect(source).not.toContain("].join('\\n')")
    expect(source).toContain('FROM public.project_daily_snapshot')
    expect(source).toContain('FROM public.metric_value_snapshots')
    expect(source).toContain('project_id = $3')
    expect(source).toContain('project_id = ANY($3::uuid[])')
  })
})
