import { describe, expect, it } from 'vitest'

import { flattenChinaTemplateCatalog } from '../seeds/chinaGb50300TemplateCatalog.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS } from '../seeds/domainWbsTemplateCatalogs.js'
import { STANDARD_WORK_DURATION_SEED } from '../seeds/standardWorkDurationSeed.js'

describe('non-residential domain WBS coverage', () => {
  it('provides process-level catalogs and duration seeds for generic industrial, hub, and venue projects', () => {
    const expectations = [
      {
        templateId: 'china-industrial-plant-specialty',
        businessType: 'industrial',
        expertProfileCode: 'expert_domain_industrial_plant',
        requiredPackSignals: [/主厂房/, /工艺设备基础/, /压缩空气|蒸汽/, /生产设备/, /工业地坪/, /联动试车/],
      },
      {
        templateId: 'china-transportation-hub-specialty',
        businessType: 'transportation_hub',
        expertProfileCode: 'expert_domain_transportation_hub',
        requiredPackSignals: [/大跨度/, /旅客流线/, /客运信息/, /消防/, /站台/, /试运营/],
      },
      {
        templateId: 'china-sports-culture-specialty',
        businessType: 'sports_culture',
        expertProfileCode: 'expert_domain_sports_culture',
        requiredPackSignals: [/大跨度/, /运动面层|舞台/, /声学/, /音响|转播/, /疏散/, /赛事|演出/],
      },
    ]
    const durationSeedCodes = new Set(STANDARD_WORK_DURATION_SEED.flatMap((seed) => seed.standardWorkCodes))

    for (const expectation of expectations) {
      const catalog = DOMAIN_WBS_TEMPLATE_CATALOGS.find((candidate) => candidate.templateId === expectation.templateId)
      expect(catalog, expectation.templateId).toBeTruthy()
      const nodes = flattenChinaTemplateCatalog(catalog!.divisions)
      const itemPacks = nodes.filter((node) => node.categoryType === 'item_work')
      const processRows = nodes.filter((node) => node.categoryType === 'process')
      const itemPackTitles = itemPacks.map((node) => node.name)

      expect(itemPacks.length, `${expectation.templateId} item packs`).toBeGreaterThanOrEqual(7)
      expect(processRows.length, `${expectation.templateId} process rows`).toBeGreaterThanOrEqual(35)
      for (const signal of expectation.requiredPackSignals) {
        expect(itemPackTitles.some((title) => signal.test(title)), `${expectation.templateId} ${signal}`).toBe(true)
      }
      expect(itemPacks.every((node) => {
        const metadata = (node.metadata ?? {}) as Record<string, unknown>
        return Array.isArray(metadata.applicableProjectTypes)
          && metadata.applicableProjectTypes.includes(expectation.businessType)
      }), `${expectation.templateId} canonical business-type applicability`).toBe(true)
      expect(processRows.every((node) => durationSeedCodes.has(node.stableCode)), `${expectation.templateId} process duration seed coverage`).toBe(true)
      let broadDomainProfileCount = 0
      for (const processRow of processRows) {
        const durationSeed = STANDARD_WORK_DURATION_SEED.find((seed) => seed.standardWorkCodes.includes(processRow.stableCode))
        expect(durationSeed?.durationCoverageMode, processRow.stableCode).toBe('direct')
        expect(durationSeed?.sourceVersion, processRow.stableCode).toBe('multi_source_domain_cold_start_2026')
        expect(durationSeed?.benchmarkBasis, processRow.stableCode).toContain(`domain_template=${expectation.templateId}`)
        expect(durationSeed?.sourceClauseRef, processRow.stableCode).toMatch(/\bdomain_profile=expert_domain_[a-z0-9_]+\b/)
        if (durationSeed?.sourceClauseRef?.includes(`domain_profile=${expectation.expertProfileCode}`)) {
          broadDomainProfileCount += 1
        }
      }
      expect(broadDomainProfileCount, `${expectation.templateId} broad domain expert bridge`).toBeGreaterThan(0)
    }
  })
})
