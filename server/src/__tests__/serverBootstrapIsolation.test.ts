import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const serverRoot = resolve(__dirname, '..', '..')

function readServerSource(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('server bootstrap isolation', () => {
  it('can skip DB-backed reference bootstrap and read-model warmup for local preview verification', () => {
    const indexSource = readServerSource('src', 'index.ts')

    expect(indexSource).toContain('SKIP_REFERENCE_DATA_BOOTSTRAP')
    expect(indexSource).toContain('shouldBootstrapReferenceData')
    expect(indexSource).toContain('bootstrapReferenceData()')
    expect(indexSource).toContain('Promise.resolve()')

    expect(indexSource).toContain('SKIP_READ_MODEL_WARMUP')
    expect(indexSource).toContain('shouldWarmReadModelOnBoot')
    expect(indexSource).toContain('scheduleReadModelWarmup()')
  })

  it('gates production scheduler and read-model warmup behind the release migration ledger attestation', () => {
    const indexSource = readServerSource('src', 'index.ts')

    expect(indexSource).toContain('evaluateProductionMigrationRuntimeGate')
    expect(indexSource).toContain('EXPECTED_SCHEMA_MIGRATION_FILENAME')
    expect(indexSource).toContain('EXPECTED_SCHEMA_MIGRATION_CHECKSUM')
    expect(indexSource).toContain('readMigrationLedgerEntry')
    expect(indexSource).not.toContain('PRODUCTION_MIGRATION_GOVERNANCE_EVIDENCE')
    expect(indexSource).toContain('production_migration_runtime_bootstrap_blocked')
    expect(indexSource).toContain('productionMigrationRuntimeGate.allowScheduler')
    expect(indexSource).toContain('productionMigrationRuntimeGate.allowWarmup')
    expect(indexSource).toMatch(/if \(shouldBootScheduler && productionMigrationRuntimeGate\.allowScheduler\)/)
    expect(indexSource).toMatch(/if \(shouldWarmReadModelOnBoot && productionMigrationRuntimeGate\.allowWarmup\)/)
  })

  it('does not validate boot health through anon-key project reads after core RLS is forced', () => {
    const indexSource = readServerSource('src', 'index.ts')
    const validateDatabaseConnection = indexSource.slice(
      indexSource.indexOf('async function validateDatabaseConnection()'),
      indexSource.indexOf('async function bootstrapReferenceData()'),
    )

    expect(validateDatabaseConnection).toContain('warmDatabasePool()')
    expect(validateDatabaseConnection).toContain('createSupabaseRuntimeClient(')
    expect(validateDatabaseConnection).not.toContain('createClient(')
    expect(validateDatabaseConnection).not.toContain('process.env.SUPABASE_ANON_KEY')
    expect(validateDatabaseConnection).not.toContain('SUPABASE_SERVICE_KEY')
    expect(validateDatabaseConnection).not.toContain(".from('projects').select('id').limit(1)")
    expect(validateDatabaseConnection).toContain(".from('status_dictionary_versions')")
    expect(validateDatabaseConnection).toContain(".select('version_key')")
  })
})
