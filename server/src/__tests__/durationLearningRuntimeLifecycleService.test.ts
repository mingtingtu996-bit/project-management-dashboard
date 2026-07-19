import { describe, expect, it, vi } from 'vitest'

import {
  collectDurationLearningRuntimeCandidateProposals,
  collectDurationLearningRuntimeMonitoringCandidates,
  createInMemoryDurationLearningRuntimeCollectionCursorStore,
  expandDurationLearningRuntimeCandidateScopes,
  runDurationLearningRuntimeLifecycleSweep,
  type DurationLearningRuntimeCandidateProposal,
} from '../services/durationLearningRuntimeLifecycleService.js'
import { evaluateDurationLearningAssetAutomationPolicy } from '../services/durationLearningAssetAutomationPolicyService.js'
import { createInMemoryDurationContextPolicyLearningCheckpointStore } from '../services/durationContextPolicyLearningCheckpointService.js'

function benchmarkProposal(input: {
  projectId: string
  companyId: string
  industryKey: string
  sampleCount?: number
}): DurationLearningRuntimeCandidateProposal {
  return {
    proposalKey: `benchmark:${input.projectId}`,
    assetKey: 'base_duration_benchmark',
    artifactKey: 'SW-CONCRETE:process:all',
    scope: {
      level: 'project',
      companyId: input.companyId,
      projectId: input.projectId,
    },
    runtimePayload: {
      p50Days: 8,
      p80Days: 11,
      durationDayBasis: 'construction_production_day',
    },
    sourceCandidateRefs: [`duration_benchmarks:${input.projectId}`],
    sourceEvidenceRefs: [`duration_experience_samples:${input.projectId}`],
    sampleCount: input.sampleCount ?? 5,
    projectIds: [input.projectId],
    companyIds: [input.companyId],
    industryKeys: [input.industryKey],
    conflictCount: 0,
    replayPassed: true,
    policyEvaluationRequired: true,
    automationDecision: {
      stage: 'auto_canary',
      autoPromotionAllowed: true,
      manualReviewRequired: false,
      reasonCodes: [],
    },
  }
}

