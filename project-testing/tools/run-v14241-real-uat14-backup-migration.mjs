#!/usr/bin/env node

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mainForScenario, runRealUatScenarioContract } from './run-v14241-real-uat-scenario-contract.mjs'

export function runUat14BackupMigration(options = {}) {
  return runRealUatScenarioContract({ scenarioId: 'REAL-UAT-14', ...options })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mainForScenario('REAL-UAT-14').catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
