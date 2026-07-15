import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { closeDatabasePool } from '../database.js'
import {
  backfillConstructionOrganizationPrecisionReplayCandidates,
} from '../services/constructionOrganizationPrecisionReplayCandidateBackfillService.js'
import {
  CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES,
  type ConstructionOrganizationPrecisionReplayBusinessType,
} from '../services/constructionOrganizationPrecisionReplayMatrixService.js'

type CliOptions = {
  companyId: string | null
  businessTypes: ConstructionOrganizationPrecisionReplayBusinessType[] | null
  outputFile: string | null
  apply: boolean
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function readArgValue(args: string[], key: string) {
  const prefix = `${key}=`
  const inline = args.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = args.indexOf(key)
  if (index >= 0) return args[index + 1] ?? null
  return null
}

function parseBusinessTypes(value: unknown): ConstructionOrganizationPrecisionReplayBusinessType[] | null {
  const text = normalizeText(value)
  if (!text) return null
  const supported = new Set<string>(CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES)
  const parsed = text.split(',').map((item) => item.trim()).filter(Boolean)
  return parsed.filter((item): item is ConstructionOrganizationPrecisionReplayBusinessType =>
    supported.has(item),
  )
}

function parseCliArgs(args: string[]): CliOptions {
  return {
    companyId: normalizeText(readArgValue(args, '--company-id')),
    businessTypes: parseBusinessTypes(readArgValue(args, '--business-types')),
    outputFile: normalizeText(readArgValue(args, '--output-file')),
    apply: args.includes('--apply'),
  }
}

function writeJsonIfRequested(outputFile: string | null, data: unknown) {
  if (!outputFile) return
  const absolutePath = resolve(outputFile)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export async function runConstructionOrganizationPrecisionReplayCandidateBackfillCli(
  args = process.argv.slice(2),
) {
  const options = parseCliArgs(args)
  if (!options.companyId) {
    throw new Error('company_id_required_use_--company-id')
  }
  const result = await backfillConstructionOrganizationPrecisionReplayCandidates({
    companyId: options.companyId,
    businessTypes: options.businessTypes,
    dryRun: !options.apply,
  })
  const report = {
    reportCode: 'construction_organization_precision_replay_candidate_backfill',
    generatedAt: new Date().toISOString(),
    outputFile: options.outputFile,
    apply: options.apply,
    result,
    boundaryPolicy: [
      'default_mode_is_dry_run',
      'apply_mode_writes_candidate_only_algorithm_asset_events',
      'precision_replay_candidates_are_company_scoped_reference_anchors_not_project_runtime_outcomes',
      'candidate_anchor_presence_does_not_claim_runtime_closeout',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
  writeJsonIfRequested(options.outputFile, report)
  return report
}

if (process.argv[1]?.includes('backfill-construction-organization-precision-replay-candidates')) {
  runConstructionOrganizationPrecisionReplayCandidateBackfillCli()
    .then((report) => {
      process.stdout.write(`${JSON.stringify({
        reportCode: report.reportCode,
        mode: report.result.mode,
        supportedBusinessTypeCount: report.result.supportedBusinessTypeCount,
        scannedBusinessTypeCount: report.result.scannedBusinessTypeCount,
        backfillableBusinessTypeCount: report.result.backfillableBusinessTypeCount,
        backfilledBusinessTypeCount: report.result.backfilledBusinessTypeCount,
        candidateEventCount: report.result.candidateEventCount,
        outputFile: report.outputFile,
      }, null, 2)}\n`)
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
      process.exitCode = 1
    })
    .finally(async () => {
      await closeDatabasePool()
    })
}
