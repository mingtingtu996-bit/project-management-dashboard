#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultOutputRoot = join(defaultReleaseDir, 'v14241-real-env-evidence-templates')

const VALID_TIERS = ['UAT', 'staging', 'solo-live', 'live']

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

function normalizeSelectedTiers(value, allTiers = false) {
  if (allTiers) return VALID_TIERS
  const raw = String(value || 'staging').split(',').map((item) => item.trim()).filter(Boolean)
  return [...new Set(raw.map((tier) => {
    if (tier.toLowerCase() === 'uat') return 'UAT'
    if (tier.toLowerCase() === 'staging') return 'staging'
    if (tier.toLowerCase() === 'solo-live') return 'solo-live'
    if (tier.toLowerCase() === 'live') return 'live'
    throw new Error(`Unsupported tier: ${tier}. Expected UAT, staging, solo-live, live, or --all-tiers.`)
  }))]
}

function safeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '-')
}

function setByPath(target, dottedPath, value) {
  const parts = dottedPath.split('.')
  let current = target
  for (const part of parts.slice(0, -1)) {
    current[part] ??= {}
    current = current[part]
  }
  current[parts.at(-1)] = value
}

function metadataValue(key, tier, scenario) {
  switch (key) {
    case 'environment':
      return tier
    case 'baseUrl':
      return '<resolved base URL used for this run>'
    case 'actorRefs':
      return {
        primaryTesterRef: '<actor ref used for this scenario>',
      }
    case 'companyId':
      return '<target company id>'
    case 'projectId':
      return '<target project id>'
    case 'startedAt':
    case 'finishedAt':
      return '<ISO-8601 timestamp>'
    case 'commandOrManualScript':
      return '<exact command, Playwright script, or UAT script id>'
    case 'screenshotsOrTrace':
      return ['<relative screenshot, trace, or recording path>']
    case 'apiFailureSummary':
    case 'consoleErrorSummary':
      return []
    case 'cleanupOrRollbackReadback':
      return {
        status: '<pass after cleanup/rollback/readback>',
        artifactRef: '<cleanup or rollback evidence artifact>',
      }
    default:
      return `<${key}>`
  }
}

function buildJsonTemplate({ scenario, tier, artifact }) {
  const doc = {
    schemaVersion: `workbuddy/v14241-${scenario.id.toLowerCase()}-${tier.toLowerCase()}-evidence-template/v1`,
    templateOnly: true,
    status: 'template_only_not_evidence',
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    tier,
    artifact,
    instructions: [
      'Replace placeholders with real UAT/staging/solo-live/live evidence after the scenario is executed.',
      'Do not put raw JWTs, passwords, service-role keys, database URLs, or migration URLs in this file.',
      'Set status to pass only after the evidence contract is satisfied and cleanup/readback is archived.',
    ],
    productionBoundary: {
      notEvidence: true,
      commandsExecuted: 0,
      doesNotMutateEnvironment: true,
      supportOnlyDoesNotCloseScenarioTier: true,
    },
  }
  for (const key of scenario.evidenceContract?.requiredMetadata ?? []) {
    setByPath(doc, key, metadataValue(key, tier, scenario))
  }
  doc.expected = scenario.expected ?? []
  doc.failIf = scenario.failIf ?? []
  doc.rejectIf = scenario.evidenceContract?.rejectIf ?? []
  return doc
}

function templatePathForArtifact({ outputRoot, tier, scenario, artifact }) {
  const scenarioDir = join(outputRoot, tier.toLowerCase(), scenario.id)
  if (artifact.includes('*')) {
    return join(scenarioDir, `${safeSegment(artifact)}.template.txt`)
  }
  const extension = extname(artifact).toLowerCase()
  if (extension === '.json') return join(scenarioDir, artifact)
  return join(scenarioDir, `${safeSegment(artifact)}.template.txt`)
}

