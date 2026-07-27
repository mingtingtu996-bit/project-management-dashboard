import { evaluateLegacyObjectDropCandidates, type LegacyObjectDropCandidate } from './legacyObjectDropGuardService.js'

export type ProductionMigrationGovernanceGateId =
  | 'MG-01'
  | 'MG-02'
  | 'MG-03'
  | 'MG-04'
  | 'MG-05'
  | 'MG-06'
  | 'MG-07'

export type ProductionMigrationGovernanceStatus =
  | 'blocked'
  | 'ready_for_closeout_readback'
  | 'closed'

export type ProductionMigrationClassification =
  | 'applied_and_ledgered'
  | 'materially_applied_unledgered'
  | 'manual_repair_requires_adoption'
  | 'not_applied_forward_apply'
  | 'obsolete_or_superseded'
  | 'ledgered_catalog_readback_required'
  | 'blocked_requires_admin_url'

export type ProductionMigrationRecord = {
  filename: string
  version?: string
  checksum?: string | null
}

export type ProductionMigrationRequiredEvidence = {
  filename: string
  owner?: string
  classification?: Extract<ProductionMigrationClassification, 'blocked_requires_admin_url' | 'obsolete_or_superseded'>
  schemaReadback?: boolean
  ledgered?: boolean
  materialSchemaPresent?: boolean
  adoptionEvidence?: {
    checksumVerified?: boolean
    objectReadback?: boolean
    constraintIndexReadback?: boolean
    rlsPolicyReadback?: boolean
    dataCompatibilityChecked?: boolean
    rollbackPlan?: boolean
  }
  forwardApplyEvidence?: {
    backup?: boolean
    dryRun?: boolean
    plan?: boolean
    apply?: boolean
    postApplyReadback?: boolean
    apiSmoke?: boolean
    rollbackPlan?: boolean
    advisorRescan?: boolean
  }
  handlingAction?: string
  evidenceLinks?: string[]
}

export type ProductionMigrationDropCandidate = {
  objectName: string
  classification?: string
  rowCount?: number | null
  dependencyScan?: {
    pass?: boolean
    dependencies?: string[]
  }
  structureExport?: {
    path?: string | null
  }
  migrationPlan?: {
    path?: string | null
  }
  rollbackPlan?: {
    path?: string | null
  }
  controlledDropMigration?: {
    filename?: string | null
  }
  postDropReadback?: {
    required?: boolean
    pass?: boolean
  }
}

export type ProductionMigrationGovernanceInput = {
  inventoryFrozen?: boolean
  inventorySnapshot?: {
    gitCommit?: string | null
    imageDigest?: string | null
    executedAt?: string | null
    operator?: string | null
  }
  localMigrations?: ProductionMigrationRecord[]
  remoteMigrations?: ProductionMigrationRecord[]
  cleanBundle?: {
    present?: boolean
    filename?: string
    includedFilenames?: string[]
  }
  ledger?: {
    available?: boolean
    rowCount?: number | null
    rows?: ProductionMigrationRecord[]
  }
  liveCatalog?: {
    baselineObjectCount?: number | null
    baselineObjects?: string[]
  }
  privilegedProbe?: {
    attempted?: boolean
    ok?: boolean
    migrationUrlConfigured?: boolean
    runtimeUrlSeparated?: boolean
    currentUser?: string | null
    sessionUser?: string | null
    rolBypassRls?: boolean
    pgIsInRecovery?: boolean
    failureCategory?: string | null
  }
  requiredMigrations?: ProductionMigrationRequiredEvidence[]
  schemaDrift?: {
    unexplainedDriftCount?: number
    orphanLedgerRows?: string[]
    duplicateVersions?: string[]
    checksumDriftRows?: string[]
    missingMigrationFiles?: string[]
    retiredColumnHardReads?: string[]
  }
  dropCandidateInventory?: {
    evaluated?: boolean
    noCandidates?: boolean
    source?: string | null
    generatedAt?: string | null
    operator?: string | null
    artifactPath?: string | null
  }
  dropCandidates?: ProductionMigrationDropCandidate[]
  closeoutReadback?: {
    schemaMigrationsRowCount?: number | null
    keyMigrationsLedgered?: string[]
    keyCatalogMatches?: boolean
    apiSmokePass?: boolean
    postgresErrorsStable?: boolean
    advisorPass?: boolean
    allowValidate?: boolean
    allowWarmup?: boolean
    allowScheduler?: boolean
  }
}

