#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultDraftPackage = join(defaultReleaseDir, 'v14241-real-env-staging-ref-draft-package.json')
const defaultRefsEnvFile = join(defaultReleaseDir, 'v14241-real-env-staging-operator.refs.env.template')
const defaultOutputJson = join(defaultReleaseDir, 'v14241-real-env-staging-operator-refs-readiness.json')
const defaultOutputMd = join(defaultReleaseDir, 'v14241-real-env-staging-operator-refs-readiness.md')

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

async function readTextIfPresent(path) {
  if (!existsSync(path)) return ''
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
}

function stripOptionalQuotes(value) {
  const text = String(value ?? '').trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim()
  }
  return text
}

export function parseEnvText(text) {
  const values = {}
  const duplicates = new Set()
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const line = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    if (Object.prototype.hasOwnProperty.call(values, key)) duplicates.add(key)
    values[key] = stripOptionalQuotes(line.slice(separatorIndex + 1))
  }
  return { values, duplicateKeys: [...duplicates].sort() }
}

function isPlaceholderValue(value) {
  const text = stripOptionalQuotes(value)
  if (!text) return true
  if (/^<[^>]+>$/.test(text)) return true
  return /^(todo|tbd|replace[_-]?me|change[_-]?me|placeholder|null|undefined|fill[_-]?me)$/i.test(text)
}

function secretLeakReasons(value) {
  const text = stripOptionalQuotes(value)
  const reasons = []
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) reasons.push('jwt_like_value')
  if (/postgres(?:ql)?:\/\//i.test(text)) reasons.push('database_url_like_value')
  if (/\bpassword\s*=/i.test(text)) reasons.push('password_assignment_like_value')
  if (/\bservice[_-]?role\b/i.test(text)) reasons.push('service_role_like_value')
  return reasons
}

