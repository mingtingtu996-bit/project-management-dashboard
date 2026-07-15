import { describe, expect, it } from 'vitest'

import {
  buildProductionMigrationGovernanceReport,
  evaluateProductionMigrationRuntimeGate,
  type ProductionMigrationGovernanceInput,
} from '../services/migrationProductionGovernanceService.js'

function freshGovernanceTimestamp() {
  return new Date().toISOString()
}

const migration246 = '246_v14231_advisor_public_rls_closeout.sql'
const migration247 = '247_v14231_users_active_session_guard_columns.sql'
const migration252 = '252_v14231_advisor_public_rls_remaining_closeout.sql'
const migration253 = '253_v14231_advisor_public_rls_live_catalog_closeout.sql'
const migration259 = '259_v14231_supabase_advisor_security_closeout.sql'
const migration264 = '264_v14231_default_master_plan_runtime_publication_asset_kind.sql'
const migration277 = '277_v14231_algorithm_asset_candidate_experience_tier.sql'
const migration278 = '278_v14231_post277_advisor_security_rpc_acl_closeout.sql'
const requiredV14231Migrations = [migration246, migration247, migration252, migration253, migration259, migration264, migration277, migration278]

function appliedRequiredMigrationEvidence(
  filename: typeof requiredV14231Migrations[number],
  evidenceLink = `artifacts/${filename.replace(/\.sql$/, '')}-closeout-readback.json`,
) {
  return {
    filename,
    owner: 'db-owner',
    schemaReadback: true,
    ledgered: true,
    evidenceLinks: [evidenceLink],
  }
}

function requiredMigrationRows() {
  return requiredV14231Migrations.map((filename) => ({
    filename,
    version: filename.split('_')[0],
  }))
}

function appliedRequiredMigrationEvidenceRows(
  evidenceSuffix = 'closeout-readback',
) {
  return requiredV14231Migrations.map((filename) => appliedRequiredMigrationEvidence(
    filename,
    `artifacts/${filename.replace(/\.sql$/, '')}-${evidenceSuffix}.json`,
  ))
}

function forwardApplyEvidence(filename: typeof requiredV14231Migrations[number]) {
  return {
    filename,
    owner: 'db-owner',
    ledgered: false,
    evidenceLinks: [`artifacts/${filename.replace(/\.sql$/, '')}-forward-plan.json`],
    forwardApplyEvidence: {
      backup: true,
      dryRun: true,
      plan: true,
      apply: true,
      postApplyReadback: true,
      apiSmoke: true,
      rollbackPlan: true,
      advisorRescan: true,
    },
  }
}

function baseInput(overrides: Partial<ProductionMigrationGovernanceInput> = {}): ProductionMigrationGovernanceInput {
  return {
    inventoryFrozen: true,
    inventorySnapshot: {
      gitCommit: 'test-commit',
      imageDigest: 'sha256:test-image',
      executedAt: freshGovernanceTimestamp(),
      operator: 'migration-governance-test',
    },
    localMigrations: requiredMigrationRows(),
    remoteMigrations: requiredMigrationRows(),
    cleanBundle: {
      present: true,
      filename: 'CLEAN_MIGRATION_V4.sql',
      includedFilenames: requiredV14231Migrations,
    },
    ledger: {
      available: true,
      rowCount: 0,
      rows: [],
    },
    liveCatalog: {
      baselineObjectCount: 4,
      baselineObjects: ['users', 'projects', 'tasks', 'project_key_node_snapshots'],
    },
    privilegedProbe: {
      attempted: true,
      ok: true,
      migrationUrlConfigured: true,
      runtimeUrlSeparated: true,
      currentUser: 'migration_admin',
      sessionUser: 'migration_admin',
      rolBypassRls: true,
      pgIsInRecovery: false,
    },
    schemaDrift: {
      unexplainedDriftCount: 0,
      orphanLedgerRows: [],
      duplicateVersions: [],
      checksumDriftRows: [],
      missingMigrationFiles: [],
      retiredColumnHardReads: [],
    },
    dropCandidateInventory: {
      evaluated: true,
      noCandidates: true,
      source: 'test retired-object audit + legacy-object-drop guard',
      generatedAt: freshGovernanceTimestamp(),
      operator: 'migration-governance-test',
      artifactPath: 'artifacts/test-drop-candidate-inventory.json',
    },
    dropCandidates: [],
    ...overrides,
  }
}

