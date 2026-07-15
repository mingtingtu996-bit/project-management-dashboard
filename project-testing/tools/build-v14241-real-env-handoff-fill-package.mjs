#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateHandoffReadiness } from './build-v14241-real-env-handoff-pack.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.candidate.json')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultOutputJson = join(defaultReleaseDir, 'v14241-real-env-handoff-fill-package.json')
const defaultOutputMd = join(defaultReleaseDir, 'v14241-real-env-handoff-fill-package.md')
const defaultTemplateOutput = join(defaultReleaseDir, 'v14241-real-env-handoff.operator-fill-template.json')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))]
}

function getByPath(value, dottedPath) {
  let current = value
  for (const part of dottedPath.split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined
    current = current[part]
  }
  return current
}

function collectEnvironmentItems(readiness, handoff) {
  const tiers = ['UAT', 'staging', 'solo-live', 'live']
  return tiers.map((tierName) => {
    const missingFields = unique(toArray(readiness.scenarios).flatMap((scenario) => {
      const tier = toArray(scenario.tiers).find((item) => item.name === tierName)
      return tier?.missingEnvironmentFields ?? []
    }))
    return {
      tier: tierName,
      missingFields,
      currentTarget: handoff.environmentTargets?.[tierName] ?? {},
      fillPathPrefix: `environmentTargets.${tierName}`,
    }
  })
}

function collectScenarioItems(readiness, handoff, matrix) {
  const matrixById = new Map(toArray(matrix.scenarios).map((scenario) => [scenario.id, scenario]))
  return toArray(readiness.scenarios).map((scenario) => {
    const handoffScenario = handoff.scenarios?.[scenario.id] ?? {}
    return {
      id: scenario.id,
      title: scenario.title,
      readyToRun: scenario.readyToRun === true,
      evidenceOwners: handoffScenario.evidenceOwners ?? {},
      requiredArtifacts: matrixById.get(scenario.id)?.evidenceContract?.requiredArtifacts ?? [],
      tiers: toArray(scenario.tiers).map((tier) => ({
        tier: tier.name,
        readyToRun: tier.readyToRun === true,
        fillPathPrefix: `scenarios.${scenario.id}.tiers.${tier.name}`,
        missingScenarioFields: tier.missingScenarioFields ?? [],
        missingOwnerFields: tier.missingOwnerFields ?? [],
        currentTier: handoffScenario.tiers?.[tier.name] ?? {},
      })),
    }
  })
}

function buildOperatorTemplate(handoff, now) {
  const template = clone(handoff)
  template.status = 'operator_fill_required'
  template.generatedAt = now.toISOString()
  template.operatorFillNotes = [
    'Fill only refs, owners, ids, artifact paths, URLs, and approval references required by readiness.',
    'Do not write raw JWTs, passwords, database URLs, Supabase service-role keys, or migration URLs into this file.',
    'For secrets use env://, secret-ref://, vault://, 1password://, or another external secret reference.',
    'After filling, run check-v14241-real-env-handoff-file.mjs against this file before any real execution.',
  ]
  return template
}

function summarizeMissing(readiness) {
  const summary = {
    environment: {},
    scenario: {},
    owners: {},
  }
  for (const scenario of toArray(readiness.scenarios)) {
    for (const tier of toArray(scenario.tiers)) {
      for (const field of tier.missingEnvironmentFields ?? []) {
        summary.environment[field] = (summary.environment[field] ?? 0) + 1
      }
      for (const field of tier.missingScenarioFields ?? []) {
        summary.scenario[field] = (summary.scenario[field] ?? 0) + 1
      }
      for (const field of tier.missingOwnerFields ?? []) {
        summary.owners[field] = (summary.owners[field] ?? 0) + 1
      }
    }
  }
  return summary
}

function assertNoSecretLikeText(report) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_v14241_handoff_fill_package_with_secret_like_text')
  }
}

