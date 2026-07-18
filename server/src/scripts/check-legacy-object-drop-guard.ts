import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createBlockedSafeLegacyObjectDropReport,
  evaluateLegacyObjectDropGuardReport,
  type LegacyObjectDropCandidate,
  type LegacyObjectDropEvaluation,
  type LegacyObjectDropGuardReport,
} from '../services/legacyObjectDropGuardService.js'
import {
  buildLegacyObjectDropCandidatesFromDisposition,
  type RetiredObjectDispositionSummary,
} from '../services/legacyObjectDispositionLedgerService.js'

export type LegacyObjectDropGuardCheckResult = {
  report: LegacyObjectDropGuardReport
  exitCode: 0 | 1
}

type RetiredObjectReferenceAuditResult = {
  status?: string
  objectSummaries?: RetiredObjectDispositionSummary[]
}

export async function runLegacyObjectDropGuardCheck(
  argv: string[] = process.argv.slice(2),
  options: {
    readTextFile?: (path: string) => Promise<string>
    fileExists?: (path: string) => Promise<boolean>
    listMigrationFiles?: (directory: string) => Promise<string[]>
    readMigrationFile?: (path: string) => Promise<string>
    auditRetiredObjectReferences?: () => RetiredObjectReferenceAuditResult
    writeTextFile?: (path: string, text: string) => Promise<void>
    writeOutput?: (message: string) => void
  } = {},
): Promise<LegacyObjectDropGuardCheckResult> {
  const candidatesFile = readCandidatesFileArg(argv)
  const allowCiNoDropCandidates = argv.includes('--ci-no-drop-candidates-ok')
  const scanMigrationDrops = argv.includes('--scan-migration-drops')
  const fromRetiredObjectAudit = argv.includes('--from-retired-object-audit')
  const requireArchivedEvidence = argv.includes('--require-archived-evidence')
  const allowTargetCatalogPreflight = argv.includes('--allow-target-catalog-preflight')

  try {
    const readTextFile = options.readTextFile ?? ((path: string) => readFile(path, 'utf8'))
    const candidates = candidatesFile
      ? parseCandidatesFile(await readTextFile(candidatesFile))
      : []
    if (fromRetiredObjectAudit) {
      candidates.push(...await readRetiredObjectDropCandidates(options))
    }

    const evaluatedCandidates = requireArchivedEvidence
      ? await requireArchivedEvidenceFiles(candidates, argv, options)
      : candidates

    const migrationDrops = scanMigrationDrops
      ? await scanMigrationDropStatements(argv, options)
      : []

    if (migrationDrops.length > 0) {
      return outputResult(
        argv,
        evaluateDropGuardReportWithMigrationDrops(
          evaluatedCandidates,
          migrationDrops,
          { deferIdempotentDrops: allowTargetCatalogPreflight },
        ),
        options,
        { allowNeedsGating: allowTargetCatalogPreflight },
      )
    }

    if (evaluatedCandidates.length > 0) {
      return outputResult(argv, evaluateLegacyObjectDropGuardReport(evaluatedCandidates), options)
    }

    const report = createBlockedSafeLegacyObjectDropReport('row_count_zero_not_sufficient')
    await outputGuardReport(argv, report, options)
    return { report, exitCode: allowCiNoDropCandidates ? 0 : 1 }
  } catch (error) {
    const report = {
      ...createBlockedSafeLegacyObjectDropReport('row_count_zero_not_sufficient'),
      error: error instanceof Error ? error.message : 'Unable to read candidates file',
    }
    await outputGuardReport(argv, report, options)
    return { report, exitCode: 1 }
  }
}

