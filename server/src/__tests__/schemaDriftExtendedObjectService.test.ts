import { describe, expect, it } from 'vitest'

import {
  buildExpectedExtendedSchemaFromMigrationSql,
  evaluateExtendedSchemaDrift,
  type SchemaDriftExtendedCatalog,
} from '../services/schemaDriftExtendedObjectService.js'

const migrationSql = `
  CREATE OR REPLACE FUNCTION public.touch_tasks()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  VOLATILE
  AS $body$
  BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
  END;
  $body$;

  CREATE TRIGGER legacy_touch_tasks
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE PROCEDURE public.touch_tasks();
  DROP TRIGGER IF EXISTS legacy_touch_tasks ON public.tasks;
  CREATE TRIGGER touch_tasks
    BEFORE INSERT OR UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.touch_tasks();

  CREATE VIEW public.legacy_task_overview AS SELECT id FROM public.tasks;
  DROP VIEW IF EXISTS public.legacy_task_overview;
  CREATE OR REPLACE VIEW public.task_overview AS
    SELECT task.id, task.title FROM public.tasks AS task WHERE task.deleted_at IS NULL;

  CREATE TYPE public.task_priority AS ENUM ('low', 'high');
  ALTER TYPE public.task_priority ADD VALUE IF NOT EXISTS 'urgent' AFTER 'high';

  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

  GRANT SELECT, UPDATE ON TABLE public.tasks TO authenticated;
  REVOKE UPDATE ON TABLE public.tasks FROM authenticated;
  REVOKE ALL ON FUNCTION public.touch_tasks() FROM PUBLIC, anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO workbuddy_runtime;
`

