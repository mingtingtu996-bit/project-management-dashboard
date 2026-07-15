import { describe, expect, it } from 'vitest'
import {
  readConstructionOrganizationPlanNetworkRuntimeLineage,
} from '../services/constructionOrganizationRuntimeLineageService.js'

describe('constructionOrganizationRuntimeLineageService', () => {
  it('reads plan-network lineage from the recommended plan option in a persisted scenario selection', () => {
    const lineage = readConstructionOrganizationPlanNetworkRuntimeLineage({
      source: 'construction_organization_scenario_selector',
      factBasis: {
        businessType: 'residential',
      },
      recommendedPlanOption: {
        optionId: 'option-tower-early',
        draftNetworkKey: 'draft-tower-early',
        publicationKey: 'construction-org-plan-network-release:project-1:option-tower-early',
      },
      planOptions: [],
    })

    expect(lineage).toEqual(expect.objectContaining({
      assetKey: 'construction_organization_plan_network',
      publicationKey: 'construction-org-plan-network-release:project-1:option-tower-early',
      runtimePublicationKey: 'construction-org-plan-network-release:project-1:option-tower-early',
      businessType: 'residential',
      draftNetworkKey: 'draft-tower-early',
      optionId: 'option-tower-early',
    }))
  })
})
