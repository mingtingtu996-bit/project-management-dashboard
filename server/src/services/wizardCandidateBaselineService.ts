import { v4 as uuidv4 } from 'uuid'

import { insertRowReturning, insertRows } from './transactionInsertService.js'
import { materializeGeneratedTemplateRowsToBaselineItems } from './wbsTemplateBaselineDraftMaterializer.js'
import type { GeneratedTemplateRow } from './wbsTemplateGenerationService.js'

type WizardCandidateBaselineTransactionClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>
}

export type WizardCandidateBaselineDraft = {
  baselineId: string
  sourceVersionLabel: 'residential_master_plan_v2' | 'managed_frontier_default_master_plan'
  status: 'draft'
  itemCount: number
  mappedTaskCount: number
  generationBatchId: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function resolveSourceVersionLabel(businessType: unknown): WizardCandidateBaselineDraft['sourceVersionLabel'] {
  return normalizeText(businessType).toLowerCase() === 'residential'
    ? 'residential_master_plan_v2'
    : 'managed_frontier_default_master_plan'
}

export async function createWizardCandidateBaselineDraft(params: {
  transactionClient: WizardCandidateBaselineTransactionClient
  projectId: string
  projectName?: string | null
  businessType?: string | null
  generationBatchId: string
  rows: GeneratedTemplateRow[]
  sourceTaskIdByClientRowId: ReadonlyMap<string, string>
  durationAssetUtilizationSummary?: unknown
  candidateNetworkEvaluation?: unknown
  capturedAt?: string
}): Promise<WizardCandidateBaselineDraft> {
  const capturedAt = params.capturedAt ?? new Date().toISOString()
  const baselineId = uuidv4()
  const sourceVersionLabel = resolveSourceVersionLabel(params.businessType)
  const items = materializeGeneratedTemplateRowsToBaselineItems({
    rows: params.rows,
    projectId: params.projectId,
    baselineVersionId: baselineId,
    capturedAt,
    generationBatchId: params.generationBatchId,
    sourceTaskIdByClientRowId: params.sourceTaskIdByClientRowId,
    includeRowsWithoutProjectionMetadata: true,
  })

  if (items.length === 0) {
    throw Object.assign(new Error('向导生成结果没有可写入初始总控计划的计划行'), {
      code: 'WIZARD_CANDIDATE_BASELINE_EMPTY',
      statusCode: 422,
    })
  }

  const mappedTaskCount = items.filter((item) => Boolean(item.source_task_id)).length
  if (mappedTaskCount !== items.length) {
    throw Object.assign(new Error('向导候选基线未完整映射本次生成任务'), {
      code: 'WIZARD_CANDIDATE_BASELINE_TASK_MAPPING_INCOMPLETE',
      statusCode: 500,
      details: {
        itemCount: items.length,
        mappedTaskCount,
      },
    })
  }

  const governanceMetadata = {
    source: 'wizard_generated_initial_plan_draft',
    planLifecycleStatus: 'draft_ready_for_user_confirmation',
    runtimeApprovalRequired: false,
    generationQualityReview: {
      mode: 'offline_development_calibration',
      blocksPlanGeneration: false,
      blocksBaselinePublication: false,
    },
    wizardGeneration: {
      source: 'wizard_generated_initial_plan_draft',
      generationBatchId: params.generationBatchId,
      itemCount: items.length,
      mappedTaskCount,
      taskMappingStatus: 'all_candidate_rows_linked_to_wizard_tasks',
    },
    durationAssetUtilizationSummary: params.durationAssetUtilizationSummary ?? null,
    candidateNetworkEvaluation: params.candidateNetworkEvaluation ?? null,
    mutationBoundary: {
      writesTaskBaselineDraft: true,
      linksExistingWizardTasks: true,
      writesConfirmedBaseline: false,
      writesMonthlyPlans: false,
      writesRuntimePublication: false,
    },
  }

  await insertRowReturning(params.transactionClient, 'task_baselines', {
    id: baselineId,
    project_id: params.projectId,
    version: null,
    status: 'draft',
    title: `${normalizeText(params.projectName) || '项目'} 总控计划`,
    description: '由项目向导生成并映射到本次任务网络的初始项目基线；可预览、编辑并按普通基线流程发布。',
    source_type: 'current_schedule',
    source_version_label: sourceVersionLabel,
    governance_metadata: governanceMetadata,
    created_at: capturedAt,
    updated_at: capturedAt,
  }, { jsonColumns: ['governance_metadata'] })

  await insertRows(params.transactionClient, 'task_baseline_items', items, {
    jsonColumns: ['generation_metadata'],
  })

  return {
    baselineId,
    sourceVersionLabel,
    status: 'draft',
    itemCount: items.length,
    mappedTaskCount,
    generationBatchId: params.generationBatchId,
  }
}