async function requireArchivedEvidenceFiles(
  candidates: LegacyObjectDropCandidate[],
  argv: string[],
  options: {
    fileExists?: (path: string) => Promise<boolean>
  },
): Promise<LegacyObjectDropCandidate[]> {
  const migrationsDir = readMigrationsDirArg(argv)
  const fileExists = options.fileExists ?? defaultFileExists

  return Promise.all(candidates.map(async (candidate) => {
    const next: LegacyObjectDropCandidate = {
      ...candidate,
      dependencyScan: candidate.dependencyScan ? { ...candidate.dependencyScan } : undefined,
      structureExport: candidate.structureExport ? { ...candidate.structureExport } : undefined,
      migrationPlan: candidate.migrationPlan ? { ...candidate.migrationPlan } : undefined,
      rollbackPlan: candidate.rollbackPlan ? { ...candidate.rollbackPlan } : undefined,
      controlledDropMigration: candidate.controlledDropMigration ? { ...candidate.controlledDropMigration } : undefined,
      postDropReadback: candidate.postDropReadback ? { ...candidate.postDropReadback } : undefined,
      catalogReadback: candidate.catalogReadback ? { ...candidate.catalogReadback } : undefined,
      dependencyReadback: candidate.dependencyReadback ? { ...candidate.dependencyReadback } : undefined,
      postDropApiSmoke: candidate.postDropApiSmoke ? { ...candidate.postDropApiSmoke } : undefined,
    }

    if (!await archivedPathExists(next.structureExport?.path, fileExists)) {
      next.structureExport = { ...next.structureExport, path: null }
    }

    if (!await archivedPathExists(next.migrationPlan?.path, fileExists)) {
      next.migrationPlan = { ...next.migrationPlan, path: null }
    }

    if (!await archivedPathExists(next.rollbackPlan?.path, fileExists)) {
      next.rollbackPlan = { ...next.rollbackPlan, path: null }
    }

    if (next.dependencyScan?.pass === true && !await archivedPathExists(next.dependencyScan.evidencePath, fileExists)) {
      next.dependencyScan = { ...next.dependencyScan, pass: false }
    }

    if (next.postDropReadback?.pass === true && !await archivedPathExists(next.postDropReadback.evidencePath, fileExists)) {
      next.postDropReadback = { ...next.postDropReadback, pass: false }
    }

    if (next.catalogReadback?.pass === true && !await archivedPathExists(next.catalogReadback.path, fileExists)) {
      next.catalogReadback = { ...next.catalogReadback, pass: false }
    }

    if (next.dependencyReadback?.pass === true && !await archivedPathExists(next.dependencyReadback.path, fileExists)) {
      next.dependencyReadback = { ...next.dependencyReadback, pass: false }
    }

    if (next.postDropApiSmoke?.pass === true && !await archivedPathExists(next.postDropApiSmoke.path, fileExists)) {
      next.postDropApiSmoke = { ...next.postDropApiSmoke, pass: false }
    }

    const controlledDropMigrationExists = await controlledDropMigrationFileExists(
      next.controlledDropMigration?.filename,
      migrationsDir,
      fileExists,
    )
    if (!controlledDropMigrationExists) {
      next.controlledDropMigration = { ...next.controlledDropMigration, filename: null }
    }

    return next
  }))
}

async function archivedPathExists(
  path: string | null | undefined,
  fileExists: (path: string) => Promise<boolean>,
) {
  return hasText(path) && await fileExists(path)
}

async function controlledDropMigrationFileExists(
  filename: string | null | undefined,
  migrationsDir: string,
  fileExists: (path: string) => Promise<boolean>,
) {
  if (!hasText(filename)) return false
  if (await fileExists(filename)) return true
  if (!filename.includes('/') && !filename.includes('\\')) {
    return fileExists(join(migrationsDir, filename))
  }
  return false
}

async function defaultFileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function readCandidatesFileArg(argv: string[]) {
  const index = argv.indexOf('--candidates-file')
  const value = index >= 0 ? argv[index + 1] : undefined
  return value && !value.startsWith('--') ? value : null
}

export function readMigrationsDirArg(argv: string[]) {
  const index = argv.indexOf('--migrations-dir')
  const value = index >= 0 ? argv[index + 1] : undefined
  return value && !value.startsWith('--') ? value : 'migrations'
}

export function readMigrationDropBaselineVersionArg(argv: string[]) {
  const index = argv.indexOf('--migration-drop-baseline-version')
  const value = index >= 0 ? argv[index + 1] : undefined
  const parsed = value && !value.startsWith('--') ? Number.parseInt(value, 10) : 247
  return Number.isFinite(parsed) ? parsed : 247
}

export function readOutputFileArg(argv: string[]) {
  const index = argv.indexOf('--output-file')
  const value = index >= 0 ? argv[index + 1] : undefined
  return value && !value.startsWith('--') ? value : null
}

