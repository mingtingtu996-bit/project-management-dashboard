import { executeSQL } from './dbService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { PlanningIntegrityService } from './planningIntegrityService.js'
import type {
  PlanningHealthBreakdown,
  PlanningHealthReport,
  PlanningIntegrityReport,
} from '../types/planning.js'

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getHealthStatus(score: number): PlanningHealthReport['status'] {
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'warning'
  return 'critical'
}

function scoreFromCount(count: number, weight: number): number {
  return Math.max(0, 100 - count * weight)
}

export function scorePlanningHealth(integrity: PlanningIntegrityReport): PlanningHealthReport {
  const milestoneTotal = integrity.milestone_integrity.summary.total || 1
  const milestoneScore = clampScore((integrity.milestone_integrity.summary.aligned / milestoneTotal) * 100)
  const dataScore = clampScore(
    scoreFromCount(integrity.data_integrity.missing_participant_unit_count, 12) -
    integrity.data_integrity.missing_scope_dimension_count * 4 -
    integrity.data_integrity.missing_progress_snapshot_count * 3,
  )
  const mappingScore = clampScore(
    scoreFromCount(integrity.mapping_integrity.baseline_pending_count, 10) -
    integrity.mapping_integrity.baseline_merged_count * 4 -
    integrity.mapping_integrity.monthly_carryover_count * 2,
  )
  const systemScore = clampScore(
    scoreFromCount(integrity.system_consistency.inconsistent_milestones, 12) -
    integrity.system_consistency.stale_snapshot_count * 2,
  )
  const passivePenalty = integrity.passive_reorder.windows.reduce((sum, window) => {
    if (!window.triggered) return sum
    if (window.window_days === 7) return sum + 15
    if (window.window_days === 5) return sum + 10
    return sum + 5
  }, 0)

  const totalScore = clampScore(
    (dataScore * 0.35) +
    (mappingScore * 0.2) +
    (systemScore * 0.25) +
    (milestoneScore * 0.2) -
    passivePenalty,
  )

  const breakdown: PlanningHealthBreakdown = {
    data_integrity_score: dataScore,
    mapping_integrity_score: mappingScore,
    system_consistency_score: systemScore,
    m1_m9_score: milestoneScore,
    passive_reorder_penalty: passivePenalty,
    total_score: totalScore,
  }

  return {
    project_id: integrity.project_id,
    score: totalScore,
    status: getHealthStatus(totalScore),
    label:
      totalScore >= 80 ? '健康' :
      totalScore >= 60 ? '亚健康' :
      '危险',
    breakdown,
    integrity,
  }
}

export class PlanningHealthService {
  private integrityService = new PlanningIntegrityService()

  async evaluateProjectHealth(projectId: string): Promise<PlanningHealthReport> {
    const integrity = await this.integrityService.scanProjectIntegrity(projectId)
    return scorePlanningHealth(integrity)
  }

  async scanAllProjectHealth(): Promise<PlanningHealthReport[]> {
    const projectIds = await listActiveProjectIds()
    const reports: PlanningHealthReport[] = []
    for (const projectId of projectIds) {
      reports.push(await this.evaluateProjectHealth(projectId))
    }
    return reports
  }
}