export async function buildHandoffFillPackage({
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  outputJson = defaultOutputJson,
  outputMd = defaultOutputMd,
  templateOutput = defaultTemplateOutput,
  releaseDir = defaultReleaseDir,
  now = new Date(),
} = {}) {
  const [handoff, matrix] = await Promise.all([readJson(resolve(handoffFile)), readJson(resolve(matrixFile))])
  const readiness = evaluateHandoffReadiness({ handoff, matrix, now })
  const template = buildOperatorTemplate(handoff, now)
  const report = {
    schemaVersion: 'workbuddy/v14241-real-env-handoff-fill-package/v1',
    generatedAt: now.toISOString(),
    status: readiness.readyToExecuteMatrix ? 'handoff_ready_no_fill_required' : 'handoff_inputs_required',
    releaseDir: rel(resolve(releaseDir)),
    sourceHandoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    operatorTemplateFile: rel(resolve(templateOutput)),
    readiness: {
      status: readiness.status,
      readyToExecuteMatrix: readiness.readyToExecuteMatrix,
      readyScenarioCount: readiness.readyScenarioCount,
      scenarioCount: readiness.scenarioCount,
      readyTierCount: readiness.readyTierCount,
      tierCount: readiness.tierCount,
      secretLeakCount: readiness.secretLeakCount,
    },
    secretPolicy: {
      rawSecretsForbidden: true,
      allowedReferenceExamples: ['env://path#KEY', 'secret-ref://operator/system/key', 'vault://path/to/secret', '1password://vault/item/field'],
      forbiddenExamples: ['raw JWT', 'raw database URL', 'password assignment', 'Supabase service-role key'],
    },
    missingSummary: summarizeMissing(readiness),
    environmentTargets: collectEnvironmentItems(readiness, handoff),
    scenarios: collectScenarioItems(readiness, handoff, matrix),
    nextCommands: {
      checkFilledTemplate: `node project-testing/tools/check-v14241-real-env-handoff-file.mjs --handoff-file ${rel(resolve(templateOutput))} --matrix-file ${rel(resolve(matrixFile))}`,
      attemptStagingMatrix: `node project-testing/tools/run-v14241-real-env-scenario-attempts.mjs --tier staging --handoff-file ${rel(resolve(templateOutput))} --matrix-file ${rel(resolve(matrixFile))} --include-staging --confirm-real-handoff --allow-write`,
      refreshMatrixReport: `node project-testing/tools/run-v14241-real-env-uat-matrix.mjs --release-dir ${rel(resolve(releaseDir))}`,
    },
    executionBoundary: {
      packageOnly: true,
      commandsExecuted: 0,
      doesNotAuthorizeExecution: true,
      doesNotMutateEnvironment: true,
    },
  }
  assertNoSecretLikeText(report)
  assertNoSecretLikeText(template)
  await mkdir(dirname(resolve(outputJson)), { recursive: true })
  await mkdir(dirname(resolve(outputMd)), { recursive: true })
  await mkdir(dirname(resolve(templateOutput)), { recursive: true })
  await writeFile(resolve(templateOutput), `${JSON.stringify(template, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputMd), renderFillPackageMarkdown(report), 'utf8')
  return report
}

export function renderFillPackageMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Real Environment Handoff Fill Package',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Release dir: ${report.releaseDir}`,
    `- Source handoff: ${report.sourceHandoffFile}`,
    `- Operator template: ${report.operatorTemplateFile}`,
    '',
    '## Readiness',
    '',
    `- Ready to execute matrix: ${report.readiness.readyToExecuteMatrix}`,
    `- Ready tiers: ${report.readiness.readyTierCount}/${report.readiness.tierCount}`,
    `- Ready scenarios: ${report.readiness.readyScenarioCount}/${report.readiness.scenarioCount}`,
    `- Secret leaks: ${report.readiness.secretLeakCount}`,
    '',
    '## Environment Targets To Fill',
    '',
    '| Tier | Missing fields |',
    '| --- | --- |',
  ]
  for (const item of report.environmentTargets) {
    lines.push(`| ${item.tier} | ${item.missingFields.join(', ') || 'none'} |`)
  }
  lines.push('', '## Scenario Tier Fill Items', '')
  lines.push('| ID | Tier | Scenario fields | Owner fields |')
  lines.push('| --- | --- | --- | --- |')
  for (const scenario of report.scenarios) {
    for (const tier of scenario.tiers) {
      lines.push(`| ${scenario.id} | ${tier.tier} | ${tier.missingScenarioFields.join(', ') || 'none'} | ${tier.missingOwnerFields.join(', ') || 'none'} |`)
    }
  }
  lines.push('', '## Secret Policy', '')
  lines.push('- Raw JWTs, database URLs, passwords, Supabase service-role keys, and migration URLs must not be written into the handoff file.')
  lines.push(`- Use refs such as: ${report.secretPolicy.allowedReferenceExamples.join(', ')}`)
  lines.push('', '## Next Commands', '')
  lines.push(`- ${report.nextCommands.checkFilledTemplate}`)
  lines.push(`- ${report.nextCommands.attemptStagingMatrix}`)
  lines.push(`- ${report.nextCommands.refreshMatrixReport}`)
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const handoffFile = resolve(argValue('--handoff-file', join(releaseDir, 'v14241-real-env-handoff.candidate.json')))
  const matrixFile = resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json')))
  const outputJson = resolve(argValue('--output', join(releaseDir, 'v14241-real-env-handoff-fill-package.json')))
  const outputMd = resolve(argValue('--md-output', join(releaseDir, 'v14241-real-env-handoff-fill-package.md')))
  const templateOutput = resolve(argValue('--template-output', join(releaseDir, 'v14241-real-env-handoff.operator-fill-template.json')))
  const report = await buildHandoffFillPackage({ handoffFile, matrixFile, outputJson, outputMd, templateOutput, releaseDir })
  console.log(JSON.stringify({
    status: report.status,
    readyToExecuteMatrix: report.readiness.readyToExecuteMatrix,
    readyTierCount: report.readiness.readyTierCount,
    tierCount: report.readiness.tierCount,
    operatorTemplateFile: report.operatorTemplateFile,
    outputs: [rel(outputJson), rel(outputMd), rel(templateOutput)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