export function parseCandidatesFile(rawJson: string): LegacyObjectDropCandidate[] {
  const parsed = JSON.parse(rawJson.replace(/^\uFEFF/, '')) as unknown

  if (Array.isArray(parsed)) {
    return parsed as LegacyObjectDropCandidate[]
  }

  if (isRecord(parsed) && Array.isArray(parsed.candidates)) {
    return parsed.candidates as LegacyObjectDropCandidate[]
  }

  return []
}

export type MigrationDropStatement = {
  migrationFile: string
  objectName: string
  objectType: string
  line: number
  ifExists: boolean
}

export type MigrationCreatedObject = {
  migrationFile: string
  objectName: string
  objectType: string
  line: number
}

const GOVERNED_NON_LEGACY_MIGRATION_DROPS = [
  ...[
    'progress_knowledge_sources',
    'progress_knowledge_documents',
    'progress_asset_candidates',
    'progress_asset_calibration_runs',
    'progress_asset_calibration_results',
    'progress_asset_publication_readiness',
  ].map((tableName) => ({
    migrationFile: '311_retire_product_runtime_progress_knowledge_governance.sql',
    objectType: 'table',
    objectName: `public.${tableName}`,
    reason: 'Migration 311 uses an immutable export checksum, locked data fingerprint preflight, and full schema/data rollback instead of the legacy-object retirement evidence model.',
  })),
  {
    migrationFile: '316_task_fact_write_integrity.sql',
    objectType: 'trigger',
    objectName: 'public.tasks.trigger_auto_record_snapshot',
    reason: 'Migration 316 retires the duplicate database progress-snapshot writer after preserving the application writer and provides an explicit rollback.',
  },
  {
    migrationFile: '316_task_fact_write_integrity.sql',
    objectType: 'function',
    objectName: 'public.auto_record_progress_snapshot()',
    reason: 'Migration 316 retires the trigger-only helper after preserving the application writer and provides an explicit rollback.',
  },
  ...[
    't2_rhythm_schedule_runtime_events',
    't2_rhythm_schedule_runtime_publications',
  ].map((tableName) => ({
    migrationFile: '321_retire_duplicate_t2_schedule_runtime.sql',
    objectType: 'table',
    objectName: `public.${tableName}`,
    reason: 'Migration 321 uses an immutable export checksum, locked data fingerprint preflight, active-publication guard, and full schema/data rollback.',
  })),
  {
    migrationFile: '259_v14231_supabase_advisor_security_closeout.sql',
    objectType: 'policy',
    objectName: 'public.project_health_history.health_history_select',
    reason: 'Supabase Advisor security closeout replaces permissive health-history policies; not an old-object physical data drop.',
  },
  {
    migrationFile: '259_v14231_supabase_advisor_security_closeout.sql',
    objectType: 'policy',
    objectName: 'public.project_health_history.health_history_insert',
    reason: 'Supabase Advisor security closeout replaces permissive health-history policies; not an old-object physical data drop.',
  },
  {
    migrationFile: '259_v14231_supabase_advisor_security_closeout.sql',
    objectType: 'policy',
    objectName: 'public.project_health_history.health_history_update',
    reason: 'Supabase Advisor security closeout replaces permissive health-history policies; not an old-object physical data drop.',
  },
  {
    migrationFile: '263_v14232_migration_replay_drift_closeout.sql',
    objectType: 'constraint',
    objectName: 'public.tasks.fk_tasks_milestone_id',
    reason: 'Migration replay drift closeout removes stale milestone foreign-key shapes; not an old-object physical data drop.',
  },
  {
    migrationFile: '263_v14232_migration_replay_drift_closeout.sql',
    objectType: 'constraint',
    objectName: 'public.tasks.tasks_milestone_id_fkey',
    reason: 'Migration replay drift closeout removes stale milestone foreign-key shapes; not an old-object physical data drop.',
  },
]

