#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_PROFILE_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')

function parseArgs(argv) {
  const args = {
    readiness: path.join(DEFAULT_OUTPUT_ROOT, 'readiness.json'),
    evidenceSources: path.join(DEFAULT_OUTPUT_ROOT, 'evidence-sources-report.json'),
    reviewEvidence: path.join(DEFAULT_OUTPUT_ROOT, 'pm-review-evidence.json'),
    durationCalibrationEvidence: path.join(DEFAULT_OUTPUT_ROOT, 'duration-calibration-evidence.json'),
    runtimeSeedEvidencePipeline: path.join(DEFAULT_OUTPUT_ROOT, 'runtime-seed-evidence-pipeline.json'),
    runtimeSeedImportReadinessSeal: path.join(DEFAULT_PROFILE_ROOT, 'runtime-seed-import-readiness-seal.json'),
    durationSampleCollectionPackage: path.join(DEFAULT_OUTPUT_ROOT, 'duration-sample-collection-package.json'),
    realDurationSampleMaterialTemplate: path.join(DEFAULT_OUTPUT_ROOT, 'real-duration-sample-material.template.json'),
    realDurationSampleCollectionKit: path.join(DEFAULT_OUTPUT_ROOT, 'real-duration-sample-collection-kit.json'),
    realDurationSampleCollectionKitPreflight: path.join(DEFAULT_OUTPUT_ROOT, 'real-duration-sample-collection-kit-preflight.json'),
    realDurationSampleMaterialPreflight: path.join(DEFAULT_OUTPUT_ROOT, 'real-duration-sample-material-preflight.json'),
    realDurationSampleMaterialBuildReport: path.join(DEFAULT_OUTPUT_ROOT, 'real-duration-sample-material.report.json'),
    realDurationSampleSourceExport: path.join(DEFAULT_OUTPUT_ROOT, 'source-exports', 'duration-experience-samples-export.json'),
    realDurationSampleSourceExportReport: path.join(DEFAULT_OUTPUT_ROOT, 'source-exports', 'duration-experience-samples-export.report.json'),
    durationAssetUtilization: path.join(DEFAULT_OUTPUT_ROOT, 'duration-asset-utilization-report.json'),
    completedTaskExportReport: path.join(DEFAULT_OUTPUT_ROOT, 'source-exports', 'completed-task-export.report.json'),
    runtimeCandidateAlignmentPreflight: path.join(DEFAULT_OUTPUT_ROOT, 'runtime-candidate-alignment-preflight.json'),
    runtimeTaskAlignmentRefreshPackage: path.join(DEFAULT_OUTPUT_ROOT, 'runtime-task-alignment-refresh-package.json'),
    operatorHandoff: path.join(DEFAULT_OUTPUT_ROOT, 'operator-handoff.json'),
    operatorHandoffPreflight: path.join(DEFAULT_OUTPUT_ROOT, 'operator-handoff-preflight.json'),
    candidateRefreshAuthorizationPackage: path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-authorization-package.json'),
    candidateRefreshExecutionReadinessSeal: path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-execution-readiness-seal.json'),
    candidateBaselineMaterializationReadinessSeal: path.join(DEFAULT_OUTPUT_ROOT, 'candidate-baseline-materialization-readiness-seal.json'),
    realProductionOutcomePackage: path.join(DEFAULT_OUTPUT_ROOT, 'real-production-outcome-package.json'),
    output: path.join(DEFAULT_OUTPUT_ROOT, 'real-evidence-gap-summary.md'),
    jsonOutput: path.join(DEFAULT_OUTPUT_ROOT, 'real-evidence-gap-summary.json'),
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--readiness') {
      args.readiness = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--evidence-sources') {
      args.evidenceSources = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--review-evidence') {
      args.reviewEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-calibration-evidence') {
      args.durationCalibrationEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-seed-evidence-pipeline') {
      args.runtimeSeedEvidencePipeline = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-seed-import-readiness-seal') {
      args.runtimeSeedImportReadinessSeal = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-sample-collection-package') {
      args.durationSampleCollectionPackage = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-duration-sample-material-template') {
      args.realDurationSampleMaterialTemplate = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-duration-sample-collection-kit') {
      args.realDurationSampleCollectionKit = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-duration-sample-collection-kit-preflight') {
      args.realDurationSampleCollectionKitPreflight = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-duration-sample-material-preflight') {
      args.realDurationSampleMaterialPreflight = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-duration-sample-material-build-report') {
      args.realDurationSampleMaterialBuildReport = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-duration-sample-source-export') {
      args.realDurationSampleSourceExport = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-duration-sample-source-export-report') {
      args.realDurationSampleSourceExportReport = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-asset-utilization') {
      args.durationAssetUtilization = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--completed-task-export-report') {
      args.completedTaskExportReport = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-candidate-alignment-preflight') {
      args.runtimeCandidateAlignmentPreflight = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-task-alignment-refresh-package') {
      args.runtimeTaskAlignmentRefreshPackage = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--operator-handoff') {
      args.operatorHandoff = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--operator-handoff-preflight') {
      args.operatorHandoffPreflight = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--candidate-refresh-authorization-package') {
      args.candidateRefreshAuthorizationPackage = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--candidate-refresh-execution-readiness-seal') {
      args.candidateRefreshExecutionReadinessSeal = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--candidate-baseline-materialization-readiness-seal') {
      args.candidateBaselineMaterializationReadinessSeal = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-production-outcome-package') {
      args.realProductionOutcomePackage = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--json-output') {
      args.jsonOutput = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/summarize-default-master-plan-real-evidence-gaps.mjs [--readiness <json>] [--evidence-sources <json>] [--review-evidence <json>] [--duration-calibration-evidence <json>] [--runtime-seed-evidence-pipeline <json>] [--runtime-seed-import-readiness-seal <json>] [--duration-sample-collection-package <json>] [--real-duration-sample-material-template <json>] [--real-duration-sample-collection-kit <json>] [--real-duration-sample-material-preflight <json>] [--real-duration-sample-source-export <json>] [--real-duration-sample-source-export-report <json>] [--duration-asset-utilization <json>] [--completed-task-export-report <json>] [--runtime-candidate-alignment-preflight <json>] [--runtime-task-alignment-refresh-package <json>] [--operator-handoff <json>] [--operator-handoff-preflight <json>] [--candidate-refresh-authorization-package <json>] [--candidate-refresh-execution-readiness-seal <json>] [--candidate-baseline-materialization-readiness-seal <json>] [--real-production-outcome-package <json>] [--output <md>] [--json-output <json>] [--json]')
      process.exit(0)
    }
  }

  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function readJsonIfPresent(filePath) {
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
}

function isLegacyRuntimePmReviewBlocker(value) {
  const blocker = String(value ?? '').trim().toLowerCase()
  return blocker === 'project_manager_review_required'
    || blocker === 'project_manager_review_evidence'
    || blocker === 'candidate_default_master_plan_review_missing'
    || blocker.startsWith('pm_review_')
    || blocker.startsWith('project_manager_review_')
    || blocker.startsWith('candidate_governance_review_')
    || blocker.startsWith('review_notes_')
}

function actionIdsFromPreflight(preflight, key) {
  const direct = arrayOfStrings(preflight[key])
  if (direct.length > 0) return direct
  return arrayOfStrings(readObject(preflight.actionReadiness)[key])
}

function blockedActionDetailsFromPreflight(
  preflight,
  directKey = 'blockedActionDetails',
  readinessKey = 'actionReadiness',
) {
  const direct = Array.isArray(preflight[directKey])
    ? preflight[directKey]
    : readObject(preflight[readinessKey]).blockedActionDetails
  return Array.isArray(direct)
    ? direct.map((detail) => {
        const record = readObject(detail)
        const nextRequirements = readObject(record.nextRequirements ?? record.next_requirements)
        return {
          actionId: String(record.actionId ?? record.action_id ?? '').trim(),
          gate: String(record.gate ?? '').trim(),
          blockers: arrayOfStrings(record.blockers),
          ...(Object.keys(nextRequirements).length > 0
            ? { nextRequirements: normalizeActionNextRequirements(nextRequirements) }
            : {}),
        }
      }).filter((detail) => detail.actionId)
    : []
}

function normalizeActionNextRequirements(value) {
  const record = readObject(value)
  return Object.fromEntries(Object.entries(record).map(([key, rawItems]) => [
    key,
    Array.isArray(rawItems)
      ? rawItems.map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return String(item ?? '').trim()
          const itemRecord = readObject(item)
          return Object.fromEntries(Object.entries(itemRecord).map(([itemKey, itemValue]) => [
            itemKey,
            Array.isArray(itemValue) ? arrayOfStrings(itemValue) : itemValue,
          ]))
        }).filter((item) => item !== '')
      : rawItems,
  ]))
}

function normalizeOperatorRequirement(detail) {
  const record = readObject(detail)
  const nextRequirements = readObject(record.nextRequirements ?? record.next_requirements)
  return {
    actionId: String(record.actionId ?? record.action_id ?? '').trim(),
    gate: String(record.gate ?? '').trim(),
    blockers: arrayOfStrings(record.blockers),
    ...(Object.keys(nextRequirements).length > 0
      ? { nextRequirements: normalizeActionNextRequirements(nextRequirements) }
      : {}),
  }
}

function normalizeOperatorRequirements(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeOperatorRequirement(item)).filter((item) => item.actionId)
    : []
}

function operatorRequirementsForActions(operatorHandoffSummary, actionIds, options = {}) {
  const ids = new Set(arrayOfStrings(actionIds))
  if (ids.size === 0) return []
  const source = options.writeExecution === true
    ? operatorHandoffSummary.writeExecutionBlockedActionDetails
    : operatorHandoffSummary.blockedActionDetails
  return normalizeOperatorRequirements(source).filter((requirement) => ids.has(requirement.actionId))
}

function readNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function buildGateSummary(readiness, gates) {
  const supplied = readObject(readiness.gateSummary ?? readiness.gate_summary)
  const rawGates = Array.isArray(readiness.gates) ? readiness.gates : []
  const legacyPmGateFiltered = rawGates.length !== gates.length
  const total = legacyPmGateFiltered ? gates.length : readNumber(supplied.total) || gates.length
  const pass = legacyPmGateFiltered ? gates.filter((gate) => gate.status === 'pass').length : readNumber(supplied.pass) || gates.filter((gate) => gate.status === 'pass').length
  const blocked = legacyPmGateFiltered ? gates.filter((gate) => gate.status === 'blocked').length : readNumber(supplied.blocked) || gates.filter((gate) => gate.status === 'blocked').length
  const fail = legacyPmGateFiltered ? gates.filter((gate) => gate.status === 'fail').length : readNumber(supplied.fail) || gates.filter((gate) => gate.status === 'fail').length
  const suppliedCompletionRate = Number(supplied.completionRate ?? supplied.completion_rate)
  return {
    total,
    pass,
    blocked,
    fail,
    completionRate: Number.isFinite(suppliedCompletionRate) && !legacyPmGateFiltered
      ? suppliedCompletionRate
      : total > 0
        ? Number(((pass / total) * 100).toFixed(1))
        : 0,
  }
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function markdownList(items) {
  if (!items.length) return ['- none']
  return items.map((item) => `- ${item}`)
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function containsAny(value, fragments) {
  return fragments.some((fragment) => value.includes(fragment))
}

function matchingBlockers(blockers, fragments) {
  return uniqueStrings(blockers.filter((blocker) => containsAny(blocker, fragments)))
}

function rootBlockersFromKnownCodes(blockers, knownCodes) {
  const roots = []
  for (const code of knownCodes) {
    if (blockers.some((blocker) => blocker === code || blocker.endsWith(`_${code}`) || blocker.includes(code))) {
      roots.push(code)
    }
  }
  return uniqueStrings(roots)
}

const BLOCKED_GATE_ACTION_GROUP_RULES = [
  {
    gateIds: ['runtime_source_export_provenance'],
    actionGroupIds: ['runtime_task_alignment_and_duration_samples', 'production_live_outcome_evidence'],
  },
  {
    gateIds: ['runtime_seed_and_reference_days_evidence'],
    actionGroupIds: ['runtime_seed_local_environment_and_import'],
  },
  {
    gateIds: [
      'duration_sample_collection_package',
      'runtime_duration_calibration_evidence',
      'runtime_evidence_lineage_consistency',
    ],
    actionGroupIds: ['runtime_task_alignment_and_duration_samples'],
  },
  {
    gateIds: [
      'runtime_publication_evidence',
      'post_publish_smoke_rollback_evidence',
      'production_readiness',
    ],
    actionGroupIds: ['production_live_outcome_evidence'],
  },
]

function blockerMatchesGate(blocker, gateId) {
  return blocker === gateId || blocker.startsWith(`${gateId}:`) || blocker.includes(gateId)
}

function blockerMatchesActionGroup(blocker, actionGroupBlocker) {
  return blocker === actionGroupBlocker
    || blocker.includes(actionGroupBlocker)
    || actionGroupBlocker.includes(blocker)
}

function buildBlockedGateActionCoverage(blockedRealGates, prioritizedNextActionGroups) {
  const actionGroups = Array.isArray(prioritizedNextActionGroups) ? prioritizedNextActionGroups : []
  const actionGroupIds = new Set(actionGroups.map((group) => String(group.id ?? '').trim()).filter(Boolean))
  const coverage = (Array.isArray(blockedRealGates) ? blockedRealGates : []).map((gate) => {
    const gateId = String(gate.id ?? gate.gateId ?? gate.gate_id ?? '').trim()
    const blockers = arrayOfStrings(gate.blockers)
    const coveredByActionGroupIds = []

    for (const rule of BLOCKED_GATE_ACTION_GROUP_RULES) {
      if (rule.gateIds.some((ruleGateId) => ruleGateId === gateId || blockers.some((blocker) => blockerMatchesGate(blocker, ruleGateId)))) {
        coveredByActionGroupIds.push(...rule.actionGroupIds.filter((actionGroupId) => actionGroupIds.has(actionGroupId)))
      }
    }

    for (const group of actionGroups) {
      const groupId = String(group.id ?? '').trim()
      const groupBlockers = uniqueStrings([
        ...arrayOfStrings(group.blockedBy),
        ...arrayOfStrings(group.deferredBy),
      ])
      if (!groupId || groupBlockers.length === 0) continue
      if (blockers.some((blocker) => groupBlockers.some((groupBlocker) => blockerMatchesActionGroup(blocker, groupBlocker)))) {
        coveredByActionGroupIds.push(groupId)
      }
    }

    const uniqueCoveredByActionGroupIds = uniqueStrings(coveredByActionGroupIds)
    const covered = uniqueCoveredByActionGroupIds.length > 0
    return {
      gateId,
      tier: String(gate.tier ?? '').trim(),
      status: String(gate.status ?? '').trim(),
      blockerCount: blockers.length,
      covered,
      coveredByActionGroupIds: uniqueCoveredByActionGroupIds,
      uncoveredBlockers: covered ? [] : blockers,
    }
  })

  const coveredEntries = coverage.filter((entry) => entry.covered)
  const uncoveredEntries = coverage.filter((entry) => !entry.covered)
  const totalBlockedGateCount = coverage.length
  return {
    coverage,
    summary: {
      totalBlockedGateCount,
      coveredBlockedGateCount: coveredEntries.length,
      uncoveredBlockedGateCount: uncoveredEntries.length,
      coverageRate: totalBlockedGateCount > 0
        ? Number(((coveredEntries.length / totalBlockedGateCount) * 100).toFixed(1))
        : 100,
      coveredBlockedGateIds: coveredEntries.map((entry) => entry.gateId).filter(Boolean),
      uncoveredBlockedGateIds: uncoveredEntries.map((entry) => entry.gateId).filter(Boolean),
      coveringActionGroupIds: uniqueStrings(coveredEntries.flatMap((entry) => entry.coveredByActionGroupIds)),
    },
  }
}

function requirementNext(requirement) {
  return readObject(readObject(requirement).nextRequirements)
}

function operatorRequirementValues(operatorRequirements, collectionName, valueName) {
  return uniqueStrings(operatorRequirements.flatMap((requirement) => {
    const collection = requirementNext(requirement)[collectionName]
    return Array.isArray(collection)
      ? collection.map((item) => readObject(item)[valueName])
      : []
  }))
}

function actionPlanRequiredStepIds(group, planNames, fieldName) {
  return uniqueStrings(planNames.flatMap((planName) => arrayOfStrings(readObject(group[planName])[fieldName])))
}

function buildOperatorUnblockRequirementReport(prioritizedNextActionGroups) {
  const actionGroups = Array.isArray(prioritizedNextActionGroups) ? prioritizedNextActionGroups : []
  const matrix = actionGroups.map((group) => {
    const operatorRequirements = Array.isArray(group.operatorRequirements) ? group.operatorRequirements : []
    const repairRequiredStepIds = actionPlanRequiredStepIds(group, ['repairPlan'], 'requiredStepIds')
    const dbRepairRequiredStepIds = actionPlanRequiredStepIds(group, ['dbRepairPlan'], 'requiredStepIds')
    const blockedPlanStepIds = actionPlanRequiredStepIds(
      group,
      ['repairPlan', 'dbRepairPlan', 'executionGatePlan'],
      'blockedStepIds',
    )
    return {
      actionGroupId: String(group.id ?? '').trim(),
      priority: readNumber(group.priority),
      status: String(group.status ?? '').trim(),
      operatorRequirementActionIds: uniqueStrings(operatorRequirements.map((requirement) => readObject(requirement).actionId)),
      envUnlockVariables: operatorRequirementValues(operatorRequirements, 'envUnlocks', 'variable'),
      requiredFlags: operatorRequirementValues(operatorRequirements, 'requiredFlags', 'flag'),
      operatorFields: operatorRequirementValues(operatorRequirements, 'operatorFields', 'field'),
      evidenceInputArtifacts: operatorRequirementValues(operatorRequirements, 'evidenceInputs', 'artifact'),
      requiredEnvironmentTargets: operatorRequirementValues(operatorRequirements, 'requiredEnvironmentTargets', 'target'),
      verificationCommands: uniqueStrings(operatorRequirements.flatMap((requirement) => arrayOfStrings(requirementNext(requirement).verificationCommands))),
      repairRequiredStepIds,
      dbRepairRequiredStepIds,
      blockedPlanStepIds,
    }
  })

  const summary = {
    actionGroupCount: actionGroups.length,
    blockedActionGroupCount: actionGroups.filter((group) => group.status === 'blocked').length,
    deferredActionGroupCount: actionGroups.filter((group) => group.status === 'deferred').length,
    operatorRequirementActionCount: matrix.reduce((sum, row) => sum + row.operatorRequirementActionIds.length, 0),
    envUnlockCount: matrix.reduce((sum, row) => sum + row.envUnlockVariables.length, 0),
    requiredFlagCount: matrix.reduce((sum, row) => sum + row.requiredFlags.length, 0),
    operatorFieldCount: matrix.reduce((sum, row) => sum + row.operatorFields.length, 0),
    evidenceInputCount: matrix.reduce((sum, row) => sum + row.evidenceInputArtifacts.length, 0),
    environmentTargetCount: matrix.reduce((sum, row) => sum + row.requiredEnvironmentTargets.length, 0),
    verificationCommandCount: matrix.reduce((sum, row) => sum + row.verificationCommands.length, 0),
    repairRequiredStepCount: matrix.reduce((sum, row) => sum + row.repairRequiredStepIds.length, 0),
    dbRepairRequiredStepCount: matrix.reduce((sum, row) => sum + row.dbRepairRequiredStepIds.length, 0),
    blockedPlanStepCount: matrix.reduce((sum, row) => sum + row.blockedPlanStepIds.length, 0),
    envUnlockVariables: uniqueStrings(matrix.flatMap((row) => row.envUnlockVariables)),
    requiredFlags: uniqueStrings(matrix.flatMap((row) => row.requiredFlags)),
    operatorFields: uniqueStrings(matrix.flatMap((row) => row.operatorFields)),
    evidenceInputArtifacts: uniqueStrings(matrix.flatMap((row) => row.evidenceInputArtifacts)),
    requiredEnvironmentTargets: uniqueStrings(matrix.flatMap((row) => row.requiredEnvironmentTargets)),
    verificationCommands: uniqueStrings(matrix.flatMap((row) => row.verificationCommands)),
    repairRequiredStepIds: uniqueStrings(matrix.flatMap((row) => row.repairRequiredStepIds)),
    dbRepairRequiredStepIds: uniqueStrings(matrix.flatMap((row) => row.dbRepairRequiredStepIds)),
    blockedPlanStepIds: uniqueStrings(matrix.flatMap((row) => row.blockedPlanStepIds)),
  }

  return { summary, matrix }
}

function classifyOperatorCommand(command) {
  const text = String(command ?? '').trim()
  if (!text) return 'read_only_evidence'
  if (
    text.startsWith('$env:')
    || text.toLowerCase().startsWith('update ')
    || text.includes('<')
    || text.includes('docker ')
    || text.includes('supabase start')
    || text.includes('supabase --version')
    || text.includes('supabase status')
  ) {
    return 'manual_prerequisite'
  }
  if (
    text.includes('build-default-master-plan-production-evidence-pipeline')
    || text.includes('evidence:default-master-plan:export-sources')
  ) {
    return 'production_or_live_guarded'
  }
  if (
    text.includes('check-default-master-plan-candidate-refresh-execution-readiness')
    || text.includes('check-default-master-plan-candidate-baseline-materialization-readiness')
    || text.includes('check-default-master-plan-runtime-seed-import-readiness')
  ) {
    return 'read_only_evidence'
  }
  if (
    text.includes('candidate-refresh-execution')
    || text.includes('candidate-baseline-materialization')
    || text.includes('runtime-seed-import-execution')
  ) {
    return 'guarded_write_or_db_dependent'
  }
  return 'read_only_evidence'
}

function operatorCommandExecutionReadiness(groupStatus) {
  if (groupStatus === 'deferred') return 'deferred'
  if (groupStatus === 'blocked') return 'blocked'
  return 'ready'
}

function pushOperatorCommands(entries, group, commands, commandSource) {
  const actionGroupId = String(group.id ?? '').trim()
  const status = String(group.status ?? '').trim()
  const priority = readNumber(group.priority)
  for (const command of arrayOfStrings(commands)) {
    entries.push({
      actionGroupId,
      priority,
      status,
      commandSource,
      executionReadiness: operatorCommandExecutionReadiness(status),
      commandKind: classifyOperatorCommand(command),
      command,
    })
  }
}

function buildOperatorCommandPlan(prioritizedNextActionGroups) {
  const actionGroups = Array.isArray(prioritizedNextActionGroups) ? prioritizedNextActionGroups : []
  const plan = []
  for (const group of actionGroups) {
    pushOperatorCommands(plan, group, group.commands, 'action_group_command')
    for (const requirement of Array.isArray(group.operatorRequirements) ? group.operatorRequirements : []) {
      const actionId = String(readObject(requirement).actionId ?? '').trim() || 'unknown'
      const nextRequirements = readObject(readObject(requirement).nextRequirements)
      pushOperatorCommands(
        plan,
        group,
        nextRequirements.verificationCommands,
        `operator_requirement:${actionId}:verification`,
      )
    }

    for (const [planName, sourcePrefix] of [
      ['repairPlan', 'repair_plan'],
      ['dbRepairPlan', 'db_repair_plan'],
      ['executionGatePlan', 'execution_gate_plan'],
    ]) {
      const actionPlan = readObject(group[planName])
      for (const step of Array.isArray(actionPlan.orderedSteps) ? actionPlan.orderedSteps : []) {
        const stepId = String(readObject(step).id ?? '').trim() || 'unknown'
        pushOperatorCommands(plan, group, readObject(step).commands, `${sourcePrefix}:${stepId}:command`)
        pushOperatorCommands(plan, group, readObject(step).verificationCommands, `${sourcePrefix}:${stepId}:verification`)
      }
    }

    const materializationNextCommands = readObject(readObject(group.materializationReadinessPlan).nextCommands)
    for (const [key, value] of Object.entries(materializationNextCommands)) {
      pushOperatorCommands(plan, group, [value], `materialization_next_command:${key}`)
    }
  }

  const summary = {
    actionGroupCount: actionGroups.length,
    totalCommandCount: plan.length,
    blockedCommandCount: plan.filter((entry) => entry.executionReadiness === 'blocked').length,
    deferredCommandCount: plan.filter((entry) => entry.executionReadiness === 'deferred').length,
    readOnlyEvidenceCommandCount: plan.filter((entry) => entry.commandKind === 'read_only_evidence').length,
    guardedWriteOrLiveCommandCount: plan.filter((entry) => (
      entry.commandKind === 'guarded_write_or_db_dependent'
      || entry.commandKind === 'production_or_live_guarded'
    )).length,
    manualPrerequisiteCommandCount: plan.filter((entry) => entry.commandKind === 'manual_prerequisite').length,
  }

  return { summary, plan }
}

function normalizeOperatorCommandKey(command) {
  return normalizeOperatorCommandText(command).replace(/^npm\.cmd\b/i, 'npm')
}

function normalizeOperatorCommandText(command) {
  return String(command ?? '').trim().replace(/\s+/g, ' ')
}

function preferredOperatorCommandDisplay(current, candidate) {
  const currentText = normalizeOperatorCommandText(current)
  const candidateText = normalizeOperatorCommandText(candidate)
  if (!currentText) return candidateText
  if (/^npm\.cmd\b/i.test(candidateText) && !/^npm\.cmd\b/i.test(currentText)) return candidateText
  return currentText
}

function strongestExecutionReadiness(left, right) {
  const rank = { ready: 0, deferred: 1, blocked: 2 }
  const leftValue = String(left ?? '').trim() || 'ready'
  const rightValue = String(right ?? '').trim() || 'ready'
  return (rank[rightValue] ?? 0) > (rank[leftValue] ?? 0) ? rightValue : leftValue
}

function strongestCommandKind(left, right) {
  const rank = {
    read_only_evidence: 0,
    manual_prerequisite: 1,
    guarded_write_or_db_dependent: 2,
    production_or_live_guarded: 3,
  }
  const leftValue = String(left ?? '').trim() || 'read_only_evidence'
  const rightValue = String(right ?? '').trim() || 'read_only_evidence'
  return (rank[rightValue] ?? 0) > (rank[leftValue] ?? 0) ? rightValue : leftValue
}

function buildOperatorCommandExecutionPlan(operatorCommandPlan, actionGroupCount = 0) {
  const rawPlan = Array.isArray(operatorCommandPlan) ? operatorCommandPlan : []
  const byCommand = new Map()

  for (const entry of rawPlan) {
    const command = normalizeOperatorCommandText(entry.command)
    const commandKey = normalizeOperatorCommandKey(command)
    if (!commandKey) continue
    const existing = byCommand.get(commandKey) ?? {
      command,
      executionReadiness: 'ready',
      commandKind: 'read_only_evidence',
      actionGroupIds: [],
      commandSources: [],
      duplicateCount: 0,
    }
    existing.command = preferredOperatorCommandDisplay(existing.command, command)
    existing.executionReadiness = strongestExecutionReadiness(existing.executionReadiness, entry.executionReadiness)
    existing.commandKind = strongestCommandKind(existing.commandKind, entry.commandKind)
    existing.actionGroupIds = uniqueStrings([
      ...existing.actionGroupIds,
      String(entry.actionGroupId ?? '').trim(),
    ].filter(Boolean))
    existing.commandSources = uniqueStrings([
      ...existing.commandSources,
      String(entry.commandSource ?? '').trim(),
    ].filter(Boolean))
    existing.duplicateCount += 1
    byCommand.set(commandKey, existing)
  }

  const plan = [...byCommand.values()]
  const summary = {
    actionGroupCount,
    rawCommandCount: rawPlan.length,
    uniqueCommandCount: plan.length,
    duplicateCommandCount: rawPlan.length - plan.length,
    blockedCommandCount: plan.filter((entry) => entry.executionReadiness === 'blocked').length,
    deferredCommandCount: plan.filter((entry) => entry.executionReadiness === 'deferred').length,
    readOnlyEvidenceCommandCount: plan.filter((entry) => entry.commandKind === 'read_only_evidence').length,
    guardedWriteOrLiveCommandCount: plan.filter((entry) => (
      entry.commandKind === 'guarded_write_or_db_dependent'
      || entry.commandKind === 'production_or_live_guarded'
    )).length,
    manualPrerequisiteCommandCount: plan.filter((entry) => entry.commandKind === 'manual_prerequisite').length,
  }

  return { summary, plan }
}

const OPERATOR_COMMAND_QUEUE_IDS = [
  'read_only_evidence',
  'manual_prerequisite',
  'guarded_write_or_live',
]

function operatorCommandQueueEntry(entry, queueId, autoRunAllowed) {
  return {
    ...entry,
    queueId,
    autoRunAllowed,
  }
}

function buildOperatorCommandExecutionQueues(operatorCommandExecutionPlan) {
  const plan = Array.isArray(operatorCommandExecutionPlan) ? operatorCommandExecutionPlan : []
  const queues = {
    readOnlyEvidence: [],
    manualPrerequisite: [],
    guardedWriteOrLive: [],
  }

  for (const entry of plan) {
    if (entry.commandKind === 'read_only_evidence') {
      queues.readOnlyEvidence.push(operatorCommandQueueEntry(entry, 'read_only_evidence', true))
    } else if (entry.commandKind === 'manual_prerequisite') {
      queues.manualPrerequisite.push(operatorCommandQueueEntry(entry, 'manual_prerequisite', false))
    } else {
      queues.guardedWriteOrLive.push(operatorCommandQueueEntry(entry, 'guarded_write_or_live', false))
    }
  }

  const summary = {
    totalUniqueCommandCount: plan.length,
    readOnlyEvidenceCommandCount: queues.readOnlyEvidence.length,
    manualPrerequisiteCommandCount: queues.manualPrerequisite.length,
    guardedWriteOrLiveCommandCount: queues.guardedWriteOrLive.length,
    autoRunAllowedCommandCount: queues.readOnlyEvidence.length,
    autoRunForbiddenCommandCount: queues.manualPrerequisite.length + queues.guardedWriteOrLive.length,
    queueIds: OPERATOR_COMMAND_QUEUE_IDS,
  }

  return { summary, queues }
}

function actionGroup({
  id,
  priority,
  status = 'blocked',
  blockedBy = [],
  deferredBy = [],
  nextAction,
  commands = [],
  mutationBoundary,
  repairPlan,
  dbRepairPlan,
  executionGatePlan,
  materializationReadinessPlan,
  durationAlignmentPlan,
  productionOutcomePlan,
  operatorRequirements = [],
}) {
  const normalizedRepairPlan = normalizeActionGroupRepairPlan(repairPlan)
  const normalizedDbRepairPlan = normalizeActionGroupDbRepairPlan(dbRepairPlan)
  const normalizedExecutionGatePlan = normalizeActionGroupExecutionGatePlan(executionGatePlan)
  const normalizedMaterializationReadinessPlan = normalizeActionGroupMaterializationReadinessPlan(materializationReadinessPlan)
  const normalizedDurationAlignmentPlan = normalizeActionGroupDurationAlignmentPlan(durationAlignmentPlan)
  const normalizedProductionOutcomePlan = normalizeActionGroupProductionOutcomePlan(productionOutcomePlan)
  const normalizedOperatorRequirements = normalizeOperatorRequirements(operatorRequirements)
  return {
    id,
    priority,
    status,
    blockedBy: uniqueStrings(blockedBy),
    deferredBy: uniqueStrings(deferredBy),
    nextAction,
    commands: uniqueStrings(commands),
    mutationBoundary,
    ...(normalizedOperatorRequirements.length > 0 ? { operatorRequirements: normalizedOperatorRequirements } : {}),
    ...(normalizedRepairPlan ? { repairPlan: normalizedRepairPlan } : {}),
    ...(normalizedDbRepairPlan ? { dbRepairPlan: normalizedDbRepairPlan } : {}),
    ...(normalizedExecutionGatePlan ? { executionGatePlan: normalizedExecutionGatePlan } : {}),
    ...(normalizedMaterializationReadinessPlan ? { materializationReadinessPlan: normalizedMaterializationReadinessPlan } : {}),
    ...(normalizedDurationAlignmentPlan ? { durationAlignmentPlan: normalizedDurationAlignmentPlan } : {}),
    ...(normalizedProductionOutcomePlan ? { productionOutcomePlan: normalizedProductionOutcomePlan } : {}),
  }
}

function normalizeRepairStep(step) {
  const record = readObject(step)
  return {
    id: String(record.id ?? '').trim(),
    status: String(record.status ?? '').trim(),
    blockerCodes: arrayOfStrings(record.blockerCodes ?? record.blocker_codes),
    title: String(record.title ?? '').trim(),
    commands: arrayOfStrings(record.commands),
    verificationCommands: arrayOfStrings(record.verificationCommands ?? record.verification_commands),
    notes: arrayOfStrings(record.notes),
  }
}

function normalizeActionGroupRepairPlan(repairPlan) {
  const record = readObject(repairPlan)
  const orderedSteps = Array.isArray(record.orderedSteps ?? record.ordered_steps)
    ? (record.orderedSteps ?? record.ordered_steps).map((step) => normalizeRepairStep(step))
    : []
  const status = String(record.status ?? '').trim()
  const requiredStepIds = arrayOfStrings(record.requiredStepIds ?? record.required_step_ids)
  const blockedStepIds = arrayOfStrings(record.blockedStepIds ?? record.blocked_step_ids)
  const orderedStepCount = readNumber(record.orderedStepCount ?? record.ordered_step_count ?? orderedSteps.length)
  if (!status && requiredStepIds.length === 0 && blockedStepIds.length === 0 && orderedStepCount === 0) return null
  return {
    status,
    targetClass: String(record.targetClass ?? record.target_class ?? '').trim(),
    noAutoInstall: record.noAutoInstall === true || record.no_auto_install === true,
    requiredStepIds,
    blockedStepIds,
    orderedStepCount,
    orderedSteps,
  }
}

function normalizeActionGroupDbRepairPlan(dbRepairPlan) {
  const record = readObject(dbRepairPlan)
  const orderedSteps = Array.isArray(record.orderedSteps ?? record.ordered_steps)
    ? (record.orderedSteps ?? record.ordered_steps).map((step) => normalizeRepairStep(step))
    : []
  const status = String(record.status ?? '').trim()
  const requiredStepIds = arrayOfStrings(record.requiredStepIds ?? record.required_step_ids)
  const blockedStepIds = arrayOfStrings(record.blockedStepIds ?? record.blocked_step_ids)
  const orderedStepCount = readNumber(record.orderedStepCount ?? record.ordered_step_count ?? orderedSteps.length)
  if (!status && requiredStepIds.length === 0 && blockedStepIds.length === 0 && orderedStepCount === 0) return null
  return {
    status,
    failureClass: String(record.failureClass ?? record.failure_class ?? '').trim(),
    noAutoCredentialRotation: record.noAutoCredentialRotation === true || record.no_auto_credential_rotation === true,
    requiredStepIds,
    blockedStepIds,
    orderedStepCount,
    orderedSteps,
  }
}

function normalizeActionGroupExecutionGatePlan(executionGatePlan) {
  const record = readObject(executionGatePlan)
  const orderedSteps = Array.isArray(record.orderedSteps ?? record.ordered_steps)
    ? (record.orderedSteps ?? record.ordered_steps).map((step) => normalizeRepairStep(step))
    : []
  const status = String(record.status ?? '').trim()
  const requiredStepIds = arrayOfStrings(record.requiredStepIds ?? record.required_step_ids)
  const blockedStepIds = arrayOfStrings(record.blockedStepIds ?? record.blocked_step_ids)
  const orderedStepCount = readNumber(record.orderedStepCount ?? record.ordered_step_count ?? orderedSteps.length)
  if (!status && requiredStepIds.length === 0 && blockedStepIds.length === 0 && orderedStepCount === 0) return null
  return {
    status,
    noAutoExecution: record.noAutoExecution === true || record.no_auto_execution === true,
    requiredStepIds,
    blockedStepIds,
    orderedStepCount,
    orderedSteps,
  }
}

function normalizeActionGroupMaterializationReadinessPlan(materializationReadinessPlan) {
  const record = readObject(materializationReadinessPlan)
  const nextCommands = readObject(record.nextCommands ?? record.next_commands)
  const status = String(record.status ?? '').trim()
  const blockers = arrayOfStrings(record.blockers)
  const unlockVariable = String(record.unlockVariable ?? record.unlock_variable ?? '').trim()
  const materializationCommandReady = record.materializationCommandReady === true || record.materialization_command_ready === true
  if (!status && !unlockVariable && blockers.length === 0 && !materializationCommandReady) return null
  return {
    status,
    productionReady: record.productionReady === true || record.production_ready === true,
    baselineId: String(record.baselineId ?? record.baseline_id ?? '').trim(),
    projectId: String(record.projectId ?? record.project_id ?? '').trim(),
    businessType: String(record.businessType ?? record.business_type ?? '').trim(),
    environment: String(record.environment ?? '').trim(),
    materializationCommandReady,
    unlockVariable,
    unlockPresent: record.unlockPresent === true || record.unlock_present === true,
    executeReady: record.executeReady === true || record.execute_ready === true,
    operatorMustRunManually: record.operatorMustRunManually === true || record.operator_must_run_manually === true,
    blockers,
    doesNotConnectDatabase: record.doesNotConnectDatabase === true || record.does_not_connect_database === true,
    commandsExecuted: readNumber(record.commandsExecuted ?? record.commands_executed),
    writesCandidateBaselines: record.writesCandidateBaselines === true || record.writes_candidate_baselines === true,
    writesTaskBaselineItems: record.writesTaskBaselineItems === true || record.writes_task_baseline_items === true,
    nextCommands: {
      setUnlockPowerShell: String(nextCommands.setUnlockPowerShell ?? nextCommands.set_unlock_power_shell ?? '').trim(),
      executeCandidateBaselineMaterialization: String(nextCommands.executeCandidateBaselineMaterialization ?? nextCommands.execute_candidate_baseline_materialization ?? '').trim(),
      refreshOperatorHandoff: String(nextCommands.refreshOperatorHandoff ?? nextCommands.refresh_operator_handoff ?? '').trim(),
      refreshOperatorHandoffPreflight: String(nextCommands.refreshOperatorHandoffPreflight ?? nextCommands.refresh_operator_handoff_preflight ?? '').trim(),
      refreshRealEvidenceGaps: String(nextCommands.refreshRealEvidenceGaps ?? nextCommands.refresh_real_evidence_gaps ?? '').trim(),
    },
  }
}

function normalizeDurationPlanExample(record, fields) {
  const source = readObject(record)
  const normalized = {}
  for (const field of fields) {
    const snake = field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
    if (field.endsWith('Count') || field === 'priority') {
      normalized[field] = readNumber(source[field] ?? source[snake])
    } else if (field.endsWith('Ids') || field === 'blockers') {
      normalized[field] = arrayOfStrings(source[field] ?? source[snake])
    } else {
      normalized[field] = String(source[field] ?? source[snake] ?? '').trim()
    }
  }
  return normalized
}

function normalizeActionGroupDurationAlignmentPlan(durationAlignmentPlan) {
  const record = readObject(durationAlignmentPlan)
  const completedTaskExport = readObject(record.completedTaskExport ?? record.completed_task_export)
  const runtimeCandidateAlignment = readObject(record.runtimeCandidateAlignment ?? record.runtime_candidate_alignment)
  const runtimeTaskAlignmentRefreshPackage = readObject(record.runtimeTaskAlignmentRefreshPackage ?? record.runtime_task_alignment_refresh_package)
  const realDurationSampleMaterialPreflight = readObject(record.realDurationSampleMaterialPreflight ?? record.real_duration_sample_material_preflight)
  const hasPlanData = Object.keys(completedTaskExport).length > 0
    || Object.keys(runtimeCandidateAlignment).length > 0
    || Object.keys(runtimeTaskAlignmentRefreshPackage).length > 0
    || Object.keys(realDurationSampleMaterialPreflight).length > 0
  if (!hasPlanData) return null

  return {
    completedTaskExport: {
      status: String(completedTaskExport.status ?? '').trim(),
      requiredStableCodeCount: readNumber(completedTaskExport.requiredStableCodeCount ?? completedTaskExport.required_stable_code_count),
      rawTaskCount: readNumber(completedTaskExport.rawTaskCount ?? completedTaskExport.raw_task_count),
      exportedTaskCount: readNumber(completedTaskExport.exportedTaskCount ?? completedTaskExport.exported_task_count),
      invalidTaskCount: readNumber(completedTaskExport.invalidTaskCount ?? completedTaskExport.invalid_task_count),
      titleMismatchCount: readNumber(completedTaskExport.titleMismatchCount ?? completedTaskExport.title_mismatch_count),
      missingStableCodeCount: readNumber(completedTaskExport.missingStableCodeCount ?? completedTaskExport.missing_stable_code_count),
      missingStableCodes: arrayOfStrings(completedTaskExport.missingStableCodes ?? completedTaskExport.missing_stable_codes).slice(0, 10),
      invalidTaskExamples: Array.isArray(completedTaskExport.invalidTaskExamples ?? completedTaskExport.invalid_task_examples)
        ? (completedTaskExport.invalidTaskExamples ?? completedTaskExport.invalid_task_examples).slice(0, 5).map((example) => normalizeDurationPlanExample(example, [
            'id',
            'stableCode',
            'matchingRequestedStableCodeByTitle',
            'matchingRequestedTitleByTitle',
            'recommendedAction',
            'blockers',
          ]))
        : [],
      blockers: arrayOfStrings(completedTaskExport.blockers),
    },
    runtimeCandidateAlignment: {
      status: String(runtimeCandidateAlignment.status ?? '').trim(),
      candidateRowCount: readNumber(runtimeCandidateAlignment.candidateRowCount ?? runtimeCandidateAlignment.candidate_row_count),
      runtimeTaskCount: readNumber(runtimeCandidateAlignment.runtimeTaskCount ?? runtimeCandidateAlignment.runtime_task_count),
      missingRuntimeTaskCount: readNumber(runtimeCandidateAlignment.missingRuntimeTaskCount ?? runtimeCandidateAlignment.missing_runtime_task_count),
      titleMismatchCount: readNumber(runtimeCandidateAlignment.titleMismatchCount ?? runtimeCandidateAlignment.title_mismatch_count),
      rowsMissingActualDateRangeCount: readNumber(runtimeCandidateAlignment.rowsMissingActualDateRangeCount ?? runtimeCandidateAlignment.rows_missing_actual_date_range_count),
      driftExamples: Array.isArray(runtimeCandidateAlignment.driftExamples ?? runtimeCandidateAlignment.drift_examples)
        ? (runtimeCandidateAlignment.driftExamples ?? runtimeCandidateAlignment.drift_examples).slice(0, 5).map((example) => normalizeDurationPlanExample(example, [
            'stableCode',
            'runtimeTaskId',
            'alignmentStatus',
            'matchingCandidateStableCodeByRuntimeTitle',
            'recommendedAction',
            'blockers',
          ]))
        : [],
      blockers: arrayOfStrings(runtimeCandidateAlignment.blockers),
    },
    runtimeTaskAlignmentRefreshPackage: {
      status: String(runtimeTaskAlignmentRefreshPackage.status ?? '').trim(),
      actionCount: readNumber(runtimeTaskAlignmentRefreshPackage.actionCount ?? runtimeTaskAlignmentRefreshPackage.action_count),
      stableCodeRefreshReviewActionCount: readNumber(runtimeTaskAlignmentRefreshPackage.stableCodeRefreshReviewActionCount ?? runtimeTaskAlignmentRefreshPackage.stable_code_refresh_review_action_count),
      missingRuntimeTaskActionCount: readNumber(runtimeTaskAlignmentRefreshPackage.missingRuntimeTaskActionCount ?? runtimeTaskAlignmentRefreshPackage.missing_runtime_task_action_count),
      actualDateRangeCollectionActionCount: readNumber(runtimeTaskAlignmentRefreshPackage.actualDateRangeCollectionActionCount ?? runtimeTaskAlignmentRefreshPackage.actual_date_range_collection_action_count),
      collisionReviewActionCount: readNumber(runtimeTaskAlignmentRefreshPackage.collisionReviewActionCount ?? runtimeTaskAlignmentRefreshPackage.collision_review_action_count),
      executeAllowed: runtimeTaskAlignmentRefreshPackage.executeAllowed === true || runtimeTaskAlignmentRefreshPackage.execute_allowed === true,
      actionExamples: Array.isArray(runtimeTaskAlignmentRefreshPackage.actionExamples ?? runtimeTaskAlignmentRefreshPackage.action_examples)
        ? (runtimeTaskAlignmentRefreshPackage.actionExamples ?? runtimeTaskAlignmentRefreshPackage.action_examples).slice(0, 5).map((example) => normalizeDurationPlanExample(example, [
            'stableCode',
            'runtimeTaskId',
            'actionKind',
            'proposedStableCode',
            'recommendedOperatorAction',
            'blockers',
          ]))
        : [],
      blockers: arrayOfStrings(runtimeTaskAlignmentRefreshPackage.blockers),
    },
    realDurationSampleMaterialPreflight: {
      status: String(realDurationSampleMaterialPreflight.status ?? '').trim(),
      checkedBy: String(realDurationSampleMaterialPreflight.checkedBy ?? realDurationSampleMaterialPreflight.checked_by ?? '').trim(),
      requiredStableCodeCount: readNumber(realDurationSampleMaterialPreflight.requiredStableCodeCount ?? realDurationSampleMaterialPreflight.required_stable_code_count),
      readyStableCodeCount: readNumber(realDurationSampleMaterialPreflight.readyStableCodeCount ?? realDurationSampleMaterialPreflight.ready_stable_code_count),
      missingStableCodeCount: readNumber(realDurationSampleMaterialPreflight.missingStableCodeCount ?? realDurationSampleMaterialPreflight.missing_stable_code_count),
      invalidSampleCount: readNumber(realDurationSampleMaterialPreflight.invalidSampleCount ?? realDurationSampleMaterialPreflight.invalid_sample_count),
      missingStableCodes: arrayOfStrings(realDurationSampleMaterialPreflight.missingStableCodes ?? realDurationSampleMaterialPreflight.missing_stable_codes).slice(0, 10),
      nextSampleCollectionTargets: Array.isArray(realDurationSampleMaterialPreflight.nextSampleCollectionTargets ?? realDurationSampleMaterialPreflight.next_sample_collection_targets)
        ? (realDurationSampleMaterialPreflight.nextSampleCollectionTargets ?? realDurationSampleMaterialPreflight.next_sample_collection_targets).slice(0, 5).map((target) => normalizeDurationPlanExample(target, [
            'priority',
            'businessType',
            'stableCode',
            'requiredAcceptedSampleCount',
            'readySampleCount',
            'missingSampleCount',
            'invalidSampleCount',
            'nextAction',
          ]))
        : [],
      readySampleExamples: Array.isArray(realDurationSampleMaterialPreflight.readySampleExamples ?? realDurationSampleMaterialPreflight.ready_sample_examples)
        ? (realDurationSampleMaterialPreflight.readySampleExamples ?? realDurationSampleMaterialPreflight.ready_sample_examples).slice(0, 5).map((example) => normalizeDurationPlanExample(example, [
            'stableCode',
            'readySampleCount',
            'readySampleIds',
          ]))
        : [],
      blockers: arrayOfStrings(realDurationSampleMaterialPreflight.blockers),
      writesDurationSamples: realDurationSampleMaterialPreflight.writesDurationSamples === true || realDurationSampleMaterialPreflight.writes_duration_samples === true,
      writesRuntimePublication: realDurationSampleMaterialPreflight.writesRuntimePublication === true || realDurationSampleMaterialPreflight.writes_runtime_publication === true,
    },
  }
}

function buildDurationAlignmentPlan({
  completedTaskExportSummary,
  runtimeCandidateAlignmentSummary,
  runtimeTaskAlignmentRefreshPackageSummary,
  realDurationSampleMaterialPreflightSummary,
}) {
  return normalizeActionGroupDurationAlignmentPlan({
    completedTaskExport: completedTaskExportSummary,
    runtimeCandidateAlignment: runtimeCandidateAlignmentSummary,
    runtimeTaskAlignmentRefreshPackage: runtimeTaskAlignmentRefreshPackageSummary,
    realDurationSampleMaterialPreflight: realDurationSampleMaterialPreflightSummary,
  })
}

function normalizeActionGroupProductionOutcomePlan(productionOutcomePlan) {
  const record = readObject(productionOutcomePlan)
  const realProductionOutcomePackage = readObject(record.realProductionOutcomePackage ?? record.real_production_outcome_package)
  const operatorHandoff = readObject(record.operatorHandoff ?? record.operator_handoff)
  const productionReadinessBlockers = arrayOfStrings(record.productionReadinessBlockers ?? record.production_readiness_blockers)
  const hasPlanData = Object.keys(realProductionOutcomePackage).length > 0
    || Object.keys(operatorHandoff).length > 0
    || productionReadinessBlockers.length > 0
  if (!hasPlanData) return null

  return {
    realProductionOutcomePackage: {
      status: String(realProductionOutcomePackage.status ?? '').trim(),
      productionReady: realProductionOutcomePackage.productionReady === true || realProductionOutcomePackage.production_ready === true,
      targetEnvironment: String(realProductionOutcomePackage.targetEnvironment ?? realProductionOutcomePackage.target_environment ?? '').trim(),
      realProductionOutcomePath: String(realProductionOutcomePackage.realProductionOutcomePath ?? realProductionOutcomePackage.real_production_outcome_path ?? '').trim(),
      requiredFields: arrayOfStrings(realProductionOutcomePackage.requiredFields ?? realProductionOutcomePackage.required_fields),
      requiredFieldCount: readNumber(realProductionOutcomePackage.requiredFieldCount ?? realProductionOutcomePackage.required_field_count),
      blockers: arrayOfStrings(realProductionOutcomePackage.blockers),
      validationBlockers: arrayOfStrings(realProductionOutcomePackage.validationBlockers ?? realProductionOutcomePackage.validation_blockers),
    },
    operatorHandoff: {
      sourceExportMode: String(operatorHandoff.sourceExportMode ?? operatorHandoff.source_export_mode ?? '').trim(),
      mayRunSupportingSourceExport: operatorHandoff.mayRunSupportingSourceExport === true || operatorHandoff.may_run_supporting_source_export === true,
      mayRunProductionSourceExport: operatorHandoff.mayRunProductionSourceExport === true || operatorHandoff.may_run_production_source_export === true,
      mayRunSourceExport: operatorHandoff.mayRunSourceExport === true || operatorHandoff.may_run_source_export === true,
      mayAcceptRealProductionOutcomeEvidence: operatorHandoff.mayAcceptRealProductionOutcomeEvidence === true || operatorHandoff.may_accept_real_production_outcome_evidence === true,
      mayRunProductionEvidencePipeline: operatorHandoff.mayRunProductionEvidencePipeline === true || operatorHandoff.may_run_production_evidence_pipeline === true,
      productionSourceExportBlockers: arrayOfStrings(operatorHandoff.productionSourceExportBlockers ?? operatorHandoff.production_source_export_blockers),
      realProductionOutcomeEvidenceBlockers: arrayOfStrings(operatorHandoff.realProductionOutcomeEvidenceBlockers ?? operatorHandoff.real_production_outcome_evidence_blockers),
      currentBlockers: arrayOfStrings(operatorHandoff.currentBlockers ?? operatorHandoff.current_blockers).slice(0, 20),
      blockedActionIds: arrayOfStrings(operatorHandoff.blockedActionIds ?? operatorHandoff.blocked_action_ids),
      deferredActionIds: arrayOfStrings(operatorHandoff.deferredActionIds ?? operatorHandoff.deferred_action_ids),
      runnableActionIds: arrayOfStrings(operatorHandoff.runnableActionIds ?? operatorHandoff.runnable_action_ids),
    },
    productionReadinessBlockers,
  }
}

function buildProductionOutcomePlan({
  realProductionOutcomePackageSummary,
  operatorHandoffSummary,
  productionReadinessBlockers,
}) {
  return normalizeActionGroupProductionOutcomePlan({
    realProductionOutcomePackage: realProductionOutcomePackageSummary,
    operatorHandoff: operatorHandoffSummary,
    productionReadinessBlockers,
  })
}

function buildPrioritizedNextActionGroups({
  operatorHandoffSummary,
  runtimeSeedEvidencePipelineSummary,
  completedTaskExportSummary,
  runtimeCandidateAlignmentSummary,
  runtimeTaskAlignmentRefreshPackageSummary,
  realDurationSampleMaterialPreflightSummary,
  realProductionOutcomePackageSummary,
  candidateBaselineMaterializationReadinessSealSummary,
  productionReadinessBlockers,
}) {
  const groups = []
  const operatorCurrentBlockers = arrayOfStrings(operatorHandoffSummary.currentBlockers)
  const operatorPreflightBlockers = arrayOfStrings(operatorHandoffSummary.preflightBlockers)
  const productionSourceExportBlockers = arrayOfStrings(operatorHandoffSummary.productionSourceExportBlockers)
  const realProductionOutcomeEvidenceBlockers = arrayOfStrings(operatorHandoffSummary.realProductionOutcomeEvidenceBlockers)
  const handoffBlockers = uniqueStrings([
    ...operatorCurrentBlockers,
    ...operatorPreflightBlockers,
    ...productionSourceExportBlockers,
    ...realProductionOutcomeEvidenceBlockers,
  ])

  const candidateRefreshBlockers = matchingBlockers(handoffBlockers, [
    'candidate_baseline_refresh_required',
    'candidate_refresh_preflight_',
    'candidate_refresh_execution_',
    'candidate_refresh_execute_mode_required',
    'candidate_refresh_operator_approval_required',
    'candidate_refresh_refreshed_by_required',
    'human_candidate_refresh_actor_required',
    'candidate_refresh_db_connection_failed',
    'candidate_refresh_db_execution_failed',
  ])
  if (candidateRefreshBlockers.length > 0) {
    groups.push(actionGroup({
      id: 'candidate_refresh_db_execution',
      priority: 10,
      blockedBy: candidateRefreshBlockers,
      nextAction: 'Restore or confirm the candidate-refresh database connection, rerun the candidate refresh preflight/execution chain, then rebuild operator handoff and gap summary before collecting duration samples.',
      commands: [
        'npm run evidence:default-master-plan:candidate-refresh-preflight',
        'npm run evidence:default-master-plan:candidate-refresh-execution',
        'node project-testing/tools/build-default-master-plan-candidate-refresh-authorization-package.mjs',
        'npm run evidence:default-master-plan:operator-handoff',
        'npm run evidence:default-master-plan:operator-handoff-preflight',
        'npm run evidence:default-master-plan:real-evidence-gaps',
      ],
      mutationBoundary: 'candidate refresh execution is DB-dependent and must remain behind the existing execute/unlock controls.',
      dbRepairPlan: operatorHandoffSummary.candidateRefreshExecution?.dbRepairPlan,
      executionGatePlan: operatorHandoffSummary.candidateRefreshExecution?.executionGatePlan,
      operatorRequirements: operatorRequirementsForActions(operatorHandoffSummary, ['candidate_refresh_execution']),
    }))
  }

  const materializationBlockers = matchingBlockers(handoffBlockers, [
    'candidate_baseline_materialization_execute_mode_required',
    'candidate_baseline_materialization_allow_flag_required',
    'candidate_baseline_materialization_unlock_required',
  ])
  if (materializationBlockers.length > 0) {
    groups.push(actionGroup({
      id: 'candidate_baseline_materialization_unlock',
      priority: 20,
      blockedBy: materializationBlockers,
      nextAction: 'After candidate refresh package review, run candidate baseline materialization only with execute mode, allow flag, and explicit unlock; otherwise keep this gate blocked.',
      commands: [
        'npm run evidence:default-master-plan:candidate-baseline-materialization',
      ],
      mutationBoundary: 'DB write path; do not run without explicit materialization approval and unlock.',
      materializationReadinessPlan: candidateBaselineMaterializationReadinessSealSummary,
      operatorRequirements: operatorRequirementsForActions(operatorHandoffSummary, ['candidate_baseline_materialization']),
    }))
  }

  const runtimeSeedBlockers = uniqueStrings([
    ...arrayOfStrings(runtimeSeedEvidencePipelineSummary.blockers),
    ...arrayOfStrings(runtimeSeedEvidencePipelineSummary.importGate?.blockers),
    ...matchingBlockers(handoffBlockers, [
      'runtime_seed_pipeline_',
      'runtime_seed_import_execution_',
      'local_supabase_',
      'supabase_cli_missing',
      'docker_cli_missing',
      'local_duration_asset_seed_import_unlock_required',
      'runtime_seed_and_reference_days_evidence',
    ]),
  ])
  const runtimeSeedRootBlockerCodes = [
    'local_supabase_endpoint_unreachable',
    'local_supabase_must_be_reachable_before_seed_import',
    'supabase_cli_missing_for_local_seed_setup',
    'docker_cli_missing_for_local_supabase',
    'local_duration_asset_seed_import_unlock_required',
    'runtime_seed_import_gate_not_allowed',
    'runtime_seed_import_execution_allow_import_required',
    'runtime_seed_import_seed_smoke_user_id_required',
    'runtime_seed_and_reference_days_evidence',
  ]
  const runtimeSeedRootBlockers = rootBlockersFromKnownCodes(runtimeSeedBlockers, runtimeSeedRootBlockerCodes)
  if (runtimeSeedRootBlockers.length > 0) {
    groups.push(actionGroup({
      id: 'runtime_seed_local_environment_and_import',
      priority: 30,
      blockedBy: runtimeSeedRootBlockers,
      nextAction: 'Prepare the local runtime seed environment, supply the seed import unlock and auditable operator id, then rerun runtime seed pipeline/import/post-import verification before treating active duration seeds, T2 rhythm templates, or runtime reference days as available.',
      commands: [
        'npm run evidence:default-master-plan:runtime-seed-env',
        'npm run evidence:default-master-plan:runtime-seed-pipeline',
        'npm run evidence:default-master-plan:runtime-seed-import-execution',
        'npm run evidence:default-master-plan:runtime-seed-post-import',
      ],
      mutationBoundary: 'local active seed smoke import only; no production seed write and no production-ready claim.',
      repairPlan: runtimeSeedEvidencePipelineSummary.environment?.repairPlan,
      operatorRequirements: operatorRequirementsForActions(operatorHandoffSummary, ['runtime_seed_import_execution'], { writeExecution: true }),
    }))
  }

  const candidateRefreshDeferred = readObject(operatorHandoffSummary.deferredCurrentBlockers?.candidateRefreshDependent)
  const deferredByCandidateRefresh = arrayOfStrings(candidateRefreshDeferred.deferredBy)
  const deferredCandidateRefreshBlockers = arrayOfStrings(candidateRefreshDeferred.blockers)
  const rawDurationAlignmentBlockers = uniqueStrings([
    ...arrayOfStrings(completedTaskExportSummary.blockers),
    ...arrayOfStrings(runtimeCandidateAlignmentSummary.blockers),
    ...arrayOfStrings(runtimeTaskAlignmentRefreshPackageSummary.blockers),
    ...arrayOfStrings(realDurationSampleMaterialPreflightSummary.blockers),
    ...deferredCandidateRefreshBlockers,
  ])
  const durationAlignmentBlockers = rootBlockersFromKnownCodes(rawDurationAlignmentBlockers, [
    'invalid_completed_task_rows_present',
    'completed_task_export_coverage_incomplete',
    'runtime_candidate_alignment_coverage_incomplete',
    'runtime_candidate_title_mismatch_rows_present',
    'runtime_candidate_actual_date_range_missing',
    'runtime_task_alignment_operator_review_required',
    'accepted_real_duration_samples_required',
    'duration_sample_coverage_status_must_be_covered',
    'duration_sample_coverage_verified_l2_required',
    'duration_samples_operator_supplied_real_duration_sample_export_required',
    'duration_sample_coverage_collection_package_ref_mismatch',
    'material_source_evidence_placeholders_present',
    'real_duration_sample_material_template_must_be_filled',
    'invalid_real_duration_sample_material_present',
    'accepted_real_duration_sample_material_coverage_incomplete',
    'runtime_duration_calibration_evidence',
    'runtime_evidence_lineage_consistency',
  ])
  if (durationAlignmentBlockers.length > 0) {
    groups.push(actionGroup({
      id: 'runtime_task_alignment_and_duration_samples',
      priority: 40,
      status: deferredByCandidateRefresh.length > 0 ? 'deferred' : 'blocked',
      blockedBy: durationAlignmentBlockers,
      deferredBy: deferredByCandidateRefresh,
      nextAction: deferredByCandidateRefresh.length > 0
        ? 'Defer runtime task alignment and real duration sample acceptance until the candidate refresh DB execution is closed; then review stableCode/title drift and collect accepted actual-date samples.'
        : 'Review runtime task stableCode/title drift, collect missing completed-task actual dates, rerun real duration sample preflight/export, then rebuild duration calibration evidence.',
      commands: [
        'npm run evidence:default-master-plan:runtime-candidate-alignment',
        'npm run evidence:default-master-plan:runtime-task-alignment-refresh-package',
        'npm run evidence:default-master-plan:real-duration-sample-preflight',
        'npm run evidence:default-master-plan:real-duration-sample-export',
      ],
      mutationBoundary: 'source material and report chain only until governed writers are explicitly unlocked.',
      durationAlignmentPlan: buildDurationAlignmentPlan({
        completedTaskExportSummary,
        runtimeCandidateAlignmentSummary,
        runtimeTaskAlignmentRefreshPackageSummary,
        realDurationSampleMaterialPreflightSummary,
      }),
      operatorRequirements: operatorRequirementsForActions(operatorHandoffSummary, ['real_duration_sample_source_export']),
    }))
  }

  const productionOutcomeBlockers = uniqueStrings([
    ...arrayOfStrings(productionReadinessBlockers),
    ...realProductionOutcomeEvidenceBlockers,
    ...arrayOfStrings(realProductionOutcomePackageSummary.blockers),
    ...productionSourceExportBlockers,
    ...matchingBlockers(handoffBlockers, [
      'real_production_outcome',
      'production_or_live',
      'staging_controlled_replay_not_production_ready',
    ]),
  ])
  if (productionOutcomeBlockers.length > 0) {
    groups.push(actionGroup({
      id: 'production_live_outcome_evidence',
      priority: 50,
      blockedBy: productionOutcomeBlockers,
      nextAction: 'Collect a real production/live outcome file with publication, API/UI smoke, critical-path readback, rollback, approval, acceptedBy, and acceptedAt refs; staging controlled replay remains supporting evidence only.',
      commands: [
        'npm run evidence:default-master-plan:real-outcome-package',
        'npm run evidence:default-master-plan:export-sources',
        'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
      ],
      mutationBoundary: 'production/live evidence only after explicit environment ownership, approval, monitoring, and rollback handoff.',
      productionOutcomePlan: buildProductionOutcomePlan({
        realProductionOutcomePackageSummary,
        operatorHandoffSummary,
        productionReadinessBlockers,
      }),
      operatorRequirements: operatorRequirementsForActions(operatorHandoffSummary, ['production_evidence_pipeline']),
    }))
  }

  return groups.sort((left, right) => left.priority - right.priority)
}

function summarizeReadiness(readiness) {
  const rawGates = Array.isArray(readiness.gates) ? readiness.gates : []
  const gates = rawGates.filter((gate) => !isLegacyRuntimePmReviewBlocker(gate.id))
  const gateSummary = buildGateSummary(readiness, gates)
  const rawProductionReadinessBlockers = arrayOfStrings(readiness.productionReadinessBlockers)
  const productionReadinessBlockers = rawProductionReadinessBlockers
    .filter((blocker) => !isLegacyRuntimePmReviewBlocker(blocker))
  const closedLocalGates = gates.filter((gate) => (
    gate.status === 'pass'
    && ['local_static', 'tooling_readiness'].includes(String(gate.tier ?? 'local_static'))
  ))
  const blockedRealGates = gates.filter((gate) => gate.status === 'blocked' || gate.status === 'fail')
  const blockedRealGateSummaries = blockedRealGates.map((gate) => ({
    id: String(gate.id ?? '').trim(),
    tier: String(gate.tier ?? '').trim(),
    status: String(gate.status ?? '').trim(),
    blockers: arrayOfStrings(gate.blockers ?? gate.evidence?.gaps),
  }))
  const hasProductionReadinessGate = blockedRealGateSummaries.some((gate) => gate.id === 'production_readiness')

  const rawBlockedGateIds = rawGates
    .filter((gate) => gate.status === 'blocked' || gate.status === 'fail')
    .map((gate) => String(gate.id ?? '').trim())
    .filter(Boolean)
  const legacyPmOnlyBlock = readiness.productionReady !== true
    && rawBlockedGateIds.length > 0
    && rawBlockedGateIds.every(isLegacyRuntimePmReviewBlocker)
    && rawProductionReadinessBlockers.every(isLegacyRuntimePmReviewBlocker)
  const productionReady = readiness.productionReady === true || legacyPmOnlyBlock

  if (!productionReady && productionReadinessBlockers.length > 0 && !hasProductionReadinessGate) {
    blockedRealGateSummaries.push({
      id: 'production_readiness',
      tier: 'production_or_live_outcome',
      status: 'blocked',
      blockers: productionReadinessBlockers,
    })
  }

  return {
    gates,
    gateSummary,
    productionReady,
    legacyPmOnlyBlockIgnored: legacyPmOnlyBlock,
    productionReadinessBlockers,
    closedLocalGateIds: closedLocalGates.map((gate) => String(gate.id ?? '').trim()).filter(Boolean),
    blockedRealGates: blockedRealGateSummaries,
  }
}

function summarizeReviewEvidence(reviewEvidence) {
  const review = readObject(reviewEvidence.candidate_governance_review ?? reviewEvidence.candidateGovernanceReview)
  return {
    status: Object.keys(readObject(reviewEvidence)).length > 0 ? 'available_for_offline_calibration' : 'not_provided',
    requiredForRuntime: false,
    intendedUse: 'offline_development_quality_review_and_template_calibration',
    sourceStatus: String(reviewEvidence.status ?? '').trim(),
    baselineId: String(reviewEvidence.baselineId ?? reviewEvidence.baseline_id ?? '').trim(),
    projectId: String(reviewEvidence.projectId ?? reviewEvidence.project_id ?? '').trim(),
    reviewedBy: String(review.reviewed_by ?? review.reviewedBy ?? '').trim(),
    reviewedAt: String(review.reviewed_at ?? review.reviewedAt ?? '').trim(),
    reviewedItemCount: readNumber(review.reviewed_item_count ?? review.reviewedItemCount),
    reviewedItemIds: arrayOfStrings(review.reviewed_item_ids ?? review.reviewedItemIds),
    qualityFindings: arrayOfStrings(reviewEvidence.blockers),
  }
}

function summarizeDurationEvidence(durationEvidence) {
  return {
    status: String(durationEvidence.status ?? '').trim(),
    evidenceLevel: String(durationEvidence.evidenceLevel ?? durationEvidence.evidence_level ?? '').trim(),
    baselineId: String(durationEvidence.baselineId ?? durationEvidence.baseline_id ?? '').trim(),
    projectId: String(durationEvidence.projectId ?? durationEvidence.project_id ?? '').trim(),
    acceptedRealDurationSampleCount: readNumber(
      durationEvidence.acceptedRealDurationSampleCount
      ?? durationEvidence.accepted_real_duration_sample_count,
    ),
    calibratedReferenceDayCount: readNumber(
      durationEvidence.calibratedReferenceDayCount
      ?? durationEvidence.calibrated_reference_day_count,
    ),
    calibrationDeltaCount: readNumber(durationEvidence.calibrationDeltaCount ?? durationEvidence.calibration_delta_count),
    blockers: arrayOfStrings(durationEvidence.blockers),
  }
}

function summarizeRuntimeSeedEvidencePipeline(runtimeSeedEvidencePipeline) {
  const summary = readObject(runtimeSeedEvidencePipeline.summary)
  const preflight = readObject(summary.preflight)
  const environment = readObject(summary.environment)
  const environmentRepairPlan = readObject(environment.repairPlan ?? environment.repair_plan)
  const repairPlanOrderedSteps = Array.isArray(environmentRepairPlan.orderedSteps ?? environmentRepairPlan.ordered_steps)
    ? (environmentRepairPlan.orderedSteps ?? environmentRepairPlan.ordered_steps).map((step) => normalizeRepairStep(step))
    : []
  const runtimeReferenceDays = readObject(preflight.runtimeReferenceDays ?? preflight.runtime_reference_days)
  const coverage = readObject(summary.coverage)
  const importGate = readObject(summary.importGate ?? summary.import_gate)
  return {
    status: String(runtimeSeedEvidencePipeline.status ?? '').trim(),
    blockers: arrayOfStrings(runtimeSeedEvidencePipeline.blockers),
    environment: {
      status: String(environment.status ?? '').trim(),
      targetClass: String(environment.targetClass ?? environment.target_class ?? '').trim(),
      localSupabaseReachable: environment.localSupabaseReachable === true || environment.local_supabase_reachable === true,
      environmentBlockers: arrayOfStrings(environment.environmentBlockers ?? environment.environment_blockers),
      repairPlan: {
        status: String(environmentRepairPlan.status ?? '').trim(),
        targetClass: String(environmentRepairPlan.targetClass ?? environmentRepairPlan.target_class ?? environment.targetClass ?? environment.target_class ?? '').trim(),
        noAutoInstall: environmentRepairPlan.noAutoInstall === true || environmentRepairPlan.no_auto_install === true,
        requiredStepIds: arrayOfStrings(environmentRepairPlan.requiredStepIds ?? environmentRepairPlan.required_step_ids),
        blockedStepIds: arrayOfStrings(environmentRepairPlan.blockedStepIds ?? environmentRepairPlan.blocked_step_ids),
        orderedStepCount: readNumber(environmentRepairPlan.orderedStepCount ?? environmentRepairPlan.ordered_step_count ?? repairPlanOrderedSteps.length),
        orderedSteps: repairPlanOrderedSteps,
      },
    },
    preflight: {
      status: String(preflight.status ?? '').trim(),
      readyBusinessTypeCount: readNumber(preflight.readyBusinessTypeCount ?? preflight.ready_business_type_count),
      missingBusinessTypeCount: readNumber(preflight.missingBusinessTypeCount ?? preflight.missing_business_type_count),
      requiredRuntimeSeedStableCodeCount: readNumber(preflight.requiredRuntimeSeedStableCodeCount ?? preflight.required_runtime_seed_stable_code_count),
    },
    runtimeReferenceDays: {
      readyBusinessTypeCount: readNumber(runtimeReferenceDays.readyBusinessTypeCount ?? runtimeReferenceDays.ready_business_type_count),
      missingBusinessTypeCount: readNumber(runtimeReferenceDays.missingBusinessTypeCount ?? runtimeReferenceDays.missing_business_type_count),
      missingBusinessTypes: arrayOfStrings(runtimeReferenceDays.missingBusinessTypes ?? runtimeReferenceDays.missing_business_types),
      requiredRuntimeReferenceStableCodeCount: readNumber(runtimeReferenceDays.requiredRuntimeReferenceStableCodeCount ?? runtimeReferenceDays.required_runtime_reference_stable_code_count),
      requiredRuntimeReferenceStableCodes: arrayOfStrings(runtimeReferenceDays.requiredRuntimeReferenceStableCodes ?? runtimeReferenceDays.required_runtime_reference_stable_codes),
    },
    coverage: {
      status: String(coverage.status ?? '').trim(),
      requiredStableCodeCount: readNumber(coverage.requiredStableCodeCount ?? coverage.required_stable_code_count),
      coveredStableCodeCount: readNumber(coverage.coveredStableCodeCount ?? coverage.covered_stable_code_count),
      missingStableCodeCount: readNumber(coverage.missingStableCodeCount ?? coverage.missing_stable_code_count),
      missingStableCodes: arrayOfStrings(coverage.missingStableCodes ?? coverage.missing_stable_codes),
      runtimeSeedImportRequired: coverage.runtimeSeedImportRequired === true || coverage.runtime_seed_import_required === true,
      runtimeSeedEvidenceAlreadyReady: coverage.runtimeSeedEvidenceAlreadyReady === true || coverage.runtime_seed_evidence_already_ready === true,
    },
    importGate: {
      status: String(importGate.status ?? '').trim(),
      importAllowed: importGate.importAllowed === true || importGate.import_allowed === true,
      importRequired: importGate.importRequired === true || importGate.import_required === true,
      blockers: arrayOfStrings(importGate.blockers),
      manualActions: arrayOfStrings(importGate.manualActions ?? importGate.manual_actions),
    },
  }
}

function summarizeRuntimeSeedImportReadinessSeal(runtimeSeedImportReadinessSeal) {
  const unlock = readObject(runtimeSeedImportReadinessSeal.unlock)
  const executionControl = readObject(runtimeSeedImportReadinessSeal.executionControl)
  const mutationBoundary = readObject(runtimeSeedImportReadinessSeal.mutationBoundary)
  return {
    status: String(runtimeSeedImportReadinessSeal.status ?? '').trim(),
    productionReady: Boolean(runtimeSeedImportReadinessSeal.productionReady),
    importGateStatus: String(runtimeSeedImportReadinessSeal.importGateStatus ?? runtimeSeedImportReadinessSeal.import_gate_status ?? '').trim(),
    executionStatus: String(runtimeSeedImportReadinessSeal.executionStatus ?? runtimeSeedImportReadinessSeal.execution_status ?? '').trim(),
    importCommandReady: runtimeSeedImportReadinessSeal.importCommandReady === true || runtimeSeedImportReadinessSeal.import_command_ready === true,
    unlockVariable: String(unlock.variable ?? '').trim(),
    unlockPresent: unlock.present === true,
    executeReady: executionControl.executeReady === true || executionControl.execute_ready === true,
    operatorMustRunManually: executionControl.operatorMustRunManually === true || executionControl.operator_must_run_manually === true,
    blockers: arrayOfStrings(runtimeSeedImportReadinessSeal.blockers),
    doesNotRunRuntimeSeedImport: mutationBoundary.doesNotRunRuntimeSeedImport === true
      || mutationBoundary.does_not_run_runtime_seed_import === true
      || executionControl.doesNotRunRuntimeSeedImport === true
      || executionControl.does_not_run_runtime_seed_import === true,
    doesNotConnectDatabase: mutationBoundary.doesNotConnectDatabase === true || mutationBoundary.does_not_connect_database === true,
    commandsExecuted: readNumber(mutationBoundary.commandsExecuted ?? mutationBoundary.commands_executed),
    writesProductionTables: mutationBoundary.writesProductionTables === true || mutationBoundary.writes_production_tables === true,
    writesAlgorithmSeedVersions: mutationBoundary.writesAlgorithmSeedVersions === true || mutationBoundary.writes_algorithm_seed_versions === true,
    writesAlgorithmSeedRecords: mutationBoundary.writesAlgorithmSeedRecords === true || mutationBoundary.writes_algorithm_seed_records === true,
    writesAlgorithmSeedImportLogs: mutationBoundary.writesAlgorithmSeedImportLogs === true || mutationBoundary.writes_algorithm_seed_import_logs === true,
    writesTasks: mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true,
    writesTaskDependencies: mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true,
    writesRuntimePublication: mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true,
  }
}

function summarizeDurationSampleCollectionPackage(durationSampleCollectionPackage) {
  const sampleRequests = Array.isArray(durationSampleCollectionPackage.sampleRequests)
    ? durationSampleCollectionPackage.sampleRequests
    : Array.isArray(durationSampleCollectionPackage.sample_requests)
      ? durationSampleCollectionPackage.sample_requests
      : []
  return {
    status: String(durationSampleCollectionPackage.status ?? '').trim(),
    blockers: arrayOfStrings(durationSampleCollectionPackage.blockers),
    requiredStableCodeCount: readNumber(durationSampleCollectionPackage.requiredStableCodeCount ?? durationSampleCollectionPackage.required_stable_code_count),
    totalRequiredAcceptedSampleCount: readNumber(durationSampleCollectionPackage.totalRequiredAcceptedSampleCount ?? durationSampleCollectionPackage.total_required_accepted_sample_count),
    profileRuntimeReferenceSampleRequestCount: readNumber(durationSampleCollectionPackage.profileRuntimeReferenceSampleRequestCount ?? durationSampleCollectionPackage.profile_runtime_reference_sample_request_count),
    durationGapPlanSampleRequestCount: readNumber(durationSampleCollectionPackage.durationGapPlanSampleRequestCount ?? durationSampleCollectionPackage.duration_gap_plan_sample_request_count),
    sampleRequestCount: sampleRequests.length,
    sampleRequestExamples: sampleRequests.slice(0, 5).map((row) => ({
      stableCode: String(row.stableCode ?? row.stable_code ?? '').trim(),
      title: String(row.title ?? row.name ?? '').trim(),
      requiredAcceptedSampleCount: readNumber(row.requiredAcceptedSampleCount ?? row.required_accepted_sample_count),
      currentAcceptedSampleCount: readNumber(row.currentAcceptedSampleCount ?? row.current_accepted_sample_count),
      businessType: String(row.businessType ?? row.business_type ?? '').trim(),
    })),
  }
}

function summarizeRealDurationSampleMaterialTemplate(realDurationSampleMaterialTemplate) {
  const samples = Array.isArray(realDurationSampleMaterialTemplate.samples)
    ? realDurationSampleMaterialTemplate.samples
    : []
  const operatorInstructions = readObject(realDurationSampleMaterialTemplate.operatorInstructions ?? realDurationSampleMaterialTemplate.operator_instructions)
  return {
    schemaVersion: String(realDurationSampleMaterialTemplate.schemaVersion ?? realDurationSampleMaterialTemplate.schema_version ?? '').trim(),
    source: String(realDurationSampleMaterialTemplate.source ?? '').trim(),
    materialTemplate: realDurationSampleMaterialTemplate.materialTemplate === true || realDurationSampleMaterialTemplate.material_template === true,
    templateStatus: String(realDurationSampleMaterialTemplate.templateStatus ?? realDurationSampleMaterialTemplate.template_status ?? '').trim(),
    baselineId: String(realDurationSampleMaterialTemplate.baselineId ?? realDurationSampleMaterialTemplate.baseline_id ?? '').trim(),
    projectId: String(realDurationSampleMaterialTemplate.projectId ?? realDurationSampleMaterialTemplate.project_id ?? '').trim(),
    collectionPackageRef: String(realDurationSampleMaterialTemplate.collectionPackageRef ?? realDurationSampleMaterialTemplate.collection_package_ref ?? '').trim(),
    noWriteBoundary: String(operatorInstructions.noWriteBoundary ?? operatorInstructions.no_write_boundary ?? '').trim(),
    rejectedMarkers: arrayOfStrings(operatorInstructions.rejectedMarkers ?? operatorInstructions.rejected_markers),
    templateSampleCount: samples.length,
    sampleRequestExamples: samples.slice(0, 5).map((row) => ({
      stableCode: String(row.stableCode ?? row.stable_code ?? '').trim(),
      title: String(row.title ?? row.name ?? '').trim(),
      sampleStatus: String(row.sampleStatus ?? row.sample_status ?? '').trim(),
      includedInBenchmark: row.includedInBenchmark === true || row.included_in_benchmark === true,
    })),
    blockers: arrayOfStrings(realDurationSampleMaterialTemplate.blockers),
  }
}

function summarizeRealDurationSampleCollectionKit(realDurationSampleCollectionKit) {
  const summary = readObject(realDurationSampleCollectionKit.summary)
  const mutationBoundary = readObject(realDurationSampleCollectionKit.mutationBoundary)
  const businessTypeGroups = Array.isArray(realDurationSampleCollectionKit.businessTypeGroups)
    ? realDurationSampleCollectionKit.businessTypeGroups
    : Array.isArray(realDurationSampleCollectionKit.business_type_groups)
      ? realDurationSampleCollectionKit.business_type_groups
      : []
  const requiredOperatorFields = arrayOfStrings(realDurationSampleCollectionKit.requiredOperatorFields ?? realDurationSampleCollectionKit.required_operator_fields)
  const targetRows = businessTypeGroups
    .flatMap((group) => {
      const groupRecord = readObject(group)
      const rows = Array.isArray(groupRecord.rows) ? groupRecord.rows : []
      return rows.map((row) => ({ groupRecord, row: readObject(row) }))
    })
    .sort((left, right) => readNumber(left.row.priority) - readNumber(right.row.priority))
  const targetCount = readNumber(summary.targetCount ?? summary.target_count) || targetRows.length
  const businessTypeGroupCount = readNumber(summary.businessTypeGroupCount ?? summary.business_type_group_count) || businessTypeGroups.length

  return {
    schemaVersion: String(realDurationSampleCollectionKit.schemaVersion ?? realDurationSampleCollectionKit.schema_version ?? '').trim(),
    source: String(realDurationSampleCollectionKit.source ?? '').trim(),
    status: targetCount > 0 || businessTypeGroupCount > 0 ? 'operator_collection_required' : 'not_generated',
    productionReady: Boolean(realDurationSampleCollectionKit.productionReady ?? realDurationSampleCollectionKit.production_ready),
    noWriteBoundary: String(realDurationSampleCollectionKit.noWriteBoundary ?? realDurationSampleCollectionKit.no_write_boundary ?? '').trim(),
    baselineId: String(realDurationSampleCollectionKit.baselineId ?? realDurationSampleCollectionKit.baseline_id ?? '').trim(),
    projectId: String(realDurationSampleCollectionKit.projectId ?? realDurationSampleCollectionKit.project_id ?? '').trim(),
    preparedBy: String(realDurationSampleCollectionKit.preparedBy ?? realDurationSampleCollectionKit.prepared_by ?? '').trim(),
    targetSource: String(realDurationSampleCollectionKit.targetSource ?? realDurationSampleCollectionKit.target_source ?? '').trim(),
    collectionPackageRef: String(realDurationSampleCollectionKit.collectionPackageRef ?? realDurationSampleCollectionKit.collection_package_ref ?? '').trim(),
    realEvidenceGapSummaryRef: String(realDurationSampleCollectionKit.realEvidenceGapSummaryRef ?? realDurationSampleCollectionKit.real_evidence_gap_summary_ref ?? '').trim(),
    collectionKitRef: String(realDurationSampleCollectionKit.collectionKitRef ?? realDurationSampleCollectionKit.collection_kit_ref ?? '').trim(),
    targetCount,
    businessTypeGroupCount,
    missingSampleCount: readNumber(summary.missingSampleCount ?? summary.missing_sample_count),
    invalidSampleCount: readNumber(summary.invalidSampleCount ?? summary.invalid_sample_count),
    requiredOperatorFields,
    requiredOperatorFieldCount: requiredOperatorFields.length,
    businessTypeGroups: businessTypeGroups.map((group) => {
      const record = readObject(group)
      return {
        businessType: String(record.businessType ?? record.business_type ?? '').trim(),
        targetCount: readNumber(record.targetCount ?? record.target_count),
        missingSampleCount: readNumber(record.missingSampleCount ?? record.missing_sample_count),
        invalidSampleCount: readNumber(record.invalidSampleCount ?? record.invalid_sample_count),
      }
    }),
    targetExamples: targetRows.slice(0, 8).map(({ groupRecord, row }) => ({
      priority: readNumber(row.priority),
      businessType: String(row.businessType ?? row.business_type ?? groupRecord.businessType ?? groupRecord.business_type ?? '').trim(),
      stableCode: String(row.stableCode ?? row.stable_code ?? '').trim(),
      title: String(row.title ?? row.name ?? '').trim(),
      requiredAcceptedSampleCount: readNumber(row.requiredAcceptedSampleCount ?? row.required_accepted_sample_count),
      readySampleCount: readNumber(row.readySampleCount ?? row.ready_sample_count),
      missingSampleCount: readNumber(row.missingSampleCount ?? row.missing_sample_count),
      invalidSampleCount: readNumber(row.invalidSampleCount ?? row.invalid_sample_count),
      candidateReferenceDays: readNumber(row.candidateReferenceDays ?? row.candidate_reference_days),
      durationAssetStableCode: String(row.durationAssetStableCode ?? row.duration_asset_stable_code ?? '').trim(),
      t2RhythmTemplateId: String(row.t2RhythmTemplateId ?? row.t2_rhythm_template_id ?? '').trim(),
      nextAction: String(row.nextAction ?? row.next_action ?? '').trim(),
    })),
    writesProductionTables: mutationBoundary.writesProductionTables === true || mutationBoundary.writes_production_tables === true,
    writesTasks: mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true,
    writesTaskDependencies: mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true,
    writesDurationSamples: mutationBoundary.writesDurationSamples === true || mutationBoundary.writes_duration_samples === true,
    writesRuntimePublication: mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true,
    invokesRuntimeWriters: mutationBoundary.invokesRuntimeWriters === true || mutationBoundary.invokes_runtime_writers === true,

    performsRollback: mutationBoundary.performsRollback === true || mutationBoundary.performs_rollback === true,
  }
}

function summarizeRealDurationSampleCollectionKitPreflight(realDurationSampleCollectionKitPreflight) {
  const summary = readObject(realDurationSampleCollectionKitPreflight.summary)
  const mutationBoundary = readObject(realDurationSampleCollectionKitPreflight.mutationBoundary)
  return {
    schemaVersion: String(realDurationSampleCollectionKitPreflight.schemaVersion ?? realDurationSampleCollectionKitPreflight.schema_version ?? '').trim(),
    source: String(realDurationSampleCollectionKitPreflight.source ?? '').trim(),
    status: String(realDurationSampleCollectionKitPreflight.status ?? '').trim(),
    productionReady: Boolean(realDurationSampleCollectionKitPreflight.productionReady ?? realDurationSampleCollectionKitPreflight.production_ready),
    baselineId: String(realDurationSampleCollectionKitPreflight.baselineId ?? realDurationSampleCollectionKitPreflight.baseline_id ?? '').trim(),
    projectId: String(realDurationSampleCollectionKitPreflight.projectId ?? realDurationSampleCollectionKitPreflight.project_id ?? '').trim(),
    checkedBy: String(realDurationSampleCollectionKitPreflight.checkedBy ?? realDurationSampleCollectionKitPreflight.checked_by ?? '').trim(),
    collectionKitRef: String(realDurationSampleCollectionKitPreflight.collectionKitRef ?? realDurationSampleCollectionKitPreflight.collection_kit_ref ?? '').trim(),
    targetRowCount: readNumber(summary.targetRowCount ?? summary.target_row_count),
    readyRowCount: readNumber(summary.readyRowCount ?? summary.ready_row_count),
    invalidRowCount: readNumber(summary.invalidRowCount ?? summary.invalid_row_count),
    businessTypeGroupCount: readNumber(summary.businessTypeGroupCount ?? summary.business_type_group_count),
    blockers: arrayOfStrings(realDurationSampleCollectionKitPreflight.blockers),
    writesProductionTables: mutationBoundary.writesProductionTables === true || mutationBoundary.writes_production_tables === true,
    writesTasks: mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true,
    writesTaskDependencies: mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true,
    writesDurationSamples: mutationBoundary.writesDurationSamples === true || mutationBoundary.writes_duration_samples === true,
    writesRuntimePublication: mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true,
    invokesRuntimeWriters: mutationBoundary.invokesRuntimeWriters === true || mutationBoundary.invokes_runtime_writers === true,
    performsRollback: mutationBoundary.performsRollback === true || mutationBoundary.performs_rollback === true,
  }
}

function summarizeRealDurationSampleMaterialBuildReport(realDurationSampleMaterialBuildReport) {
  const summary = readObject(realDurationSampleMaterialBuildReport.summary)
  const mutationBoundary = readObject(realDurationSampleMaterialBuildReport.mutationBoundary)
  const invalidCandidates = Array.isArray(realDurationSampleMaterialBuildReport.invalidCandidates)
    ? realDurationSampleMaterialBuildReport.invalidCandidates
    : []
  const materialWrite = readObject(realDurationSampleMaterialBuildReport.materialWrite ?? realDurationSampleMaterialBuildReport.material_write)
  const existingMaterialSummary = readObject(materialWrite.existingMaterialSummary ?? materialWrite.existing_material_summary)
  return {
    schemaVersion: String(realDurationSampleMaterialBuildReport.schemaVersion ?? realDurationSampleMaterialBuildReport.schema_version ?? '').trim(),
    source: String(realDurationSampleMaterialBuildReport.source ?? '').trim(),
    status: String(realDurationSampleMaterialBuildReport.status ?? '').trim(),
    productionReady: Boolean(realDurationSampleMaterialBuildReport.productionReady ?? realDurationSampleMaterialBuildReport.production_ready),
    baselineId: String(realDurationSampleMaterialBuildReport.baselineId ?? realDurationSampleMaterialBuildReport.baseline_id ?? '').trim(),
    projectId: String(realDurationSampleMaterialBuildReport.projectId ?? realDurationSampleMaterialBuildReport.project_id ?? '').trim(),
    materialRef: String(realDurationSampleMaterialBuildReport.materialRef ?? realDurationSampleMaterialBuildReport.material_ref ?? '').trim(),
    collectionPackageRef: String(realDurationSampleMaterialBuildReport.collectionPackageRef ?? realDurationSampleMaterialBuildReport.collection_package_ref ?? '').trim(),
    collectionKitPreflightRef: String(realDurationSampleMaterialBuildReport.collectionKitPreflightRef ?? realDurationSampleMaterialBuildReport.collection_kit_preflight_ref ?? '').trim(),
    requiredStableCodeCount: readNumber(summary.requiredStableCodeCount ?? summary.required_stable_code_count),
    sourceCandidateCount: readNumber(summary.sourceCandidateCount ?? summary.source_candidate_count),
    exportedSampleCount: readNumber(summary.exportedSampleCount ?? summary.exported_sample_count),
    invalidCandidateCount: readNumber(summary.invalidCandidateCount ?? summary.invalid_candidate_count),
    readyRowCount: readNumber(summary.readyRowCount ?? summary.ready_row_count),
    invalidRowCount: readNumber(summary.invalidRowCount ?? summary.invalid_row_count),
    businessTypeGroupCount: readNumber(summary.businessTypeGroupCount ?? summary.business_type_group_count),
    invalidCandidates: invalidCandidates.slice(0, 5).map((candidate) => ({
      id: String(readObject(candidate).id ?? '').trim(),
      stableCode: String(readObject(candidate).stableCode ?? readObject(candidate).stable_code ?? '').trim(),
      title: String(readObject(candidate).title ?? '').trim(),
      blockers: arrayOfStrings(readObject(candidate).blockers),
    })),
    blockers: arrayOfStrings(realDurationSampleMaterialBuildReport.blockers),
    materialWritePolicy: String(materialWrite.policy ?? '').trim(),
    wroteMaterialFile: materialWrite.wroteMaterialFile === true || materialWrite.wrote_material_file === true,
    preservedExistingMaterialFile: materialWrite.preservedExistingMaterialFile === true || materialWrite.preserved_existing_material_file === true,
    existingMaterialSource: String(existingMaterialSummary.source ?? '').trim(),
    existingMaterialSampleCount: readNumber(existingMaterialSummary.sampleCount ?? existingMaterialSummary.sample_count),
    existingMaterialStableCodes: arrayOfStrings(existingMaterialSummary.stableCodes ?? existingMaterialSummary.stable_codes),
    writesProductionTables: mutationBoundary.writesProductionTables === true || mutationBoundary.writes_production_tables === true,
    writesTasks: mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true,
    writesTaskDependencies: mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true,
    writesDurationSamples: mutationBoundary.writesDurationSamples === true || mutationBoundary.writes_duration_samples === true,
    writesRuntimePublication: mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true,
    invokesRuntimeWriters: mutationBoundary.invokesRuntimeWriters === true || mutationBoundary.invokes_runtime_writers === true,
    performsRollback: mutationBoundary.performsRollback === true || mutationBoundary.performs_rollback === true,
  }
}

function summarizeRealDurationSampleMaterialPreflight(realDurationSampleMaterialPreflight, durationSampleCollectionPackage = {}) {
  const summary = readObject(realDurationSampleMaterialPreflight.summary)
  const mutationBoundary = readObject(realDurationSampleMaterialPreflight.mutationBoundary)
  const invalidSamples = Array.isArray(realDurationSampleMaterialPreflight.invalidSamples)
    ? realDurationSampleMaterialPreflight.invalidSamples
    : []
  const rows = Array.isArray(realDurationSampleMaterialPreflight.rows)
    ? realDurationSampleMaterialPreflight.rows
    : []
  const sampleRequests = Array.isArray(durationSampleCollectionPackage.sampleRequests)
    ? durationSampleCollectionPackage.sampleRequests
    : Array.isArray(durationSampleCollectionPackage.sample_requests)
      ? durationSampleCollectionPackage.sample_requests
      : []
  const businessTypeByStableCode = new Map(sampleRequests
    .map((request) => [
      String(request.stableCode ?? request.stable_code ?? request.standardWorkCode ?? request.standard_work_code ?? '').trim(),
      String(request.businessType ?? request.business_type ?? '').trim(),
    ])
    .filter(([stableCode]) => stableCode))
  const sampleRequestByStableCode = new Map(sampleRequests
    .map((request) => {
      const record = readObject(request)
      const stableCode = String(record.stableCode ?? record.stable_code ?? record.standardWorkCode ?? record.standard_work_code ?? '').trim()
      return [stableCode, record]
    })
    .filter(([stableCode]) => stableCode))
  const invalidSampleCountByStableCode = new Map()
  for (const sample of invalidSamples) {
    const stableCode = String(readObject(sample).stableCode ?? readObject(sample).stable_code ?? '').trim()
    if (!stableCode) continue
    invalidSampleCountByStableCode.set(stableCode, (invalidSampleCountByStableCode.get(stableCode) ?? 0) + 1)
  }
  const coverageByBusinessType = summarizeDurationSamplePreflightCoverageByBusinessType(rows, {
    businessTypeByStableCode,
    invalidSampleCountByStableCode,
  })
  return {
    schemaVersion: String(realDurationSampleMaterialPreflight.schemaVersion ?? realDurationSampleMaterialPreflight.schema_version ?? '').trim(),
    source: String(realDurationSampleMaterialPreflight.source ?? '').trim(),
    status: String(realDurationSampleMaterialPreflight.status ?? '').trim(),
    productionReady: Boolean(realDurationSampleMaterialPreflight.productionReady ?? realDurationSampleMaterialPreflight.production_ready),
    baselineId: String(realDurationSampleMaterialPreflight.baselineId ?? realDurationSampleMaterialPreflight.baseline_id ?? '').trim(),
    projectId: String(realDurationSampleMaterialPreflight.projectId ?? realDurationSampleMaterialPreflight.project_id ?? '').trim(),
    checkedBy: String(realDurationSampleMaterialPreflight.checkedBy ?? realDurationSampleMaterialPreflight.checked_by ?? '').trim(),
    collectionPackageRef: String(realDurationSampleMaterialPreflight.collectionPackageRef ?? realDurationSampleMaterialPreflight.collection_package_ref ?? '').trim(),
    sampleMaterialRef: String(realDurationSampleMaterialPreflight.sampleMaterialRef ?? realDurationSampleMaterialPreflight.sample_material_ref ?? '').trim(),
    materialSourceEvidencePlaceholderFindingCount: Array.isArray(realDurationSampleMaterialPreflight.materialSourceEvidencePlaceholderFindings)
      ? realDurationSampleMaterialPreflight.materialSourceEvidencePlaceholderFindings.length
      : 0,
    requiredStableCodeCount: readNumber(summary.requiredStableCodeCount ?? summary.required_stable_code_count),
    readyStableCodeCount: readNumber(summary.readyStableCodeCount ?? summary.ready_stable_code_count),
    missingStableCodeCount: readNumber(summary.missingStableCodeCount ?? summary.missing_stable_code_count),
    rawSampleCount: readNumber(summary.rawSampleCount ?? summary.raw_sample_count),
    readySampleCount: readNumber(summary.readySampleCount ?? summary.ready_sample_count),
    invalidSampleCount: readNumber(summary.invalidSampleCount ?? summary.invalid_sample_count),
    missingStableCodes: arrayOfStrings(summary.missingStableCodes ?? summary.missing_stable_codes),
    readyStableCodes: arrayOfStrings(summary.readyStableCodes ?? summary.ready_stable_codes),
    coverageByBusinessType,
    nextSampleCollectionTargets: buildNextSampleCollectionTargets(rows, {
      businessTypeByStableCode,
      invalidSampleCountByStableCode,
      sampleRequestByStableCode,
    }),
    readySampleExamples: rows
      .filter((row) => readNumber(readObject(row).readySampleCount ?? readObject(row).ready_sample_count) > 0)
      .slice(0, 5)
      .map((row) => {
        const record = readObject(row)
        return {
          stableCode: String(record.stableCode ?? record.stable_code ?? '').trim(),
          title: String(record.title ?? '').trim(),
          readySampleCount: readNumber(record.readySampleCount ?? record.ready_sample_count),
          readySampleIds: arrayOfStrings(record.readySampleIds ?? record.ready_sample_ids),
        }
      }),
    invalidSampleExamples: invalidSamples.slice(0, 5).map((sample) => {
      const record = readObject(sample)
      return {
        id: String(record.id ?? '').trim(),
        stableCode: String(record.stableCode ?? record.stable_code ?? '').trim(),
        title: String(record.title ?? '').trim(),
        blockers: arrayOfStrings(record.blockers),
      }
    }),
    blockers: arrayOfStrings(realDurationSampleMaterialPreflight.blockers),
    writesProductionTables: mutationBoundary.writesProductionTables === true || mutationBoundary.writes_production_tables === true,
    writesTasks: mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true,
    writesTaskDependencies: mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true,
    writesDurationSamples: mutationBoundary.writesDurationSamples === true || mutationBoundary.writes_duration_samples === true,
    writesRuntimePublication: mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true,
    invokesRuntimeWriters: mutationBoundary.invokesRuntimeWriters === true || mutationBoundary.invokes_runtime_writers === true,
    performsRollback: mutationBoundary.performsRollback === true || mutationBoundary.performs_rollback === true,
  }
}

function buildNextSampleCollectionTargets(rows, {
  businessTypeByStableCode = new Map(),
  invalidSampleCountByStableCode = new Map(),
  sampleRequestByStableCode = new Map(),
} = {}) {
  const targets = []
  for (const row of rows) {
    const record = readObject(row)
    const stableCode = String(record.stableCode ?? record.stable_code ?? '').trim()
    if (!stableCode) continue
    const readySampleCount = readNumber(record.readySampleCount ?? record.ready_sample_count)
    const explicitMissingSampleCount = readNumber(record.missingSampleCount ?? record.missing_sample_count)
    const request = readObject(sampleRequestByStableCode.get(stableCode))
    const requiredAcceptedSampleCount = readNumber(
      record.requiredAcceptedSampleCount
        ?? record.required_accepted_sample_count
        ?? request.requiredAcceptedSampleCount
        ?? request.required_accepted_sample_count,
    )
    const missingSampleCount = explicitMissingSampleCount || Math.max(requiredAcceptedSampleCount - readySampleCount, 0)
    if (missingSampleCount <= 0) continue
    targets.push({
      businessType: businessTypeByStableCode.get(stableCode) || 'unknown',
      stableCode,
      title: String(record.title ?? request.title ?? '').trim(),
      requiredAcceptedSampleCount,
      readySampleCount,
      missingSampleCount,
      invalidSampleCount: invalidSampleCountByStableCode.get(stableCode) ?? 0,
      nextAction: 'collect_accepted_real_duration_sample',
    })
  }
  return targets
    .sort((left, right) => left.businessType.localeCompare(right.businessType) || left.stableCode.localeCompare(right.stableCode))
    .map((target, index) => ({ priority: index + 1, ...target }))
}

function summarizeDurationSamplePreflightCoverageByBusinessType(rows, {
  businessTypeByStableCode = new Map(),
  invalidSampleCountByStableCode = new Map(),
} = {}) {
  const byBusinessType = new Map()
  for (const row of rows) {
    const record = readObject(row)
    const stableCode = String(record.stableCode ?? record.stable_code ?? '').trim()
    const businessType = businessTypeByStableCode.get(stableCode) || 'unknown'
    if (!byBusinessType.has(businessType)) {
      byBusinessType.set(businessType, {
        businessType,
        requiredStableCodeCount: 0,
        readyStableCodeCount: 0,
        missingStableCodeCount: 0,
        invalidSampleCount: 0,
        missingStableCodes: [],
        readyStableCodes: [],
      })
    }
    const bucket = byBusinessType.get(businessType)
    const readySampleCount = readNumber(record.readySampleCount ?? record.ready_sample_count)
    const missingSampleCount = readNumber(record.missingSampleCount ?? record.missing_sample_count)
    bucket.requiredStableCodeCount += stableCode ? 1 : 0
    bucket.invalidSampleCount += invalidSampleCountByStableCode.get(stableCode) ?? 0
    if (stableCode && readySampleCount > 0 && missingSampleCount === 0) {
      bucket.readyStableCodeCount += 1
      bucket.readyStableCodes.push(stableCode)
    } else if (stableCode) {
      bucket.missingStableCodeCount += 1
      bucket.missingStableCodes.push(stableCode)
    }
  }
  return [...byBusinessType.values()].sort((left, right) => left.businessType.localeCompare(right.businessType))
}

function summarizeRealDurationSampleSourceExport(realDurationSampleSourceExport, realDurationSampleSourceExportReport) {
  const metadata = readObject(realDurationSampleSourceExport.export_metadata ?? realDurationSampleSourceExport.exportMetadata)
  const rows = Array.isArray(realDurationSampleSourceExport.rows) ? realDurationSampleSourceExport.rows : []
  const reportSummary = readObject(realDurationSampleSourceExportReport.summary)
  const reportMutationBoundary = readObject(realDurationSampleSourceExportReport.mutationBoundary ?? realDurationSampleSourceExportReport.mutation_boundary)
  const metadataMutationBoundary = readObject(metadata.mutation_boundary ?? metadata.mutationBoundary)
  const mutationBoundary = { ...metadataMutationBoundary, ...reportMutationBoundary }
  return {
    schemaVersion: String(realDurationSampleSourceExportReport.schemaVersion ?? realDurationSampleSourceExportReport.schema_version ?? '').trim(),
    status: String(realDurationSampleSourceExportReport.status ?? (metadata.blocked === true ? 'blocked' : '')).trim(),
    productionReady: Boolean(realDurationSampleSourceExportReport.productionReady ?? realDurationSampleSourceExportReport.production_ready),
    sourceKind: String(metadata.source_kind ?? metadata.sourceKind ?? '').trim(),
    blocked: metadata.blocked === true,
    table: String(metadata.table ?? '').trim(),
    baselineId: String(realDurationSampleSourceExportReport.baselineId ?? realDurationSampleSourceExportReport.baseline_id ?? metadata.baseline_id ?? metadata.baselineId ?? '').trim(),
    projectId: String(realDurationSampleSourceExportReport.projectId ?? realDurationSampleSourceExportReport.project_id ?? metadata.project_id ?? metadata.projectId ?? '').trim(),
    exportedBy: String(metadata.exported_by ?? metadata.exportedBy ?? '').trim(),
    environment: String(metadata.environment ?? '').trim(),
    materialPreflightRef: String(metadata.material_preflight_ref ?? metadata.materialPreflightRef ?? '').trim(),
    collectionPackageRef: String(metadata.collection_package_ref ?? metadata.collectionPackageRef ?? '').trim(),
    rowCount: rows.length,
    requiredStableCodeCount: readNumber(reportSummary.requiredStableCodeCount ?? reportSummary.required_stable_code_count),
    rawSampleCount: readNumber(reportSummary.rawSampleCount ?? reportSummary.raw_sample_count),
    exportedSampleCount: readNumber(reportSummary.exportedSampleCount ?? reportSummary.exported_sample_count ?? rows.length),
    invalidSampleCount: readNumber(reportSummary.invalidSampleCount ?? reportSummary.invalid_sample_count),
    missingStableCodeCount: readNumber(reportSummary.missingStableCodeCount ?? reportSummary.missing_stable_code_count),
    missingStableCodes: arrayOfStrings(reportSummary.missingStableCodes ?? reportSummary.missing_stable_codes),
    blockers: arrayOfStrings(realDurationSampleSourceExportReport.blockers),
    writesProductionTables: mutationBoundary.writesProductionTables === true || mutationBoundary.writes_production_tables === true,
    writesTasks: mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true,
    writesTaskDependencies: mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true,
    writesDurationSamples: mutationBoundary.writesDurationSamples === true || mutationBoundary.writes_duration_samples === true,
    writesRuntimePublication: mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true,
    invokesRuntimeWriters: mutationBoundary.invokesRuntimeWriters === true || mutationBoundary.invokes_runtime_writers === true,
    performsRollback: mutationBoundary.performsRollback === true || mutationBoundary.performs_rollback === true,
  }
}

function summarizeDurationAssetUtilization(durationAssetUtilization) {
  const assetCoverage = readObject(durationAssetUtilization.assetCoverage ?? durationAssetUtilization.asset_coverage)
  const runtimeSeedPostImportVerification = readObject(
    durationAssetUtilization.runtimeSeedPostImportVerification
    ?? durationAssetUtilization.runtime_seed_post_import_verification,
  )
  const businessTypeSpecialtyAssetCoverage = readObject(
    durationAssetUtilization.businessTypeSpecialtyAssetCoverage
    ?? durationAssetUtilization.business_type_specialty_asset_coverage,
  )
  return {
    status: String(durationAssetUtilization.status ?? '').trim(),
    productionReady: Boolean(durationAssetUtilization.productionReady ?? durationAssetUtilization.production_ready),
    baselineId: String(durationAssetUtilization.baselineId ?? durationAssetUtilization.baseline_id ?? '').trim(),
    projectId: String(durationAssetUtilization.projectId ?? durationAssetUtilization.project_id ?? '').trim(),
    businessType: String(durationAssetUtilization.businessType ?? durationAssetUtilization.business_type ?? '').trim(),
    rowCount: readNumber(durationAssetUtilization.rowCount ?? durationAssetUtilization.row_count),
    rowsWithStandardWorkSeedCount: readNumber(assetCoverage.rowsWithStandardWorkSeedCount),
    rowsMissingStandardWorkSeedCount: readNumber(assetCoverage.rowsMissingStandardWorkSeedCount),
    rowsWithActiveStandardWorkSeedCount: readNumber(assetCoverage.rowsWithActiveStandardWorkSeedCount),
    rowsWithFallbackStandardWorkSeedCount: readNumber(assetCoverage.rowsWithFallbackStandardWorkSeedCount),
    rowsWithT2RhythmTemplateCount: readNumber(assetCoverage.rowsWithT2RhythmTemplateCount),
    rowsMissingT2RhythmTemplateCount: readNumber(assetCoverage.rowsMissingT2RhythmTemplateCount),
    rowsWithActiveT2RhythmTemplateCount: readNumber(assetCoverage.rowsWithActiveT2RhythmTemplateCount),
    rowsWithFallbackT2RhythmTemplateCount: readNumber(assetCoverage.rowsWithFallbackT2RhythmTemplateCount),
    rowsWithRuntimeReferenceDaysCount: readNumber(assetCoverage.rowsWithRuntimeReferenceDaysCount),
    rowsMissingRuntimeReferenceDaysCount: readNumber(assetCoverage.rowsMissingRuntimeReferenceDaysCount),
    rowsWithQuantityOrProductivityCount: readNumber(assetCoverage.rowsWithQuantityOrProductivityCount),
    rowsWithDependencyEvidenceCount: readNumber(assetCoverage.rowsWithDependencyEvidenceCount),
    rowsWithDependencyAssetCount: readNumber(assetCoverage.rowsWithDependencyAssetCount),
    rowsWithDependencyTimingAssetCount: readNumber(assetCoverage.rowsWithDependencyTimingAssetCount),
    rowsWithProcessSeasonalDurationAssetCount: readNumber(assetCoverage.rowsWithProcessSeasonalDurationAssetCount),
    rowsWithConstructionCalendarCount: readNumber(assetCoverage.rowsWithConstructionCalendarCount),
    runtimeSeedPostImportStatus: String(runtimeSeedPostImportVerification.status ?? '').trim(),
    activeStandardWorkDurationSeedReady: runtimeSeedPostImportVerification.activeStandardWorkDurationSeedReady === true,
    activeT2RhythmTemplateReady: runtimeSeedPostImportVerification.activeT2RhythmTemplateReady === true,
    businessTypeSpecialtyAssetCoverageStatus: String(businessTypeSpecialtyAssetCoverage.status ?? '').trim(),
    businessTypeProfileScheduleRowCount: readNumber(businessTypeSpecialtyAssetCoverage.profileScheduleRowCount),
    businessTypeSpecialtyDurationAssetRowCount: readNumber(businessTypeSpecialtyAssetCoverage.specialtyDurationAssetRowCount),
    businessTypeSpecificT2RhythmTemplateRowCount: readNumber(businessTypeSpecialtyAssetCoverage.specificT2RhythmTemplateRowCount),
    blockers: arrayOfStrings(durationAssetUtilization.blockers),
  }
}

function summarizeCompletedTaskExport(completedTaskExportReport) {
  const summary = readObject(completedTaskExportReport.summary)
  return {
    status: String(completedTaskExportReport.status ?? '').trim(),
    requiredStableCodeCount: readNumber(summary.requiredStableCodeCount),
    rawTaskCount: readNumber(summary.rawTaskCount),
    exportedTaskCount: readNumber(summary.exportedTaskCount),
    candidateTaskCount: readNumber(summary.candidateTaskCount),
    invalidTaskCount: readNumber(summary.invalidTaskCount),
    titleMismatchCount: readNumber(summary.titleMismatchCount),
    titleMatchedDifferentStableCodeCount: readNumber(summary.titleMatchedDifferentStableCodeCount),
    missingStableCodeCount: readNumber(summary.missingStableCodeCount),
    missingStableCodes: arrayOfStrings(summary.missingStableCodes),
    invalidTaskExamples: Array.isArray(completedTaskExportReport.invalidTasks)
      ? completedTaskExportReport.invalidTasks.slice(0, 5).map((task) => {
          const record = readObject(task)
          return {
            id: String(record.id ?? '').trim(),
            stableCode: String(record.stableCode ?? record.stable_code ?? '').trim(),
            title: String(record.title ?? '').trim(),
            expectedTitle: String(record.expectedTitle ?? record.expected_title ?? '').trim(),
            matchingRequestedStableCodeByTitle: String(record.matchingRequestedStableCodeByTitle ?? record.matching_requested_stable_code_by_title ?? '').trim(),
            matchingRequestedTitleByTitle: String(record.matchingRequestedTitleByTitle ?? record.matching_requested_title_by_title ?? '').trim(),
            recommendedAction: String(record.recommendedAction ?? record.recommended_action ?? '').trim(),
            blockers: arrayOfStrings(record.blockers),
          }
        })
      : [],
    blockers: arrayOfStrings(completedTaskExportReport.blockers),
  }
}

function summarizeRuntimeCandidateAlignment(runtimeCandidateAlignmentPreflight) {
  const summary = readObject(runtimeCandidateAlignmentPreflight.summary)
  return {
    status: String(runtimeCandidateAlignmentPreflight.status ?? '').trim(),
    productionReady: Boolean(runtimeCandidateAlignmentPreflight.productionReady ?? runtimeCandidateAlignmentPreflight.production_ready),
    baselineId: String(runtimeCandidateAlignmentPreflight.baselineId ?? runtimeCandidateAlignmentPreflight.baseline_id ?? '').trim(),
    projectId: String(runtimeCandidateAlignmentPreflight.projectId ?? runtimeCandidateAlignmentPreflight.project_id ?? '').trim(),
    candidateRowCount: readNumber(summary.candidateRowCount),
    runtimeTaskCount: readNumber(summary.runtimeTaskCount),
    matchedStableCodeCount: readNumber(summary.matchedStableCodeCount),
    missingRuntimeTaskCount: readNumber(summary.missingRuntimeTaskCount),
    titleMismatchCount: readNumber(summary.titleMismatchCount),
    titleMatchedDifferentStableCodeCount: readNumber(summary.titleMatchedDifferentStableCodeCount),
    rowsWithActualDateRangeCount: readNumber(summary.rowsWithActualDateRangeCount),
    rowsMissingActualDateRangeCount: readNumber(summary.rowsMissingActualDateRangeCount),
    projectMismatchCount: readNumber(summary.projectMismatchCount),
    driftExamples: Array.isArray(runtimeCandidateAlignmentPreflight.rows)
      ? runtimeCandidateAlignmentPreflight.rows
          .filter((row) => {
            const record = readObject(row)
            return arrayOfStrings(record.blockers).length > 0 || String(record.alignmentStatus ?? '').trim() !== 'matched'
          })
          .slice(0, 5)
          .map((row) => {
            const record = readObject(row)
            return {
              stableCode: String(record.stableCode ?? record.stable_code ?? '').trim(),
              candidateTitle: String(record.candidateTitle ?? record.candidate_title ?? '').trim(),
              runtimeTaskId: String(record.runtimeTaskId ?? record.runtime_task_id ?? '').trim(),
              runtimeTitle: String(record.runtimeTitle ?? record.runtime_title ?? '').trim(),
              alignmentStatus: String(record.alignmentStatus ?? record.alignment_status ?? '').trim(),
              matchingCandidateStableCodeByRuntimeTitle: String(record.matchingCandidateStableCodeByRuntimeTitle ?? record.matching_candidate_stable_code_by_runtime_title ?? '').trim(),
              recommendedAction: String(record.recommendedAction ?? record.recommended_action ?? '').trim(),
              blockers: arrayOfStrings(record.blockers),
            }
          })
      : [],
    blockers: arrayOfStrings(runtimeCandidateAlignmentPreflight.blockers),
  }
}

function summarizeRuntimeTaskAlignmentRefreshPackage(runtimeTaskAlignmentRefreshPackage) {
  const summary = readObject(runtimeTaskAlignmentRefreshPackage.summary)
  const executionControl = readObject(
    runtimeTaskAlignmentRefreshPackage.executionControl
    ?? runtimeTaskAlignmentRefreshPackage.execution_control,
  )
  const actions = Array.isArray(runtimeTaskAlignmentRefreshPackage.actions)
    ? runtimeTaskAlignmentRefreshPackage.actions
    : []
  return {
    status: String(runtimeTaskAlignmentRefreshPackage.status ?? '').trim(),
    productionReady: Boolean(runtimeTaskAlignmentRefreshPackage.productionReady ?? runtimeTaskAlignmentRefreshPackage.production_ready),
    baselineId: String(runtimeTaskAlignmentRefreshPackage.baselineId ?? runtimeTaskAlignmentRefreshPackage.baseline_id ?? '').trim(),
    projectId: String(runtimeTaskAlignmentRefreshPackage.projectId ?? runtimeTaskAlignmentRefreshPackage.project_id ?? '').trim(),
    preparedBy: String(runtimeTaskAlignmentRefreshPackage.preparedBy ?? runtimeTaskAlignmentRefreshPackage.prepared_by ?? '').trim(),
    actionCount: readNumber(summary.actionCount ?? summary.action_count ?? actions.length),
    stableCodeRefreshReviewActionCount: readNumber(
      summary.stableCodeRefreshReviewActionCount
      ?? summary.stable_code_refresh_review_action_count,
    ),
    missingRuntimeTaskActionCount: readNumber(
      summary.missingRuntimeTaskActionCount
      ?? summary.missing_runtime_task_action_count,
    ),
    actualDateRangeCollectionActionCount: readNumber(
      summary.actualDateRangeCollectionActionCount
      ?? summary.actual_date_range_collection_action_count,
    ),
    collisionReviewActionCount: readNumber(
      summary.collisionReviewActionCount
      ?? summary.collision_review_action_count,
    ),
    executeAllowed: executionControl.executeAllowed === true || executionControl.execute_allowed === true,
    actionExamples: actions.slice(0, 5).map((action) => {
      const record = readObject(action)
      return {
        stableCode: String(record.stableCode ?? record.stable_code ?? '').trim(),
        candidateTitle: String(record.candidateTitle ?? record.candidate_title ?? '').trim(),
        runtimeTaskId: String(record.runtimeTaskId ?? record.runtime_task_id ?? '').trim(),
        runtimeTitle: String(record.runtimeTitle ?? record.runtime_title ?? '').trim(),
        actionKind: String(record.actionKind ?? record.action_kind ?? '').trim(),
        proposedStableCode: String(record.proposedStableCode ?? record.proposed_stable_code ?? '').trim(),
        recommendedOperatorAction: String(record.recommendedOperatorAction ?? record.recommended_operator_action ?? '').trim(),
        blockers: arrayOfStrings(record.blockers),
      }
    }),
    blockers: arrayOfStrings(runtimeTaskAlignmentRefreshPackage.blockers),
  }
}

function summarizeOperatorHandoff(operatorHandoff, operatorHandoffPreflight) {
  const candidateRefreshExecution = readObject(
    operatorHandoff.candidateRefreshExecution
    ?? operatorHandoff.candidate_refresh_execution,
  )
  return {
    status: String(operatorHandoff.status ?? '').trim(),
    productionReady: Boolean(operatorHandoff.productionReady),
    baselineId: String(operatorHandoff.baselineId ?? operatorHandoff.baseline_id ?? '').trim(),
    projectId: String(operatorHandoff.projectId ?? operatorHandoff.project_id ?? '').trim(),
    publicationKey: String(operatorHandoff.publicationKey ?? operatorHandoff.publication_key ?? '').trim(),
    environment: String(operatorHandoff.environment ?? '').trim(),
    currentBlockers: arrayOfStrings(operatorHandoff.currentBlockers ?? operatorHandoff.current_blockers),
    candidateRefreshExecution: {
      status: String(candidateRefreshExecution.status ?? '').trim(),
      dbRepairPlan: normalizeActionGroupDbRepairPlan(candidateRefreshExecution.dbRepairPlan ?? candidateRefreshExecution.db_repair_plan),
      executionGatePlan: normalizeActionGroupExecutionGatePlan(candidateRefreshExecution.executionGatePlan ?? candidateRefreshExecution.execution_gate_plan),
      nextActions: arrayOfStrings(candidateRefreshExecution.nextActions ?? candidateRefreshExecution.next_actions),
    },
    deferredCurrentBlockers: summarizeDeferredCurrentBlockers(
      operatorHandoff.deferredCurrentBlockers ?? operatorHandoff.deferred_current_blockers,
    ),
    preflightStatus: String(operatorHandoffPreflight.status ?? '').trim(),
    sourceExportMode: String(operatorHandoffPreflight.sourceExportMode ?? '').trim(),
    mayRunSupportingSourceExport: operatorHandoffPreflight.mayRunSupportingSourceExport === true,
    mayRunProductionSourceExport: operatorHandoffPreflight.mayRunProductionSourceExport === true,
    mayRunSourceExport: operatorHandoffPreflight.mayRunSourceExport === true,
    mayAcceptRealProductionOutcomeEvidence: operatorHandoffPreflight.mayAcceptRealProductionOutcomeEvidence === true,
    mayRunProductionEvidencePipeline: operatorHandoffPreflight.mayRunProductionEvidencePipeline === true,
    placeholderFindingCount: readNumber(operatorHandoffPreflight.placeholderFindingCount),
    runnableActionIds: actionIdsFromPreflight(operatorHandoffPreflight, 'runnableActionIds'),
    blockedActionIds: actionIdsFromPreflight(operatorHandoffPreflight, 'blockedActionIds'),
    deferredActionIds: actionIdsFromPreflight(operatorHandoffPreflight, 'deferredActionIds'),
    blockedActionDetails: blockedActionDetailsFromPreflight(operatorHandoffPreflight),
    writeExecutionRunnableActionIds: actionIdsFromPreflight(operatorHandoffPreflight, 'writeExecutionRunnableActionIds'),
    writeExecutionBlockedActionIds: actionIdsFromPreflight(operatorHandoffPreflight, 'writeExecutionBlockedActionIds'),
    writeExecutionDeferredActionIds: actionIdsFromPreflight(operatorHandoffPreflight, 'writeExecutionDeferredActionIds'),
    writeExecutionBlockedActionDetails: blockedActionDetailsFromPreflight(
      operatorHandoffPreflight,
      'writeExecutionBlockedActionDetails',
      'writeExecutionReadiness',
    ),
    preflightBlockers: arrayOfStrings(operatorHandoffPreflight.blockers),
    sourceExportBlockers: arrayOfStrings(operatorHandoffPreflight.sourceExportBlockers),
    productionSourceExportBlockers: arrayOfStrings(operatorHandoffPreflight.productionSourceExportBlockers),
    realProductionOutcomeEvidenceBlockers: arrayOfStrings(operatorHandoffPreflight.realProductionOutcomeEvidenceBlockers),
  }
}

function summarizeDeferredCurrentBlockers(value) {
  const groups = readObject(value)
  return Object.fromEntries(Object.entries(groups).map(([groupId, group]) => {
    const record = readObject(group)
    return [groupId, {
      deferredBy: arrayOfStrings(record.deferredBy ?? record.deferred_by),
      blockers: arrayOfStrings(record.blockers),
    }]
  }))
}

function summarizeRealProductionOutcomePackage(realProductionOutcomePackage) {
  const template = readObject(realProductionOutcomePackage.realProductionOutcomeTemplate)
  const requiredFields = arrayOfStrings(template.requiredFields)
  return {
    status: String(realProductionOutcomePackage.status ?? '').trim(),
    productionReady: Boolean(realProductionOutcomePackage.productionReady),
    targetEnvironment: String(realProductionOutcomePackage.targetEnvironment ?? realProductionOutcomePackage.target_environment ?? '').trim(),
    realProductionOutcomePath: String(realProductionOutcomePackage.realProductionOutcomePath ?? realProductionOutcomePackage.real_production_outcome_path ?? '').trim(),
    requiredFields,
    requiredFieldCount: requiredFields.length,
    blockers: arrayOfStrings(realProductionOutcomePackage.blockers),
    validationBlockers: arrayOfStrings(realProductionOutcomePackage.validationBlockers),
  }
}

function summarizeCandidateRefreshAuthorizationPackage(candidateRefreshAuthorizationPackage) {
  const mutationBoundary = readObject(candidateRefreshAuthorizationPackage.mutationBoundary)
  return {
    status: String(candidateRefreshAuthorizationPackage.status ?? '').trim(),
    productionReady: Boolean(candidateRefreshAuthorizationPackage.productionReady),
    baselineId: String(candidateRefreshAuthorizationPackage.baselineId ?? candidateRefreshAuthorizationPackage.baseline_id ?? '').trim(),
    projectId: String(candidateRefreshAuthorizationPackage.projectId ?? candidateRefreshAuthorizationPackage.project_id ?? '').trim(),
    environment: String(candidateRefreshAuthorizationPackage.environment ?? '').trim(),
    preflightReady: candidateRefreshAuthorizationPackage.preflightReady === true || candidateRefreshAuthorizationPackage.preflight_ready === true,
    executionStatus: String(candidateRefreshAuthorizationPackage.executionStatus ?? candidateRefreshAuthorizationPackage.execution_status ?? '').trim(),
    operatorTemplateRef: String(candidateRefreshAuthorizationPackage.operatorTemplateRef ?? candidateRefreshAuthorizationPackage.operator_template_ref ?? '').trim(),
    packageReadinessBlockers: arrayOfStrings(candidateRefreshAuthorizationPackage.packageReadinessBlockers ?? candidateRefreshAuthorizationPackage.package_readiness_blockers),
    executionBlockers: arrayOfStrings(candidateRefreshAuthorizationPackage.executionBlockers ?? candidateRefreshAuthorizationPackage.execution_blockers),
    executeCandidateRefreshCommand: String(readObject(candidateRefreshAuthorizationPackage.nextCommands ?? candidateRefreshAuthorizationPackage.next_commands).executeCandidateRefresh ?? '').trim(),
    packageOnly: mutationBoundary.packageOnly === true || mutationBoundary.package_only === true,
    doesNotMutateDatabase: mutationBoundary.doesNotMutateDatabase === true || mutationBoundary.does_not_mutate_database === true,
  }
}

function summarizeCandidateRefreshExecutionReadinessSeal(candidateRefreshExecutionReadinessSeal) {
  const unlock = readObject(candidateRefreshExecutionReadinessSeal.unlock)
  const executionControl = readObject(candidateRefreshExecutionReadinessSeal.executionControl)
  const mutationBoundary = readObject(candidateRefreshExecutionReadinessSeal.mutationBoundary)
  return {
    status: String(candidateRefreshExecutionReadinessSeal.status ?? '').trim(),
    productionReady: Boolean(candidateRefreshExecutionReadinessSeal.productionReady),
    baselineId: String(candidateRefreshExecutionReadinessSeal.baselineId ?? candidateRefreshExecutionReadinessSeal.baseline_id ?? '').trim(),
    projectId: String(candidateRefreshExecutionReadinessSeal.projectId ?? candidateRefreshExecutionReadinessSeal.project_id ?? '').trim(),
    businessType: String(candidateRefreshExecutionReadinessSeal.businessType ?? candidateRefreshExecutionReadinessSeal.business_type ?? '').trim(),
    environment: String(candidateRefreshExecutionReadinessSeal.environment ?? '').trim(),
    executionCommandReady: candidateRefreshExecutionReadinessSeal.executionCommandReady === true || candidateRefreshExecutionReadinessSeal.execution_command_ready === true,
    unlockVariable: String(unlock.variable ?? '').trim(),
    unlockPresent: unlock.present === true,
    executeReady: executionControl.executeReady === true || executionControl.execute_ready === true,
    operatorMustRunManually: executionControl.operatorMustRunManually === true || executionControl.operator_must_run_manually === true,
    blockers: arrayOfStrings(candidateRefreshExecutionReadinessSeal.blockers),
    doesNotConnectDatabase: mutationBoundary.doesNotConnectDatabase === true || mutationBoundary.does_not_connect_database === true,
    commandsExecuted: readNumber(mutationBoundary.commandsExecuted),
    writesProductionTables: mutationBoundary.writesProductionTables === true || mutationBoundary.writes_production_tables === true,
  }
}

function summarizeCandidateBaselineMaterializationReadinessSeal(candidateBaselineMaterializationReadinessSeal) {
  const unlock = readObject(candidateBaselineMaterializationReadinessSeal.unlock)
  const executionControl = readObject(candidateBaselineMaterializationReadinessSeal.executionControl)
  const mutationBoundary = readObject(candidateBaselineMaterializationReadinessSeal.mutationBoundary)
  const nextCommands = readObject(candidateBaselineMaterializationReadinessSeal.nextCommands ?? candidateBaselineMaterializationReadinessSeal.next_commands)
  return {
    status: String(candidateBaselineMaterializationReadinessSeal.status ?? '').trim(),
    productionReady: Boolean(candidateBaselineMaterializationReadinessSeal.productionReady),
    baselineId: String(candidateBaselineMaterializationReadinessSeal.baselineId ?? candidateBaselineMaterializationReadinessSeal.baseline_id ?? '').trim(),
    projectId: String(candidateBaselineMaterializationReadinessSeal.projectId ?? candidateBaselineMaterializationReadinessSeal.project_id ?? '').trim(),
    businessType: String(candidateBaselineMaterializationReadinessSeal.businessType ?? candidateBaselineMaterializationReadinessSeal.business_type ?? '').trim(),
    environment: String(candidateBaselineMaterializationReadinessSeal.environment ?? '').trim(),
    materializationCommandReady: candidateBaselineMaterializationReadinessSeal.materializationCommandReady === true || candidateBaselineMaterializationReadinessSeal.materialization_command_ready === true,
    unlockVariable: String(unlock.variable ?? '').trim(),
    unlockPresent: unlock.present === true,
    executeReady: executionControl.executeReady === true || executionControl.execute_ready === true,
    operatorMustRunManually: executionControl.operatorMustRunManually === true || executionControl.operator_must_run_manually === true,
    blockers: arrayOfStrings(candidateBaselineMaterializationReadinessSeal.blockers),
    doesNotConnectDatabase: mutationBoundary.doesNotConnectDatabase === true || mutationBoundary.does_not_connect_database === true,
    commandsExecuted: readNumber(mutationBoundary.commandsExecuted),
    writesCandidateBaselines: mutationBoundary.writesCandidateBaselines === true || mutationBoundary.writes_candidate_baselines === true,
    writesTaskBaselineItems: mutationBoundary.writesTaskBaselineItems === true || mutationBoundary.writes_task_baseline_items === true,
    writesTasks: mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true,
    writesTaskDependencies: mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true,
    writesRuntimePublication: mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true,
    nextCommands: {
      setUnlockPowerShell: String(nextCommands.setUnlockPowerShell ?? nextCommands.set_unlock_power_shell ?? '').trim(),
      executeCandidateBaselineMaterialization: String(nextCommands.executeCandidateBaselineMaterialization ?? nextCommands.execute_candidate_baseline_materialization ?? '').trim(),
      refreshOperatorHandoff: String(nextCommands.refreshOperatorHandoff ?? nextCommands.refresh_operator_handoff ?? '').trim(),
      refreshOperatorHandoffPreflight: String(nextCommands.refreshOperatorHandoffPreflight ?? nextCommands.refresh_operator_handoff_preflight ?? '').trim(),
      refreshRealEvidenceGaps: String(nextCommands.refreshRealEvidenceGaps ?? nextCommands.refresh_real_evidence_gaps ?? '').trim(),
    },
  }
}

function summarizeCandidateHygiene(evidenceSources) {
  const check = readObject(evidenceSources.candidateHygieneCheck)
  return {
    status: String(check.status ?? '').trim(),
    sourcePath: String(check.sourcePath ?? '').trim(),
    totalCandidateExportCount: readNumber(check.totalCandidateExportCount),
    ignoredCandidateExportCount: readNumber(check.ignoredCandidateExportCount),
    extraEligibleCandidateExportCount: readNumber(check.extraEligibleCandidateExportCount),
    currentCandidate: readObject(check.currentCandidate),
    blockers: arrayOfStrings(check.blockers),
  }
}

function buildSummary({ readiness, evidenceSources, reviewEvidence, durationEvidence, runtimeSeedEvidencePipeline, runtimeSeedImportReadinessSeal, durationSampleCollectionPackage, realDurationSampleMaterialTemplate, realDurationSampleCollectionKit, realDurationSampleCollectionKitPreflight, realDurationSampleMaterialBuildReport, realDurationSampleMaterialPreflight, realDurationSampleSourceExport, realDurationSampleSourceExportReport, durationAssetUtilization, completedTaskExportReport, runtimeCandidateAlignmentPreflight, runtimeTaskAlignmentRefreshPackage, operatorHandoff, operatorHandoffPreflight, candidateRefreshAuthorizationPackage, candidateRefreshExecutionReadinessSeal, candidateBaselineMaterializationReadinessSeal, realProductionOutcomePackage, paths }) {
  const readinessSummary = summarizeReadiness(readiness)
  const reviewSummary = summarizeReviewEvidence(reviewEvidence)
  const durationSummary = summarizeDurationEvidence(durationEvidence)
  const runtimeSeedEvidencePipelineSummary = summarizeRuntimeSeedEvidencePipeline(runtimeSeedEvidencePipeline)
  const runtimeSeedImportReadinessSealSummary = summarizeRuntimeSeedImportReadinessSeal(runtimeSeedImportReadinessSeal)
  const durationSampleCollectionPackageSummary = summarizeDurationSampleCollectionPackage(durationSampleCollectionPackage)
  const realDurationSampleMaterialTemplateSummary = summarizeRealDurationSampleMaterialTemplate(realDurationSampleMaterialTemplate)
  const realDurationSampleCollectionKitSummary = summarizeRealDurationSampleCollectionKit(realDurationSampleCollectionKit)
  const realDurationSampleCollectionKitPreflightSummary = summarizeRealDurationSampleCollectionKitPreflight(realDurationSampleCollectionKitPreflight)
  const realDurationSampleMaterialBuildReportSummary = summarizeRealDurationSampleMaterialBuildReport(realDurationSampleMaterialBuildReport)
  const realDurationSampleMaterialPreflightSummary = summarizeRealDurationSampleMaterialPreflight(realDurationSampleMaterialPreflight, durationSampleCollectionPackage)
  const realDurationSampleSourceExportSummary = summarizeRealDurationSampleSourceExport(realDurationSampleSourceExport, realDurationSampleSourceExportReport)
  const durationAssetUtilizationSummary = summarizeDurationAssetUtilization(durationAssetUtilization)
  const completedTaskExportSummary = summarizeCompletedTaskExport(completedTaskExportReport)
  const runtimeCandidateAlignmentSummary = summarizeRuntimeCandidateAlignment(runtimeCandidateAlignmentPreflight)
  const runtimeTaskAlignmentRefreshPackageSummary = summarizeRuntimeTaskAlignmentRefreshPackage(runtimeTaskAlignmentRefreshPackage)
  const operatorHandoffSummary = summarizeOperatorHandoff(operatorHandoff, operatorHandoffPreflight)
  const candidateRefreshAuthorizationPackageSummary = summarizeCandidateRefreshAuthorizationPackage(candidateRefreshAuthorizationPackage)
  const candidateRefreshExecutionReadinessSealSummary = summarizeCandidateRefreshExecutionReadinessSeal(candidateRefreshExecutionReadinessSeal)
  const candidateBaselineMaterializationReadinessSealSummary = summarizeCandidateBaselineMaterializationReadinessSeal(candidateBaselineMaterializationReadinessSeal)
  const realProductionOutcomePackageSummary = summarizeRealProductionOutcomePackage(realProductionOutcomePackage)
  const candidateHygieneSummary = summarizeCandidateHygiene(evidenceSources)
  const rawMissingEvidenceTypes = arrayOfStrings(evidenceSources.missingEvidenceTypes)
  const missingEvidenceTypes = rawMissingEvidenceTypes.filter((type) => type !== 'reviewEvidence')
  const sourceManifestCheck = readObject(evidenceSources.sourceManifestCheck)
  const productionReadinessBlockers = readinessSummary.productionReadinessBlockers
  const hasStagingReplayBlocker = productionReadinessBlockers.includes('staging_controlled_replay_not_production_ready')
  const prioritizedNextActionGroups = buildPrioritizedNextActionGroups({
    operatorHandoffSummary,
    runtimeSeedEvidencePipelineSummary,
    completedTaskExportSummary,
    runtimeCandidateAlignmentSummary,
    runtimeTaskAlignmentRefreshPackageSummary,
    realDurationSampleMaterialPreflightSummary,
    realProductionOutcomePackageSummary,
    candidateBaselineMaterializationReadinessSealSummary,
    productionReadinessBlockers,
  })
  const blockedGateActionCoverage = buildBlockedGateActionCoverage(
    readinessSummary.blockedRealGates,
    prioritizedNextActionGroups,
  )
  const operatorUnblockRequirementReport = buildOperatorUnblockRequirementReport(prioritizedNextActionGroups)
  const operatorCommandPlan = buildOperatorCommandPlan(prioritizedNextActionGroups)
  const operatorCommandExecutionPlan = buildOperatorCommandExecutionPlan(
    operatorCommandPlan.plan,
    prioritizedNextActionGroups.length,
  )
  const operatorCommandExecutionQueues = buildOperatorCommandExecutionQueues(operatorCommandExecutionPlan.plan)

  return {
    schemaVersion: 'workbuddy-default-master-plan-real-evidence-gap-summary/v1',
    generatedAt: new Date().toISOString(),
    source: 'summarize-default-master-plan-real-evidence-gaps',
    status: readinessSummary.productionReady ? 'pass' : String(readiness.status ?? 'blocked'),
    productionReady: readinessSummary.productionReady,
    legacyPmOnlyBlockIgnored: readinessSummary.legacyPmOnlyBlockIgnored,
    runtimeEvidenceChainPassed: Boolean(readiness.runtimeEvidenceChainPassed) || readinessSummary.productionReady,
    productionReadinessBlockers,
    evidenceQualification: readObject(readiness.evidenceQualification),
    currentEvidenceLevel: String(readiness.currentEvidenceLevel ?? '').trim(),
    requiredEvidenceLevel: String(readiness.requiredEvidenceLevel ?? '').trim(),
    businessTypeCount: readNumber(readiness.businessTypeCount),
    gateSummary: readinessSummary.gateSummary,
    inputs: {
      readiness: repoRelative(paths.readiness),
      evidenceSources: repoRelative(paths.evidenceSources),
      offlineDevelopmentQualityReviewSource: repoRelative(paths.reviewEvidence),
      durationCalibrationEvidence: repoRelative(paths.durationCalibrationEvidence),
      runtimeSeedEvidencePipeline: repoRelative(paths.runtimeSeedEvidencePipeline),
      runtimeSeedImportReadinessSeal: repoRelative(paths.runtimeSeedImportReadinessSeal),
      durationSampleCollectionPackage: repoRelative(paths.durationSampleCollectionPackage),
      realDurationSampleMaterialTemplate: repoRelative(paths.realDurationSampleMaterialTemplate),
      realDurationSampleCollectionKit: repoRelative(paths.realDurationSampleCollectionKit),
      realDurationSampleCollectionKitPreflight: repoRelative(paths.realDurationSampleCollectionKitPreflight),
      realDurationSampleMaterialBuildReport: repoRelative(paths.realDurationSampleMaterialBuildReport),
      realDurationSampleMaterialPreflight: repoRelative(paths.realDurationSampleMaterialPreflight),
      realDurationSampleSourceExport: repoRelative(paths.realDurationSampleSourceExport),
      realDurationSampleSourceExportReport: repoRelative(paths.realDurationSampleSourceExportReport),
      durationAssetUtilization: repoRelative(paths.durationAssetUtilization),
      completedTaskExportReport: repoRelative(paths.completedTaskExportReport),
      runtimeCandidateAlignmentPreflight: repoRelative(paths.runtimeCandidateAlignmentPreflight),
      runtimeTaskAlignmentRefreshPackage: repoRelative(paths.runtimeTaskAlignmentRefreshPackage),
      operatorHandoff: repoRelative(paths.operatorHandoff),
      operatorHandoffPreflight: repoRelative(paths.operatorHandoffPreflight),
      candidateRefreshAuthorizationPackage: repoRelative(paths.candidateRefreshAuthorizationPackage),
      candidateRefreshExecutionReadinessSeal: repoRelative(paths.candidateRefreshExecutionReadinessSeal),
      candidateBaselineMaterializationReadinessSeal: repoRelative(paths.candidateBaselineMaterializationReadinessSeal),
      realProductionOutcomePackage: repoRelative(paths.realProductionOutcomePackage),
    },
    closedLocalGateIds: readinessSummary.closedLocalGateIds,
    blockedRealGates: readinessSummary.blockedRealGates,
    realEvidenceGaps: {
      candidateHygiene: candidateHygieneSummary,
      offlineDevelopmentQualityReview: reviewSummary,
      durationCalibration: durationSummary,
      runtimeSeedEvidencePipeline: runtimeSeedEvidencePipelineSummary,
      runtimeSeedImportReadinessSeal: runtimeSeedImportReadinessSealSummary,
      durationSampleCollectionPackage: durationSampleCollectionPackageSummary,
      realDurationSampleMaterialTemplate: realDurationSampleMaterialTemplateSummary,
      realDurationSampleCollectionKit: realDurationSampleCollectionKitSummary,
      realDurationSampleCollectionKitPreflight: realDurationSampleCollectionKitPreflightSummary,
      realDurationSampleMaterialBuildReport: realDurationSampleMaterialBuildReportSummary,
      realDurationSampleMaterialPreflight: realDurationSampleMaterialPreflightSummary,
      realDurationSampleSourceExport: realDurationSampleSourceExportSummary,
      durationAssetUtilization: durationAssetUtilizationSummary,
      completedTaskExport: completedTaskExportSummary,
      runtimeCandidateAlignment: runtimeCandidateAlignmentSummary,
      runtimeTaskAlignmentRefreshPackage: runtimeTaskAlignmentRefreshPackageSummary,
      runtimeMaterialMissingEvidenceTypes: missingEvidenceTypes,
      optionalOfflineEvidenceTypes: rawMissingEvidenceTypes.filter((type) => type === 'reviewEvidence'),
      sourceManifest: {
        sourcePath: String(sourceManifestCheck.sourcePath ?? '').trim(),
        status: String(sourceManifestCheck.status ?? '').trim(),
        target: readObject(sourceManifestCheck.target),
        blockers: arrayOfStrings(sourceManifestCheck.blockers),
      },
      operatorHandoff: operatorHandoffSummary,
      candidateRefreshAuthorizationPackage: candidateRefreshAuthorizationPackageSummary,
      candidateRefreshExecutionReadinessSeal: candidateRefreshExecutionReadinessSealSummary,
      candidateBaselineMaterializationReadinessSeal: candidateBaselineMaterializationReadinessSealSummary,
      realProductionOutcomePackage: realProductionOutcomePackageSummary,
    },
    prioritizedNextActionGroups,
    blockedGateActionCoverageSummary: blockedGateActionCoverage.summary,
    blockedGateActionCoverage: blockedGateActionCoverage.coverage,
    operatorUnblockRequirementSummary: operatorUnblockRequirementReport.summary,
    operatorUnblockRequirementMatrix: operatorUnblockRequirementReport.matrix,
    operatorCommandPlanSummary: operatorCommandPlan.summary,
    operatorCommandPlan: operatorCommandPlan.plan,
    operatorCommandExecutionPlanSummary: operatorCommandExecutionPlan.summary,
    operatorCommandExecutionPlan: operatorCommandExecutionPlan.plan,
    operatorCommandExecutionQueueSummary: operatorCommandExecutionQueues.summary,
    operatorCommandExecutionQueues: operatorCommandExecutionQueues.queues,
    nextActions: prioritizedNextActionGroups.length > 0
      ? prioritizedNextActionGroups.map((group) => group.nextAction)
      : hasStagingReplayBlocker
      ? [
          'Keep the current school-project result as staging controlled replay evidence only.',
          'Collect or export a non-controlled production/live outcome evidence chain before claiming production-ready.',
          'Rebuild the full phase=all source manifest, readiness report, bundle, pipeline report, and gap summary after real production/live evidence exists.',
        ]
      : [
          'Collect accepted real duration samples for the same candidate rows and rebuild duration-calibration-evidence.json.',
          'After duration calibration passes, run the governed dependency writer and export task_dependencies/critical-path readback evidence.',
          'Publish through the governed runtime publication layer and collect runtime publication evidence.',
          'Run real target API/UI/critical-path/rollback smoke, then rebuild the full phase=all source manifest and readiness report.',
        ],
    mutationBoundary: {
      readsLocalReports: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }
}

function buildMarkdown(summary) {
  const lines = []
  lines.push('# Default Master Plan Real Evidence Gap Summary')
  lines.push('')
  lines.push(`Generated: ${summary.generatedAt}`)
  lines.push(`Status: ${summary.status}`)
  lines.push(`Production ready: ${summary.productionReady ? 'yes' : 'no'}`)
  lines.push(`Runtime evidence chain passed: ${summary.runtimeEvidenceChainPassed ? 'yes' : 'no'}`)
  lines.push(`Current level: ${summary.currentEvidenceLevel}`)
  lines.push(`Required level: ${summary.requiredEvidenceLevel}`)
  lines.push(`Business types covered: ${summary.businessTypeCount}`)
  lines.push(`Gate completion: ${summary.gateSummary.pass}/${summary.gateSummary.total} (${summary.gateSummary.completionRate}%)`)
  lines.push(`Gate blockers: blocked=${summary.gateSummary.blocked}, fail=${summary.gateSummary.fail}`)
  lines.push('')
  lines.push('## Already Closed Locally')
  lines.push('')
  lines.push(...markdownList(summary.closedLocalGateIds))
  lines.push('')
  lines.push('## Still Blocked By Real Evidence')
  lines.push('')
  for (const gate of summary.blockedRealGates) {
    lines.push(`- ${gate.id} (${gate.tier || 'unknown'}): ${gate.blockers.join('; ') || gate.status}`)
  }
  lines.push('')
  lines.push('## Blocked Gate Action Coverage')
  lines.push('')
  lines.push(`- coverage: ${summary.blockedGateActionCoverageSummary.coveredBlockedGateCount}/${summary.blockedGateActionCoverageSummary.totalBlockedGateCount} (${summary.blockedGateActionCoverageSummary.coverageRate}%)`)
  lines.push(`- uncovered: ${summary.blockedGateActionCoverageSummary.uncoveredBlockedGateCount}`)
  for (const entry of summary.blockedGateActionCoverage) {
    const actionGroupList = entry.coveredByActionGroupIds.length > 0
      ? entry.coveredByActionGroupIds.join(', ')
      : 'uncovered'
    lines.push(`- ${entry.gateId} -> ${actionGroupList}`)
    lines.push(...entry.uncoveredBlockers.map((blocker) => `  - uncovered_blocker: ${blocker}`))
  }
  lines.push('')
  lines.push('## Operator Unblock Requirement Summary')
  lines.push('')
  lines.push(`- actionGroupCount: ${summary.operatorUnblockRequirementSummary.actionGroupCount}`)
  lines.push(`- blockedActionGroupCount: ${summary.operatorUnblockRequirementSummary.blockedActionGroupCount}`)
  lines.push(`- deferredActionGroupCount: ${summary.operatorUnblockRequirementSummary.deferredActionGroupCount}`)
  lines.push(`- operatorRequirementActionCount: ${summary.operatorUnblockRequirementSummary.operatorRequirementActionCount}`)
  lines.push(`- envUnlockCount: ${summary.operatorUnblockRequirementSummary.envUnlockCount}`)
  lines.push(`- requiredFlagCount: ${summary.operatorUnblockRequirementSummary.requiredFlagCount}`)
  lines.push(`- operatorFieldCount: ${summary.operatorUnblockRequirementSummary.operatorFieldCount}`)
  lines.push(`- evidenceInputCount: ${summary.operatorUnblockRequirementSummary.evidenceInputCount}`)
  lines.push(`- environmentTargetCount: ${summary.operatorUnblockRequirementSummary.environmentTargetCount}`)
  lines.push(`- verificationCommandCount: ${summary.operatorUnblockRequirementSummary.verificationCommandCount}`)
  lines.push(`- repairRequiredStepCount: ${summary.operatorUnblockRequirementSummary.repairRequiredStepCount}`)
  lines.push(`- dbRepairRequiredStepCount: ${summary.operatorUnblockRequirementSummary.dbRepairRequiredStepCount}`)
  lines.push(`- blockedPlanStepCount: ${summary.operatorUnblockRequirementSummary.blockedPlanStepCount}`)
  lines.push(...summary.operatorUnblockRequirementSummary.envUnlockVariables.map((value) => `- env_unlock_variable: ${value}`))
  lines.push(...summary.operatorUnblockRequirementSummary.requiredFlags.map((value) => `- required_flag: ${value}`))
  lines.push(...summary.operatorUnblockRequirementSummary.operatorFields.map((value) => `- operator_field: ${value}`))
  lines.push(...summary.operatorUnblockRequirementSummary.evidenceInputArtifacts.map((value) => `- evidence_input_artifact: ${value}`))
  lines.push(...summary.operatorUnblockRequirementSummary.requiredEnvironmentTargets.map((value) => `- required_environment_target: ${value}`))
  lines.push(...summary.operatorUnblockRequirementSummary.verificationCommands.map((value) => `- verification_command: ${value}`))
  lines.push(...summary.operatorUnblockRequirementSummary.repairRequiredStepIds.map((value) => `- repair_required_step: ${value}`))
  lines.push(...summary.operatorUnblockRequirementSummary.dbRepairRequiredStepIds.map((value) => `- db_repair_required_step: ${value}`))
  lines.push(...summary.operatorUnblockRequirementSummary.blockedPlanStepIds.map((value) => `- blocked_plan_step: ${value}`))
  lines.push('')
  lines.push('## Operator Command Plan')
  lines.push('')
  lines.push(`- totalCommandCount: ${summary.operatorCommandPlanSummary.totalCommandCount}`)
  lines.push(`- blockedCommandCount: ${summary.operatorCommandPlanSummary.blockedCommandCount}`)
  lines.push(`- deferredCommandCount: ${summary.operatorCommandPlanSummary.deferredCommandCount}`)
  lines.push(`- readOnlyEvidenceCommandCount: ${summary.operatorCommandPlanSummary.readOnlyEvidenceCommandCount}`)
  lines.push(`- guardedWriteOrLiveCommandCount: ${summary.operatorCommandPlanSummary.guardedWriteOrLiveCommandCount}`)
  lines.push(`- manualPrerequisiteCommandCount: ${summary.operatorCommandPlanSummary.manualPrerequisiteCommandCount}`)
  for (const entry of summary.operatorCommandPlan) {
    lines.push(`- command_plan: ${entry.actionGroupId} | ${entry.executionReadiness} | ${entry.commandKind} | ${entry.command}`)
  }
  lines.push('')
  lines.push('## Operator Command Execution Plan')
  lines.push('')
  lines.push(`- rawCommandCount: ${summary.operatorCommandExecutionPlanSummary.rawCommandCount}`)
  lines.push(`- uniqueCommandCount: ${summary.operatorCommandExecutionPlanSummary.uniqueCommandCount}`)
  lines.push(`- duplicateCommandCount: ${summary.operatorCommandExecutionPlanSummary.duplicateCommandCount}`)
  lines.push(`- blockedCommandCount: ${summary.operatorCommandExecutionPlanSummary.blockedCommandCount}`)
  lines.push(`- deferredCommandCount: ${summary.operatorCommandExecutionPlanSummary.deferredCommandCount}`)
  lines.push(`- readOnlyEvidenceCommandCount: ${summary.operatorCommandExecutionPlanSummary.readOnlyEvidenceCommandCount}`)
  lines.push(`- guardedWriteOrLiveCommandCount: ${summary.operatorCommandExecutionPlanSummary.guardedWriteOrLiveCommandCount}`)
  lines.push(`- manualPrerequisiteCommandCount: ${summary.operatorCommandExecutionPlanSummary.manualPrerequisiteCommandCount}`)
  for (const entry of summary.operatorCommandExecutionPlan) {
    const groups = entry.actionGroupIds.length > 0 ? entry.actionGroupIds.join(', ') : 'unknown'
    const sources = entry.commandSources.length > 0 ? entry.commandSources.join(', ') : 'unknown'
    lines.push(`- command_execution_plan: ${entry.executionReadiness} | ${entry.commandKind} | dup=${entry.duplicateCount} | ${entry.command}`)
    lines.push(`  - action_groups: ${groups}`)
    lines.push(`  - sources: ${sources}`)
  }
  lines.push('')
  lines.push('## Operator Command Execution Queues')
  lines.push('')
  lines.push(`- totalUniqueCommandCount: ${summary.operatorCommandExecutionQueueSummary.totalUniqueCommandCount}`)
  lines.push(`- readOnlyEvidenceCommandCount: ${summary.operatorCommandExecutionQueueSummary.readOnlyEvidenceCommandCount}`)
  lines.push(`- manualPrerequisiteCommandCount: ${summary.operatorCommandExecutionQueueSummary.manualPrerequisiteCommandCount}`)
  lines.push(`- guardedWriteOrLiveCommandCount: ${summary.operatorCommandExecutionQueueSummary.guardedWriteOrLiveCommandCount}`)
  lines.push(`- autoRunAllowedCommandCount: ${summary.operatorCommandExecutionQueueSummary.autoRunAllowedCommandCount}`)
  lines.push(`- autoRunForbiddenCommandCount: ${summary.operatorCommandExecutionQueueSummary.autoRunForbiddenCommandCount}`)
  for (const [queueName, entries] of Object.entries(summary.operatorCommandExecutionQueues)) {
    for (const entry of entries) {
      lines.push(`- command_execution_queue: ${entry.queueId} | ${entry.autoRunAllowed ? 'auto' : 'manual'} | ${entry.command}`)
      lines.push(`  - queue_name: ${queueName}`)
      lines.push(`  - execution_readiness: ${entry.executionReadiness}`)
      lines.push(`  - command_kind: ${entry.commandKind}`)
    }
  }
  lines.push('')
  lines.push('## Candidate Export Hygiene')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.candidateHygiene.status || 'unknown'}`)
  lines.push(`- path: ${summary.realEvidenceGaps.candidateHygiene.sourcePath || 'missing'}`)
  lines.push(`- totalCandidateExportCount: ${summary.realEvidenceGaps.candidateHygiene.totalCandidateExportCount}`)
  lines.push(`- ignoredCandidateExportCount: ${summary.realEvidenceGaps.candidateHygiene.ignoredCandidateExportCount}`)
  lines.push(`- extraEligibleCandidateExportCount: ${summary.realEvidenceGaps.candidateHygiene.extraEligibleCandidateExportCount}`)
  const currentCandidate = readObject(summary.realEvidenceGaps.candidateHygiene.currentCandidate)
  if (Object.keys(currentCandidate).length > 0) {
    lines.push(`- currentCandidateBaselineId: ${currentCandidate.baselineId || currentCandidate.baseline_id || 'missing'}`)
    lines.push(`- currentCandidateProjectId: ${currentCandidate.projectId || currentCandidate.project_id || 'missing'}`)
  }
  lines.push(...summary.realEvidenceGaps.candidateHygiene.blockers.map((blocker) => `- candidate_hygiene_blocker: ${blocker}`))
  lines.push('')
  lines.push('## Source Manifest')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.sourceManifest.status || 'unknown'}`)
  lines.push(`- path: ${summary.realEvidenceGaps.sourceManifest.sourcePath || 'missing'}`)
  const sourceManifestTarget = readObject(summary.realEvidenceGaps.sourceManifest.target)
  if (Object.keys(sourceManifestTarget).length > 0) {
    lines.push(`- envFileRef: ${sourceManifestTarget.envFileRef || 'unknown'}`)
    lines.push(`- supabaseProjectRef: ${sourceManifestTarget.supabaseProjectRef || 'unknown'}`)
    lines.push(`- databaseHost: ${sourceManifestTarget.databaseHost || 'unknown'}`)
    lines.push(`- connectionSource: ${sourceManifestTarget.connectionSource || 'unknown'}`)
  }
  lines.push(...summary.realEvidenceGaps.sourceManifest.blockers.map((blocker) => `- ${blocker}`))
  lines.push('')
  lines.push('## Offline Development Quality Review')
  lines.push('')
  const offlineQualityReview = summary.realEvidenceGaps.offlineDevelopmentQualityReview
  lines.push(`- status: ${offlineQualityReview.status || 'not_provided'}`)
  lines.push(`- requiredForRuntime: ${offlineQualityReview.requiredForRuntime === true}`)
  lines.push(`- intendedUse: ${offlineQualityReview.intendedUse}`)
  lines.push(`- baselineId: ${offlineQualityReview.baselineId || 'missing'}`)
  lines.push(`- projectId: ${offlineQualityReview.projectId || 'missing'}`)
  lines.push(`- reviewedBy: ${offlineQualityReview.reviewedBy || 'missing'}`)
  lines.push(`- reviewedItemCount: ${offlineQualityReview.reviewedItemCount}`)
  lines.push(...offlineQualityReview.qualityFindings.map((finding) => `- quality_finding: ${finding}`))
  lines.push('')
  lines.push('## Duration Calibration')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.durationCalibration.status || 'unknown'}`)
  lines.push(`- evidenceLevel: ${summary.realEvidenceGaps.durationCalibration.evidenceLevel || 'unknown'}`)
  lines.push(`- acceptedRealDurationSampleCount: ${summary.realEvidenceGaps.durationCalibration.acceptedRealDurationSampleCount}`)
  lines.push(`- calibratedReferenceDayCount: ${summary.realEvidenceGaps.durationCalibration.calibratedReferenceDayCount}`)
  lines.push(`- calibrationDeltaCount: ${summary.realEvidenceGaps.durationCalibration.calibrationDeltaCount}`)
  lines.push(...summary.realEvidenceGaps.durationCalibration.blockers.map((blocker) => `- ${blocker}`))
  lines.push('')
  lines.push('## Runtime Seed And Reference Days')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.status || 'unknown'}`)
  lines.push(`- environmentStatus: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.status || 'unknown'}`)
  lines.push(`- environmentTargetClass: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.targetClass || 'unknown'}`)
  lines.push(`- localSupabaseReachable: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.localSupabaseReachable ? 'yes' : 'no'}`)
  lines.push(`- repairPlanStatus: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.repairPlan.status || 'unknown'}`)
  lines.push(`- repairPlanNoAutoInstall: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.repairPlan.noAutoInstall ? 'yes' : 'no'}`)
  lines.push(`- repairPlanRequiredStepIds: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.repairPlan.requiredStepIds.join(', ') || 'none'}`)
  lines.push(`- repairPlanBlockedStepIds: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.repairPlan.blockedStepIds.join(', ') || 'none'}`)
  lines.push(`- repairPlanOrderedStepCount: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.repairPlan.orderedStepCount}`)
  lines.push(`- repairPlanOrderedStepIds: ${arrayOfStrings(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.repairPlan.orderedSteps.map((step) => step.id)).join(', ') || 'none'}`)
  lines.push(`- preflightStatus: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.preflight.status || 'unknown'}`)
  lines.push(`- runtimeSeedBusinessTypesReady: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.preflight.readyBusinessTypeCount}`)
  lines.push(`- runtimeSeedBusinessTypesMissing: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.preflight.missingBusinessTypeCount}`)
  lines.push(`- requiredRuntimeSeedStableCodeCount: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.preflight.requiredRuntimeSeedStableCodeCount}`)
  lines.push(`- runtimeReferenceDaysReadyBusinessTypeCount: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.runtimeReferenceDays.readyBusinessTypeCount}`)
  lines.push(`- runtimeReferenceDaysMissingBusinessTypeCount: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.runtimeReferenceDays.missingBusinessTypeCount}`)
  lines.push(`- runtimeReferenceDaysMissingBusinessTypes: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.runtimeReferenceDays.missingBusinessTypes.join(', ') || 'none'}`)
  lines.push(`- requiredRuntimeReferenceStableCodeCount: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.runtimeReferenceDays.requiredRuntimeReferenceStableCodeCount}`)
  lines.push(`- runtimeSeedCoverageMissingStableCodeCount: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.coverage.missingStableCodeCount}`)
  lines.push(`- runtimeSeedImportRequired: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.coverage.runtimeSeedImportRequired ? 'yes' : 'no'}`)
  lines.push(`- runtimeSeedEvidenceAlreadyReady: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.coverage.runtimeSeedEvidenceAlreadyReady ? 'yes' : 'no'}`)
  lines.push(`- importGateStatus: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.importGate.status || 'unknown'}`)
  lines.push(`- importAllowed: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.importGate.importAllowed ? 'yes' : 'no'}`)
  lines.push(`- importRequired: ${summary.realEvidenceGaps.runtimeSeedEvidencePipeline.importGate.importRequired ? 'yes' : 'no'}`)
  lines.push(...summary.realEvidenceGaps.runtimeSeedEvidencePipeline.blockers.map((blocker) => `- runtime_seed_pipeline_blocker: ${blocker}`))
  lines.push(...summary.realEvidenceGaps.runtimeSeedEvidencePipeline.importGate.blockers.map((blocker) => `- runtime_seed_import_gate_blocker: ${blocker}`))
  lines.push(...summary.realEvidenceGaps.runtimeSeedEvidencePipeline.importGate.manualActions.map((action) => `- runtime_seed_manual_action: ${action}`))
  lines.push('')
  lines.push('## Runtime Seed Import Readiness Seal')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.productionReady ? 'yes' : 'no'}`)
  lines.push(`- importGateStatus: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.importGateStatus || 'unknown'}`)
  lines.push(`- executionStatus: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.executionStatus || 'unknown'}`)
  lines.push(`- importCommandReady: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.importCommandReady ? 'yes' : 'no'}`)
  lines.push(`- unlockVariable: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.unlockVariable || 'missing'}`)
  lines.push(`- unlockPresent: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.unlockPresent ? 'yes' : 'no'}`)
  lines.push(`- executeReady: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.executeReady ? 'yes' : 'no'}`)
  lines.push(`- operatorMustRunManually: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.operatorMustRunManually ? 'yes' : 'no'}`)
  lines.push(`- commandsExecuted: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.commandsExecuted}`)
  lines.push(`- doesNotRunRuntimeSeedImport: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.doesNotRunRuntimeSeedImport ? 'yes' : 'no'}`)
  lines.push(`- doesNotConnectDatabase: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.doesNotConnectDatabase ? 'yes' : 'no'}`)
  lines.push(`- writesProductionTables: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesProductionTables ? 'yes' : 'no'}`)
  lines.push(`- writesAlgorithmSeedVersions: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesAlgorithmSeedVersions ? 'yes' : 'no'}`)
  lines.push(`- writesAlgorithmSeedRecords: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesAlgorithmSeedRecords ? 'yes' : 'no'}`)
  lines.push(`- writesAlgorithmSeedImportLogs: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesAlgorithmSeedImportLogs ? 'yes' : 'no'}`)
  lines.push(`- writesTasks: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesTasks ? 'yes' : 'no'}`)
  lines.push(`- writesTaskDependencies: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesTaskDependencies ? 'yes' : 'no'}`)
  lines.push(`- writesRuntimePublication: ${summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesRuntimePublication ? 'yes' : 'no'}`)
  lines.push(...summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.blockers.map((blocker) => `- runtime_seed_import_readiness_seal_blocker: ${blocker}`))
  lines.push('')
  lines.push('## Duration Sample Collection Package')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.durationSampleCollectionPackage.status || 'unknown'}`)
  lines.push(`- requiredStableCodeCount: ${summary.realEvidenceGaps.durationSampleCollectionPackage.requiredStableCodeCount}`)
  lines.push(`- totalRequiredAcceptedSampleCount: ${summary.realEvidenceGaps.durationSampleCollectionPackage.totalRequiredAcceptedSampleCount}`)
  lines.push(`- profileRuntimeReferenceSampleRequestCount: ${summary.realEvidenceGaps.durationSampleCollectionPackage.profileRuntimeReferenceSampleRequestCount}`)
  lines.push(`- durationGapPlanSampleRequestCount: ${summary.realEvidenceGaps.durationSampleCollectionPackage.durationGapPlanSampleRequestCount}`)
  lines.push(`- sampleRequestCount: ${summary.realEvidenceGaps.durationSampleCollectionPackage.sampleRequestCount}`)
  lines.push(...summary.realEvidenceGaps.durationSampleCollectionPackage.blockers.map((blocker) => `- duration_sample_collection_blocker: ${blocker}`))
  if (summary.realEvidenceGaps.durationSampleCollectionPackage.sampleRequestExamples.length > 0) {
    lines.push('')
    lines.push('| stableCode | title | businessType | requiredAcceptedSampleCount | currentAcceptedSampleCount |')
    lines.push('|---|---|---|---|---|')
    for (const request of summary.realEvidenceGaps.durationSampleCollectionPackage.sampleRequestExamples) {
      lines.push([
        request.stableCode,
        request.title,
        request.businessType,
        request.requiredAcceptedSampleCount,
        request.currentAcceptedSampleCount,
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push('')
  lines.push('## Real Duration Sample Material Template')
  lines.push('')
  lines.push(`- templateStatus: ${summary.realEvidenceGaps.realDurationSampleMaterialTemplate.templateStatus || 'unknown'}`)
  lines.push(`- materialTemplate: ${summary.realEvidenceGaps.realDurationSampleMaterialTemplate.materialTemplate ? 'yes' : 'no'}`)
  lines.push(`- templateSampleCount: ${summary.realEvidenceGaps.realDurationSampleMaterialTemplate.templateSampleCount}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.realDurationSampleMaterialTemplate.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.realDurationSampleMaterialTemplate.projectId || 'missing'}`)
  lines.push(`- collectionPackageRef: ${summary.realEvidenceGaps.realDurationSampleMaterialTemplate.collectionPackageRef || 'missing'}`)
  lines.push(`- noWriteBoundary: ${summary.realEvidenceGaps.realDurationSampleMaterialTemplate.noWriteBoundary || 'unknown'}`)
  lines.push(...summary.realEvidenceGaps.realDurationSampleMaterialTemplate.blockers.map((blocker) => `- real_duration_sample_material_template_blocker: ${blocker}`))
  if (summary.realEvidenceGaps.realDurationSampleMaterialTemplate.sampleRequestExamples.length > 0) {
    lines.push('')
    lines.push('| stableCode | title | sampleStatus | includedInBenchmark |')
    lines.push('|---|---|---|---|')
    for (const request of summary.realEvidenceGaps.realDurationSampleMaterialTemplate.sampleRequestExamples) {
      lines.push([
        request.stableCode,
        request.title,
        request.sampleStatus,
        request.includedInBenchmark ? 'yes' : 'no',
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push('')
  lines.push('## Real Duration Sample Collection Kit')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.productionReady ? 'yes' : 'no'}`)
  lines.push(`- noWriteBoundary: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.noWriteBoundary || 'unknown'}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.projectId || 'missing'}`)
  lines.push(`- preparedBy: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.preparedBy || 'missing'}`)
  lines.push(`- targetSource: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.targetSource || 'missing'}`)
  lines.push(`- targetCount: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.targetCount}`)
  lines.push(`- businessTypeGroupCount: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.businessTypeGroupCount}`)
  lines.push(`- missingSampleCount: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.missingSampleCount}`)
  lines.push(`- invalidSampleCount: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.invalidSampleCount}`)
  lines.push(`- requiredOperatorFieldCount: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.requiredOperatorFieldCount}`)
  lines.push(`- requiredOperatorFields: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.requiredOperatorFields.join(', ') || 'none'}`)
  lines.push(`- writesDurationSamples: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.writesDurationSamples ? 'yes' : 'no'}`)
  lines.push(`- writesTasks: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.writesTasks ? 'yes' : 'no'}`)
  lines.push(`- writesTaskDependencies: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.writesTaskDependencies ? 'yes' : 'no'}`)
  lines.push(`- writesRuntimePublication: ${summary.realEvidenceGaps.realDurationSampleCollectionKit.writesRuntimePublication ? 'yes' : 'no'}`)
  if (summary.realEvidenceGaps.realDurationSampleCollectionKit.businessTypeGroups.length > 0) {
    lines.push('')
    lines.push('| businessType | targetCount | missingSampleCount | invalidSampleCount |')
    lines.push('|---|---:|---:|---:|')
    for (const group of summary.realEvidenceGaps.realDurationSampleCollectionKit.businessTypeGroups) {
      lines.push([
        group.businessType,
        group.targetCount,
        group.missingSampleCount,
        group.invalidSampleCount,
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  if (summary.realEvidenceGaps.realDurationSampleCollectionKit.targetExamples.length > 0) {
    lines.push('')
    lines.push('| priority | businessType | stableCode | title | candidateReferenceDays | durationAssetStableCode | t2RhythmTemplateId | nextAction |')
    lines.push('|---:|---|---|---|---:|---|---|---|')
    for (const target of summary.realEvidenceGaps.realDurationSampleCollectionKit.targetExamples) {
      lines.push([
        target.priority,
        target.businessType,
        target.stableCode,
        target.title,
        target.candidateReferenceDays,
        target.durationAssetStableCode,
        target.t2RhythmTemplateId,
        target.nextAction,
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push('')
  lines.push('## Real Duration Sample Collection Kit Preflight')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.productionReady ? 'yes' : 'no'}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.projectId || 'missing'}`)
  lines.push(`- checkedBy: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.checkedBy || 'missing'}`)
  lines.push(`- targetRowCount: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.targetRowCount}`)
  lines.push(`- readyRowCount: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.readyRowCount}`)
  lines.push(`- invalidRowCount: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.invalidRowCount}`)
  lines.push(`- businessTypeGroupCount: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.businessTypeGroupCount}`)
  lines.push(`- writesDurationSamples: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.writesDurationSamples ? 'yes' : 'no'}`)
  lines.push(`- writesTasks: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.writesTasks ? 'yes' : 'no'}`)
  lines.push(`- writesTaskDependencies: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.writesTaskDependencies ? 'yes' : 'no'}`)
  lines.push(`- writesRuntimePublication: ${summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.writesRuntimePublication ? 'yes' : 'no'}`)
  lines.push(...summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.blockers.map((blocker) => `- real_duration_sample_collection_kit_preflight_blocker: ${blocker}`))
  lines.push('')
  lines.push('')
  lines.push('## Real Duration Sample Material Build Report')
  lines.push('')
  lines.push(`- materialBuildStatus: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.productionReady ? 'yes' : 'no'}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.projectId || 'missing'}`)
  lines.push(`- requiredStableCodeCount: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.requiredStableCodeCount}`)
  lines.push(`- sourceCandidateCount: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.sourceCandidateCount}`)
  lines.push(`- exportedSampleCount: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.exportedSampleCount}`)
  lines.push(`- invalidCandidateCount: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.invalidCandidateCount}`)
  lines.push(`- readyRowCount: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.readyRowCount}`)
  lines.push(`- invalidRowCount: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.invalidRowCount}`)
  lines.push(`- businessTypeGroupCount: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.businessTypeGroupCount}`)
  lines.push(`- materialWritePolicy: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.materialWritePolicy || 'unknown'}`)
  lines.push(`- wroteMaterialFile: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.wroteMaterialFile ? 'yes' : 'no'}`)
  lines.push(`- preservedExistingMaterialFile: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.preservedExistingMaterialFile ? 'yes' : 'no'}`)
  lines.push(`- existingMaterialSampleCount: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.existingMaterialSampleCount}`)
  lines.push(`- existingMaterialStableCodes: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.existingMaterialStableCodes.length > 0 ? summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.existingMaterialStableCodes.join(', ') : 'none'}`)
  lines.push(`- material_build_writesDurationSamples: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.writesDurationSamples ? 'yes' : 'no'}`)
  lines.push(`- material_build_writesTasks: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.writesTasks ? 'yes' : 'no'}`)
  lines.push(`- material_build_writesTaskDependencies: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.writesTaskDependencies ? 'yes' : 'no'}`)
  lines.push(`- material_build_writesRuntimePublication: ${summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.writesRuntimePublication ? 'yes' : 'no'}`)
  lines.push(...summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.blockers.map((blocker) => `- real_duration_sample_material_build_blocker: ${blocker}`))

  lines.push('## Real Duration Sample Material Preflight')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.productionReady ? 'yes' : 'no'}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.projectId || 'missing'}`)
  lines.push(`- checkedBy: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.checkedBy || 'missing'}`)
  lines.push(`- requiredStableCodeCount: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.requiredStableCodeCount}`)
  lines.push(`- readyStableCodeCount: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.readyStableCodeCount}`)
  lines.push(`- missingStableCodeCount: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.missingStableCodeCount}`)
  lines.push(`- rawSampleCount: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.rawSampleCount}`)
  lines.push(`- readySampleCount: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.readySampleCount}`)
  lines.push(`- invalidSampleCount: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.invalidSampleCount}`)
  lines.push(`- missingStableCodes: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.missingStableCodes.join(', ') || 'none'}`)
  lines.push(`- materialSourceEvidencePlaceholderFindingCount: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.materialSourceEvidencePlaceholderFindingCount}`)
  lines.push(`- writesDurationSamples: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.writesDurationSamples ? 'yes' : 'no'}`)
  lines.push(`- writesTasks: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.writesTasks ? 'yes' : 'no'}`)
  lines.push(`- writesTaskDependencies: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.writesTaskDependencies ? 'yes' : 'no'}`)
  lines.push(`- writesRuntimePublication: ${summary.realEvidenceGaps.realDurationSampleMaterialPreflight.writesRuntimePublication ? 'yes' : 'no'}`)
  lines.push(...summary.realEvidenceGaps.realDurationSampleMaterialPreflight.blockers.map((blocker) => `- real_duration_sample_material_preflight_blocker: ${blocker}`))
  if (summary.realEvidenceGaps.realDurationSampleMaterialPreflight.coverageByBusinessType.length > 0) {
    lines.push('')
    lines.push('| businessType | required | ready | missing | invalidSamples | readyStableCodes | missingStableCodes |')
    lines.push('|---|---:|---:|---:|---:|---|---|')
    for (const row of summary.realEvidenceGaps.realDurationSampleMaterialPreflight.coverageByBusinessType) {
      lines.push([
        row.businessType,
        row.requiredStableCodeCount,
        row.readyStableCodeCount,
        row.missingStableCodeCount,
        row.invalidSampleCount,
        row.readyStableCodes.join(', ') || 'none',
        row.missingStableCodes.join(', ') || 'none',
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  if (summary.realEvidenceGaps.realDurationSampleMaterialPreflight.nextSampleCollectionTargets.length > 0) {
    lines.push('')
    lines.push('### Next Sample Collection Targets')
    lines.push('')
    lines.push('| priority | businessType | stableCode | title | required | ready | missing | invalidSamples | nextAction |')
    lines.push('|---:|---|---|---|---:|---:|---:|---:|---|')
    for (const target of summary.realEvidenceGaps.realDurationSampleMaterialPreflight.nextSampleCollectionTargets) {
      lines.push([
        target.priority,
        target.businessType,
        target.stableCode,
        target.title,
        target.requiredAcceptedSampleCount,
        target.readySampleCount,
        target.missingSampleCount,
        target.invalidSampleCount,
        target.nextAction,
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  if (summary.realEvidenceGaps.realDurationSampleMaterialPreflight.readySampleExamples.length > 0) {
    lines.push('')
    lines.push('| stableCode | title | readySampleCount | readySampleIds |')
    lines.push('|---|---|---:|---|')
    for (const sample of summary.realEvidenceGaps.realDurationSampleMaterialPreflight.readySampleExamples) {
      lines.push([
        sample.stableCode,
        sample.title,
        sample.readySampleCount,
        sample.readySampleIds.join(', ') || 'none',
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  if (summary.realEvidenceGaps.realDurationSampleMaterialPreflight.invalidSampleExamples.length > 0) {
    lines.push('')
    lines.push('| id | stableCode | title | blockers |')
    lines.push('|---|---|---|---|')
    for (const sample of summary.realEvidenceGaps.realDurationSampleMaterialPreflight.invalidSampleExamples) {
      lines.push([
        sample.id,
        sample.stableCode,
        sample.title,
        sample.blockers.join(', '),
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push('')
  lines.push('## Real Duration Sample Source Export')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.realDurationSampleSourceExport.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.realDurationSampleSourceExport.productionReady ? 'yes' : 'no'}`)
  lines.push(`- sourceKind: ${summary.realEvidenceGaps.realDurationSampleSourceExport.sourceKind || 'unknown'}`)
  lines.push(`- blocked: ${summary.realEvidenceGaps.realDurationSampleSourceExport.blocked ? 'yes' : 'no'}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.realDurationSampleSourceExport.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.realDurationSampleSourceExport.projectId || 'missing'}`)
  lines.push(`- exportedBy: ${summary.realEvidenceGaps.realDurationSampleSourceExport.exportedBy || 'missing'}`)
  lines.push(`- environment: ${summary.realEvidenceGaps.realDurationSampleSourceExport.environment || 'missing'}`)
  lines.push(`- rowCount: ${summary.realEvidenceGaps.realDurationSampleSourceExport.rowCount}`)
  lines.push(`- exportedSampleCount: ${summary.realEvidenceGaps.realDurationSampleSourceExport.exportedSampleCount}`)
  lines.push(`- missingStableCodeCount: ${summary.realEvidenceGaps.realDurationSampleSourceExport.missingStableCodeCount}`)
  lines.push(`- missingStableCodes: ${summary.realEvidenceGaps.realDurationSampleSourceExport.missingStableCodes.join(', ') || 'none'}`)
  lines.push(`- writesDurationSamples: ${summary.realEvidenceGaps.realDurationSampleSourceExport.writesDurationSamples ? 'yes' : 'no'}`)
  lines.push(`- writesTasks: ${summary.realEvidenceGaps.realDurationSampleSourceExport.writesTasks ? 'yes' : 'no'}`)
  lines.push(`- writesTaskDependencies: ${summary.realEvidenceGaps.realDurationSampleSourceExport.writesTaskDependencies ? 'yes' : 'no'}`)
  lines.push(`- writesRuntimePublication: ${summary.realEvidenceGaps.realDurationSampleSourceExport.writesRuntimePublication ? 'yes' : 'no'}`)
  lines.push(...summary.realEvidenceGaps.realDurationSampleSourceExport.blockers.map((blocker) => `- real_duration_sample_source_export_blocker: ${blocker}`))
  lines.push('')
  lines.push('## Duration Asset Utilization')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.durationAssetUtilization.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.durationAssetUtilization.productionReady ? 'yes' : 'no'}`)
  lines.push(`- businessType: ${summary.realEvidenceGaps.durationAssetUtilization.businessType || 'unknown'}`)
  lines.push(`- rowCount: ${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- standardWorkDurationSeedRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithStandardWorkSeedCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- activeStandardWorkDurationSeedRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithActiveStandardWorkSeedCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- fallbackStandardWorkDurationSeedRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithFallbackStandardWorkSeedCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- t2RhythmTemplateRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithT2RhythmTemplateCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- activeT2RhythmTemplateRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithActiveT2RhythmTemplateCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- fallbackT2RhythmTemplateRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithFallbackT2RhythmTemplateCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- runtimeReferenceDaysRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithRuntimeReferenceDaysCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- missingRuntimeReferenceDaysRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsMissingRuntimeReferenceDaysCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- quantityOrProductivityRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithQuantityOrProductivityCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- dependencyEvidenceRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithDependencyEvidenceCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- dependencyAssetRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithDependencyAssetCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- dependencyTimingAssetRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithDependencyTimingAssetCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- processSeasonalDurationAssetRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithProcessSeasonalDurationAssetCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- constructionCalendarRows: ${summary.realEvidenceGaps.durationAssetUtilization.rowsWithConstructionCalendarCount}/${summary.realEvidenceGaps.durationAssetUtilization.rowCount}`)
  lines.push(`- runtimeSeedPostImportStatus: ${summary.realEvidenceGaps.durationAssetUtilization.runtimeSeedPostImportStatus || 'unknown'}`)
  lines.push(`- activeStandardWorkDurationSeedReady: ${summary.realEvidenceGaps.durationAssetUtilization.activeStandardWorkDurationSeedReady ? 'yes' : 'no'}`)
  lines.push(`- activeT2RhythmTemplateReady: ${summary.realEvidenceGaps.durationAssetUtilization.activeT2RhythmTemplateReady ? 'yes' : 'no'}`)
  lines.push(`- businessTypeSpecialtyAssetCoverage: ${summary.realEvidenceGaps.durationAssetUtilization.businessTypeSpecialtyAssetCoverageStatus || 'unknown'}`)
  lines.push(...summary.realEvidenceGaps.durationAssetUtilization.blockers.map((blocker) => `- duration_asset_utilization_blocker: ${blocker}`))
  lines.push('')
  lines.push('## Completed Task Export Alignment')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.completedTaskExport.status || 'unknown'}`)
  lines.push(`- requiredStableCodeCount: ${summary.realEvidenceGaps.completedTaskExport.requiredStableCodeCount}`)
  lines.push(`- rawTaskCount: ${summary.realEvidenceGaps.completedTaskExport.rawTaskCount}`)
  lines.push(`- candidateTaskCount: ${summary.realEvidenceGaps.completedTaskExport.candidateTaskCount}`)
  lines.push(`- exportedTaskCount: ${summary.realEvidenceGaps.completedTaskExport.exportedTaskCount}`)
  lines.push(`- invalidTaskCount: ${summary.realEvidenceGaps.completedTaskExport.invalidTaskCount}`)
  lines.push(`- titleMismatchCount: ${summary.realEvidenceGaps.completedTaskExport.titleMismatchCount}`)
  lines.push(`- titleMatchedDifferentStableCodeCount: ${summary.realEvidenceGaps.completedTaskExport.titleMatchedDifferentStableCodeCount}`)
  lines.push(`- missingStableCodeCount: ${summary.realEvidenceGaps.completedTaskExport.missingStableCodeCount}`)
  lines.push(`- missingStableCodes: ${summary.realEvidenceGaps.completedTaskExport.missingStableCodes.join(', ') || 'none'}`)
  lines.push(...summary.realEvidenceGaps.completedTaskExport.blockers.map((blocker) => `- completed_task_export_blocker: ${blocker}`))
  if (summary.realEvidenceGaps.completedTaskExport.invalidTaskExamples.length > 0) {
    lines.push('')
    lines.push('| taskId | stableCode | title | expectedTitle | matchingCodeByTitle | action | blockers |')
    lines.push('|---|---|---|---|---|---|---|')
    for (const task of summary.realEvidenceGaps.completedTaskExport.invalidTaskExamples) {
      lines.push([
        task.id,
        task.stableCode,
        task.title,
        task.expectedTitle,
        task.matchingRequestedStableCodeByTitle,
        task.recommendedAction,
        task.blockers.join(', '),
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push('')
  lines.push('## Runtime Candidate Alignment')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.runtimeCandidateAlignment.status || 'unknown'}`)
  lines.push(`- candidateRowCount: ${summary.realEvidenceGaps.runtimeCandidateAlignment.candidateRowCount}`)
  lines.push(`- runtimeTaskCount: ${summary.realEvidenceGaps.runtimeCandidateAlignment.runtimeTaskCount}`)
  lines.push(`- matchedStableCodeCount: ${summary.realEvidenceGaps.runtimeCandidateAlignment.matchedStableCodeCount}`)
  lines.push(`- missingRuntimeTaskCount: ${summary.realEvidenceGaps.runtimeCandidateAlignment.missingRuntimeTaskCount}`)
  lines.push(`- titleMismatchCount: ${summary.realEvidenceGaps.runtimeCandidateAlignment.titleMismatchCount}`)
  lines.push(`- titleMatchedDifferentStableCodeCount: ${summary.realEvidenceGaps.runtimeCandidateAlignment.titleMatchedDifferentStableCodeCount}`)
  lines.push(`- rowsWithActualDateRangeCount: ${summary.realEvidenceGaps.runtimeCandidateAlignment.rowsWithActualDateRangeCount}`)
  lines.push(`- rowsMissingActualDateRangeCount: ${summary.realEvidenceGaps.runtimeCandidateAlignment.rowsMissingActualDateRangeCount}`)
  lines.push(...summary.realEvidenceGaps.runtimeCandidateAlignment.blockers.map((blocker) => `- runtime_candidate_alignment_blocker: ${blocker}`))
  if (summary.realEvidenceGaps.runtimeCandidateAlignment.driftExamples.length > 0) {
    lines.push('')
    lines.push('| stableCode | candidateTitle | runtimeTaskId | runtimeTitle | status | matchingCodeByRuntimeTitle | action | blockers |')
    lines.push('|---|---|---|---|---|---|---|---|')
    for (const row of summary.realEvidenceGaps.runtimeCandidateAlignment.driftExamples) {
      lines.push([
        row.stableCode,
        row.candidateTitle,
        row.runtimeTaskId,
        row.runtimeTitle,
        row.alignmentStatus,
        row.matchingCandidateStableCodeByRuntimeTitle,
        row.recommendedAction,
        row.blockers.join(', '),
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push('')
  lines.push('## Runtime Task Alignment Refresh Package')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.productionReady ? 'yes' : 'no'}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.projectId || 'missing'}`)
  lines.push(`- preparedBy: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.preparedBy || 'missing'}`)
  lines.push(`- actionCount: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.actionCount}`)
  lines.push(`- stableCodeRefreshReviewActionCount: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.stableCodeRefreshReviewActionCount}`)
  lines.push(`- missingRuntimeTaskActionCount: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.missingRuntimeTaskActionCount}`)
  lines.push(`- actualDateRangeCollectionActionCount: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.actualDateRangeCollectionActionCount}`)
  lines.push(`- collisionReviewActionCount: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.collisionReviewActionCount}`)
  lines.push(`- executeAllowed: ${summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.executeAllowed ? 'yes' : 'no'}`)
  lines.push(...summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.blockers.map((blocker) => `- runtime_task_alignment_refresh_package_blocker: ${blocker}`))
  if (summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.actionExamples.length > 0) {
    lines.push('')
    lines.push('| stableCode | candidateTitle | runtimeTaskId | runtimeTitle | actionKind | proposedStableCode | operatorAction | blockers |')
    lines.push('|---|---|---|---|---|---|---|---|')
    for (const action of summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.actionExamples) {
      lines.push([
        action.stableCode,
        action.candidateTitle,
        action.runtimeTaskId,
        action.runtimeTitle,
        action.actionKind,
        action.proposedStableCode,
        action.recommendedOperatorAction,
        action.blockers.join(', '),
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push('')
  lines.push('## Missing Runtime Material Evidence')
  lines.push('')
  lines.push(...markdownList(summary.realEvidenceGaps.runtimeMaterialMissingEvidenceTypes))
  lines.push('')
  lines.push('## Operator Handoff')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.operatorHandoff.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.operatorHandoff.productionReady ? 'yes' : 'no'}`)
  lines.push(`- environment: ${summary.realEvidenceGaps.operatorHandoff.environment || 'unknown'}`)
  lines.push(`- publicationKey: ${summary.realEvidenceGaps.operatorHandoff.publicationKey || 'missing'}`)
  lines.push(`- placeholderFindingCount: ${summary.realEvidenceGaps.operatorHandoff.placeholderFindingCount}`)
  lines.push(`- sourceExportMode: ${summary.realEvidenceGaps.operatorHandoff.sourceExportMode || 'unknown'}`)
  lines.push(`- mayRunSupportingSourceExport: ${summary.realEvidenceGaps.operatorHandoff.mayRunSupportingSourceExport ? 'yes' : 'no'}`)
  lines.push(`- mayRunProductionSourceExport: ${summary.realEvidenceGaps.operatorHandoff.mayRunProductionSourceExport ? 'yes' : 'no'}`)
  lines.push(`- mayRunSourceExport: ${summary.realEvidenceGaps.operatorHandoff.mayRunSourceExport ? 'yes' : 'no'}`)
  lines.push(`- mayAcceptRealProductionOutcomeEvidence: ${summary.realEvidenceGaps.operatorHandoff.mayAcceptRealProductionOutcomeEvidence ? 'yes' : 'no'}`)
  lines.push(`- mayRunProductionEvidencePipeline: ${summary.realEvidenceGaps.operatorHandoff.mayRunProductionEvidencePipeline ? 'yes' : 'no'}`)
  lines.push(`- runnableActionIds: ${summary.realEvidenceGaps.operatorHandoff.runnableActionIds.join(', ') || 'none'}`)
  lines.push(`- blockedActionIds: ${summary.realEvidenceGaps.operatorHandoff.blockedActionIds.join(', ') || 'none'}`)
  lines.push(`- deferredActionIds: ${summary.realEvidenceGaps.operatorHandoff.deferredActionIds.join(', ') || 'none'}`)
  lines.push(`- writeExecutionRunnableActionIds: ${summary.realEvidenceGaps.operatorHandoff.writeExecutionRunnableActionIds.join(', ') || 'none'}`)
  lines.push(`- writeExecutionBlockedActionIds: ${summary.realEvidenceGaps.operatorHandoff.writeExecutionBlockedActionIds.join(', ') || 'none'}`)
  lines.push(`- writeExecutionDeferredActionIds: ${summary.realEvidenceGaps.operatorHandoff.writeExecutionDeferredActionIds.join(', ') || 'none'}`)
  lines.push(...summary.realEvidenceGaps.operatorHandoff.blockedActionDetails.map((detail) => `- handoff_blocked_action: ${detail.actionId} | ${detail.gate || 'unknown'} | ${arrayOfStrings(detail.blockers).join(', ') || 'none'}`))
  lines.push(...summary.realEvidenceGaps.operatorHandoff.writeExecutionBlockedActionDetails.map((detail) => `- handoff_write_blocked_action: ${detail.actionId} | ${detail.gate || 'unknown'} | ${arrayOfStrings(detail.blockers).join(', ') || 'none'}`))
  lines.push(...summary.realEvidenceGaps.operatorHandoff.currentBlockers.map((blocker) => `- handoff_current_blocker: ${blocker}`))
  for (const [groupId, group] of Object.entries(summary.realEvidenceGaps.operatorHandoff.deferredCurrentBlockers)) {
    const deferredBy = arrayOfStrings(group.deferredBy)
    if (deferredBy.length > 0) {
      lines.push(`- handoff_deferred_${groupId}_by: ${deferredBy.join(', ')}`)
    }
    lines.push(...arrayOfStrings(group.blockers).map((blocker) => `- handoff_deferred_${groupId}_blocker: ${blocker}`))
  }
  lines.push(...summary.realEvidenceGaps.operatorHandoff.preflightBlockers.map((blocker) => `- handoff_preflight_blocker: ${blocker}`))
  lines.push(...summary.realEvidenceGaps.operatorHandoff.sourceExportBlockers.map((blocker) => `- handoff_source_export_blocker: ${blocker}`))
  lines.push(...summary.realEvidenceGaps.operatorHandoff.productionSourceExportBlockers.map((blocker) => `- handoff_production_source_export_blocker: ${blocker}`))
  lines.push(...summary.realEvidenceGaps.operatorHandoff.realProductionOutcomeEvidenceBlockers.map((blocker) => `- handoff_real_production_outcome_evidence_blocker: ${blocker}`))
  lines.push('')
  lines.push('## Candidate Refresh Authorization Package')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.productionReady ? 'yes' : 'no'}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.projectId || 'missing'}`)
  lines.push(`- environment: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.environment || 'unknown'}`)
  lines.push(`- preflightReady: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.preflightReady ? 'yes' : 'no'}`)
  lines.push(`- executionStatus: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.executionStatus || 'unknown'}`)
  lines.push(`- operatorTemplateRef: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.operatorTemplateRef || 'missing'}`)
  lines.push(`- packageOnly: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.packageOnly ? 'yes' : 'no'}`)
  lines.push(`- doesNotMutateDatabase: ${summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.doesNotMutateDatabase ? 'yes' : 'no'}`)
  lines.push(...summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.packageReadinessBlockers.map((blocker) => `- candidate_refresh_authorization_package_blocker: ${blocker}`))
  lines.push(...summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.executionBlockers.map((blocker) => `- candidate_refresh_authorization_execution_blocker: ${blocker}`))
  lines.push('')
  lines.push('## Candidate Refresh Execution Readiness Seal')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.productionReady ? 'yes' : 'no'}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.projectId || 'missing'}`)
  lines.push(`- businessType: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.businessType || 'missing'}`)
  lines.push(`- environment: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.environment || 'unknown'}`)
  lines.push(`- executionCommandReady: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.executionCommandReady ? 'yes' : 'no'}`)
  lines.push(`- unlockVariable: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.unlockVariable || 'missing'}`)
  lines.push(`- unlockPresent: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.unlockPresent ? 'yes' : 'no'}`)
  lines.push(`- executeReady: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.executeReady ? 'yes' : 'no'}`)
  lines.push(`- operatorMustRunManually: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.operatorMustRunManually ? 'yes' : 'no'}`)
  lines.push(`- doesNotConnectDatabase: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.doesNotConnectDatabase ? 'yes' : 'no'}`)
  lines.push(`- commandsExecuted: ${summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.commandsExecuted}`)
  lines.push(...summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.blockers.map((blocker) => `- candidate_refresh_execution_readiness_seal_blocker: ${blocker}`))
  lines.push('')
  lines.push('## Candidate Baseline Materialization Readiness Seal')
  lines.push('')
  lines.push(`- status: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.productionReady ? 'yes' : 'no'}`)
  lines.push(`- baselineId: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.baselineId || 'missing'}`)
  lines.push(`- projectId: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.projectId || 'missing'}`)
  lines.push(`- businessType: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.businessType || 'missing'}`)
  lines.push(`- environment: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.environment || 'unknown'}`)
  lines.push(`- materializationCommandReady: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.materializationCommandReady ? 'yes' : 'no'}`)
  lines.push(`- unlockVariable: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.unlockVariable || 'missing'}`)
  lines.push(`- unlockPresent: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.unlockPresent ? 'yes' : 'no'}`)
  lines.push(`- executeReady: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.executeReady ? 'yes' : 'no'}`)
  lines.push(`- operatorMustRunManually: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.operatorMustRunManually ? 'yes' : 'no'}`)
  lines.push(`- doesNotConnectDatabase: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.doesNotConnectDatabase ? 'yes' : 'no'}`)
  lines.push(`- commandsExecuted: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.commandsExecuted}`)
  lines.push(`- writesCandidateBaselines: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.writesCandidateBaselines ? 'yes' : 'no'}`)
  lines.push(`- writesTaskBaselineItems: ${summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.writesTaskBaselineItems ? 'yes' : 'no'}`)
  lines.push(...summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.blockers.map((blocker) => `- candidate_baseline_materialization_readiness_seal_blocker: ${blocker}`))
  lines.push('')
  lines.push('## Real Production Outcome Package')
  lines.push('')
  lines.push(`- realProductionOutcomePackageStatus: ${summary.realEvidenceGaps.realProductionOutcomePackage.status || 'unknown'}`)
  lines.push(`- productionReady: ${summary.realEvidenceGaps.realProductionOutcomePackage.productionReady ? 'yes' : 'no'}`)
  lines.push(`- targetEnvironment: ${summary.realEvidenceGaps.realProductionOutcomePackage.targetEnvironment || 'unknown'}`)
  lines.push(`- realProductionOutcomePath: ${summary.realEvidenceGaps.realProductionOutcomePackage.realProductionOutcomePath || 'missing'}`)
  lines.push(`- requiredRealProductionOutcomeFieldCount: ${summary.realEvidenceGaps.realProductionOutcomePackage.requiredFieldCount}`)
  lines.push(...summary.realEvidenceGaps.realProductionOutcomePackage.blockers.map((blocker) => `- real_production_outcome_package_blocker: ${blocker}`))
  lines.push(...summary.realEvidenceGaps.realProductionOutcomePackage.validationBlockers.map((blocker) => `- real_production_outcome_validation_blocker: ${blocker}`))
  lines.push('')
  lines.push('## Prioritized Action Groups')
  lines.push('')
  if (summary.prioritizedNextActionGroups.length === 0) {
    lines.push('- none')
  } else {
    for (const group of summary.prioritizedNextActionGroups) {
      lines.push(`- ${group.priority}. ${group.id} [${group.status}]: ${group.nextAction}`)
      lines.push(...arrayOfStrings(group.deferredBy).map((blocker) => `  - deferred_by: ${blocker}`))
      lines.push(...arrayOfStrings(group.blockedBy).map((blocker) => `  - blocked_by: ${blocker}`))
      const repairPlan = readObject(group.repairPlan)
      if (Object.keys(repairPlan).length > 0) {
        lines.push(`  - repairPlanStatus: ${repairPlan.status || 'unknown'}`)
        lines.push(`  - repairPlanNoAutoInstall: ${repairPlan.noAutoInstall ? 'yes' : 'no'}`)
        lines.push(...arrayOfStrings(repairPlan.requiredStepIds).map((stepId) => `  - repair_required_step: ${stepId}`))
        lines.push(...arrayOfStrings(repairPlan.blockedStepIds).map((stepId) => `  - repair_blocked_step: ${stepId}`))
        for (const step of Array.isArray(repairPlan.orderedSteps) ? repairPlan.orderedSteps : []) {
          lines.push(`  - repair_step: ${step.id || 'unknown'} [${step.status || 'unknown'}]`)
        }
      }
      const dbRepairPlan = readObject(group.dbRepairPlan)
      if (Object.keys(dbRepairPlan).length > 0) {
        lines.push(`  - dbRepairPlanStatus: ${dbRepairPlan.status || 'unknown'}`)
        lines.push(`  - dbRepairPlanFailureClass: ${dbRepairPlan.failureClass || 'unknown'}`)
        lines.push(`  - dbRepairPlanNoAutoCredentialRotation: ${dbRepairPlan.noAutoCredentialRotation ? 'yes' : 'no'}`)
        lines.push(...arrayOfStrings(dbRepairPlan.requiredStepIds).map((stepId) => `  - db_repair_required_step: ${stepId}`))
        lines.push(...arrayOfStrings(dbRepairPlan.blockedStepIds).map((stepId) => `  - db_repair_blocked_step: ${stepId}`))
        for (const step of Array.isArray(dbRepairPlan.orderedSteps) ? dbRepairPlan.orderedSteps : []) {
          lines.push(`  - db_repair_step: ${step.id || 'unknown'} [${step.status || 'unknown'}]`)
        }
      }
      const executionGatePlan = readObject(group.executionGatePlan)
      if (Object.keys(executionGatePlan).length > 0) {
        lines.push(`  - executionGatePlanStatus: ${executionGatePlan.status || 'unknown'}`)
        lines.push(`  - executionGatePlanNoAutoExecution: ${executionGatePlan.noAutoExecution ? 'yes' : 'no'}`)
        lines.push(...arrayOfStrings(executionGatePlan.requiredStepIds).map((stepId) => `  - execution_gate_required_step: ${stepId}`))
        lines.push(...arrayOfStrings(executionGatePlan.blockedStepIds).map((stepId) => `  - execution_gate_blocked_step: ${stepId}`))
        for (const step of Array.isArray(executionGatePlan.orderedSteps) ? executionGatePlan.orderedSteps : []) {
          lines.push(`  - execution_gate_step: ${step.id || 'unknown'} [${step.status || 'unknown'}]`)
        }
      }
      const materializationReadinessPlan = readObject(group.materializationReadinessPlan)
      if (Object.keys(materializationReadinessPlan).length > 0) {
        lines.push(`  - materializationReadinessPlanStatus: ${materializationReadinessPlan.status || 'unknown'}`)
        lines.push(`  - materializationReadinessCommandReady: ${materializationReadinessPlan.materializationCommandReady ? 'yes' : 'no'}`)
        lines.push(`  - materializationReadinessUnlockVariable: ${materializationReadinessPlan.unlockVariable || 'missing'}`)
        lines.push(`  - materializationReadinessUnlockPresent: ${materializationReadinessPlan.unlockPresent ? 'yes' : 'no'}`)
        lines.push(`  - materializationReadinessExecuteReady: ${materializationReadinessPlan.executeReady ? 'yes' : 'no'}`)
        lines.push(`  - materializationReadinessOperatorMustRunManually: ${materializationReadinessPlan.operatorMustRunManually ? 'yes' : 'no'}`)
        lines.push(`  - materializationReadinessDoesNotConnectDatabase: ${materializationReadinessPlan.doesNotConnectDatabase ? 'yes' : 'no'}`)
        lines.push(`  - materializationReadinessCommandsExecuted: ${readNumber(materializationReadinessPlan.commandsExecuted)}`)
        lines.push(...arrayOfStrings(materializationReadinessPlan.blockers).map((blocker) => `  - materialization_readiness_blocker: ${blocker}`))
        const materializationNextCommands = readObject(materializationReadinessPlan.nextCommands)
        for (const [key, command] of Object.entries(materializationNextCommands)) {
          if (String(command ?? '').trim()) {
            lines.push(`  - materialization_next_command: ${key} | ${command}`)
          }
        }
      }
      const durationAlignmentPlan = readObject(group.durationAlignmentPlan)
      if (Object.keys(durationAlignmentPlan).length > 0) {
        const completedTaskExport = readObject(durationAlignmentPlan.completedTaskExport)
        if (Object.keys(completedTaskExport).length > 0) {
          lines.push(`  - duration_alignment_completed_task_export_required_stable_codes: ${readNumber(completedTaskExport.requiredStableCodeCount)}`)
          lines.push(`  - duration_alignment_completed_task_export_exported_tasks: ${readNumber(completedTaskExport.exportedTaskCount)}`)
          lines.push(`  - duration_alignment_completed_task_export_invalid_tasks: ${readNumber(completedTaskExport.invalidTaskCount)}`)
          lines.push(`  - duration_alignment_completed_task_export_missing_stable_codes: ${readNumber(completedTaskExport.missingStableCodeCount)}`)
          lines.push(...arrayOfStrings(completedTaskExport.missingStableCodes).map((stableCode) => `  - duration_alignment_completed_task_export_missing_stable_code: ${stableCode}`))
          for (const example of Array.isArray(completedTaskExport.invalidTaskExamples) ? completedTaskExport.invalidTaskExamples : []) {
            const record = readObject(example)
            lines.push(`  - duration_alignment_completed_task_invalid_example: ${record.stableCode || 'unknown'} | ${record.recommendedAction || 'unknown'}`)
          }
        }
        const runtimeCandidateAlignment = readObject(durationAlignmentPlan.runtimeCandidateAlignment)
        if (Object.keys(runtimeCandidateAlignment).length > 0) {
          lines.push(`  - duration_alignment_runtime_candidate_rows: ${readNumber(runtimeCandidateAlignment.candidateRowCount)}`)
          lines.push(`  - duration_alignment_runtime_tasks: ${readNumber(runtimeCandidateAlignment.runtimeTaskCount)}`)
          lines.push(`  - duration_alignment_runtime_candidate_missing_runtime_tasks: ${readNumber(runtimeCandidateAlignment.missingRuntimeTaskCount)}`)
          lines.push(`  - duration_alignment_runtime_candidate_title_mismatches: ${readNumber(runtimeCandidateAlignment.titleMismatchCount)}`)
          lines.push(`  - duration_alignment_runtime_candidate_actual_date_missing_rows: ${readNumber(runtimeCandidateAlignment.rowsMissingActualDateRangeCount)}`)
          for (const example of Array.isArray(runtimeCandidateAlignment.driftExamples) ? runtimeCandidateAlignment.driftExamples : []) {
            const record = readObject(example)
            lines.push(`  - duration_alignment_runtime_candidate_drift_example: ${record.stableCode || 'unknown'} | ${record.alignmentStatus || 'unknown'} | ${record.recommendedAction || 'unknown'}`)
          }
        }
        const refreshPackage = readObject(durationAlignmentPlan.runtimeTaskAlignmentRefreshPackage)
        if (Object.keys(refreshPackage).length > 0) {
          lines.push(`  - duration_alignment_refresh_package_status: ${refreshPackage.status || 'unknown'}`)
          lines.push(`  - duration_alignment_refresh_package_actions: ${readNumber(refreshPackage.actionCount)}`)
          lines.push(`  - duration_alignment_refresh_package_stable_code_review_actions: ${readNumber(refreshPackage.stableCodeRefreshReviewActionCount)}`)
          lines.push(`  - duration_alignment_refresh_package_missing_runtime_task_actions: ${readNumber(refreshPackage.missingRuntimeTaskActionCount)}`)
          lines.push(`  - duration_alignment_refresh_package_actual_date_collection_actions: ${readNumber(refreshPackage.actualDateRangeCollectionActionCount)}`)
          lines.push(`  - duration_alignment_refresh_package_execute_allowed: ${refreshPackage.executeAllowed ? 'yes' : 'no'}`)
          for (const example of Array.isArray(refreshPackage.actionExamples) ? refreshPackage.actionExamples : []) {
            const record = readObject(example)
            lines.push(`  - duration_alignment_refresh_package_action_example: ${record.stableCode || 'unknown'} | ${record.actionKind || 'unknown'} | ${record.proposedStableCode || 'none'}`)
          }
        }
        const samplePreflight = readObject(durationAlignmentPlan.realDurationSampleMaterialPreflight)
        if (Object.keys(samplePreflight).length > 0) {
          lines.push(`  - duration_alignment_sample_preflight_status: ${samplePreflight.status || 'unknown'}`)
          lines.push(`  - duration_alignment_sample_preflight_checked_by: ${samplePreflight.checkedBy || 'missing'}`)
          lines.push(`  - duration_alignment_sample_preflight_required_stable_codes: ${readNumber(samplePreflight.requiredStableCodeCount)}`)
          lines.push(`  - duration_alignment_sample_preflight_ready_stable_codes: ${readNumber(samplePreflight.readyStableCodeCount)}`)
          lines.push(`  - duration_alignment_sample_preflight_missing_stable_codes: ${readNumber(samplePreflight.missingStableCodeCount)}`)
          lines.push(`  - duration_alignment_sample_preflight_writes_duration_samples: ${samplePreflight.writesDurationSamples ? 'yes' : 'no'}`)
          lines.push(`  - duration_alignment_sample_preflight_writes_runtime_publication: ${samplePreflight.writesRuntimePublication ? 'yes' : 'no'}`)
          lines.push(...arrayOfStrings(samplePreflight.blockers).map((blocker) => `  - duration_alignment_sample_preflight_blocker: ${blocker}`))
          for (const target of Array.isArray(samplePreflight.nextSampleCollectionTargets) ? samplePreflight.nextSampleCollectionTargets : []) {
            const record = readObject(target)
            lines.push(`  - duration_alignment_next_sample_target: ${readNumber(record.priority)} | ${record.businessType || 'unknown'} | ${record.stableCode || 'unknown'} | ${readNumber(record.missingSampleCount)} missing`)
          }
          for (const sample of Array.isArray(samplePreflight.readySampleExamples) ? samplePreflight.readySampleExamples : []) {
            const record = readObject(sample)
            lines.push(`  - duration_alignment_ready_sample: ${record.stableCode || 'unknown'} | ${readNumber(record.readySampleCount)} ready`)
          }
        }
      }
      const productionOutcomePlan = readObject(group.productionOutcomePlan)
      if (Object.keys(productionOutcomePlan).length > 0) {
        const outcomePackage = readObject(productionOutcomePlan.realProductionOutcomePackage)
        if (Object.keys(outcomePackage).length > 0) {
          lines.push(`  - production_outcome_package_status: ${outcomePackage.status || 'unknown'}`)
          lines.push(`  - production_outcome_target_environment: ${outcomePackage.targetEnvironment || 'unknown'}`)
          lines.push(`  - production_outcome_real_outcome_path: ${outcomePackage.realProductionOutcomePath || 'missing'}`)
          lines.push(`  - production_outcome_required_field_count: ${readNumber(outcomePackage.requiredFieldCount)}`)
          lines.push(...arrayOfStrings(outcomePackage.requiredFields).map((field) => `  - production_outcome_required_field: ${field}`))
          lines.push(...arrayOfStrings(outcomePackage.blockers).map((blocker) => `  - production_outcome_package_blocker: ${blocker}`))
          lines.push(...arrayOfStrings(outcomePackage.validationBlockers).map((blocker) => `  - production_outcome_validation_blocker: ${blocker}`))
        }
        const outcomeOperatorHandoff = readObject(productionOutcomePlan.operatorHandoff)
        if (Object.keys(outcomeOperatorHandoff).length > 0) {
          lines.push(`  - production_outcome_source_export_mode: ${outcomeOperatorHandoff.sourceExportMode || 'unknown'}`)
          lines.push(`  - production_outcome_may_run_supporting_source_export: ${outcomeOperatorHandoff.mayRunSupportingSourceExport ? 'yes' : 'no'}`)
          lines.push(`  - production_outcome_may_run_production_source_export: ${outcomeOperatorHandoff.mayRunProductionSourceExport ? 'yes' : 'no'}`)
          lines.push(`  - production_outcome_may_run_source_export: ${outcomeOperatorHandoff.mayRunSourceExport ? 'yes' : 'no'}`)
          lines.push(`  - production_outcome_may_accept_real_outcome: ${outcomeOperatorHandoff.mayAcceptRealProductionOutcomeEvidence ? 'yes' : 'no'}`)
          lines.push(`  - production_outcome_may_run_production_evidence_pipeline: ${outcomeOperatorHandoff.mayRunProductionEvidencePipeline ? 'yes' : 'no'}`)
          lines.push(...arrayOfStrings(outcomeOperatorHandoff.productionSourceExportBlockers).map((blocker) => `  - production_outcome_source_export_blocker: ${blocker}`))
          lines.push(...arrayOfStrings(outcomeOperatorHandoff.realProductionOutcomeEvidenceBlockers).map((blocker) => `  - production_outcome_real_outcome_evidence_blocker: ${blocker}`))
          lines.push(...arrayOfStrings(outcomeOperatorHandoff.blockedActionIds).map((actionId) => `  - production_outcome_blocked_action: ${actionId}`))
          lines.push(...arrayOfStrings(outcomeOperatorHandoff.deferredActionIds).map((actionId) => `  - production_outcome_deferred_action: ${actionId}`))
          lines.push(...arrayOfStrings(outcomeOperatorHandoff.runnableActionIds).map((actionId) => `  - production_outcome_runnable_action: ${actionId}`))
        }
        lines.push(...arrayOfStrings(productionOutcomePlan.productionReadinessBlockers).map((blocker) => `  - production_outcome_readiness_blocker: ${blocker}`))
      }
      const operatorRequirements = Array.isArray(group.operatorRequirements) ? group.operatorRequirements : []
      for (const requirement of operatorRequirements) {
        const actionId = requirement.actionId || 'unknown'
        const nextRequirements = readObject(requirement.nextRequirements)
        lines.push(`  - operator_requirement_action: ${actionId} | ${requirement.gate || 'unknown'} | ${arrayOfStrings(requirement.blockers).join(', ') || 'none'}`)
        for (const item of Array.isArray(nextRequirements.envUnlocks) ? nextRequirements.envUnlocks : []) {
          const record = readObject(item)
          const variable = String(record.variable ?? '').trim() || 'unknown'
          const value = String(record.value ?? '').trim()
          lines.push(`  - operator_requirement_env_unlock: ${actionId} | ${variable}${value ? `=${value}` : ''} | ${arrayOfStrings(record.blockerCodes).join(', ') || 'none'}`)
        }
        for (const item of Array.isArray(nextRequirements.requiredFlags) ? nextRequirements.requiredFlags : []) {
          const record = readObject(item)
          const flag = String(record.flag ?? '').trim() || 'unknown'
          const value = String(record.value ?? '').trim()
          lines.push(`  - operator_requirement_flag: ${actionId} | ${flag}${value ? `=${value}` : ''} | ${arrayOfStrings(record.blockerCodes).join(', ') || 'none'}`)
        }
        for (const item of Array.isArray(nextRequirements.operatorFields) ? nextRequirements.operatorFields : []) {
          const record = readObject(item)
          lines.push(`  - operator_requirement_operator_field: ${actionId} | ${String(record.field ?? '').trim() || 'unknown'} | ${arrayOfStrings(record.blockerCodes).join(', ') || 'none'}`)
        }
        for (const item of Array.isArray(nextRequirements.evidenceInputs) ? nextRequirements.evidenceInputs : []) {
          const record = readObject(item)
          lines.push(`  - operator_requirement_evidence_input: ${actionId} | ${String(record.artifact ?? '').trim() || 'unknown'} => ${String(record.requiredStatus ?? '').trim() || 'unknown'} | ${arrayOfStrings(record.blockerCodes).join(', ') || 'none'}`)
        }
        for (const item of Array.isArray(nextRequirements.requiredEnvironmentTargets) ? nextRequirements.requiredEnvironmentTargets : []) {
          const record = readObject(item)
          lines.push(`  - operator_requirement_environment_target: ${actionId} | ${String(record.target ?? '').trim() || 'unknown'} | ${arrayOfStrings(record.blockerCodes).join(', ') || 'none'}`)
        }
        for (const command of arrayOfStrings(nextRequirements.verificationCommands)) {
          lines.push(`  - operator_requirement_verification_command: ${actionId} | ${command}`)
        }
      }
      lines.push(...arrayOfStrings(group.commands).map((command) => `  - command: ${command}`))
      if (group.mutationBoundary) {
        lines.push(`  - mutationBoundary: ${group.mutationBoundary}`)
      }
    }
  }
  lines.push('')
  lines.push('## Next Actions')
  lines.push('')
  lines.push(...summary.nextActions.map((action) => `- ${action}`))
  lines.push('')
  lines.push('Mutation boundary: reads local reports and writes this summary only; it does not write tasks, task_dependencies, runtime publication, production seed, rollback, or database state.')
  lines.push('')
  return `${lines.join('\n')}`
}

const args = parseArgs(process.argv.slice(2))
const [readiness, evidenceSources, reviewEvidence, durationEvidence, runtimeSeedEvidencePipeline, runtimeSeedImportReadinessSeal, durationSampleCollectionPackage, realDurationSampleMaterialTemplate, realDurationSampleCollectionKit, realDurationSampleCollectionKitPreflight, realDurationSampleMaterialBuildReport, realDurationSampleMaterialPreflight, realDurationSampleSourceExport, realDurationSampleSourceExportReport, durationAssetUtilization, completedTaskExportReport, runtimeCandidateAlignmentPreflight, runtimeTaskAlignmentRefreshPackage, operatorHandoff, operatorHandoffPreflight, candidateRefreshAuthorizationPackage, candidateRefreshExecutionReadinessSeal, candidateBaselineMaterializationReadinessSeal, realProductionOutcomePackage] = await Promise.all([
  readJson(args.readiness),
  readJson(args.evidenceSources),
  readJsonIfPresent(args.reviewEvidence),
  readJsonIfPresent(args.durationCalibrationEvidence),
  readJsonIfPresent(args.runtimeSeedEvidencePipeline),
  readJsonIfPresent(args.runtimeSeedImportReadinessSeal),
  readJsonIfPresent(args.durationSampleCollectionPackage),
  readJsonIfPresent(args.realDurationSampleMaterialTemplate),
  readJsonIfPresent(args.realDurationSampleCollectionKit),
  readJsonIfPresent(args.realDurationSampleCollectionKitPreflight),
  readJsonIfPresent(args.realDurationSampleMaterialBuildReport),
  readJsonIfPresent(args.realDurationSampleMaterialPreflight),
  readJsonIfPresent(args.realDurationSampleSourceExport),
  readJsonIfPresent(args.realDurationSampleSourceExportReport),
  readJsonIfPresent(args.durationAssetUtilization),
  readJsonIfPresent(args.completedTaskExportReport),
  readJsonIfPresent(args.runtimeCandidateAlignmentPreflight),
  readJsonIfPresent(args.runtimeTaskAlignmentRefreshPackage),
  readJsonIfPresent(args.operatorHandoff),
  readJsonIfPresent(args.operatorHandoffPreflight),
  readJsonIfPresent(args.candidateRefreshAuthorizationPackage),
  readJsonIfPresent(args.candidateRefreshExecutionReadinessSeal),
  readJsonIfPresent(args.candidateBaselineMaterializationReadinessSeal),
  readJsonIfPresent(args.realProductionOutcomePackage),
])

const summary = buildSummary({
  readiness,
  evidenceSources,
  reviewEvidence,
  durationEvidence,
  runtimeSeedEvidencePipeline,
  runtimeSeedImportReadinessSeal,
  durationSampleCollectionPackage,
  realDurationSampleMaterialTemplate,
  realDurationSampleCollectionKit,
  realDurationSampleCollectionKitPreflight,
  realDurationSampleMaterialBuildReport,
  realDurationSampleMaterialPreflight,
  realDurationSampleSourceExport,
  realDurationSampleSourceExportReport,
  durationAssetUtilization,
  completedTaskExportReport,
  runtimeCandidateAlignmentPreflight,
  runtimeTaskAlignmentRefreshPackage,
  operatorHandoff,
  operatorHandoffPreflight,
  candidateRefreshAuthorizationPackage,
  candidateRefreshExecutionReadinessSeal,
  candidateBaselineMaterializationReadinessSeal,
  realProductionOutcomePackage,
  paths: args,
})

await fs.mkdir(path.dirname(args.output), { recursive: true })
await fs.mkdir(path.dirname(args.jsonOutput), { recursive: true })
await fs.writeFile(args.jsonOutput, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
await fs.writeFile(args.output, buildMarkdown(summary), 'utf8')

const consoleSummary = {
  status: summary.status,
  productionReady: summary.productionReady,
  output: repoRelative(args.output),
  jsonOutput: repoRelative(args.jsonOutput),
  gateSummary: summary.gateSummary,
  completionRate: summary.gateSummary.completionRate,
  closedLocalGateCount: summary.closedLocalGateIds.length,
  blockedRealGateCount: summary.blockedRealGates.length,
  blockedGateActionCoverageSummary: summary.blockedGateActionCoverageSummary,
  operatorUnblockRequirementSummary: summary.operatorUnblockRequirementSummary,
  operatorCommandPlanSummary: summary.operatorCommandPlanSummary,
  operatorCommandExecutionPlanSummary: summary.operatorCommandExecutionPlanSummary,
  operatorCommandExecutionQueueSummary: summary.operatorCommandExecutionQueueSummary,
  missingEvidenceCount: summary.realEvidenceGaps.runtimeMaterialMissingEvidenceTypes.length,
  prioritizedNextActionGroupCount: summary.prioritizedNextActionGroups.length,
}

if (args.json) {
  console.log(JSON.stringify(consoleSummary, null, 2))
} else {
  console.log(`Status: ${consoleSummary.status}`)
  console.log(`Production ready: ${consoleSummary.productionReady ? 'yes' : 'no'}`)
  console.log(`Output: ${consoleSummary.output}`)
  console.log(`JSON: ${consoleSummary.jsonOutput}`)
}
