#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateHandoffReadiness, renderReadinessMarkdown } from './build-v14241-real-env-handoff-pack.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultHandoffFile = join(defaultReleaseDir, 'v14241-real-env-handoff.operator-fill-template.json')
const defaultOutputJson = join(defaultReleaseDir, 'v14241-real-env-handoff-operator-readiness.json')
const defaultOutputMd = join(defaultReleaseDir, 'v14241-real-env-handoff-operator-readiness.md')

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

function assertNoSecretLikeText(report) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_v14241_operator_handoff_readiness_with_secret_like_text')
  }
}

export async function checkOperatorHandoff({
  handoffFile = defaultHandoffFile,
  matrixFile = defaultMatrixFile,
  outputJson = defaultOutputJson,
  outputMd = defaultOutputMd,
  now = new Date(),
} = {}) {
  const [handoff, matrix] = await Promise.all([readJson(resolve(handoffFile)), readJson(resolve(matrixFile))])
  const readiness = evaluateHandoffReadiness({ handoff, matrix, now })
  const report = {
    ...readiness,
    source: 'check-v14241-real-env-handoff-file',
    handoffFile: rel(resolve(handoffFile)),
    matrixFile: rel(resolve(matrixFile)),
    executionBoundary: {
      readOnly: true,
      commandsExecuted: 0,
      doesNotMutateEnvironment: true,
      mayExecuteMatrix: readiness.readyToExecuteMatrix === true,
    },
  }
  assertNoSecretLikeText(report)
  await mkdir(dirname(resolve(outputJson)), { recursive: true })
  await mkdir(dirname(resolve(outputMd)), { recursive: true })
  await writeFile(resolve(outputJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputMd), renderReadinessMarkdown(report), 'utf8')
  return report
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const handoffFile = resolve(argValue('--handoff-file', join(releaseDir, 'v14241-real-env-handoff.operator-fill-template.json')))
  const matrixFile = resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json')))
  const outputJson = resolve(argValue('--output', join(releaseDir, 'v14241-real-env-handoff-operator-readiness.json')))
  const outputMd = resolve(argValue('--md-output', join(releaseDir, 'v14241-real-env-handoff-operator-readiness.md')))
  const report = await checkOperatorHandoff({ handoffFile, matrixFile, outputJson, outputMd })
  console.log(JSON.stringify({
    status: report.status,
    readyToExecuteMatrix: report.readyToExecuteMatrix,
    readyScenarioCount: report.readyScenarioCount,
    scenarioCount: report.scenarioCount,
    readyTierCount: report.readyTierCount,
    tierCount: report.tierCount,
    secretLeakCount: report.secretLeakCount,
    outputs: [rel(outputJson), rel(outputMd)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
