import { describe, expect, it } from 'vitest'
import {
  CHINA_GB55032_TEMPLATE_ID,
  generateWbsTemplateRows,
} from '../services/wbsTemplateGenerationService.js'

const COMPOSITE_PROJECT_ID = '00000000-0000-4000-8000-000000005555'

const SCENARIOS = [
  {
    scenarioId: 'residential',
    projectTypeCode: 'civil_residential',
    templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-prefabricated-assembly'],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01', '02-01-03'],
      'china-prefabricated-assembly': ['PFB-00-01-01', 'PFB-01-01-01'],
    },
  },
  {
    scenarioId: 'hospital',
    projectTypeCode: 'hospital',
    templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-cleanroom-medical-specialty'],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
      'china-cleanroom-medical-specialty': ['CLN-01-01-01', 'CLN-02-01-01'],
    },
  },
  {
    scenarioId: 'data-center',
    projectTypeCode: 'data_center',
    templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-data-center-specialty'],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
      'china-data-center-specialty': ['DTC-01-01-01', 'DTC-02-01-01'],
    },
  },
] as const

function dependencyRefsAreClosed(rows: Awaited<ReturnType<typeof generateWbsTemplateRows>>['rows']) {
  const ids = new Set(rows.map((row) => row.clientRowId))
  return rows.every((row) => row.predecessorDependencies.every((dependency) => ids.has(dependency.clientRowId)))
}

describe('composite WBS generation smoke', () => {
  it('generates closed dependency networks for representative business scenarios', async () => {
    const generated = await Promise.all(SCENARIOS.map((scenario) => generateWbsTemplateRows({
      projectId: COMPOSITE_PROJECT_ID,
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: `composite:${scenario.scenarioId}`,
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        templateIds: scenario.templateIds,
        selectedNodesByTemplate: scenario.selectedNodesByTemplate,
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: `composite:${scenario.scenarioId}:building`,
          physical_zone_object_id: `composite:${scenario.scenarioId}:zone`,
          project_type_code: scenario.projectTypeCode,
          totalAreaM2: 90000,
          buildingCount: 2,
          highestBuildingFloorCount: 18,
        },
      },
    })))

    const rows = generated.flatMap((batch) => batch.rows)
    expect(rows.length).toBeGreaterThan(0)
    expect(generated.every((batch) => dependencyRefsAreClosed(batch.rows))).toBe(true)
    expect(rows.some((row) => Object.prototype.hasOwnProperty.call(row.values, 'zone_object_id'))).toBe(false)
    expect(new Set(rows.map((row) => row.values.physical_zone_object_id))).toEqual(new Set([
      'composite:residential:zone',
      'composite:hospital:zone',
      'composite:data-center:zone',
    ]))
  }, 120000)
})
