export type MigrationSafetyRecord = {
  filename: string
  version: string
  checksum?: string | null
}

export type MigrationChecksumMismatch = {
  filename: string
  version: string
  expectedChecksum: string | null
  actualChecksum: string | null
}

export type MigrationChecksumReconciliationRecord = {
  filename: string
  version: string
  currentFileChecksum: string
  appliedLedgerChecksum: string
  reviewedAt: string
  reviewedBy: string
  evidence: string
}

export type DuplicateMigrationVersion = {
  version: string
  filenames: string[]
}

export type MigrationCheckStatus = 'pass' | 'fail'

export type MigrationCheckResult = {
  status: MigrationCheckStatus
  ledgerAvailable: boolean
  pendingMigrations: MigrationSafetyRecord[]
  checksumMismatches: MigrationChecksumMismatch[]
  reconciledChecksumMismatches: MigrationChecksumMismatch[]
  orphanLedgerRows: MigrationSafetyRecord[]
  adoptedBaselineLedgerRows: MigrationSafetyRecord[]
  duplicateVersions: DuplicateMigrationVersion[]
  unsafeBaselineReplayRisk: boolean
  existingBaselineTables: string[]
  reasonCodes: string[]
}

export type MigrationCheckGateOptions = {
  allowPendingMigrations?: boolean
}

export type MigrationReleaseReadinessStatus =
  | 'blocked_before_apply'
  | 'ready_to_apply_pending'
  | 'ready_for_schema_drift_check'

export type MigrationReleaseReadiness = {
  status: MigrationReleaseReadinessStatus
  safeToApplyPending: boolean
  safeToEvaluateDrift: boolean
  pendingCount: number
  checksumMismatchCount: number
  orphanLedgerRowCount: number
  adoptedBaselineLedgerRowCount: number
  duplicateVersionCount: number
  unsafeBaselineReplayRisk: boolean
  blockingReasonCodes: string[]
  nextAction:
    | 'resolve_structural_migration_history'
    | 'apply_pending_migrations'
    | 'run_schema_drift_check'
}

export type EvaluateMigrationCheckInput = {
  discoveredMigrations: MigrationSafetyRecord[]
  appliedMigrations: MigrationSafetyRecord[]
  adoptedBaselineFilenames?: readonly string[]
  checksumReconciliations?: readonly MigrationChecksumReconciliationRecord[]
  existingBaselineTables?: readonly string[]
  ledgerAvailable?: boolean
}

export type SchemaDriftPolicy = {
  policyName: string
  command: string | null
  usingExpression?: string | null
  withCheckExpression?: string | null
}

export type SchemaDriftRlsState = {
  enabled: boolean
  forced: boolean
  policies: SchemaDriftPolicy[]
}

export type SchemaDriftExpectedColumn = {
  columnName: string
  dataType: string
  nullable: boolean
  defaultExpression?: string | null
}

export type SchemaDriftActualColumn = SchemaDriftExpectedColumn

export type SchemaDriftConstraintType =
  | 'primary_key'
  | 'foreign_key'
  | 'unique_constraint'
  | 'check_constraint'

export type SchemaDriftConstraint = {
  constraintName: string
  constraintType: SchemaDriftConstraintType
  definition: string
}

export type SchemaDriftIndex = {
  indexName: string
  definition: string
}

export type SchemaDriftExpectedTable = {
  tableName: string
  columns: SchemaDriftExpectedColumn[]
  constraints?: SchemaDriftConstraint[]
  indexes?: SchemaDriftIndex[]
  rls?: SchemaDriftRlsState
}

export type SchemaDriftActualTable = {
  tableName: string
  columns: SchemaDriftActualColumn[]
  constraints?: SchemaDriftConstraint[]
  indexes?: SchemaDriftIndex[]
  rls?: SchemaDriftRlsState
}

export type SchemaDriftObjectType = 'table' | 'column' | 'constraint' | 'index' | 'rls' | 'rls_policy'

export type SchemaDriftType =
  | 'missing_actual_table'
  | 'unexpected_actual_table'
  | 'missing_actual_column'
  | 'unexpected_actual_column'
  | 'column_type_mismatch'
  | 'column_nullable_mismatch'
  | 'column_default_mismatch'
  | 'rls_enabled_mismatch'
  | 'rls_forced_mismatch'
  | 'missing_actual_policy'
  | 'unexpected_actual_policy'
  | 'policy_command_mismatch'
  | 'policy_using_mismatch'
  | 'policy_with_check_mismatch'
  | 'missing_actual_constraint'
  | 'unexpected_actual_constraint'
  | 'constraint_type_mismatch'
  | 'constraint_definition_mismatch'
  | 'missing_actual_index'
  | 'unexpected_actual_index'
  | 'index_definition_mismatch'

export type BlockingSchemaDrift = {
  objectType: SchemaDriftObjectType
  objectName: string
  driftType: SchemaDriftType
  expected?: unknown
  actual?: unknown
}

export type SchemaDriftResult = {
  status: 'pass' | 'fail'
  blockingDrift: BlockingSchemaDrift[]
  coverageBacklog: string[]
  ignoredLegacyObjects: string[]
}

export type EvaluateSchemaDriftInput = {
  expectedTables: SchemaDriftExpectedTable[]
  actualTables: SchemaDriftActualTable[]
  coverageBacklog?: readonly string[]
  ignoredLegacyObjects?: readonly string[]
}

const POSTGRES_TYPE_CAST_PATTERN = /::(?:text|character varying|varchar|jsonb|json|uuid|integer|bigint|numeric|double precision|real|boolean|bool|date|timestamp with time zone|timestamp without time zone|regconfig|name)(?:\[\])?/g
const POSTGRES_TRAILING_TYPE_CAST_PATTERN = /::(?:text|character varying|varchar|jsonb|json|uuid|integer|bigint|numeric|double precision|real|boolean|bool|date|timestamp with time zone|timestamp without time zone)(?:\[\])?$/i