export type ProductionMigrationClassificationRow = {
  filename: string
  classification: ProductionMigrationClassification
  handlingAction: string
  owner?: string
  evidenceLinks: string[]
  adoptionEvidenceReady: boolean
  forwardApplyEvidenceReady: boolean
  reasonCodes: string[]
}

export type ProductionMigrationGovernanceGateResult = {
  id: ProductionMigrationGovernanceGateId
  name: string
  status: 'pass' | 'blocked'
  reasonCodes: string[]
}

export type ProductionMigrationGovernanceReport = {
  gate: 'production-migration-governance'
  status: ProductionMigrationGovernanceStatus
  gates: ProductionMigrationGovernanceGateResult[]
  classifications: ProductionMigrationClassificationRow[]
  allowValidate: boolean
  allowWarmup: boolean
  allowScheduler: boolean
}

export type ProductionMigrationRuntimeGateInput = {
  nodeEnv?: string
  shouldBootScheduler: boolean
  shouldWarmReadModelOnBoot: boolean
  expectedMigrationFilename?: string
  expectedMigrationChecksum?: string
  readMigrationLedgerEntry?: (filename: string) => Promise<ProductionMigrationRecord | null>
}

export type ProductionMigrationRuntimeGateResult = {
  status: 'pass' | 'blocked'
  allowScheduler: boolean
  allowWarmup: boolean
  reasonCodes: string[]
}

const REQUIRED_V14231_MIGRATIONS = [
  '246_v14231_advisor_public_rls_closeout.sql',
  '247_v14231_users_active_session_guard_columns.sql',
  '252_v14231_advisor_public_rls_remaining_closeout.sql',
  '253_v14231_advisor_public_rls_live_catalog_closeout.sql',
  '259_v14231_supabase_advisor_security_closeout.sql',
  '264_v14231_default_master_plan_runtime_publication_asset_kind.sql',
  '277_v14231_algorithm_asset_candidate_experience_tier.sql',
  '278_v14231_post277_advisor_security_rpc_acl_closeout.sql',
] as const
const GOVERNANCE_EVIDENCE_MAX_AGE_DAYS = 7
const GOVERNANCE_EVIDENCE_FUTURE_SKEW_MINUTES = 15

export function buildProductionMigrationGovernanceReport(
  input: ProductionMigrationGovernanceInput,
): ProductionMigrationGovernanceReport {
  const requiredFilenames = resolveRequiredV14231MigrationFilenames(input)
  const classifications = classifyRequiredMigrations(input)
  const gates: ProductionMigrationGovernanceGateResult[] = [
    evaluateInventoryGate(input, requiredFilenames),
    evaluateClassificationGate(classifications, requiredFilenames.length),
    evaluatePrivilegedProbeGate(input),
    evaluateAdoptionGate(classifications),
    evaluateForwardApplyGate(classifications),
    evaluateDriftAndDropGate(input),
    evaluateCloseoutReadbackGate(input, classifications),
  ]

  const failedGates = gates.filter((gate) => gate.status === 'blocked')
  const mg07 = gates.find((gate) => gate.id === 'MG-07')
  const status: ProductionMigrationGovernanceStatus = failedGates.length === 0
    ? 'closed'
    : failedGates.length === 1 && mg07?.status === 'blocked'
      ? 'ready_for_closeout_readback'
      : 'blocked'

  const mg01 = gates.find((gate) => gate.id === 'MG-01')
  const mg02 = gates.find((gate) => gate.id === 'MG-02')
  const mg03 = gates.find((gate) => gate.id === 'MG-03')
  const mg07Passed = mg07?.status === 'pass'

  return {
    gate: 'production-migration-governance',
    status,
    gates,
    classifications,
    allowValidate: input.closeoutReadback?.allowValidate === true
      || (mg01?.status === 'pass' && mg02?.status === 'pass' && mg03?.status === 'pass'),
    allowWarmup: mg07Passed && input.closeoutReadback?.allowWarmup === true,
    allowScheduler: mg07Passed && input.closeoutReadback?.allowScheduler === true,
  }
}