describe('durationLearningRuntimeLifecycleService', () => {
  it('rotates durable source cursors across more than 500/1000 mixed-family groups without losing historical project samples', async () => {
    const lifecycleModule = await import('../services/durationLearningRuntimeLifecycleService.js') as Record<string, any>
    const collectBatch = lifecycleModule.collectDurationLearningRuntimeCandidateBatch
    expect(collectBatch).toBeTypeOf('function')
    if (typeof collectBatch !== 'function') return

    const createBenchmarkRow = (index: number, projectId = `benchmark-project-${index}`) => ({
      id: `benchmark-row-${index}-${projectId}`,
      benchmark_key: `benchmark-${String(index).padStart(4, '0')}`,
      company_id: `company-${index % 8}`,
      project_id: projectId,
      business_type: index % 2 === 0 ? 'general_civil' : 'industrial',
      sample_count: 20,
      p50_days: 8,
      p80_days: 11,
      duration_day_basis: 'construction_production_day',
      metadata: { real_outcome_count: 20, replay_case_count: 20, observation_window_days: 90 },
    })
    const createSeedRow = (seedType: 'standard_work_duration' | 'special_work_duration', index: number) => ({
      id: `${seedType}-row-${index}`,
      seed_type: seedType,
      stable_code: `${seedType}-${String(index).padStart(4, '0')}`,
      company_id: `company-${index % 8}`,
      project_id: `${seedType}-project-${index}`,
      business_type: index % 2 === 0 ? 'general_civil' : 'industrial',
      sample_count: 20,
      candidate_payload: seedType === 'special_work_duration'
        ? { nodes: [{ sourceId: 'node-1', referenceDays: 8 }] }
        : { p50Days: 8, p80Days: 11, durationDayBasis: 'construction_production_day' },
      evidence_summary: { realOutcomeCount: 20, replayCaseCount: 20, observationWindowDays: 90 },
    })
    const createNetworkRow = (
      assetKey: 'special_work_duration_seed' | 'wbs_reference_days' | 'dependency_rule_candidate' | 'critical_path_rule_candidate',
      index: number,
    ) => {
      const suffix = String(index).padStart(4, '0')
      const metadata = assetKey === 'special_work_duration_seed'
        ? {
            template_id: `special-template-${suffix}`,
            duration_candidate_nodes: [{ sourceId: 'node-1', referenceDays: 8 }],
            duration_day_unit: 'construction_production_day',
            sample_count: 20,
          }
        : assetKey === 'wbs_reference_days'
          ? {
              template_id: `wbs-template-${suffix}`,
              nodes: [{ sourceId: 'node-1', suggestedReferenceDays: 8 }],
              day_count_basis: 'construction_production_day',
              production_day_conversion_applied: true,
              sample_task_count: 20,
            }
          : assetKey === 'dependency_rule_candidate'
            ? {
                predecessor_stable_code: `dependency-from-${suffix}`,
                successor_stable_code: `dependency-to-${suffix}`,
                dependency_type: 'FS',
                suggested_lag_days: 0,
                duration_day_unit: 'construction_production_day',
                construction_calendar: 'default-production-calendar',
                sample_count: 20,
              }
            : {
                auto_task_stable_codes: [`critical-${suffix}-a`, `critical-${suffix}-b`],
                primary_chain_stable_codes: [`critical-${suffix}-a`, `critical-${suffix}-b`],
                critical_task_count: 20,
              }
      return {
        id: `${assetKey}-row-${index}`,
        asset_key: assetKey,
        outcome_status: 'accepted',
        learning_scope: 'project',
        company_id: `company-${index % 8}`,
        project_id: `${assetKey}-project-${index}`,
        business_type: index % 2 === 0 ? 'general_civil' : 'industrial',
        metadata,
      }
    }

    const sourceRowsByStream = new Map<string, Array<Record<string, unknown>>>([
      ['benchmark:base_duration_benchmark', Array.from({ length: 501 }, (_, index) => createBenchmarkRow(index))],
      ['seed:standard_work_duration_seed', Array.from({ length: 501 }, (_, index) => createSeedRow('standard_work_duration', index))],
      ['seed:special_work_duration_seed', Array.from({ length: 501 }, (_, index) => createSeedRow('special_work_duration', index))],
      ['network:special_work_duration_seed', Array.from({ length: 1001 }, (_, index) => createNetworkRow('special_work_duration_seed', index))],
      ['network:wbs_reference_days', Array.from({ length: 1001 }, (_, index) => createNetworkRow('wbs_reference_days', index))],
      ['network:dependency_rule_candidate', Array.from({ length: 1001 }, (_, index) => createNetworkRow('dependency_rule_candidate', index))],
      ['network:critical_path_rule_candidate', Array.from({ length: 1001 }, (_, index) => createNetworkRow('critical_path_rule_candidate', index))],
    ])
    sourceRowsByStream.get('benchmark:base_duration_benchmark')?.push(
      createBenchmarkRow(500, 'benchmark-project-historical'),
    )

    const groupKeyForRow = (streamKey: string, row: Record<string, any>) => {
      if (streamKey.startsWith('benchmark:')) return row.benchmark_key
      if (streamKey.startsWith('seed:')) return row.stable_code
      if (streamKey === 'network:special_work_duration_seed' || streamKey === 'network:wbs_reference_days') {
        return row.metadata.template_id
      }
      if (streamKey === 'network:dependency_rule_candidate') {
        return `${row.metadata.predecessor_stable_code}->${row.metadata.successor_stable_code}:${row.metadata.dependency_type}`
      }
      return JSON.stringify([...new Set([
        ...(row.metadata.auto_task_stable_codes ?? []),
        ...(row.metadata.primary_chain_stable_codes ?? []),
      ])].sort())
    }
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const marker = sql.match(/duration-learning-collector:(discover|history):([^*\s]+)/)
      if (!marker) return [] as T[]
      const [, operation, streamKey] = marker
      const rows = sourceRowsByStream.get(streamKey) ?? []
      if (operation === 'discover') {
        const after = String(params[0] ?? '')
        const limit = Number(params[1] ?? 25)
        return [...new Set(rows.map((row) => groupKeyForRow(streamKey, row)))]
          .sort()
          .filter((groupKey) => groupKey > after)
          .slice(0, limit)
          .map((collector_group_key) => ({ collector_group_key })) as T[]
      }
      const selected = new Set((params[0] as string[] | undefined) ?? [])
      return rows.filter((row) => selected.has(groupKeyForRow(streamKey, row))) as T[]
    }

    let cursorState: Record<string, any> = { version: 0, positions: {} }
    const seenArtifacts = new Set<string>()
    const seenAssetKeys = new Set<string>()
    const seenSourceCandidateRefs = new Set<string>()
    let firstArtifactAfterRestart = ''
    for (let sweep = 0; sweep < 45; sweep += 1) {
      if (sweep === 20) cursorState = JSON.parse(JSON.stringify(cursorState))
      const batch = await collectBatch(queryExec, cursorState)
      if (sweep === 20) firstArtifactAfterRestart = batch.candidates[0]?.artifactKey ?? ''
      for (const proposal of batch.candidates) {
        seenArtifacts.add(proposal.artifactKey)
        seenAssetKeys.add(proposal.assetKey)
        for (const sourceRef of proposal.sourceCandidateRefs) seenSourceCandidateRefs.add(sourceRef)
      }
      cursorState = batch.nextCursorState
    }

    expect(firstArtifactAfterRestart).not.toBe('benchmark-0000')
    expect(seenAssetKeys).toEqual(new Set([
      'base_duration_benchmark',
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
    ]))
    expect(seenArtifacts).toContain('benchmark-0500')
    expect(seenArtifacts).toContain('standard_work_duration-0500')
    expect(seenArtifacts).toContain('special-template-1000')
    expect(seenArtifacts).toContain('wbs-template-1000')
    expect(seenArtifacts).toContain('dependency-from-1000->dependency-to-1000:FS')
    expect(seenSourceCandidateRefs).toContain('duration_plan_network_outcomes:critical_path_rule_candidate-row-1000')

    const wrappedBatch = await collectBatch(queryExec, {
      version: cursorState.version,
      positions: {
        ...cursorState.positions,
        'benchmark:base_duration_benchmark': {
          lastGroupKey: 'benchmark-0499',
          wrapCount: 0,
        },
      },
    })
    const lastBenchmark = wrappedBatch.candidates.filter((candidate: any) => (
      candidate.artifactKey === 'benchmark-0500'
    ))
    expect(lastBenchmark.map((candidate: any) => candidate.projectIds[0])).toEqual(expect.arrayContaining([
      'benchmark-project-500',
      'benchmark-project-historical',
    ]))
  })

  it('enforces a production sweep budget instead of multiplying 25 artifacts by 256 project rows per source stream', async () => {
    const lifecycleModule = await import('../services/durationLearningRuntimeLifecycleService.js') as Record<string, any>
    const collectBatch = lifecycleModule.collectDurationLearningRuntimeCandidateBatch
    const budgets = lifecycleModule.DURATION_LEARNING_RUNTIME_SWEEP_BUDGETS
    expect(collectBatch).toBeTypeOf('function')
    expect(budgets).toEqual(expect.objectContaining({
      projectProposalsPerSourceStream: 64,
      projectProposalsTotal: 448,
      explicitScopeProposalsTotal: 21,
      candidateProposalsTotal: 469,
      expandedProposalsTotal: 1024,
    }))
    if (typeof collectBatch !== 'function') return

    const historyLimits: number[] = []
    const scopeLimits: Array<[number, number, number]> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const marker = sql.match(/duration-learning-collector:(discover|history|scope-buckets|scope-batches):([^*\s]+)/)
      if (!marker) return [] as T[]
      const [, operation, streamKey] = marker
      const artifactKeys = Array.from({ length: 25 }, (_, index) => `${streamKey}-artifact-${String(index).padStart(2, '0')}`)
      if (operation === 'discover') {
        const after = String(params[0] ?? '')
        const limit = Number(params[1] ?? 25)
        return artifactKeys
          .filter((artifactKey) => artifactKey > after)
          .slice(0, limit)
          .map((collector_group_key) => ({ collector_group_key })) as T[]
      }
      if (operation === 'scope-buckets') {
        return [{
          selected_company_id: 'budget-company',
          selected_industry_key: 'general_civil',
          company_selector_wrapped: false,
          industry_selector_wrapped: false,
        }] as T[]
      }
      if (operation === 'scope-batches') {
        scopeLimits.push([Number(params[6]), Number(params[7]), Number(params[8])])
        return [] as T[]
      }

      const selectedArtifacts = params[0] as string[]
      const limit = Number(params[2] ?? 0)
      historyLimits.push(limit)
      return Array.from({ length: limit }, (_, index) => {
        const artifactKey = selectedArtifacts[index % selectedArtifacts.length]
        const projectId = `${streamKey}-project-${index}`
        const common = {
          id: `${streamKey}-row-${index}`,
          collector_group_key: artifactKey,
          collector_scope_target: 'project',
          collector_scope_page_rank: index + 1,
          collector_scope_wrapped: false,
          company_id: `company-${index % 20}`,
          project_id: projectId,
          business_type: index % 2 === 0 ? 'general_civil' : 'industrial',
        }
        if (streamKey.startsWith('benchmark:')) {
          return {
            ...common,
            benchmark_key: artifactKey,
            sample_count: 4,
            p50_days: 8,
            p80_days: 11,
            duration_day_basis: 'construction_production_day',
            metadata: { real_outcome_count: 2, replay_case_count: 4, observation_window_days: 120 },
          }
        }
        if (streamKey.startsWith('seed:')) {
          const seedType = streamKey.includes('standard_work') ? 'standard_work_duration' : 'special_work_duration'
          return {
            ...common,
            seed_type: seedType,
            stable_code: artifactKey,
            sample_count: 4,
            candidate_payload: seedType === 'special_work_duration'
              ? { nodes: [{ sourceId: 'shared-node', referenceDays: 8 }] }
              : { p50Days: 8, p80Days: 11, durationDayBasis: 'construction_production_day' },
            evidence_summary: { realOutcomeCount: 2, replayCaseCount: 4, observationWindowDays: 120 },
          }
        }
        const assetKey = streamKey.slice('network:'.length)
        const metadata = assetKey === 'special_work_duration_seed'
          ? { template_id: artifactKey, duration_candidate_nodes: [{ sourceId: 'shared-node', referenceDays: 8 }], duration_day_unit: 'construction_production_day', sample_count: 4 }
          : assetKey === 'wbs_reference_days'
            ? { template_id: artifactKey, nodes: [{ sourceId: 'shared-node', suggestedReferenceDays: 8 }], day_count_basis: 'construction_production_day', production_day_conversion_applied: true, sample_task_count: 4 }
            : assetKey === 'dependency_rule_candidate'
              ? { predecessor_stable_code: `${artifactKey}-from`, successor_stable_code: `${artifactKey}-to`, dependency_type: 'FS', suggested_lag_days: 0, duration_day_unit: 'construction_production_day', construction_calendar: 'default-production-calendar', sample_count: 4 }
              : { auto_task_stable_codes: [`${artifactKey}-a`, `${artifactKey}-b`], primary_chain_stable_codes: [`${artifactKey}-a`, `${artifactKey}-b`], critical_task_count: 4 }
        return { ...common, asset_key: assetKey, outcome_status: 'accepted', learning_scope: 'project', metadata }
      }) as T[]
    }

    const batch = await collectBatch(queryExec)
    const expanded = expandDurationLearningRuntimeCandidateScopes(batch.candidates)

    expect(historyLimits).toHaveLength(7)
    expect(new Set(historyLimits)).toEqual(new Set([budgets.projectProposalsPerSourceStream]))
    expect(scopeLimits).toHaveLength(7)
    expect(new Set(scopeLimits.map((limits) => limits.join(':')))).toEqual(new Set(['40:150:250']))
    expect(batch.candidates.length).toBeLessThanOrEqual(budgets.candidateProposalsTotal)
    expect(expanded.length).toBeLessThanOrEqual(budgets.expandedProposalsTotal)
  })

  it('uses independent project/company/industry/global scope buckets so 20x40 evidence is both globally diverse and company-complete across restarts', async () => {
    const lifecycleModule = await import('../services/durationLearningRuntimeLifecycleService.js') as Record<string, any>
    const collectBatch = lifecycleModule.collectDurationLearningRuntimeCandidateBatch
    expect(collectBatch).toBeTypeOf('function')
    if (typeof collectBatch !== 'function') return

    const companyIds = Array.from({ length: 20 }, (_, index) => `company-${String(index + 1).padStart(2, '0')}`)
    const projectRows = companyIds.flatMap((companyId, companyIndex) => (
      Array.from({ length: 40 }, (_, projectIndex) => ({
        companyId,
        projectId: `${companyId}-project-${String(projectIndex + 1).padStart(2, '0')}`,
        industryKey: companyIndex < 10 ? 'general_civil' : 'industrial',
      }))
    ))

    const streamFixtures = new Map<string, {
      artifactKey: string
      assetKey: string
      rows: Array<Record<string, any>>
    }>([
      ['benchmark:base_duration_benchmark', {
        artifactKey: 'diverse-benchmark-artifact',
        assetKey: 'base_duration_benchmark',
        rows: projectRows.map((scope, index) => ({
          id: `benchmark-diverse-${index}`,
          collector_group_key: 'diverse-benchmark-artifact',
          benchmark_key: 'diverse-benchmark-artifact',
          company_id: scope.companyId,
          project_id: scope.projectId,
          business_type: scope.industryKey,
          sample_count: 4,
          p50_days: 8,
          p80_days: 11,
          duration_day_basis: 'construction_production_day',
          updated_at: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
          metadata: {
            task_ids: [`${scope.projectId}-task-a`, `${scope.projectId}-task-b`],
            real_outcome_count: 2,
            replay_case_count: 4,
            observation_window_days: 120,
            mae_before: 8,
            mae_after: 6,
            conflict_rate: 0,
            overcompensation_rate: 0,
            rollback_ready: true,
            tenant_scope_valid: true,
          },
        })),
      }],
      ['seed:standard_work_duration_seed', {
        artifactKey: 'diverse-standard-work-seed',
        assetKey: 'standard_work_duration_seed',
        rows: projectRows.map((scope, index) => ({
          id: `seed-diverse-${index}`,
          collector_group_key: 'diverse-standard-work-seed',
          seed_type: 'standard_work_duration',
          stable_code: 'diverse-standard-work-seed',
          company_id: scope.companyId,
          project_id: scope.projectId,
          business_type: scope.industryKey,
          sample_count: 4,
          updated_at: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
          candidate_payload: {
            p50Days: 8,
            p80Days: 11,
            durationDayBasis: 'construction_production_day',
          },
          evidence_summary: {
            task_ids: [`${scope.projectId}-task-a`, `${scope.projectId}-task-b`],
            real_outcome_count: 2,
            replay_case_count: 4,
            observation_window_days: 120,
            mae_before: 8,
            mae_after: 6,
            conflict_rate: 0,
            overcompensation_rate: 0,
            rollback_ready: true,
            tenant_scope_valid: true,
          },
        })),
      }],
      ['network:wbs_reference_days', {
        artifactKey: 'diverse-wbs-reference',
        assetKey: 'wbs_reference_days',
        rows: projectRows.map((scope, index) => ({
          id: `network-diverse-${index}`,
          collector_group_key: 'diverse-wbs-reference',
          asset_key: 'wbs_reference_days',
          outcome_status: 'accepted',
          learning_scope: 'project',
          company_id: scope.companyId,
          project_id: scope.projectId,
          business_type: scope.industryKey,
          observed_at: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
          metadata: {
            template_id: 'diverse-wbs-reference',
            nodes: [{ sourceId: 'shared-node', suggestedReferenceDays: 8 }],
            day_count_basis: 'construction_production_day',
            production_day_conversion_applied: true,
            sample_task_count: 4,
            task_ids: [`${scope.projectId}-task-a`, `${scope.projectId}-task-b`],
            replay_case_count: 4,
            observation_window_days: 120,
            mae_before: 8,
            mae_after: 6,
            conflict_rate: 0,
            overcompensation_rate: 0,
            rollback_ready: true,
            tenant_scope_valid: true,
          },
        })),
      }],
    ])
    const projectSqlByStream = new Map<string, string>()
    const scopeSqlByStream = new Map<string, string>()

    const keysetPage = <T extends Record<string, any>>(
      rows: T[],
      after: string,
      limit: number,
      key: (row: T) => string,
    ) => {
      const ordered = [...rows].sort((left, right) => key(left).localeCompare(key(right)))
      const tail = ordered.filter((row) => key(row) > after)
      const wrapped = after !== '' && tail.length < Math.min(limit, ordered.length)
      const page = [...tail, ...(wrapped ? ordered.filter((row) => key(row) <= after) : [])].slice(0, limit)
      return { page, wrapped }
    }
    const diversityPage = <T extends Record<string, any>>(
      rows: T[],
      epoch: number,
      limit: number,
    ) => {
      const byIndustryCompany = new Map<string, T[]>()
      for (const row of rows) {
        const bucket = `${row.business_type}\u0000${row.company_id}`
        const values = byIndustryCompany.get(bucket) ?? []
        values.push(row)
        byIndustryCompany.set(bucket, values)
      }
      for (const values of byIndustryCompany.values()) {
        values.sort((left, right) => left.project_id.localeCompare(right.project_id))
      }
      const industries = [...new Set(rows.map((row) => row.business_type))].sort()
      const companiesByIndustry = new Map(industries.map((industry) => [
        industry,
        [...new Set(rows.filter((row) => row.business_type === industry).map((row) => row.company_id))].sort(),
      ]))
      const selected: T[] = []
      const maxProjectsPerBucket = Math.max(0, ...[...byIndustryCompany.values()].map((values) => values.length))
      const maxCompaniesPerIndustry = Math.max(0, ...[...companiesByIndustry.values()].map((values) => values.length))
      for (let projectRound = 0; projectRound < maxProjectsPerBucket && selected.length < limit; projectRound += 1) {
        for (let companyRound = 0; companyRound < maxCompaniesPerIndustry && selected.length < limit; companyRound += 1) {
          for (const industry of industries) {
            const companyId = companiesByIndustry.get(industry)?.[companyRound]
            if (!companyId) continue
            const bucket = byIndustryCompany.get(`${industry}\u0000${companyId}`) ?? []
            const row = bucket[(projectRound + epoch) % Math.max(1, bucket.length)]
            if (row && !selected.includes(row)) selected.push(row)
            if (selected.length >= limit) break
          }
        }
      }
      return selected
    }

    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const marker = sql.match(/duration-learning-collector:(discover|history|scope-buckets|scope-batches):([^*\s]+)/)
      if (!marker) return [] as T[]
      const [, operation, streamKey] = marker
      const fixture = streamFixtures.get(streamKey)
      if (!fixture) return [] as T[]
      if (operation === 'discover') {
        const after = String(params[0] ?? '')
        return (fixture.artifactKey > after ? [{ collector_group_key: fixture.artifactKey }] : []) as T[]
      }
      if (operation === 'scope-buckets') {
        const afterCompany = String(params[1] ?? '')
        const afterIndustry = String(params[2] ?? '')
        const companies = [...new Set(fixture.rows.map((row) => row.company_id))].sort()
        const industries = [...new Set(fixture.rows.map((row) => row.business_type))].sort()
        const selectedCompany = companies.find((value) => value > afterCompany) ?? companies[0]
        const selectedIndustry = industries.find((value) => value > afterIndustry) ?? industries[0]
        return [{
          selected_company_id: selectedCompany,
          selected_industry_key: selectedIndustry,
          company_selector_wrapped: afterCompany !== '' && selectedCompany <= afterCompany,
          industry_selector_wrapped: afterIndustry !== '' && selectedIndustry <= afterIndustry,
        }] as T[]
      }
      if (operation === 'history') {
        projectSqlByStream.set(streamKey, sql)
        const selectedArtifacts = new Set((params[0] as string[] | undefined) ?? [])
        const cursorByArtifact = (params[1] ?? {}) as Record<string, string>
        const projectLimit = Number(params[2] ?? 64)
        const selectedRows = fixture.rows.filter((row) => selectedArtifacts.has(row.collector_group_key))
        const projectPage = keysetPage(
          selectedRows,
          String(cursorByArtifact[fixture.artifactKey] ?? ''),
          projectLimit,
          (row) => row.project_id,
        )
        return projectPage.page.map((row, index) => ({
          ...row,
          collector_scope_target: 'project',
          collector_scope_id: row.project_id,
          collector_scope_cursor_value: row.project_id,
          collector_scope_page_rank: index + 1,
          collector_scope_wrapped: projectPage.wrapped,
        })) as T[]
      }

      scopeSqlByStream.set(streamKey, sql)
      const selectedCompany = String(params[1] ?? '')
      const companyProjectAfter = String(params[2] ?? '')
      const selectedIndustry = String(params[3] ?? '')
      const industryEpoch = Number(params[4] ?? 0)
      const globalEpoch = Number(params[5] ?? 0)
      const companyLimit = Number(params[6] ?? 40)
      const industryLimit = Number(params[7] ?? 150)
      const globalLimit = Number(params[8] ?? 250)
      const companyPage = keysetPage(
        fixture.rows.filter((row) => row.company_id === selectedCompany),
        companyProjectAfter,
        companyLimit,
        (row) => row.project_id,
      )
      const industryPage = diversityPage(
        fixture.rows.filter((row) => row.business_type === selectedIndustry),
        industryEpoch,
        industryLimit,
      )
      const globalPage = diversityPage(fixture.rows, globalEpoch, globalLimit)
      const tagged = (
        rows: Array<Record<string, any>>,
        target: string,
        scopeId: string,
        wrapped: boolean,
      ) => rows.map((row, index) => ({
        ...row,
        collector_scope_target: target,
        collector_scope_id: scopeId,
        collector_scope_page_rank: index + 1,
        collector_scope_wrapped: wrapped,
      }))
      return [
        ...tagged(companyPage.page, 'company', selectedCompany, companyPage.wrapped),
        ...tagged(industryPage, 'industry', selectedIndustry, false),
        ...tagged(globalPage, 'global', 'global', false),
      ] as T[]
    }

    let cursorState: Record<string, any> = { version: 0, positions: {} }
    const reachedProjects = new Map([...streamFixtures.values()].map((fixture) => [fixture.assetKey, new Set<string>()]))
    const reachedCompanies = new Map([...streamFixtures.values()].map((fixture) => [fixture.assetKey, new Set<string>()]))
    for (let sweep = 0; sweep < 20; sweep += 1) {
      if (sweep === 10) cursorState = JSON.parse(JSON.stringify(cursorState))
      const batch = await collectBatch(queryExec, cursorState)
      cursorState = batch.nextCursorState
      for (const fixture of streamFixtures.values()) {
        const candidates = batch.candidates.filter((candidate: any) => candidate.assetKey === fixture.assetKey)
        const projectCandidates = candidates.filter((candidate: any) => candidate.scope.level === 'project')
        const companyCandidates = candidates.filter((candidate: any) => candidate.scope.level === 'company')
        const industryCandidates = candidates.filter((candidate: any) => candidate.scope.level === 'industry')
        const globalCandidate = candidates.find((candidate: any) => candidate.scope.level === 'global')
        for (const candidate of projectCandidates) reachedProjects.get(fixture.assetKey)?.add(candidate.scope.projectId)
        for (const candidate of companyCandidates) {
          expect(candidate.projectIds.length).toBeGreaterThanOrEqual(40)
          reachedCompanies.get(fixture.assetKey)?.add(candidate.scope.companyId)
        }
        expect(industryCandidates).toHaveLength(1)
        expect(industryCandidates[0].projectIds.length).toBeGreaterThanOrEqual(150)
        expect(industryCandidates[0].companyIds.length).toBeGreaterThanOrEqual(10)
        expect(globalCandidate.projectIds.length).toBeGreaterThanOrEqual(250)
        expect(globalCandidate.companyIds.length).toBeGreaterThanOrEqual(20)
      }
    }

    for (const fixture of streamFixtures.values()) {
      expect(reachedProjects.get(fixture.assetKey)?.size).toBe(800)
      expect(reachedCompanies.get(fixture.assetKey)?.size).toBe(20)
    }
    for (const sql of scopeSqlByStream.values()) {
      expect(sql).toContain('company_scope_page')
      expect(sql).toContain('industry_scope_diversity')
      expect(sql).toContain('global_scope_diversity')
      expect(sql).toContain('collector_scope_target')
    }
    for (const sql of projectSqlByStream.values()) {
      expect(sql).toContain('project_scope_interleaved')
      expect(sql).toContain('stream_project_rank <= $3')
    }
    expect(scopeSqlByStream.size).toBe(3)
    expect(projectSqlByStream.size).toBe(3)

    const finalBatch = await collectBatch(queryExec, cursorState)
    const benchmarkGlobal = finalBatch.candidates.find((candidate: any) => (
      candidate.assetKey === 'base_duration_benchmark' && candidate.scope.level === 'global'
    ))
    expect(benchmarkGlobal).toBeDefined()
    const stableDecision = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T2',
      reuseScope: 'global',
      factSource: 'actual_outcome',
      targetStage: 'stable',
      evidence: {
        validChangeCount: benchmarkGlobal.sampleCount,
        taskIds: benchmarkGlobal.taskIds,
        projectIds: benchmarkGlobal.projectIds,
        companyIds: benchmarkGlobal.companyIds,
        realOutcomeCount: benchmarkGlobal.realOutcomeCount,
        replayCaseCount: benchmarkGlobal.replayCaseCount,
        observationWindowDays: benchmarkGlobal.observationWindowDays,
        ...benchmarkGlobal.automationEvidence,
      },
    })
    expect(stableDecision).toEqual(expect.objectContaining({
      stage: 'auto_stable',
      autoPromotionAllowed: true,
      observed: expect.objectContaining({
        distinctProjectCount: 250,
        distinctCompanyCount: 20,
      }),
    }))
  })

  it('prioritizes active canaries while rotating more than 500 stable drift publications across restarts', async () => {
    const lifecycleModule = await import('../services/durationLearningRuntimeLifecycleService.js') as Record<string, any>
    const collectBatch = lifecycleModule.collectDurationLearningRuntimeMonitoringBatch
    expect(collectBatch).toBeTypeOf('function')
    if (typeof collectBatch !== 'function') return

    const active = [{
      publication_key: 'canary-new',
      asset_key: 'base_duration_benchmark',
      publication_stage: 'canary',
      scope_level: 'project',
      monitoring_window_hours: 72,
      monitoring_elapsed_hours: 80,
      observed_count: 10,
      rejected_observation_count: 0,
      accepted_outcome_count: 0,
      weak_or_rejected_outcome_count: 0,
      accuracy_sample_count: 8,
      mae_before: 8,
      mae_after: 6,
      regression_rate: 0,
    }]
    const stable = Array.from({ length: 600 }, (_, index) => ({
      ...active[0],
      publication_key: `stable-${String(index).padStart(4, '0')}`,
      publication_stage: 'stable',
    }))
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (!sql.includes('duration-learning-monitor-collector')) return [] as T[]
      const activeAfter = String(params[0] ?? '')
      const stableAfter = String(params[1] ?? '')
      const activeLimit = Number(params[2] ?? 400)
      const stableLimit = Number(params[3] ?? 100)
      const selectedActive = active.filter((row) => row.publication_key > activeAfter).slice(0, activeLimit)
      const selectedStable = stable.filter((row) => row.publication_key > stableAfter).slice(0, stableLimit)
      return [
        ...selectedActive.map((row) => ({ ...row, collector_stream_key: 'monitor:active', collector_group_key: row.publication_key })),
        ...selectedStable.map((row) => ({ ...row, collector_stream_key: 'monitor:stable', collector_group_key: row.publication_key })),
      ] as T[]
    }

    let cursorState: Record<string, any> = { version: 0, positions: {} }
    const seenStable = new Set<string>()
    for (let sweep = 0; sweep < 8; sweep += 1) {
      if (sweep === 3) cursorState = JSON.parse(JSON.stringify(cursorState))
      const batch = await collectBatch(queryExec, cursorState)
      if (sweep === 0) expect(batch.candidates[0]?.publicationKey).toBe('canary-new')
      for (const candidate of batch.candidates) {
        if (candidate.publicationStage === 'stable') seenStable.add(candidate.publicationKey)
      }
      cursorState = batch.nextCursorState
    }

    expect(seenStable.size).toBe(600)
    expect(seenStable).toContain('stable-0599')
  })

  it('persists collection cursor state in the protected learning checkpoint ledger across store recreation', async () => {
    const lifecycleModule = await import('../services/durationLearningRuntimeLifecycleService.js') as Record<string, any>
    const createStore = lifecycleModule.createDatabaseDurationLearningRuntimeCollectionCursorStore
    expect(createStore).toBeTypeOf('function')
    if (typeof createStore !== 'function') return

    let checkpointRow: Record<string, unknown> | null = null
    const calls: string[] = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push(sql)
      if (sql.includes('duration-learning-runtime-collection-cursor:read')) {
        return (checkpointRow ? [checkpointRow] : []) as T[]
      }
      const outputPayload = params.find((value) => (
        value && typeof value === 'object' && !Array.isArray(value) && 'positions' in value
      )) as Record<string, unknown>
      const outputHash = params.find((value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value))
      checkpointRow = {
        operation_id: 'duration-learning-runtime-collection-cursor',
        stage_key: 'collection_cursor',
        stage_status: 'succeeded',
        input_hash: params.find((value) => typeof value === 'string' && String(value).startsWith('duration-learning-runtime-collection-cursor/')),
        output_hash: outputHash,
        output_payload: outputPayload,
        attempt_count: 1,
        operation_identity: { cursorSchema: 'duration-learning-runtime-collection-cursor/v1' },
        created_at: '2026-07-18T00:00:00.000Z',
        updated_at: '2026-07-18T00:00:00.000Z',
      }
      return [checkpointRow] as T[]
    }

    const firstStore = createStore(queryExec)
    const initial = await firstStore.load()
    const committed = await firstStore.commit(initial, {
      ...initial,
      positions: {
        'benchmark:base_duration_benchmark': {
          lastGroupKey: 'benchmark-0500',
          wrapCount: 1,
        },
      },
    })
    const restartedStore = createStore(queryExec)
    const reloaded = await restartedStore.load()

    expect(committed.version).toBe(1)
    expect(reloaded).toEqual(committed)
    expect(reloaded.positions['benchmark:base_duration_benchmark']).toEqual({
      lastGroupKey: 'benchmark-0500',
      wrapCount: 1,
    })
    expect(calls.join('\n')).toContain('public.duration_context_policy_learning_checkpoints')
    expect(calls.join('\n')).toContain('collection_cursor')
  })

  it('attributes monitoring only through exact publication, artifact, and consumed-input lineage', async () => {
    let capturedSql = ''
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      capturedSql = sql
      return [] as T[]
    }

    await collectDurationLearningRuntimeMonitoringCandidates(queryExec)

    expect(capturedSql).toContain("source.prediction_context ->> 'runtimePublicationKey'")
    expect(capturedSql).toContain("source.prediction_context ->> 'runtime_publication_key'")
    expect(capturedSql).toContain("source.prediction_context ->> 'publicationKey'")
    expect(capturedSql).toContain("source.prediction_context ->> 'publication_key'")
    expect(capturedSql).toContain("source.prediction_context -> 'runtimePublicationKeys' ? publication.publication_key")
    expect(capturedSql).toContain('from public.duration_learning_runtime_consumptions source')
    expect(capturedSql).toContain('source.asset_key = publication.asset_key')
    expect(capturedSql).toContain('source.artifact_key = publication.artifact_key')
    expect(capturedSql).toContain("source.observation_context ->> 'artifactKey' = publication.artifact_key")
    expect(capturedSql).toContain('source.publication_key = publication.publication_key')
    expect(capturedSql).toContain("source.actual_context -> 'durationLearningRuntimeConsumptions'")
    expect(capturedSql).toContain("consumption ->> 'artifactKey' = publication.artifact_key")
    expect(capturedSql).toContain("source.metadata ->> 'runtime_publication_key' = publication.publication_key")
    expect(capturedSql).toContain("source.metadata ->> 'runtime_publication_artifact_key' = publication.artifact_key")
    expect(capturedSql).toContain('from public.runtime_consumer_observations exact_observation')
    expect(capturedSql).toContain("exact_observation.observation_context -> 'inputTaskIds'")
    expect(capturedSql).toContain("source.metadata -> 'runtime_publication_input_task_ids'")
    expect(capturedSql).toContain("publication.asset_key = 'special_work_duration_seed'")
    expect(capturedSql).toContain("publication.asset_key in ('wbs_reference_days', 'dependency_rule_candidate')")
    expect(capturedSql).toContain('from public.duration_learning_runtime_consumptions exact_consumption')
    expect(capturedSql).not.toContain("publication.asset_key <> 'critical_path_rule_candidate'")
    expect(capturedSql).not.toContain('outcome.publication_key is null')
    expect(capturedSql).not.toContain("observation.observation_context -> 'appliedTaskIds'")
  })

  it('uses schema-real wizard business classification and project-owned company authority in every collector CTE', async () => {
    const calls: string[] = []
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      calls.push(sql)
      if (sql.includes('duration-learning-collector:discover:')) {
        return [{ collector_group_key: 'schema-contract-probe' }] as T[]
      }
      return [] as T[]
    }

    await collectDurationLearningRuntimeCandidateProposals(queryExec)

    const eligibleQueries = calls.filter((sql) => sql.includes('join public.projects project'))
    expect(eligibleQueries.length).toBeGreaterThanOrEqual(7)
    for (const sql of eligibleQueries) {
      expect(sql).not.toContain('project.business_type')
      expect(sql).toContain("project.metadata ->> 'wizard_business_type'")
      expect(sql).toContain("project.metadata ->> 'wizardBusinessType'")
      expect(sql).toContain("project.metadata ->> 'businessType'")
      expect(sql).toContain("project.metadata ->> 'business_type'")
      expect(sql).toContain("project.metadata #>> '{projectGenerationFacts,businessType}'")
      expect(sql).toContain("project.metadata #>> '{projectGenerationFacts,business_type}'")
      expect(sql).toContain('project.project_type')
      expect(sql).toContain('project.building_type')
      expect(sql.indexOf("project.metadata ->> 'wizard_business_type'"))
        .toBeLessThan(sql.indexOf('project.project_type'))
      expect(sql).toContain('project.company_id::text as collector_company_key')
      expect(sql).toContain('project.company_id as project_company_id')
      expect(sql).not.toMatch(/left join public\.projects project/)
    }
    expect(eligibleQueries.some((sql) => sql.includes(
      'benchmark.company_id is null or benchmark.company_id = project.company_id',
    ))).toBe(true)
    expect(eligibleQueries.some((sql) => sql.includes(
      'candidate.company_id is null or candidate.company_id = project.company_id',
    ))).toBe(true)
    expect(eligibleQueries.some((sql) => sql.includes(
      'outcome.company_id is null or outcome.company_id = project.company_id',
    ))).toBe(true)
  })

  it('keeps wizard-only metadata reachable while canonicalizing legacy residential aliases', async () => {
    const lifecycleModule = await import('../services/durationLearningRuntimeLifecycleService.js') as Record<string, any>
    const canonicalizeIndustryKey = lifecycleModule.canonicalizeDurationLearningIndustryKey
    const projectIndustrySqlExpression = lifecycleModule.durationLearningProjectIndustrySqlExpression
    expect(canonicalizeIndustryKey).toBeTypeOf('function')
    expect(projectIndustrySqlExpression).toBeTypeOf('function')
    if (typeof canonicalizeIndustryKey !== 'function' || typeof projectIndustrySqlExpression !== 'function') return

    const sql = projectIndustrySqlExpression('project')
    const wizardOnlyFixture = { metadata: { wizard_business_type: 'general_civil' } }
    const generationFactsOnlyFixture = {
      metadata: { projectGenerationFacts: { businessType: 'industrial' } },
    }
    expect(sql).toContain("project.metadata ->> 'wizard_business_type'")
    expect(sql).toContain("project.metadata #>> '{projectGenerationFacts,businessType}'")
    expect(canonicalizeIndustryKey(wizardOnlyFixture.metadata.wizard_business_type)).toBe('general_civil')
    expect(canonicalizeIndustryKey(
      generationFactsOnlyFixture.metadata.projectGenerationFacts.businessType,
    )).toBe('industrial')
    expect([
      canonicalizeIndustryKey('general_civil'),
      canonicalizeIndustryKey('residential'),
      canonicalizeIndustryKey('civil_residential'),
    ]).toEqual(['general_civil', 'general_civil', 'general_civil'])
    expect(canonicalizeIndustryKey('unknown_legacy_project_type')).toBeNull()
  })

  it('rejects cross-company and orphan project evidence before it can reach any aggregation floor', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes('duration-learning-collector:discover:benchmark:base_duration_benchmark')) {
        return [{ collector_group_key: 'tenant-boundary-probe' }] as T[]
      }
      if (sql.includes('duration-learning-collector:history:benchmark:base_duration_benchmark')) {
        const common = {
          benchmark_key: 'tenant-boundary-probe',
          sample_count: 500,
          p50_days: 8,
          p80_days: 11,
          duration_day_basis: 'construction_production_day',
          business_type: 'general_civil',
          metadata: { real_outcome_count: 500, replay_case_count: 500, observation_window_days: 90 },
        }
        return [{
          ...common,
          id: 'cross-company-row',
          project_id: 'project-b',
          company_id: 'company-a',
          source_company_id: 'company-a',
          project_company_id: 'company-b',
        }, {
          ...common,
          id: 'orphan-project-row',
          project_id: 'missing-project',
          company_id: 'company-a',
          source_company_id: 'company-a',
          project_company_id: null,
        }] as T[]
      }
      return [] as T[]
    }

    const candidates = await collectDurationLearningRuntimeCandidateProposals(queryExec)
    const expanded = expandDurationLearningRuntimeCandidateScopes(candidates)

    expect(candidates).toEqual([])
    expect(expanded.some((proposal) => ['project', 'company', 'global'].includes(proposal.scope.level))).toBe(false)
  })

  it('normalizes canonical database candidates and keeps underpowered evidence in automatic collection', async () => {
    const calls: string[] = []
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      calls.push(sql)
      if (sql.includes('from public.duration_benchmarks')) {
        return [{
          id: 'benchmark-1',
          benchmark_key: 'SW-CONCRETE:process:all',
          company_id: 'c1',
          project_id: 'p1',
          business_type: 'residential',
          sample_count: 5,
          p50_days: 8,
          p80_days: 11,
          duration_day_basis: 'construction_production_day',
          metadata: {
            task_ids: ['t1', 't2'],
            real_outcome_count: 5,
            replay_case_count: 5,
            observation_window_days: 7,
            mae_before: 4,
            mae_after: 3,
            conflict_rate: 0,
            overcompensation_rate: 0,
            rollback_ready: true,
            tenant_scope_valid: true,
          },
        }] as T[]
      }
      if (sql.includes('duration-learning-collector:discover:seed:standard_work_duration_seed')) {
        return [{ collector_group_key: 'seed-contract-probe' }] as T[]
      }
      return [] as T[]
    }

    const proposals = await collectDurationLearningRuntimeCandidateProposals(queryExec)

    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toEqual(expect.objectContaining({
      assetKey: 'base_duration_benchmark',
      artifactKey: 'SW-CONCRETE:process:all',
      scope: { level: 'project', companyId: 'c1', projectId: 'p1' },
      policyEvaluationRequired: true,
      automationDecision: expect.objectContaining({
        stage: 'collecting',
        autoPromotionAllowed: false,
      }),
    }))
    expect(calls.length).toBeGreaterThanOrEqual(9)
    expect(calls.join('\n')).toContain('duration-learning-collector:scope-buckets:benchmark:base_duration_benchmark')
    expect(calls.join('\n')).toContain('duration-learning-collector:scope-batches:benchmark:base_duration_benchmark')
    expect(calls.join('\n')).toContain("candidate.status in ('pending', 'candidate_only', 'auto_published')")
    expect(calls.join('\n')).toContain('project.company_id as resolved_company_id')
    expect(calls.join('\n')).toContain('duration-learning-collector:discover:network:critical_path_rule_candidate')
    expect(calls.join('\n')).not.toContain('outcome.publication_key is null')
  })

  it('does not publish a production candidate while its automatic policy is still collecting', async () => {
    const persistPublication = vi.fn()
    const proposal = benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'residential' })
    proposal.policyEvaluationRequired = true
    proposal.automationDecision = {
      stage: 'collecting',
      autoPromotionAllowed: false,
      manualReviewRequired: false,
      reasonCodes: ['valid_change_count_below_project_canary_floor'],
    }

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
    })

    expect(result.candidateCollecting).toBe(1)
    expect(result.manualFallback).toBe(0)
    expect(persistPublication).not.toHaveBeenCalled()
  })

  it('materializes an industry proposal from real cross-project evidence without prematurely creating a global proposal', () => {
    const proposals = [
      benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'residential' }),
      benchmarkProposal({ projectId: 'p2', companyId: 'c1', industryKey: 'residential' }),
      benchmarkProposal({ projectId: 'p3', companyId: 'c2', industryKey: 'residential' }),
      benchmarkProposal({ projectId: 'p4', companyId: 'c2', industryKey: 'residential' }),
    ]

    const expanded = expandDurationLearningRuntimeCandidateScopes(proposals)

    expect(expanded).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetKey: 'base_duration_benchmark',
        artifactKey: 'SW-CONCRETE:process:all',
        scope: { level: 'industry', industryKey: 'general_civil' },
        sampleCount: 20,
        projectIds: ['p1', 'p2', 'p3', 'p4'],
        companyIds: ['c1', 'c2'],
      }),
    ]))
    expect(expanded.some((proposal) => proposal.scope.level === 'global')).toBe(false)
  })

  it('opens the global learning scope only with cross-industry evidence that satisfies global automation floors', () => {
    const proposals = Array.from({ length: 100 }, (_, projectIndex) => {
      const projectId = `p${projectIndex + 1}`
      const proposal = benchmarkProposal({
        projectId,
        companyId: `c${Math.floor(projectIndex / 10) + 1}`,
        industryKey: projectIndex < 50 ? 'residential' : 'industrial',
        sampleCount: 10,
      })
      proposal.taskIds = Array.from({ length: 5 }, (_, taskIndex) => `${projectId}-t${taskIndex + 1}`)
      proposal.realOutcomeCount = 5
      proposal.replayCaseCount = 10
      proposal.observationWindowDays = 90
      proposal.policyEvaluationRequired = true
      proposal.automationEvidence = {
        maeBefore: 8,
        maeAfter: 6,
        conflictRate: 0,
        overcompensationRate: 0,
        rollbackReady: true,
        tenantScopeValid: true,
      }
      return proposal
    })

    const global = expandDurationLearningRuntimeCandidateScopes(proposals)
      .find((proposal) => proposal.scope.level === 'global')

    expect(global).toEqual(expect.objectContaining({
      scope: { level: 'global' },
      projectIds: expect.arrayContaining(['p1', 'p100']),
      companyIds: ['c1', 'c10', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'],
      industryKeys: ['general_civil', 'industrial'],
      automationDecision: expect.objectContaining({
        reuseScope: 'global',
        targetStage: 'canary',
        stage: 'auto_canary',
        autoPromotionAllowed: true,
      }),
    }))
  })

  it('does not count residential aliases as distinct global industries', () => {
    const aliases = ['general_civil', 'residential', 'civil_residential']
    const proposals = Array.from({ length: 100 }, (_, projectIndex) => benchmarkProposal({
      projectId: `alias-project-${projectIndex + 1}`,
      companyId: `alias-company-${Math.floor(projectIndex / 10) + 1}`,
      industryKey: aliases[projectIndex % aliases.length],
      sampleCount: 10,
    }))

    const expanded = expandDurationLearningRuntimeCandidateScopes(proposals)

    expect(expanded.some((proposal) => proposal.scope.level === 'global')).toBe(false)
    expect(new Set(expanded.flatMap((proposal) => proposal.industryKeys))).toEqual(new Set(['general_civil']))
  })

  it('derives wider-scope benchmark percentiles from pooled project samples instead of averaging project percentiles', () => {
    const proposals = [
      benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'residential', sampleCount: 10 }),
      benchmarkProposal({ projectId: 'p2', companyId: 'c1', industryKey: 'residential', sampleCount: 10 }),
      benchmarkProposal({ projectId: 'p3', companyId: 'c2', industryKey: 'residential', sampleCount: 10 }),
      benchmarkProposal({ projectId: 'p4', companyId: 'c2', industryKey: 'residential', sampleCount: 10 }),
    ]
    const projectSamples = [
      [1, 2, 100],
      [1, 2, 100],
      [1, 2, 100],
      [100, 100, 100],
    ]
    proposals.forEach((proposal, index) => {
      proposal.sampleCount = projectSamples[index].length
      proposal.runtimePayload = {
        p50Days: index === 3 ? 100 : 2,
        p80Days: 100,
        durationDayBasis: 'construction_production_day',
      }
      ;(proposal as any).productionDaySamples = projectSamples[index]
    })

    const industry = expandDurationLearningRuntimeCandidateScopes(proposals)
      .find((proposal) => proposal.scope.level === 'industry')

    expect(industry).toEqual(expect.objectContaining({
      sampleCount: 12,
      runtimePayload: {
        p50Days: 2,
        p80Days: 100,
        durationDayBasis: 'construction_production_day',
      },
    }))
  })

  it('does not allow a caller to bypass the automation policy by setting policyEvaluationRequired false', async () => {
    const persistPublication = vi.fn()
    const proposal = benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'residential' })
    proposal.policyEvaluationRequired = false
    proposal.automationDecision = {
      stage: 'auto_canary',
      autoPromotionAllowed: true,
      manualReviewRequired: false,
      reasonCodes: [],
    }

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
    })

    expect(result.candidateCollecting).toBe(1)
    expect(result.canaryPublished).toBe(0)
    expect(persistPublication).not.toHaveBeenCalled()
  })

  it('preserves signed dependency lead lag while aggregating structural rules', () => {
    const proposals = ['p1', 'p2', 'p3', 'p4'].map((projectId) => ({
      ...benchmarkProposal({ projectId, companyId: 'c1', industryKey: 'residential', sampleCount: 10 }),
      proposalKey: `dependency:${projectId}`,
      assetKey: 'dependency_rule_candidate' as const,
      artifactKey: 'SW-A->SW-B:FS',
      runtimePayload: {
        predecessorCode: 'SW-A',
        successorCode: 'SW-B',
        dependencyType: 'FS',
        lagDays: -2,
        durationDayBasis: 'construction_production_day',
      },
    }))

    const company = expandDurationLearningRuntimeCandidateScopes(proposals)
      .find((proposal) => proposal.scope.level === 'company')

    expect(company?.runtimePayload).toEqual(expect.objectContaining({ lagDays: -2 }))
  })

  it('blocks WBS aggregation when project candidates describe incompatible node sets', () => {
    const proposals = ['p1', 'p2'].map((projectId, index) => ({
      ...benchmarkProposal({ projectId, companyId: 'c1', industryKey: 'residential', sampleCount: 20 }),
      proposalKey: `wbs:${projectId}`,
      assetKey: 'wbs_reference_days' as const,
      artifactKey: 'template-residential',
      runtimePayload: {
        templateId: 'template-residential',
        nodes: [{
          sourceId: index === 0 ? 'structure' : 'fitout',
          suggestedReferenceDays: 20,
        }],
        durationDayBasis: 'construction_production_day',
      },
    }))

    const company = expandDurationLearningRuntimeCandidateScopes(proposals)
      .find((proposal) => proposal.scope.level === 'company')

    expect(company?.blockingReasons).toContain('wbs_reference_days_node_set_incompatible')
  })

  it('uses stable work codes rather than project-specific outcome refs to aggregate critical-path learning', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (!sql.includes('from public.duration_plan_network_outcomes')) return [] as T[]
      return ['p1', 'p2', 'p3', 'p4'].map((projectId) => ({
        id: `critical-${projectId}`,
        asset_key: 'critical_path_rule_candidate',
        outcome_status: 'accepted',
        outcome_ref: `critical_path_cpm:${projectId}:project-specific-hash`,
        learning_scope: 'project',
        company_id: 'c1',
        project_id: projectId,
        business_type: 'residential',
        metadata: {
          auto_task_stable_codes: ['SW-A', 'SW-B'],
          primary_chain_stable_codes: ['SW-A', 'SW-B'],
          critical_task_count: 2,
          replay_case_count: 30,
          observation_window_days: 30,
          mae_before: 4,
          mae_after: 3,
          conflict_rate: 0,
          overcompensation_rate: 0,
          rollback_ready: true,
          tenant_scope_valid: true,
        },
      })) as T[]
    }

    const projectProposals = await collectDurationLearningRuntimeCandidateProposals(queryExec)
    const companyProposals = expandDurationLearningRuntimeCandidateScopes(projectProposals)
      .filter((proposal) => proposal.scope.level === 'company')

    expect(new Set(projectProposals.map((proposal) => proposal.artifactKey)).size).toBe(1)
    expect(companyProposals).toHaveLength(1)
    expect(companyProposals[0]?.runtimePayload).toEqual({ criticalStableCodes: ['SW-A', 'SW-B'] })
  })

  it('keeps dependency outcomes without a construction calendar out of automatic publication', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (!sql.includes('from public.duration_plan_network_outcomes')) return [] as T[]
      return [{
        id: 'dependency-1',
        asset_key: 'dependency_rule_candidate',
        outcome_status: 'accepted',
        learning_scope: 'project',
        company_id: 'c1',
        project_id: 'p1',
        business_type: 'residential',
        metadata: {
          predecessor_stable_code: 'SW-A',
          successor_stable_code: 'SW-B',
          dependency_type: 'FS',
          suggested_lag_days: 2,
          duration_day_unit: 'construction_production_day',
          sample_count: 50,
        },
      }] as T[]
    }

    const proposals = await collectDurationLearningRuntimeCandidateProposals(queryExec)

    expect(proposals[0]?.blockingReasons).toContain('dependency_construction_calendar_required')
  })

  it('accepts production-day WBS reference outcomes even when their reference semantic is also recorded', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (!sql.includes('from public.duration_plan_network_outcomes')) return [] as T[]
      return [{
        id: 'wbs-reference-1',
        asset_key: 'wbs_reference_days',
        outcome_status: 'accepted',
        learning_scope: 'project',
        company_id: 'c1',
        project_id: 'p1',
        business_type: 'residential',
        metadata: {
          template_id: 'template-1',
          day_count_basis: 'construction_production_day',
          reference_day_basis: 'wbs_template_reference_days',
          production_day_conversion_applied: true,
          sample_task_count: 30,
          nodes: [{ sourceId: 'node-1', suggestedReferenceDays: 8 }],
        },
      }] as T[]
    }

    const proposals = await collectDurationLearningRuntimeCandidateProposals(queryExec)

    expect(proposals[0]?.blockingReasons).toEqual([])
  })

  it('publishes a ready learned asset to canary only and preserves complete source lineage', async () => {
    const persistPublication = vi.fn(async (input: any) => ({
      status: 'published' as const,
      publication: {
        publicationKey: input.publicationKey,
        publicationStage: input.stage,
      },
      reasons: [] as [],
    }))
    const promoteCanary = vi.fn()

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [benchmarkProposal({
        projectId: 'p1',
        companyId: 'c1',
        industryKey: 'residential',
      })],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      promoteCanary: promoteCanary as any,
      observedAt: '2026-07-17T00:00:00.000Z',
    })

    expect(result.canaryPublished).toBe(1)
    expect(result.stablePromoted).toBe(0)
    expect(persistPublication).toHaveBeenCalledWith(expect.objectContaining({
      assetKey: 'base_duration_benchmark',
      artifactKey: 'SW-CONCRETE:process:all',
      stage: 'canary',
      scope: { level: 'project', companyId: 'c1', projectId: 'p1' },
      sourceCandidateRefs: ['duration_benchmarks:p1'],
      sourceEvidenceRefs: ['duration_experience_samples:p1'],
    }))
    expect(promoteCanary).not.toHaveBeenCalled()
  })

  it('checkpoints a published proposal so a later sweep reuses it without recounting or rewriting', async () => {
    const checkpointStore = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const persistPublication = vi.fn(async (input: any) => ({
      status: 'published' as const,
      publication: {
        publicationKey: input.publicationKey,
        publicationStage: input.stage,
      },
      reasons: [] as [],
    }))
    const proposal = benchmarkProposal({
      projectId: 'p1',
      companyId: 'c1',
      industryKey: 'residential',
    })

    const first = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-a',
      observedAt: '2026-07-17T00:00:00.000Z',
    })
    const retried = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-b',
      observedAt: '2026-07-18T00:00:00.000Z',
    })

    expect(first.canaryPublished).toBe(1)
    expect(first.candidateCheckpointReused).toBe(0)
    expect(retried.canaryPublished).toBe(0)
    expect(retried.candidateCheckpointReused).toBe(1)
    expect(persistPublication).toHaveBeenCalledTimes(1)
  })

  it('prefers explicit scope-floor aggregates over competing project-page aggregates with a different learned payload', () => {
    const projectProposals = Array.from({ length: 800 }, (_, projectIndex) => {
      const companyIndex = Math.floor(projectIndex / 40)
      const proposal = benchmarkProposal({
        projectId: `p${projectIndex + 1}`,
        companyId: `c${companyIndex + 1}`,
        industryKey: companyIndex < 10 ? 'general_civil' : 'industrial',
        sampleCount: 4,
      })
      proposal.runtimePayload = {
        p50Days: 8 + (projectIndex % 3),
        p80Days: 12,
        durationDayBasis: 'construction_production_day',
      }
      return proposal
    })
    const explicitCompany = {
      ...benchmarkProposal({ projectId: 'explicit-company', companyId: 'c1', industryKey: 'general_civil', sampleCount: 160 }),
      proposalKey: 'explicit-company-floor',
      scope: { level: 'company' as const, companyId: 'c1' },
      runtimePayload: { p50Days: 21, p80Days: 24, durationDayBasis: 'construction_production_day' },
      sourceCandidateRefs: Array.from({ length: 40 }, (_, index) => `company-floor:${index}`),
      projectIds: Array.from({ length: 40 }, (_, index) => `p${index + 1}`),
    }
    const explicitIndustry = {
      ...explicitCompany,
      proposalKey: 'explicit-industry-floor',
      scope: { level: 'industry' as const, industryKey: 'general_civil' },
      runtimePayload: { p50Days: 22, p80Days: 25, durationDayBasis: 'construction_production_day' },
      sourceCandidateRefs: Array.from({ length: 150 }, (_, index) => `industry-floor:${index}`),
      projectIds: Array.from({ length: 150 }, (_, index) => `p${index + 1}`),
      companyIds: Array.from({ length: 10 }, (_, index) => `c${index + 1}`),
    }
    const explicitGlobal = {
      ...explicitIndustry,
      proposalKey: 'explicit-global-floor',
      scope: { level: 'global' as const },
      runtimePayload: { p50Days: 23, p80Days: 26, durationDayBasis: 'construction_production_day' },
      sourceCandidateRefs: Array.from({ length: 250 }, (_, index) => `global-floor:${index}`),
      projectIds: Array.from({ length: 250 }, (_, index) => `p${index + 1}`),
      companyIds: Array.from({ length: 20 }, (_, index) => `c${index + 1}`),
      industryKeys: ['general_civil', 'industrial'],
    }

    const expanded = expandDurationLearningRuntimeCandidateScopes([
      ...projectProposals,
      explicitCompany,
      explicitIndustry,
      explicitGlobal,
    ])
    const company = expanded.filter((proposal) => (
      proposal.assetKey === 'base_duration_benchmark'
      && proposal.artifactKey === 'SW-CONCRETE:process:all'
      && proposal.scope.level === 'company'
      && proposal.scope.companyId === 'c1'
    ))
    const industry = expanded.filter((proposal) => (
      proposal.assetKey === 'base_duration_benchmark'
      && proposal.artifactKey === 'SW-CONCRETE:process:all'
      && proposal.scope.level === 'industry'
      && proposal.scope.industryKey === 'general_civil'
    ))
    const global = expanded.filter((proposal) => (
      proposal.assetKey === 'base_duration_benchmark'
      && proposal.artifactKey === 'SW-CONCRETE:process:all'
      && proposal.scope.level === 'global'
    ))

    expect(company).toEqual([expect.objectContaining({
      runtimePayload: explicitCompany.runtimePayload,
      sourceCandidateRefs: expect.arrayContaining(explicitCompany.sourceCandidateRefs),
      projectIds: expect.arrayContaining(explicitCompany.projectIds),
    })])
    expect(company[0].sourceCandidateRefs).toHaveLength(40)
    expect(company[0].projectIds).toHaveLength(40)
    expect(industry).toEqual([expect.objectContaining({
      runtimePayload: explicitIndustry.runtimePayload,
      sourceCandidateRefs: expect.arrayContaining(explicitIndustry.sourceCandidateRefs),
      projectIds: expect.arrayContaining(explicitIndustry.projectIds),
    })])
    expect(industry[0].sourceCandidateRefs).toHaveLength(150)
    expect(industry[0].projectIds).toHaveLength(150)
    expect(global).toEqual([expect.objectContaining({
      runtimePayload: explicitGlobal.runtimePayload,
      sourceCandidateRefs: expect.arrayContaining(explicitGlobal.sourceCandidateRefs),
      projectIds: expect.arrayContaining(explicitGlobal.projectIds),
    })])
    expect(global[0].sourceCandidateRefs).toHaveLength(250)
    expect(global[0].projectIds).toHaveLength(250)
  })

  it('reports partial candidate failures so retries reuse prior successes and complete only the failed item', async () => {
    const checkpointStore = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const firstProposal = benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'general_civil' })
    const secondProposal = {
      ...benchmarkProposal({ projectId: 'p2', companyId: 'c1', industryKey: 'general_civil' }),
      artifactKey: 'SW-MASONRY:process:all',
      proposalKey: 'benchmark:p2:masonry',
    }
    const attemptsByArtifact = new Map<string, number>()
    const persistPublication = vi.fn(async (input: any) => {
      const attempts = (attemptsByArtifact.get(input.artifactKey) ?? 0) + 1
      attemptsByArtifact.set(input.artifactKey, attempts)
      if (input.artifactKey === secondProposal.artifactKey && attempts === 1) {
        throw new Error('transient second publication failure')
      }
      return {
        status: 'published' as const,
        publication: { publicationKey: input.publicationKey, publicationStage: input.stage },
        reasons: [] as [],
      }
    })

    const first = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [firstProposal, secondProposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-first',
    })
    const retry = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [firstProposal, secondProposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-retry',
    })

    expect(first.failed).toBe(1)
    expect(first.failureRefs).toEqual([expect.objectContaining({
      phase: 'candidate_publication',
      reference: secondProposal.proposalKey,
      message: 'transient second publication failure',
    })])
    expect(retry.failed).toBe(0)
    expect(retry.candidateCheckpointReused).toBe(1)
    expect(retry.canaryPublished).toBe(1)
    expect(attemptsByArtifact.get(firstProposal.artifactKey)).toBe(1)
    expect(attemptsByArtifact.get(secondProposal.artifactKey)).toBe(2)
  })

  it('commits the source cursor only after a partial publication page is fully recovered', async () => {
    const cursorStore = createInMemoryDurationLearningRuntimeCollectionCursorStore()
    const checkpointStore = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes('duration-learning-collector:discover:benchmark:base_duration_benchmark')) {
        return [{ collector_group_key: 'benchmark-retry-cursor' }] as T[]
      }
      if (sql.includes('duration-learning-collector:history:benchmark:base_duration_benchmark')) {
        return [{
          id: 'benchmark-retry-row',
          benchmark_key: 'benchmark-retry-cursor',
          company_id: 'c1',
          project_id: 'p1',
          business_type: 'general_civil',
          sample_count: 220,
          p50_days: 8,
          p80_days: 11,
          duration_day_basis: 'construction_production_day',
          metadata: {
            task_ids: Array.from({ length: 120 }, (_, index) => `task-${index}`),
            real_outcome_count: 110,
            replay_case_count: 220,
            observation_window_days: 60,
            mae_before: 8,
            mae_after: 6,
            conflict_rate: 0,
            overcompensation_rate: 0,
            rollback_ready: true,
            tenant_scope_valid: true,
          },
        }] as T[]
      }
      return [] as T[]
    }
    let persistAttempt = 0
    const persistPublication = vi.fn(async (input: any) => {
      persistAttempt += 1
      if (persistAttempt === 1) throw new Error('transient page publication failure')
      return {
        status: 'published' as const,
        publication: { publicationKey: input.publicationKey, publicationStage: input.stage },
        reasons: [] as [],
      }
    })

    const first = await runDurationLearningRuntimeLifecycleSweep({
      queryExec,
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'cursor-worker-first',
      collectionCursorStore: cursorStore,
    })
    const afterFailure = await cursorStore.load()
    const retry = await runDurationLearningRuntimeLifecycleSweep({
      queryExec,
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'cursor-worker-retry',
      collectionCursorStore: cursorStore,
    })
    const afterRecovery = await cursorStore.load()

    expect(first.failed).toBe(1)
    expect(first.collectionCursorAdvanced).toBe(false)
    expect(afterFailure).toEqual({ version: 0, positions: {} })
    expect(retry.failed).toBe(0)
    expect(retry.collectionCursorAdvanced).toBe(true)
    expect(afterRecovery.version).toBe(1)
    expect(afterRecovery.positions['benchmark:base_duration_benchmark']?.lastGroupKey)
      .toBe('benchmark-retry-cursor')
    expect(persistPublication).toHaveBeenCalledTimes(2)
  })

  it('creates a new publication checkpoint when the learned payload changes', async () => {
    const checkpointStore = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const persistPublication = vi.fn(async (input: any) => ({
      status: 'published' as const,
      publication: {
        publicationKey: input.publicationKey,
        publicationStage: input.stage,
      },
      reasons: [] as [],
    }))
    const firstProposal = benchmarkProposal({
      projectId: 'p1',
      companyId: 'c1',
      industryKey: 'residential',
    })
    const changedProposal = {
      ...firstProposal,
      runtimePayload: {
        ...firstProposal.runtimePayload,
        p50Days: 9,
      },
    }

    await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [firstProposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-a',
    })
    const changed = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [changedProposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-b',
    })

    expect(changed.canaryPublished).toBe(1)
    expect(changed.candidateCheckpointReused).toBe(0)
    expect(persistPublication).toHaveBeenCalledTimes(2)
    expect(new Set(persistPublication.mock.calls.map(([input]) => input.publicationKey)).size).toBe(2)
  })

  it('promotes a measured canary after its monitoring window', async () => {
    const recordImpact = vi.fn(async () => ({ status: 'impact_recorded', reasons: [] }))
    const promoteCanary = vi.fn(async () => ({
      status: 'stable_promoted',
      previousPublicationKey: 'stable-0',
      reasons: [],
    }))
    const rollbackPublication = vi.fn()

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [{
        publicationKey: 'duration_learning_runtime:base_duration_benchmark:canary-1',
        assetKey: 'base_duration_benchmark',
        publicationStage: 'canary',
        scopeLevel: 'company',
        monitoringWindowHours: 72,
        monitoringElapsedHours: 80,
        observedCount: 12,
        rejectedObservationCount: 0,
        acceptedOutcomeCount: 0,
        weakOrRejectedOutcomeCount: 0,
        accuracySampleCount: 8,
        maeBefore: 8,
        maeAfter: 6,
        regressionRate: 0,
        sourceAutomationDecision: {
          experienceTier: 'T2',
          factSource: 'actual_outcome',
          observed: {
            validChangeCount: 220,
            distinctTaskCount: 120,
            distinctProjectCount: 45,
            distinctCompanyCount: 1,
            realOutcomeCount: 110,
            replayCaseCount: 220,
            observationWindowDays: 60,
            overcompensationRate: 0,
            rollbackReady: true,
            tenantScopeValid: true,
          },
        },
      }],
      recordImpact: recordImpact as any,
      promoteCanary: promoteCanary as any,
      rollbackPublication: rollbackPublication as any,
      observedAt: '2026-07-17T00:00:00.000Z',
    })

    expect(result.monitoringPassed).toBe(1)
    expect(result.stablePromoted).toBe(1)
    expect(recordImpact).toHaveBeenCalledWith(expect.objectContaining({
      monitoringStatus: 'passed',
      metrics: expect.objectContaining({ accuracySampleCount: 8, maeBefore: 8, maeAfter: 6 }),
    }))
    expect(promoteCanary).toHaveBeenCalledOnce()
    expect(rollbackPublication).not.toHaveBeenCalled()
  })

  it('treats a terminal promotion replay as idempotent after an ambiguous first-attempt failure', async () => {
    let promoted = false
    const recordImpact = vi.fn(async () => ({ status: 'impact_recorded', reasons: [] }))
    const promoteCanary = vi.fn(async () => {
      if (!promoted) {
        promoted = true
        throw new Error('promotion response lost after commit')
      }
      return {
        status: 'stable_already_promoted',
        previousPublicationKey: 'stable-0',
        reasons: [],
      }
    })
    const monitoringCandidate = {
      publicationKey: 'duration_learning_runtime:base_duration_benchmark:ambiguous-promotion',
      assetKey: 'base_duration_benchmark' as const,
      publicationStage: 'canary' as const,
      scopeLevel: 'company' as const,
      monitoringWindowHours: 72,
      monitoringElapsedHours: 80,
      observedCount: 12,
      rejectedObservationCount: 0,
      acceptedOutcomeCount: 0,
      weakOrRejectedOutcomeCount: 0,
      accuracySampleCount: 8,
      maeBefore: 8,
      maeAfter: 6,
      regressionRate: 0,
      sourceAutomationDecision: {
        experienceTier: 'T2',
        factSource: 'actual_outcome',
        observed: {
          validChangeCount: 220,
          distinctTaskCount: 120,
          distinctProjectCount: 45,
          distinctCompanyCount: 1,
          realOutcomeCount: 110,
          replayCaseCount: 220,
          observationWindowDays: 60,
          overcompensationRate: 0,
          rollbackReady: true,
          tenantScopeValid: true,
        },
      },
    }

    const first = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [monitoringCandidate],
      recordImpact: recordImpact as any,
      promoteCanary: promoteCanary as any,
    })
    const retry = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [monitoringCandidate],
      recordImpact: recordImpact as any,
      promoteCanary: promoteCanary as any,
    })

    expect(first.failed).toBe(1)
    expect(retry.failed).toBe(0)
    expect(retry.stablePromoted).toBe(0)
    expect(retry.stablePromotionReused).toBe(1)
    expect(promoteCanary).toHaveBeenCalledTimes(2)
  })

  it('keeps a measured canary collecting until the stable automation policy is satisfied', async () => {
    const recordImpact = vi.fn(async () => ({ status: 'impact_recorded', reasons: [] }))
    const promoteCanary = vi.fn()

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [{
        publicationKey: 'duration_learning_runtime:base_duration_benchmark:underpowered-1',
        assetKey: 'base_duration_benchmark',
        publicationStage: 'canary',
        scopeLevel: 'company',
        monitoringWindowHours: 72,
        monitoringElapsedHours: 80,
        observedCount: 12,
        rejectedObservationCount: 0,
        acceptedOutcomeCount: 0,
        weakOrRejectedOutcomeCount: 0,
        accuracySampleCount: 8,
        maeBefore: 8,
        maeAfter: 6,
        regressionRate: 0,
        sourceAutomationDecision: {
          experienceTier: 'T2',
          factSource: 'actual_outcome',
          observed: {
            validChangeCount: 100,
            distinctTaskCount: 50,
            distinctProjectCount: 20,
            distinctCompanyCount: 1,
            realOutcomeCount: 50,
            replayCaseCount: 100,
            observationWindowDays: 30,
            overcompensationRate: 0,
            rollbackReady: true,
            tenantScopeValid: true,
          },
        },
      } as any],
      recordImpact: recordImpact as any,
      promoteCanary: promoteCanary as any,
      observedAt: '2026-07-17T00:00:00.000Z',
    })

    expect(result.monitoringPending).toBe(1)
    expect(result.monitoringPassed).toBe(0)
    expect(result.stablePromoted).toBe(0)
    expect(promoteCanary).not.toHaveBeenCalled()
    expect(recordImpact).toHaveBeenCalledWith(expect.objectContaining({
      monitoringStatus: 'collecting',
      metrics: expect.objectContaining({
        stableAutomationDecision: expect.objectContaining({
          targetStage: 'stable',
          stage: 'collecting',
          reasonCodes: expect.arrayContaining([
            'valid_change_count_below_company_stable_floor',
            'observation_window_days_below_company_stable_floor',
          ]),
        }),
      }),
    }))
  })

  it('rolls back a regressing publication and routes structural conflicts to human fallback', async () => {
    const persistPublication = vi.fn()
    const recordImpact = vi.fn(async () => ({ status: 'impact_recorded', reasons: [] }))
    const rollbackPublication = vi.fn(async () => ({
      status: 'rollback_executed',
      restoredPublicationKey: 'stable-0',
      reasons: [],
    }))
    const conflictProposal: DurationLearningRuntimeCandidateProposal = {
      ...benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'residential' }),
      proposalKey: 'dependency-conflict',
      assetKey: 'dependency_rule_candidate',
      artifactKey: 'A->B:FS',
      runtimePayload: {
        predecessorCode: 'A',
        successorCode: 'B',
        dependencyType: 'FS',
        lagDays: 1,
      },
      conflictCount: 1,
    }

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [conflictProposal],
      monitoringProvider: async () => [{
        publicationKey: 'duration_learning_runtime:base_duration_benchmark:bad-1',
        assetKey: 'base_duration_benchmark',
        publicationStage: 'stable',
        scopeLevel: 'company',
        monitoringWindowHours: 72,
        monitoringElapsedHours: 90,
        observedCount: 10,
        rejectedObservationCount: 0,
        acceptedOutcomeCount: 0,
        weakOrRejectedOutcomeCount: 0,
        accuracySampleCount: 10,
        maeBefore: 5,
        maeAfter: 8,
        regressionRate: 0.3,
      }],
      persistPublication: persistPublication as any,
      recordImpact: recordImpact as any,
      rollbackPublication: rollbackPublication as any,
      observedAt: '2026-07-17T00:00:00.000Z',
    })

    expect(result.manualFallback).toBe(1)
    expect(result.monitoringFailed).toBe(1)
    expect(result.rollbackExecuted).toBe(1)
    expect(persistPublication).not.toHaveBeenCalled()
    expect(rollbackPublication).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'duration_learning_runtime:base_duration_benchmark:bad-1',
      reason: expect.stringContaining('regression'),
    }))
  })

  it('treats a terminal rollback replay as idempotent after an ambiguous first-attempt failure', async () => {
    let rolledBack = false
    const recordImpact = vi.fn(async () => ({ status: 'impact_recorded', reasons: [] }))
    const rollbackPublication = vi.fn(async () => {
      if (!rolledBack) {
        rolledBack = true
        throw new Error('rollback response lost after commit')
      }
      return {
        status: 'rollback_already_executed',
        restoredPublicationKey: 'stable-0',
        reasons: [],
      }
    })
    const monitoringCandidate = {
      publicationKey: 'duration_learning_runtime:base_duration_benchmark:ambiguous-rollback',
      assetKey: 'base_duration_benchmark' as const,
      publicationStage: 'stable' as const,
      scopeLevel: 'company' as const,
      monitoringWindowHours: 72,
      monitoringElapsedHours: 90,
      observedCount: 10,
      rejectedObservationCount: 0,
      acceptedOutcomeCount: 0,
      weakOrRejectedOutcomeCount: 0,
      accuracySampleCount: 10,
      maeBefore: 5,
      maeAfter: 8,
      regressionRate: 0.3,
    }

    const first = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [monitoringCandidate],
      recordImpact: recordImpact as any,
      rollbackPublication: rollbackPublication as any,
    })
    const retry = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [monitoringCandidate],
      recordImpact: recordImpact as any,
      rollbackPublication: rollbackPublication as any,
    })

    expect(first.failed).toBe(1)
    expect(retry.failed).toBe(0)
    expect(retry.rollbackExecuted).toBe(0)
    expect(retry.rollbackReused).toBe(1)
    expect(rollbackPublication).toHaveBeenCalledTimes(2)
  })
})