export function evaluateMigrationCheck(input: EvaluateMigrationCheckInput): MigrationCheckResult {
  const discoveredMigrations = [...input.discoveredMigrations]
  const appliedMigrations = [...input.appliedMigrations]
  const existingBaselineTables = [...(input.existingBaselineTables ?? [])]
  const ledgerAvailable = input.ledgerAvailable ?? true
  const adoptedBaselineFilenames = new Set((input.adoptedBaselineFilenames ?? []).map((filename) => filename.trim()).filter(Boolean))
  const checksumReconciliationsByFilename = new Map(
    (input.checksumReconciliations ?? []).map((record) => [record.filename.trim(), record]),
  )

  const appliedByFilename = new Map(appliedMigrations.map((migration) => [migration.filename, migration]))
  const discoveredByFilename = new Map(discoveredMigrations.map((migration) => [migration.filename, migration]))

  const pendingMigrations = discoveredMigrations.filter((migration) => !appliedByFilename.has(migration.filename))
  const orphanLedgerCandidates = appliedMigrations.filter((migration) => !discoveredByFilename.has(migration.filename))
  const adoptedBaselineLedgerRows = orphanLedgerCandidates.filter((migration) => adoptedBaselineFilenames.has(migration.filename))
  const orphanLedgerRows = orphanLedgerCandidates.filter((migration) => !adoptedBaselineFilenames.has(migration.filename))
  const rawChecksumMismatches = discoveredMigrations
    .map((migration) => {
      const applied = appliedByFilename.get(migration.filename)
      if (!applied) return null

      const expectedChecksum = normalizeChecksum(migration.checksum)
      const actualChecksum = normalizeChecksum(applied.checksum)
      if (expectedChecksum === actualChecksum) return null

      return {
        filename: migration.filename,
        version: migration.version,
        expectedChecksum,
        actualChecksum,
      } satisfies MigrationChecksumMismatch
    })
    .filter((item): item is MigrationChecksumMismatch => item !== null)
  const reconciledChecksumMismatches = rawChecksumMismatches.filter((mismatch) => {
    const record = checksumReconciliationsByFilename.get(mismatch.filename)
    return Boolean(
      record
      && record.version === mismatch.version
      && normalizeChecksum(record.currentFileChecksum) === mismatch.expectedChecksum
      && normalizeChecksum(record.appliedLedgerChecksum) === mismatch.actualChecksum
      && record.reviewedAt.trim()
      && record.reviewedBy.trim()
      && record.evidence.trim(),
    )
  })
  const reconciledFilenames = new Set(reconciledChecksumMismatches.map((mismatch) => mismatch.filename))
  const checksumMismatches = rawChecksumMismatches.filter((mismatch) => !reconciledFilenames.has(mismatch.filename))

  const duplicateVersions = findDuplicateVersions(discoveredMigrations)
  const unsafeBaselineReplayRisk = appliedMigrations.length === 0 && existingBaselineTables.length > 0

  const reasonCodes: string[] = []
  if (!ledgerAvailable) reasonCodes.push('schema_migrations_ledger_missing')
  if (pendingMigrations.length > 0) reasonCodes.push('pending_migrations_present')
  if (checksumMismatches.length > 0) reasonCodes.push('migration_checksum_mismatch')
  if (orphanLedgerRows.length > 0) reasonCodes.push('orphan_ledger_rows_present')
  if (duplicateVersions.length > 0) reasonCodes.push('duplicate_migration_versions_present')
  if (unsafeBaselineReplayRisk) reasonCodes.push('unsafe_baseline_replay_risk')

  return {
    status: reasonCodes.length === 0 ? 'pass' : 'fail',
    ledgerAvailable,
    pendingMigrations,
    checksumMismatches,
    reconciledChecksumMismatches,
    orphanLedgerRows,
    adoptedBaselineLedgerRows,
    duplicateVersions,
    unsafeBaselineReplayRisk,
    existingBaselineTables,
    reasonCodes,
  }
}

export function shouldFailMigrationCheckGate(
  result: Pick<MigrationCheckResult, 'reasonCodes' | 'existingBaselineTables'>,
  options: MigrationCheckGateOptions = {},
) {
  const allowedReasonCodes = new Set<string>()
  if (options.allowPendingMigrations) {
    allowedReasonCodes.add('pending_migrations_present')
    if (result.existingBaselineTables.length === 0) {
      allowedReasonCodes.add('schema_migrations_ledger_missing')
    }
  }

  return result.reasonCodes.some((reasonCode) => !allowedReasonCodes.has(reasonCode))
}

export function buildMigrationReleaseReadiness(result: MigrationCheckResult): MigrationReleaseReadiness {
  const structuralBlockingReasonCodes = result.reasonCodes.filter(
    (reasonCode) => reasonCode !== 'pending_migrations_present',
  )
  const hasStructuralBlockers = structuralBlockingReasonCodes.length > 0

  if (hasStructuralBlockers) {
    return {
      status: 'blocked_before_apply',
      safeToApplyPending: false,
      safeToEvaluateDrift: false,
      pendingCount: result.pendingMigrations.length,
      checksumMismatchCount: result.checksumMismatches.length,
      orphanLedgerRowCount: result.orphanLedgerRows.length,
      adoptedBaselineLedgerRowCount: result.adoptedBaselineLedgerRows.length,
      duplicateVersionCount: result.duplicateVersions.length,
      unsafeBaselineReplayRisk: result.unsafeBaselineReplayRisk,
      blockingReasonCodes: structuralBlockingReasonCodes,
      nextAction: 'resolve_structural_migration_history',
    }
  }

  if (result.pendingMigrations.length > 0) {
    return {
      status: 'ready_to_apply_pending',
      safeToApplyPending: true,
      safeToEvaluateDrift: false,
      pendingCount: result.pendingMigrations.length,
      checksumMismatchCount: result.checksumMismatches.length,
      orphanLedgerRowCount: result.orphanLedgerRows.length,
      adoptedBaselineLedgerRowCount: result.adoptedBaselineLedgerRows.length,
      duplicateVersionCount: result.duplicateVersions.length,
      unsafeBaselineReplayRisk: result.unsafeBaselineReplayRisk,
      blockingReasonCodes: [],
      nextAction: 'apply_pending_migrations',
    }
  }

  return {
    status: 'ready_for_schema_drift_check',
    safeToApplyPending: false,
    safeToEvaluateDrift: true,
    pendingCount: 0,
    checksumMismatchCount: result.checksumMismatches.length,
    orphanLedgerRowCount: result.orphanLedgerRows.length,
    adoptedBaselineLedgerRowCount: result.adoptedBaselineLedgerRows.length,
    duplicateVersionCount: result.duplicateVersions.length,
    unsafeBaselineReplayRisk: result.unsafeBaselineReplayRisk,
    blockingReasonCodes: [],
    nextAction: 'run_schema_drift_check',
  }
}

export function shouldFailMigrationReleaseReadinessGate(readiness: MigrationReleaseReadiness) {
  return readiness.status === 'blocked_before_apply'
}

