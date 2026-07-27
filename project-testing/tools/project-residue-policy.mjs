import { createHash } from 'node:crypto';

export const RETAINED_HISTORICAL_PROJECT_REFERENCE_TABLES = Object.freeze(['operation_logs']);

const PROJECT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isRetainedHistoricalProjectReferenceTable(tableName) {
  return RETAINED_HISTORICAL_PROJECT_REFERENCE_TABLES.includes(String(tableName ?? '').trim());
}

export async function readProjectBusinessResidueReadback(queryExec, { projectId }) {
  const normalizedProjectId = String(projectId ?? '').trim().toLowerCase();
  if (!PROJECT_UUID_PATTERN.test(normalizedProjectId)) {
    throw new Error('project_residue_scan_project_uuid_required');
  }

  const catalogRows = await queryExec(
    `SELECT DISTINCT column_definition.table_name,
            column_definition.data_type,
            column_definition.udt_name
       FROM information_schema.columns column_definition
       JOIN information_schema.tables table_definition
         ON table_definition.table_schema = column_definition.table_schema
        AND table_definition.table_name = column_definition.table_name
      WHERE column_definition.table_schema = 'public'
        AND column_definition.column_name = 'project_id'
        AND table_definition.table_type = 'BASE TABLE'
      ORDER BY column_definition.table_name`,
  );
  const tableDefinitions = new Map();
  for (const row of catalogRows) {
    const tableName = String(row.table_name ?? '').trim();
    if (!tableName) continue;
    const dataType = String(row.data_type ?? '').trim().toLowerCase();
    const udtName = String(row.udt_name ?? '').trim().toLowerCase();
    const comparisonMode = dataType === 'uuid' || udtName === 'uuid' ? 'uuid' : 'text';
    const existing = tableDefinitions.get(tableName);
    if (existing && existing.comparisonMode !== comparisonMode) {
      return finalizeReadback({
        status: 'blocked',
        reason: 'project_residue_scan_catalog_type_ambiguous',
        projectId: normalizedProjectId,
        scannedTables: Array.from(tableDefinitions.keys()).sort(),
        residueRows: [],
      });
    }
    tableDefinitions.set(tableName, { tableName, dataType, udtName, comparisonMode });
  }
  const scannedTables = Array.from(tableDefinitions.keys()).sort();
  if (scannedTables.length === 0) {
    return finalizeReadback({
      status: 'blocked',
      reason: 'project_residue_scan_catalog_empty',
      projectId: normalizedProjectId,
      scannedTables: [],
      residueRows: [],
    });
  }

  const countSql = scannedTables.map((tableName) => {
    const comparison = tableDefinitions.get(tableName)?.comparisonMode === 'uuid'
      ? 'project_id = $1::uuid'
      : 'project_id::text = $1';
    return `SELECT ${quoteSqlText(tableName)}::text AS table_name,
            COUNT(*)::bigint AS residue_count
       FROM public.${quoteIdentifier(tableName)}
      WHERE ${comparison}`;
  }).join('\nUNION ALL\n');
  const residueRows = await queryExec(
    `/* workbuddy_c19_project_residue_scan */\n${countSql}\nORDER BY table_name`,
    [normalizedProjectId],
  );
  const returnedTableNames = residueRows.map((row) => String(row.table_name ?? '').trim());
  const readbackComplete = residueRows.length === scannedTables.length
    && new Set(returnedTableNames).size === scannedTables.length
    && scannedTables.every((tableName) => returnedTableNames.includes(tableName))
    && residueRows.every((row) => isNonNegativeSafeCount(row.residue_count));
  if (!readbackComplete) {
    return finalizeReadback({
      status: 'blocked',
      reason: 'project_residue_scan_count_readback_incomplete',
      projectId: normalizedProjectId,
      scannedTables,
      residueRows,
    });
  }

  return finalizeReadback({
    projectId: normalizedProjectId,
    scannedTables,
    residueRows,
  });
}

export function hashProjectBusinessResidueReadback(readback) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalReadbackPayload(readback)))
    .digest('hex');
}

function finalizeReadback({ status = '', reason = null, projectId, scannedTables, residueRows }) {
  const rowCountByTable = new Map(residueRows.map((row) => [
    String(row.table_name ?? '').trim(),
    readCount(row.residue_count),
  ]));
  const rows = scannedTables.map((tableName) => ({
    tableName,
    rowCount: rowCountByTable.get(tableName) ?? 0,
  }));
  const retainedHistoricalResidue = rows.filter((row) => (
    isRetainedHistoricalProjectReferenceTable(row.tableName) && row.rowCount > 0
  ));
  const nonZeroBusinessTables = rows.filter((row) => (
    !isRetainedHistoricalProjectReferenceTable(row.tableName) && row.rowCount > 0
  ));
  const totalBusinessResidueCount = nonZeroBusinessTables.reduce((sum, row) => sum + row.rowCount, 0);
  const readback = {
    schemaVersion: 'workbuddy-project-residue-readback/v1',
    status: status || (totalBusinessResidueCount === 0 ? 'pass' : 'blocked'),
    reason: reason ?? (totalBusinessResidueCount === 0 ? null : 'disposable_project_business_residue'),
    projectId,
    scannedTableCount: scannedTables.length,
    scannedTables,
    retainedHistoricalProjectReferenceTables: [...RETAINED_HISTORICAL_PROJECT_REFERENCE_TABLES],
    retainedHistoricalResidue,
    totalRetainedHistoricalResidueCount: retainedHistoricalResidue.reduce(
      (sum, row) => sum + row.rowCount,
      0,
    ),
    nonZeroBusinessTables,
    totalBusinessResidueCount,
    queryMutationCount: 0,
  };
  return {
    ...readback,
    readbackHash: hashProjectBusinessResidueReadback(readback),
  };
}

function canonicalReadbackPayload(readback) {
  return {
    schemaVersion: String(readback?.schemaVersion ?? ''),
    status: String(readback?.status ?? ''),
    reason: readback?.reason == null ? null : String(readback.reason),
    projectId: String(readback?.projectId ?? '').toLowerCase(),
    scannedTableCount: readCount(readback?.scannedTableCount),
    scannedTables: stringArray(readback?.scannedTables),
    retainedHistoricalProjectReferenceTables: stringArray(
      readback?.retainedHistoricalProjectReferenceTables,
    ),
    retainedHistoricalResidue: residueArray(readback?.retainedHistoricalResidue),
    totalRetainedHistoricalResidueCount: readCount(readback?.totalRetainedHistoricalResidueCount),
    nonZeroBusinessTables: residueArray(readback?.nonZeroBusinessTables),
    totalBusinessResidueCount: readCount(readback?.totalBusinessResidueCount),
    queryMutationCount: readCount(readback?.queryMutationCount),
  };
}

function residueArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => ({
    tableName: String(row?.tableName ?? '').trim(),
    rowCount: readCount(row?.rowCount),
  })).filter((row) => row.tableName).sort((left, right) => left.tableName.localeCompare(right.tableName));
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean).sort();
}

function readCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function isNonNegativeSafeCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteSqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