function renderNonJsonTemplate({ scenario, tier, artifact }) {
  return [
    `scenarioId: ${scenario.id}`,
    `scenarioTitle: ${scenario.title}`,
    `tier: ${tier}`,
    `artifact: ${artifact}`,
    'templateOnly: true',
    'status: template_only_not_evidence',
    '',
    'Instructions:',
    '- Capture or attach the real artifact matching the artifact path/pattern.',
    '- Keep the final evidence under the real evidence root, not this templates directory.',
    '- Do not include raw secrets in filenames or content.',
    '',
    'Required metadata is carried by the scenario JSON evidence files.',
  ].join('\n') + '\n'
}

function assertNoSecretLikeText(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_v14241_evidence_template_with_secret_like_text')
  }
}

export async function buildEvidenceTemplates({
  matrixFile = defaultMatrixFile,
  outputRoot = defaultOutputRoot,
  selectedTiers = ['staging'],
  now = new Date(),
} = {}) {
  const matrix = await readJson(resolve(matrixFile))
  const files = []
  for (const tier of selectedTiers) {
    for (const scenario of matrix.scenarios ?? []) {
      for (const artifact of scenario.evidenceContract?.requiredArtifacts ?? []) {
        const output = templatePathForArtifact({ outputRoot: resolve(outputRoot), tier, scenario, artifact })
        const extension = extname(artifact).toLowerCase()
        const content = !artifact.includes('*') && extension === '.json'
          ? `${JSON.stringify(buildJsonTemplate({ scenario, tier, artifact }), null, 2)}\n`
          : renderNonJsonTemplate({ scenario, tier, artifact })
        assertNoSecretLikeText(content)
        await mkdir(dirname(output), { recursive: true })
        await writeFile(output, content, 'utf8')
        files.push({
          scenarioId: scenario.id,
          tier,
          artifact,
          templatePath: rel(output),
          kind: !artifact.includes('*') && extension === '.json' ? 'json_evidence_template' : 'non_json_artifact_instruction',
        })
      }
    }
  }
  const report = {
    schemaVersion: 'workbuddy/v14241-real-env-evidence-template-package/v1',
    generatedAt: now.toISOString(),
    status: 'templates_written_not_evidence',
    matrixFile: rel(resolve(matrixFile)),
    outputRoot: rel(resolve(outputRoot)),
    selectedTiers,
    scenarioCount: matrix.scenarios?.length ?? 0,
    templateCount: files.length,
    files,
    executionBoundary: {
      templateOnly: true,
      commandsExecuted: 0,
      doesNotMutateEnvironment: true,
      doesNotAuthorizeExecution: true,
      doesNotCloseScenarioTier: true,
    },
  }
  assertNoSecretLikeText(report)
  const reportJson = join(resolve(outputRoot), 'evidence-template-package.json')
  const reportMd = join(resolve(outputRoot), 'evidence-template-package.md')
  await mkdir(resolve(outputRoot), { recursive: true })
  await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(reportMd, renderMarkdown(report), 'utf8')
  return { report, reportJson, reportMd }
}

export function renderMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Real Environment Evidence Templates',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Selected tiers: ${report.selectedTiers.join(', ')}`,
    `- Templates: ${report.templateCount}`,
    '',
    '## Boundary',
    '',
    '- These files are templates only; they are not UAT/staging/solo-live/live evidence.',
    '- Keep executed evidence under the real evidence root and keep templates separate.',
    '- JSON templates intentionally use `status=template_only_not_evidence`.',
    '',
    '## Files',
    '',
    '| Scenario | Tier | Artifact | Template | Kind |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const file of report.files) {
    lines.push(`| ${file.scenarioId} | ${file.tier} | ${file.artifact} | ${file.templatePath} | ${file.kind} |`)
  }
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const matrixFile = resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json')))
  const selectedTiers = normalizeSelectedTiers(argValue('--tier', 'staging'), hasFlag('--all-tiers'))
  const outputRoot = resolve(argValue('--output-root', join(releaseDir, 'v14241-real-env-evidence-templates')))
  const { report, reportJson, reportMd } = await buildEvidenceTemplates({ matrixFile, outputRoot, selectedTiers })
  console.log(JSON.stringify({
    status: report.status,
    selectedTiers: report.selectedTiers,
    scenarioCount: report.scenarioCount,
    templateCount: report.templateCount,
    outputs: [rel(reportJson), rel(reportMd)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