export function evaluateSchemaDrift(input: EvaluateSchemaDriftInput): SchemaDriftResult {
  const ignoredLegacyObjects = [...(input.ignoredLegacyObjects ?? [])]
  const ignoredSet = new Set(ignoredLegacyObjects)
  const actualByTable = new Map(input.actualTables.map((table) => [table.tableName, table]))
  const expectedByTable = new Map(input.expectedTables.map((table) => [table.tableName, table]))
  const blockingDrift: BlockingSchemaDrift[] = []

  for (const expectedTable of input.expectedTables) {
    if (ignoredSet.has(expectedTable.tableName)) {
      continue
    }

    const actualTable = actualByTable.get(expectedTable.tableName)
    if (!actualTable) {
      blockingDrift.push({
        objectType: 'table',
        objectName: expectedTable.tableName,
        driftType: 'missing_actual_table',
        expected: 'present',
        actual: 'missing',
      })
      continue
    }

    compareColumns(expectedTable, actualTable, blockingDrift)
    compareConstraints(expectedTable, actualTable, blockingDrift)
    compareIndexes(expectedTable, actualTable, blockingDrift)
    compareRls(expectedTable, actualTable, blockingDrift)
  }

  for (const actualTable of input.actualTables) {
    if (expectedByTable.has(actualTable.tableName) || ignoredSet.has(actualTable.tableName)) {
      continue
    }

    blockingDrift.push({
      objectType: 'table',
      objectName: actualTable.tableName,
      driftType: 'unexpected_actual_table',
      expected: 'absent',
      actual: 'present',
    })
  }

  return {
    status: blockingDrift.length === 0 ? 'pass' : 'fail',
    blockingDrift,
    coverageBacklog: [...(input.coverageBacklog ?? [])],
    ignoredLegacyObjects,
  }
}

function compareConstraints(
  expectedTable: SchemaDriftExpectedTable,
  actualTable: SchemaDriftActualTable,
  blockingDrift: BlockingSchemaDrift[],
) {
  const expectedConstraints = expectedTable.constraints ?? []
  const actualConstraints = actualTable.constraints ?? []

  for (const expectedConstraint of expectedConstraints) {
    const actualConstraint = findConstraintByNameOrEquivalent(actualConstraints, expectedConstraint)
    const objectName = `${expectedTable.tableName}.${expectedConstraint.constraintName}`
    if (!actualConstraint) {
      blockingDrift.push({
        objectType: 'constraint',
        objectName,
        driftType: 'missing_actual_constraint',
        expected: expectedConstraint,
        actual: null,
      })
      continue
    }

    if (actualConstraint.constraintType !== expectedConstraint.constraintType) {
      blockingDrift.push({
        objectType: 'constraint',
        objectName,
        driftType: 'constraint_type_mismatch',
        expected: expectedConstraint.constraintType,
        actual: actualConstraint.constraintType,
      })
    }

    const actualDefinition = normalizeSchemaObjectDefinition(actualConstraint.definition)
    const expectedDefinition = normalizeSchemaObjectDefinition(expectedConstraint.definition)
    if (actualDefinition !== expectedDefinition) {
      blockingDrift.push({
        objectType: 'constraint',
        objectName,
        driftType: 'constraint_definition_mismatch',
        expected: expectedConstraint.definition,
        actual: actualConstraint.definition,
      })
    }
  }

  for (const actualConstraint of actualConstraints) {
    if (
      expectedConstraints.some((expectedConstraint) => postgresIdentifiersMatch(expectedConstraint.constraintName, actualConstraint.constraintName))
      || expectedConstraints.some((expectedConstraint) => constraintsAreEquivalent(expectedConstraint, actualConstraint))
    ) {
      continue
    }

    blockingDrift.push({
      objectType: 'constraint',
      objectName: `${actualTable.tableName}.${actualConstraint.constraintName}`,
      driftType: 'unexpected_actual_constraint',
      expected: null,
      actual: actualConstraint,
    })
  }
}

function findConstraintByNameOrEquivalent(
  actualConstraints: SchemaDriftConstraint[],
  expectedConstraint: SchemaDriftConstraint,
) {
  return actualConstraints.find((actualConstraint) => postgresIdentifiersMatch(expectedConstraint.constraintName, actualConstraint.constraintName))
    ?? actualConstraints.find((actualConstraint) => constraintsAreEquivalent(expectedConstraint, actualConstraint))
}

function constraintsAreEquivalent(
  expectedConstraint: SchemaDriftConstraint,
  actualConstraint: SchemaDriftConstraint,
) {
  return actualConstraint.constraintType === expectedConstraint.constraintType
    && normalizeSchemaObjectDefinition(actualConstraint.definition) === normalizeSchemaObjectDefinition(expectedConstraint.definition)
}

function compareIndexes(
  expectedTable: SchemaDriftExpectedTable,
  actualTable: SchemaDriftActualTable,
  blockingDrift: BlockingSchemaDrift[],
) {
  const expectedIndexes = expectedTable.indexes ?? []
  const actualIndexes = actualTable.indexes ?? []
  const actualByName = new Map(actualIndexes.map((index) => [index.indexName, index]))
  const expectedByName = new Map(expectedIndexes.map((index) => [index.indexName, index]))

  for (const expectedIndex of expectedIndexes) {
    const actualIndex = actualByName.get(expectedIndex.indexName)
    const objectName = `${expectedTable.tableName}.${expectedIndex.indexName}`
    if (!actualIndex) {
      blockingDrift.push({
        objectType: 'index',
        objectName,
        driftType: 'missing_actual_index',
        expected: expectedIndex,
        actual: null,
      })
      continue
    }

    if (!indexDefinitionsAreEquivalent(expectedIndex.definition, actualIndex.definition)) {
      blockingDrift.push({
        objectType: 'index',
        objectName,
        driftType: 'index_definition_mismatch',
        expected: expectedIndex.definition,
        actual: actualIndex.definition,
      })
    }
  }

  for (const actualIndex of actualIndexes) {
    if (expectedByName.has(actualIndex.indexName)) continue

    blockingDrift.push({
      objectType: 'index',
      objectName: `${actualTable.tableName}.${actualIndex.indexName}`,
      driftType: 'unexpected_actual_index',
      expected: null,
      actual: actualIndex,
    })
  }
}

