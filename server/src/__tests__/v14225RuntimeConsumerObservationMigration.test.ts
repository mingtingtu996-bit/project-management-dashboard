import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')

function migrationFileNames() {
  return readdirSync(migrationsRoot)
    .filter((name) => name.endsWith('.sql'))
}

function allMigrationSource() {
  return migrationFileNames()
    .map((name) => readFileSync(resolve(migrationsRoot, name), 'utf8'))
    .join('\n')
}

describe('v1.4.22.5 runtime consumer observation migration', () => {
  it('uses a dedicated migration number after the v1.4.22.3 runtime publication migrations', () => {
    const fileNames = migrationFileNames()

    expect(fileNames).toContain('204_v14225_runtime_consumer_observations.sql')
    expect(fileNames).toContain('205_v14225_runtime_consumer_runtime_calls.sql')
    expect(fileNames).toContain('207_v14225_plan_network_outcomes.sql')
    expect(fileNames).not.toContain('202_v14225_runtime_consumer_observations.sql')
    expect(fileNames).toContain('202_v14223_dependency_rule_runtime_publications.sql')
    expect(fileNames).toContain('203_v14223_wbs_template_runtime_publications.sql')
  })

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

  it('creates a read-only production evidence source for runtime consumer calls', () => {
    const source = allMigrationSource()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.runtime_consumer_runtime_calls')
    expect(source).toContain('consumer_key TEXT NOT NULL')
    expect(source).toContain('runtime_entry_ref TEXT NOT NULL')
    expect(source).toContain("call_status TEXT NOT NULL")
    expect(source).toContain("CHECK (call_status IN ('called', 'rejected'))")
    expect(source).toContain('runtime_consumer_runtime_calls_no_runtime_writes')
    expect(source).toContain('writes_runtime_directly BOOLEAN NOT NULL DEFAULT false')
    expect(source).toContain('writes_fact_directly BOOLEAN NOT NULL DEFAULT false')
    expect(source).toContain('ALTER TABLE public.runtime_consumer_runtime_calls ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('idx_runtime_consumer_runtime_calls_consumer')
    expect(source).toContain('idx_runtime_consumer_runtime_calls_entry')
  })

  it('creates a read-only production evidence source for plan-network outcomes', () => {
    const source = allMigrationSource()

    expect(source).toContain('CREATE TABLE IF NOT EXISTS public.duration_plan_network_outcomes')
    expect(source).toContain('asset_key TEXT NOT NULL')
    expect(source).toContain("CHECK (asset_key IN (")
    expect(source).toContain("'special_work_duration_seed'")
    expect(source).toContain("'wbs_reference_days'")
    expect(source).toContain("'dependency_rule_candidate'")
    expect(source).toContain("'critical_path_rule_candidate'")
    expect(source).toContain("outcome_status TEXT NOT NULL")
    expect(source).toContain("CHECK (outcome_status IN ('accepted', 'weak', 'rejected'))")
    expect(source).toContain('learning_scope TEXT NOT NULL')
    expect(source).toContain("CHECK (learning_scope IN ('global', 'industry', 'company', 'project'))")
    expect(source).toContain('duration_plan_network_outcomes_no_runtime_writes')
    expect(source).toContain('duration_plan_network_outcomes_no_fact_writes')
    expect(source).toContain('ALTER TABLE public.duration_plan_network_outcomes ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('idx_duration_plan_network_outcomes_asset')
    expect(source).toContain('idx_duration_plan_network_outcomes_scope')
    expect(source).toContain('idx_duration_plan_network_outcomes_publication')
  })

  it('adds explicit learning scope to duration experience samples used as production evidence', () => {
    const source = allMigrationSource()

    expect(source).toContain('ALTER TABLE public.duration_experience_samples')
    expect(source).toContain('learning_scope TEXT NOT NULL DEFAULT')
    expect(source).toContain("CHECK (learning_scope IN ('global', 'industry', 'company', 'project'))")
    expect(source).toContain('idx_duration_experience_samples_learning_scope')
    expect(source).toContain('duration_experience_samples.learning_scope')
  })

  it('adds explicit learning scope provenance to duration production evidence sources', () => {
    const source = allMigrationSource()

    expect(source).toContain('learning_scope_source TEXT NOT NULL DEFAULT')
    expect(source).toContain('duration_experience_samples_learning_scope_source_check')
    expect(source).toContain('duration_plan_network_outcomes_learning_scope_source_check')
    expect(source).toContain("'task_completion_writer'")
    expect(source).toContain("'company_aggregate_evidence_job'")
    expect(source).toContain("'industry_shared_baseline_job'")
    expect(source).toContain("'global_shared_baseline_job'")
    expect(source).toContain("'project_business_outcome_writer'")
    expect(source).toContain("'plan_network_company_aggregate_job'")
    expect(source).toContain("'plan_network_industry_baseline_job'")
    expect(source).toContain("'plan_network_global_baseline_job'")
  })

  it('documents forecast scope-exception approval evidence on learnable parameter publications', () => {
    const source = allMigrationSource()

    expect(source).toContain('algorithm_learnable_parameter_runtime_publications.release_package')
    expect(source).toContain('scopeExceptionApprovalId')
    expect(source).toContain('scopeExceptionApprovalStatus')
    expect(source).toContain('forecast_scope_exception_approval_required')
  })
})
