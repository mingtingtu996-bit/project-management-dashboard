/**
 * 项目健康度统一真值服务
 * 统一复用 PlanningHealthService 的评分结果，避免 health-score/dashboard/autoAlert 各算一套。
 */

import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import { PlanningHealthService } from './planningHealthService.js'

export type HealthStatus = '健康' | '亚健康' | '预警' | '危险'

export interface HealthDetails {
  dataIntegrityScore: number
  mappingIntegrityScore: number
  systemConsistencyScore: number
  milestoneIntegrityScore: number
  passiveReorderPenalty: number
  totalScore: number
  healthStatus: HealthStatus
}

export interface HealthScoreResult {
  score: number
  details: HealthDetails
}

const planningHealthService = new PlanningHealthService()

function mapHealthStatus(score: number): HealthStatus {
  if (score >= 80) return '健康'
  if (score >= 60) return '亚健康'
  if (score >= 40) return '预警'
  return '危险'
}

function toHealthDetails(score: number, breakdown: {
  data_integrity_score: number
  mapping_integrity_score: number
  system_consistency_score: number
  m1_m9_score: number
  passive_reorder_penalty: number
}) {
  return {
    dataIntegrityScore: breakdown.data_integrity_score,
    mappingIntegrityScore: breakdown.mapping_integrity_score,
    systemConsistencyScore: breakdown.system_consistency_score,
    milestoneIntegrityScore: breakdown.m1_m9_score,
    passiveReorderPenalty: breakdown.passive_reorder_penalty,
    totalScore: score,
    healthStatus: mapHealthStatus(score),
  } satisfies HealthDetails
}

export async function calculateProjectHealth(projectId: string): Promise<HealthScoreResult> {
  const report = await planningHealthService.evaluateProjectHealth(projectId)
  return {
    score: report.score,
    details: toHealthDetails(report.score, report.breakdown),
  }
}

async function persistProjectHealth(projectId: string, result: HealthScoreResult) {
  const { error } = await supabase
    .from('projects')
    .update({
      health_score: result.score,
      health_status: result.details.healthStatus,
    })
    .eq('id', projectId)

  if (error) {
    throw new Error(`更新项目健康度失败: ${error.message}`)
  }

  return result
}

export async function updateProjectHealth(projectId: string): Promise<HealthScoreResult> {
  const result = await calculateProjectHealth(projectId)
  await persistProjectHealth(projectId, result)

  logger.info('[projectHealthService] project health refreshed', {
    projectId,
    score: result.score,
    status: result.details.healthStatus,
  })

  return result
}

export async function updateAllProjectsHealth(): Promise<number> {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id')

  if (error) {
    throw new Error(`获取项目列表失败: ${error.message}`)
  }

  if (!projects || projects.length === 0) {
    return 0
  }

  let updatedCount = 0
  for (const project of projects) {
    try {
      await updateProjectHealth(project.id)
      updatedCount += 1
    } catch (error) {
      logger.warn('[projectHealthService] failed to refresh project health', {
        projectId: project.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return updatedCount
}

export function enqueueProjectHealthUpdate(projectId: string, trigger = 'event') {
  if (!projectId) return

  void updateProjectHealth(projectId).catch((error) => {
    logger.warn('[projectHealthService] async health refresh failed', {
      projectId,
      trigger,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}