function requiredKeysFromDraftPackage(draftPackage) {
  const keys = new Map()
  for (const operation of draftPackage.operations ?? []) {
    if (!operation?.envKey) continue
    const key = String(operation.envKey)
    if (!keys.has(key)) keys.set(key, [])
    keys.get(key).push(operation.path)
  }
  return [...keys.entries()]
    .map(([key, paths]) => ({ key, paths: [...new Set(paths)].sort() }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

function keyGroup(requiredKey) {
  const key = requiredKey.key
  const scenarioMatch = /^V14241_STAGING_REAL_UAT_(\d{2})_/.exec(key)
  if (scenarioMatch) return { group: `REAL-UAT-${scenarioMatch[1]}`, kind: 'scenario' }
  if (
    key === 'V14241_STAGING_COMPANY_ID'
    || key === 'V14241_STAGING_PROJECT_ID'
    || key === 'V14241_STAGING_PRIMARY_TESTER_REF'
  ) {
    return { group: 'common', kind: 'common' }
  }
  if (requiredKey.paths.some((path) => path.startsWith('environmentTargets.staging.'))) {
    return { group: 'environment', kind: 'environment' }
  }
  return { group: 'common', kind: 'common' }
}

function summarizeGroups(rows) {
  const groups = new Map()
  for (const row of rows) {
    const { group, kind } = keyGroup(row)
    const current = groups.get(group) ?? {
      id: group,
      kind,
      requiredKeyCount: 0,
      filledKeyCount: 0,
      missingKeyCount: 0,
      placeholderKeyCount: 0,
      secretLeakCount: 0,
      missingKeys: [],
      placeholderKeys: [],
      secretLeakKeys: [],
    }
    current.requiredKeyCount += 1
    if (row.status === 'filled') current.filledKeyCount += 1
    if (row.status === 'missing' || row.status === 'placeholder') {
      current.missingKeyCount += 1
      current.missingKeys.push(row.key)
    }
    if (row.status === 'placeholder') {
      current.placeholderKeyCount += 1
      current.placeholderKeys.push(row.key)
    }
    if (row.secretLeakReasons.length > 0) {
      current.secretLeakCount += 1
      current.secretLeakKeys.push(row.key)
    }
    groups.set(group, current)
  }
  return [...groups.values()].sort((a, b) => {
    const order = { environment: 0, common: 1, scenario: 2 }
    return (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.id.localeCompare(b.id)
  })
}

function statusFor({ missingKeyCount, placeholderKeyCount, secretLeakCount, requiredKeyCount }) {
  if (requiredKeyCount === 0) return 'operator_refs_no_required_keys'
  if (secretLeakCount > 0) return 'operator_refs_secret_leak_detected'
  if (missingKeyCount > 0 || placeholderKeyCount > 0) return 'operator_refs_missing'
  return 'operator_refs_ready_for_staging_resolution'
}

function assertNoSecretLikeText(report) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=|service[_-]?role/i.test(text)) {
    throw new Error('refusing_to_write_v14241_staging_operator_refs_report_with_secret_like_text')
  }
}

export async function checkStagingOperatorRefsEnv({
  draftPackage = defaultDraftPackage,
  refsEnvFile = defaultRefsEnvFile,
  outputJson = defaultOutputJson,
  outputMd = defaultOutputMd,
  now = new Date(),
} = {}) {
  const resolvedDraftPackage = resolve(draftPackage)
  const resolvedRefsEnvFile = resolve(refsEnvFile)
  const draft = await readJson(resolvedDraftPackage)
  const envText = await readTextIfPresent(resolvedRefsEnvFile)
  const parsedEnv = parseEnvText(envText)
  const requiredKeys = requiredKeysFromDraftPackage(draft)
  const rows = requiredKeys.map((item) => {
    const value = parsedEnv.values[item.key]
    const present = Object.prototype.hasOwnProperty.call(parsedEnv.values, item.key)
    const placeholder = !present || isPlaceholderValue(value)
    const leakReasons = present ? secretLeakReasons(value) : []
    return {
      ...item,
      status: !present ? 'missing' : placeholder ? 'placeholder' : 'filled',
      valuePresent: present,
      valueWrittenToReport: false,
      secretLeakReasons: leakReasons,
    }
  })
  const missingKeys = rows.filter((item) => item.status === 'missing' || item.status === 'placeholder').map((item) => item.key)
  const absentKeys = rows.filter((item) => item.status === 'missing').map((item) => item.key)
  const placeholderKeys = rows.filter((item) => item.status === 'placeholder').map((item) => item.key)
  const secretLeaks = rows
    .filter((item) => item.secretLeakReasons.length > 0)
    .map((item) => ({ key: item.key, reasons: item.secretLeakReasons }))

  const report = {
    schemaVersion: 'workbuddy/v14241-staging-operator-refs-env-readiness/v1',
    generatedAt: now.toISOString(),
    source: 'check-v14241-staging-operator-refs-env',
    status: statusFor({
      missingKeyCount: missingKeys.length,
      placeholderKeyCount: placeholderKeys.length,
      secretLeakCount: secretLeaks.length,
      requiredKeyCount: requiredKeys.length,
    }),
    draftPackage: rel(resolvedDraftPackage),
    refsEnvFile: rel(resolvedRefsEnvFile),
    refsEnvFileExists: existsSync(resolvedRefsEnvFile),
    requiredKeyCount: requiredKeys.length,
    filledKeyCount: rows.filter((item) => item.status === 'filled').length,
    missingKeyCount: missingKeys.length,
    absentKeyCount: absentKeys.length,
    placeholderKeyCount: placeholderKeys.length,
    duplicateKeyCount: parsedEnv.duplicateKeys.length,
    secretLeakCount: secretLeaks.length,
    missingKeys,
    absentKeys,
    placeholderKeys,
    duplicateKeys: parsedEnv.duplicateKeys,
    secretLeaks,
    groups: summarizeGroups(rows),
    keyResults: rows.map((item) => ({
      key: item.key,
      paths: item.paths,
      status: item.status,
      valuePresent: item.valuePresent,
      valueWrittenToReport: false,
      secretLeakReasons: item.secretLeakReasons,
    })),
    executionBoundary: {
      readOnly: true,
      commandsExecuted: 0,
      doesNotMutateEnvironment: true,
      doesNotAuthorizeExecution: true,
      mayAttemptStagingScenarioResolution: missingKeys.length === 0 && placeholderKeys.length === 0 && secretLeaks.length === 0,
      doesNotProveUatStagingLiveMatrixPass: true,
    },
    nextCommands: {
      ifMissing: `Fill ${rel(resolvedRefsEnvFile)} outside Git review, then rerun this preflight.`,
      ifReady: `node project-testing/tools/run-v14241-real-env-scenario-attempts.mjs --tier staging --handoff-file ${draft.draftHandoffFile ?? 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-handoff.staging-ref-draft.json'} --matrix-file ${draft.matrixFile ?? 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-uat-staging-live-matrix.json'} --include-staging --confirm-real-handoff --allow-write`,
    },
  }
  assertNoSecretLikeText(report)
  await mkdir(dirname(resolve(outputJson)), { recursive: true })
  await mkdir(dirname(resolve(outputMd)), { recursive: true })
  await writeFile(resolve(outputJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputMd), renderMarkdown(report), 'utf8')
  return report
}

export function renderMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Staging Operator Refs Readiness',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Draft package: ${report.draftPackage}`,
    `- Refs env file: ${report.refsEnvFile}`,
    `- Refs env file exists: ${report.refsEnvFileExists}`,
    '',
    '## Verdict',
    '',
    `- Required keys: ${report.requiredKeyCount}`,
    `- Filled keys: ${report.filledKeyCount}`,
    `- Missing keys: ${report.missingKeyCount}`,
    `- Placeholder keys: ${report.placeholderKeyCount}`,
    `- Duplicate keys: ${report.duplicateKeyCount}`,
    `- Secret-like values: ${report.secretLeakCount}`,
    `- May attempt staging scenario resolution: ${report.executionBoundary.mayAttemptStagingScenarioResolution ? 'yes' : 'no'}`,
    '',
    '## Boundary',
    '',
    '- This is a read-only refs preflight. It does not authorize execution and does not mutate UAT, staging, solo-live, or live.',
    '- It reports key names and statuses only. It never writes operator-provided values into the JSON or Markdown report.',
    '- A ready result only means staging refs can be resolved by the scenario runner; it is not a real scenario pass.',
    '',
    '## Groups',
    '',
    '| Group | Required | Filled | Missing | Placeholder | Secret-like |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const group of report.groups) {
    lines.push(`| ${group.id} | ${group.requiredKeyCount} | ${group.filledKeyCount} | ${group.missingKeyCount} | ${group.placeholderKeyCount} | ${group.secretLeakCount} |`)
  }
  if (report.missingKeys.length > 0) {
    lines.push('', '## Missing Keys', '')
    for (const key of report.missingKeys) lines.push(`- ${key}`)
  }
  if (report.placeholderKeys.length > 0) {
    lines.push('', '## Placeholder Keys', '')
    for (const key of report.placeholderKeys) lines.push(`- ${key}`)
  }
  if (report.secretLeaks.length > 0) {
    lines.push('', '## Secret-Like Values', '')
    for (const leak of report.secretLeaks) lines.push(`- ${leak.key}: ${leak.reasons.join(', ')}`)
  }
  lines.push('', '## Next Commands', '')
  lines.push(`- ${report.nextCommands.ifMissing}`)
  lines.push(`- ${report.nextCommands.ifReady}`)
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const draftPackage = resolve(argValue('--draft-package', join(releaseDir, 'v14241-real-env-staging-ref-draft-package.json')))
  const refsEnvFile = resolve(argValue('--refs-env-file', join(releaseDir, 'v14241-real-env-staging-operator.refs.env.template')))
  const outputJson = resolve(argValue('--output', join(releaseDir, 'v14241-real-env-staging-operator-refs-readiness.json')))
  const outputMd = resolve(argValue('--md-output', join(releaseDir, 'v14241-real-env-staging-operator-refs-readiness.md')))
  const report = await checkStagingOperatorRefsEnv({
    draftPackage,
    refsEnvFile,
    outputJson,
    outputMd,
  })
  console.log(JSON.stringify({
    status: report.status,
    requiredKeyCount: report.requiredKeyCount,
    filledKeyCount: report.filledKeyCount,
    missingKeyCount: report.missingKeyCount,
    placeholderKeyCount: report.placeholderKeyCount,
    secretLeakCount: report.secretLeakCount,
    mayAttemptStagingScenarioResolution: report.executionBoundary.mayAttemptStagingScenarioResolution,
    outputs: [rel(outputJson), rel(outputMd)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
