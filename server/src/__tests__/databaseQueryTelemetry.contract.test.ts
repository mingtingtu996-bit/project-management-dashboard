import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('database query telemetry contract', () => {
  it('logs a safe fingerprint and duration for failed queries without logging parameters', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/database.ts'), 'utf8')
    const errorBlock = source.slice(
      source.indexOf("console.error('Database query error'"),
      source.indexOf('throw error;', source.indexOf("console.error('Database query error'")),
    )

    expect(errorBlock).toContain('queryFingerprint')
    expect(errorBlock).toContain('duration')
    expect(errorBlock).not.toContain('params')
    expect(errorBlock).not.toContain('text,')
  })
})
