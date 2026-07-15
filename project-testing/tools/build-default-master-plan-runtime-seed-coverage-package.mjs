#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')
const DEFAULT_RUNTIME_SEED_PREFLIGHT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-evidence-preflight.json')
const DEFAULT_GOVERNANCE_PREFLIGHT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-governance-preflight.json')
const DEFAULT_STANDARD_SEED_SOURCE = path.join(REPO_ROOT, 'server', 'src', 'seeds', 'standardWorkDurationSeed.ts')
const DEFAULT_T2_SEED_SOURCE = path.join(REPO_ROOT, 'server', 'src', 'seeds', 't2DivisionRhythmTemplateSeed.ts')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-coverage-package.json')

export function parseArgs(argv) {
  const args = {
    runtimeSeedPreflight: DEFAULT_RUNTIME_SEED_PREFLIGHT,
    governancePreflight: DEFAULT_GOVERNANCE_PREFLIGHT,
    standardSeedSource: DEFAULT_STANDARD_SEED_SOURCE,
    t2SeedSource: DEFAULT_T2_SEED_SOURCE,
    output: DEFAULT_OUTPUT,
    failOnGap: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--runtime-seed-preflight') {
      args.runtimeSeedPreflight = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--governance-preflight') {
      args.governancePreflight = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--standard-seed-source') {
      args.standardSeedSource = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--t2-seed-source') {
      args.t2SeedSource = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--fail-on-gap') {
      args.failOnGap = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/build-default-master-plan-runtime-seed-coverage-package.mjs [--runtime-seed-preflight <json>] [--governance-preflight <json>] [--standard-seed-source <ts>] [--t2-seed-source <ts>] [--output <json>] [--fail-on-gap]')
      process.exit(0)
    }
  }

  return args
}

