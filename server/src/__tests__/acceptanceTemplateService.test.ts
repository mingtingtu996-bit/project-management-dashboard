import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const executeSQL = vi.fn(async (_sql: string, _params: unknown[] = []) => [])
  const executeSQLOne = vi.fn(async (_sql: string, _params: unknown[] = []) => null)
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = []
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized === 'begin' || normalized === 'commit' || normalized === 'rollback') {
        return { rows: [], rowCount: 0 }
      }
      const insertMatch = normalized.match(/^insert into "([^"]+)"/)
      if (insertMatch) {
        const table = insertMatch[1]
        const id = `${table}-${inserted.filter((entry) => entry.table === table).length + 1}`
        const row = { id, project_id: 'project-1', rawParams: params }
        inserted.push({ table, row })
        return { rows: [row], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    }),
    release: vi.fn(),
  }
  const getClient = vi.fn(async () => client)

  return {
    executeSQL,
    executeSQLOne,
    getClient,
    client,
    inserted,
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
}))

vi.mock('../database.js', () => ({
  getClient: state.getClient,
}))

describe('acceptance template service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.inserted.splice(0, state.inserted.length)
    state.client.query.mockClear()
    state.client.release.mockClear()
    state.getClient.mockResolvedValue(state.client)
    state.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.includes('from acceptance_plans')) return []
      if (normalized.includes('from acceptance_catalog')) return []
      if (normalized.includes('from acceptance_dependencies')) return []
      if (normalized.includes('from acceptance_requirements')) return []
      return []
    })
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      name: '广州住宅项目',
      business_type: 'residential',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'residential',
            locationFacts: {
              provinceCode: 'GD',
              province: '广东省',
              city: '广州市',
            },
          },
        },
      },
    })
  })

  it('builds a residential delivery acceptance preview from region and business facts', async () => {
    const {
      ACCEPTANCE_TEMPLATE_SEED_VERSION,
      GENERAL_ACCEPTANCE_TEMPLATE_CODE,
      buildAcceptanceTemplatePreview,
    } = await import('../services/acceptanceTemplateService.js')

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const names = preview.items.map((item) => item.itemName)

    expect(preview.templateCode).toBe(GENERAL_ACCEPTANCE_TEMPLATE_CODE)
    expect(preview.seedVersion).toBe(ACCEPTANCE_TEMPLATE_SEED_VERSION)
    expect(preview.regionProfile).toMatchObject({
      provinceCode: 'GD',
      provinceName: '广东省',
      source: 'project_static_profile',
    })
    expect(preview.industryProfile.codes).toContain('residential')
    expect(preview.summary.itemCreateCount).toBeGreaterThanOrEqual(10)
    expect(preview.summary.itemCreateCount).toBeLessThanOrEqual(30)
    expect(names).toEqual(expect.arrayContaining([
      '工程竣工验收',
      '综合验收',
      '竣工备案',
      '规划验收',
      '消防验收',
      '人防验收',
      '档案验收',
      '供水验收',
      '供电验收',
      '排水验收',
      '物业承接查验',
      '分户验收',
      '交付备案',
      '交付移交',
    ]))
    expect(new Set(names).size).toBe(names.length)
    expect(names).not.toEqual(expect.arrayContaining([
      '消防验收备案',
      '人防工程竣工验收备案',
      '燃气开通',
      '电梯使用登记',
    ]))

    const fire = preview.items.find((item) => item.itemCode === 'fire_acceptance')
    expect(fire).toMatchObject({
      itemName: '消防验收',
      canonicalType: 'fire_acceptance',
      resultDocuments: expect.arrayContaining([expect.stringContaining('消防')]),
      handlingModes: expect.arrayContaining([expect.stringContaining('备案')]),
    })
    expect(preview.items.map((item) => item.itemCode)).not.toContain('gas_acceptance')
  })

  it('adds residential gas acceptance only when project facts mention gas facilities', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '广州住宅项目含厨房燃气工程',
      business_type: 'residential',
      metadata: {
        projectGenerationFacts: {
          businessTypeCode: 'residential',
          projectFeatures: {
            locationFacts: {
              provinceCode: 'GD',
              province: '广东省',
              city: '广州市',
            },
            municipalSupports: ['厨房用气', '燃气工程'],
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const gas = preview.items.find((item) => item.itemCode === 'gas_acceptance')
    expect(gas).toMatchObject({
      itemName: '燃气验收',
      resultDocuments: expect.arrayContaining([expect.stringContaining('开通')]),
    })
  })

  it('covers more than ten verified city profiles and the city-level specialty candidate pool', async () => {
    const {
      ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
      ACCEPTANCE_TEMPLATE_SEED_VERSION,
    } = await import('../seeds/acceptanceTimelineTemplateSeed.js')

    const cityProfiles = ACCEPTANCE_TIMELINE_TEMPLATE_SEED.regionProfiles.filter((profile) => profile.cityName)
    const itemNames = ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool.map((item) => item.itemName)

    expect(ACCEPTANCE_TEMPLATE_SEED_VERSION).toBe('v1.4.22.5')
    expect(cityProfiles.length).toBeGreaterThanOrEqual(10)
    expect(cityProfiles.map((profile) => profile.cityName)).toEqual(expect.arrayContaining([
      '北京市',
      '成都市',
      '济南市',
      '青岛市',
      '重庆市',
      '福州市',
      '齐齐哈尔市',
      '承德市',
      '盘锦市',
      '中山市',
      '达州市',
      '周口市',
      '洛阳市',
    ]))
    expect(cityProfiles.every((profile) => profile.policySources.length > 0)).toBe(true)
    expect(itemNames).toEqual(expect.arrayContaining([
      '公众聚集场所消防安全检查',
      '环卫设施验收',
    ]))
  })

  it('adds industry-specific items without duplicating canonical acceptance nodes', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '工业厂房项目',
      business_type: 'industrial',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'industrial',
            locationFacts: { province: '江苏省', city: '苏州市' },
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const names = preview.items.map((item) => item.itemName)

    expect(preview.industryProfile.codes).toContain('industrial')
    expect(names).toEqual(expect.arrayContaining(['环保验收', '供电验收', '排水验收']))
    expect(names.filter((name) => name === '消防验收')).toHaveLength(1)
    expect(names.filter((name) => name.includes('燃气'))).toEqual([])
  })

  it('calibrates city municipal specialties by project facts instead of defaulting every Shenzhen industrial plant', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: 'Shenzhen ordinary industrial plant project',
      business_type: 'industrial',
      metadata: {
        projectGenerationFacts: {
          businessType: 'industrial',
          businessSubtype: 'industrial_general',
          projectFeatures: {
            locationFacts: { provinceCode: 'GD', cityCode: 'shenzhen', province: 'Guangdong', city: 'Shenzhen' },
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const itemCodes = preview.items.map((item) => item.itemCode)

    expect(preview.regionProfile).toMatchObject({
      provinceCode: 'GD',
      cityCode: 'shenzhen',
    })
    expect(preview.businessProfile.businessTypeCode).toBe('industrial')
    expect(itemCodes).toEqual(expect.arrayContaining([
      'completion_acceptance',
      'completion_filing',
      'planning_acceptance',
      'fire_acceptance',
      'civil_defense_acceptance',
      'environment_acceptance',
      'power_acceptance',
      'drainage_acceptance',
    ]))
    expect(itemCodes).not.toContain('gas_acceptance')
    expect(itemCodes).not.toContain('landscape_acceptance')
  })

  it('adds condition-gated Shenzhen industrial specialties when project facts mention them', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: 'Shenzhen industrial plant with production gas and landscape works',
      business_type: 'industrial',
      metadata: {
        projectGenerationFacts: {
          businessType: 'industrial',
          businessSubtype: 'industrial_general',
          projectFeatures: {
            locationFacts: { provinceCode: 'GD', cityCode: 'shenzhen', province: 'Guangdong', city: 'Shenzhen' },
            municipalSupports: ['production gas', 'gas engineering', 'landscape works'],
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const itemCodes = preview.items.map((item) => item.itemCode)

    expect(itemCodes).toContain('gas_acceptance')
    expect(itemCodes).toContain('landscape_acceptance')
  })

  it('keeps condition-gated regional utility additions from broadening every formal business type', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    const { PRODUCT_BUSINESS_TYPE_CODES } = await import('../services/projectScenarioTaxonomyService.js')
    const conditionGatedCodes = ['gas_acceptance', 'landscape_acceptance', 'heat_supply_acceptance', 'telecom_acceptance']
    const genericBusinessTypes = PRODUCT_BUSINESS_TYPE_CODES.filter((code) => ![
      'general_civil',
      'hotel',
      'school',
      'sports_culture',
      'modular_building',
      'hospital',
      'data_center',
      'transportation_hub',
      'tod_upper_cover',
    ].includes(code))

    for (const businessType of genericBusinessTypes) {
      state.executeSQLOne.mockResolvedValueOnce({
        id: `project-${businessType}`,
        name: `${businessType} generic Shenzhen project`,
        business_type: businessType,
        metadata: {
          projectGenerationFacts: {
            businessType,
            businessSubtype: businessType === 'renovation' ? 'renovation_energy' : 'industrial_general',
            projectFeatures: {
              locationFacts: { provinceCode: 'GD', cityCode: 'shenzhen', province: 'Guangdong', city: 'Shenzhen' },
            },
          },
        },
      })

      const preview = await buildAcceptanceTemplatePreview(`project-${businessType}`)
      const itemCodes = preview.items.map((item) => item.itemCode)
      for (const conditionGatedCode of conditionGatedCodes) {
        expect(itemCodes, `${businessType} should not inherit ${conditionGatedCode} from region alone`)
          .not.toContain(conditionGatedCode)
      }
    }
  })

  it('keeps extended specialty acceptance candidates conditional instead of defaulting every project', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const names = preview.items.map((item) => item.itemName)

    expect(names).toEqual(expect.arrayContaining(['消防验收', '人防验收']))
    expect(names).not.toEqual(expect.arrayContaining([
      '防雷验收',
      '供热验收',
      '水土保持设施验收',
      '卫生验收',
      '国家安全事项验收',
    ]))
  })

  it('adds lightning protection acceptance only when project facts match official special-scope triggers', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '石化园区油库雷电防护装置竣工验收项目',
      business_type: 'industrial',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'industrial',
            acceptanceSpecialties: ['油库', '石化', '雷电防护装置', '防雷装置检测'],
            locationFacts: { province: '广东省', city: '深圳市' },
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const itemCodes = preview.items.map((item) => item.itemCode)

    expect(itemCodes).toContain('lightning_acceptance')
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'lightning_protection_facility')).toMatchObject({
      selected: true,
      source: 'project_feature_trigger',
      confirmationRequired: false,
      affectedItemCodes: ['lightning_acceptance'],
    })
  })

  it('keeps elevator acceptance conditional for ordinary low-rise projects without equipment facts', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '深圳低层普通民用配套楼项目',
      business_type: 'general_civil',
      metadata: {
        projectGenerationFacts: {
          businessType: 'general_civil',
          projectFeatures: {
            businessTypeCode: 'general_civil',
            highestBuildingFloorCount: 3,
            standardFloorCount: 3,
            locationFacts: { province: '广东省', city: '深圳市' },
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const itemCodes = preview.items.map((item) => item.itemCode)

    expect(itemCodes).not.toContain('elevator_acceptance')
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'elevator_facility')).toMatchObject({
      selected: false,
      suggested: false,
      confirmationRequired: true,
      affectedItemCodes: ['elevator_acceptance'],
    })
  })

  it('adds elevator acceptance from equipment facts or high-rise building facts', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '深圳低层厂房配置货梯项目',
      business_type: 'industrial',
      metadata: {
        projectGenerationFacts: {
          businessType: 'industrial',
          projectFeatures: {
            businessTypeCode: 'industrial',
            acceptanceSpecialties: ['货梯', '电梯使用登记'],
            locationFacts: { province: '广东省', city: '深圳市' },
          },
        },
      },
    })

    const equipmentPreview = await buildAcceptanceTemplatePreview('project-1')
    expect(equipmentPreview.items.map((item) => item.itemCode)).toContain('elevator_acceptance')
    expect(equipmentPreview.applicabilityConditions.find((condition) => condition.conditionCode === 'elevator_facility')).toMatchObject({
      selected: true,
      source: 'project_feature_trigger',
      confirmationRequired: false,
      affectedItemCodes: ['elevator_acceptance'],
    })

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-2',
      name: '深圳高层住宅项目',
      business_type: 'general_civil',
      metadata: {
        projectGenerationFacts: {
          businessType: 'general_civil',
          projectFeatures: {
            businessTypeCode: 'general_civil',
            highestBuildingFloorCount: 18,
            standardFloorCount: 18,
            locationFacts: { province: '广东省', city: '深圳市' },
          },
        },
      },
    })

    const highRisePreview = await buildAcceptanceTemplatePreview('project-2')
    expect(highRisePreview.items.map((item) => item.itemCode)).toContain('elevator_acceptance')
    expect(highRisePreview.applicabilityConditions.find((condition) => condition.conditionCode === 'elevator_facility')).toMatchObject({
      selected: true,
      source: 'project_feature_trigger',
      confirmationRequired: false,
      affectedItemCodes: ['elevator_acceptance'],
    })
  })

  it('does not add city optional specialties from industry alone without project feature triggers', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '北京普通办公楼项目',
      business_type: 'commercial office',
      project_type: 'office',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'commercial_office',
            locationFacts: { province: '北京市', city: '北京市' },
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const names = preview.items.map((item) => item.itemName)

    expect(preview.regionProfile.cityName).toBe('北京市')
    expect(names).not.toEqual(expect.arrayContaining([
      '公众聚集场所消防安全检查',
      '环卫设施验收',
      '交通接驳核验',
      '海绵城市专项核验',
    ]))
    expect(preview.applicabilityConditions.map((condition) => condition.conditionCode)).toEqual(expect.arrayContaining([
      'public_assembly_place',
      'sanitation_facility',
      'heat_supply_connection',
      'telecom_connection',
    ]))
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'public_assembly_place')).toMatchObject({
      selected: false,
      suggested: false,
      confirmationRequired: true,
      affectedItemCodes: ['public_assembly_fire_safety_check', 'opening_release'],
    })
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'heat_supply_connection')).toMatchObject({
      selected: false,
      suggested: false,
      confirmationRequired: true,
      affectedItemCodes: ['heat_supply_acceptance'],
    })
  })

  it('recognizes pre-certificate covered cities while inheriting province-level shared acceptance rules', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '山东烟台住宅交付项目',
      business_type: 'residential',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'residential',
            locationFacts: { province: '山东省', city: '烟台市' },
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const itemCodes = preview.items.map((item) => item.itemCode)

    expect(preview.regionProfile).toMatchObject({
      provinceCode: 'SD',
      provinceName: '山东省',
      cityName: expect.any(String),
      source: 'project_static_profile',
    })
    expect(itemCodes).toEqual(expect.arrayContaining([
      'water_supply_acceptance',
      'power_acceptance',
      'drainage_acceptance',
    ]))
    expect(itemCodes).not.toContain('heat_supply_acceptance')
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'heat_supply_connection')).toMatchObject({
      selected: false,
      suggested: false,
      confirmationRequired: true,
    })
  })

  it('adds province heat supply acceptance only when project facts mention heat supply connection', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '山东烟台住宅集中供暖交付项目',
      business_type: 'residential',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'residential',
            acceptanceSpecialties: ['集中供暖', '供热接入'],
            locationFacts: { province: '山东省', city: '烟台市' },
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const itemCodes = preview.items.map((item) => item.itemCode)

    expect(itemCodes).toContain('heat_supply_acceptance')
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'heat_supply_connection')).toMatchObject({
      selected: true,
      source: 'project_feature_trigger',
      confirmationRequired: false,
    })
  })

  it('uses province-level shared rule content for pre-certificate covered cities across provinces', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    const scenarios = [
      {
        province: '浙江省',
        city: '宁波市',
        expectedProvinceCode: 'ZJ',
        expectCityProfile: true,
        expectedItems: ['water_supply_acceptance', 'power_acceptance', 'drainage_acceptance'],
        gatedItems: [],
      },
      {
        province: '湖北省',
        city: '宜昌市',
        expectedProvinceCode: 'HB',
        expectCityProfile: false,
        expectedItems: ['water_supply_acceptance', 'power_acceptance', 'drainage_acceptance'],
        gatedItems: [],
      },
      {
        province: '新疆维吾尔自治区',
        city: '乌鲁木齐市',
        expectedProvinceCode: 'XJ',
        expectCityProfile: true,
        expectedItems: ['water_supply_acceptance', 'power_acceptance', 'drainage_acceptance'],
        gatedItems: ['heat_supply_acceptance'],
      },
    ]

    for (const scenario of scenarios) {
      state.executeSQLOne.mockResolvedValueOnce({
        id: `project-${scenario.expectedProvinceCode}`,
        name: `${scenario.province}${scenario.city}住宅交付项目`,
        business_type: 'residential',
        metadata: {
          projectGenerationFacts: {
            projectFeatures: {
              businessTypeCode: 'residential',
              locationFacts: { province: scenario.province, city: scenario.city },
            },
          },
        },
      })

      const preview = await buildAcceptanceTemplatePreview(`project-${scenario.expectedProvinceCode}`)
      const itemCodes = preview.items.map((item) => item.itemCode)

      expect(preview.regionProfile).toMatchObject({
        provinceCode: scenario.expectedProvinceCode,
        provinceName: scenario.province,
        cityName: scenario.expectCityProfile ? expect.any(String) : undefined,
        source: 'project_static_profile',
      })
      expect(itemCodes).toEqual(expect.arrayContaining(scenario.expectedItems))
      for (const gatedItemCode of scenario.gatedItems) {
        expect(itemCodes, `${scenario.city} should not inherit ${gatedItemCode} from region alone`)
          .not.toContain(gatedItemCode)
      }
    }
  })

  it('adds extended specialty acceptance items from project facts and regional rules', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '青岛医院学校供热水土保持项目',
      business_type: 'medical school public',
      project_type: 'hospital campus',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'medical_school_public',
            assetType: '医院 学校 公建',
            acceptanceSpecialties: ['水土保持', '供热', '通信', '卫生', '国家安全'],
            locationFacts: { province: '山东省', city: '青岛市' },
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const names = preview.items.map((item) => item.itemName)

    expect(preview.regionProfile).toMatchObject({
      provinceCode: 'SD',
      cityName: '青岛市',
    })
    expect(names).toEqual(expect.arrayContaining([
      '供热验收',
      '通信接入验收',
      '水土保持设施验收',
      '卫生验收',
      '国家安全事项验收',
    ]))
    expect(preview.items.find((item) => item.itemCode === 'heat_supply_acceptance')).toMatchObject({
      handlingModes: expect.arrayContaining(['供热验收', '供热接入确认']),
    })
  })

  it('uses audited city profiles to add public assembly and sanitation specialties only when relevant', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '北京商业综合体公众聚集场所环卫配套项目',
      business_type: 'commercial',
      project_type: 'mall hotel',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'commercial_office',
            acceptanceSpecialties: ['公众聚集场所', '环卫', '供热', '通信'],
            locationFacts: { province: '北京市', city: '北京市' },
          },
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const names = preview.items.map((item) => item.itemName)

    expect(preview.regionProfile.cityName).toBe('北京市')
    expect(names).toEqual(expect.arrayContaining([
      '公众聚集场所消防安全检查',
      '环卫设施验收',
      '供热验收',
      '通信接入验收',
    ]))
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'public_assembly_place')).toMatchObject({
      selected: true,
      suggested: true,
      source: 'project_feature_trigger',
    })
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'sanitation_facility')).toMatchObject({
      selected: true,
      source: 'project_feature_trigger',
    })
  })

  it('uses acceptance-page confirmed applicability conditions as template generation inputs', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: '北京普通商业项目',
      business_type: 'commercial office',
      project_type: 'office',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'commercial_office',
            locationFacts: { province: '北京市', city: '北京市' },
          },
        },
        acceptanceTemplateApplicability: {
          confirmedConditionCodes: ['public_assembly_place', 'sanitation_facility'],
        },
      },
    })

    const preview = await buildAcceptanceTemplatePreview('project-1')
    const names = preview.items.map((item) => item.itemName)

    expect(names).toEqual(expect.arrayContaining([
      '公众聚集场所消防安全检查',
      '环卫设施验收',
    ]))
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'public_assembly_place')).toMatchObject({
      selected: true,
      source: 'acceptance_page_confirmation',
    })
    expect(preview.applicabilityConditions.find((condition) => condition.conditionCode === 'sanitation_facility')).toMatchObject({
      selected: true,
      source: 'acceptance_page_confirmation',
    })
  })

  it('keeps acceptance seed governed by item, condition, city, and official-source maturity contracts', async () => {
    const { ACCEPTANCE_TIMELINE_TEMPLATE_SEED } = await import('../seeds/acceptanceTimelineTemplateSeed.js')
    const {
      buildAcceptancePolicySourceIssues,
      parseAcceptancePolicyStructuredFacts,
    } = await import('../services/acceptanceTemplatePolicyUpdateService.js')

    const itemCodes = new Set(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool.map((item) => item.itemCode))
    const cityProfiles = ACCEPTANCE_TIMELINE_TEMPLATE_SEED.regionProfiles.filter((profile) => profile.cityName)
    const provinceProfiles = ACCEPTANCE_TIMELINE_TEMPLATE_SEED.regionProfiles.filter((profile) =>
      profile.provinceCode !== 'default' && !profile.cityName,
    )
    const requiredProvinceCodes = [
      'GD',
      'JS',
      'ZJ',
      'SH',
      'AH',
      'FJ',
      'JX',
      'SD',
      'BJ',
      'TJ',
      'HE',
      'SX',
      'NM',
      'LN',
      'JL',
      'HLJ',
      'HA',
      'HB',
      'HN',
      'GX',
      'HI',
      'CQ',
      'SC',
      'GZ',
      'YN',
      'XZ',
      'SN',
      'GS',
      'QH',
      'NX',
      'XJ',
    ]
    const conditionalItemCodes = new Set(
      ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool
        .filter((item) => (item.triggerKeywords?.length ?? 0) > 0 || (item.optionalIndustryCodes?.length ?? 0) > 0)
        .map((item) => item.itemCode),
    )
    const conditionAffectedCodes = new Set(
      ACCEPTANCE_TIMELINE_TEMPLATE_SEED.applicabilityConditions.flatMap((condition) => condition.affectedItemCodes),
    )

    expect(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool.length).toBeGreaterThanOrEqual(28)
    expect(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.dependencies.length).toBeGreaterThanOrEqual(18)
    expect(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.applicabilityConditions.length).toBeGreaterThanOrEqual(10)
    expect(cityProfiles.length).toBeGreaterThanOrEqual(15)
    expect(provinceProfiles.length).toBeGreaterThanOrEqual(requiredProvinceCodes.length)
    expect(provinceProfiles.map((profile) => profile.provinceCode)).toEqual(expect.arrayContaining(requiredProvinceCodes))
    expect(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.applicabilityConditions.every((condition) =>
      condition.affectedItemCodes.every((itemCode) => itemCodes.has(itemCode)),
    )).toBe(true)
    expect([...conditionalItemCodes].every((itemCode) => conditionAffectedCodes.has(itemCode))).toBe(true)
    expect(provinceProfiles.every((profile) => profile.policySources.length > 0)).toBe(true)
    expect(provinceProfiles.every((profile) => buildAcceptancePolicySourceIssues(profile.policySources).length === 0)).toBe(true)
    expect(cityProfiles.every((profile) => profile.policySources.length > 0)).toBe(true)
    expect(cityProfiles.filter((profile) => buildAcceptancePolicySourceIssues(profile.policySources).length === 0).length)
      .toBeGreaterThanOrEqual(10)

    const facts = parseAcceptancePolicyStructuredFacts(`
      建设项目联合验收事项：综合验收、消防验收、人防验收、档案验收、竣工备案。
      条件事项：水土保持设施验收、环卫设施验收。
      综合验收办理结果：联合验收意见书。
      办理部门：工程建设项目联合验收牵头部门。
      办理流程：网上申报、并联核验、出具联合验收意见。
    `)
    expect(facts.acceptanceItems.length).toBeGreaterThanOrEqual(5)
    expect(facts.conditionItems.map((item) => item.itemCode)).toEqual(expect.arrayContaining([
      'water_conservation_acceptance',
      'sanitation_facility_acceptance',
    ]))
    expect(facts.resultDocuments.map((document) => document.documentName)).toContain('联合验收意见书')
    expect(facts.authorityNames).toContain('工程建设项目联合验收牵头部门')
    expect(facts.handlingModes).toEqual(expect.arrayContaining(['网上申报', '并联核验', '出具联合验收意见']))
  })

  it('keeps acceptance city breadth aligned to the pre-certificate 50-city coverage set', async () => {
    const { ACCEPTANCE_TIMELINE_TEMPLATE_SEED } = await import('../seeds/acceptanceTimelineTemplateSeed.js')
    const { GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE } = await import('../seeds/certificateTemplateSeed.js')

    const certificateCities = GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.cityOverrides
      .filter((override) => override.reviewStatus === 'published')
    const acceptanceCities = ACCEPTANCE_TIMELINE_TEMPLATE_SEED.regionProfiles
      .filter((profile) => profile.cityName && profile.reviewStatus === 'published')
    const acceptanceCityKeys = new Set(acceptanceCities.map((profile) => [
      String(profile.cityCode ?? '').toLowerCase(),
      String(profile.cityName),
    ].join(':')))

    expect(certificateCities).toHaveLength(50)
    expect(acceptanceCities.length).toBeGreaterThanOrEqual(certificateCities.length)
    expect(acceptanceCities.filter((profile) => profile.policySources.some((source) => source.sourceLevel === 'city')).length)
      .toBeGreaterThanOrEqual(15)
    expect(certificateCities.every((override) => acceptanceCityKeys.has([
      override.cityCode.toLowerCase(),
      override.cityName,
    ].join(':')))).toBe(true)
  })

  it('keeps every acceptance item deep enough to expose materials result documents departments and prerequisites', async () => {
    const { ACCEPTANCE_TIMELINE_TEMPLATE_SEED } = await import('../seeds/acceptanceTimelineTemplateSeed.js')

    const weakItems = ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool
      .map((item) => ({
        itemCode: item.itemCode,
        materialCount: item.materialNames.length,
        resultDocumentCount: item.resultDocuments.length,
        prerequisiteCount: item.prerequisiteNames.length,
        requirementCount: item.requirementSeeds.length,
        hasAuthority: Boolean(item.authority.trim()),
        hasResponsibleUnit: Boolean(item.responsibleUnit.trim()),
      }))
      .filter((item) =>
        item.materialCount < 4 ||
        item.resultDocumentCount < 1 ||
        item.prerequisiteCount < 2 ||
        item.requirementCount < 3 ||
        !item.hasAuthority ||
        !item.hasResponsibleUnit,
      )

    expect(weakItems).toEqual([])
  })

  it('publishes commercial-grade business profiles for every formal wizard business type', async () => {
    const { ACCEPTANCE_TIMELINE_TEMPLATE_SEED } = await import('../seeds/acceptanceTimelineTemplateSeed.js')
    const { PRODUCT_BUSINESS_TYPE_CODES } = await import('../services/projectScenarioTaxonomyService.js')

    const profileByCode = new Map(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.businessProfiles.map((profile) => [profile.businessTypeCode, profile]))
    const itemCodes = new Set(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool.map((item) => item.itemCode))
    const conditionCodes = new Set(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.applicabilityConditions.map((condition) => condition.conditionCode))

    expect(PRODUCT_BUSINESS_TYPE_CODES).toHaveLength(11)
    expect(ACCEPTANCE_TIMELINE_TEMPLATE_SEED.businessProfiles.map((profile) => profile.businessTypeCode))
      .toEqual(expect.arrayContaining([...PRODUCT_BUSINESS_TYPE_CODES]))
    expect(profileByCode.has('custom')).toBe(false)

    for (const businessTypeCode of PRODUCT_BUSINESS_TYPE_CODES) {
      const profile = profileByCode.get(businessTypeCode)
      expect(profile, `${businessTypeCode} business profile`).toBeTruthy()
      expect(profile?.industryCodes.length).toBeGreaterThanOrEqual(1)
      expect((profile?.defaultItemCodes.length ?? 0) + (profile?.defaultConditionCodes.length ?? 0))
        .toBeGreaterThan(0)
      expect(profile?.defaultItemCodes.every((itemCode) => itemCodes.has(itemCode))).toBe(true)
      expect(profile?.optionalItemCodes.every((itemCode) => itemCodes.has(itemCode))).toBe(true)
      expect(profile?.defaultConditionCodes.every((conditionCode) => conditionCodes.has(conditionCode))).toBe(true)
      expect(profile?.sourcePolicyHints.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('uses wizard business type profiles like region profiles when composing acceptance templates', async () => {
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    const scenarios = [
      {
        businessType: 'general_civil',
        subtype: 'civil_residential',
        expectedItems: ['household_acceptance', 'delivery_filing', 'occupancy_use_release'],
        expectedMaterialSnippet: '住宅',
      },
      {
        businessType: 'hotel',
        subtype: 'civil_office_commercial',
        expectedItems: ['public_assembly_fire_safety_check', 'opening_release', 'delivery_filing'],
        expectedMaterialSnippet: '酒店',
      },
      {
        businessType: 'hospital',
        subtype: 'civil_complex',
        expectedItems: ['health_acceptance', 'environment_acceptance', 'telecom_acceptance'],
        expectedMaterialSnippet: '医疗',
      },
      {
        businessType: 'school',
        subtype: 'civil_complex',
        expectedItems: ['health_acceptance', 'sanitation_facility_acceptance'],
        expectedMaterialSnippet: '校园',
      },
      {
        businessType: 'industrial',
        subtype: 'industrial_general',
        expectedItems: ['environment_acceptance', 'power_acceptance', 'drainage_acceptance'],
        expectedMaterialSnippet: '生产',
      },
      {
        businessType: 'data_center',
        subtype: 'industrial_general',
        expectedItems: ['power_acceptance', 'telecom_acceptance', 'environment_acceptance'],
        expectedMaterialSnippet: '双路市电',
      },
      {
        businessType: 'transportation_hub',
        subtype: 'civil_complex',
        expectedItems: ['traffic_access_acceptance', 'public_assembly_fire_safety_check', 'telecom_acceptance'],
        expectedMaterialSnippet: '客流组织',
      },
      {
        businessType: 'sports_culture',
        subtype: 'civil_complex',
        expectedItems: ['traffic_access_acceptance', 'public_assembly_fire_safety_check', 'sanitation_facility_acceptance'],
        expectedMaterialSnippet: '大型活动',
      },
      {
        businessType: 'tod_upper_cover',
        subtype: 'civil_complex',
        expectedItems: ['traffic_access_acceptance', 'telecom_acceptance', 'delivery_filing'],
        expectedMaterialSnippet: '轨道交通',
      },
      {
        businessType: 'renovation',
        subtype: 'renovation_energy',
        expectedItems: ['energy_acceptance', 'fire_acceptance', 'archive_acceptance'],
        expectedMaterialSnippet: '既有建筑',
      },
      {
        businessType: 'modular_building',
        subtype: 'civil_residential',
        expectedItems: ['household_acceptance', 'delivery_filing'],
        expectedMaterialSnippet: '模块化',
      },
    ]

    for (const scenario of scenarios) {
      state.executeSQLOne.mockResolvedValueOnce({
        id: `project-${scenario.businessType}`,
        name: `${scenario.businessType} acceptance project`,
        business_type: 'custom_should_not_win',
        metadata: {
          projectGenerationFacts: {
            businessType: scenario.businessType,
            businessSubtype: scenario.subtype,
            methodVariantCodes: scenario.businessType === 'modular_building' ? ['modular_mic'] : ['cast_in_situ'],
            projectFeatures: {
              locationFacts: { province: '广东省', city: '广州市' },
            },
          },
        },
      })

      const preview = await buildAcceptanceTemplatePreview(`project-${scenario.businessType}`)
      const itemCodes = preview.items.map((item) => item.itemCode)
      const materialText = preview.items.flatMap((item) => item.materialNames).join(' ')

      expect(preview.businessProfile).toMatchObject({
        businessTypeCode: scenario.businessType,
        source: 'project_generation_facts',
      })
      expect(itemCodes).toEqual(expect.arrayContaining(scenario.expectedItems))
      expect(materialText).toContain(scenario.expectedMaterialSnippet)
    }
  })

  it('uses current project static business type subtype and method facts when composing acceptance preview', async () => {
    const { PRODUCT_BUSINESS_TYPE_CODES } = await import('../services/projectScenarioTaxonomyService.js')
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: 'Beijing hotel delivery project',
      business_type: 'general_civil',
      metadata: {
        projectGenerationFacts: {
          businessType: 'hotel',
          businessSubtype: 'civil_office_commercial',
          methodVariantCodes: ['steel_frame'],
          projectFeatures: {
            locationFacts: {
              provinceCode: 'beijing',
              cityCode: 'beijing',
              province: 'Beijing',
              city: 'Beijing',
            },
          },
        },
      },
    })

    const hotelPreview = await buildAcceptanceTemplatePreview('project-1')
    expect(PRODUCT_BUSINESS_TYPE_CODES).toContain('hotel')
    expect(PRODUCT_BUSINESS_TYPE_CODES).toContain('data_center')
    expect(hotelPreview.businessProfile).toMatchObject({
      businessTypeCode: 'hotel',
      source: 'project_generation_facts',
    })
    expect(hotelPreview.industryProfile.codes).toEqual(expect.arrayContaining(['commercial_office']))
    expect(hotelPreview.applicabilityConditions.find((condition) => condition.conditionCode === 'public_assembly_place'))
      .toMatchObject({
        selected: true,
        source: 'business_profile',
      })
    expect(hotelPreview.items.map((item) => item.itemCode)).toContain('public_assembly_fire_safety_check')
    expect(hotelPreview.items.map((item) => item.itemCode)).toContain('opening_release')
    expect(hotelPreview.dependencies.map((dependency) => dependency.dependencyCode)).toEqual(expect.arrayContaining([
      'DEP-PUBLIC-ASSEMBLY-TO-OPENING-RELEASE',
      'DEP-COMPLETION-TO-OCCUPANCY-USE',
      'DEP-COMPLETION-TO-OWNER-DELIVERY',
    ]))

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: 'Shanghai data center project',
      metadata: {
        projectGenerationFacts: {
          businessType: 'data_center',
          businessSubtype: 'industrial_general',
          methodVariantCodes: ['cast_in_situ'],
          projectFeatures: {
            locationFacts: {
              provinceCode: 'shanghai',
              cityCode: 'shanghai',
              province: 'Shanghai',
              city: 'Shanghai',
            },
          },
        },
      },
    })

    const dataCenterPreview = await buildAcceptanceTemplatePreview('project-1')
    expect(dataCenterPreview.businessProfile.businessTypeCode).toBe('data_center')
    expect(dataCenterPreview.industryProfile.codes).toEqual(expect.arrayContaining(['industrial']))
    expect(dataCenterPreview.applicabilityConditions.find((condition) => condition.conditionCode === 'telecom_connection'))
      .toMatchObject({
        selected: true,
        source: 'business_profile',
      })
    expect(dataCenterPreview.items.map((item) => item.itemCode)).toContain('telecom_acceptance')

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      name: 'Guangzhou residential MiC project',
      metadata: {
        projectGenerationFacts: {
          businessType: 'modular_building',
          businessSubtype: 'civil_residential',
          methodVariantCodes: ['modular_mic'],
          projectFeatures: {
            locationFacts: {
              provinceCode: 'guangdong',
              cityCode: 'guangzhou',
              province: 'Guangdong',
              city: 'Guangzhou',
            },
          },
        },
      },
    })

    const modularPreview = await buildAcceptanceTemplatePreview('project-1')
    expect(modularPreview.industryProfile.codes).toEqual(expect.arrayContaining(['residential']))
    expect(modularPreview.items.map((item) => item.itemCode)).toContain('household_acceptance')
  })

  it('applies selected preview items into catalog plans dependencies and requirements but not records', async () => {
    const {
      ACCEPTANCE_TEMPLATE_SEED_VERSION,
      GENERAL_ACCEPTANCE_TEMPLATE_CODE,
      applyAcceptanceTemplate,
      buildAcceptanceTemplatePreview,
    } = await import('../services/acceptanceTemplateService.js')
    const preview = await buildAcceptanceTemplatePreview('project-1')

    const result = await applyAcceptanceTemplate('project-1', {
      templateCode: GENERAL_ACCEPTANCE_TEMPLATE_CODE,
      seedVersion: ACCEPTANCE_TEMPLATE_SEED_VERSION,
      selectedItemCodes: preview.items.map((item) => item.itemCode),
      selectedDependencyCodes: preview.dependencies.map((dependency) => dependency.dependencyCode),
      selectedRequirementCodes: preview.requirements.map((requirement) => requirement.requirementCode),
      duplicatePolicy: 'skip_existing',
    }, 'user-1')

    const insertedTables = state.inserted.map((entry) => entry.table)
    expect(result.createdPlanIds.length).toBeGreaterThanOrEqual(10)
    expect(result.createdCatalogIds.length).toBeGreaterThanOrEqual(result.createdPlanIds.length)
    expect(result.createdDependencyIds.length).toBeGreaterThan(0)
    expect(result.createdRequirementIds.length).toBeGreaterThan(result.createdPlanIds.length)
    expect(insertedTables).toContain('acceptance_catalog')
    expect(insertedTables).toContain('acceptance_plans')
    expect(insertedTables).toContain('acceptance_dependencies')
    expect(insertedTables).toContain('acceptance_requirements')
    expect(insertedTables).not.toContain('acceptance_records')
    expect(state.client.query).toHaveBeenCalledWith('BEGIN')
    expect(state.client.query).toHaveBeenCalledWith('COMMIT')
  })
})