describe('migrationProductionGovernanceService', () => {
  it('blocks production migration governance when the live catalog has objects but public.schema_migrations has zero rows', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput())
    const mg01 = report.gates.find((gate) => gate.id === 'MG-01')

    expect(report.status).toBe('blocked')
    expect(mg01).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining(['ledger_reconciliation_required']),
    }))
    expect(report.allowScheduler).toBe(false)
  })

  it('classifies known v1.4.23.1 migrations as forward-apply or manual-adoption instead of assuming them applied', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      requiredMigrations: [
        {
          filename: '247_v14231_users_active_session_guard_columns.sql',
          owner: 'db-owner',
          schemaReadback: true,
          ledgered: false,
          materialSchemaPresent: true,
          evidenceLinks: ['artifacts/247-readback.json'],
        },
      ],
    }))

    expect(report.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filename: '246_v14231_advisor_public_rls_closeout.sql',
        classification: 'not_applied_forward_apply',
        reasonCodes: expect.arrayContaining(['not_applied_forward_apply']),
      }),
      expect.objectContaining({
        filename: '247_v14231_users_active_session_guard_columns.sql',
        classification: 'manual_repair_requires_adoption',
        reasonCodes: expect.arrayContaining(['manual_repair_requires_adoption']),
      }),
    ]))
  })

  it('requires local v1.4.23.1 migrations beyond the remote inventory to be classified before MG-02 passes', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      localMigrations: [
        { filename: migration246, version: '246' },
        { filename: migration247, version: '247' },
        { filename: migration252, version: '252' },
        { filename: migration253, version: '253' },
        { filename: migration259, version: '259' },
        { filename: migration264, version: '264' },
        { filename: migration277, version: '277' },
        { filename: migration278, version: '278' },
        { filename: '248_v14231_future_local_only_hardening.sql', version: '248' },
      ],
      remoteMigrations: [
        { filename: migration246, version: '246' },
        { filename: migration247, version: '247' },
        { filename: migration252, version: '252' },
        { filename: migration253, version: '253' },
        { filename: migration259, version: '259' },
        { filename: migration264, version: '264' },
        { filename: migration277, version: '277' },
        { filename: migration278, version: '278' },
      ],
      cleanBundle: {
        present: true,
        filename: 'CLEAN_MIGRATION_V4.sql',
        includedFilenames: [
          migration246,
          migration247,
          migration252,
          migration253,
          migration259,
          migration264,
          migration277,
          migration278,
          '248_v14231_future_local_only_hardening.sql',
        ],
      },
      requiredMigrations: [
        ...appliedRequiredMigrationEvidenceRows('readback'),
      ],
    }))

    expect(report.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filename: '248_v14231_future_local_only_hardening.sql',
        classification: 'not_applied_forward_apply',
        reasonCodes: expect.arrayContaining(['not_applied_forward_apply']),
      }),
    ]))
    expect(report.gates.find((gate) => gate.id === 'MG-02')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining([
        '248_v14231_future_local_only_hardening.sql:owner_missing',
        '248_v14231_future_local_only_hardening.sql:evidence_link_missing',
      ]),
    }))
  })

  it('classifies non-247 material schema without ledger as materially applied unledgered instead of forward apply', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      requiredMigrations: [
        {
          filename: '246_v14231_advisor_public_rls_closeout.sql',
          owner: 'db-owner',
          schemaReadback: true,
          ledgered: false,
          materialSchemaPresent: true,
          evidenceLinks: ['artifacts/246-catalog-readback.json'],
        },
      ],
    }))

    expect(report.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filename: '246_v14231_advisor_public_rls_closeout.sql',
        classification: 'materially_applied_unledgered',
        reasonCodes: expect.arrayContaining(['materially_applied_unledgered']),
      }),
    ]))
    expect(report.classifications.find(
      (row) => row.filename === '246_v14231_advisor_public_rls_closeout.sql',
    )?.classification).not.toBe('not_applied_forward_apply')
  })

  it('classifies ledger rows without catalog readback as catalog-readback required instead of unledgered', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      ledger: {
        available: true,
        rowCount: 247,
        rows: [
          { filename: '246_v14231_advisor_public_rls_closeout.sql', version: '246' },
          { filename: '247_v14231_users_active_session_guard_columns.sql', version: '247' },
        ],
      },
      requiredMigrations: [
        {
          filename: '246_v14231_advisor_public_rls_closeout.sql',
          owner: 'db-owner',
          ledgered: true,
          schemaReadback: false,
          evidenceLinks: ['artifacts/246-ledger-row.json'],
        },
      ],
    }))

    expect(report.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filename: '246_v14231_advisor_public_rls_closeout.sql',
        classification: 'ledgered_catalog_readback_required',
        reasonCodes: expect.arrayContaining(['catalog_readback_required']),
      }),
    ]))
    expect(report.classifications.find(
      (row) => row.filename === '246_v14231_advisor_public_rls_closeout.sql',
    )?.classification).not.toBe('materially_applied_unledgered')
  })

  it('allows explicit blocked-admin-url and obsolete migration classifications without inferring forward apply', () => {
    const blockedReport = buildProductionMigrationGovernanceReport(baseInput({
      requiredMigrations: [
        {
          filename: '246_v14231_advisor_public_rls_closeout.sql',
          owner: 'db-owner',
          classification: 'blocked_requires_admin_url',
          evidenceLinks: ['artifacts/246-admin-url-blocked.json'],
        },
      ],
    }))

    expect(blockedReport.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filename: '246_v14231_advisor_public_rls_closeout.sql',
        classification: 'blocked_requires_admin_url',
        reasonCodes: expect.arrayContaining(['blocked_requires_admin_url']),
      }),
    ]))
    expect(blockedReport.gates.find((gate) => gate.id === 'MG-02')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining(['migration_classification_blocked_requires_admin_url']),
    }))

    const obsoleteReport = buildProductionMigrationGovernanceReport(baseInput({
      localMigrations: [
        { filename: migration246, version: '246' },
        { filename: migration247, version: '247' },
        { filename: migration252, version: '252' },
        { filename: migration253, version: '253' },
        { filename: migration259, version: '259' },
        { filename: migration264, version: '264' },
        { filename: migration277, version: '277' },
        { filename: migration278, version: '278' },
        { filename: '248_v14231_superseded_local_hardening.sql', version: '248' },
      ],
      remoteMigrations: [
        { filename: migration246, version: '246' },
        { filename: migration247, version: '247' },
        { filename: migration252, version: '252' },
        { filename: migration253, version: '253' },
        { filename: migration259, version: '259' },
        { filename: migration264, version: '264' },
        { filename: migration277, version: '277' },
        { filename: migration278, version: '278' },
      ],
      cleanBundle: {
        present: true,
        filename: 'CLEAN_MIGRATION_V4.sql',
        includedFilenames: [
          migration246,
          migration247,
          migration252,
          migration253,
          migration259,
          migration264,
          migration277,
          migration278,
          '248_v14231_superseded_local_hardening.sql',
        ],
      },
      ledger: {
        available: true,
        rowCount: 277,
        rows: requiredMigrationRows(),
      },
      requiredMigrations: [
        ...appliedRequiredMigrationEvidenceRows(),
        {
          filename: '248_v14231_superseded_local_hardening.sql',
          owner: 'db-owner',
          classification: 'obsolete_or_superseded',
          handlingAction: 'superseded_by_249_keep_out_of_forward_apply',
          evidenceLinks: ['artifacts/248-supersession-record.json'],
        },
      ],
      closeoutReadback: {
        schemaMigrationsRowCount: 277,
        keyMigrationsLedgered: requiredV14231Migrations,
        keyCatalogMatches: true,
        apiSmokePass: true,
        postgresErrorsStable: true,
        advisorPass: true,
        allowValidate: true,
        allowWarmup: true,
        allowScheduler: true,
      },
    }))

    expect(obsoleteReport.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filename: '248_v14231_superseded_local_hardening.sql',
        classification: 'obsolete_or_superseded',
      }),
    ]))
    expect(obsoleteReport.gates.find((gate) => gate.id === 'MG-02')?.status).toBe('pass')
    expect(obsoleteReport.gates.find((gate) => gate.id === 'MG-05')?.status).toBe('pass')
    expect(obsoleteReport.gates.find((gate) => gate.id === 'MG-07')?.reasonCodes).not.toContain(
      '248_v14231_superseded_local_hardening.sql:closeout_ledger_readback_missing',
    )
  })

  it('keeps scheduler closed when adoption and forward-apply plans are ready but closeout readback is missing', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      ledger: {
        available: true,
        rowCount: 245,
        rows: [],
      },
      requiredMigrations: [
        forwardApplyEvidence(migration246),
        {
          filename: migration247,
          owner: 'db-owner',
          schemaReadback: true,
          ledgered: false,
          materialSchemaPresent: true,
          evidenceLinks: ['artifacts/247-adoption-plan.json'],
          adoptionEvidence: {
            checksumVerified: true,
            objectReadback: true,
            constraintIndexReadback: true,
            rlsPolicyReadback: true,
            dataCompatibilityChecked: true,
            rollbackPlan: true,
          },
        },
        forwardApplyEvidence(migration252),
        forwardApplyEvidence(migration253),
        forwardApplyEvidence(migration259),
        forwardApplyEvidence(migration264),
        forwardApplyEvidence(migration277),
        forwardApplyEvidence(migration278),
      ],
    }))

    expect(report.gates.find((gate) => gate.id === 'MG-04')?.status).toBe('pass')
    expect(report.gates.find((gate) => gate.id === 'MG-05')?.status).toBe('pass')
    expect(report.gates.find((gate) => gate.id === 'MG-07')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: ['closeout_readback_required'],
    }))
    expect(report.status).toBe('ready_for_closeout_readback')
    expect(report.allowValidate).toBe(true)
    expect(report.allowWarmup).toBe(false)
    expect(report.allowScheduler).toBe(false)
  })

  it('closes only after key migrations are ledgered, catalog matches, smoke passes, errors are stable, and Advisor is rescanned', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      ledger: {
        available: true,
        rowCount: 277,
        rows: requiredMigrationRows(),
      },
      requiredMigrations: appliedRequiredMigrationEvidenceRows(),
      closeoutReadback: {
        schemaMigrationsRowCount: 277,
        keyMigrationsLedgered: requiredV14231Migrations,
        keyCatalogMatches: true,
        apiSmokePass: true,
        postgresErrorsStable: true,
        advisorPass: true,
        allowValidate: true,
        allowWarmup: true,
        allowScheduler: true,
      },
    }))

    expect(report.status).toBe('closed')
    expect(report.gates.every((gate) => gate.status === 'pass')).toBe(true)
    expect(report.allowValidate).toBe(true)
    expect(report.allowWarmup).toBe(true)
    expect(report.allowScheduler).toBe(true)
  })

  it('blocks production scheduler and read-model warmup when release migration attestation is missing', async () => {
    const result = await evaluateProductionMigrationRuntimeGate({
      nodeEnv: 'production',
      shouldBootScheduler: true,
      shouldWarmReadModelOnBoot: true,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      allowScheduler: false,
      allowWarmup: false,
      reasonCodes: expect.arrayContaining(['production_migration_runtime_attestation_required']),
    }))
  })

  it('allows local and test bootstraps without production migration evidence', async () => {
    const result = await evaluateProductionMigrationRuntimeGate({
      nodeEnv: 'development',
      shouldBootScheduler: true,
      shouldWarmReadModelOnBoot: true,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'pass',
      allowScheduler: true,
      allowWarmup: true,
      reasonCodes: [],
    }))
  })

  it('allows production scheduler and warmup when the release migration checksum matches the database ledger', async () => {
    const result = await evaluateProductionMigrationRuntimeGate({
      nodeEnv: 'production',
      shouldBootScheduler: true,
      shouldWarmReadModelOnBoot: true,
      expectedMigrationFilename: '310_v14231_project_entity_links_runtime_rls.sql',
      expectedMigrationChecksum: 'release-checksum',
      readMigrationLedgerEntry: async () => ({
        filename: '310_v14231_project_entity_links_runtime_rls.sql',
        checksum: 'release-checksum',
      }),
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'pass',
      allowScheduler: true,
      allowWarmup: true,
      reasonCodes: [],
    }))
  })

  it('blocks production bootstrap when the database ledger checksum differs from the release migration', async () => {
    const result = await evaluateProductionMigrationRuntimeGate({
      nodeEnv: 'production',
      shouldBootScheduler: true,
      shouldWarmReadModelOnBoot: true,
      expectedMigrationFilename: '310_v14231_project_entity_links_runtime_rls.sql',
      expectedMigrationChecksum: 'release-checksum',
      readMigrationLedgerEntry: async () => ({
        filename: '310_v14231_project_entity_links_runtime_rls.sql',
        checksum: 'database-checksum',
      }),
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      allowScheduler: false,
      allowWarmup: false,
      reasonCodes: expect.arrayContaining(['production_migration_runtime_checksum_mismatch']),
    }))
  })

  it('blocks MG-06 when a drop candidate relies on zero row count without dependency and rollback evidence', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      dropCandidates: [
        {
          objectName: 'scope_dimensions',
          classification: 'obsolete_or_superseded',
          rowCount: 0,
        },
      ],
    }))

    expect(report.gates.find((gate) => gate.id === 'MG-06')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining([
        'scope_dimensions:row_count_zero_not_sufficient',
        'scope_dimensions:dependency_scan_not_passed',
        'scope_dimensions:missing_structure_export',
        'scope_dimensions:missing_migration_plan',
        'scope_dimensions:missing_rollback_plan',
        'scope_dimensions:missing_controlled_drop_migration',
        'scope_dimensions:post_drop_readback_not_required',
      ]),
    }))
  })

  it('blocks MG-06 when drop candidate inventory is omitted instead of treating missing evidence as no candidates', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      dropCandidateInventory: undefined,
      dropCandidates: undefined,
    }))

    expect(report.gates.find((gate) => gate.id === 'MG-06')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining(['drop_candidate_inventory_missing']),
    }))
  })

  it('blocks MG-06 when an empty drop candidate list has no explicit no-candidate attestation', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      dropCandidateInventory: {
        evaluated: true,
        noCandidates: false,
        source: '',
        generatedAt: '',
        operator: '',
      },
      dropCandidates: [],
    }))

    expect(report.gates.find((gate) => gate.id === 'MG-06')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining([
        'drop_candidate_no_candidate_attestation_missing',
        'drop_candidate_inventory_source_missing',
        'drop_candidate_inventory_generated_at_missing',
        'drop_candidate_inventory_operator_missing',
      ]),
    }))
  })

  it('blocks MG-01 when the frozen inventory snapshot is stale instead of accepting old evidence', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      inventorySnapshot: {
        gitCommit: 'old-commit',
        imageDigest: 'sha256:old-image',
        executedAt: '2026-01-01T00:00:00.000Z',
        operator: 'migration-governance-test',
      },
    }))

    expect(report.gates.find((gate) => gate.id === 'MG-01')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining(['inventory_executed_at_stale']),
    }))
  })

  it('blocks MG-06 when no-candidate drop inventory lacks artifact provenance', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      dropCandidateInventory: {
        evaluated: true,
        noCandidates: true,
        source: 'retired-object audit',
        generatedAt: freshGovernanceTimestamp(),
        operator: 'migration-governance-test',
        artifactPath: '',
      },
      dropCandidates: [],
    }))

    expect(report.gates.find((gate) => gate.id === 'MG-06')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining(['drop_candidate_inventory_artifact_path_missing']),
    }))
  })

  it('blocks MG-03 when the privileged migration probe is missing instead of inferring admin readiness', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      privilegedProbe: undefined,
    }))

    expect(report.gates.find((gate) => gate.id === 'MG-03')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining([
        'privileged_migration_probe_required',
        'privileged_migration_url_missing',
        'privileged_migration_probe_failed',
        'runtime_and_migration_url_separation_required',
        'privileged_probe_current_user_missing',
        'privileged_probe_session_user_missing',
        'privileged_probe_rolbypassrls_missing',
      ]),
    }))
  })

  it('blocks MG-03 when the migration probe role cannot bypass RLS', () => {
    const report = buildProductionMigrationGovernanceReport(baseInput({
      privilegedProbe: {
        attempted: true,
        ok: true,
        migrationUrlConfigured: true,
        runtimeUrlSeparated: true,
        currentUser: 'app_runtime',
        sessionUser: 'app_runtime',
        rolBypassRls: false,
        pgIsInRecovery: false,
      },
    }))

    expect(report.gates.find((gate) => gate.id === 'MG-03')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining(['privileged_probe_rolbypassrls_required']),
    }))
  })
})
