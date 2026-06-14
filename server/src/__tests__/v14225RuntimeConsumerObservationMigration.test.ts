import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')

function allMigrationSource() {
  return readdirSync(migrationsRoot)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(resolve(migrationsRoot, name), 'utf8'))
    .join('\n')
}

describe('v1.4.22.5 runtime consumer observation migration', () => {
  it('creates a read-only production evidence source for runtime consumer observations', () => {
    const source = allMigrationSource()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.runtime_consumer_observations')
    expect(source).toContain('asset_key TEXT NOT NULL')
    expect(source).toContain('publication_key TEXT NOT NULL')
    expect(source).toContain("observation_status TEXT NOT NULL")
    expect(source).toContain("CHECK (observation_status IN ('observed', 'rejected'))")
    expect(source).toContain('runtime_consumer_observations_no_runtime_writes')
    expect(source).toContain('writes_runtime_directly BOOLEAN NOT NULL DEFAULT false')
    expect(source).toContain('writes_fact_directly BOOLEAN NOT NULL DEFAULT false')
    expect(source).toContain('ALTER TABLE public.runtime_consumer_observations ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('idx_runtime_consumer_observations_asset')
    expect(source).toContain('idx_runtime_consumer_observations_publication')
  })
})
