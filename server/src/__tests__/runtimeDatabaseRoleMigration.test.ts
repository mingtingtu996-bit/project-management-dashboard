import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server'))
const migrationPath = resolve(serverRoot, 'migrations/228_v14231_runtime_database_role.sql')

describe('runtime database role migration', () => {
  it('creates a non-bypass runtime role and grants it runtime database privileges', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/CREATE\s+ROLE\s+workbuddy_runtime/i)
    expect(sql).toMatch(/NOBYPASSRLS/i)
    expect(sql).toMatch(/NOLOGIN/i)
    expect(sql).toMatch(/GRANT\s+USAGE\s+ON\s+SCHEMA\s+public\s+TO\s+workbuddy_runtime/i)
    expect(sql).toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+workbuddy_runtime/i)
    expect(sql).toMatch(/GRANT\s+USAGE,\s*SELECT\s+ON\s+ALL\s+SEQUENCES\s+IN\s+SCHEMA\s+public\s+TO\s+workbuddy_runtime/i)
  })

  it('keeps runtime RLS helper function ACLs granted to the backend runtime role', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/229_v14231_runtime_rls_helper_function_acl.sql'), 'utf8')

    expect(followupSql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_active_company_member\(UUID,\s*TEXT\[\]\)\s+TO\s+workbuddy_runtime/i)
  })

  it('also grants runtime RLS helper execution to the concrete runtime login role when present', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/233_v14231_runtime_login_rls_helper_acl.sql'), 'utf8')

    expect(followupSql).toMatch(/rolname\s*=\s*'workbuddy_runtime_login'/i)
    expect(followupSql).toMatch(/ALTER\s+ROLE\s+workbuddy_runtime_login\s+WITH\s+INHERIT\s+NOBYPASSRLS/i)
    expect(followupSql).toMatch(/GRANT\s+workbuddy_runtime\s+TO\s+workbuddy_runtime_login/i)
    expect(followupSql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_active_company_member\(UUID,\s*TEXT\[\]\)\s+TO\s+workbuddy_runtime_login/i)
  })

  it('adds a backend runtime policy for users so auth/session freshness can read live users', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/230_v14231_runtime_users_backend_policy.sql'), 'utf8')

    expect(followupSql).toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+TABLE\s+public\.users\s+TO\s+workbuddy_runtime/i)
    expect(followupSql).toContain('DROP POLICY IF EXISTS users_backend_runtime_policy ON public.users;')
    expect(followupSql).toContain('CREATE POLICY users_backend_runtime_policy ON public.users')
    expect(followupSql).toMatch(/ON\s+public\.users[\s\S]+TO\s+workbuddy_runtime/i)
    expect(followupSql).toMatch(/current_user\s*=\s*'workbuddy_runtime'/i)
    expect(followupSql).toMatch(/pg_has_role\(current_user,\s*'workbuddy_runtime',\s*'member'\)/i)
  })

  it('adds explicit backend runtime policies for every forced core RLS table', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const forcedTables = [
      'companies',
      'company_members',
      'projects',
      'tasks',
      'task_dependencies',
      'engineering_objects',
      'acceptance_plans',
      'project_daily_snapshot',
    ]

    for (const table of forcedTables) {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${table}_backend_runtime_policy ON public.${table};`)
      expect(sql).toContain(`CREATE POLICY ${table}_backend_runtime_policy ON public.${table}`)
      expect(sql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+TO\\s+workbuddy_runtime`, 'i'))
      expect(sql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+current_user\\s*=\\s*'workbuddy_runtime'`, 'i'))
      expect(sql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+pg_has_role\\(current_user,\\s*'workbuddy_runtime',\\s*'member'\\)`, 'i'))
    }
  })

  it('adds a backend runtime policy for project membership reads used by workspace aggregation', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/262_v14232_project_members_runtime_rls_policy.sql'), 'utf8')

    expect(followupSql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_members TO workbuddy_runtime')
    expect(followupSql).toContain('DROP POLICY IF EXISTS project_members_backend_runtime_policy ON public.project_members;')
    expect(followupSql).toContain('CREATE POLICY project_members_backend_runtime_policy ON public.project_members')
    expect(followupSql).toMatch(/ON\s+public\.project_members[\s\S]+TO\s+workbuddy_runtime/i)
    expect(followupSql).toMatch(/current_user\s*=\s*'workbuddy_runtime'/i)
    expect(followupSql).toMatch(/pg_has_role\(current_user,\s*'workbuddy_runtime',\s*'member'\)/i)
  })

  it('adds backend runtime policies for task code rule bootstrap tables used by the main write chain', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/235_v14231_task_code_runtime_rls_policies.sql'), 'utf8')
    const tables = [
      'project_task_code_rules',
      'task_code_sequences',
      'task_code_history',
    ]

    for (const table of tables) {
      expect(followupSql).toContain(`GRANT SELECT, INSERT, UPDATE ON TABLE public.${table} TO workbuddy_runtime`)
      expect(followupSql).toMatch(new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+${table}_backend_runtime_policy\\s+ON\\s+public\\.${table}`, 'i'))
      expect(followupSql).toContain(`CREATE POLICY ${table}_backend_runtime_policy ON public.${table}`)
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+TO\\s+workbuddy_runtime`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+current_user\\s*=\\s*'workbuddy_runtime'`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+pg_has_role\\(current_user,\\s*'workbuddy_runtime',\\s*'member'\\)`, 'i'))
    }
  })

  it('adds backend runtime policies for task creation side-effect tables', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/236_v14231_task_creation_side_effect_runtime_rls_policies.sql'), 'utf8')
    const tables = [
      'task_timeline_events',
      'operation_logs',
    ]

    for (const table of tables) {
      expect(followupSql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO workbuddy_runtime`)
      expect(followupSql).toMatch(new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+${table}_backend_runtime_policy\\s+ON\\s+public\\.${table}`, 'i'))
      expect(followupSql).toContain(`CREATE POLICY ${table}_backend_runtime_policy ON public.${table}`)
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+TO\\s+workbuddy_runtime`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+current_user\\s*=\\s*'workbuddy_runtime'`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+pg_has_role\\(current_user,\\s*'workbuddy_runtime',\\s*'member'\\)`, 'i'))
    }
  })

  it('adds backend runtime policies for data lineage writes used by wizard task creation', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/237_v14231_data_lineage_runtime_rls_policies.sql'), 'utf8')
    const writableTables = [
      'data_lineage_links',
      'data_lineage_events',
      'data_lineage_batches',
    ]
    const readableTables = [
      'data_lineage_entity_types',
      'data_lineage_relation_rules',
    ]

    for (const table of writableTables) {
      expect(followupSql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO workbuddy_runtime`)
      expect(followupSql).toContain(`DROP POLICY IF EXISTS ${table}_backend_runtime_policy ON public.${table};`)
      expect(followupSql).toContain(`CREATE POLICY ${table}_backend_runtime_policy ON public.${table}`)
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+TO\\s+workbuddy_runtime`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+current_user\\s*=\\s*'workbuddy_runtime'`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+pg_has_role\\(current_user,\\s*'workbuddy_runtime',\\s*'member'\\)`, 'i'))
    }

    for (const table of readableTables) {
      expect(followupSql).toContain(`GRANT SELECT ON TABLE public.${table} TO workbuddy_runtime`)
    }
  })

  it('keeps data lineage cleanup compatible with append-only event guards', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/238_v14231_data_lineage_event_cleanup_fk.sql'), 'utf8')

    expect(followupSql).toMatch(/ALTER\s+TABLE\s+public\.data_lineage_events\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+data_lineage_events_link_id_fkey/i)
    expect(followupSql).toMatch(/FOREIGN\s+KEY\s*\(link_id\)\s+REFERENCES\s+public\.data_lineage_links\(id\)\s+ON\s+DELETE\s+CASCADE/i)
    expect(followupSql).not.toMatch(/ON\s+DELETE\s+SET\s+NULL/i)
  })

  it('allows physical lineage-event cleanup while still blocking event mutation updates', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/239_v14231_data_lineage_event_cleanup_trigger.sql'), 'utf8')

    expect(followupSql).toContain('CREATE OR REPLACE FUNCTION public.check_lineage_events_append_only()')
    expect(followupSql).toMatch(/IF\s+TG_OP\s*=\s*'UPDATE'\s+THEN/i)
    expect(followupSql).toMatch(/RAISE\s+EXCEPTION\s+'data_lineage_events is append-only: % not allowed'/i)
    expect(followupSql).not.toMatch(/TG_OP\s*=\s*'DELETE'/i)
    expect(followupSql).toMatch(/BEFORE\s+UPDATE\s+ON\s+public\.data_lineage_events/i)
    expect(followupSql).not.toMatch(/BEFORE\s+UPDATE\s+OR\s+DELETE/i)
  })

  it('skips condition delete timeline writes when the parent task was already physically removed', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/240_v14231_task_condition_delete_timeline_cleanup_guard.sql'), 'utf8')

    expect(followupSql).toContain('CREATE OR REPLACE FUNCTION public.sync_task_timeline_for_condition()')
    expect(followupSql).toMatch(/IF\s+TG_OP\s*=\s*'DELETE'\s+THEN[\s\S]+NOT\s+EXISTS\s*\([\s\S]+FROM\s+public\.tasks\s+t[\s\S]+t\.id\s*=\s*OLD\.task_id[\s\S]+\)\s+THEN[\s\S]+RETURN\s+OLD/i)
    expect(followupSql).toMatch(/PERFORM\s+public\.record_task_timeline_event\s*\([\s\S]+OLD\.project_id[\s\S]+OLD\.task_id[\s\S]+'condition'/i)
  })

  it('allows backend runtime to persist only governed candidate-only algorithm asset events', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/242_v14231_algorithm_asset_candidate_events_runtime_candidate_policy.sql'), 'utf8')

    expect(followupSql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_asset_candidate_events TO workbuddy_runtime')
    expect(followupSql).toContain('DROP POLICY IF EXISTS algorithm_asset_candidate_events_backend_runtime_select')
    expect(followupSql).toContain('CREATE POLICY algorithm_asset_candidate_events_backend_runtime_select')
    expect(followupSql).toContain('DROP POLICY IF EXISTS algorithm_asset_candidate_events_backend_runtime_candidate_write')
    expect(followupSql).toContain('CREATE POLICY algorithm_asset_candidate_events_backend_runtime_candidate_write')
    expect(followupSql).toMatch(/ON\s+public\.algorithm_asset_candidate_events[\s\S]+TO\s+workbuddy_runtime/i)
    expect(followupSql).toMatch(/current_user\s*=\s*'workbuddy_runtime'/i)
    expect(followupSql).toMatch(/pg_has_role\(current_user,\s*'workbuddy_runtime',\s*'member'\)/i)
    expect(followupSql).toContain("event_status IN ('observed', 'candidate', 'replay_ready', 'review_required', 'quarantined', 'rejected', 'superseded')")
    expect(followupSql).toContain("publish_anchor IN ('candidate_only', 'manual_governance_required')")
    expect(followupSql).toContain("learning_maturity IN ('shadow_report_only', 'governed_candidate')")
    expect(followupSql).toContain("runtime_effect NOT IN ('guarded_runtime_auto_publish', 'system_curated_publish', 'runtime_published')")
  })

  it('hardens Advisor-flagged public snapshot and lineage dictionary tables with explicit RLS policies', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/246_v14231_advisor_public_rls_closeout.sql'), 'utf8')
    const advisorTables = [
      'project_key_node_snapshots',
      'task_constraint_snapshots',
      'data_lineage_entity_types',
      'data_lineage_relation_rules',
    ]

    for (const table of advisorTables) {
      expect(followupSql).toContain(`ALTER TABLE IF EXISTS public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(followupSql).toContain(`ALTER TABLE IF EXISTS public.${table} FORCE ROW LEVEL SECURITY`)
    }

    for (const table of ['project_key_node_snapshots', 'task_constraint_snapshots']) {
      expect(followupSql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO authenticated`)
      expect(followupSql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO workbuddy_runtime`)
      expect(followupSql).toContain(`CREATE POLICY ${table}_auth_read_policy`)
      expect(followupSql).toContain(`CREATE POLICY ${table}_auth_write_policy`)
      expect(followupSql).toContain(`CREATE POLICY ${table}_backend_runtime_policy`)
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+TO\\s+authenticated`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+public\\.is_active_company_member\\(p\\.company_id,\\s*NULL::TEXT\\[\\]\\)`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+ARRAY\\['company_admin',\\s*'editor'\\]::TEXT\\[\\]`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+TO\\s+workbuddy_runtime`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+pg_has_role\\(current_user,\\s*'workbuddy_runtime',\\s*'member'\\)`, 'i'))
    }

    for (const table of ['data_lineage_entity_types', 'data_lineage_relation_rules']) {
      expect(followupSql).toContain(`GRANT SELECT ON TABLE public.${table} TO authenticated`)
      expect(followupSql).toContain(`GRANT SELECT ON TABLE public.${table} TO workbuddy_runtime`)
      expect(followupSql).toContain(`CREATE POLICY ${table}_authenticated_read_policy`)
      expect(followupSql).toContain(`CREATE POLICY ${table}_backend_runtime_read_policy`)
    }

    expect(followupSql).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('adds backend runtime policies for planning baseline and monthly-plan write tables', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/254_v14231_planning_runtime_rls_policies.sql'), 'utf8')
    const tables = [
      'task_baselines',
      'task_baseline_items',
      'monthly_plans',
      'monthly_plan_items',
    ]

    for (const table of tables) {
      expect(followupSql).toContain(`ALTER TABLE IF EXISTS public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(followupSql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO workbuddy_runtime`)
      expect(followupSql).toMatch(new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+${table}_backend_runtime_policy\\s+ON\\s+public\\.${table}`, 'i'))
      expect(followupSql).toContain(`CREATE POLICY ${table}_backend_runtime_policy`)
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+TO\\s+workbuddy_runtime`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+current_user\\s*=\\s*'workbuddy_runtime'`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ON\\s+public\\.${table}[\\s\\S]+pg_has_role\\(current_user,\\s*'workbuddy_runtime',\\s*'member'\\)`, 'i'))
    }

    for (const table of ['task_baseline_items', 'monthly_plan_items']) {
      expect(followupSql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+IF\\s+EXISTS\\s+public\\.${table}[\\s\\S]+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+source_chip\\s+TEXT`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+IF\\s+EXISTS\\s+public\\.${table}[\\s\\S]+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+source_reason\\s+TEXT`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+IF\\s+EXISTS\\s+public\\.${table}[\\s\\S]+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+missing_process_in_baseline\\s+BOOLEAN`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+IF\\s+EXISTS\\s+public\\.${table}[\\s\\S]+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+manual_override_fields\\s+JSONB\\s+NOT\\s+NULL\\s+DEFAULT\\s+'\\{\\}'::jsonb`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+IF\\s+EXISTS\\s+public\\.${table}[\\s\\S]+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+generation_metadata\\s+JSONB\\s+NOT\\s+NULL\\s+DEFAULT\\s+'\\{\\}'::jsonb`, 'i'))
      expect(followupSql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+IF\\s+EXISTS\\s+public\\.${table}[\\s\\S]+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+last_generated_at\\s+TIMESTAMPTZ`, 'i'))
    }

    expect(followupSql).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('reconciles certificate work item certificate_ids schema gap for pre-milestone read models', () => {
    const followupSql = readFileSync(resolve(serverRoot, 'migrations/255_v14231_certificate_work_item_schema_gap.sql'), 'utf8')

    expect(followupSql).toMatch(/ALTER\s+TABLE\s+IF\s+EXISTS\s+public\.certificate_work_items[\s\S]+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+certificate_ids\s+UUID\[\]\s+NOT\s+NULL\s+DEFAULT\s+ARRAY\[\]::UUID\[\]/i)
    expect(followupSql).toMatch(/UPDATE\s+public\.certificate_work_items\s+cwi[\s\S]+FROM\s+\([\s\S]+array_agg\(predecessor_id\s+ORDER\s+BY\s+created_at\s+ASC,\s+predecessor_id\s+ASC\)\s+AS\s+certificate_ids[\s\S]+public\.certificate_dependencies/i)
    expect(followupSql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_certificate_work_item_atomic/i)
    expect(followupSql).toMatch(/certificate_ids,\s*created_at,\s*updated_at/i)
    expect(followupSql).toMatch(/v_certificate_ids,\s*NOW\(\),\s*NOW\(\)/i)
    expect(followupSql).toMatch(/FOREACH\s+v_certificate_id\s+IN\s+ARRAY\s+v_certificate_ids/i)
    expect(followupSql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
