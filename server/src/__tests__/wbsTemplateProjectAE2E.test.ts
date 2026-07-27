import { describe, expect, it } from 'vitest'
import {
  CHINA_GB55032_TEMPLATE_ID,
  generateWbsTemplateRows,
} from '../services/wbsTemplateGenerationService.js'

const PROJECT_ID = '00000000-0000-4000-8000-0000000000a1'

const PROJECT_A_PHASES = [
  {
    phaseId: 'p1a-pit-piling',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['01-02-01', '01-03-01'],
    },
  },
  {
    phaseId: 'p2a-basement-structure',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01', '02-01-03'],
    },
  },
  {
    phaseId: 'p4a-mep',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['05-01-01', '07-02'],
    },
  },
] as const

function stableCodeOf(row: { values: Record<string, unknown> }) {
  return String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '')
}

describe('project A WBS generation smoke', () => {
  it('keeps scoped phase generation bounded and uses physical zone scope facts', async () => {
    const batches = await Promise.all(PROJECT_A_PHASES.map((phase) => generateWbsTemplateRows({
      projectId: PROJECT_ID,
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: `project-a:${phase.phaseId}`,
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        templateIds: phase.templateIds,
        selectedNodesByTemplate: phase.selectedNodesByTemplate,
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: `project-a:${phase.phaseId}:tower`,
          physical_zone_object_id: `project-a:${phase.phaseId}:zone`,
          project_type_code: 'civil_residential',
          structure_type_code: 'shear_wall',
          method_variant_codes: ['cast_in_place_rebar', 'aluminum_formwork'],
          totalAreaM2: 180000,
          buildingCount: 3,
          highestBuildingFloorCount: 26,
          basementLevelCount: 2,
          foundationDepthM: 9.5,
        },
      },
    })))

    const rows = batches.flatMap((batch) => batch.rows)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(500)
    expect(rows.every((row) => row.values.physical_zone_object_id)).toBe(true)
    expect(rows.some((row) => Object.prototype.hasOwnProperty.call(row.values, 'zone_object_id'))).toBe(false)
    expect(rows.map(stableCodeOf)).toEqual(expect.arrayContaining(['01-02-01', '02-01-01']))
  }, 120000)
})
