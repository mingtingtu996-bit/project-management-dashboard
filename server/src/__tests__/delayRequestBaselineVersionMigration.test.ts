import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('092_add_delay_request_baseline_version migration', () => {
  it('adds baseline_version_id to delay_requests and reloads pgrst schema cache', () => {
    const filePath = new URL('../../migrations/092_add_delay_request_baseline_version.sql', import.meta.url)
    const source = readFileSync(filePath, 'utf8')

    expect(source).toContain('ALTER TABLE IF EXISTS public.delay_requests')
    expect(source).toContain('ADD COLUMN IF NOT EXISTS baseline_version_id UUID')
    expect(source).toContain('idx_delay_requests_baseline_version_id')
    expect(source).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
