import { describe, expect, it } from 'vitest'

import { buildDefaultMasterPlanAssetConsumption } from '../services/defaultMasterPlanAssetConsumptionService.js'

describe('defaultMasterPlanAssetConsumptionService', () => {
  it('reports descendant process seed lineage instead of presenting a rollup as one seed', () => {
    const result = buildDefaultMasterPlanAssetConsumption([{
      clientRowId: 'row-rollup-1',
      rowProjectionMode: 'schedule_row',
      predecessorDependencies: [],
      values: {
        row_projection_mode: 'schedule_row',
        duration_contribution_mode: 'duration_bearing',
        duration_authority: 'system_standard_seed',
        smart_reference_days: 28,
        duration_suggestion: {
          riskP20DurationDays: 24,
          riskP50DurationDays: 28,
          riskP80DurationDays: 34,
        },
        standard_task_metadata: {
          durationAssetMapping: {
            standardWorkDurationAuthorityMode: 'descendant_process_seed_rollup',
            standardWorkDurationSeedStableCode: 'process_rollup:SPC-01-01-01',
            standardWorkDurationSeedSourceStableCodes: [
              'steel_erection',
              'steel_welding_inspection',
            ],
            standardWorkDurationSeedResolverSource: 'active_seed',
            standardWorkDurationSeedResolverVersionId: 'runtime-steel-process-seed-v-test',
            standardWorkDurationSeedResolverVersionIds: ['runtime-steel-process-seed-v-test'],
            standardWorkDurationSeedResolutions: [
              {
                stableCode: 'steel_erection',
                resolverSource: 'active_seed',
                resolverVersionId: 'runtime-steel-process-seed-v-test',
              },
              {
                stableCode: 'steel_welding_inspection',
                resolverSource: 'active_seed',
                resolverVersionId: 'runtime-steel-process-seed-v-test',
              },
            ],
          },
        },
      },
    }])

    expect(result.receipts).toContainEqual(expect.objectContaining({
      consumer: 'wizard_master_plan',
      assetType: 'standard_work_duration_process_rollup',
      stableCode: 'process_rollup:SPC-01-01-01',
      effectiveSource: 'system_stable',
      versionId: 'runtime-steel-process-seed-v-test',
      status: 'effective_applied',
      changedFields: ['duration'],
      lineage: expect.objectContaining({
        authorityMode: 'descendant_process_seed_rollup',
        sourceStableCodes: ['steel_erection', 'steel_welding_inspection'],
        resolverVersionIds: ['runtime-steel-process-seed-v-test'],
        sourceResolutions: expect.arrayContaining([
          expect.objectContaining({
            stableCode: 'steel_erection',
            resolverSource: 'active_seed',
            resolverVersionId: 'runtime-steel-process-seed-v-test',
          }),
        ]),
      }),
    }))
  })
})