export async function evaluateProductionMigrationRuntimeGate(
  input: ProductionMigrationRuntimeGateInput,
): Promise<ProductionMigrationRuntimeGateResult> {
  const productionMode = input.nodeEnv === 'production'
  const gateRequired = productionMode && (input.shouldBootScheduler || input.shouldWarmReadModelOnBoot)

  if (!gateRequired) {
    return {
      status: 'pass',
      allowScheduler: input.shouldBootScheduler,
      allowWarmup: input.shouldWarmReadModelOnBoot,
      reasonCodes: [],
    }
  }

  const expectedFilename = input.expectedMigrationFilename?.trim() ?? ''
  const expectedChecksum = input.expectedMigrationChecksum?.trim() ?? ''
  if (!expectedFilename || !expectedChecksum || !input.readMigrationLedgerEntry) {
    return {
      status: 'blocked',
      allowScheduler: false,
      allowWarmup: false,
      reasonCodes: ['production_migration_runtime_attestation_required'],
    }
  }

  const reasonCodes: string[] = []
  let ledgerEntry: ProductionMigrationRecord | null = null
  try {
    ledgerEntry = await input.readMigrationLedgerEntry(expectedFilename)
  } catch {
    reasonCodes.push('production_migration_runtime_ledger_read_failed')
  }

  if (!ledgerEntry) {
    reasonCodes.push('production_migration_runtime_latest_migration_missing')
  } else {
    if (ledgerEntry.filename !== expectedFilename) {
      reasonCodes.push('production_migration_runtime_filename_mismatch')
    }
    if (!hasText(ledgerEntry.checksum) || ledgerEntry.checksum?.trim() !== expectedChecksum) {
      reasonCodes.push('production_migration_runtime_checksum_mismatch')
    }
  }

  const blocked = reasonCodes.length > 0
  return {
    status: blocked ? 'blocked' : 'pass',
    allowScheduler: input.shouldBootScheduler && !blocked,
    allowWarmup: input.shouldWarmReadModelOnBoot && !blocked,
    reasonCodes,
  }
}

function classifyRequiredMigrations(
  input: ProductionMigrationGovernanceInput,
): ProductionMigrationClassificationRow[] {
  const evidenceByFilename = new Map((input.requiredMigrations ?? []).map((item) => [item.filename, item]))
  const ledgeredFilenames = new Set(input.ledger?.rows?.map((row) => row.filename) ?? [])

  return resolveRequiredV14231MigrationFilenames(input).map((filename) => {
    const evidence = evidenceByFilename.get(filename)
    const ledgered = evidence?.ledgered === true || ledgeredFilenames.has(filename)
    const schemaReadback = evidence?.schemaReadback === true
    const materialSchemaPresent = evidence?.materialSchemaPresent === true || schemaReadback
    const reasonCodes: string[] = []

    let classification: ProductionMigrationClassification
    let handlingAction = evidence?.handlingAction?.trim() ?? ''

    if (evidence?.classification === 'blocked_requires_admin_url') {
      classification = 'blocked_requires_admin_url'
      handlingAction ||= 'block_until_privileged_migration_url_is_available'
      reasonCodes.push('blocked_requires_admin_url')
    } else if (evidence?.classification === 'obsolete_or_superseded') {
      classification = 'obsolete_or_superseded'
      handlingAction ||= 'retain_supersession_evidence_and_exclude_from_forward_apply'
      reasonCodes.push('obsolete_or_superseded')
    } else if (ledgered && schemaReadback) {
      classification = 'applied_and_ledgered'
      handlingAction ||= 'keep_ledger_and_catalog_under_closeout_readback'
    } else if (filename.startsWith('247_') && materialSchemaPresent && !ledgered) {
      classification = 'manual_repair_requires_adoption'
      handlingAction ||= 'prepare_controlled_baseline_adoption_after_checksum_and_readback'
      reasonCodes.push('manual_repair_requires_adoption')
    } else if (materialSchemaPresent && !ledgered) {
      classification = 'materially_applied_unledgered'
      handlingAction ||= 'prepare_controlled_baseline_adoption_after_checksum_and_readback'
      reasonCodes.push('materially_applied_unledgered')
    } else if (ledgered && !schemaReadback) {
      classification = 'ledgered_catalog_readback_required'
      handlingAction ||= 'restore_privileged_catalog_readback_before_closeout'
      reasonCodes.push('catalog_readback_required')
    } else if (!ledgered) {
      classification = 'not_applied_forward_apply'
      handlingAction ||= 'prepare_forward_apply_with_backup_plan_apply_and_readback'
      reasonCodes.push('not_applied_forward_apply')
    }

    return {
      filename,
      classification,
      handlingAction,
      owner: evidence?.owner,
      evidenceLinks: evidence?.evidenceLinks?.filter(Boolean) ?? [],
      adoptionEvidenceReady: isAdoptionEvidenceReady(evidence),
      forwardApplyEvidenceReady: isForwardApplyEvidenceReady(evidence),
      reasonCodes,
    }
  })
}

