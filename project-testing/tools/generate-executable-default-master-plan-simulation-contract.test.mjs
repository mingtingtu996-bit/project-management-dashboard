import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as executablePlanSimulation from './generate-executable-default-master-plan-simulation.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const simulationSource = fs.readFileSync(
  path.join(scriptDir, 'generate-executable-default-master-plan-simulation.mjs'),
  'utf8',
)

test('local static executable plan simulation resolves built-in duration assets without runtime DB fallback waits', () => {
  assert.match(simulationSource, /environmentTarget:\s*'local_static'/)
  assert.match(simulationSource, /algorithmSeedSourcePolicy:\s*'built_in_only'/)
  assert.match(
    simulationSource,
    /diagnosticStageTimings:\s*process\.env\.WORKBUDDY_EXECUTABLE_PLAN_SIMULATION_TRACE\s*===\s*'1'/,
  )
})

test('simulation scenarios use valid representative subtypes and expand to the full subtype matrix', () => {
  assert.equal(typeof executablePlanSimulation.buildSimulationScenarios, 'function')
  const probes = [
    'general_civil',
    'hotel',
    'hospital',
    'school',
    'industrial',
    'data_center',
    'transportation_hub',
    'sports_culture',
    'tod_upper_cover',
    'renovation',
    'modular_building',
  ].map((businessType) => ({ businessType }))

  const representativeScenarios = executablePlanSimulation.buildSimulationScenarios(probes, {
    subtypeMatrix: false,
    businessSubtype: null,
  })
  assert.equal(representativeScenarios.length, 11)
  assert.equal(
    representativeScenarios.find((scenario) => scenario.probe.businessType === 'industrial')?.businessSubtype,
    'industrial_general',
  )
  assert.equal(
    representativeScenarios.find((scenario) => scenario.probe.businessType === 'transportation_hub')?.businessSubtype,
    'transport_multimodal',
  )
  assert.equal(
    representativeScenarios.find((scenario) => scenario.probe.businessType === 'sports_culture')?.businessSubtype,
    'sports_stadium',
  )

  const subtypeMatrix = executablePlanSimulation.buildSimulationScenarios(probes, {
    subtypeMatrix: true,
    businessSubtype: null,
  })
  assert.equal(subtypeMatrix.length, 24)
  assert.equal(new Set(subtypeMatrix.map((scenario) => scenario.scenarioCode)).size, 24)
})

test('subtype simulation facts remove broad-fixture signals that would select a different specialist plan', () => {
  const stadiumFacts = executablePlanSimulation.buildSimulationFacts(
    { businessType: 'sports_culture' },
    'sports_stadium',
  )
  const multimodalFacts = executablePlanSimulation.buildSimulationFacts(
    { businessType: 'transportation_hub' },
    'transport_multimodal',
  )

  assert.equal(stadiumFacts.projectTypeCode, 'sports_stadium')
  assert.equal(stadiumFacts.specialRoomTypeCodes.includes('auditorium'), false)
  assert.equal(multimodalFacts.projectTypeCode, 'transport_multimodal')
  assert.equal(multimodalFacts.specialRoomTypeCodes.includes('platform_interface'), false)
})
