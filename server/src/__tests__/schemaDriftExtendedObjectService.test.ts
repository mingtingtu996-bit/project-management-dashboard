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