function indexDefinitionsAreEquivalent(expectedDefinition: string, actualDefinition: string) {
  return normalizeSchemaObjectDefinition(actualDefinition) === normalizeSchemaObjectDefinition(expectedDefinition)
    || normalizeFunctionalIndexDefinition(actualDefinition) === normalizeFunctionalIndexDefinition(expectedDefinition)
}

function normalizeChecksum(value: string | null | undefined) {
  return value?.trim() || null
}

function findDuplicateVersions(migrations: MigrationSafetyRecord[]) {
  const filenamesByVersion = new Map<string, string[]>()
  for (const migration of migrations) {
    const filenames = filenamesByVersion.get(migration.version) ?? []
    filenames.push(migration.filename)
    filenamesByVersion.set(migration.version, filenames)
  }

  return Array.from(filenamesByVersion.entries())
    .filter(([, filenames]) => filenames.length > 1)
    .map(([version, filenames]) => ({
      version,
      filenames: [...filenames].sort((left, right) => left.localeCompare(right)),
    }))
}

function compareColumns(
  expectedTable: SchemaDriftExpectedTable,
  actualTable: SchemaDriftActualTable,
  blockingDrift: BlockingSchemaDrift[],
) {
  const actualColumns = new Map(actualTable.columns.map((column) => [column.columnName, column]))
  const expectedColumns = new Map(expectedTable.columns.map((column) => [column.columnName, column]))

  for (const expectedColumn of expectedTable.columns) {
    const actualColumn = actualColumns.get(expectedColumn.columnName)
    const objectName = `${expectedTable.tableName}.${expectedColumn.columnName}`
    if (!actualColumn) {
      blockingDrift.push({
        objectType: 'column',
        objectName,
        driftType: 'missing_actual_column',
        expected: expectedColumn,
        actual: null,
      })
      continue
    }

    if (normalizeColumnDataType(actualColumn.dataType) !== normalizeColumnDataType(expectedColumn.dataType)) {
      blockingDrift.push({
        objectType: 'column',
        objectName,
        driftType: 'column_type_mismatch',
        expected: expectedColumn.dataType,
        actual: actualColumn.dataType,
      })
    }

    if (actualColumn.nullable !== expectedColumn.nullable) {
      blockingDrift.push({
        objectType: 'column',
        objectName,
        driftType: 'column_nullable_mismatch',
        expected: expectedColumn.nullable,
        actual: actualColumn.nullable,
      })
    }

    if (normalizeDefaultExpression(actualColumn.defaultExpression) !== normalizeDefaultExpression(expectedColumn.defaultExpression)) {
      blockingDrift.push({
        objectType: 'column',
        objectName,
        driftType: 'column_default_mismatch',
        expected: expectedColumn.defaultExpression ?? null,
        actual: actualColumn.defaultExpression ?? null,
      })
    }
  }

  for (const actualColumn of actualTable.columns) {
    if (expectedColumns.has(actualColumn.columnName)) continue

    blockingDrift.push({
      objectType: 'column',
      objectName: `${actualTable.tableName}.${actualColumn.columnName}`,
      driftType: 'unexpected_actual_column',
      expected: null,
      actual: actualColumn,
    })
  }
}

function compareRls(
  expectedTable: SchemaDriftExpectedTable,
  actualTable: SchemaDriftActualTable,
  blockingDrift: BlockingSchemaDrift[],
) {
  const expectedRls = expectedTable.rls
  const actualRls = actualTable.rls
  if (!expectedRls && !actualRls) return

  const normalizedExpected = expectedRls ?? { enabled: false, forced: false, policies: [] }
  const normalizedActual = actualRls ?? { enabled: false, forced: false, policies: [] }

  if (normalizedExpected.enabled !== normalizedActual.enabled) {
    blockingDrift.push({
      objectType: 'rls',
      objectName: expectedTable.tableName,
      driftType: 'rls_enabled_mismatch',
      expected: normalizedExpected.enabled,
      actual: normalizedActual.enabled,
    })
  }

  if (normalizedExpected.forced !== normalizedActual.forced) {
    blockingDrift.push({
      objectType: 'rls',
      objectName: expectedTable.tableName,
      driftType: 'rls_forced_mismatch',
      expected: normalizedExpected.forced,
      actual: normalizedActual.forced,
    })
  }

  comparePolicies(expectedTable.tableName, normalizedExpected.policies, normalizedActual.policies, blockingDrift)
}

function comparePolicies(
  tableName: string,
  expectedPolicies: SchemaDriftPolicy[],
  actualPolicies: SchemaDriftPolicy[],
  blockingDrift: BlockingSchemaDrift[],
) {
  for (const expectedPolicy of expectedPolicies) {
    const actualPolicy = actualPolicies.find((policy) => postgresIdentifiersMatch(expectedPolicy.policyName, policy.policyName))
    const objectName = `${tableName}.${expectedPolicy.policyName}`
    if (!actualPolicy) {
      blockingDrift.push({
        objectType: 'rls_policy',
        objectName,
        driftType: 'missing_actual_policy',
        expected: expectedPolicy,
        actual: null,
      })
      continue
    }

    if (normalizePolicyCommand(actualPolicy.command) !== normalizePolicyCommand(expectedPolicy.command)) {
      blockingDrift.push({
        objectType: 'rls_policy',
        objectName,
        driftType: 'policy_command_mismatch',
        expected: expectedPolicy.command,
        actual: actualPolicy.command,
      })
    }

    if (normalizePolicyExpression(actualPolicy.usingExpression, tableName) !== normalizePolicyExpression(expectedPolicy.usingExpression, tableName)) {
      blockingDrift.push({
        objectType: 'rls_policy',
        objectName,
        driftType: 'policy_using_mismatch',
        expected: expectedPolicy.usingExpression ?? null,
        actual: actualPolicy.usingExpression ?? null,
      })
    }

    if (normalizePolicyExpression(actualPolicy.withCheckExpression, tableName) !== normalizePolicyExpression(expectedPolicy.withCheckExpression, tableName)) {
      blockingDrift.push({
        objectType: 'rls_policy',
        objectName,
        driftType: 'policy_with_check_mismatch',
        expected: expectedPolicy.withCheckExpression ?? null,
        actual: actualPolicy.withCheckExpression ?? null,
      })
    }
  }

  for (const actualPolicy of actualPolicies) {
    if (expectedPolicies.some((expectedPolicy) => postgresIdentifiersMatch(expectedPolicy.policyName, actualPolicy.policyName))) continue

    blockingDrift.push({
      objectType: 'rls_policy',
      objectName: `${tableName}.${actualPolicy.policyName}`,
      driftType: 'unexpected_actual_policy',
      expected: null,
      actual: actualPolicy,
    })
  }
}

