#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceExportMetadataBlockers } from './default-master-plan-source-export-metadata.mjs'
import {
  normalizeRealProductionOutcomeEvidence,
  validateRealProductionOutcomeEvidence,
} from './default-master-plan-real-outcome-evidence.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness', 'post-publish-smoke-rollback-evidence.json')
const REAL_ENVIRONMENTS = new Set(['staging', 'production', 'live'])
const PRODUCTION_READY_ENVIRONMENTS = new Set(['production', 'live'])
const PASSING_STATUSES = new Set(['pass', 'passed', 'completed', 'readback_passed'])
const REAL_OUTCOME_PASSING_STATUSES = new Set(['pass', 'passed', 'verified', 'accepted', 'ready'])

function parseArgs(argv) {
  const args = {
    baselineId: null,
    projectId: null,
    publicationKey: null,
    environment: null,
    testedAt: new Date().toISOString(),
    apiReadSmoke: null,
    uiConsumptionSmoke: null,
    criticalPathReadback: null,
    rollbackVerification: null,
    realProductionOutcome: null,
    output: DEFAULT_OUTPUT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--baseline-id') {
      args.baselineId = text(argv[index + 1])
      index += 1
    } else if (arg === '--project-id') {
      args.projectId = text(argv[index + 1])
      index += 1
    } else if (arg === '--publication-key') {
      args.publicationKey = text(argv[index + 1])
      index += 1
    } else if (arg === '--environment') {
      args.environment = text(argv[index + 1])
      index += 1
    } else if (arg === '--tested-at') {
      args.testedAt = text(argv[index + 1])
      index += 1
    } else if (arg === '--api-read-smoke') {
      args.apiReadSmoke = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--ui-consumption-smoke') {
      args.uiConsumptionSmoke = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--critical-path-readback') {
      args.criticalPathReadback = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--rollback-verification') {
      args.rollbackVerification = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-production-outcome') {
      args.realProductionOutcome = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node project-testing/tools/build-default-master-plan-post-publish-smoke-rollback-evidence.mjs --baseline-id <id> --project-id <id> --publication-key <key> --environment <staging|production|live> --api-read-smoke <json> --ui-consumption-smoke <json> --critical-path-readback <json> --rollback-verification <json> [--real-production-outcome <json>] [--tested-at <iso>] [--output <json>]`)
      process.exit(0)
    }
  }
  return args
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function text(value) {
  return String(value ?? '').trim()
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function status(value) {
  return text(value).toLowerCase()
}

function hasPassingStatus(value) {
  return PASSING_STATUSES.has(status(value))
}

function hasPassingRealOutcomeStatus(value) {
  return REAL_OUTCOME_PASSING_STATUSES.has(status(value))
}

function evidenceRef(record) {
  return text(record.evidenceRef ?? record.evidence_ref ?? record.sourceEvidenceRef ?? record.source_evidence_ref)
}

async function readJsonEvidence(filePath) {
  if (!filePath) return {}
  try {
    return readObject(JSON.parse(await fs.readFile(filePath, 'utf8')))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        status: 'missing',
        evidenceRef: '',
        readError: `evidence file not found: ${filePath}`,
      }
    }
    throw error
  }
}

async function sha256File(filePath) {
  if (!filePath) return null
  try {
    const content = await fs.readFile(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function normalizeSmoke(filePath, fallbackKind) {
  const record = await readJsonEvidence(filePath)
  const hash = await sha256File(filePath)
  const sourceName = fallbackKind.replace(/_export$/, '')
  const directEvidenceRef = evidenceRef(record)
  const exportEvidenceRef = filePath
    ? `${fallbackKind}:${repoRelative(filePath)}${hash ? `#sha256=${hash}` : ''}`
    : ''
  return {
    status: status(record.status),
    evidenceRef: exportEvidenceRef || directEvidenceRef,
    sourceRecordEvidenceRef: directEvidenceRef || null,
    sourcePath: filePath ? repoRelative(filePath) : null,
    rawStatus: record.status ?? null,
    baselineId: text(record.baselineId ?? record.baseline_id),
    projectId: text(record.projectId ?? record.project_id),
    publicationKey: text(record.publicationKey ?? record.publication_key),
    sourceMetadataBlockers: sourceExportMetadataBlockers(record, sourceName),
  }
}

async function normalizeRealProductionOutcome(filePath) {
  if (!filePath) return null
  const record = await readJsonEvidence(filePath)
  const hash = await sha256File(filePath)
  const directEvidenceRef = evidenceRef(record) || text(record.ref)
  const exportEvidenceRef = `real_production_outcome:${repoRelative(filePath)}${hash ? `#sha256=${hash}` : ''}`
  const normalized = normalizeRealProductionOutcomeEvidence({
    ...record,
    evidenceRef: directEvidenceRef || exportEvidenceRef,
  })
  return {
    ...normalized,
    status: status(normalized.status),
    sourcePath: repoRelative(filePath),
    rawStatus: record.status ?? null,
    sourceMetadataBlockers: sourceExportMetadataBlockers(record, 'real_production_outcome'),
  }
}

function identityBlockers(kind, record, args) {
  return [
    record.baselineId ? null : `${kind}_baseline_id_required`,
    record.projectId ? null : `${kind}_project_id_required`,
    record.publicationKey ? null : `${kind}_publication_key_required`,
    record.baselineId && record.baselineId !== args.baselineId ? `${kind}_baseline_id_mismatch` : null,
    record.projectId && record.projectId !== args.projectId ? `${kind}_project_id_mismatch` : null,
    record.publicationKey && record.publicationKey !== args.publicationKey ? `${kind}_publication_key_mismatch` : null,
  ].filter(Boolean)
}

function realProductionOutcomeBlockers(record, args) {
  if (!record) return []
  return [
    ...validateRealProductionOutcomeEvidence(record, {
      targetEnvironment: args.environment,
      baselineId: args.baselineId,
      projectId: args.projectId,
      publicationKey: args.publicationKey,
    }),
    ...record.sourceMetadataBlockers,
  ].filter(Boolean)
}

async function buildEvidence(args) {
  const [
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerificationBase,
    realProductionOutcomeEvidence,
  ] = await Promise.all([
    normalizeSmoke(args.apiReadSmoke, 'api_read_smoke_export'),
    normalizeSmoke(args.uiConsumptionSmoke, 'ui_consumption_smoke_export'),
    normalizeSmoke(args.criticalPathReadback, 'critical_path_readback_export'),
    normalizeSmoke(args.rollbackVerification, 'rollback_verification_export'),
    normalizeRealProductionOutcome(args.realProductionOutcome),
  ])

  const rollbackRaw = await readJsonEvidence(args.rollbackVerification)
  const rollbackVerification = {
    ...rollbackVerificationBase,
    rollbackTarget: text(rollbackRaw.rollbackTarget ?? rollbackRaw.rollback_target),
    baselineId: text(rollbackRaw.baselineId ?? rollbackRaw.baseline_id) || rollbackVerificationBase.baselineId,
    projectId: text(rollbackRaw.projectId ?? rollbackRaw.project_id) || rollbackVerificationBase.projectId,
    publicationKey: text(rollbackRaw.publicationKey ?? rollbackRaw.publication_key) || rollbackVerificationBase.publicationKey,
  }

  const blockers = [
    args.baselineId ? null : 'baseline_id_required',
    args.projectId ? null : 'project_id_required',
    args.publicationKey ? null : 'publication_key_required',
    REAL_ENVIRONMENTS.has(text(args.environment)) ? null : 'real_environment_required',
    args.testedAt ? null : 'tested_at_required',
    hasPassingStatus(apiReadSmoke.status) ? null : 'api_read_smoke_pass_required',
    evidenceRef(apiReadSmoke) ? null : 'api_read_smoke_evidence_ref_required',
    ...identityBlockers('api_read_smoke', apiReadSmoke, args),
    hasPassingStatus(uiConsumptionSmoke.status) ? null : 'ui_consumption_smoke_pass_required',
    evidenceRef(uiConsumptionSmoke) ? null : 'ui_consumption_smoke_evidence_ref_required',
    ...identityBlockers('ui_consumption_smoke', uiConsumptionSmoke, args),
    hasPassingStatus(criticalPathReadback.status) ? null : 'critical_path_readback_pass_required',
    evidenceRef(criticalPathReadback) ? null : 'critical_path_readback_evidence_ref_required',
    ...identityBlockers('critical_path_readback', criticalPathReadback, args),
    hasPassingStatus(rollbackVerification.status) ? null : 'rollback_verification_pass_required',
    rollbackVerification.rollbackTarget ? null : 'rollback_target_required',
    rollbackVerification.rollbackTarget && rollbackVerification.rollbackTarget !== `rollback:${args.publicationKey}` ? 'rollback_target_mismatch' : null,
    evidenceRef(rollbackVerification) ? null : 'rollback_verification_evidence_ref_required',
    ...identityBlockers('rollback_verification', rollbackVerification, args),
    ...apiReadSmoke.sourceMetadataBlockers,
    ...uiConsumptionSmoke.sourceMetadataBlockers,
    ...criticalPathReadback.sourceMetadataBlockers,
    ...rollbackVerification.sourceMetadataBlockers,
    ...realProductionOutcomeBlockers(realProductionOutcomeEvidence, args),
  ].filter(Boolean)

  return {
    schemaVersion: 'workbuddy-default-master-plan-post-publish-smoke-rollback-evidence/v1',
    baselineId: args.baselineId,
    projectId: args.projectId,
    publicationKey: args.publicationKey,
    environment: args.environment,
    testedAt: args.testedAt,
    status: blockers.length > 0 ? 'blocked' : 'post_publish_smoke_rollback_passed',
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
    ...(realProductionOutcomeEvidence ? { realProductionOutcomeEvidence } : {}),
    blockers,
    productionReady: false,
    mutationBoundary: {
      readsSmokeEvidenceFiles: true,
      writesProductionTables: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesSeeds: false,
      writesBaselines: false,
      performsRollback: false,
    },
  }
}

const args = parseArgs(process.argv.slice(2))
const evidence = await buildEvidence(args)
await fs.mkdir(path.dirname(args.output), { recursive: true })
await fs.writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: evidence.status,
  output: repoRelative(args.output),
  environment: evidence.environment,
  blockers: evidence.blockers,
}, null, 2))
