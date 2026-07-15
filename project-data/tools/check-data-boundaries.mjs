#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function pathOf(relativePath) {
  return join(repoRoot, relativePath)
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(pathOf(relativePath), 'utf8'))
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'failed', message, ...details }, null, 2))
  process.exit(1)
}

async function main() {
  const forbidden = await readJson('project-data/boundaries/forbidden-writes.json')
  const mutation = await readJson('project-data/boundaries/mutation-boundaries.json')
  const gates = await readJson('project-data/boundaries/candidate-to-runtime-gates.json')

  const requiredForbidden = [
    'tasks',
    'task_baselines',
    'monthly_plans',
    'monthly_plan_items',
    'task_dependencies',
    'duration_experience_samples',
    'actual_duration_outcomes',
    'critical_path',
    'published_runtime_overlay',
    'production_seed_rows',
    'progress_knowledge_sources',
    'progress_knowledge_documents',
    'progress_asset_candidates',
    'progress_asset_calibration_runs',
    'progress_asset_calibration_results',
    'progress_asset_publication_readiness',
  ]

  for (const table of requiredForbidden) {
    if (!forbidden.forbiddenDirectExternalWrites.includes(table)) {
      fail(`Forbidden direct external write is missing: ${table}`)
    }
  }

  const searchBoundary = mutation.boundaries.find((entry) => entry.id === 'search_candidate_only')
  if (!searchBoundary) fail('search_candidate_only boundary is missing')
  for (const table of searchBoundary.allowedTables || []) {
    if (forbidden.forbiddenDirectExternalWrites.includes(table)) {
      fail(`Search candidate boundary allows forbidden table: ${table}`)
    }
  }

  for (const gate of [
    'source_verification',
    'candidate_review',
    'code_owner_review',
    'data_contract_check',
    'official_seed_rule_or_template_change',
    'automated_code_tests',
    'normal_code_release',
  ]) {
    if (!gates.gates.includes(gate)) fail(`Candidate-to-runtime gate is missing: ${gate}`)
  }
  if ((searchBoundary.allowedTables || []).length !== 0) {
    fail('Project-search may not write product database tables')
  }

  console.log(JSON.stringify({
    status: 'passed',
    forbiddenDirectExternalWrites: forbidden.forbiddenDirectExternalWrites.length,
    mutationBoundaries: mutation.boundaries.length,
    candidateToRuntimeGates: gates.gates.length,
    mutationBoundary: 'read-only boundary check; no database connection or data mutation',
  }, null, 2))
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