async function readRetiredObjectDropCandidates(
  options: {
    auditRetiredObjectReferences?: () => RetiredObjectReferenceAuditResult
  },
) {
  const auditRetiredObjectReferences = options.auditRetiredObjectReferences
    ?? (await import('../../scripts/audit-retired-object-references.mjs')).auditRetiredObjectReferences
  const result = auditRetiredObjectReferences() as RetiredObjectReferenceAuditResult
  if (result.status && result.status !== 'pass') {
    return [{
      objectName: 'retired_object_reference_audit',
      classification: 'blocked',
      rowCount: null,
      dependencyScan: { pass: false },
      postDropReadback: { required: true, pass: false },
      dependencies: {
        runtime: ['retired_object_reference_audit_failed'],
      },
    }]
  }
  return buildLegacyObjectDropCandidatesFromDisposition(
    (result.objectSummaries ?? []).filter((summary) => (
      summary.deletionReadiness === 'physical_delete_candidate_after_migration_ledger_review'
    )),
  )
}

async function scanMigrationDropStatements(
  argv: string[],
  options: {
    listMigrationFiles?: (directory: string) => Promise<string[]>
    readMigrationFile?: (path: string) => Promise<string>
  },
): Promise<MigrationDropStatement[]> {
  const migrationsDir = readMigrationsDirArg(argv)
  const baselineVersion = readMigrationDropBaselineVersionArg(argv)
  const listMigrationFiles = options.listMigrationFiles ?? (async (directory: string) => (
    await readdir(directory)
  ))
  const readMigrationFile = options.readMigrationFile ?? ((path: string) => readFile(path, 'utf8'))

  const files = (await listMigrationFiles(migrationsDir))
    .filter((filename) => filename.endsWith('.sql'))
    .filter((filename) => isPostBaselineMigration(filename, baselineVersion))
  const drops: MigrationDropStatement[] = []

  for (const filename of files) {
    const filePath = filename.includes('/') || filename.includes('\\')
      ? filename
      : join(migrationsDir, filename)
    const sql = await readMigrationFile(filePath)
    drops.push(
      ...extractPhysicalDropStatements(sql, basename(filename))
        .filter((drop) => !isGovernedNonLegacyMigrationDrop(drop)),
    )
  }

  return drops
}

function isGovernedNonLegacyMigrationDrop(drop: MigrationDropStatement) {
  return GOVERNED_NON_LEGACY_MIGRATION_DROPS.some((entry) => (
    entry.migrationFile.toLowerCase() === canonicalMigrationFilename(drop.migrationFile)
    && entry.objectType.toLowerCase() === drop.objectType.toLowerCase()
    && canonicalObjectName(entry.objectName) === canonicalObjectName(drop.objectName)
  ))
}

export function isPostBaselineMigration(filename: string, baselineVersion = 247) {
  const migrationName = basename(filename)
  const leadingVersion = /^(\d+)(?:[a-z])?_/.exec(migrationName)?.[1]
  if (!leadingVersion) return false
  const numericVersion = Number.parseInt(leadingVersion, 10)
  if (!Number.isFinite(numericVersion)) return false
  return numericVersion > baselineVersion
}

export function extractPhysicalDropStatements(sql: string, migrationFile = 'inline.sql'): MigrationDropStatement[] {
  const drops: MigrationDropStatement[] = []
  const recreatedObjects = new Set<string>()

  for (const statement of splitSqlStatements(sql)) {
    drops.push(...extractDropObjectStatements(statement.text, migrationFile, statement.line))
    drops.push(...extractAlterTableDropStatements(statement.text, migrationFile, statement.line))
    for (const recreatedObject of extractRecreatedObjects(statement.text)) {
      recreatedObjects.add(recreatedObjectKey(recreatedObject))
    }
  }

  return drops.filter((drop) => !recreatedObjects.has(dropStatementKey(drop)))
}

export function extractCreatedObjectStatements(
  sql: string,
  migrationFile = 'inline.sql',
): MigrationCreatedObject[] {
  const created: MigrationCreatedObject[] = []
  for (const statement of splitSqlStatements(sql)) {
    for (const object of extractRecreatedObjects(statement.text)) {
      created.push({
        migrationFile,
        objectType: object.objectType,
        objectName: object.objectName,
        line: statement.line,
      })
    }
  }
  return created
}

