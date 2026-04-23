import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('migration helper entrypoints', () => {
  it('pins clean migration helpers to the canonical V4 bundle only', () => {
    const cleanRunner = readServerFile('run-clean-migration.mjs')
    const guidanceRunner = readServerFile('run-migration.js')
    const cjsGuidanceRunner = readServerFile('run-migration.cjs')

    for (const source of [cleanRunner, guidanceRunner, cjsGuidanceRunner]) {
      expect(source).toContain("const CANONICAL_CLEAN_BUNDLE = 'CLEAN_MIGRATION_V4.sql'")
      expect(source).not.toContain("'CLEAN_MIGRATION_V3.sql'")
      expect(source).not.toContain("'CLEAN_MIGRATION_V2.sql'")
      expect(source).not.toContain("'CLEAN_MIGRATION.sql'")
    }
  })
})