function text(value) {
  return String(value ?? '').trim()
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function uniqueSorted(values) {
  return [...new Set(values.map(text).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function summarizeGovernancePreflight(report, reportPath = null, reportSha256 = null) {
  const record = readRecord(report)
  const requiredSeedTypes = ['standard_work_duration', 't2_division_rhythm_template']
  const seedTypesReadyForImport = uniqueSorted(readArray(record.seedTypesReadyForImport))
  const sourceBlockers = uniqueSorted(readArray(record.blockers))
  const readyForGovernedImport = text(record.status) === 'runtime_seed_governance_preflight_ready'
    && record.readyForGovernedImport === true
    && requiredSeedTypes.every((seedType) => seedTypesReadyForImport.includes(seedType))
    && sourceBlockers.length === 0
  const blockers = uniqueSorted([
    ...sourceBlockers,
    Object.keys(record).length > 0 ? null : 'runtime_seed_governance_preflight_required',
    Object.keys(record).length === 0 || readyForGovernedImport
      ? null
      : 'runtime_seed_governance_preflight_not_ready',
  ].filter(Boolean))
  return {
    path: reportPath ? repoRelative(reportPath) : null,
    sha256: reportSha256 || null,
    schemaVersion: text(record.schemaVersion) || null,
    status: text(record.status) || 'not_provided',
    readyForGovernedImport,
    requiredSeedTypes,
    seedTypesReadyForImport,
    validations: readArray(record.validations),
    blockers,
  }
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function sha256Text(content) {
  return createHash('sha256').update(content).digest('hex')
}

function stripQuotedAndCommentedCharacters(source) {
  let output = ''
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (lineComment) {
      if (char === '\n') {
        lineComment = false
        output += char
      } else {
        output += ' '
      }
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        output += '  '
        index += 1
      } else {
        output += char === '\n' ? '\n' : ' '
      }
      continue
    }
    if (quote) {
      output += char === '\n' ? '\n' : ' '
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      output += '  '
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      output += '  '
      index += 1
      continue
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char
      output += ' '
      continue
    }
    output += char
  }
  return output
}

function findObjectStart(maskedSource, index) {
  let depth = 0
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const char = maskedSource[cursor]
    if (char === '}') {
      depth += 1
      continue
    }
    if (char === '{') {
      if (depth === 0) return cursor
      depth -= 1
    }
  }
  return -1
}

function findObjectEnd(maskedSource, start) {
  let depth = 0
  for (let cursor = start; cursor < maskedSource.length; cursor += 1) {
    const char = maskedSource[cursor]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return cursor
    }
  }
  return -1
}

function readStringField(block, field) {
  const match = block.match(new RegExp(`${field}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`))
  return match ? text(match[2]) : null
}

function readConstString(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*(['"\`])([\\s\\S]*?)\\1`))
  return match ? text(match[2]) : null
}

function readNumberField(block, field) {
  const match = block.match(new RegExp(`${field}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`))
  if (!match) return null
  const number = Number(match[1])
  return Number.isFinite(number) ? number : null
}

function readBooleanField(block, field) {
  const match = block.match(new RegExp(`${field}\\s*:\\s*(true|false)`))
  return match ? match[1] === 'true' : null
}

function readStringArrayField(block, field) {
  const match = block.match(new RegExp(`${field}\\s*:\\s*\\[([\\s\\S]*?)\\]`))
  if (!match) return []
  return [...match[1].matchAll(/(['"`])([\s\S]*?)\1/g)].map((item) => text(item[2])).filter(Boolean)
}

function countArrayObjects(block, field) {
  const match = block.match(new RegExp(`${field}\\s*:\\s*\\[([\\s\\S]*?)\\]`))
  if (!match) return 0
  return [...match[1].matchAll(/conditionCode\s*:/g)].length
}

function readObjectFieldBlock(block, field) {
  const fieldIndex = block.search(new RegExp(`${field}\\s*:`))
  if (fieldIndex < 0) return ''
  const start = block.indexOf('{', fieldIndex)
  if (start < 0) return ''
  const masked = stripQuotedAndCommentedCharacters(block)
  const end = findObjectEnd(masked, start)
  return end > start ? block.slice(start, end + 1) : ''
}

function readBaselineProductivity(block) {
  const productivityBlock = readObjectFieldBlock(block, 'baselineProductivity')
  if (!productivityBlock) return null
  return {
    p50PerDay: readNumberField(productivityBlock, 'p50PerDay'),
    unit: readStringField(productivityBlock, 'unit'),
    basis: readStringField(productivityBlock, 'basis'),
    sourceType: readStringField(productivityBlock, 'sourceType'),
    sourceRef: readStringField(productivityBlock, 'sourceRef'),
    sourceDetailPresent: Boolean(readStringField(productivityBlock, 'sourceDetail')),
  }
}

function buildSeedRuleFromBlock(block, stableCode) {
  const defaultDaysP50 = readNumberField(block, 'defaultDaysP50')
  const scaleBasis = readStringField(block, 'scaleBasis')
  const benchmarkBasis = readStringField(block, 'benchmarkBasis')
  const standardWorkCodes = readStringArrayField(block, 'standardWorkCodes')
  const hasGeneratedRuleShape = standardWorkCodes.length > 0
  const hasFamilyDefinitionShape = Boolean(defaultDaysP50 != null && scaleBasis && benchmarkBasis)
  if (defaultDaysP50 == null || (!hasGeneratedRuleShape && !hasFamilyDefinitionShape)) return null
  return {
    stableCode,
    sourceShape: hasGeneratedRuleShape ? 'standard_work_duration_seed_rule' : 'duration_family_definition',
    standardWorkCodes: standardWorkCodes.length > 0 ? standardWorkCodes : [stableCode],
    standardCatalogCodePrefixes: readStringArrayField(block, 'standardCatalogCodePrefixes'),
    durationCoverageMode: readStringField(block, 'durationCoverageMode'),
    durationContributionMode: readStringField(block, 'durationContributionMode'),
    baseDaysEligible: readBooleanField(block, 'baseDaysEligible'),
    applicableGranularity: readStringField(block, 'applicableGranularity'),
    defaultDaysP20: readNumberField(block, 'defaultDaysP20'),
    defaultDaysP50,
    defaultDaysP80: readNumberField(block, 'defaultDaysP80'),
    fixedDays: readNumberField(block, 'fixedDays'),
    variableDays: readNumberField(block, 'variableDays'),
    scaleBasis,
    defaultQuantity: readNumberField(block, 'defaultQuantity'),
    defaultQuantityUnit: readStringField(block, 'defaultQuantityUnit'),
    baselineProductivity: readBaselineProductivity(block),
    conditionDepth: {
      conditionedDurationBandCount: countArrayObjects(block, 'conditionedDurationBands'),
      productivityBandCount: countArrayObjects(block, 'productivityBands'),
      conditionedProcessProfileCount: countArrayObjects(block, 'conditionedProcessProfiles'),
    },
    benchmarkBasis,
    sourceStandard: readStringField(block, 'sourceStandard'),
    sourceVersion: readStringField(block, 'sourceVersion'),
    sourceClauseRef: readStringField(block, 'sourceClauseRef'),
    evidenceSourceKeys: readStringArrayField(block, 'evidenceSourceKeys'),
    confidence: readStringField(block, 'confidence'),
    webVerified: readBooleanField(block, 'webVerified'),
    reviewNeeded: readBooleanField(block, 'reviewNeeded'),
  }
}

export function extractStandardWorkDurationSeedRules(source) {
  const maskedSource = stripQuotedAndCommentedCharacters(source)
  const rulesByCode = new Map()
  const stableCodePattern = /stableCode\s*:\s*(['"`])([^'"`]+)\1/g
  let match
  while ((match = stableCodePattern.exec(source)) !== null) {
    const stableCode = text(match[2])
    const start = findObjectStart(maskedSource, match.index)
    const end = start >= 0 ? findObjectEnd(maskedSource, start) : -1
    if (start < 0 || end <= start) continue
    const block = source.slice(start, end + 1)
    const rule = buildSeedRuleFromBlock(block, stableCode)
    if (!rule) continue
    if (!rulesByCode.has(stableCode)) rulesByCode.set(stableCode, rule)
  }
  return [...rulesByCode.values()].sort((left, right) => left.stableCode.localeCompare(right.stableCode))
}

function buildT2RhythmTemplateRuleFromBlock(block, templateId) {
  const parentWindowBlock = readObjectFieldBlock(block, 'parentWindowDays')
  return {
    templateId,
    templateName: readStringField(block, 'templateName'),
    businessTypeCodes: readStringArrayField(block, 'businessTypeCodes'),
    phaseWindows: readStringArrayField(block, 'phaseWindows'),
    divisionFamilies: readStringArrayField(block, 'divisionFamilies'),
    workfaceUnit: readStringField(block, 'workfaceUnit'),
    overlapPolicy: readStringField(block, 'overlapPolicy'),
    parentWindowDaysP20: readNumberField(parentWindowBlock, 'p20'),
    parentWindowDaysP50: readNumberField(parentWindowBlock, 'p50'),
    parentWindowDaysP80: readNumberField(parentWindowBlock, 'p80'),
    windowRoleCount: readStringArrayField(block, 'windowRoles').length,
  }
}

export function extractT2RhythmTemplateSeedRules(source) {
  const maskedSource = stripQuotedAndCommentedCharacters(source)
  const rulesByTemplateId = new Map()
  const templateIdPattern = /templateId\s*:\s*(['"`])([^'"`]+)\1/g
  let match
  while ((match = templateIdPattern.exec(source)) !== null) {
    const templateId = text(match[2])
    const start = findObjectStart(maskedSource, match.index)
    const end = start >= 0 ? findObjectEnd(maskedSource, start) : -1
    if (start < 0 || end <= start) continue
    const block = source.slice(start, end + 1)
    const rule = buildT2RhythmTemplateRuleFromBlock(block, templateId)
    if (!rule.templateId || rule.parentWindowDaysP50 == null) continue
    if (!rulesByTemplateId.has(templateId)) rulesByTemplateId.set(templateId, rule)
  }
  return [...rulesByTemplateId.values()].sort((left, right) => left.templateId.localeCompare(right.templateId))
}

export function readRequiredRuntimeSeedStableCodes(preflight) {
  const record = readRecord(preflight)
  const runtimeSeedEvidence = readRecord(record.runtimeSeedEvidence)
  return uniqueSorted(runtimeSeedEvidence.requiredRuntimeSeedStableCodes ?? [])
}

export function readRequiredT2RhythmTemplateIds(preflight) {
  const record = readRecord(preflight)
  const runtimeT2Evidence = readRecord(record.runtimeT2Evidence)
  return uniqueSorted(runtimeT2Evidence.requiredT2RhythmTemplateIds ?? [])
}

function readSeedVersion(source) {
  return readConstString(source, 'STANDARD_WORK_DURATION_SEED_VERSION')
}

function readT2SeedVersion(source) {
  return readConstString(source, 'T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION')
}

function summarizeRule(rule) {
  if (!rule) return null
  return {
    stableCode: rule.stableCode,
    sourceShape: rule.sourceShape,
    standardWorkCodes: rule.standardWorkCodes,
    defaultDaysP20: rule.defaultDaysP20,
    defaultDaysP50: rule.defaultDaysP50,
    defaultDaysP80: rule.defaultDaysP80,
    durationCoverageMode: rule.durationCoverageMode,
    durationContributionMode: rule.durationContributionMode,
    baseDaysEligible: rule.baseDaysEligible,
    scaleBasis: rule.scaleBasis,
    defaultQuantity: rule.defaultQuantity,
    defaultQuantityUnit: rule.defaultQuantityUnit,
    baselineProductivity: rule.baselineProductivity,
    conditionDepth: rule.conditionDepth,
    sourceStandard: rule.sourceStandard,
    sourceVersion: rule.sourceVersion,
    sourceClauseRef: rule.sourceClauseRef,
    evidenceSourceKeys: rule.evidenceSourceKeys,
    confidence: rule.confidence,
    webVerified: rule.webVerified,
    reviewNeeded: rule.reviewNeeded,
  }
}

function summarizeT2Rule(rule) {
  if (!rule) return null
  return {
    templateId: rule.templateId,
    templateName: rule.templateName,
    businessTypeCodes: rule.businessTypeCodes,
    phaseWindows: rule.phaseWindows,
    divisionFamilies: rule.divisionFamilies,
    workfaceUnit: rule.workfaceUnit,
    overlapPolicy: rule.overlapPolicy,
    parentWindowDaysP20: rule.parentWindowDaysP20,
    parentWindowDaysP50: rule.parentWindowDaysP50,
    parentWindowDaysP80: rule.parentWindowDaysP80,
    windowRoleCount: rule.windowRoleCount,
  }
}

const GOVERNED_ALGORITHM_SEED_IMPORT_ENTRYPOINT = 'algorithmSeedImportService.importV1474AlgorithmSeeds'

function uniqueOrdered(values) {
  const seen = new Set()
  const output = []
  for (const value of values.map(text).filter(Boolean)) {
    if (seen.has(value)) continue
    seen.add(value)
    output.push(value)
  }
  return output
}

function buildRemainingProductionBlockersAfterActivation({ blockers, runtimeReferenceDaysEvidence, status }) {
  const blockersClosedBySeedActivation = new Set([
    'runtime_seed_evidence_missing',
    'active_standard_duration_seed_evidence_missing',
    'active_t2_rhythm_template_evidence_missing',
  ])
  const remaining = readArray(blockers)
    .map(text)
    .filter((blocker) => blocker && !blockersClosedBySeedActivation.has(blocker))
  if (
    Number(runtimeReferenceDaysEvidence.missingBusinessTypeCount ?? 0) > 0
    && !remaining.includes('runtime_reference_days_evidence_missing')
  ) {
    remaining.push('runtime_reference_days_evidence_missing')
  }
  return uniqueOrdered(remaining)
}

function buildActivationCandidate({
  seedType,
  seedVersion,
  sourcePath,
  sourceSha256,
  requiredStableCodes,
  rows,
  payloadKey,
}) {
  const coveredRows = rows.filter((row) => row.coveredByTsSeed)
  const missingStableCodes = rows
    .filter((row) => !row.coveredByTsSeed)
    .map((row) => text(row.stableCode ?? row.templateId))
    .filter(Boolean)
  return {
    seedType,
    seedVersion: seedVersion || null,
    importEntrypoint: GOVERNED_ALGORITHM_SEED_IMPORT_ENTRYPOINT,
    importRoute: '/api/planning/algorithm-seeds/import-seed',
    importRequest: {
      method: 'POST',
      body: {
        seedType,
        strict: true,
      },
      authBoundary: 'company_admin_required',
    },
    requiredRecordCount: requiredStableCodes.length,
    coveredRecordCount: coveredRows.length,
    missingRecordCount: missingStableCodes.length,
    requiredStableCodes,
    missingStableCodes,
    source: {
      path: sourcePath ? repoRelative(sourcePath) : null,
      sha256: sourceSha256 || null,
    },
    candidatePayloads: coveredRows.map((row) => ({
      stableCode: text(row.stableCode ?? row.templateId),
      payload: row[payloadKey],
    })),
    mutationBoundary: {
      packageOnly: true,
      callsImportEntrypoint: false,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
    },
  }
}

function buildRuntimeActivationCandidatePackage({
  preflightRecord,
  governancePreflight,
  runtimeSeedEvidenceAlreadyReady,
  runtimeReferenceDaysEvidence,
  requiredStableCodes,
  missingStableCodes,
  coverageRows,
  requiredT2TemplateIds,
  missingT2TemplateIds,
  t2CoverageRows,
  standardSeedVersion,
  t2SeedVersion,
  standardSeedSourcePath,
  standardSeedSourceSha256,
  t2SeedSourcePath,
  t2SeedSourceSha256,
}) {
  const standardSeedReady = !runtimeSeedEvidenceAlreadyReady
    && requiredStableCodes.length > 0
    && missingStableCodes.length === 0
  const t2Ready = requiredT2TemplateIds.length > 0 && missingT2TemplateIds.length === 0
  const coverageBlockers = uniqueOrdered([
    !runtimeSeedEvidenceAlreadyReady && requiredStableCodes.length > 0 && missingStableCodes.length > 0
      ? 'runtime_seed_ts_coverage_must_be_complete'
      : null,
    requiredT2TemplateIds.length > 0 && missingT2TemplateIds.length > 0
      ? 'runtime_t2_seed_ts_coverage_must_be_complete'
      : null,
  ])
  const blockers = uniqueOrdered([
    ...governancePreflight.blockers,
    ...coverageBlockers,
  ])
  const activationAllowed = governancePreflight.readyForGovernedImport && coverageBlockers.length === 0
  const coverageCandidates = [
    standardSeedReady
      ? buildActivationCandidate({
        seedType: 'standard_work_duration',
        seedVersion: standardSeedVersion,
        sourcePath: standardSeedSourcePath,
        sourceSha256: standardSeedSourceSha256,
        requiredStableCodes,
        rows: coverageRows,
        payloadKey: 'seedRule',
      })
      : null,
    t2Ready
      ? buildActivationCandidate({
        seedType: 't2_division_rhythm_template',
        seedVersion: t2SeedVersion,
        sourcePath: t2SeedSourcePath,
        sourceSha256: t2SeedSourceSha256,
        requiredStableCodes: requiredT2TemplateIds,
        rows: t2CoverageRows.map((row) => ({ ...row, stableCode: row.templateId })),
        payloadKey: 't2Rule',
      })
      : null,
  ].filter(Boolean)
  const activationCandidates = coverageCandidates.map((candidate) => ({
    ...candidate,
    status: activationAllowed
      ? 'ready_for_activation'
      : governancePreflight.readyForGovernedImport
        ? 'blocked_by_seed_coverage'
        : 'blocked_by_governance_preflight',
  }))
  const seedTypesReadyForActivation = activationAllowed
    ? activationCandidates.map((candidate) => candidate.seedType)
    : []
  const status = !activationAllowed
    ? 'blocked'
    : activationCandidates.length === 2
    ? 'ready_for_governed_seed_activation'
    : activationCandidates.length > 0
    ? 'partial_seed_activation_ready'
    : runtimeSeedEvidenceAlreadyReady
    ? 'runtime_seed_evidence_already_ready'
    : 'blocked'
  return {
    status,
    generatedFrom: 'runtime_seed_coverage_package',
    blockers,
    seedTypesReadyForActivation,
    activationCandidates,
    remainingProductionBlockersAfterActivation: buildRemainingProductionBlockersAfterActivation({
      blockers: [
        ...readArray(preflightRecord.blockers),
        ...blockers,
      ],
      runtimeReferenceDaysEvidence,
      status,
    }),
    productionReadyAfterActivation: false,
    requiresExplicitEnvironmentUnlock: seedTypesReadyForActivation.length > 0,
    requiredPostActivationEvidence: seedTypesReadyForActivation.length > 0
      ? [
          'post-import profile report shows standard_work_duration rows resolved from active_seed/company_override/project_override',
          'post-import profile report shows t2_division_rhythm_template rows resolved from active_seed/company_override/project_override',
          'runtime reference-days evidence remains separately required before production readiness',
        ]
      : [],
    mutationBoundary: {
      packageOnly: true,
      callsImportEntrypoint: false,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
    },
  }
}

export function buildRuntimeSeedCoveragePackage({
  preflight,
  governancePreflight = null,
  seedSourceText,
  t2SeedSourceText = '',
  runtimeSeedPreflightPath = null,
  standardSeedSourcePath = null,
  t2SeedSourcePath = null,
  runtimeSeedPreflightSha256 = null,
  standardSeedSourceSha256 = null,
  t2SeedSourceSha256 = null,
  governancePreflightPath = null,
  governancePreflightSha256 = null,
  generatedAt = new Date().toISOString(),
}) {
  const preflightRecord = readRecord(preflight)
  const governancePreflightSummary = summarizeGovernancePreflight(
    governancePreflight,
    governancePreflightPath,
    governancePreflightSha256,
  )
  const runtimeSeedEvidence = readRecord(preflightRecord.runtimeSeedEvidence)
  const runtimeT2Evidence = readRecord(preflightRecord.runtimeT2Evidence)
  const runtimeReferenceDaysEvidence = readRecord(preflightRecord.runtimeReferenceDaysEvidence)
  const requiredStableCodes = readRequiredRuntimeSeedStableCodes(preflight)
  const requiredT2TemplateIds = readRequiredT2RhythmTemplateIds(preflight)
  const seedRules = extractStandardWorkDurationSeedRules(seedSourceText)
  const ruleByCode = new Map(seedRules.map((rule) => [rule.stableCode, rule]))
  const t2Rules = extractT2RhythmTemplateSeedRules(t2SeedSourceText)
  const t2RuleByTemplateId = new Map(t2Rules.map((rule) => [rule.templateId, rule]))
  const coverageRows = requiredStableCodes.map((stableCode) => {
    const rule = ruleByCode.get(stableCode)
    return {
      stableCode,
      coveredByTsSeed: Boolean(rule),
      seedRule: summarizeRule(rule),
    }
  })
  const missingStableCodes = coverageRows
    .filter((row) => !row.coveredByTsSeed)
    .map((row) => row.stableCode)
  const coveredStableCodes = coverageRows
    .filter((row) => row.coveredByTsSeed)
    .map((row) => row.stableCode)
  const t2CoverageRows = requiredT2TemplateIds.map((templateId) => {
    const rule = t2RuleByTemplateId.get(templateId)
    return {
      templateId,
      coveredByTsSeed: Boolean(rule),
      t2Rule: summarizeT2Rule(rule),
    }
  })
  const missingT2TemplateIds = t2CoverageRows
    .filter((row) => !row.coveredByTsSeed)
    .map((row) => row.templateId)
  const coveredT2TemplateIds = t2CoverageRows
    .filter((row) => row.coveredByTsSeed)
    .map((row) => row.templateId)
  const runtimeSeedEvidenceAlreadyReady = text(preflightRecord.status) === 'runtime_seed_evidence_ready'
    || (
      Number(runtimeSeedEvidence.missingBusinessTypeCount ?? 0) === 0
      && Number(runtimeSeedEvidence.readyBusinessTypeCount ?? 0) > 0
      && !readArray(preflightRecord.blockers).map(text).includes('runtime_seed_evidence_missing')
    )
  const runtimeSeedImportRequired = !runtimeSeedEvidenceAlreadyReady
  const coverageStatus = !governancePreflightSummary.readyForGovernedImport
    ? 'runtime_seed_governance_blocked'
    : runtimeSeedEvidenceAlreadyReady
      ? 'runtime_seed_evidence_ready_no_import_required'
      : missingStableCodes.length === 0
        ? 'ts_seed_coverage_complete_runtime_import_still_required'
        : 'ts_seed_coverage_gap'
  const standardSeedVersion = readSeedVersion(seedSourceText)
  const t2SeedVersion = readT2SeedVersion(t2SeedSourceText)
  const runtimeActivationCandidatePackage = buildRuntimeActivationCandidatePackage({
    preflightRecord,
    governancePreflight: governancePreflightSummary,
    runtimeSeedEvidenceAlreadyReady,
    runtimeReferenceDaysEvidence,
    requiredStableCodes,
    missingStableCodes,
    coverageRows,
    requiredT2TemplateIds,
    missingT2TemplateIds,
    t2CoverageRows,
    standardSeedVersion,
    t2SeedVersion,
    standardSeedSourcePath,
    standardSeedSourceSha256,
    t2SeedSourcePath,
    t2SeedSourceSha256,
  })

  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-coverage-package/v1',
    source: 'build-default-master-plan-runtime-seed-coverage-package',
    generatedAt,
    status: coverageStatus,
    runtimeSeedPreflight: {
      path: runtimeSeedPreflightPath ? repoRelative(runtimeSeedPreflightPath) : null,
      sha256: runtimeSeedPreflightSha256 || null,
      status: text(preflightRecord.status) || null,
      blockers: uniqueSorted(readArray(preflightRecord.blockers)),
      runtimeSeedEvidenceReadyBusinessTypeCount: Number(runtimeSeedEvidence.readyBusinessTypeCount ?? 0),
      runtimeSeedEvidenceMissingBusinessTypeCount: Number(runtimeSeedEvidence.missingBusinessTypeCount ?? 0),
      runtimeSeedEvidenceMissingBusinessTypes: uniqueSorted(readArray(runtimeSeedEvidence.missingBusinessTypes)),
      runtimeT2EvidenceReadyBusinessTypeCount: Number(runtimeT2Evidence.readyBusinessTypeCount ?? 0),
      runtimeT2EvidenceMissingBusinessTypeCount: Number(runtimeT2Evidence.missingBusinessTypeCount ?? 0),
      runtimeT2EvidenceMissingBusinessTypes: uniqueSorted(readArray(runtimeT2Evidence.missingBusinessTypes)),
      requiredT2RhythmTemplateIds: uniqueSorted(readArray(runtimeT2Evidence.requiredT2RhythmTemplateIds)),
      runtimeReferenceDaysReadyBusinessTypeCount: Number(runtimeReferenceDaysEvidence.readyBusinessTypeCount ?? 0),
      runtimeReferenceDaysMissingBusinessTypeCount: Number(runtimeReferenceDaysEvidence.missingBusinessTypeCount ?? 0),
      runtimeReferenceDaysMissingBusinessTypes: uniqueSorted(readArray(runtimeReferenceDaysEvidence.missingBusinessTypes)),
      requiredRuntimeReferenceStableCodes: uniqueSorted(readArray(runtimeReferenceDaysEvidence.requiredRuntimeReferenceStableCodes)),
      requiredRuntimeSeedStableCodeCount: requiredStableCodes.length,
    },
    governancePreflight: governancePreflightSummary,
    standardWorkDurationSeedSource: {
      path: standardSeedSourcePath ? repoRelative(standardSeedSourcePath) : null,
      sha256: standardSeedSourceSha256 || null,
      seedVersion: standardSeedVersion,
      parsedRuleCount: seedRules.length,
    },
    t2RhythmTemplateSeedSource: {
      path: t2SeedSourcePath ? repoRelative(t2SeedSourcePath) : null,
      sha256: t2SeedSourceSha256 || null,
      seedVersion: t2SeedVersion,
      parsedRuleCount: t2Rules.length,
    },
    coverage: {
      requiredStableCodes,
      coveredStableCodeCount: coveredStableCodes.length,
      coveredStableCodes,
      missingStableCodeCount: missingStableCodes.length,
      missingStableCodes,
      rows: coverageRows,
    },
    t2Coverage: {
      requiredTemplateIds: requiredT2TemplateIds,
      coveredTemplateIdCount: coveredT2TemplateIds.length,
      coveredTemplateIds: coveredT2TemplateIds,
      missingTemplateIdCount: missingT2TemplateIds.length,
      missingTemplateIds: missingT2TemplateIds,
      rows: t2CoverageRows,
    },
    importReadiness: {
      runtimeSeedImportRequired,
      runtimeSeedEvidenceAlreadyReady,
      governancePreflightReady: governancePreflightSummary.readyForGovernedImport,
      readyForRuntimeImportAttempt: runtimeSeedImportRequired
        && governancePreflightSummary.readyForGovernedImport
        && missingStableCodes.length === 0
        && requiredStableCodes.length > 0,
      readyForT2RuntimeImportAttempt: governancePreflightSummary.readyForGovernedImport
        && missingT2TemplateIds.length === 0
        && requiredT2TemplateIds.length > 0,
      importMustUseGovernedWriter: 'algorithmSeedImportService.importV1474AlgorithmSeeds',
      acceptedRuntimeResolverSourcesAfterImport: ['active_seed', 'company_override', 'project_override'],
      doesNotCloseRuntimeSeedEvidenceByItself: runtimeSeedImportRequired,
      stillRequiresEnvironment: runtimeSeedImportRequired
        ? [
            'reachable Supabase target',
            'explicit local or remote seed import unlock',
            'post-import profile report showing active_seed/company_override/project_override',
          ]
        : [],
    },
    runtimeActivationCandidatePackage,
    productionReady: false,
    mutationBoundary: {
      readsRuntimeSeedPreflightReport: true,
      readsRuntimeSeedGovernancePreflightReport: true,
      readsStandardWorkDurationTsSeed: true,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
    },
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [preflight, governancePreflight, seedSourceText, t2SeedSourceText] = await Promise.all([
    readJson(args.runtimeSeedPreflight),
    readOptionalJson(args.governancePreflight),
    fs.readFile(args.standardSeedSource, 'utf8'),
    fs.readFile(args.t2SeedSource, 'utf8'),
  ])
  const report = buildRuntimeSeedCoveragePackage({
    preflight,
    governancePreflight,
    seedSourceText,
    t2SeedSourceText,
    runtimeSeedPreflightPath: args.runtimeSeedPreflight,
    governancePreflightPath: args.governancePreflight,
    standardSeedSourcePath: args.standardSeedSource,
    t2SeedSourcePath: args.t2SeedSource,
    runtimeSeedPreflightSha256: sha256Text(JSON.stringify(preflight)),
    governancePreflightSha256: governancePreflight
      ? sha256Text(JSON.stringify(governancePreflight))
      : null,
    standardSeedSourceSha256: sha256Text(seedSourceText),
    t2SeedSourceSha256: sha256Text(t2SeedSourceText),
  })
  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    output: repoRelative(args.output),
    requiredStableCodeCount: report.coverage.requiredStableCodes.length,
    coveredStableCodeCount: report.coverage.coveredStableCodeCount,
    missingStableCodeCount: report.coverage.missingStableCodeCount,
    missingStableCodes: report.coverage.missingStableCodes,
    requiredT2TemplateIdCount: report.t2Coverage.requiredTemplateIds.length,
    coveredT2TemplateIdCount: report.t2Coverage.coveredTemplateIdCount,
    missingT2TemplateIdCount: report.t2Coverage.missingTemplateIdCount,
    missingT2TemplateIds: report.t2Coverage.missingTemplateIds,
    governancePreflightReady: report.governancePreflight.readyForGovernedImport,
    governanceBlockers: report.governancePreflight.blockers,
    productionReady: false,
  }, null, 2))
  if (args.failOnGap && (report.coverage.missingStableCodeCount > 0 || report.t2Coverage.missingTemplateIdCount > 0)) process.exitCode = 1
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