function resolveRequiredV14231MigrationFilenames(input: ProductionMigrationGovernanceInput) {
  const remoteFilenames = new Set((input.remoteMigrations ?? []).map((row) => row.filename))
  const required = new Set<string>(REQUIRED_V14231_MIGRATIONS)

  for (const migration of input.localMigrations ?? []) {
    if (isV14231Migration(migration.filename) && !remoteFilenames.has(migration.filename)) {
      required.add(migration.filename)
    }
  }

  for (const migration of input.requiredMigrations ?? []) {
    if (isV14231Migration(migration.filename)) {
      required.add(migration.filename)
    }
  }

  return Array.from(required).sort(compareMigrationFilenames)
}

function isV14231Migration(filename: string) {
  return /_v14231_/i.test(filename)
}

function compareMigrationFilenames(a: string, b: string) {
  return a.localeCompare(b, 'en', { numeric: true })
}

function evaluateInventoryGate(
  input: ProductionMigrationGovernanceInput,
  requiredFilenames: string[],
): ProductionMigrationGovernanceGateResult {
  const reasonCodes: string[] = []
  const localCount = input.localMigrations?.length ?? 0
  const remoteCount = input.remoteMigrations?.length ?? 0
  const ledgerRowCount = input.ledger?.rowCount
  const hasLiveCatalogInventory = input.liveCatalog !== undefined
    && (
      typeof input.liveCatalog.baselineObjectCount === 'number'
      || Array.isArray(input.liveCatalog.baselineObjects)
    )
  const baselineObjectCount = input.liveCatalog?.baselineObjectCount ?? input.liveCatalog?.baselineObjects?.length ?? 0

  if (input.inventoryFrozen !== true) reasonCodes.push('migration_input_freeze_required')
  if (!hasText(input.inventorySnapshot?.gitCommit)) reasonCodes.push('inventory_git_commit_missing')
  if (!hasText(input.inventorySnapshot?.imageDigest)) reasonCodes.push('inventory_image_digest_missing')
  if (!hasText(input.inventorySnapshot?.executedAt)) reasonCodes.push('inventory_executed_at_missing')
  reasonCodes.push(...validateGovernanceTimestamp('inventory_executed_at', input.inventorySnapshot?.executedAt))
  if (!hasText(input.inventorySnapshot?.operator)) reasonCodes.push('inventory_operator_missing')
  if (localCount === 0) reasonCodes.push('local_migration_inventory_missing')
  if (remoteCount === 0) reasonCodes.push('remote_migration_inventory_missing')
  if (input.cleanBundle?.present !== true) reasonCodes.push('clean_migration_bundle_inventory_missing')
  for (const filename of requiredFilenames) {
    if (input.cleanBundle?.present === true && !input.cleanBundle.includedFilenames?.includes(filename)) {
      reasonCodes.push(`${filename}:clean_bundle_entry_missing`)
    }
  }
  if (input.ledger?.available !== true) reasonCodes.push('public_schema_migrations_ledger_missing')
  if (ledgerRowCount === null || ledgerRowCount === undefined) reasonCodes.push('ledger_row_count_missing')
  if (!hasLiveCatalogInventory) reasonCodes.push('live_catalog_inventory_missing')
  if (input.ledger?.available === true && ledgerRowCount === 0 && baselineObjectCount > 0) {
    reasonCodes.push('ledger_reconciliation_required')
  }

  return gate('MG-01', 'migration_input_freeze', reasonCodes)
}

