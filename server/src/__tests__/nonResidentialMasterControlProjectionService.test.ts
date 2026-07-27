import { describe, expect, it } from 'vitest'

import { evaluateNonResidentialMasterControlPromotion } from '../services/nonResidentialMasterControlProjectionService.js'

function projectionRow(params: {
  code: string
  title: string
  businessType: string
  templateGroup: string
  referenceDays: number
  category?: 'item_work' | 'sub_division'
  organizationLane?: string
}) {
  return {
    rowProjectionMode: 'linked_projection',
    executionPhase: 'superstructure_rhythm',
    executionLane: params.templateGroup,
    planItemKind: 'work_task',
    values: {
      standard_work_code: params.code,
      title: params.title,
      smart_reference_days: params.referenceDays,
      category_type: params.category ?? 'item_work',
      plan_item_kind: 'work_task',
      execution_nature: 'physical_work',
      duration_contribution_mode: 'duration_bearing',
      template_group: params.templateGroup,
      organization_lane: params.organizationLane,
      standard_task_metadata: {},
    },
  }
}

describe('non-residential master-control projection', () => {
  it('keeps implausibly short physical item work in drilldown', () => {
    const result = evaluateNonResidentialMasterControlPromotion({
      businessType: 'sports_culture',
      row: projectionRow({
        code: 'SPC-01-01-02',
        title: '金属屋面、膜结构与场馆外围护封闭',
        businessType: 'sports_culture',
        templateGroup: 'sports_culture',
        referenceDays: 5,
      }),
    })

    expect(result.eligible).toBe(false)
    expect(result.reasonCodes).toContain('short_physical_item_belongs_to_execution_drilldown')
  })

  it('treats ten-day physical item work as execution detail rather than padding the master plan', () => {
    const result = evaluateNonResidentialMasterControlPromotion({
      businessType: 'industrial',
      row: projectionRow({
        code: 'IPL-01-01-01',
        title: 'Industrial steel structure local work package',
        businessType: 'industrial',
        templateGroup: 'industrial_plant',
        referenceDays: 10,
      }),
    })

    expect(result.eligible).toBe(false)
    expect(result.reasonCodes).toContain('short_physical_item_belongs_to_execution_drilldown')
  })

  it('retains short commissioning and handover controls on the master plan', () => {
    const result = evaluateNonResidentialMasterControlPromotion({
      businessType: 'sports_culture',
      row: projectionRow({
        code: 'SPC-04-01-01',
        title: '场馆系统联调、赛事或演出全流程演练',
        businessType: 'sports_culture',
        templateGroup: 'sports_culture',
        referenceDays: 6,
      }),
    })

    expect(result.eligible).toBe(true)
  })

  it('does not promote generic MEP catalog rows merely because their scope suffix says renovation zone', () => {
    const result = evaluateNonResidentialMasterControlPromotion({
      businessType: 'renovation',
      row: projectionRow({
        code: '05-01',
        title: '室内给水系统（改造分区1）',
        businessType: 'renovation',
        templateGroup: 'building_main',
        referenceDays: 56,
      }),
    })

    expect(result.eligible).toBe(false)
    expect(result.reasonCodes).toContain('generic_catalog_row_not_renovation_master_control')
  })

  it('retains curated occupied-renovation workface controls without opening short generic detail promotion', () => {
    const controls = [
      ['RNV-04-01-05', 'Temporary support and unloading construction', 10],
      ['RNV-04-01-06', 'Selective demolition and debris removal', 9],
      ['RNV-04-01-16', 'MEP temporary cutover and service continuity', 12],
      ['RNV-04-01-22', 'Existing finish protection and restoration', 12],
    ] as const

    for (const [code, title, referenceDays] of controls) {
      const result = evaluateNonResidentialMasterControlPromotion({
        businessType: 'renovation',
        businessSubtype: 'renovation_seismic',
        row: projectionRow({
          code,
          title,
          businessType: 'renovation',
          templateGroup: 'renovation',
          referenceDays,
          organizationLane: 'seismic_reinforcement_zone_lane_1',
        }),
      })

      expect(result.eligible, code).toBe(true)
      expect(result.scopeMode, code).toBe('organization_lane_control')
      expect(result.reasonCodes, code).toEqual(['eligible_existing_asset_master_control_candidate'])
    }
  })

  it('uses modular workflow controls instead of generic building catalog rows', () => {
    const result = evaluateNonResidentialMasterControlPromotion({
      businessType: 'modular_building',
      row: projectionRow({
        code: '05-01',
        title: 'Indoor water supply system (modular lane 1)',
        businessType: 'modular_building',
        templateGroup: 'building_main',
        referenceDays: 24,
        category: 'sub_division',
      }),
    })

    expect(result.eligible).toBe(false)
    expect(result.reasonCodes).toContain('generic_catalog_row_replaced_by_modular_workflow_control')
  })

  it('retains dedicated modular factory and site controls', () => {
    const result = evaluateNonResidentialMasterControlPromotion({
      businessType: 'modular_building',
      row: projectionRow({
        code: 'MIC-06-01-18',
        title: 'Modular MEP quick-connect testing',
        businessType: 'modular_building',
        templateGroup: 'modular_mic',
        referenceDays: 3,
      }),
    })

    expect(result.eligible).toBe(true)
  })

  it('retains curated modular fabrication and site-interface work packages as master controls', () => {
    const controls = [
      ['MIC-02-01-01', 'Modular steel frame and fitout integration', 12],
      ['MIC-02-01-03', 'Modular MEP pre-installation FAT and defect closure', 12],
      ['MIC-06-01-03', 'Modular steel frame welding fabrication', 12],
      ['MIC-06-01-05', 'Modular MEP pipeline pre-installation', 12],
      ['MIC-06-01-08', 'Modular facade factory integration', 12],
      ['MIC-04-01-02', 'Modular node welding and high-strength bolt connection', 12],
      ['MIC-03-01-02', 'Modular onsite unloading and temporary storage', 11],
    ] as const

    for (const [code, title, referenceDays] of controls) {
      const result = evaluateNonResidentialMasterControlPromotion({
        businessType: 'modular_building',
        row: projectionRow({
          code,
          title,
          businessType: 'modular_building',
          templateGroup: 'modular_mic',
          referenceDays,
        }),
      })

      expect(result.eligible, code).toBe(true)
      expect(result.reasonCodes, code).not.toContain('no_major_construction_control_signal')
    }
  })

  it('promotes general-civil office controls without opening residential detail promotion', () => {
    const row = projectionRow({
      code: '04-01',
      title: '幕墙与外立面围护工程',
      businessType: 'general_civil',
      templateGroup: 'facade',
      referenceDays: 45,
      category: 'sub_division',
    })

    const officeResult = evaluateNonResidentialMasterControlPromotion({
      businessType: 'general_civil',
      businessSubtype: 'civil_office_commercial',
      row,
    })
    const residentialResult = evaluateNonResidentialMasterControlPromotion({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      row,
    })

    expect(officeResult.eligible).toBe(true)
    expect(officeResult.reasonCodes).not.toContain('not_supported_non_residential_business_type')
    expect(residentialResult.eligible).toBe(false)
    expect(residentialResult.reasonCodes).toContain('not_supported_non_residential_business_type')
  })
})
