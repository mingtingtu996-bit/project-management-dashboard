import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildExpectedSchemaFromMigrationSql } from '../services/schemaDriftExpectedSchemaParser.js'

describe('schemaDriftExpectedSchemaParser', () => {
  it('limits nullability and identity parsing to the column declaration clauses', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE public.duration_learning_runtime_consumptions (
      sequence_id BIGINT GENERATED ALWAYS AS IDENTITY,
      generation_batch_id TEXT NULL
          CHECK (generation_batch_id IS NULL OR NULLIF(btrim(generation_batch_id), '') IS NOT NULL),
      template_id TEXT NULL
          CHECK (template_id IS NULL OR NULLIF(btrim(template_id), '') IS NOT NULL)
      ,value TEXT CHECK (value IS NOT NULL) NOT NULL
      );
    `)

    const columns = expectedTables[0]?.columns
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ columnName: 'sequence_id', dataType: 'bigint' }),
      expect.objectContaining({ columnName: 'sequence_id', nullable: false }),
      expect.objectContaining({ columnName: 'generation_batch_id', nullable: true }),
      expect.objectContaining({ columnName: 'template_id', nullable: true }),
      expect.objectContaining({ columnName: 'value', nullable: false }),
    ]))
  })

  it('replays column and index renames into dependent expected definitions', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE public.schedule_acceleration_recommendations (
        id UUID PRIMARY KEY,
        created_by UUID REFERENCES public.users(id),
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX idx_schedule_acceleration_recommendations_project_created
        ON public.schedule_acceleration_recommendations (created_at);

      ALTER TABLE public.schedule_acceleration_recommendations
        RENAME COLUMN created_by TO issued_by;
      ALTER TABLE public.schedule_acceleration_recommendations
        RENAME COLUMN created_at TO issued_at;
      ALTER INDEX IF EXISTS public.idx_schedule_acceleration_recommendations_project_created
        RENAME TO idx_schedule_acceleration_recommendations_project_issued;
    `)

    const table = expectedTables[0]
    expect(table?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        constraintName: 'schedule_acceleration_recommendations_created_by_fkey',
        definition: 'FOREIGN KEY (issued_by) REFERENCES users(id)',
      }),
    ]))
    expect(table?.indexes).toEqual([
      expect.objectContaining({
        indexName: 'idx_schedule_acceleration_recommendations_project_issued',
        definition: expect.stringContaining('(issued_at)'),
      }),
    ])
  })

  it('renames only local dependency columns and preserves later same-name columns', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE public.parent (id UUID PRIMARY KEY);
      CREATE TABLE public.child (
        id UUID,
        parent_id UUID REFERENCES public.parent(id)
      );
      CREATE INDEX child_id_before_rename ON public.child (id);

      ALTER TABLE public.child RENAME COLUMN id TO child_id;
      ALTER TABLE public.child ADD COLUMN id UUID;
      CREATE INDEX child_id_after_rename ON public.child (id);
    `)

    const child = expectedTables.find((table) => table.tableName === 'child')
    expect(child?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        definition: 'FOREIGN KEY (parent_id) REFERENCES parent(id)',
      }),
    ]))
    expect(child?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        indexName: 'child_id_before_rename',
        definition: expect.stringContaining('(child_id)'),
      }),
      expect.objectContaining({
        indexName: 'child_id_after_rename',
        definition: expect.stringContaining('(id)'),
      }),
    ]))
  })

  it('removes a dynamically discovered foreign key before applying its replacement', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE public.schedule_acceleration_recommendations (
        id UUID PRIMARY KEY,
        created_by UUID CONSTRAINT schedule_acceleration_recommendations_created_by_fkey
          REFERENCES public.users(id)
      );
      ALTER TABLE public.schedule_acceleration_recommendations
        RENAME COLUMN created_by TO issued_by;

      DO $$
      DECLARE
        constraint_name TEXT;
      BEGIN
        SELECT c.conname INTO constraint_name
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = 'public.schedule_acceleration_recommendations'::regclass
           AND c.contype = 'f'
           AND a.attname = 'issued_by'
         LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE public.schedule_acceleration_recommendations DROP CONSTRAINT %I',
            constraint_name
          );
        END IF;
      END $$;

      ALTER TABLE public.schedule_acceleration_recommendations
        ADD CONSTRAINT schedule_acceleration_recommendations_issued_by_fk
          FOREIGN KEY (issued_by) REFERENCES public.users(id);
    `)

    expect(expectedTables[0]?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ constraintName: 'schedule_acceleration_recommendations_issued_by_fk' }),
    ]))
    expect(expectedTables[0]?.constraints).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ constraintName: 'schedule_acceleration_recommendations_created_by_fkey' }),
    ]))
  })

  it('maps BIGSERIAL columns to PostgreSQL sequence defaults', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.company_commercial_audit (
        id BIGSERIAL PRIMARY KEY,
        company_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'company_commercial_audit',
        columns: expect.arrayContaining([
          expect.objectContaining({
            columnName: 'id',
            dataType: 'bigint',
            nullable: false,
            defaultExpression: "nextval('company_commercial_audit_id_seq'::regclass)",
          }),
        ]),
      }),
    ])
  })

  it('does not let later CREATE TABLE IF NOT EXISTS overwrite an existing table definition', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.company_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        role TEXT NOT NULL DEFAULT 'regular'
      );

      CREATE TABLE IF NOT EXISTS public.company_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        permission_level TEXT NOT NULL DEFAULT 'regular',
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'company_members',
        columns: expect.arrayContaining([
          expect.objectContaining({ columnName: 'role', defaultExpression: "'regular'" }),
        ]),
      }),
    ])
    expect(expectedTables[0]?.columns.map((column) => column.columnName)).not.toEqual(expect.arrayContaining([
      'permission_level',
      'joined_at',
    ]))
  })

  it('does not let ADD COLUMN IF NOT EXISTS overwrite an existing column definition', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        title TEXT NOT NULL
      );

      ALTER TABLE IF EXISTS public.alerts
        ADD COLUMN IF NOT EXISTS project_id UUID,
        ADD COLUMN IF NOT EXISTS title TEXT,
        ADD COLUMN IF NOT EXISTS description TEXT;
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'alerts',
        columns: expect.arrayContaining([
          expect.objectContaining({ columnName: 'project_id', nullable: false }),
          expect.objectContaining({ columnName: 'title', nullable: false }),
          expect.objectContaining({ columnName: 'description', nullable: true }),
        ]),
      }),
    ])
  })

  it('applies ALTER COLUMN TYPE changes from forward reconciliation migrations', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.task_preceding_relations (
        id VARCHAR(36) PRIMARY KEY,
        condition_id VARCHAR(36) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE public.task_preceding_relations
        ALTER COLUMN id TYPE UUID USING id::uuid,
        ALTER COLUMN condition_id TYPE UUID USING condition_id::uuid,
        ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz,
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN created_at SET DEFAULT NOW();
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'task_preceding_relations',
        columns: expect.arrayContaining([
          expect.objectContaining({ columnName: 'id', dataType: 'uuid' }),
          expect.objectContaining({ columnName: 'condition_id', dataType: 'uuid' }),
          expect.objectContaining({
            columnName: 'created_at',
            dataType: 'timestamp with time zone',
            nullable: false,
            defaultExpression: 'NOW()',
          }),
        ]),
      }),
    ])
  })

  it('does not split quoted JSON defaults on commas', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.project_data_quality_settings (
        project_id UUID PRIMARY KEY,
        weights_json JSONB NOT NULL DEFAULT '{"timeliness":0.3,"anomaly":0.25,"consistency":0.2,"jumpiness":0.1,"coverage":0.15}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'project_data_quality_settings',
        columns: expect.arrayContaining([
          expect.objectContaining({
            columnName: 'weights_json',
            defaultExpression: '\'{"timeliness":0.3,"anomaly":0.25,"consistency":0.2,"jumpiness":0.1,"coverage":0.15}\'::jsonb',
          }),
        ]),
      }),
    ])
  })

  it('extracts guarded static DDL statements inside DO blocks', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.project_health_history (
        id UUID PRIMARY KEY,
        health_status VARCHAR(20) NOT NULL
      );

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_health_history_health_status_check') THEN
        ALTER TABLE public.project_health_history
          ADD CONSTRAINT project_health_history_health_status_check
          CHECK (health_status IN ('健康', '亚健康', '预警', '危险'));
        END IF;
      END $$;
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'project_health_history',
        constraints: expect.arrayContaining([
          expect.objectContaining({ constraintName: 'project_health_history_health_status_check' }),
        ]),
      }),
    ])
  })

  it('ignores unguarded static DDL statements inside DO blocks', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.project_health_history (
        id UUID PRIMARY KEY,
        health_status VARCHAR(20) NOT NULL
      );

      DO $$
      BEGIN
        ALTER TABLE public.project_health_history
          ADD CONSTRAINT project_health_history_health_status_check
          CHECK (health_status IN ('健康', '亚健康', '预警', '危险'));
      END $$;
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'project_health_history',
        constraints: expect.not.arrayContaining([
          expect.objectContaining({ constraintName: 'project_health_history_health_status_check' }),
        ]),
      }),
    ])
  })

  it('splits multi-column ALTER TABLE ADD COLUMN statements into separate expected columns', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.acceptance_plans (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL
      );

      ALTER TABLE public.acceptance_plans
        ADD COLUMN IF NOT EXISTS building_id text,
        ADD COLUMN IF NOT EXISTS scope_level text,
        ADD COLUMN IF NOT EXISTS participant_unit_id uuid REFERENCES public.participant_units(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS depends_on jsonb DEFAULT '[]'::jsonb;
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'acceptance_plans',
        columns: expect.arrayContaining([
          expect.objectContaining({ columnName: 'building_id', dataType: 'text' }),
          expect.objectContaining({ columnName: 'scope_level', dataType: 'text' }),
          expect.objectContaining({ columnName: 'participant_unit_id', dataType: 'uuid' }),
          expect.objectContaining({
            columnName: 'depends_on',
            dataType: 'jsonb',
            defaultExpression: "'[]'::jsonb",
          }),
        ]),
      }),
    ])
  })

  it('extracts table and alter constraints plus regular, unique and partial indexes from canonical migrations', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.projects (
        id UUID PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS public.tasks (
        id UUID,
        project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
        task_code TEXT NOT NULL,
        status TEXT NOT NULL,
        deleted_at TIMESTAMPTZ,
        CONSTRAINT tasks_pkey PRIMARY KEY (id),
        CONSTRAINT tasks_project_code_unique UNIQUE (project_id, task_code),
        CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'completed'))
      );

      ALTER TABLE public.tasks
        ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

      CREATE INDEX IF NOT EXISTS idx_tasks_project_open
        ON public.tasks USING btree (project_id)
        WHERE deleted_at IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_code_unique
        ON public.tasks (task_code);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_project_code_compact
        ON public.tasks(project_id, task_code)
        WHERE task_code IS NOT NULL;
    `)

    expect(expectedTables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tableName: 'tasks',
        constraints: expect.arrayContaining([
          expect.objectContaining({ constraintName: 'tasks_pkey', constraintType: 'primary_key', definition: 'PRIMARY KEY (id)' }),
          expect.objectContaining({ constraintName: 'tasks_project_code_unique', constraintType: 'unique_constraint', definition: 'UNIQUE (project_id, task_code)' }),
          expect.objectContaining({ constraintName: 'tasks_status_check', constraintType: 'check_constraint', definition: "CHECK (status IN ('pending', 'completed'))" }),
          expect.objectContaining({ constraintName: 'tasks_project_id_fkey', constraintType: 'foreign_key', definition: 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE' }),
        ]),
        indexes: expect.arrayContaining([
          expect.objectContaining({
            indexName: 'idx_tasks_project_open',
            definition: 'CREATE INDEX idx_tasks_project_open ON public.tasks USING btree (project_id) WHERE deleted_at IS NULL',
          }),
          expect.objectContaining({
            indexName: 'idx_tasks_task_code_unique',
            definition: 'CREATE UNIQUE INDEX idx_tasks_task_code_unique ON public.tasks (task_code)',
          }),
          expect.objectContaining({
            indexName: 'idx_tasks_project_code_compact',
            definition: 'CREATE UNIQUE INDEX idx_tasks_project_code_compact ON public.tasks (project_id, task_code) WHERE task_code IS NOT NULL',
          }),
        ]),
      }),
    ]))
  })

  it('applies DROP INDEX and later CREATE INDEX statements in migration order', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.operation_logs (
        id INTEGER PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at
        ON public.operation_logs (created_at DESC);

      DROP INDEX IF EXISTS public.idx_operation_logs_created_at;

      CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at
        ON public.operation_logs USING btree (created_at);
    `)

    expect(expectedTables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tableName: 'operation_logs',
        indexes: [
          expect.objectContaining({
            indexName: 'idx_operation_logs_created_at',
            definition: 'CREATE INDEX idx_operation_logs_created_at ON public.operation_logs USING btree (created_at)',
          }),
        ],
      }),
    ]))
  })

  it('removes constraints and indexes that depend on a column dropped by a later migration', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE public.acceptance_plans (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        task_id UUID,
        CONSTRAINT acceptance_plans_task_id_fkey
          FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_acceptance_plans_project_task_date
        ON public.acceptance_plans(project_id, task_id);
      CREATE INDEX idx_acceptance_plans_project
        ON public.acceptance_plans(project_id);

      ALTER TABLE public.acceptance_plans
        DROP COLUMN IF EXISTS task_id;
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'acceptance_plans',
        columns: expect.not.arrayContaining([
          expect.objectContaining({ columnName: 'task_id' }),
        ]),
        constraints: expect.not.arrayContaining([
          expect.objectContaining({ constraintName: 'acceptance_plans_task_id_fkey' }),
        ]),
        indexes: [
          expect.objectContaining({ indexName: 'idx_acceptance_plans_project' }),
        ],
      }),
    ])
  })

  it('keeps full ON DELETE SET NULL clauses when parsing column foreign keys', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.acceptance_plans (
        id UUID PRIMARY KEY,
        responsible_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL
      );
    `)

    expect(expectedTables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tableName: 'acceptance_plans',
        constraints: expect.arrayContaining([
          expect.objectContaining({
            constraintName: 'acceptance_plans_responsible_user_id_fkey',
            definition: 'FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL',
          }),
        ]),
      }),
    ]))
  })

  it('removes expected tables when later migrations drop legacy tables', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.scope_dimensions (
        id UUID PRIMARY KEY,
        label TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.projects (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL
      );

      DROP TABLE IF EXISTS public.scope_dimensions CASCADE;
    `)

    expect(expectedTables.map((table) => table.tableName)).toEqual(['projects'])
  })

  it('keeps materialized views outside first-version table drift coverage', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.projects (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_project_dashboard AS
      SELECT id AS project_id, name AS project_name
      FROM public.projects;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project_dashboard_project_id
        ON public.mv_project_dashboard(project_id);
    `)

    expect(expectedTables.map((table) => table.tableName)).toEqual(['projects'])
  })

  it('applies DROP POLICY statements in migration order before later policy replacements', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.tasks (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        created_by UUID
      );

      ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "tasks_select_own" ON public.tasks
        FOR SELECT USING (created_by = auth.uid());

      DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;

      CREATE POLICY "tasks_select_policy" ON public.tasks
        FOR SELECT USING (project_id IS NOT NULL);
    `)

    const tasks = expectedTables.find((table) => table.tableName === 'tasks')

    expect(tasks?.rls?.policies.map((policy) => policy.policyName)).toEqual(['tasks_select_policy'])
    expect(tasks?.rls?.policies[0]).toEqual(expect.objectContaining({
      command: 'SELECT',
      usingExpression: 'project_id IS NOT NULL',
    }))
  })

  it('applies multiline DROP POLICY statements before later policy replacements', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.data_lineage_entity_types (
        code TEXT PRIMARY KEY
      );

      ALTER TABLE public.data_lineage_entity_types ENABLE ROW LEVEL SECURITY;

      CREATE POLICY data_lineage_entity_types_authenticated_read_policy
        ON public.data_lineage_entity_types
        FOR SELECT
        TO authenticated
        USING (true);

      DROP POLICY IF EXISTS data_lineage_entity_types_authenticated_read_policy
        ON public.data_lineage_entity_types;
      CREATE POLICY data_lineage_entity_types_authenticated_read_policy
        ON public.data_lineage_entity_types
        FOR SELECT
        TO authenticated
        USING (auth.uid() IS NOT NULL);
    `)

    const table = expectedTables.find((item) => item.tableName === 'data_lineage_entity_types')

    expect(table?.rls?.policies).toEqual([
      expect.objectContaining({
        policyName: 'data_lineage_entity_types_authenticated_read_policy',
        command: 'SELECT',
        usingExpression: 'auth.uid() IS NOT NULL',
      }),
    ])
  })

  it('extracts controlled dollar-quoted EXECUTE CREATE POLICY blocks used by Advisor RLS closeout migrations', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.data_quality_rule_registry (
        id UUID PRIMARY KEY,
        company_id UUID
      );

      ALTER TABLE IF EXISTS public.data_quality_rule_registry ENABLE ROW LEVEL SECURITY;
      ALTER TABLE IF EXISTS public.data_quality_rule_registry FORCE ROW LEVEL SECURITY;

      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          EXECUTE $policy$
            CREATE POLICY data_quality_rule_registry_authenticated_read_policy
              ON public.data_quality_rule_registry
              FOR SELECT
              TO authenticated
              USING (auth.uid() IS NOT NULL)
          $policy$;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
          EXECUTE $policy$
            CREATE POLICY data_quality_rule_registry_backend_runtime_read_policy
              ON public.data_quality_rule_registry
              FOR SELECT
              TO workbuddy_runtime
              USING (
                current_user = 'workbuddy_runtime'
                OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
              )
          $policy$;
        END IF;
      END $$;
    `)

    const table = expectedTables.find((item) => item.tableName === 'data_quality_rule_registry')

    expect(table?.rls).toEqual(expect.objectContaining({
      enabled: true,
      forced: true,
    }))
    expect(table?.rls?.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyName: 'data_quality_rule_registry_authenticated_read_policy',
        command: 'SELECT',
        usingExpression: 'auth.uid() IS NOT NULL',
      }),
      expect.objectContaining({
        policyName: 'data_quality_rule_registry_backend_runtime_read_policy',
        command: 'SELECT',
        usingExpression: "current_user = 'workbuddy_runtime'\n                OR pg_has_role(current_user, 'workbuddy_runtime', 'member')",
      }),
    ]))
  })

  it('keeps controlled dollar-quoted policy statements in migration order', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.data_lineage_entity_types (
        code TEXT PRIMARY KEY
      );

      ALTER TABLE public.data_lineage_entity_types ENABLE ROW LEVEL SECURITY;

      DO $$
      BEGIN
        EXECUTE $policy$
          CREATE POLICY data_lineage_entity_types_authenticated_read_policy
            ON public.data_lineage_entity_types
            FOR SELECT
            TO authenticated
            USING (true)
        $policy$;
      END $$;

      DROP POLICY IF EXISTS data_lineage_entity_types_authenticated_read_policy
        ON public.data_lineage_entity_types;
      CREATE POLICY data_lineage_entity_types_authenticated_read_policy
        ON public.data_lineage_entity_types
        FOR SELECT
        TO authenticated
        USING (auth.uid() IS NOT NULL);
    `)

    const table = expectedTables.find((item) => item.tableName === 'data_lineage_entity_types')

    expect(table?.rls?.policies).toEqual([
      expect.objectContaining({
        policyName: 'data_lineage_entity_types_authenticated_read_policy',
        usingExpression: 'auth.uid() IS NOT NULL',
      }),
    ])
  })

  it('does not let bcrypt strings in earlier real migrations corrupt later controlled policies', () => {
    const migration050 = readFixtureMigration('050_add_login_fields.sql')
    const migration252 = readFixtureMigration('252_v14231_advisor_public_rls_remaining_closeout.sql')
    const expectedTables = buildExpectedSchemaFromMigrationSql(`${migration050}\n\n${migration252}`)

    const table = expectedTables.find((item) => item.tableName === 'data_quality_rule_registry')

    expect(table?.rls?.policies).toEqual([
      expect.objectContaining({ policyName: 'data_quality_rule_registry_authenticated_read_policy' }),
      expect.objectContaining({ policyName: 'data_quality_rule_registry_backend_runtime_read_policy' }),
    ])
    expect(table?.rls?.policies[0]).toEqual(expect.objectContaining({
      command: 'SELECT',
      usingExpression: 'auth.uid() IS NOT NULL',
    }))
  })

  it('does not let earlier dollar-quoted migrations corrupt later Advisor RLS policy predicates', () => {
    const migration216 = readFixtureMigration('216_v14231_lockdown_security_definer_rpcs.sql')
    const migration252 = readFixtureMigration('252_v14231_advisor_public_rls_remaining_closeout.sql')
    const expectedTables = buildExpectedSchemaFromMigrationSql(`${migration216}\n\n${migration252}`)

    const ruleRegistry = expectedTables.find((item) => item.tableName === 'data_quality_rule_registry')
    const durationSamples = expectedTables.find((item) => item.tableName === 'duration_experience_samples')

    expect(ruleRegistry?.rls?.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyName: 'data_quality_rule_registry_authenticated_read_policy',
        command: 'SELECT',
        usingExpression: 'auth.uid() IS NOT NULL',
      }),
    ]))
    expect(durationSamples?.rls?.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyName: 'duration_experience_samples_auth_read_policy',
        command: 'SELECT',
        usingExpression: expect.stringContaining('COALESCE(duration_experience_samples.learning_scope'),
      }),
      expect.objectContaining({
        policyName: 'duration_experience_samples_auth_write_policy',
        command: 'ALL',
        withCheckExpression: expect.stringContaining("COALESCE(duration_experience_samples.learning_scope, 'project') = 'project'"),
      }),
    ]))
  })

  it('applies the Advisor private membership-function policy rewrite to expected RLS policies', () => {
    const migration278 = readFixtureMigration('278_v14231_post277_advisor_security_rpc_acl_closeout.sql')
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.projects (
        id UUID PRIMARY KEY,
        company_id UUID NOT NULL
      );

      ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

      CREATE POLICY projects_read_policy ON public.projects
        FOR SELECT
        USING (
          public.is_active_company_member(company_id, NULL::TEXT[])
          OR public.is_project_member(id, auth.uid())
        );

      ${migration278}
    `)

    const projects = expectedTables.find((item) => item.tableName === 'projects')
    expect(projects?.rls?.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyName: 'projects_read_policy',
        usingExpression: expect.stringContaining('workbuddy_private.is_active_company_member'),
      }),
      expect.objectContaining({
        policyName: 'projects_read_policy',
        usingExpression: expect.stringContaining('workbuddy_private.is_project_member'),
      }),
    ]))
  })

  it('extracts controlled ALTER TABLE constraint DDL from guarded DO blocks', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.tasks (
        id UUID PRIMARY KEY,
        progress_method TEXT NOT NULL DEFAULT 'percent',
        progress_weight NUMERIC NOT NULL DEFAULT 1
      );

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_method_check') THEN
          ALTER TABLE public.tasks ADD CONSTRAINT tasks_progress_method_check
            CHECK (progress_method IN ('percent','quantity','milestone','manual_weighted'));
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_weight_positive_check') THEN
          ALTER TABLE public.tasks ADD CONSTRAINT tasks_progress_weight_positive_check
            CHECK (progress_weight > 0);
        END IF;
      END $$;
    `)

    const tasks = expectedTables.find((item) => item.tableName === 'tasks')

    expect(tasks?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        constraintName: 'tasks_progress_method_check',
        constraintType: 'check_constraint',
        definition: "CHECK (progress_method IN ('percent', 'quantity', 'milestone', 'manual_weighted'))",
      }),
      expect.objectContaining({
        constraintName: 'tasks_progress_weight_positive_check',
        constraintType: 'check_constraint',
        definition: 'CHECK (progress_weight > 0)',
      }),
    ]))
  })

  it('keeps the final seven-type engineering object constraint after the legacy reconciliation migration', () => {
    const migration163 = readFixtureMigration('163_v14221_engineering_object_type_final_delete.sql')
    const migration225 = readFixtureMigration('225_v14232c_schema_drift_reconciliation.sql')
    const migration295 = readFixtureMigration('295_v14231_engineering_object_type_final_reconciliation.sql')
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.engineering_objects (
        id UUID PRIMARY KEY,
        object_type TEXT NOT NULL,
        CONSTRAINT engineering_objects_object_type_check
          CHECK (object_type IN ('phase', 'section', 'building', 'floor', 'zone', 'professional'))
      );

      ${migration163}
      ${migration225}
      ${migration295}
    `)

    const engineeringObjects = expectedTables.find((item) => item.tableName === 'engineering_objects')
    expect(engineeringObjects?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        constraintName: 'engineering_objects_object_type_check',
        definition: "CHECK (object_type IN ('phase', 'section', 'building', 'basement', 'floor', 'physical_zone', 'functional_area'))",
      }),
    ]))
  })

  it('replaces the original runtime-publication status constraint with the rollback-aware contract', () => {
    const migration198 = readFixtureMigration('198_v14223_policy_template_entity_runtime_publications.sql')
    const migration199 = readFixtureMigration('199_v14223_policy_template_entity_runtime_rollback_status.sql')
    const expectedTables = buildExpectedSchemaFromMigrationSql(`${migration198}\n${migration199}`)
    const publications = expectedTables.find((item) => item.tableName === 'policy_template_entity_runtime_publications')

    expect(publications?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        constraintName: 'policy_template_entity_runtime_publications_status_check',
        definition: "CHECK (runtime_publication_status IN ('runtime_stable_published', 'runtime_rolled_back'))",
      }),
    ]))
    expect(publications?.constraints).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        constraintName: 'policy_template_entity_runtime_publications_runtime_publication_status_check',
      }),
    ]))
  })

  it('marks a NOT VALID constraint as validated after VALIDATE CONSTRAINT', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE public.tasks (
        id UUID PRIMARY KEY
      );

      CREATE TABLE public.notifications (
        id UUID PRIMARY KEY,
        task_id UUID
      );

      ALTER TABLE public.notifications
        ADD CONSTRAINT notifications_task_id_fkey
        FOREIGN KEY (task_id)
        REFERENCES public.tasks(id) ON DELETE SET NULL
        NOT VALID;

      ALTER TABLE public.notifications
        VALIDATE CONSTRAINT notifications_task_id_fkey;
    `)

    const notifications = expectedTables.find((item) => item.tableName === 'notifications')
    expect(notifications?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        constraintName: 'notifications_task_id_fkey',
        constraintType: 'foreign_key',
        definition: 'FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL',
      }),
    ]))
  })

  it('applies controlled DROP CONSTRAINT before replacement ADD CONSTRAINT inside guarded DO blocks', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.data_lineage_links (
        id UUID PRIMARY KEY,
        mapping_status TEXT
      );

      ALTER TABLE public.data_lineage_links
        ADD CONSTRAINT data_lineage_links_mapping_check
        CHECK (mapping_status IN ('active', 'superseded'));

      DO $$
      BEGIN
        ALTER TABLE public.data_lineage_links DROP CONSTRAINT IF EXISTS data_lineage_links_mapping_check;
        ALTER TABLE public.data_lineage_links ADD CONSTRAINT data_lineage_links_mapping_check
          CHECK (mapping_status IN ('active', 'superseded', 'unresolved', 'conflict', 'ignored'));
      END $$;
    `)

    const table = expectedTables.find((item) => item.tableName === 'data_lineage_links')

    expect(table?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        constraintName: 'data_lineage_links_mapping_check',
        definition: "CHECK (mapping_status IN ('active', 'superseded', 'unresolved', 'conflict', 'ignored'))",
      }),
    ]))
  })

  it('applies replacement ADD CONSTRAINT guarded by dynamic pg_constraint lookup and drop inside DO blocks', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.task_baselines (
        id UUID PRIMARY KEY,
        status TEXT NOT NULL
      );

      ALTER TABLE public.task_baselines
        ADD CONSTRAINT task_baselines_status_check
        CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign'));

      DO $$
      DECLARE
        status_constraint_name TEXT;
      BEGIN
        SELECT con.conname
        INTO status_constraint_name
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'task_baselines'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%status%'
          AND pg_get_constraintdef(con.oid) ILIKE '%pending_realign%'
        LIMIT 1;

        IF status_constraint_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE public.task_baselines DROP CONSTRAINT %I',
            status_constraint_name
          );
        END IF;

        ALTER TABLE public.task_baselines
          ADD CONSTRAINT task_baselines_status_check
          CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign', 'archived'));
      END $$;
    `)

    const table = expectedTables.find((item) => item.tableName === 'task_baselines')

    expect(table?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        constraintName: 'task_baselines_status_check',
        definition: "CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign', 'archived'))",
      }),
    ]))
  })

  it('applies dynamically discovered check constraint replacement inside guarded DO blocks', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.task_baselines (
        id UUID PRIMARY KEY,
        status TEXT NOT NULL,
        CONSTRAINT task_baselines_status_check
          CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign'))
      );

      DO $$
      DECLARE
        status_constraint_name TEXT;
      BEGIN
        SELECT con.conname
        INTO status_constraint_name
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'task_baselines'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%status%'
          AND pg_get_constraintdef(con.oid) ILIKE '%pending_realign%'
        LIMIT 1;

        IF status_constraint_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE public.task_baselines DROP CONSTRAINT %I',
            status_constraint_name
          );
        END IF;

        ALTER TABLE public.task_baselines
          ADD CONSTRAINT task_baselines_status_check
          CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign', 'archived'));
      END $$;
    `)

    const table = expectedTables.find((item) => item.tableName === 'task_baselines')

    expect(table?.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        constraintName: 'task_baselines_status_check',
        definition: "CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign', 'archived'))",
      }),
    ]))
  })

  it('applies guarded column rename and drop statements inside DO blocks', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.project_daily_snapshot (
        id UUID PRIMARY KEY,
        active_delay_requests INTEGER DEFAULT 0
      );

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'project_daily_snapshot'
            AND column_name = 'active_delay_requests'
        ) THEN
          ALTER TABLE public.project_daily_snapshot
            RENAME COLUMN active_delay_requests TO active_delayed_tasks;
        END IF;
      END $$;
    `)

    const snapshot = expectedTables.find((item) => item.tableName === 'project_daily_snapshot')

    expect(snapshot?.columns.map((column) => column.columnName)).toEqual([
      'active_delayed_tasks',
      'id',
    ])
    expect(snapshot?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        columnName: 'active_delayed_tasks',
        dataType: 'integer',
        defaultExpression: '0',
      }),
    ]))
  })

  it('ignores dynamic CREATE INDEX SQL inside DO blocks', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.task_preceding_relations (
        id UUID PRIMARY KEY,
        condition_id UUID NOT NULL,
        task_id UUID NOT NULL
      );

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'task_preceding_relations'
        ) THEN
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_preceding_relations_condition_id ON public.task_preceding_relations(condition_id)';
        END IF;
      END $$;
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'task_preceding_relations',
        indexes: [],
      }),
    ])
  })

  it('extracts controlled dynamic backend runtime RLS loops from Advisor security closeout migrations', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.acceptance_catalog (
        id UUID PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS public.weekly_digests (
        id UUID PRIMARY KEY
      );

      DO $$
      DECLARE
        table_name TEXT;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY[
          'acceptance_catalog',
          'weekly_digests'
        ] LOOP
          IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);

            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
              EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO workbuddy_runtime', table_name);
              EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_backend_runtime_policy', table_name);
              EXECUTE format($policy$
                CREATE POLICY %I
                  ON public.%I
                  FOR ALL
                  TO workbuddy_runtime
                  USING (
                    current_user = 'workbuddy_runtime'
                    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
                  )
                  WITH CHECK (
                    current_user = 'workbuddy_runtime'
                    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
                  )
              $policy$, table_name || '_backend_runtime_policy', table_name);
            END IF;
          END IF;
        END LOOP;
      END $$;
    `)

    for (const tableName of ['acceptance_catalog', 'weekly_digests']) {
      const table = expectedTables.find((item) => item.tableName === tableName)

      expect(table?.rls).toEqual(expect.objectContaining({
        enabled: true,
        forced: true,
      }))
      expect(table?.rls?.policies).toEqual([
        expect.objectContaining({
          policyName: `${tableName}_backend_runtime_policy`,
          command: 'ALL',
          usingExpression: "current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member')",
          withCheckExpression: "current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member')",
        }),
      ])
    }
  })

  it('extracts direct CREATE POLICY statements from guarded migration 299 DO blocks', () => {
    const migration299 = readFixtureMigration('299_v14241_business_runtime_write_rls.sql')
    const expectedTables = buildExpectedSchemaFromMigrationSql(migration299)

    for (const tableName of ['notifications', 'task_conditions']) {
      const table = expectedTables.find((item) => item.tableName === tableName)

      expect(table?.rls?.policies).toEqual([
        expect.objectContaining({
          policyName: `${tableName}_backend_runtime_policy`,
          command: 'ALL',
          usingExpression: expect.stringContaining("pg_has_role(current_user, 'workbuddy_runtime', 'member')"),
          withCheckExpression: expect.stringContaining("pg_has_role(current_user, 'workbuddy_runtime', 'member')"),
        }),
      ])
    }
  })

  it('applies guarded project health history policy replacement from Advisor security closeout migrations', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.project_health_history (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL
      );

      ALTER TABLE public.project_health_history ENABLE ROW LEVEL SECURITY;

      CREATE POLICY health_history_select ON public.project_health_history
        FOR SELECT USING (
          project_id IN (
            SELECT projects.id FROM public.projects
            WHERE projects.id = project_health_history.project_id
          )
        );

      CREATE POLICY health_history_insert ON public.project_health_history
        FOR INSERT WITH CHECK (true);

      CREATE POLICY health_history_update ON public.project_health_history
        FOR UPDATE USING (true);

      DO $$
      BEGIN
        IF to_regclass('public.project_health_history') IS NOT NULL THEN
          ALTER TABLE public.project_health_history ENABLE ROW LEVEL SECURITY;
          ALTER TABLE public.project_health_history FORCE ROW LEVEL SECURITY;

          DROP POLICY IF EXISTS health_history_select ON public.project_health_history;
          DROP POLICY IF EXISTS health_history_insert ON public.project_health_history;
          DROP POLICY IF EXISTS health_history_update ON public.project_health_history;
          DROP POLICY IF EXISTS project_health_history_auth_project_member_read_policy ON public.project_health_history;
          DROP POLICY IF EXISTS project_health_history_backend_runtime_policy ON public.project_health_history;

          CREATE POLICY project_health_history_auth_project_member_read_policy
            ON public.project_health_history
            FOR SELECT
            TO authenticated
            USING (
              auth.uid() IS NOT NULL
              AND public.is_active_project_member(project_health_history.project_id, NULL::TEXT[])
            );

          CREATE POLICY project_health_history_backend_runtime_policy
            ON public.project_health_history
            FOR ALL
            TO workbuddy_runtime
            USING (
              current_user = 'workbuddy_runtime'
              OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
            )
            WITH CHECK (
              current_user = 'workbuddy_runtime'
              OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
            );
        END IF;
      END $$;
    `)

    const table = expectedTables.find((item) => item.tableName === 'project_health_history')

    expect(table?.rls).toEqual(expect.objectContaining({
      enabled: true,
      forced: true,
    }))
    expect(table?.rls?.policies.map((policy) => policy.policyName)).toEqual([
      'project_health_history_auth_project_member_read_policy',
      'project_health_history_backend_runtime_policy',
    ])
  })

  it('keeps regular SQL after dollar-quoted strings parseable', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      DO $$
      BEGIN
        RAISE NOTICE 'ALTER TABLE public.projects ADD COLUMN ghost text';
      END $$;

      CREATE TABLE IF NOT EXISTS public.projects (
        id UUID PRIMARY KEY
      );

      ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS name TEXT;
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'projects',
        columns: [
          expect.objectContaining({ columnName: 'id' }),
          expect.objectContaining({ columnName: 'name' }),
        ],
      }),
    ])
  })

  it('ignores DDL-like text inside PL/pgSQL function and DO bodies', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS public.task_preceding_relations (
        id UUID PRIMARY KEY,
        source_task_id UUID NOT NULL
      );

      CREATE OR REPLACE FUNCTION public.resolve_task_preceding_relation()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE public.task_preceding_relations
        SET resolution = '任务已完成，自动关闭',
            resolved_at = NOW()
        WHERE id = NEW.id;

        EXECUTE 'ALTER TABLE public.task_preceding_relations ADD COLUMN ghost_column text';
        EXECUTE 'CREATE INDEX idx_task_preceding_relations_ghost ON public.task_preceding_relations(resolution)';
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_dynamic') THEN
          EXECUTE 'CREATE INDEX idx_dynamic ON public.task_preceding_relations(source_task_id)';
        END IF;
      END $$;
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'task_preceding_relations',
        columns: [
          expect.objectContaining({ columnName: 'id' }),
          expect.objectContaining({ columnName: 'source_task_id' }),
        ],
        indexes: [],
      }),
    ])
  })

  it('does not let legacy MySQL table options swallow following migrations', () => {
    const expectedTables = buildExpectedSchemaFromMigrationSql(`
      CREATE TABLE IF NOT EXISTS task_preceding_relations (
        id            VARCHAR(36)  PRIMARY KEY,
        condition_id  VARCHAR(36)  NOT NULL,
        task_id       VARCHAR(36)  NOT NULL,
        created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,

        INDEX idx_condition_id (condition_id),
        INDEX idx_task_id (task_id),
        UNIQUE KEY uk_condition_task (condition_id, task_id),

        CONSTRAINT fk_pr_condition FOREIGN KEY (condition_id)
          REFERENCES task_conditions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE OR REPLACE FUNCTION auto_resolve_obstacles_on_task_complete()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE task_obstacles
        SET
          status = '已解决',
          resolution = '任务已完成，自动关闭',
          resolved_at = NOW()
        WHERE task_id = NEW.id
          AND status IN ('待处理', '处理中');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    expect(expectedTables).toEqual([
      expect.objectContaining({
        tableName: 'task_preceding_relations',
        columns: [
          expect.objectContaining({ columnName: 'condition_id' }),
          expect.objectContaining({ columnName: 'created_at' }),
          expect.objectContaining({ columnName: 'id' }),
          expect.objectContaining({ columnName: 'task_id' }),
        ],
      }),
    ])
    expect(expectedTables[0]?.columns.map((column) => column.columnName)).not.toEqual(expect.arrayContaining([
      'INDEX',
      'resolution',
      'resolved_at',
    ]))
  })
})

function readFixtureMigration(filename: string) {
  const rootRelativePath = resolve(process.cwd(), 'server', 'migrations', filename)
  const serverRelativePath = resolve(process.cwd(), 'migrations', filename)
  return readFileSync(existsSync(rootRelativePath) ? rootRelativePath : serverRelativePath, 'utf8')
}