function evaluateClassificationGate(
  classifications: ProductionMigrationClassificationRow[],
  requiredMigrationCount: number,
): ProductionMigrationGovernanceGateResult {
  const reasonCodes: string[] = []
  if (classifications.length !== requiredMigrationCount) {
    reasonCodes.push('required_migration_classification_missing')
  }
  if (classifications.some((row) => !row.handlingAction.trim())) {
    reasonCodes.push('migration_handling_action_missing')
  }
  for (const row of classifications) {
    if (!hasText(row.owner)) reasonCodes.push(`${row.filename}:owner_missing`)
    if (row.evidenceLinks.length === 0) reasonCodes.push(`${row.filename}:evidence_link_missing`)
  }
  if (classifications.some((row) => row.classification === 'blocked_requires_admin_url')) {
    reasonCodes.push('migration_classification_blocked_requires_admin_url')
  }

  return gate('MG-02', 'migration_classification_table', reasonCodes)
}

function evaluatePrivilegedProbeGate(
  input: ProductionMigrationGovernanceInput,
): ProductionMigrationGovernanceGateResult {
  const probe = input.privilegedProbe
  const reasonCodes: string[] = []

  if (probe?.attempted !== true) reasonCodes.push('privileged_migration_probe_required')
  if (probe?.migrationUrlConfigured !== true) reasonCodes.push('privileged_migration_url_missing')
  if (probe?.ok !== true) reasonCodes.push(probe?.failureCategory || 'privileged_migration_probe_failed')
  if (probe?.runtimeUrlSeparated !== true) reasonCodes.push('runtime_and_migration_url_separation_required')
  if (probe?.pgIsInRecovery === true) reasonCodes.push('migration_database_in_recovery')
  if (!hasText(probe?.currentUser)) reasonCodes.push('privileged_probe_current_user_missing')
  if (!hasText(probe?.sessionUser)) reasonCodes.push('privileged_probe_session_user_missing')
  if (typeof probe?.rolBypassRls !== 'boolean') reasonCodes.push('privileged_probe_rolbypassrls_missing')
  if (probe?.rolBypassRls === false) reasonCodes.push('privileged_probe_rolbypassrls_required')

  return gate('MG-03', 'privileged_migration_url_probe', unique(reasonCodes))
}

function evaluateAdoptionGate(
  classifications: ProductionMigrationClassificationRow[],
): ProductionMigrationGovernanceGateResult {
  const reasonCodes: string[] = []
  const adoptionRows = classifications.filter(
    (row) => row.classification === 'manual_repair_requires_adoption'
      || row.classification === 'materially_applied_unledgered',
  )

  for (const row of adoptionRows) {
    if (!row.adoptionEvidenceReady) {
      reasonCodes.push(`${row.filename}:adoption_plan_required`)
    }
  }

  return gate('MG-04', 'baseline_adoption_plan', reasonCodes)
}

function evaluateForwardApplyGate(
  classifications: ProductionMigrationClassificationRow[],
): ProductionMigrationGovernanceGateResult {
  const reasonCodes: string[] = []
  const forwardRows = classifications.filter((row) => row.classification === 'not_applied_forward_apply')

  for (const row of forwardRows) {
    if (!row.forwardApplyEvidenceReady) {
      reasonCodes.push(`${row.filename}:forward_apply_plan_required`)
    }
  }

  return gate('MG-05', 'forward_apply_plan', reasonCodes)
}

