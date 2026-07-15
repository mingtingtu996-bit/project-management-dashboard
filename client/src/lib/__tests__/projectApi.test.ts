import { describe, expect, it } from 'vitest'

import { normalizeApiProject } from '@/lib/projectApi'

describe('projectApi', () => {
  it('preserves construction organization metadata from the API project', () => {
    const project = normalizeApiProject({
      id: 'project-1',
      name: 'Example project',
      status: 'active',
      metadata: {
        constructionOrganizationScenario: {
          source: 'construction_organization_scenario_selector',
          recommendedScenarioIds: ['shared_basement_first_then_tower'],
          scenarioRecommendations: {
            newProjectPlanning: {
              actionability: 'actionable',
            },
          },
        },
      },
    })

    expect(project.metadata?.constructionOrganizationScenario).toMatchObject({
      source: 'construction_organization_scenario_selector',
      recommendedScenarioIds: ['shared_basement_first_then_tower'],
    })
  })

  it('discards malformed project metadata shapes', () => {
    const project = normalizeApiProject({
      id: 'project-1',
      name: 'Example project',
      status: 'active',
      metadata: ['not-a-project-metadata-object'] as unknown as Record<string, unknown>,
    })

    expect(project.metadata).toBeUndefined()
  })
})
