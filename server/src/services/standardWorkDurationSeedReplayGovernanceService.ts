import type { AlgorithmSeedDiscoverySample } from './algorithmSeedCandidateDiscoveryService.js'
import { supabase } from './dbService.js'
import {
  replayStandardWorkDurationSeedAgainstSamples,
  type StandardWorkDurationSeedReplayReport,
} from './standardWorkDurationSeedReplayService.js'

export interface StandardWorkDurationSeedReplayGovernanceOptions {
  companyId?: string | null
  projectId?: string | null
  minSamplesPerCode?: number
  maxSamples?: number
  toleranceRatio?: number
}

export interface StandardWorkDurationSeedReplayGovernanceReport {
  reportCode: 'standard_work_duration_seed_replay_governance'
  generatedAt: string
  companyId: string | null
  projectId: string | null
  source: {
    table: 'duration_experience_samples'
    filters: {
      sampleStatus: 'active'
      includedInBenchmark: true
      wbsNodeType: 'process'
      companyId: string | null
      projectId: string | null
      maxSamples: number
    }
  }
  replay: StandardWorkDurationSeedReplayReport
  governanceBoundary: {
    reportOnly: true
    seedWritePolicy: 'never_write_seed_from_replay'
    promotionPolicy: 'review_required_before_seed_promotion'
    allowedUse: 'backend_governance_report'
  }
}

type DurationExperienceSampleRow = Record<string, unknown>

const DEFAULT_MAX_REPLAY_SAMPLES = 1000

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeSample(row: DurationExperienceSampleRow): AlgorithmSeedDiscoverySample {
  const metadata = readRecord(row.metadata)
  return {
    id: normalizeText(row.id) || null,
    company_id: normalizeText(row.company_id ?? metadata.company_id) || null,
    project_id: normalizeText(row.project_id) || null,
    task_id: normalizeText(row.task_id) || null,
    template_node_id: normalizeText(row.template_node_id) || null,
    standard_work_code: normalizeText(row.standard_work_code) || null,
    standard_work_name: normalizeText(row.standard_work_name) || null,
    wbs_node_type: normalizeText(row.wbs_node_type) || null,
    actual_duration: Number(row.actual_duration),
    planned_duration: row.planned_duration == null ? null : Number(row.planned_duration),
    started_at: normalizeText(row.started_at) || null,
    completed_at: normalizeText(row.completed_at) || null,
    confidence_score: row.confidence_score == null ? null : Number(row.confidence_score),
    metadata,
  }
}

async function fetchReplaySamples(options: Required<Pick<StandardWorkDurationSeedReplayGovernanceOptions, 'maxSamples'>> & Pick<StandardWorkDurationSeedReplayGovernanceOptions, 'companyId' | 'projectId'>) {
  let query = (supabase as any)
    .from('duration_experience_samples')
    .select('*')
    .eq('sample_status', 'active')
    .eq('included_in_benchmark', true)
    .eq('wbs_node_type', 'process')
    .not('actual_duration', 'is', null)
    .not('standard_work_code', 'is', null)

  if (options.companyId) query = query.eq('company_id', options.companyId)
  if (options.projectId) query = query.eq('project_id', options.projectId)

  const { data, error } = await query
    .order('completed_at', { ascending: false })
    .limit(options.maxSamples)
  if (error) throw error
  return Array.isArray(data) ? data.map(normalizeSample) : []
}

export async function buildStandardWorkDurationSeedReplayGovernanceReport(
  options: StandardWorkDurationSeedReplayGovernanceOptions = {},
): Promise<StandardWorkDurationSeedReplayGovernanceReport> {
  const companyId = normalizeText(options.companyId) || null
  const projectId = normalizeText(options.projectId) || null
  const maxSamples = normalizePositiveInteger(options.maxSamples, DEFAULT_MAX_REPLAY_SAMPLES)
  const samples = await fetchReplaySamples({ companyId, projectId, maxSamples })
  const replay = await replayStandardWorkDurationSeedAgainstSamples(samples, {
    minSamplesPerCode: options.minSamplesPerCode,
    toleranceRatio: options.toleranceRatio,
  })

  return {
    reportCode: 'standard_work_duration_seed_replay_governance',
    generatedAt: new Date().toISOString(),
    companyId,
    projectId,
    source: {
      table: 'duration_experience_samples',
      filters: {
        sampleStatus: 'active',
        includedInBenchmark: true,
        wbsNodeType: 'process',
        companyId,
        projectId,
        maxSamples,
      },
    },
    replay,
    governanceBoundary: {
      reportOnly: true,
      seedWritePolicy: 'never_write_seed_from_replay',
      promotionPolicy: 'review_required_before_seed_promotion',
      allowedUse: 'backend_governance_report',
    },
  }
}