function evaluateDriftAndDropGate(
  input: ProductionMigrationGovernanceInput,
): ProductionMigrationGovernanceGateResult {
  const reasonCodes: string[] = []
  const drift = input.schemaDrift

  if ((drift?.unexplainedDriftCount ?? 0) > 0) reasonCodes.push('unexplained_schema_drift_present')
  if ((drift?.orphanLedgerRows?.length ?? 0) > 0) reasonCodes.push('orphan_ledger_rows_present')
  if ((drift?.duplicateVersions?.length ?? 0) > 0) reasonCodes.push('duplicate_migration_versions_present')
  if ((drift?.checksumDriftRows?.length ?? 0) > 0) reasonCodes.push('checksum_drift_unexplained')
  if ((drift?.missingMigrationFiles?.length ?? 0) > 0) reasonCodes.push('missing_migration_files_present')
  if ((drift?.retiredColumnHardReads?.length ?? 0) > 0) reasonCodes.push('retired_column_hard_reads_present')

  const inventory = input.dropCandidateInventory
  if (inventory?.evaluated !== true) reasonCodes.push('drop_candidate_inventory_evaluation_missing')
  if (!hasText(inventory?.source)) reasonCodes.push('drop_candidate_inventory_source_missing')
  if (!hasText(inventory?.generatedAt)) reasonCodes.push('drop_candidate_inventory_generated_at_missing')
  reasonCodes.push(...validateGovernanceTimestamp('drop_candidate_inventory_generated_at', inventory?.generatedAt))
  if (!hasText(inventory?.operator)) reasonCodes.push('drop_candidate_inventory_operator_missing')
  if (!hasText(inventory?.artifactPath)) reasonCodes.push('drop_candidate_inventory_artifact_path_missing')

  if (!Array.isArray(input.dropCandidates)) {
    reasonCodes.push('drop_candidate_inventory_missing')
  } else if (input.dropCandidates.length === 0) {
    if (inventory?.noCandidates !== true) {
      reasonCodes.push('drop_candidate_no_candidate_attestation_missing')
    }
  } else if (inventory?.noCandidates === true) {
    reasonCodes.push('drop_candidate_inventory_conflicts_with_drop_candidates')
  }

  for (const candidate of input.dropCandidates ?? []) {
    const evaluation = evaluateLegacyObjectDropCandidates([toLegacyDropCandidate(candidate)])[0]
    reasonCodes.push(...evaluation.reasons.map((reason) => `${candidate.objectName}:${reason}`))
  }

  return gate('MG-06', 'drift_orphan_checksum_drop_guard', unique(reasonCodes))
}

function evaluateCloseoutReadbackGate(
  input: ProductionMigrationGovernanceInput,
  classifications: ProductionMigrationClassificationRow[],
): ProductionMigrationGovernanceGateResult {
  const readback = input.closeoutReadback
  const reasonCodes: string[] = []

  if (!readback) {
    return gate('MG-07', 'closeout_readback', ['closeout_readback_required'])
  }

  const ledgered = new Set(readback.keyMigrationsLedgered ?? [])
  for (const row of classifications) {
    if (row.classification === 'obsolete_or_superseded') continue
    if (!ledgered.has(row.filename)) {
      reasonCodes.push(`${row.filename}:closeout_ledger_readback_missing`)
    }
  }
  if ((readback.schemaMigrationsRowCount ?? 0) <= 0) reasonCodes.push('schema_migrations_closeout_row_count_missing')
  if (readback.keyCatalogMatches !== true) reasonCodes.push('catalog_closeout_readback_missing')
  if (readback.apiSmokePass !== true) reasonCodes.push('api_smoke_missing')
  if (readback.postgresErrorsStable !== true) reasonCodes.push('postgres_error_trend_not_stable')
  if (readback.advisorPass !== true) reasonCodes.push('live_advisor_rescan_missing')

  return gate('MG-07', 'closeout_readback', unique(reasonCodes))
}

