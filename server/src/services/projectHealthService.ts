/**
 * 项目健康度统一真值服务
 * 统一复用 PlanningHealthService 的评分结果，避免 health-score/dashboard/autoAlert 各算一套。
 */

import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import { PlanningHealthService } from './planningHealthService.js'
import { isProjectActiveStatus } from '../utils/projectStatus.js'

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

export interface HealthSnapshotResult {
  recorded: number
  failed: number
  period: string
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

export function getHealthHistoryPeriod(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
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

export async function recordProjectHealthSnapshots(period = getHealthHistoryPeriod()): Promise<HealthSnapshotResult> {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, status')

  if (error) {
    throw new Error(`获取活跃项目列表失败: ${error.message}`)
  }

  const activeProjects = ((projects ?? []) as Array<{ id: string; name?: string | null; status?: string | null }>).filter(
    (project) => isProjectActiveStatus(project.status),
  )

  if (activeProjects.length === 0) {
    return { recorded: 0, failed: 0, period }
  }

  let recorded = 0
  let failed = 0

  for (const project of activeProjects) {
    try {
      const result = await calculateProjectHealth(project.id)
      await persistProjectHealth(project.id, result)

      const { error: upsertError } = await supabase
        .from('project_health_history')
        .upsert({
          project_id: project.id,
          health_score: result.score,
          health_status: result.details.healthStatus,
          period,
          details: result.details,
          recorded_at: new Date().toISOString(),
        }, { onConflict: 'project_id,period' })

      if (upsertError) {
        throw upsertError
      }

      recorded += 1
    } catch (error) {
      failed += 1
      logger.warn('[projectHealthService] failed to record health snapshot', {
        projectId: project.id,
        projectName: project.name ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { recorded, failed, period }
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