function splitSqlStatements(sql: string) {
  const statements: Array<{ text: string, line: number }> = []
  let current = ''
  let currentLine = 1
  let line = 1
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (!inSingleQuote && !inDoubleQuote && char === '-' && next === '-') {
      while (index < sql.length && sql[index] !== '\n') index += 1
      if (index < sql.length) {
        current += '\n'
        line += 1
      }
      continue
    }

    if (char === '\n') line += 1
    if (!current.trim() && char.trim()) currentLine = line
    if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
    if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote

    if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      if (current.trim()) statements.push({ text: current.trim(), line: currentLine })
      current = ''
      currentLine = line
      continue
    }
    current += char
  }

  if (current.trim()) statements.push({ text: current.trim(), line: currentLine })
  return statements
}

function extractDropObjectStatements(statement: string, migrationFile: string, line: number): MigrationDropStatement[] {
  const drops: MigrationDropStatement[] = []
  const normalized = normalizeSqlWhitespace(statement)
  const ifExists = /^DROP\s+(?:TRIGGER|POLICY|RULE|TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|SCHEMA|TYPE|SEQUENCE|INDEX)\s+IF\s+EXISTS\b/i.test(normalized)
  const triggerLikeMatch = /^DROP\s+(TRIGGER|POLICY|RULE)\s+(?:IF\s+EXISTS\s+)?(.+?)\s+ON\s+(.+)$/i.exec(normalized)
  if (triggerLikeMatch) {
    const objectType = String(triggerLikeMatch[1]).toLowerCase()
    const objectName = normalizeDroppedObjectName(triggerLikeMatch[2] ?? '')
    const tableName = normalizeDroppedObjectName(stripTrailingDropOptions(triggerLikeMatch[3] ?? ''))
    if (objectName && tableName) {
      drops.push({
        migrationFile,
        objectType,
        objectName: `${tableName}.${objectName}`,
        line,
        ifExists,
      })
    }
    return drops
  }

  const objectMatch = /^DROP\s+(TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|SCHEMA|TYPE|SEQUENCE|INDEX)\s+(?:IF\s+EXISTS\s+)?(.+)$/i.exec(normalized)
  if (!objectMatch) return drops

  const objectType = String(objectMatch[1] ?? '').replace(/\s+/g, '_').toLowerCase()
  const preserveSignature = objectType === 'function'
  const rawObjects = splitTopLevelCommaList(stripTrailingDropOptions(objectMatch[2] ?? ''))
  for (const rawObject of rawObjects) {
    const objectName = normalizeDroppedObjectName(rawObject, { preserveSignature })
    if (!objectName) continue
    drops.push({
      migrationFile,
      objectType,
      objectName,
      line,
      ifExists,
    })
  }
  return drops
}

function extractAlterTableDropStatements(statement: string, migrationFile: string, line: number): MigrationDropStatement[] {
  const normalized = normalizeSqlWhitespace(statement)
  const match = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_".]+)\s+(.+)$/i.exec(normalized)
  if (!match) return []

  const tableName = normalizeDroppedObjectName(match[1] ?? '')
  const actions = splitTopLevelCommaList(match[2] ?? '')
  const drops: MigrationDropStatement[] = []
  for (const action of actions) {
    const actionMatch = /^DROP\s+(COLUMN|CONSTRAINT)\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_".]+)/i.exec(action.trim())
    if (!actionMatch) continue
    const objectName = normalizeDroppedObjectName(actionMatch[2] ?? '')
    if (!tableName || !objectName) continue
    drops.push({
      migrationFile,
      objectType: String(actionMatch[1] ?? '').toLowerCase(),
      objectName: `${tableName}.${objectName}`,
      line,
      ifExists: /^DROP\s+(?:COLUMN|CONSTRAINT)\s+IF\s+EXISTS\b/i.test(action.trim()),
    })
  }
  return drops
}

