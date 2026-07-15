import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('extended schema drift script contract', () => {
  it('includes extended migration objects in the blocking drift result', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scripts/check-schema-drift.ts'), 'utf8')

    expect(source).toContain('buildExpectedExtendedSchemaFromMigrationSql')
    expect(source).toContain('introspectActualExtendedSchema')
    expect(source).toContain('evaluateExtendedSchemaDrift')
    expect(source).toMatch(/blockingDrift:\s*\[\.\.\.result\.blockingDrift,\s*\.\.\.extendedResult\.blockingDrift\]/)
    expect(source).not.toContain('DRIFT_COVERAGE_BACKLOG')
    expect(source).toContain('coverageBacklog: []')
  })
})
