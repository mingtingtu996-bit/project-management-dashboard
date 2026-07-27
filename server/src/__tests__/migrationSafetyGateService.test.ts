import { describe, expect, it } from 'vitest'

import {
  buildMigrationReleaseReadiness,
  evaluateMigrationCheck,
  shouldFailMigrationCheckGate,
  shouldFailMigrationReleaseReadinessGate,
  evaluateSchemaDrift,
  type SchemaDriftExpectedColumn,
  type SchemaDriftExpectedTable,
  type SchemaDriftActualColumn,
  type SchemaDriftActualTable,
  type SchemaDriftConstraint,
} from '../services/migrationSafetyGateService.js'

const discovered = [
  { filename: '001_initial_schema.sql', version: '001', checksum: 'hash-001' },
  { filename: '002_add_tasks.sql', version: '002', checksum: 'hash-002' },
  { filename: '003_add_reports.sql', version: '003', checksum: 'hash-003' },
]

describe('migrationSafetyGateService', () => {
  it('fails migration check when pending migrations, checksum drift, orphan ledger rows, duplicate versions or unsafe baseline replay are present', () => {
    const result = evaluateMigrationCheck({
      discoveredMigrations: [
        ...discovered,
        { filename: '003_duplicate_version.sql', version: '003', checksum: 'hash-duplicate' },
      ],
      appliedMigrations: [
        { filename: '001_initial_schema.sql', version: '001', checksum: 'changed-hash' },
        { filename: '999_deleted_local_file.sql', version: '999', checksum: 'hash-999' },
      ],
      existingBaselineTables: ['projects'],
    })

    expect(result.status).toBe('fail')
    expect(result.pendingMigrations.map((item) => item.filename)).toEqual([
      '002_add_tasks.sql',
      '003_add_reports.sql',
      '003_duplicate_version.sql',
    ])
    expect(result.checksumMismatches).toEqual([
      expect.objectContaining({
        filename: '001_initial_schema.sql',
        expectedChecksum: 'hash-001',
        actualChecksum: 'changed-hash',
      }),
    ])
    expect(result.orphanLedgerRows.map((item) => item.filename)).toEqual(['999_deleted_local_file.sql'])
    expect(result.duplicateVersions).toEqual([
      expect.objectContaining({
        version: '003',
        filenames: ['003_add_reports.sql', '003_duplicate_version.sql'],
      }),
    ])
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'pending_migrations_present',
      'migration_checksum_mismatch',
      'orphan_ledger_rows_present',
      'duplicate_migration_versions_present',
    ]))
  })

  it('blocks unsafe baseline adoption when ledger is empty but business tables already exist', () => {
    const result = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: [],
      existingBaselineTables: ['projects', 'tasks'],
    })

    expect(result.status).toBe('fail')
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'unsafe_baseline_replay_risk',
      'pending_migrations_present',
    ]))
  })

  it('passes migration check only when ledger and migration directory are fully aligned', () => {
    const result = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: discovered.map((migration) => ({
        filename: migration.filename,
        version: migration.version,
        checksum: migration.checksum,
      })),
      existingBaselineTables: ['projects'],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'pass',
      pendingMigrations: [],
      checksumMismatches: [],
      orphanLedgerRows: [],
      duplicateVersions: [],
      unsafeBaselineReplayRisk: false,
    }))
  })

  it('allows explicitly adopted orphan ledger rows while keeping unregistered orphan rows blocking', () => {
    const result = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: [
        ...discovered,
        { filename: '084_retired_baseline.sql', version: '084', checksum: 'retired-hash' },
        { filename: '999_deleted_local_file.sql', version: '999', checksum: 'hash-999' },
      ],
      existingBaselineTables: ['projects'],
      adoptedBaselineFilenames: ['084_retired_baseline.sql'],
    })

    expect(result.status).toBe('fail')
    expect(result.orphanLedgerRows.map((item) => item.filename)).toEqual(['999_deleted_local_file.sql'])
    expect(result.adoptedBaselineLedgerRows.map((item) => item.filename)).toEqual(['084_retired_baseline.sql'])
    expect(result.reasonCodes).toEqual(['orphan_ledger_rows_present'])
  })

  it('treats superseded runtime helper ledger rows as adopted only when explicitly registered', () => {
    const result = evaluateMigrationCheck({
      discoveredMigrations: [
        ...discovered,
        { filename: '233_v14231_runtime_login_rls_helper_acl.sql', version: '233', checksum: 'hash-233' },
      ],
      appliedMigrations: [
        ...discovered,
        { filename: '115_runtime_login_rls_helper_acl.sql', version: '115', checksum: 'hash-115' },
        { filename: '116_grant_rls_helper_execute_to_runtime_roles.sql', version: '116', checksum: 'hash-116' },
        { filename: '233_v14231_runtime_login_rls_helper_acl.sql', version: '233', checksum: 'hash-233' },
      ],
      existingBaselineTables: ['projects'],
      adoptedBaselineFilenames: [
        '115_runtime_login_rls_helper_acl.sql',
        '116_grant_rls_helper_execute_to_runtime_roles.sql',
      ],
    })

    expect(result.status).toBe('pass')
    expect(result.orphanLedgerRows).toEqual([])
    expect(result.adoptedBaselineLedgerRows.map((item) => item.filename)).toEqual([
      '115_runtime_login_rls_helper_acl.sql',
      '116_grant_rls_helper_execute_to_runtime_roles.sql',
    ])
  })

  it('reconciles checksum mismatches only when the reviewed record matches filename, version and both hashes', () => {
    const result = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: [
        { filename: '001_initial_schema.sql', version: '001', checksum: 'live-ledger-hash' },
        { filename: '002_add_tasks.sql', version: '002', checksum: 'stale-live-ledger-hash' },
      ],
      existingBaselineTables: ['projects'],
      checksumReconciliations: [
        {
          filename: '001_initial_schema.sql',
          version: '001',
          currentFileChecksum: 'hash-001',
          appliedLedgerChecksum: 'live-ledger-hash',
          reviewedAt: '2026-06-20T00:00:00Z',
          reviewedBy: 'codex',
          evidence: 'docs/reports/v14232c_checksum_reconciliation_20260620.md#001_initial_schema.sql',
        },
        {
          filename: '002_add_tasks.sql',
          version: '002',
          currentFileChecksum: 'hash-002',
          appliedLedgerChecksum: 'old-live-ledger-hash',
          reviewedAt: '2026-06-20T00:00:00Z',
          reviewedBy: 'codex',
          evidence: 'docs/reports/v14232c_checksum_reconciliation_20260620.md#002_add_tasks.sql',
        },
      ],
    })

    expect(result.reconciledChecksumMismatches).toEqual([
      expect.objectContaining({
        filename: '001_initial_schema.sql',
        expectedChecksum: 'hash-001',
        actualChecksum: 'live-ledger-hash',
      }),
    ])
    expect(result.checksumMismatches).toEqual([
      expect.objectContaining({
        filename: '002_add_tasks.sql',
        expectedChecksum: 'hash-002',
        actualChecksum: 'stale-live-ledger-hash',
      }),
    ])
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'pending_migrations_present',
      'migration_checksum_mismatch',
    ]))
  })

  it('allows pending migrations only for the pre-apply safety gate while still blocking structural migration risks', () => {
    const pendingOnly = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: [discovered[0]],
      existingBaselineTables: ['projects'],
    })
    const checksumRisk = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: [
        { filename: '001_initial_schema.sql', version: '001', checksum: 'changed-hash' },
      ],
      existingBaselineTables: ['projects'],
    })

    expect(shouldFailMigrationCheckGate(pendingOnly, { allowPendingMigrations: true })).toBe(false)
    expect(shouldFailMigrationCheckGate(pendingOnly, { allowPendingMigrations: false })).toBe(true)
    expect(shouldFailMigrationCheckGate(checksumRisk, { allowPendingMigrations: true })).toBe(true)
  })

  it('treats missing schema_migrations ledger as a read-only gate failure except for empty-database pre-apply checks', () => {
    const emptyDatabasePreApply = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: [],
      existingBaselineTables: [],
      ledgerAvailable: false,
    })
    const existingDatabaseMissingLedger = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: [],
      existingBaselineTables: ['projects'],
      ledgerAvailable: false,
    })

    expect(emptyDatabasePreApply.reasonCodes).toEqual(expect.arrayContaining([
      'pending_migrations_present',
      'schema_migrations_ledger_missing',
    ]))
    expect(shouldFailMigrationCheckGate(emptyDatabasePreApply, { allowPendingMigrations: true })).toBe(false)
    expect(shouldFailMigrationCheckGate(emptyDatabasePreApply, { allowPendingMigrations: false })).toBe(true)
    expect(shouldFailMigrationCheckGate(existingDatabaseMissingLedger, { allowPendingMigrations: true })).toBe(true)
  })

  it('summarizes whether it is safe to apply pending migrations', () => {
    const blocked = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: [
        { filename: '001_initial_schema.sql', version: '001', checksum: 'changed-hash' },
      ],
      existingBaselineTables: ['projects'],
    })
    const readyToApply = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: [discovered[0]],
      existingBaselineTables: ['projects'],
    })
    const readyForDrift = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: discovered,
      existingBaselineTables: ['projects'],
    })

    expect(buildMigrationReleaseReadiness(blocked)).toEqual(expect.objectContaining({
      status: 'blocked_before_apply',
      safeToApplyPending: false,
      nextAction: 'resolve_structural_migration_history',
      blockingReasonCodes: ['migration_checksum_mismatch'],
    }))
    expect(buildMigrationReleaseReadiness(readyToApply)).toEqual(expect.objectContaining({
      status: 'ready_to_apply_pending',
      safeToApplyPending: true,
      nextAction: 'apply_pending_migrations',
      blockingReasonCodes: [],
    }))
    expect(buildMigrationReleaseReadiness(readyForDrift)).toEqual(expect.objectContaining({
      status: 'ready_for_schema_drift_check',
      safeToApplyPending: false,
      safeToEvaluateDrift: true,
      nextAction: 'run_schema_drift_check',
    }))

    expect(shouldFailMigrationReleaseReadinessGate(buildMigrationReleaseReadiness(blocked))).toBe(true)
    expect(shouldFailMigrationReleaseReadinessGate(buildMigrationReleaseReadiness(readyToApply))).toBe(false)
    expect(shouldFailMigrationReleaseReadinessGate(buildMigrationReleaseReadiness(readyForDrift))).toBe(false)
  })

  it('reports blocking schema drift and coverage backlog separately', () => {
    const expectedTables: SchemaDriftExpectedTable[] = [
      {
        tableName: 'projects',
        columns: [
          column('id', 'uuid', { nullable: false }),
          column('company_id', 'uuid', { nullable: false }),
          column('name', 'text', { nullable: false, defaultExpression: "''::text" }),
        ],
        rls: {
          enabled: true,
          forced: false,
          policies: [
            {
              policyName: 'projects_company_isolation',
              command: 'SELECT',
              usingExpression: 'company_id = current_setting(...)::uuid',
              withCheckExpression: null,
            },
          ],
        },
      },
    ]
    const actualTables: SchemaDriftActualTable[] = [
      {
        tableName: 'projects',
        columns: [
          column('id', 'uuid', { nullable: false }),
          column('name', 'varchar', { nullable: true, defaultExpression: null }),
          column('legacy_code', 'text', { nullable: true }),
        ],
        rls: {
          enabled: false,
          forced: false,
          policies: [],
        },
      },
      {
        tableName: 'legacy_projects',
        columns: [column('id', 'uuid', { nullable: false })],
        rls: { enabled: false, forced: false, policies: [] },
      },
    ]

    const result = evaluateSchemaDrift({
      expectedTables,
      actualTables,
      coverageBacklog: ['trigger', 'function', 'view', 'enum', 'extension', 'grant'],
      ignoredLegacyObjects: ['legacy_projects'],
    })

    expect(result.status).toBe('fail')
    expect(result.blockingDrift).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectType: 'column', objectName: 'projects.company_id', driftType: 'missing_actual_column' }),
      expect.objectContaining({ objectType: 'column', objectName: 'projects.legacy_code', driftType: 'unexpected_actual_column' }),
      expect.objectContaining({ objectType: 'column', objectName: 'projects.name', driftType: 'column_nullable_mismatch' }),
      expect.objectContaining({ objectType: 'column', objectName: 'projects.name', driftType: 'column_default_mismatch' }),
      expect.objectContaining({ objectType: 'rls', objectName: 'projects', driftType: 'rls_enabled_mismatch' }),
      expect.objectContaining({ objectType: 'rls_policy', objectName: 'projects.projects_company_isolation', driftType: 'missing_actual_policy' }),
    ]))
    expect(result.coverageBacklog).toEqual(['trigger', 'function', 'view', 'enum', 'extension', 'grant'])
    expect(result.ignoredLegacyObjects).toEqual(['legacy_projects'])
  })

  it('skips child-object comparison for ignored legacy tables even when migrations also define them', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'schema_migrations',
          columns: [
            column('version', 'text', { nullable: false }),
            column('checksum', 'text', { nullable: false }),
          ],
          constraints: [
            constraint('schema_migrations_pkey', 'primary_key', 'PRIMARY KEY (version)'),
          ],
        },
      ],
      actualTables: [
        {
          tableName: 'schema_migrations',
          columns: [
            column('filename', 'text', { nullable: false }),
            column('applied_at', 'timestamp with time zone', { nullable: false, defaultExpression: 'now()' }),
          ],
          constraints: [
            constraint('schema_migrations_pkey', 'primary_key', 'PRIMARY KEY (filename)'),
          ],
        },
      ],
      ignoredLegacyObjects: ['schema_migrations'],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('blocks schema drift for primary keys, foreign keys, unique constraints, check constraints and explicit indexes', () => {
    const expectedTables = [
      {
        tableName: 'tasks',
        columns: [
          column('id', 'uuid', { nullable: false }),
          column('project_id', 'uuid', { nullable: false }),
          column('task_code', 'text', { nullable: false }),
          column('status', 'text', { nullable: false }),
          column('deleted_at', 'timestamp with time zone'),
        ],
        constraints: [
          constraint('tasks_pkey', 'primary_key', 'PRIMARY KEY (id)'),
          constraint('tasks_project_id_fkey', 'foreign_key', 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE'),
          constraint('tasks_project_code_unique', 'unique_constraint', 'UNIQUE (project_id, task_code)'),
          constraint('tasks_status_check', 'check_constraint', "CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text]))"),
        ],
        indexes: [
          index('idx_tasks_project_open', 'CREATE INDEX idx_tasks_project_open ON public.tasks USING btree (project_id) WHERE (deleted_at IS NULL)'),
          index('idx_tasks_task_code_unique', 'CREATE UNIQUE INDEX idx_tasks_task_code_unique ON public.tasks USING btree (task_code)'),
        ],
      },
    ] as any

    const actualTables = [
      {
        tableName: 'tasks',
        columns: [
          column('id', 'uuid', { nullable: false }),
          column('project_id', 'uuid', { nullable: false }),
          column('task_code', 'text', { nullable: false }),
          column('status', 'text', { nullable: false }),
          column('deleted_at', 'timestamp with time zone'),
        ],
        constraints: [
          constraint('tasks_pkey', 'primary_key', 'PRIMARY KEY (id)'),
          constraint('tasks_project_id_fkey', 'foreign_key', 'FOREIGN KEY (project_id) REFERENCES projects(id)'),
          constraint('tasks_legacy_unique', 'unique_constraint', 'UNIQUE (task_code)'),
        ],
        indexes: [
          index('idx_tasks_project_open', 'CREATE INDEX idx_tasks_project_open ON public.tasks USING btree (project_id)'),
          index('idx_tasks_legacy', 'CREATE INDEX idx_tasks_legacy ON public.tasks USING btree (status)'),
        ],
      },
    ] as any

    const result = evaluateSchemaDrift({ expectedTables, actualTables })

    expect(result.status).toBe('fail')
    expect(result.blockingDrift).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectType: 'constraint', objectName: 'tasks.tasks_project_id_fkey', driftType: 'constraint_definition_mismatch' }),
      expect.objectContaining({ objectType: 'constraint', objectName: 'tasks.tasks_project_code_unique', driftType: 'missing_actual_constraint' }),
      expect.objectContaining({ objectType: 'constraint', objectName: 'tasks.tasks_status_check', driftType: 'missing_actual_constraint' }),
      expect.objectContaining({ objectType: 'constraint', objectName: 'tasks.tasks_legacy_unique', driftType: 'unexpected_actual_constraint' }),
      expect.objectContaining({ objectType: 'index', objectName: 'tasks.idx_tasks_project_open', driftType: 'index_definition_mismatch' }),
      expect.objectContaining({ objectType: 'index', objectName: 'tasks.idx_tasks_task_code_unique', driftType: 'missing_actual_index' }),
      expect.objectContaining({ objectType: 'index', objectName: 'tasks.idx_tasks_legacy', driftType: 'unexpected_actual_index' }),
    ]))
  })

  it('normalizes PostgreSQL default expression casts before comparing schema drift', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'acceptance_dependencies',
          columns: [
            column('dependency_kind', 'text', { defaultExpression: "'hard'" }),
            column('enabled', 'boolean', { defaultExpression: 'TRUE' }),
          ],
        },
      ],
      actualTables: [
        {
          tableName: 'acceptance_dependencies',
          columns: [
            column('dependency_kind', 'text', { defaultExpression: "'hard'::text" }),
            column('enabled', 'boolean', { defaultExpression: 'true' }),
          ],
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('normalizes semantically equivalent PostgreSQL default expressions', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'project_data_quality_settings',
          columns: [
            column('weights_json', 'jsonb', {
              defaultExpression: '\'{"timeliness":0.3,"anomaly":0.25,"consistency":0.2,"jumpiness":0.1,"coverage":0.15}\'::jsonb',
            }),
            column('created_at', 'timestamp with time zone', {
              defaultExpression: 'CURRENT_TIMESTAMP',
            }),
          ],
        },
      ],
      actualTables: [
        {
          tableName: 'project_data_quality_settings',
          columns: [
            column('weights_json', 'jsonb', {
              defaultExpression: '\'{"anomaly": 0.25, "coverage": 0.15, "jumpiness": 0.1, "timeliness": 0.3, "consistency": 0.2}\'::jsonb',
            }),
            column('created_at', 'timestamp with time zone', {
              defaultExpression: 'now()',
            }),
          ],
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('normalizes JSON literal defaults with and without PostgreSQL jsonb casts', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'acceptance_nodes',
          columns: [
            column('documents', 'jsonb', { defaultExpression: "'[]'" }),
            column('result', 'jsonb', { defaultExpression: "'{}'" }),
          ],
        },
      ],
      actualTables: [
        {
          tableName: 'acceptance_nodes',
          columns: [
            column('documents', 'jsonb', { defaultExpression: "'[]'::jsonb" }),
            column('result', 'jsonb', { defaultExpression: "'{}'::jsonb" }),
          ],
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('does not treat text-like scalar defaults as JSON literals', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'construction_drawings',
          columns: [
            column('version', 'text', { defaultExpression: "'1.0'" }),
          ],
        },
      ],
      actualTables: [
        {
          tableName: 'construction_drawings',
          columns: [
            column('version', 'text', { defaultExpression: "'1.0'::text" }),
          ],
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('normalizes PostgreSQL constraint, index and policy display syntax without hiding real drift', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'acceptance_records',
          columns: [
            column('id', 'uuid', { nullable: false }),
            column('status', 'text', { nullable: false }),
            column('attachments', 'jsonb'),
          ],
          constraints: [
            constraint('acceptance_records_status_check', 'check_constraint', "CHECK (status IN ('draft', 'passed'))"),
            constraint('acceptance_records_created_by_fkey', 'foreign_key', 'FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL'),
            constraint('alerts_level_check', 'check_constraint', "CHECK (level IN ('info', 'warning', 'critical'))"),
            constraint('wbs_template_nodes_category_type_check', 'check_constraint', "CHECK (category_type IS NULL OR category_type IN ('division', 'process'))"),
            constraint('algorithm_catalog_scope_consistency', 'check_constraint', 'CHECK (project_id IS NULL OR company_id IS NOT NULL)'),
            constraint('algorithm_cold_start_baselines_anonymized_shared_scope', 'check_constraint', "CHECK (company_id IS NULL AND project_id IS NULL AND anonymization_policy = 'anonymized_multi_company_aggregation')"),
            constraint('algorithm_asset_candidate_events_no_deleted_range_tree_fields', 'check_constraint', "CHECK (LOWER(candidate_payload::text) NOT LIKE '%zone_object_id%' AND LOWER(candidate_payload::text) NOT LIKE '%legacy_object_type%')"),
            constraint('algorithm_cold_start_baselines_max_single_company_share_check', 'check_constraint', 'CHECK (max_single_company_share > 0 AND max_single_company_share <= 0.5)'),
            constraint('project_climate_profiles_soft_soil_level_check', 'check_constraint', 'CHECK (soft_soil_level BETWEEN 0 AND 3)'),
            constraint('duration_experience_samples_learning_scope_check', 'check_constraint', "CHECK (learning_scope IN ('global', 'industry', 'company', 'project')) NOT VALID"),
            constraint('acceptance_template_policy_auto_publish_runs_applied_auto_published_seed_count_check', 'check_constraint', 'CHECK (applied_auto_published_seed_count >= 0)'),
          ],
          indexes: [
            index('idx_acceptance_records_attachments_gin', 'CREATE INDEX idx_acceptance_records_attachments_gin ON public.acceptance_records USING GIN(attachments)'),
            index('idx_acceptance_records_project_id', 'CREATE INDEX idx_acceptance_records_project_id ON public.acceptance_records (project_id)'),
          ],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'acceptance_records_update_policy',
                command: 'UPDATE',
                usingExpression: 'auth.uid() IS NOT NULL',
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
      actualTables: [
        {
          tableName: 'acceptance_records',
          columns: [
            column('id', 'uuid', { nullable: false }),
            column('status', 'text', { nullable: false }),
            column('attachments', 'jsonb'),
          ],
          constraints: [
            constraint('acceptance_records_status_check', 'check_constraint', "CHECK ((status = ANY (ARRAY['draft'::text, 'passed'::text])))"),
            constraint('acceptance_records_created_by_fkey', 'foreign_key', 'FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL'),
            constraint('alerts_level_check', 'check_constraint', "CHECK (((level)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying])::text[])))"),
            constraint('wbs_template_nodes_category_type_check', 'check_constraint', "CHECK (((category_type IS NULL) OR (category_type = ANY (ARRAY['division'::text, 'process'::text]))))"),
            constraint('algorithm_catalog_scope_consistency', 'check_constraint', 'CHECK (((project_id IS NULL) OR (company_id IS NOT NULL)))'),
            constraint('algorithm_cold_start_baselines_anonymized_shared_scope', 'check_constraint', "CHECK (((company_id IS NULL) AND (project_id IS NULL) AND (anonymization_policy = 'anonymized_multi_company_aggregation'::text)))"),
            constraint('algorithm_asset_candidate_events_no_deleted_range_tree_fields', 'check_constraint', "CHECK (((lower((candidate_payload)::text) !~~ '%zone_object_id%'::text) AND (lower((candidate_payload)::text) !~~ '%legacy_object_type%'::text)))"),
            constraint('algorithm_cold_start_baselines_max_single_company_share_check', 'check_constraint', 'CHECK (((max_single_company_share > (0)::numeric) AND (max_single_company_share <= 0.5)))'),
            constraint('project_climate_profiles_soft_soil_level_check', 'check_constraint', 'CHECK (((soft_soil_level >= 0) AND (soft_soil_level <= 3)))'),
            constraint('duration_experience_samples_learning_scope_check', 'check_constraint', "CHECK ((learning_scope = ANY (ARRAY['global'::text, 'industry'::text, 'company'::text, 'project'::text])))"),
            constraint('acceptance_template_policy_a_applied_auto_published_seed__check', 'check_constraint', 'CHECK ((applied_auto_published_seed_count >= 0))'),
          ],
          indexes: [
            index('idx_acceptance_records_attachments_gin', 'CREATE INDEX idx_acceptance_records_attachments_gin ON public.acceptance_records USING gin (attachments)'),
            index('idx_acceptance_records_project_id', 'CREATE INDEX idx_acceptance_records_project_id ON public.acceptance_records USING btree (project_id)'),
          ],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'acceptance_records_update_policy',
                command: 'UPDATE',
                usingExpression: '(auth.uid() IS NOT NULL)',
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('normalizes PostgreSQL policy predicate rewrites without hiding real policy drift', () => {
    const matchingResult = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'policy_runs',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'policy_runs_service_role',
                command: 'ALL',
                usingExpression: "auth.role() = 'service_role'",
                withCheckExpression: "publication_status IN ('published', 'canary') AND auth.uid() IS NOT NULL",
              },
              {
                policyName: 'policy_runs_admin',
                command: 'SELECT',
                usingExpression: `
                  project_id IS NULL
                  OR EXISTS (
                    SELECT 1
                    FROM public.users u
                    WHERE u.id = auth.uid()
                      AND u.global_role = 'company_admin'
                  )
                  OR public.is_project_member(policy_runs.project_id, auth.uid())
                  OR (SELECT current_setting('role', true) = 'service_role')
                `,
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
      actualTables: [
        {
          tableName: 'policy_runs',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'policy_runs_service_role',
                command: '*',
                usingExpression: "(auth.role() = 'service_role'::text)",
                withCheckExpression: "((publication_status = ANY (ARRAY['published'::text, 'canary'::text])) AND (auth.uid() IS NOT NULL))",
              },
              {
                policyName: 'policy_runs_admin',
                command: 'SELECT',
                usingExpression: "((project_id IS NULL) OR (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = auth.uid()) AND (u.global_role = 'company_admin'::text)))) OR is_project_member(project_id, auth.uid()) OR ( SELECT (current_setting('role'::text, true) = 'service_role'::text)))",
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
    })

    expect(matchingResult.blockingDrift).toEqual([])
    expect(matchingResult.status).toBe('pass')

    const driftResult = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'policy_runs',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'policy_runs_service_role',
                command: 'SELECT',
                usingExpression: "auth.role() = 'service_role'",
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
      actualTables: [
        {
          tableName: 'policy_runs',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'policy_runs_service_role',
                command: 'SELECT',
                usingExpression: "auth.role() = 'authenticated'::text",
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
    })

    expect(driftResult.blockingDrift).toEqual([
      expect.objectContaining({
        objectType: 'rls_policy',
        objectName: 'policy_runs.policy_runs_service_role',
        driftType: 'policy_using_mismatch',
      }),
    ])
  })

  it('normalizes PostgreSQL joined EXISTS policy display syntax', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'users',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'users_select_own',
                command: 'SELECT',
                usingExpression: `
                  id = auth.uid()
                  OR EXISTS (
                    SELECT 1
                    FROM project_members pm
                    JOIN project_members pm2 ON pm.project_id = pm2.project_id
                    WHERE pm.user_id = auth.uid()
                      AND pm2.user_id = users.id
                      AND pm.is_active = TRUE
                      AND pm2.is_active = TRUE
                  )
                `,
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
      actualTables: [
        {
          tableName: 'users',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'users_select_own',
                command: 'SELECT',
                usingExpression: "((id = auth.uid()) OR (EXISTS ( SELECT 1 FROM (project_members pm JOIN project_members pm2 ON ((pm.project_id = pm2.project_id))) WHERE ((pm.user_id = auth.uid()) AND (pm2.user_id = users.id) AND (pm.is_active = true) AND (pm2.is_active = true)))))",
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('normalizes policy expressions with public schema prefixes, table-qualified columns, casts and pg display parentheses', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'duration_experience_samples',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: true,
            policies: [
              {
                policyName: 'duration_experience_samples_auth_write_policy',
                command: 'ALL',
                usingExpression: null,
                withCheckExpression: `
                  COALESCE(duration_experience_samples.learning_scope, 'project') = 'project'
                  AND EXISTS (
                    SELECT 1
                    FROM public.projects p
                    WHERE p.id = duration_experience_samples.project_id
                      AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
                  )
                `,
              },
            ],
          },
        },
      ],
      actualTables: [
        {
          tableName: 'duration_experience_samples',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: true,
            policies: [
              {
                policyName: 'duration_experience_samples_auth_write_policy',
                command: '*',
                usingExpression: null,
                withCheckExpression: "((COALESCE(learning_scope, 'project'::text) = 'project'::text) AND (EXISTS ( SELECT 1\n   FROM projects p\n  WHERE ((p.id = duration_experience_samples.project_id) AND is_active_company_member(p.company_id, ARRAY['company_admin'::text, 'editor'::text])))))",
              },
            ],
          },
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('normalizes project-membership EXISTS policies with service-role fallback subselects', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'tasks',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: true,
            policies: [
              {
                policyName: 'tasks_read_policy',
                command: 'SELECT',
                usingExpression: `
                  EXISTS (
                    SELECT 1
                    FROM public.projects p
                    WHERE p.id = public.tasks.project_id
                      AND (
                        public.is_active_company_member(p.company_id, NULL::TEXT[])
                        OR (SELECT current_setting('role', true) = 'service_role')
                      )
                  )
                `,
                withCheckExpression: null,
              },
              {
                policyName: 'tasks_write_policy',
                command: 'ALL',
                usingExpression: `
                  EXISTS (
                    SELECT 1
                    FROM public.projects p
                    WHERE p.id = public.tasks.project_id
                      AND (
                        public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
                        OR (SELECT current_setting('role', true) = 'service_role')
                      )
                  )
                `,
                withCheckExpression: `
                  EXISTS (
                    SELECT 1
                    FROM public.projects p
                    WHERE p.id = public.tasks.project_id
                      AND (
                        public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
                        OR (SELECT current_setting('role', true) = 'service_role')
                      )
                  )
                `,
              },
            ],
          },
        },
      ],
      actualTables: [
        {
          tableName: 'tasks',
          columns: [column('id', 'uuid', { nullable: false })],
          rls: {
            enabled: true,
            forced: true,
            policies: [
              {
                policyName: 'tasks_read_policy',
                command: 'SELECT',
                usingExpression: "(EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = tasks.project_id) AND (is_active_company_member(p.company_id, NULL::text[]) OR ( SELECT (current_setting('role'::text, true) = 'service_role'::text))))))",
                withCheckExpression: null,
              },
              {
                policyName: 'tasks_write_policy',
                command: '*',
                usingExpression: "(EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = tasks.project_id) AND (is_active_company_member(p.company_id, ARRAY['company_admin'::text, 'editor'::text]) OR ( SELECT (current_setting('role'::text, true) = 'service_role'::text))))))",
                withCheckExpression: "(EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = tasks.project_id) AND (is_active_company_member(p.company_id, ARRAY['company_admin'::text, 'editor'::text]) OR ( SELECT (current_setting('role'::text, true) = 'service_role'::text))))))",
              },
            ],
          },
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('normalizes PostgreSQL array, scalar parentheses and partial-index predicate rewrites', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'runtime_events',
          columns: [
            column('id', 'uuid', { nullable: false }),
            column('company_id', 'uuid'),
            column('user_id', 'uuid'),
            column('role', 'text'),
            column('status', 'text'),
            column('candidate_fingerprint', 'text'),
            column('confidence', 'double precision'),
          ],
          constraints: [
            constraint('runtime_events_confidence_check', 'check_constraint', 'CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))'),
          ],
          indexes: [
            index('idx_runtime_events_active_fingerprint', "CREATE INDEX idx_runtime_events_active_fingerprint ON public.runtime_events (candidate_fingerprint) WHERE status IN ('pending', 'candidate_only') AND candidate_fingerprint IS NOT NULL"),
          ],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'runtime_events_select_admin',
                command: 'SELECT',
                usingExpression: `
                  EXISTS (
                    SELECT 1
                    FROM public.company_members cm
                    WHERE cm.company_id = runtime_events.company_id
                      AND cm.user_id = auth.uid()
                      AND cm.role IN ('owner', 'admin')
                  )
                  OR user_id::text = auth.uid()::text
                `,
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
      actualTables: [
        {
          tableName: 'runtime_events',
          columns: [
            column('id', 'uuid', { nullable: false }),
            column('company_id', 'uuid'),
            column('user_id', 'uuid'),
            column('role', 'text'),
            column('status', 'text'),
            column('candidate_fingerprint', 'text'),
            column('confidence', 'double precision'),
          ],
          constraints: [
            constraint('runtime_events_confidence_check', 'check_constraint', 'CHECK (((confidence IS NULL) OR ((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))))'),
          ],
          indexes: [
            index('idx_runtime_events_active_fingerprint', "CREATE INDEX idx_runtime_events_active_fingerprint ON public.runtime_events USING btree (candidate_fingerprint) WHERE ((status = ANY (ARRAY['pending'::text, 'candidate_only'::text])) AND (candidate_fingerprint IS NOT NULL))"),
          ],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: 'runtime_events_select_admin',
                command: 'SELECT',
                usingExpression: "((EXISTS ( SELECT 1 FROM company_members cm WHERE ((cm.company_id = runtime_events.company_id) AND (cm.user_id = auth.uid()) AND (cm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))) OR ((user_id)::text = (auth.uid())::text))",
                withCheckExpression: null,
              },
            ],
          },
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('normalizes PostgreSQL partial-index and check-constraint catalog display rewrites', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'notifications',
          columns: [
            column('project_id', 'uuid'),
            column('company_id', 'uuid'),
            column('scope_type', 'text'),
            column('touchpoint_type', 'text'),
            column('dedupe_key', 'text'),
            column('lifecycle_status', 'text'),
            column('source_entity_type', 'text'),
            column('warning_lifecycle_status', 'text'),
            column('severity', 'text'),
            column('created_at', 'timestamp with time zone'),
            column('warning_signature', 'text'),
          ],
          constraints: [
            constraint(
              'notifications_warning_lifecycle_status_check',
              'check_constraint',
              "CHECK ((source_entity_type IS DISTINCT FROM 'warning' AND warning_lifecycle_status IS NULL) OR (source_entity_type = 'warning' AND warning_lifecycle_status IN ('created', 'active', 'acknowledged', 'muted', 'resolved', 'escalated')))",
            ),
          ],
          indexes: [
            index('idx_notifications_warning_lifecycle', "CREATE INDEX idx_notifications_warning_lifecycle ON public.notifications (project_id, source_entity_type, warning_lifecycle_status, severity, created_at DESC) WHERE source_entity_type = 'warning'"),
            index('idx_notifications_warning_signature_unique', "CREATE UNIQUE INDEX idx_notifications_warning_signature_unique ON public.notifications (project_id, warning_signature) WHERE source_entity_type = 'warning' AND warning_signature IS NOT NULL"),
            index('uq_notifications_active_touchpoint_dedupe', "CREATE UNIQUE INDEX uq_notifications_active_touchpoint_dedupe ON public.notifications (COALESCE(company_id::text, 'no-company'), COALESCE(project_id::text, 'no-project'), scope_type, touchpoint_type, dedupe_key) WHERE lifecycle_status = 'active' AND dedupe_key IS NOT NULL"),
            index('idx_warning_owner_confirmations_feedback_pending', "CREATE INDEX idx_warning_owner_confirmations_feedback_pending ON public.notifications (project_id, severity, created_at DESC) WHERE created_at IS NOT NULL AND lifecycle_status <> 'applied'"),
          ],
        },
        {
          tableName: 'standard_processes',
          columns: [
            column('name', 'text'),
          ],
          indexes: [
            index('idx_standard_processes_name', "CREATE INDEX idx_standard_processes_name ON public.standard_processes USING gin(to_tsvector('simple', name))"),
          ],
        },
      ],
      actualTables: [
        {
          tableName: 'notifications',
          columns: [
            column('project_id', 'uuid'),
            column('company_id', 'uuid'),
            column('scope_type', 'text'),
            column('touchpoint_type', 'text'),
            column('dedupe_key', 'text'),
            column('lifecycle_status', 'text'),
            column('source_entity_type', 'text'),
            column('warning_lifecycle_status', 'text'),
            column('severity', 'text'),
            column('created_at', 'timestamp with time zone'),
            column('warning_signature', 'text'),
          ],
          constraints: [
            constraint(
              'notifications_warning_lifecycle_status_check',
              'check_constraint',
              "CHECK (((((source_entity_type)::text IS DISTINCT FROM 'warning'::text) AND (warning_lifecycle_status IS NULL)) OR (((source_entity_type)::text = 'warning'::text) AND (warning_lifecycle_status = ANY (ARRAY['created'::text, 'active'::text, 'acknowledged'::text, 'muted'::text, 'resolved'::text, 'escalated'::text])))))",
            ),
          ],
          indexes: [
            index('idx_notifications_warning_lifecycle', "CREATE INDEX idx_notifications_warning_lifecycle ON public.notifications USING btree (project_id, source_entity_type, warning_lifecycle_status, severity, created_at DESC) WHERE ((source_entity_type)::text = 'warning'::text)"),
            index('idx_notifications_warning_signature_unique', "CREATE UNIQUE INDEX idx_notifications_warning_signature_unique ON public.notifications USING btree (project_id, warning_signature) WHERE (((source_entity_type)::text = 'warning'::text) AND (warning_signature IS NOT NULL))"),
            index('uq_notifications_active_touchpoint_dedupe', "CREATE UNIQUE INDEX uq_notifications_active_touchpoint_dedupe ON public.notifications USING btree (COALESCE((company_id)::text, 'no-company'::text), COALESCE((project_id)::text, 'no-project'::text), scope_type, touchpoint_type, dedupe_key) WHERE ((lifecycle_status = 'active'::text) AND (dedupe_key IS NOT NULL))"),
            index('idx_warning_owner_confirmations_feedback_pending', "CREATE INDEX idx_warning_owner_confirmations_feedback_pending ON public.notifications USING btree (project_id, severity, created_at DESC) WHERE ((created_at IS NOT NULL) AND (lifecycle_status <> 'applied'::text))"),
          ],
        },
        {
          tableName: 'standard_processes',
          columns: [
            column('name', 'text'),
          ],
          indexes: [
            index('idx_standard_processes_name', "CREATE INDEX idx_standard_processes_name ON public.standard_processes USING gin (to_tsvector('simple'::regconfig, name))"),
          ],
        },
      ],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('matches PostgreSQL truncated long policy and constraint identifiers when definitions are equivalent', () => {
    const longPolicyName = 'algorithm_learnable_parameter_runtime_publications_write_service_role'
    const truncatedPolicyName = 'algorithm_learnable_parameter_runtime_publications_write_servic'
    const longConstraintName = 'project_schedule_states_project_id_scope_type_scope_id_window_end_date_key'
    const truncatedConstraintName = 'project_schedule_states_project_id_scope_type_scope_id_wind_key'
    const columns = [
      column('project_id', 'uuid', { nullable: false }),
      column('scope_type', 'text', { nullable: false }),
      column('scope_id', 'uuid'),
      column('window_end_date', 'date', { nullable: false }),
    ]

    const result = evaluateSchemaDrift({
      expectedTables: [
        {
          tableName: 'project_schedule_states',
          columns,
          constraints: [
            constraint(longConstraintName, 'unique_constraint', 'UNIQUE(project_id, scope_type, scope_id, window_end_date)'),
          ],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: longPolicyName,
                command: 'ALL',
                usingExpression: "auth.role() = 'service_role'",
                withCheckExpression: "auth.role() = 'service_role'",
              },
            ],
          },
        },
      ],
      actualTables: [
        {
          tableName: 'project_schedule_states',
          columns,
          constraints: [
            constraint(truncatedConstraintName, 'unique_constraint', 'UNIQUE (project_id, scope_type, scope_id, window_end_date)'),
          ],
          rls: {
            enabled: true,
            forced: false,
            policies: [
              {
                policyName: truncatedPolicyName,
                command: '*',
                usingExpression: "(auth.role() = 'service_role'::text)",
                withCheckExpression: "(auth.role() = 'service_role'::text)",
              },
            ],
          },
        },
      ],
    })

    expect(result.status).toBe('pass')
    expect(result.blockingDrift).toEqual([])
  })

  it('normalizes vetted catalog output for btree indexes and nested count checks', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [{
        tableName: 'task_batch_update_jobs',
        columns: [column('accepted_count', 'integer'), column('succeeded_count', 'integer'), column('failed_count', 'integer')],
        constraints: [constraint(
          'task_batch_update_jobs_counts_check',
          'check_constraint',
          'CHECK (accepted_count >= 0 AND succeeded_count >= 0 AND failed_count >= 0 AND succeeded_count + failed_count <= accepted_count)',
        )],
        indexes: [index(
          'uq_system_template_work_item_per_project',
          "CREATE UNIQUE INDEX uq_system_template_work_item_per_project ON public.task_batch_update_jobs (accepted_count, upper(succeeded_count)) WHERE failed_count IS NOT NULL AND notes LIKE 'system_template:%'",
        )],
      }],
      actualTables: [{
        tableName: 'task_batch_update_jobs',
        columns: [column('accepted_count', 'integer'), column('succeeded_count', 'integer'), column('failed_count', 'integer')],
        constraints: [constraint(
          'task_batch_update_jobs_counts_check',
          'check_constraint',
          'CHECK (((accepted_count >= 0) AND (succeeded_count >= 0) AND (failed_count >= 0) AND ((succeeded_count + failed_count) <= accepted_count)))',
        )],
        indexes: [index(
          'uq_system_template_work_item_per_project',
          "CREATE UNIQUE INDEX uq_system_template_work_item_per_project ON public.task_batch_update_jobs USING btree (accepted_count, upper((succeeded_count)::text)) WHERE ((failed_count IS NOT NULL) AND (notes ~~ 'system_template:%'::text))",
        )],
      }],
    })

    expect(result.blockingDrift).toEqual([])
    expect(result.status).toBe('pass')
  })

  it('keeps public and private membership functions distinct without a migration-level rewrite', () => {
    const result = evaluateSchemaDrift({
      expectedTables: [{
        tableName: 'projects',
        columns: [column('company_id', 'uuid'), column('project_id', 'uuid')],
        rls: {
          enabled: true,
          forced: true,
          policies: [{
            policyName: 'projects_read_policy',
            command: 'select',
            usingExpression: 'public.is_active_company_member(company_id, NULL::TEXT[]) OR public.is_project_member(project_id, auth.uid())',
            withCheckExpression: null,
          }],
        },
      }],
      actualTables: [{
        tableName: 'projects',
        columns: [column('company_id', 'uuid'), column('project_id', 'uuid')],
        rls: {
          enabled: true,
          forced: true,
          policies: [{
            policyName: 'projects_read_policy',
            command: 'select',
            usingExpression: 'workbuddy_private.is_active_company_member(company_id, NULL::text[]) OR workbuddy_private.is_project_member(project_id, auth.uid())',
            withCheckExpression: null,
          }],
        },
      }],
    })

    expect(result.blockingDrift).toEqual([
      expect.objectContaining({
        objectType: 'rls_policy',
        objectName: 'projects.projects_read_policy',
        driftType: 'policy_using_mismatch',
      }),
    ])
  })
})

function column(
  columnName: string,
  dataType: string,
  overrides: Partial<SchemaDriftExpectedColumn & SchemaDriftActualColumn> = {},
) {
  return {
    columnName,
    dataType,
    nullable: true,
    defaultExpression: null,
    ...overrides,
  }
}

function constraint(
  constraintName: string,
  constraintType: SchemaDriftConstraint['constraintType'],
  definition: string,
) {
  return {
    constraintName,
    constraintType,
    definition,
  }
}

function index(
  indexName: string,
  definition: string,
) {
  return {
    indexName,
    definition,
  }
}