function extractRecreatedObjects(statement: string): Array<{ objectType: string, objectName: string }> {
  const recreatedObjects: Array<{ objectType: string, objectName: string }> = []
  const normalized = normalizeSqlWhitespace(statement)

  const indexMatch = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_".]+)\s+ON\s+(.+)$/i.exec(normalized)
  if (indexMatch) {
    const objectName = normalizeDroppedObjectName(indexMatch[1] ?? '')
    if (objectName) {
      recreatedObjects.push({
        objectType: 'index',
        objectName,
      })
    }
    return recreatedObjects
  }

  const triggerMatch = /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+([A-Za-z0-9_".]+)\s+.+?\s+ON\s+([A-Za-z0-9_".]+)(?:\s|$)/i.exec(normalized)
  if (triggerMatch) {
    const objectName = normalizeDroppedObjectName(triggerMatch[1] ?? '')
    const tableName = normalizeDroppedObjectName(triggerMatch[2] ?? '')
    if (objectName && tableName) {
      recreatedObjects.push({
        objectType: 'trigger',
        objectName: `${tableName}.${objectName}`,
      })
    }
    return recreatedObjects
  }

  const policyMatch = /^CREATE\s+POLICY\s+([A-Za-z0-9_".]+)\s+ON\s+(.+?)(?:\s+AS\s+|\s+FOR\s+|\s+TO\s+|\s+USING\s+|\s+WITH\s+CHECK\s+|$)/i.exec(normalized)
  if (policyMatch) {
    const objectName = normalizeDroppedObjectName(policyMatch[1] ?? '')
    const tableName = normalizeDroppedObjectName(policyMatch[2] ?? '')
    if (objectName && tableName) {
      recreatedObjects.push({
        objectType: 'policy',
        objectName: `${tableName}.${objectName}`,
      })
    }
    return recreatedObjects
  }

  const functionMatch = /^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z0-9_".]+\s*\([^)]*\))/i.exec(normalized)
  if (functionMatch) {
    const objectName = normalizeDroppedObjectName(functionMatch[1] ?? '', { preserveSignature: true })
    if (objectName) recreatedObjects.push({ objectType: 'function', objectName })
    return recreatedObjects
  }

  const relationMatch = /^CREATE\s+(?:(MATERIALIZED)\s+)?(TABLE|VIEW|SEQUENCE|TYPE|SCHEMA)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_".]+)/i.exec(normalized)
  if (relationMatch) {
    const baseType = String(relationMatch[2] ?? '').toLowerCase()
    const objectType = relationMatch[1] ? 'materialized_view' : baseType
    const objectName = normalizeDroppedObjectName(relationMatch[3] ?? '')
    if (objectName) recreatedObjects.push({ objectType, objectName })
    return recreatedObjects
  }

  const tableMatch = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_".]+)\s+(.+)$/i.exec(normalized)
  if (!tableMatch) return recreatedObjects

  const tableName = normalizeDroppedObjectName(tableMatch[1] ?? '')
  const actions = splitTopLevelCommaList(tableMatch[2] ?? '')
  for (const action of actions) {
    const constraintMatch = /^ADD\s+CONSTRAINT\s+([A-Za-z0-9_".]+)/i.exec(action.trim())
    if (!constraintMatch) continue
    const objectName = normalizeDroppedObjectName(constraintMatch[1] ?? '')
    if (!tableName || !objectName) continue
    recreatedObjects.push({
      objectType: 'constraint',
      objectName: `${tableName}.${objectName}`,
    })
  }

  return recreatedObjects
}

function recreatedObjectKey(object: { objectType: string, objectName: string }) {
  return `${object.objectType.toLowerCase()}::${canonicalObjectName(object.objectName)}`
}

function dropStatementKey(drop: MigrationDropStatement) {
  return recreatedObjectKey(drop)
}

function normalizeSqlWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function splitTopLevelCommaList(value: string) {
  const items: string[] = []
  let current = ''
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false

  for (const char of value) {
    if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
    if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote
    if (!inSingleQuote && !inDoubleQuote && char === '(') depth += 1
    if (!inSingleQuote && !inDoubleQuote && char === ')') depth = Math.max(0, depth - 1)
    if (!inSingleQuote && !inDoubleQuote && depth === 0 && char === ',') {
      if (current.trim()) items.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  if (current.trim()) items.push(current.trim())
  return items
}

function stripTrailingDropOptions(value: string) {
  return value
    .replace(/\s+(CASCADE|RESTRICT)\s*$/i, '')
    .trim()
}

function normalizeDroppedObjectName(rawObject: string, options: { preserveSignature?: boolean } = {}) {
  let normalized = rawObject
    .replace(/\s+(CASCADE|RESTRICT)\s*$/i, '')
    .replace(/["]/g, '')
    .trim()

  if (!options.preserveSignature) {
    normalized = normalized.replace(/\s*\(.*$/, '')
  } else {
    normalized = normalized
      .replace(/\s*\(\s*/g, '(')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s*\)\s*$/, ')')
  }

  return normalized
}

function evaluateDropGuardReportWithMigrationDrops(
  candidates: LegacyObjectDropCandidate[],
  migrationDrops: MigrationDropStatement[],
  options: { deferIdempotentDrops?: boolean } = {},
): LegacyObjectDropGuardReport {
  const report = evaluateLegacyObjectDropGuardReport(candidates)
  const candidateKeys = new Set(candidates.map(candidateDropEvidenceKey))
  const missingEvaluations: LegacyObjectDropEvaluation[] = []

  for (const drop of migrationDrops) {
    if (!candidateKeys.has(migrationDropEvidenceKey(drop))) {
      missingEvaluations.push({
        objectName: drop.objectName,
        status: options.deferIdempotentDrops === true && drop.ifExists ? 'needs_gating' : 'blocked',
        reasons: ['migration_drop_candidate_evidence_required'],
      } as LegacyObjectDropEvaluation)
    }
  }

  if (missingEvaluations.length === 0) {
    return report
  }

  const candidatesBlock = report.candidates.some((candidate) => candidate.status === 'blocked')
  const missingBlocks = missingEvaluations.some((candidate) => candidate.status === 'blocked')
  return {
    status: candidatesBlock || missingBlocks ? 'blocked' : 'needs_gating',
    reasons: ['migration_drop_candidate_evidence_required'],
    candidates: [...report.candidates, ...missingEvaluations],
  }
}

function canonicalObjectName(objectName: string) {
  const withoutQuotes = objectName.replace(/["]/g, '').trim().toLowerCase()
  return withoutQuotes.startsWith('public.') ? withoutQuotes.slice('public.'.length) : withoutQuotes
}

function candidateDropEvidenceKey(candidate: LegacyObjectDropCandidate) {
  return `${canonicalObjectName(candidate.objectName)}::${canonicalMigrationFilename(candidate.controlledDropMigration?.filename)}`
}

function migrationDropEvidenceKey(drop: MigrationDropStatement) {
  return `${canonicalObjectName(drop.objectName)}::${canonicalMigrationFilename(drop.migrationFile)}`
}

function canonicalMigrationFilename(filename: string | null | undefined) {
  return basename(filename ?? '').trim().toLowerCase()
}

async function outputResult(
  argv: string[],
  report: LegacyObjectDropGuardReport,
  options: {
    writeOutput?: (message: string) => void
    writeTextFile?: (path: string, text: string) => Promise<void>
  },
  behavior: { allowNeedsGating?: boolean } = {},
): Promise<LegacyObjectDropGuardCheckResult> {
  await outputGuardReport(argv, report, options)
  const allowed = report.status === 'drop_ready'
    || (behavior.allowNeedsGating === true && report.status === 'needs_gating')
  return { report, exitCode: allowed ? 0 : 1 }
}

async function outputGuardReport(
  argv: string[],
  report: LegacyObjectDropGuardReport | (LegacyObjectDropGuardReport & { error?: string }),
  options: {
    writeOutput?: (message: string) => void
    writeTextFile?: (path: string, text: string) => Promise<void>
  },
) {
  const text = formatJson(report)
  options.writeOutput?.(text)
  const outputFile = readOutputFileArg(argv)
  if (outputFile) {
    const writeTextFile = options.writeTextFile ?? defaultWriteTextFile
    await writeTextFile(outputFile, `${text}\n`)
  }
}

async function defaultWriteTextFile(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
}

async function main() {
  const result = await runLegacyObjectDropGuardCheck(process.argv.slice(2), {
    writeOutput: (message) => console.log(message),
  })
  process.exitCode = result.exitCode
}

function formatJson(payload: unknown) {
  return JSON.stringify(payload, null, 2)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.log(formatJson({
      ...createBlockedSafeLegacyObjectDropReport('row_count_zero_not_sufficient'),
      error: error instanceof Error ? error.message : 'Unexpected legacy object drop guard failure',
    }))
    process.exitCode = 1
  })
}