function normalizeSqlText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!normalized) return null

  return stripWrappingParentheses(normalized)
}

function normalizePolicyCommand(value: string | null | undefined) {
  const normalized = normalizeSqlText(value)
  if (normalized === '*') return 'all'
  return normalized
}

function normalizeColumnDataType(value: string | null | undefined) {
  const normalized = normalizeSqlText(value)
  if (!normalized) return null

  const aliases: Record<string, string> = {
    varchar: 'text',
    'character varying': 'text',
    decimal: 'numeric',
    bool: 'boolean',
    int: 'integer',
    int4: 'integer',
    int8: 'bigint',
    timestamptz: 'timestamp with time zone',
    timestamp: 'timestamp without time zone',
    array: 'text[]',
  }

  return aliases[normalized] ?? normalized
}

function normalizeDefaultExpression(value: string | null | undefined) {
  const rawValue = value?.replace(/\s+/g, ' ').trim()
  const normalized = normalizeSqlText(value)
  if (!normalized) return null

  const withoutSimpleCast = normalized.replace(POSTGRES_TRAILING_TYPE_CAST_PATTERN, '')
  const rawWithoutSimpleCast = rawValue
    ? stripWrappingParentheses(rawValue).replace(POSTGRES_TRAILING_TYPE_CAST_PATTERN, '')
    : null
  const normalizedJsonDefault = rawWithoutSimpleCast ? normalizeJsonLiteralDefault(rawWithoutSimpleCast) : null
  if (normalizedJsonDefault) return normalizedJsonDefault

  if (withoutSimpleCast === 'current_timestamp' || withoutSimpleCast === 'now()') {
    return 'now()'
  }

  if (withoutSimpleCast === 'true' || withoutSimpleCast === 'false') {
    return withoutSimpleCast
  }

  if (/^null$/i.test(withoutSimpleCast)) {
    return null
  }

  return withoutSimpleCast
}