describe('schemaDriftExtendedObjectService', () => {
  it('collects DDL after comments containing apostrophes', () => {
    const catalog = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE TABLE public.runtime_consumptions (id UUID PRIMARY KEY);
      GRANT INSERT ON TABLE public.runtime_consumptions TO workbuddy_runtime;
      -- Migration 315's direct table grant is intentionally removed.
      REVOKE INSERT ON TABLE public.runtime_consumptions FROM workbuddy_runtime;
    `)

    expect(catalog.grants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'table:public.runtime_consumptions:workbuddy_runtime:insert',
        allowed: false,
      }),
    ]))
  })

  it('removes grants for relations dropped by later migrations', () => {
    const catalog = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE TABLE public.retired_runtime (id UUID PRIMARY KEY);
      GRANT SELECT, INSERT, UPDATE ON TABLE public.retired_runtime TO workbuddy_runtime;
      DROP TABLE public.retired_runtime;
    `)

    expect(catalog.grants.filter((grant) => grant.objectName === 'public.retired_runtime')).toEqual([])
  })

  it('parses views with PostgreSQL view options', () => {
    const catalog = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE TABLE public.execution_fact_events (id UUID PRIMARY KEY);
      CREATE OR REPLACE VIEW public.current_execution_facts
      WITH (security_invoker = true)
      AS SELECT id FROM public.execution_fact_events;
    `)

    expect(catalog.views).toEqual([
      expect.objectContaining({
        key: 'public.current_execution_facts',
        definition: 'SELECT id FROM public.execution_fact_events',
      }),
    ])
  })

  it('reads volatility from function attributes and normalizes RETURNS TABLE catalog spacing', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE FUNCTION public.retirement_readback()
      RETURNS TABLE (
        publication_key TEXT,
        previous_publication_key TEXT,
        restored_publication_key TEXT
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'runtime publication is immutable until stable review';
      END;
      $$;
    `)
    const actual: SchemaDriftExtendedCatalog = {
      ...expected,
      functions: expected.functions.map((item) => ({
        ...item,
        resultType: 'table(publication_key text, previous_publication_key text, restored_publication_key text)',
        volatility: 'volatile',
      })),
    }

    expect(expected.functions[0]).toEqual(expect.objectContaining({ volatility: 'volatile' }))
    expect(evaluateExtendedSchemaDrift({ expected, actual })).toEqual({ status: 'pass', blockingDrift: [] })
  })

  it('reads function attributes that follow the body without inspecting body text', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE FUNCTION public.post_body_function()
      RETURNS trigger
      AS $$ BEGIN
        RAISE EXCEPTION 'body says IMMUTABLE but is not an attribute';
        RETURN NEW;
      END; $$
      LANGUAGE plpgsql STABLE SECURITY DEFINER;
    `)

    expect(expected.functions[0]).toEqual(expect.objectContaining({
      language: 'plpgsql',
      volatility: 'stable',
      securityDefiner: true,
    }))
  })

  it('treats view security options as blocking schema drift', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE OR REPLACE VIEW public.current_execution_facts
      WITH (security_invoker = true, security_barrier = true)
      AS SELECT 1 AS id;
    `)
    const actual = structuredClone(expected) as SchemaDriftExtendedCatalog
    actual.views = actual.views.map((item) => ({
      ...item,
      options: [],
    } as unknown as typeof item))

    expect((expected.views[0] as unknown as { options?: string[] }).options).toEqual([
      'security_barrier = true',
      'security_invoker = true',
    ])
    expect(evaluateExtendedSchemaDrift({ expected, actual })).toEqual(expect.objectContaining({
      status: 'fail',
      blockingDrift: expect.arrayContaining([
        expect.objectContaining({
          objectType: 'view',
          driftType: 'view_definition_mismatch',
        }),
      ]),
    }))
  })

  it('replays dynamically executed ALTER VIEW security options in migration order', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE VIEW public.algorithm_asset_registry_view AS SELECT 1 AS id;
      DO $$
      BEGIN
        IF to_regclass('public.algorithm_asset_registry_view') IS NOT NULL THEN
          EXECUTE 'ALTER VIEW public.algorithm_asset_registry_view SET (security_invoker = true, security_barrier = true)';
        END IF;
      END
      $$;
    `)

    expect(expected.views).toEqual([
      expect.objectContaining({
        key: 'public.algorithm_asset_registry_view',
        options: ['security_barrier = true', 'security_invoker = true'],
      }),
    ])
  })

  it('normalizes PostgreSQL no-op casts on view string literals', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE VIEW public.retirement_readback
      WITH (security_invoker = true) AS
      SELECT
        to_regclass('runtime_publications') IS NOT NULL AS publications_present,
        CASE
          WHEN retirement_status = 'retired_readback_complete' THEN 'retired_readback_complete'
          ELSE 'blocked'
        END AS preflight_signal
      FROM public.retirement_state state;
    `)
    const actual: SchemaDriftExtendedCatalog = {
      ...expected,
      views: expected.views.map((view) => ({
        ...view,
        definition: `
          SELECT
            to_regclass('runtime_publications'::text) IS NOT NULL AS publications_present,
            CASE
              WHEN retirement_status = 'retired_readback_complete'::text THEN 'retired_readback_complete'::text
              ELSE 'blocked'::text
            END AS preflight_signal
          FROM retirement_state state
        `,
      })),
    }

    expect(evaluateExtendedSchemaDrift({ expected, actual })).toEqual({ status: 'pass', blockingDrift: [] })
  })

  it('preserves meaningful column casts while replaying view option resets', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE VIEW public.typed_view
      WITH (security_invoker = true, security_barrier = true)
      AS SELECT value::integer AS value FROM public.source_values;
      ALTER VIEW public.typed_view RESET (security_barrier);
      ALTER VIEW public.typed_view SET (security_invoker = false);
    `)
    const actual: SchemaDriftExtendedCatalog = {
      ...expected,
      views: expected.views.map((view) => ({
        ...view,
        definition: 'SELECT value::text AS value FROM source_values',
      })),
    }

    expect(expected.views[0]?.options).toEqual(['security_invoker = false'])
    expect(evaluateExtendedSchemaDrift({ expected, actual })).toEqual(expect.objectContaining({
      status: 'fail',
      blockingDrift: expect.arrayContaining([
        expect.objectContaining({
          objectName: 'public.typed_view',
          driftType: 'view_definition_mismatch',
        }),
      ]),
    }))
  })

  it('normalizes catalog parentheses around trigger IS DISTINCT FROM predicates', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE FUNCTION public.enqueue_task_write()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
      CREATE TRIGGER enqueue_task_write_trigger
        AFTER UPDATE ON public.tasks
        FOR EACH ROW
        WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.progress IS DISTINCT FROM NEW.progress)
        EXECUTE FUNCTION public.enqueue_task_write();
    `)
    const actual: SchemaDriftExtendedCatalog = {
      ...expected,
      triggers: expected.triggers.map((item) => ({
        ...item,
        condition: '(old.status is distinct from new.status) or (old.progress is distinct from new.progress)',
      })),
    }

    expect(evaluateExtendedSchemaDrift({ expected, actual })).toEqual({ status: 'pass', blockingDrift: [] })
  })

  it('builds ordered expected trigger, function, view, enum, extension and grant state', () => {
    const catalog = buildExpectedExtendedSchemaFromMigrationSql(migrationSql)

    expect(catalog.triggers).toEqual([
      expect.objectContaining({
        key: 'public.tasks.touch_tasks',
        triggerName: 'touch_tasks',
        tableName: 'tasks',
        functionName: 'public.touch_tasks',
        timing: 'before',
        events: ['insert', 'update'],
        orientation: 'row',
      }),
    ])
    expect(catalog.functions).toEqual([
      expect.objectContaining({
        key: 'public.touch_tasks()',
        functionName: 'touch_tasks',
        identityArguments: '',
        resultType: 'trigger',
        language: 'plpgsql',
        securityDefiner: true,
        volatility: 'volatile',
        body: expect.stringContaining('NEW.updated_at := NOW();'),
      }),
    ])
    expect(catalog.views).toEqual([
      expect.objectContaining({
        key: 'public.task_overview',
        viewName: 'task_overview',
        materialized: false,
        definition: expect.stringContaining('task.deleted_at IS NULL'),
      }),
    ])
    expect(catalog.enums).toEqual([
      expect.objectContaining({
        key: 'public.task_priority',
        labels: ['low', 'high', 'urgent'],
      }),
    ])
    expect(catalog.extensions).toEqual([
      expect.objectContaining({
        extensionName: 'pgcrypto',
        schemaName: 'extensions',
      }),
    ])
    expect(catalog.grants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'table:public.tasks:authenticated:select',
        allowed: true,
      }),
      expect.objectContaining({
        key: 'table:public.tasks:authenticated:update',
        allowed: false,
      }),
      expect.objectContaining({
        key: 'function:public.touch_tasks():public:execute',
        allowed: false,
      }),
      expect.objectContaining({
        key: 'function:public.touch_tasks():anon:execute',
        allowed: false,
      }),
      expect.objectContaining({
        key: 'default_table:public.*:workbuddy_runtime:select',
        allowed: true,
      }),
    ]))
  })

  it('blocks missing or changed managed objects and grant regressions', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(migrationSql)
    const actual: SchemaDriftExtendedCatalog = {
      triggers: [],
      functions: expected.functions.map((item) => ({ ...item, body: 'BEGIN RETURN NULL; END;' })),
      views: expected.views.map((item) => ({ ...item, definition: 'SELECT id FROM public.tasks' })),
      enums: expected.enums.map((item) => ({ ...item, labels: ['low', 'high'] })),
      extensions: expected.extensions.map((item) => ({ ...item, schemaName: 'public' })),
      grants: [
        expected.grants.find((item) => item.key === 'table:public.tasks:authenticated:update')!,
        expected.grants.find((item) => item.key === 'function:public.touch_tasks():public:execute')!,
      ].map((item) => ({ ...item, allowed: true })),
    }

    const result = evaluateExtendedSchemaDrift({ expected, actual })

    expect(result.status).toBe('fail')
    expect(result.blockingDrift).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectType: 'trigger', objectName: 'public.tasks.touch_tasks', driftType: 'missing_actual_trigger' }),
      expect.objectContaining({ objectType: 'function', objectName: 'public.touch_tasks()', driftType: 'function_definition_mismatch' }),
      expect.objectContaining({ objectType: 'view', objectName: 'public.task_overview', driftType: 'view_definition_mismatch' }),
      expect.objectContaining({ objectType: 'enum', objectName: 'public.task_priority', driftType: 'enum_labels_mismatch' }),
      expect.objectContaining({ objectType: 'extension', objectName: 'pgcrypto', driftType: 'extension_schema_mismatch' }),
      expect.objectContaining({ objectType: 'grant', objectName: 'table:public.tasks:authenticated:select', driftType: 'missing_actual_grant' }),
      expect.objectContaining({ objectType: 'grant', objectName: 'table:public.tasks:authenticated:update', driftType: 'forbidden_actual_grant' }),
      expect.objectContaining({ objectType: 'grant', objectName: 'function:public.touch_tasks():public:execute', driftType: 'forbidden_actual_grant' }),
    ]))
  })

  it('blocks unexpected managed objects that have no migration source', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql('')
    const source = buildExpectedExtendedSchemaFromMigrationSql(migrationSql)
    const actual: SchemaDriftExtendedCatalog = {
      triggers: source.triggers,
      functions: source.functions,
      views: source.views,
      enums: source.enums,
      extensions: [],
      grants: [],
    }

    const result = evaluateExtendedSchemaDrift({ expected, actual })

    expect(result.blockingDrift).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectType: 'trigger', driftType: 'unexpected_actual_trigger' }),
      expect.objectContaining({ objectType: 'function', driftType: 'unexpected_actual_function' }),
      expect.objectContaining({ objectType: 'view', driftType: 'unexpected_actual_view' }),
      expect.objectContaining({ objectType: 'enum', driftType: 'unexpected_actual_enum' }),
    ]))
  })

  it('passes equivalent catalog state while treating revoked grants as absence', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(migrationSql)
    const actual: SchemaDriftExtendedCatalog = {
      ...expected,
      grants: expected.grants.filter((item) => item.allowed),
    }

    expect(evaluateExtendedSchemaDrift({ expected, actual })).toEqual({
      status: 'pass',
      blockingDrift: [],
    })
  })

  it('normalizes PostgreSQL identity types, trigger predicates and single-source view qualifiers', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE FUNCTION public.normalize_demo(input_name VARCHAR(64))
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
      CREATE TRIGGER normalize_demo_trigger
        BEFORE UPDATE ON public.tasks
        FOR EACH ROW
        WHEN (NEW.status = 'ready')
        EXECUTE FUNCTION public.normalize_demo();
      CREATE VIEW public.normalize_demo_view AS
        SELECT id, title FROM public.tasks;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `)
    const actual: SchemaDriftExtendedCatalog = {
      triggers: expected.triggers.map((item) => ({
        ...item,
        condition: "((new.status)::text = 'ready'::text)",
      })),
      functions: expected.functions.map((item) => ({
        ...item,
        key: 'public.normalize_demo(character varying)',
        identityArguments: 'character varying',
      })),
      views: expected.views.map((item) => ({
        ...item,
        definition: 'SELECT tasks.id, tasks.title FROM public.tasks;',
      })),
      enums: [],
      extensions: expected.extensions.map((item) => ({ ...item, schemaName: 'extensions' })),
      grants: [],
    }

    expect(evaluateExtendedSchemaDrift({ expected, actual })).toEqual({
      status: 'pass',
      blockingDrift: [],
    })
  })

  it('normalizes RETURNS TABLE spacing from PostgreSQL introspection', () => {
    const expected = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE FUNCTION public.atomic_demo()
      RETURNS TABLE (candidate_row JSONB, version_id UUID)
      LANGUAGE plpgsql
      AS $$ BEGIN RETURN; END; $$;
    `)
    const actual: SchemaDriftExtendedCatalog = {
      ...expected,
      functions: expected.functions.map((item) => ({
        ...item,
        resultType: item.resultType.replace('table (', 'table('),
      })),
    }

    expect(evaluateExtendedSchemaDrift({ expected, actual })).toEqual({
      status: 'pass',
      blockingDrift: [],
    })
  })

  it('removes table-bound triggers when a later migration drops the table', () => {
    const catalog = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE TABLE public.legacy_items (id UUID PRIMARY KEY);
      CREATE FUNCTION public.touch_legacy_items()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
      CREATE TRIGGER touch_legacy_items
        BEFORE UPDATE ON public.legacy_items
        FOR EACH ROW EXECUTE FUNCTION public.touch_legacy_items();
      DROP TABLE IF EXISTS public.legacy_items CASCADE;
    `)

    expect(catalog.triggers).toEqual([])
  })

  it('extracts constant single-quoted EXECUTE trigger DDL from guarded DO blocks', () => {
    const catalog = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE FUNCTION public.enforce_job_lease_fence_from_request()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END; $$;

      DO $$
      BEGIN
        IF to_regclass('public.notifications') IS NOT NULL THEN
          EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.notifications';
          EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.notifications FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
        END IF;
      END $$;
    `)

    expect(catalog.triggers).toEqual([
      expect.objectContaining({
        key: 'public.notifications.enforce_job_lease_fence',
        triggerName: 'enforce_job_lease_fence',
        tableName: 'notifications',
        functionName: 'public.enforce_job_lease_fence_from_request',
        timing: 'before',
        events: ['delete', 'insert', 'update'],
        orientation: 'statement',
      }),
    ])
  })

  it('applies final function ACL state from FOREACH EXECUTE format loops', () => {
    const catalog = buildExpectedExtendedSchemaFromMigrationSql(`
      CREATE FUNCTION public.is_active_company_member(UUID, TEXT[])
      RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO authenticated;

      DO $$
      DECLARE
        function_identity TEXT;
        role_name TEXT;
      BEGIN
        FOREACH function_identity IN ARRAY ARRAY[
          'public.is_active_company_member(uuid, text[])'
        ] LOOP
          EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', function_identity);

          FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', function_identity, role_name);
          END LOOP;

          FOREACH role_name IN ARRAY ARRAY['service_role', 'workbuddy_runtime'] LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', function_identity, role_name);
          END LOOP;
        END LOOP;
      END $$;
    `)

    expect(catalog.grants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'function:public.is_active_company_member(uuid, text[]):public:execute',
        allowed: false,
      }),
      expect.objectContaining({
        key: 'function:public.is_active_company_member(uuid, text[]):anon:execute',
        allowed: false,
      }),
      expect.objectContaining({
        key: 'function:public.is_active_company_member(uuid, text[]):authenticated:execute',
        allowed: false,
      }),
      expect.objectContaining({
        key: 'function:public.is_active_company_member(uuid, text[]):service_role:execute',
        allowed: true,
      }),
      expect.objectContaining({
        key: 'function:public.is_active_company_member(uuid, text[]):workbuddy_runtime:execute',
        allowed: true,
      }),
    ]))
  })
})
