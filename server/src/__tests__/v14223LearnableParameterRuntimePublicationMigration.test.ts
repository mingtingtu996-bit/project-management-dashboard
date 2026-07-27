import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = () => readFileSync(
  new URL('../../migrations/197_v14223_learnable_parameter_runtime_publications.sql', import.meta.url),
  'utf8',
)

describe('v1.4.22.3 learnable parameter runtime publication migration', () => {
  it('creates scoped parameter runtime publication and release-event tables', () => {
    const source = migration()

    const requiredTables = [
      'public.algorithm_learnable_parameter_runtime_publications',
      'public.algorithm_learnable_parameter_release_events',
    ]

    for (const tableName of requiredTables) {
      expect(source).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`)
      expect(source).toContain(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`)
    }

    expect(source).toContain('publication_key TEXT NOT NULL UNIQUE')
    expect(source).toContain('event_key TEXT NOT NULL')
    expect(source).toContain('parameter_key TEXT NOT NULL')
    expect(source).toContain('release_package JSONB NOT NULL DEFAULT')
    expect(source).toContain('impact_monitoring JSONB NOT NULL DEFAULT')
    expect(source).toContain('rollback_execution JSONB NULL')
    expect(source).toContain('record_visibility_policy TEXT NOT NULL DEFAULT')
  })

  it('locks parameter publication scope status and no-seed-runtime boundaries into SQL', () => {
    const source = migration()

    expect(source).toContain('algorithm_learnable_parameter_runtime_publications_scope_consistency')
    expect(source).toContain('algorithm_learnable_parameter_runtime_publications_no_seed_runtime_target')
    expect(source).toContain("CHECK (scope_level IN ('company', 'project', 'system'))")
    expect(source).toContain("CHECK (target_surface IN ('project_override', 'company_override', 'system_seed'))")
    expect(source).toContain("CHECK (publication_status IN ('published', 'canary', 'rolled_back'))")
    expect(source).toContain("CHECK (event_type IN ('parameter_runtime_publication', 'rollback_execution', 'impact_monitoring'))")
    expect(source).toContain('idx_algorithm_learnable_parameter_runtime_publications_scope')
    expect(source).toContain('idx_algorithm_learnable_parameter_runtime_publications_key')
    expect(source).toContain('idx_algorithm_learnable_parameter_release_events_publication')
    expect(source).toContain('idx_algorithm_learnable_parameter_release_events_status')
  })
})