function normalizeJsonLiteralDefault(value: string) {
  const expression = stripWrappingParentheses(value)
  const match = expression.match(/^(?<literal>'(?:''|[^'])*')$/)
  if (!match?.groups?.literal) return null

  const jsonText = match.groups.literal.slice(1, -1).replace(/''/g, "'")
  if (!/^\s*[\[{]/.test(jsonText)) return null

  try {
    return `json:${stableJsonStringify(JSON.parse(jsonText))}`
  } catch {
    return null
  }
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`)
    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}

function normalizeSchemaObjectDefinition(value: string | null | undefined) {
  const normalizedText = normalizeSqlText(value)
  if (!normalizedText) return null

  if (/^check\s*\(/i.test(normalizedText)) {
    return normalizeCheckDefinition(normalizedText)
  }

  const normalized = normalizeSqlExpression(value)
    ?.replace(/\s+\)/g, ')')
    .replace(/\(\s+/g, '(')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+where\s+\(([^()]+)\)/g, ' where $1')

  if (!normalized) return null

  const schemaDefinition = normalized
    .replace(/\bunique\s+\(/g, 'unique(')
    .replace(/\bprimary\s+key\s+\(/g, 'primary key(')
    .replace(/\bforeign\s+key\s+\(/g, 'foreign key(')
    .replace(/\s+using\s+btree\s*\(/g, ' (')
    .replace(/\s+using\s+(btree|gin|gist|hash|spgist|brin)\s*\(/g, ' using $1 (')
    .replace(/\s+using\s+(gin|gist|hash|spgist|brin)\(/g, ' using $1 (')
    .replace(/\(([^()]+)\)/g, (_match, inner: string) => `(${inner.replace(/\s+/g, ' ').trim()})`)

  return finalizeSchemaObjectDefinition(normalizeDefinitionWhereClause(schemaDefinition))
}

function normalizeDefinitionWhereClause(value: string) {
  const whereMatch = value.match(/^(?<head>[\s\S]+?)\s+where\s+(?<predicate>[\s\S]+)$/i)
  if (!whereMatch?.groups?.head || !whereMatch.groups.predicate) return value

  const predicate = flattenBooleanExpressionParentheses(
    normalizeSqlExpression(whereMatch.groups.predicate) ?? whereMatch.groups.predicate.trim(),
  )
  return `${whereMatch.groups.head.trim()} where ${predicate}`
}

function finalizeSchemaObjectDefinition(value: string) {
  return value
    .replace(/\s+using\s+(gin|gist|hash|spgist|brin)\s+\(/g, ' using $1(')
}

function normalizeFunctionalIndexDefinition(value: string | null | undefined) {
  const normalized = normalizeSqlText(value)
  if (!normalized) return null

  const definition = normalized
    .replace(/\s+using\s+btree\s*\(/g, ' (')
    .replace(/\s+using\s+(gin|gist|hash|spgist|brin)\s*\(/g, ' using $1(')
    .replace(POSTGRES_TYPE_CAST_PATTERN, '')
    .replace(/\b(upper|lower)\(\(([^()]+)\)\)/gi, '$1($2)')
    .replace(/!~~/g, 'not like')
    .replace(/~~/g, 'like')
    .replace(/\(\s*([^()]+?)\s+and\s+([^()]+?)\s*\)/g, '$1 and $2')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalizeDefinitionWhereClause(definition)
}

function normalizePolicyExpression(value: string | null | undefined, tableName?: string) {
  let normalized = normalizeSqlExpression(value)
  if (!normalized || !tableName) return normalized

  const tablePrefixPattern = new RegExp(`\\b${escapeRegExp(tableName)}\\.`, 'g')
  let previousExpression = ''
  while (previousExpression !== normalized) {
    previousExpression = normalized
    normalized = normalizeSqlExpression(normalized.replace(tablePrefixPattern, '')) ?? normalized
  }

  return flattenBooleanExpressionParentheses(normalized)
}

function normalizeSqlExpression(value: string | null | undefined, options: { normalizeExists?: boolean } = {}) {
  const normalized = normalizeSqlText(value)
  if (!normalized) return null
  const normalizeExists = options.normalizeExists ?? true

  let expression = normalized
    .replace(/\bpublic\./g, '')
    .replace(/\bcurrent_user\b/gi, 'current_user')
    .replace(POSTGRES_TYPE_CAST_PATTERN, '')
    .replace(/'\s*::\s*text\b/g, "'")
    .replace(/\(\s*select\s+\(?\s*current_setting\('role',\s*true\)\s*=\s*'service_role'\s*\)?\s*\)/g, 'service_role()')
    .replace(/\bselect\s+\(?\s*current_setting\('role',\s*true\)\s*=\s*'service_role'\s*\)?/g, 'service_role()')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .replace(/!~~/g, 'not like')
    .replace(/~~/g, 'like')
    .replace(/\(([-+]?\d+(?:\.\d+)?)\)/g, '$1')

  expression = normalizeAnyArrayExpression(expression)
  expression = normalizeBetweenExpression(expression)

  let previousExpression = ''
  while (previousExpression !== expression) {
    previousExpression = expression
    expression = stripWrappingParentheses(expression)
      .replace(/\bcoalesce\(\s*\(\s*([a-zA-Z0-9_".]+)\s*\)\s*,/g, 'coalesce($1,')
      .replace(/\(\s*([a-zA-Z0-9_".]+)\s*\)\s*(=|<>|!=|>=|<=|>|<|is\s+distinct\s+from|is\s+not\s+distinct\s+from)\s*/g, '$1 $2 ')
      .replace(/\(\s*([a-zA-Z0-9_".]+)\s*(=|<>|!=|>=|<=|>|<)\s*([a-zA-Z0-9_".]+)\s*\)/g, '$1 $2 $3')
      .replace(/\(\s*([a-zA-Z0-9_".]+)\s*(=|<>|!=|>=|<=|>|<|is\s+distinct\s+from|is\s+not\s+distinct\s+from)\s*('[^']*'|[-+]?\d+(?:\.\d+)?)\s*\)/g, '$1 $2 $3')
      .replace(/\s*(=|<>|!=|>=|<=|>|<|is\s+distinct\s+from|is\s+not\s+distinct\s+from)\s*\(\s*([a-zA-Z0-9_".]+|[a-zA-Z0-9_".]+\([^()]*\))\s*\)/g, ' $1 $2')
      .replace(/\(\s*([a-zA-Z0-9_".]+|[a-zA-Z0-9_".]+\([^()]*\))\s*\)\s*=\s*\(\s*([a-zA-Z0-9_".]+|[a-zA-Z0-9_".]+\([^()]*\))\s*\)/g, '$1 = $2')
      .replace(/\(\s*([a-zA-Z0-9_".]+(?:\(\))?)\s*=\s*('[^']*'|[a-zA-Z0-9_.()]+)\s*\)/g, '$1 = $2')
      .replace(/\(\s*([a-zA-Z0-9_".]+\([^()]*\))\s*\)/g, '$1')
      .replace(/\(\s*([a-zA-Z0-9_".]+(?:\(\))?)\s+is\s+not\s+null\s*\)/g, '$1 is not null')
      .replace(/\(\s*([a-zA-Z0-9_".]+(?:\(\))?)\s+is\s+null\s*\)/g, '$1 is null')
      .replace(/\(\s*([a-zA-Z0-9_".]+(?:\(\))?)\s+in\s+\(([^()]+)\)\s*\)/g, '$1 in ($2)')
      .replace(/\(\s*([a-zA-Z_][a-zA-Z0-9_]*\([^()]+(?:\([^()]*\)[^()]*)?\))\s*\)/g, '$1')
      .replace(/\(\s*([^()]+?)\s+and\s+([^()]+?)\s*\)/g, '$1 and $2')
      .replace(/\(\s*([^()]+?)\s+or\s+([^()]+?)\s*\)/g, '$1 or $2')
      .replace(/\(\s*select\s+\(?\s*current_setting\('role',\s*true\)\s*=\s*'service_role'\s*\)?\s*\)/g, 'service_role()')
      .replace(/\bselect\s+\(?\s*current_setting\('role',\s*true\)\s*=\s*'service_role'\s*\)?/g, 'service_role()')
      .replace(/\s+or\s+/g, ' or ')
      .replace(/\s+and\s+/g, ' and ')
      .replace(/\s+/g, ' ')
      .trim()
    if (normalizeExists) {
      expression = normalizeExistsExpression(expression)
      expression = stripWrappedExistsCalls(expression)
    }
    expression = normalizeAnyArrayExpression(expression)
  }

  return balanceExpressionParentheses(expression)
}

function normalizeAnyArrayExpression(value: string) {
  return value
    .replace(
      /(?<column>\(?\s*[a-zA-Z0-9_".]+(?:\([^)]*\))?\s*\)?)\s*=\s*any\s*\(\s*\(*\s*array\[(?<values>[^\]]+)\]\s*\){1,2}/gi,
      (_match, column: string, values: string) => `${column.replace(/^\(+|\)+$/g, '').trim()} in (${values.replace(/\s*,\s*/g, ', ')})`,
    )
    .replace(
      /(?<column>\(?\s*[a-zA-Z0-9_".]+(?:\([^)]*\))?\s*\)?)\s*<>\s*all\s*\(\s*\(*\s*array\[(?<values>[^\]]+)\]\s*\){1,2}/gi,
      (_match, column: string, values: string) => `${column.replace(/^\(+|\)+$/g, '').trim()} not in (${values.replace(/\s*,\s*/g, ', ')})`,
    )
    .replace(
      /(?<column>[a-zA-Z0-9_".]+)\s+in\s+\((?<single>'[^']*')\)/gi,
      (_match, column: string, single: string) => `${column} = ${single}`,
    )
    .replace(/\barray\[(?<values>[^\]]+)\]/gi, (_match, values: string) => {
      const normalizedValues = values
        .replace(POSTGRES_TYPE_CAST_PATTERN, '')
        .replace(/\s*,\s*/g, ', ')
        .trim()
      return `array[${normalizedValues}]`
    })
}

function normalizeExistsExpression(value: string) {
  let result = ''
  let cursor = 0
  const existsPattern = /exists\s*\(/gi
  let match: RegExpExecArray | null

  while ((match = existsPattern.exec(value)) !== null) {
    const openParenIndex = existsPattern.lastIndex - 1
    const closeParenIndex = findMatchingParen(value, openParenIndex)
    if (closeParenIndex === -1) continue

    result += value.slice(cursor, match.index)
    const body = value.slice(openParenIndex + 1, closeParenIndex)
    const bodyMatch = body.match(/^\s*select\s+1\s+from\s+(?<fromClause>[\s\S]+?)\s+where\s+(?<predicate>[\s\S]+?)\s*$/i)

    if (!bodyMatch?.groups) {
      result += value.slice(match.index, closeParenIndex + 1)
    } else {
      let normalizedPredicate = normalizeSqlExpression(bodyMatch.groups.predicate.trim(), { normalizeExists: false })
        ?? stripWrappingParentheses(bodyMatch.groups.predicate.trim())
      normalizedPredicate = stripWrappingParentheses(normalizedPredicate)
        .replace(/\(\s*([a-zA-Z0-9_".]+|[a-zA-Z0-9_".]+\([^()]*\))\s*\)\s*=\s*\(\s*([a-zA-Z0-9_".]+|[a-zA-Z0-9_".]+\([^()]*\))\s*\)/g, '$1 = $2')
        .replace(/\(\s*([a-zA-Z0-9_".]+(?:\(\))?)\s*=\s*('[^']*'|[a-zA-Z0-9_.()]+)\s*\)/g, '$1 = $2')
        .replace(/\(\s*([a-zA-Z0-9_".]+(?:\(\))?)\s+in\s+\(([^()]+)\)\s*\)/g, '$1 in ($2)')
        .replace(/\b([a-zA-Z0-9_".]+(?:\(\))?)\s+in\s+\(([^()]+)\)/g, '$1 in ($2)')
        .replace(/\(\s*([^()]+?)\s+and\s+([^()]+?)\s*\)/g, '$1 and $2')
        .replace(/\s+and\s+/g, ' and ')
        .replace(/\s+or\s+/g, ' or ')
        .trim()
      normalizedPredicate = stripWrappingParentheses(normalizeAnyArrayExpression(normalizedPredicate))
      result += `exists (select 1 from ${normalizeFromClause(bodyMatch.groups.fromClause)} where ${normalizedPredicate})`
    }

    cursor = closeParenIndex + 1
    existsPattern.lastIndex = cursor
  }

  result += value.slice(cursor)
  return result
}

function normalizeFromClause(value: string) {
  let expression = stripWrappingParentheses(value
    .replace(/\bpublic\./gi, '')
    .replace(/\s+/g, ' ')
    .trim())

  let previousExpression = ''
  while (previousExpression !== expression) {
    previousExpression = expression
    expression = stripWrappingParentheses(expression)
      .replace(/\s+/g, ' ')
      .replace(/\s+join\s+/gi, ' join ')
      .replace(/\s+on\s+([\s\S]+)$/i, (_match, predicate: string) => {
        const normalizedPredicate = normalizeSqlExpression(predicate, { normalizeExists: false }) ?? predicate.trim()
        return ` on ${normalizedPredicate}`
      })
      .trim()
  }

  return expression
}

function stripWrappedExistsCalls(value: string) {
  let result = ''
  let cursor = 0

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '(') continue
    const closeParenIndex = findMatchingParen(value, index)
    if (closeParenIndex === -1) continue

    const inner = value.slice(index + 1, closeParenIndex).trim()
    if (!/^exists\s*\(/i.test(inner)) continue

    result += value.slice(cursor, index)
    result += inner
    cursor = closeParenIndex + 1
    index = closeParenIndex
  }

  result += value.slice(cursor)
  return result
}

function normalizeCheckDefinition(value: string) {
  const match = value.match(/^check\s*\((?<expression>[\s\S]+)\)\s*(?:not\s+valid)?$/i)
  if (!match?.groups?.expression) return value

  let expression = normalizeSqlExpression(match.groups.expression.trim()) ?? stripWrappingParentheses(match.groups.expression.trim())
  expression = stripWrappingParentheses(expression)
    .replace(/\bpublic\./g, '')
    .replace(POSTGRES_TYPE_CAST_PATTERN, '')
    .replace(/!~~/g, 'not like')
    .replace(/(?<![a-zA-Z0-9_])\(\s*([a-zA-Z0-9_".]+)\s*\)/g, '$1')
    .replace(/\(\s*(lower\([^)]+\))\s*\)/g, '$1')
    .replace(/lower\(\(([^()]+)\)\)/g, 'lower($1)')
    .replace(/\(([-+]?\d+(?:\.\d+)?)\)/g, '$1')
    .replace(/\s+or\s+/g, ' or ')
    .replace(/\s+and\s+/g, ' and ')

  expression = normalizeAnyArrayExpression(expression)
  expression = normalizeBetweenExpression(expression)

  expression = stripWrappingParentheses(expression
    .replace(/\(\s*([a-zA-Z0-9_".]+)\s*\)\s*(=|<>|!=|>=|<=|>|<|is\s+distinct\s+from|is\s+not\s+distinct\s+from)\s*/g, '$1 $2 ')
    .replace(/\s*(=|<>|!=|>=|<=|>|<|is\s+distinct\s+from|is\s+not\s+distinct\s+from)\s*\(\s*([a-zA-Z0-9_".]+|[a-zA-Z0-9_".]+\([^()]*\))\s*\)/g, ' $1 $2')
    .replace(/\(\s*([a-zA-Z0-9_".]+)\s+is\s+null\s*\)/g, '$1 is null')
    .replace(/\(\s*([a-zA-Z0-9_".]+)\s+in\s+\(([^()]+)\)\s*\)/g, '$1 in ($2)')
    .replace(/\(\s*([a-zA-Z0-9_".]+\s*\+\s*[a-zA-Z0-9_".]+)\s*(=|<>|!=|>=|<=|>|<)\s*([a-zA-Z0-9_".]+)\s*\)/g, '$1 $2 $3')
    .replace(/\b([a-zA-Z0-9_".]+)\s+in\s+\(([^()]+)\)/g, '$1 in ($2)')
    .replace(/\s+or\s+/g, ' or ')
    .replace(/\s+and\s+/g, ' and '))

  expression = stripWrappingParentheses(expression)
  let previousExpression = ''
  while (previousExpression !== expression) {
    previousExpression = expression
    expression = expression
      .replace(/\(\s*lower\(\(?([a-zA-Z0-9_".]+)\)?\)\s+not\s+like\s+('[^']*')\s*\)/g, 'lower($1) not like $2')
      .replace(/\bcoalesce\(\s*\(\s*([a-zA-Z0-9_".]+)\s*\)\s*,/g, 'coalesce($1,')
      .replace(/\(\s*([a-zA-Z0-9_".]+)\s*\)\s*(=|<>|!=|>=|<=|>|<|is\s+distinct\s+from|is\s+not\s+distinct\s+from)\s*/g, '$1 $2 ')
      .replace(/\s*(=|<>|!=|>=|<=|>|<|is\s+distinct\s+from|is\s+not\s+distinct\s+from)\s*\(\s*([a-zA-Z0-9_".]+|[a-zA-Z0-9_".]+\([^()]*\))\s*\)/g, ' $1 $2')
      .replace(/\(\s*([a-zA-Z0-9_".]+\([^()]*\))\s*\)/g, '$1')
      .replace(/lower\(\(?([a-zA-Z0-9_".]+)\)?\)/g, 'lower($1)')
      .replace(/\(([-+]?\d+(?:\.\d+)?)\)/g, '$1')
      .replace(
        /\(\s*([a-zA-Z0-9_".]+)\s*(=|<>|!=|>=|<=|>|<|not\s+like|like)\s*('[^']*'|[-+]?\d+(?:\.\d+)?|[a-zA-Z0-9_.()]+)\s*\)/g,
        '$1 $2 $3',
      )
      .replace(/\(\s*([a-zA-Z0-9_".]+)\s+is\s+null\s*\)/g, '$1 is null')
      .replace(/\(\s*([a-zA-Z0-9_".]+)\s+is\s+not\s+null\s*\)/g, '$1 is not null')
      .replace(/\(\s*([a-zA-Z0-9_".]+)\s+in\s+\(([^()]+)\)\s*\)/g, '$1 in ($2)')
      .replace(/\(\s*([a-zA-Z0-9_".]+\s*\+\s*[a-zA-Z0-9_".]+)\s*\)/g, '$1')
      .replace(/\(\s*([a-zA-Z0-9_".]+\s*\+\s*[a-zA-Z0-9_".]+)\s*(=|<>|!=|>=|<=|>|<)\s*([a-zA-Z0-9_".]+)\s*\)/g, '$1 $2 $3')
      .replace(/\b([a-zA-Z0-9_".]+)\s+in\s+\(([^()]+)\)/g, '$1 in ($2)')
      .replace(/\(\s*([^()]+?)\s+and\s+([^()]+?)\s*\)/g, '$1 and $2')
      .replace(/\(\s*([^()]+?)\s+or\s+([^()]+?)\s*\)/g, '$1 or $2')
      .replace(/\(\s*(lower\([^)]+\))\s*\)/g, '$1')
      .replace(/lower\(\(([^()]+)\)\)/g, 'lower($1)')
      .replace(/\s+or\s+/g, ' or ')
      .replace(/\s+and\s+/g, ' and ')
    expression = normalizeBetweenExpression(expression)
    expression = stripWrappingParentheses(expression)
  }

  return `check (${flattenBooleanExpressionParentheses(expression)})`
}

function flattenBooleanExpressionParentheses(value: string) {
  let expression = value
  let previousExpression = ''
  while (previousExpression !== expression) {
    previousExpression = expression
    expression = stripWrappingParentheses(expression)
      .replace(
        /\(\s*([a-zA-Z0-9_".]+)\s*(=|<>|!=|>=|<=|>|<|is\s+distinct\s+from|is\s+not\s+distinct\s+from|not\s+like|like)\s*('[^']*'|[-+]?\d+(?:\.\d+)?|[a-zA-Z0-9_.()]+)\s*\)/g,
        '$1 $2 $3',
      )
      .replace(
        /\(\s*([a-zA-Z_][a-zA-Z0-9_]*\([^()]*\))\s*(=|<>|!=|>=|<=|>|<|is\s+distinct\s+from|is\s+not\s+distinct\s+from|not\s+like|like)\s*('[^']*'|[-+]?\d+(?:\.\d+)?|[a-zA-Z0-9_.()]+)\s*\)/g,
        '$1 $2 $3',
      )
      .replace(/\(\s*([a-zA-Z0-9_".]+)\s+is\s+null\s*\)/g, '$1 is null')
      .replace(/\(\s*([a-zA-Z0-9_".]+)\s+is\s+not\s+null\s*\)/g, '$1 is not null')
      .replace(/\(\s*([a-zA-Z0-9_".]+\s*\+\s*[a-zA-Z0-9_".]+)\s*(=|<>|!=|>=|<=|>|<)\s*([a-zA-Z0-9_".]+)\s*\)/g, '$1 $2 $3')
      .replace(/\(\s*([^()]+?)\s+and\s+([^()]+?)\s*\)/g, '$1 and $2')
      .replace(/\(\s*([^()]+?)\s+or\s+([^()]+?)\s*\)/g, '$1 or $2')
      .replace(/\s+and\s+/g, ' and ')
      .replace(/\s+or\s+/g, ' or ')
      .trim()
  }
  return expression
}

function normalizeBetweenExpression(value: string) {
  return value.replace(
    /\b(?<column>[a-zA-Z0-9_".]+)\s+between\s+(?<lower>[-+]?\d+(?:\.\d+)?)\s+and\s+(?<upper>[-+]?\d+(?:\.\d+)?)/gi,
    (_match, column: string, lower: string, upper: string) => `${column} >= ${lower} and ${column} <= ${upper}`,
  )
}

function stripWrappingParentheses(value: string) {
  let text = value.trim()
  while (text.startsWith('(') && text.endsWith(')') && wrapsWholeExpression(text)) {
    text = text.slice(1, -1).trim()
  }
  return text
}

function balanceExpressionParentheses(value: string) {
  let text = value.trim()
  while (text.endsWith(')') && parenthesisBalance(text) < 0) {
    text = text.slice(0, -1).trim()
  }
  while (parenthesisBalance(text) > 0) {
    text = `${text})`
  }
  return text
}

function parenthesisBalance(value: string) {
  let balance = 0
  let inSingleQuote = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]

    if (inSingleQuote) {
      if (character === "'" && value[index + 1] === "'") {
        index += 1
        continue
      }
      if (character === "'") inSingleQuote = false
      continue
    }

    if (character === "'") {
      inSingleQuote = true
      continue
    }
    if (character === '(') balance += 1
    if (character === ')') balance -= 1
  }

  return balance
}

function wrapsWholeExpression(value: string) {
  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0 && index < value.length - 1) return false
    if (depth < 0) return false
  }

  return depth === 0
}

function findMatchingParen(value: string, openParenIndex: number) {
  let depth = 0
  for (let index = openParenIndex; index < value.length; index += 1) {
    const character = value[index]
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0) return index
  }

  return -1
}

function postgresIdentifiersMatch(expected: string, actual: string) {
  return expected === actual || expected.length > 63 && expected.slice(0, 63) === actual
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
