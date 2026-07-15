import pg from 'pg'

import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'

const { Client } = pg

type Check = {
  id: string
  status: 'pass' | 'fail'
  actual?: unknown
}

function check(id: string, passed: boolean, actual?: unknown): Check {
  return { id, status: passed ? 'pass' : 'fail', actual }
}

async function main() {
  const client = new Client(await resolveMigrationRuntimeConnectionConfig())
  await client.connect()

  try {
    const checks: Check[] = []
    const retiredTables = [
      'wbs_structure',
      'wbs_task_links',
      'task_milestones',
      'milestones',
      'warnings',
      'scope_dimensions',
      'project_scope_dimensions',
      'ai_duration_estimates',
    ]
    const retiredColumns = [
      ['project_members', 'role'],
      ['users', 'role'],
      ['users', 'device_id'],
      ['tasks', 'phase_id'],
      ['tasks', 'preceding_task_id'],
      ['tasks', 'responsible_unit'],
      ['tasks', 'assignee_unit'],
      ['task_conditions', 'responsible_unit'],
      ['acceptance_plans', 'task_id'],
      ['acceptance_plans', 'responsible_unit'],
    ] as const

    const ledger = await client.query<{ filename: string }>(
      `SELECT filename
       FROM public.schema_migrations
       WHERE filename = ANY($1::text[])
       ORDER BY filename`,
      [[
        '303_v14231_duration_learning_operation_runtime_rls.sql',
        '304_v1420_viewer_wbs_legacy_closeout.sql',
      ]],
    )
    checks.push(check('migrations_303_304_applied', ledger.rows.length === 2, ledger.rows.map((row) => row.filename)))

    const tables = await client.query<{ table_name: string, exists: boolean }>(
      `SELECT candidate.table_name,
              to_regclass('public.' || candidate.table_name) IS NOT NULL AS exists
       FROM unnest($1::text[]) AS candidate(table_name)
       ORDER BY candidate.table_name`,
      [retiredTables],
    )
    checks.push(check(
      'retired_physical_tables_absent',
      tables.rows.every((row) => !row.exists),
      tables.rows,
    ))

    const columns = await client.query<{ table_name: string, column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name) IN (
           SELECT candidate.table_name, candidate.column_name
           FROM unnest($1::text[], $2::text[]) AS candidate(table_name, column_name)
         )
       ORDER BY table_name, column_name`,
      [retiredColumns.map(([tableName]) => tableName), retiredColumns.map(([, columnName]) => columnName)],
    )
    checks.push(check('retired_columns_absent', columns.rows.length === 0, columns.rows))

    const memberRoles = await client.query<{ permission_level: string | null, count: string }>(
      `SELECT permission_level, count(*)::text AS count
       FROM public.project_members
       GROUP BY permission_level
       ORDER BY permission_level NULLS FIRST`,
    )
    checks.push(check(
      'project_member_roles_canonical',
      memberRoles.rows.every((row) => row.permission_level === 'owner' || row.permission_level === 'editor'),
      memberRoles.rows,
    ))

    const invitationRoles = await client.query<{
      source: string
      permission: string | null
      count: string
    }>(
      `SELECT 'code'::text AS source, permission_level AS permission, count(*)::text AS count
       FROM public.project_invitations
       GROUP BY permission_level
       UNION ALL
       SELECT 'direct'::text AS source, role AS permission, count(*)::text AS count
       FROM public.project_direct_invitations
       GROUP BY role
       ORDER BY source, permission`,
    )
    checks.push(check(
      'invitation_roles_canonical',
      invitationRoles.rows.every((row) => row.permission === 'editor'),
      invitationRoles.rows,
    ))

    const roleConstraints = await client.query<{ name: string, definition: string }>(
      `SELECT constraint_record.conname AS name,
              pg_get_constraintdef(constraint_record.oid, TRUE) AS definition
       FROM pg_constraint constraint_record
       WHERE constraint_record.conname = ANY($1::text[])
       ORDER BY constraint_record.conname`,
      [[
        'project_members_permission_level_check',
        'project_invitations_permission_level_check',
        'project_direct_invitations_role_check',
      ]],
    )
    checks.push(check(
      'canonical_role_constraints_present',
      roleConstraints.rows.length === 3
        && roleConstraints.rows.every((row) => !/viewer|admin/i.test(row.definition)),
      roleConstraints.rows,
    ))

    const notNullColumns = await client.query<{ table_name: string, column_name: string, is_nullable: string }>(
      `SELECT table_name, column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name) IN (
           ('project_members', 'permission_level'),
           ('project_invitations', 'permission_level'),
           ('project_direct_invitations', 'role')
         )
       ORDER BY table_name`,
    )
    checks.push(check(
      'canonical_role_columns_not_null',
      notNullColumns.rows.length === 3 && notNullColumns.rows.every((row) => row.is_nullable === 'NO'),
      notNullColumns.rows,
    ))

    const runtimePolicies = await client.query<{ tablename: string, policyname: string, roles: string[] }>(
      `SELECT tablename, policyname, roles
       FROM pg_policies
       WHERE schemaname = 'public'
         AND policyname = ANY($1::text[])
       ORDER BY policyname`,
      [[
        'duration_context_learning_checkpoints_backend_runtime',
        'duration_asset_baseline_revision_ops_backend_runtime',
      ]],
    )
    checks.push(check(
      'migration_303_runtime_policies_present',
      runtimePolicies.rows.length === 2
        && runtimePolicies.rows.every((row) => row.roles.includes('workbuddy_runtime')),
      runtimePolicies.rows,
    ))

    const runtimeAcl = await client.query<{
      table_name: string
      rls_enabled: boolean
      has_select: boolean
      has_insert: boolean
      has_update: boolean
      has_delete: boolean
    }>(
      `SELECT relation.relname AS table_name,
              relation.relrowsecurity AS rls_enabled,
              has_table_privilege('workbuddy_runtime', relation.oid, 'SELECT') AS has_select,
              has_table_privilege('workbuddy_runtime', relation.oid, 'INSERT') AS has_insert,
              has_table_privilege('workbuddy_runtime', relation.oid, 'UPDATE') AS has_update,
              has_table_privilege('workbuddy_runtime', relation.oid, 'DELETE') AS has_delete
       FROM pg_class relation
       JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname = ANY($1::text[])
       ORDER BY relation.relname`,
      [[
        'duration_context_policy_learning_checkpoints',
        'duration_asset_baseline_revision_operations',
      ]],
    )
    checks.push(check(
      'migration_303_runtime_acl_and_rls_present',
      runtimeAcl.rows.length === 2
        && runtimeAcl.rows.every((row) => row.rls_enabled
          && row.has_select
          && row.has_insert
          && row.has_update
          && row.has_delete),
      runtimeAcl.rows,
    ))

    const retiredLineage = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM public.data_lineage_entity_types
       WHERE entity_type = ANY($1::text[])`,
      [['wbs_structure', 'wbs_task_link', 'task_milestone']],
    )
    checks.push(check('retired_lineage_types_absent', retiredLineage.rows[0]?.count === '0', retiredLineage.rows[0]))

    const remappedLineage = await client.query<{ entity_type: string, table_name: string }>(
      `SELECT entity_type, table_name
       FROM public.data_lineage_entity_types
       WHERE entity_type = ANY($1::text[])
       ORDER BY entity_type`,
      [['milestone', 'warning', 'planning_governance_signal']],
    )
    const expectedLineage = new Map([
      ['milestone', 'tasks'],
      ['planning_governance_signal', 'planning_governance_states'],
      ['warning', 'notifications'],
    ])
    checks.push(check(
      'legacy_semantic_lineage_remapped',
      remappedLineage.rows.length === 3
        && remappedLineage.rows.every((row) => expectedLineage.get(row.entity_type) === row.table_name),
      remappedLineage.rows,
    ))

    const auditCounts = await client.query<{ entity_type: string, count: string }>(
      `SELECT entity_type, count(*)::text AS count
       FROM public.change_logs
       WHERE metadata ->> 'migration' = '304_v1420_viewer_wbs_legacy_closeout.sql'
       GROUP BY entity_type
       ORDER BY entity_type`,
    )
    checks.push(check(
      'migration_304_before_images_recorded',
      auditCounts.rows.some((row) => row.entity_type === 'project_member')
        && auditCounts.rows.some((row) => row.entity_type === 'project_invitation')
        && auditCounts.rows.some((row) => row.entity_type === 'project_direct_invitation'),
      auditCounts.rows,
    ))

    const retainedRelation = await client.query<{ exists: boolean, row_count: string }>(
      `SELECT to_regclass('public.task_preceding_relations') IS NOT NULL AS exists,
              CASE
                WHEN to_regclass('public.task_preceding_relations') IS NULL THEN '0'
                ELSE (SELECT count(*)::text FROM public.task_preceding_relations)
              END AS row_count`,
    )
    checks.push(check(
      'canonical_task_preceding_relations_retained',
      retainedRelation.rows[0]?.exists === true,
      retainedRelation.rows[0],
    ))

    const failedChecks = checks.filter((item) => item.status === 'fail')
    console.log(JSON.stringify({
      gate: 'v1420-legacy-closeout-live',
      status: failedChecks.length === 0 ? 'pass' : 'fail',
      checks,
      failedCheckIds: failedChecks.map((item) => item.id),
    }, null, 2))
    if (failedChecks.length > 0) process.exitCode = 1
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
