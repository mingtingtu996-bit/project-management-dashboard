import assert from 'node:assert/strict'
import test from 'node:test'
import { sourceExportMetadataBlockers } from './default-master-plan-source-export-metadata.mjs'

test('blocks source export rows that hide retired sources in governance fields', () => {
  const blockers = sourceExportMetadataBlockers({
    export_metadata: {
      exported_at: '2026-07-01T09:00:00.000Z',
      exported_by: 'release-user-1',
      environment: 'staging',
    },
    rows: [
      {
        source: 'managed_frontier_default_master_plan',
        comparisonBasis: ['manual_comparison_scenario'],
        boundaryPolicy: ['low_information_template_draft'],
        decisionReasons: ['legacy_template_reverse_inference'],
        reviewProof: {
          sourceStatus: 'old_template_reverse_inference',
        },
        handoffEvidence: {
          sourceKind: 'option_comparison_package',
        },
      },
    ],
  }, 'writer_result')

  assert.equal(
    blockers.includes('writer_result_retired_or_low_information_default_master_plan_source'),
    true,
  )
})

test('allows staging runtime writer markers as supporting source export evidence', () => {
  const blockers = sourceExportMetadataBlockers({
    export_metadata: {
      exported_at: '2026-07-01T09:00:00.000Z',
      exported_by: 'release-user-1',
      environment: 'staging',
    },
    rows: [
      {
        source: 'default_master_plan_staging_runtime_writer',
        metadata: {
          source: 'default_master_plan_staging_runtime_writer',
          stagingControlledReplay: true,
        },
      },
    ],
  }, 'duration_samples')

  assert.equal(
    blockers.includes('duration_samples_unsupported_default_master_plan_source_label'),
    false,
  )
})

test('allows source export metadata source names without treating them as generation sources', () => {
  const blockers = sourceExportMetadataBlockers({
    export_metadata: {
      source: 'wbs_template_runtime_publications',
      exported_at: '2026-07-01T09:00:00.000Z',
      exported_by: 'release-user-1',
      environment: 'staging',
    },
    wbs_template_runtime_publications: [
      {
        asset_kind: 'default_master_plan',
        project_id: 'project-1',
        runtime_publication_status: 'runtime_published',
        runtime_lineage: {
          generationMode: 'managed_frontier_default_master_plan',
        },
      },
    ],
  }, 'runtime_publications')

  assert.equal(
    blockers.includes('runtime_publications_unsupported_default_master_plan_source_label'),
    false,
  )
})
