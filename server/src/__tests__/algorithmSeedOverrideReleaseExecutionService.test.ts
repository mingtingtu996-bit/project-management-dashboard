import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearAlgorithmSeedResolverCache: vi.fn(),
}))

vi.mock('../services/algorithmSeedResolver.js', () => ({
  clearAlgorithmSeedResolverCache: mocks.clearAlgorithmSeedResolverCache,
}))

import {
  publishApprovedAlgorithmSeedOverride,
} from '../services/algorithmSeedOverrideReleaseExecutionService.js'

const candidateId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const companyId = '33333333-3333-4333-8333-333333333333'
const publisherId = '44444444-4444-4444-8444-444444444444'

function validCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: candidateId,
    seed_type: 'standard_work_duration',
    stable_code: 'process_duration:02-01-03-P07',
    status: 'auto_published',
    project_id: projectId,
    company_id: companyId,
    candidate_source: 'project_history',
    candidate_payload: {
      stableCode: 'process_duration:02-01-03-P07',
      seedRuleId: 'duration:02-01-03-P07',
      ruleVersion: 1,
      isActive: true,
      standardWorkCodes: ['02-01-03-P07'],
      standardCatalogCodePrefixes: ['02-01-03-P07'],
      keywords: ['02-01-03-P07', 'concrete placing'],
      durationCoverageMode: 'direct',
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      applicableGranularity: 'task',
      defaultDaysP20: 5,
      defaultDaysP50: 6,
      defaultDaysP80: 7,
      fixedDays: 1,
      variableDays: 5,
      scaleBasis: 'floor',
      defaultDaysByMethod: { cast_in_place: 6 },
      applicableMethodCodes: ['cast_in_place'],
      projectTypeCodes: ['residential'],
      structureTypeCodes: ['frame_shear_wall'],
      elementVariantCodes: ['beam_slab_or_floor_plate'],
      baselineProductivity: {
        p50PerDay: 0.16,
        unit: 'floor/day',
        basis: 'accepted completed-task duration samples',
      },
      benchmarkBasis: 'project closed-loop override from duration_experience_samples',
      sourceStandard: 'duration_experience_samples',
      sourceVersion: 'project_history',
      sourceClauseRef: 'duration_experience_samples.closed_loop',
      evidenceSourceKeys: ['duration_experience_samples:sample-1'],
      evidenceQuality: {
        source_type: 'runtime_sample',
        source_doc: 'duration_experience_samples',
        source_url: null,
        evidence_source_keys: ['duration_experience_samples:sample-1'],
        last_review_date: '2026-07-10',
        applicable_region_scope: 'project',
      },
      confidence: 'high',
      webVerified: true,
      reviewNeeded: false,
    },
    auto_governance_result: {
      status: 'auto_published',
      runtimePublicationPolicy: {
        localStatusOnly: true,
        runtimeWriteAllowed: false,
      },
    },
    ...overrides,
  }
}

function releaseInput(queryExec: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) {
  return {
    sourcePublicationKey: `algorithm_seed_upgrade_candidates:${candidateId}`,
    companyId,
    projectId,
    publishedBy: publisherId,
    evidenceToken: 'seed-release-evidence-token-1',
    releaseRecordTarget: 'algorithm_seed_overrides:release-record-1',
    rollbackTarget: 'algorithm_seed_versions:previous-version-1',
    consumerVerificationRefs: ['wizard-preview-and-commit:verified'],
    impactMonitoringRefs: ['duration-accuracy-monitoring:armed'],
    rollbackWriterRefs: ['algorithmSeedLearningService.rollbackAlgorithmSeedOverrideRuntimePublication'],
    queryExec,
    ...overrides,
  }
}

describe('algorithmSeedOverrideReleaseExecutionService', () => {
  beforeEach(() => {
    mocks.clearAlgorithmSeedResolverCache.mockReset()
  })

  it('atomically publishes an approved project duration override with release lineage', async () => {
    const queryExec = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('from public.algorithm_seed_upgrade_candidates')) return [validCandidate()]
      if (sql.includes('with deactivated as')) {
        expect(params).toEqual(expect.arrayContaining([
          'standard_work_duration',
          'process_duration:02-01-03-P07',
          projectId,
          companyId,
          candidateId,
          publisherId,
        ]))
        return [{
          id: '55555555-5555-4555-8555-555555555555',
          seed_type: 'standard_work_duration',
          stable_code: 'process_duration:02-01-03-P07',
          scope_type: 'project',
          project_id: projectId,
          company_id: companyId,
          status: 'active',
        }]
      }
      throw new Error(`unexpected sql: ${sql}`)
    })

    const result = await publishApprovedAlgorithmSeedOverride(releaseInput(queryExec))

    expect(result).toEqual(expect.objectContaining({
      status: 'algorithm_seed_override_published',
      seedType: 'standard_work_duration',
      stableCode: 'process_duration:02-01-03-P07',
      scopeType: 'project',
      projectId,
      companyId,
      sourceCandidateId: candidateId,
      writesSeedOverrideRuntime: true,
      writesSystemSeedRuntimeDirectly: false,
      writesTasksOrBaselinesDirectly: false,
      reasons: [],
    }))
    expect(queryExec).toHaveBeenCalledTimes(2)
    expect(String(queryExec.mock.calls[1]?.[0])).toContain('with deactivated as')
    expect(mocks.clearAlgorithmSeedResolverCache).toHaveBeenCalledWith('standard_work_duration')
  })

  it('blocks candidates that have not passed local governance', async () => {
    const queryExec = vi.fn(async () => [validCandidate({ status: 'candidate_only' })])

    const result = await publishApprovedAlgorithmSeedOverride(releaseInput(queryExec))

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain('algorithm_seed_candidate_auto_published_status_required')
    expect(queryExec).toHaveBeenCalledTimes(1)
    expect(mocks.clearAlgorithmSeedResolverCache).not.toHaveBeenCalled()
  })

  it('blocks candidates outside the authenticated company scope', async () => {
    const queryExec = vi.fn(async () => [validCandidate({
      company_id: '66666666-6666-4666-8666-666666666666',
    })])

    const result = await publishApprovedAlgorithmSeedOverride(releaseInput(queryExec))

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain('algorithm_seed_candidate_company_scope_mismatch')
    expect(queryExec).toHaveBeenCalledTimes(1)
  })

  it('blocks project candidates outside the requested project scope', async () => {
    const queryExec = vi.fn(async () => [validCandidate()])

    const result = await publishApprovedAlgorithmSeedOverride(releaseInput(queryExec, {
      projectId: '77777777-7777-4777-8777-777777777777',
    }))

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain('algorithm_seed_candidate_project_scope_mismatch')
    expect(queryExec).toHaveBeenCalledTimes(1)
  })
})
