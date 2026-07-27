import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('task baseline business version migration', () => {
  it('allows draft baselines to avoid consuming business version numbers', () => {
    const filePath = new URL('../../migrations/118_task_baseline_business_version_drafts.sql', import.meta.url)
    const source = readFileSync(filePath, 'utf8')

    expect(source).toContain('ALTER COLUMN version DROP NOT NULL')
    expect(source).toContain('ALTER COLUMN version DROP DEFAULT')
    expect(source).toContain('idx_task_baselines_project_business_version')
    expect(source).toContain('WHERE version IS NOT NULL')
  })
})