function evaluateDropCandidateMissingEvidence(candidate: ProductionMigrationDropCandidate) {
  const reasonCodes: string[] = []
  const dependencies = candidate.dependencyScan?.dependencies ?? []

  if (candidate.classification !== 'obsolete_or_superseded') reasonCodes.push('obsolete_or_superseded_classification_required')
  if (candidate.rowCount !== 0) reasonCodes.push('zero_row_count_required')
  if (candidate.rowCount === 0) reasonCodes.push('row_count_zero_not_sufficient')
  if (candidate.dependencyScan?.pass !== true) reasonCodes.push('dependency_scan_required')
  if (dependencies.length > 0) reasonCodes.push('runtime_or_schema_dependencies_present')
  if (!candidate.structureExport?.path?.trim()) reasonCodes.push('structure_export_required')
  if (!candidate.rollbackPlan?.path?.trim()) reasonCodes.push('rollback_plan_required')
  if (!candidate.controlledDropMigration?.filename?.trim()) reasonCodes.push('controlled_drop_migration_required')
  if (candidate.postDropReadback?.required !== true) reasonCodes.push('post_drop_readback_required')
  if (candidate.postDropReadback?.required === true && candidate.postDropReadback.pass !== true) {
    reasonCodes.push('post_drop_readback_pass_required')
  }

  return reasonCodes.filter((reason) => reason !== 'row_count_zero_not_sufficient' || reasonCodes.length > 1)
}

function gate(
  id: ProductionMigrationGovernanceGateId,
  name: string,
  reasonCodes: string[],
): ProductionMigrationGovernanceGateResult {
  const uniqueReasons = unique(reasonCodes)
  return {
    id,
    name,
    status: uniqueReasons.length === 0 ? 'pass' : 'blocked',
    reasonCodes: uniqueReasons,
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function isAdoptionEvidenceReady(evidence?: ProductionMigrationRequiredEvidence) {
  const adoption = evidence?.adoptionEvidence
  return adoption?.checksumVerified === true
    && adoption.objectReadback === true
    && adoption.constraintIndexReadback === true
    && adoption.rlsPolicyReadback === true
    && adoption.dataCompatibilityChecked === true
    && adoption.rollbackPlan === true
}

function isForwardApplyEvidenceReady(evidence?: ProductionMigrationRequiredEvidence) {
  const forward = evidence?.forwardApplyEvidence
  return forward?.backup === true
    && forward.dryRun === true
    && forward.plan === true
    && forward.apply === true
    && forward.postApplyReadback === true
    && forward.apiSmoke === true
    && forward.rollbackPlan === true
    && forward.advisorRescan === true
}

function toLegacyDropCandidate(candidate: ProductionMigrationDropCandidate): LegacyObjectDropCandidate {
  return {
    objectName: candidate.objectName,
    classification: candidate.classification,
    rowCount: candidate.rowCount,
    dependencyScan: { pass: candidate.dependencyScan?.pass },
    structureExport: candidate.structureExport,
    migrationPlan: candidate.migrationPlan,
    rollbackPlan: candidate.rollbackPlan,
    controlledDropMigration: candidate.controlledDropMigration,
    postDropReadback: candidate.postDropReadback,
    dependencies: candidate.dependencyScan?.dependencies?.length
      ? { schema: candidate.dependencyScan.dependencies }
      : undefined,
  }
}

function hasText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateGovernanceTimestamp(prefix: string, value: string | null | undefined) {
  if (!hasText(value)) return []
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return [`${prefix}_invalid`]
  const now = new Date()
  const futureLimit = new Date(now)
  futureLimit.setUTCMinutes(futureLimit.getUTCMinutes() + GOVERNANCE_EVIDENCE_FUTURE_SKEW_MINUTES)
  const staleLimit = new Date(now)
  staleLimit.setUTCDate(staleLimit.getUTCDate() - GOVERNANCE_EVIDENCE_MAX_AGE_DAYS)
  const reasons: string[] = []
  if (timestamp.getTime() > futureLimit.getTime()) {
    reasons.push(`${prefix}_future`)
  }
  if (timestamp.getTime() < staleLimit.getTime()) {
    reasons.push(`${prefix}_stale`)
  }
  return reasons
}
