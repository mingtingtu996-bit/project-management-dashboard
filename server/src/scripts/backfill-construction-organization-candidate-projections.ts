import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { closeDatabasePool } from '../database.js'
import {
  backfillConstructionOrganizationCandidateProjections,
} from '../services/constructionOrganizationCandidateProjectionBackfillService.js'

type CliOptions = {
  companyId: string | null
  projectId: string | null
  limit: number | null
  outputFile: string | null
  apply: boolean
  forceReproject: boolean
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizePositiveInteger(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  const integer = Math.floor(parsed)
  return integer > 0 ? integer : null
}

function readArgValue(args: string[], key: string) {
  const prefix = `${key}=`
  const inline = args.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = args.indexOf(key)
  if (index >= 0) return args[index + 1] ?? null
  return null
}

function parseCliArgs(args: string[]): CliOptions {
  return {
    companyId: normalizeText(readArgValue(args, '--company-id')),
    projectId: normalizeText(readArgValue(args, '--project-id')),
    limit: normalizePositiveInteger(readArgValue(args, '--limit')),
    outputFile: normalizeText(readArgValue(args, '--output-file')),
    apply: args.includes('--apply'),
    forceReproject: args.includes('--force-reproject'),
  }
}

function writeJsonIfRequested(outputFile: string | null, data: unknown) {
  if (!outputFile) return
  const absolutePath = resolve(outputFile)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export async function runConstructionOrganizationCandidateProjectionBackfillCli(
  args = process.argv.slice(2),
) {
  const options = parseCliArgs(args)
  if (!options.companyId) {
    throw new Error('company_id_required_use_--company-id')
  }
  const result = await backfillConstructionOrganizationCandidateProjections({
    companyId: options.companyId,
    projectId: options.projectId,
    limit: options.limit,
    dryRun: !options.apply,
    forceReproject: options.forceReproject,
  })
  const report = {
    reportCode: 'construction_organization_candidate_projection_backfill',
    generatedAt: new Date().toISOString(),
    outputFile: options.outputFile,
    apply: options.apply,
    forceReproject: options.forceReproject,
    result,
    boundaryPolicy: [
      'default_mode_is_dry_run',
      'apply_mode_writes_candidate_only_algorithm_asset_events',
      'projection_backfill_does_not_claim_runtime_closeout',
      'runtime_publication_site_adoption_saved_outcome_consumer_observation_impact_monitoring_rollback_and_e1_e3_e5_runtime_evidence_still_required',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
  writeJsonIfRequested(options.outputFile, report)
  return report
}

if (process.argv[1]?.includes('backfill-construction-organization-candidate-projections')) {
  runConstructionOrganizationCandidateProjectionBackfillCli()
    .then((report) => {
      process.stdout.write(`${JSON.stringify({
        reportCode: report.reportCode,
        mode: report.result.mode,
        scannedProjectCount: report.result.scannedProjectCount,
        upgradableProjectCount: report.result.upgradableProjectCount,
        upgradedProjectCount: report.result.upgradedProjectCount,
        upgradedCandidateEventCount: report.result.upgradedCandidateEventCount,
        forceReproject: report.forceReproject,
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
