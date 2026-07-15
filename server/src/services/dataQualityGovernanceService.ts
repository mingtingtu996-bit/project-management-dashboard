// v1.4.16: Data quality governance service extensions
// Extends dataQualityService with master data, WBS, status, source, and cross-domain rules

import { query as rawQuery } from '../database.js'
import { supabase } from './dbService.js'
import { logger } from '../middleware/logger.js'
import { writeChangeLog } from './changeAuditService.js'
import {
  DATA_QUALITY_DIMENSIONS,
  DATA_QUALITY_RULE_REGISTRY,
  type DataQualityDimension,
  type DataQualityRuleDefinition as QualityRuleDefinition,
  type QualitySeverity,
} from './dataQualityRuleRegistry.js'

export type QualityFindingStatus = 'active' | 'resolved' | 'ignored' | 'auto_resolved'
export const EXTENDED_QUALITY_RULES: QualityRuleDefinition[] = DATA_QUALITY_RULE_REGISTRY

// ============================================================
// Quality summary for project
// ============================================================
export interface QualityDimensionScore {
  dimension: DataQualityDimension
  score: number  // 0-100
  findingCount: number
  activeCount: number
  weight: number
}

export interface ProjectQualitySummary {
  projectId: string
  confidenceScore: number
  confidenceFlag: 'high' | 'medium' | 'low'
  dimensions: QualityDimensionScore[]
  totalFindings: number
  activeFindings: number
  resolvedFindings: number
  generatedAt: string
}

export async function buildProjectQualitySummary(projectId: string): Promise<ProjectQualitySummary> {
  const now = new Date().toISOString()

  // v1.4.16: count findings by quality_dimension (falls back to dimension_key for old data)
  let findings: any[] = []
  let directReadSucceeded = false
  if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    try {
      const result = await rawQuery(
        `SELECT quality_dimension, dimension_key, status, severity, rule_code
           FROM public.data_quality_findings
          WHERE project_id = $1
            AND status = ANY($2::text[])`,
        [projectId, ['active', 'ignored']],
      )
      findings = result.rows ?? []
      directReadSucceeded = true
    } catch (error) {
      logger.warn('[dataQualityGovernance] direct project quality summary read failed; falling back to Supabase REST', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!directReadSucceeded) {
    const { data } = await (supabase as any)
      .from('data_quality_findings')
      .select('quality_dimension, dimension_key, status, severity, rule_code')
      .eq('project_id', projectId)
      .in('status', ['active', 'ignored'])
    findings = data ?? []
  }

  const activeFindings = findings.filter((f: any) => f.status === 'active')
  const totalFindings = findings.length

  const baseWeights: Record<DataQualityDimension, number> = {
    timeliness: 0.20,
    anomaly: 0.20,
    consistency: 0.15,
    jumpiness: 0.10,
    coverage: 0.15,
    completeness: 0.10,
    accuracy: 0.05,
    lineage: 0.03,
    governance: 0.02,
    retention: 0.03,
    metric_caliber: 0.03,
  }
  const totalBaseWeight = DATA_QUALITY_DIMENSIONS.reduce((sum, dim) => sum + (baseWeights[dim] ?? 0), 0)
  const defaultWeights = DATA_QUALITY_DIMENSIONS.reduce((accumulator, dim) => {
    accumulator[dim] = totalBaseWeight > 0
      ? Math.round(((baseWeights[dim] ?? 0) / totalBaseWeight) * 10000) / 10000
      : Math.round((1 / DATA_QUALITY_DIMENSIONS.length) * 10000) / 10000
    return accumulator
  }, {} as Record<DataQualityDimension, number>)
  const normalizedWeightTotal = DATA_QUALITY_DIMENSIONS.reduce((sum, dim) => sum + defaultWeights[dim], 0)
  const lastDimension = DATA_QUALITY_DIMENSIONS[DATA_QUALITY_DIMENSIONS.length - 1]
  if (lastDimension && normalizedWeightTotal !== 1) {
    defaultWeights[lastDimension] = Math.round((defaultWeights[lastDimension] + (1 - normalizedWeightTotal)) * 10000) / 10000
  }

  // v1.4.16: prefer quality_dimension, fallback to dimension_key for old data
  function getDimKey(f: any): string {
    return f.quality_dimension || f.dimension_key || 'timeliness'
  }

  // Compute dimension scores
  const dimensions: QualityDimensionScore[] = DATA_QUALITY_DIMENSIONS.map((dim) => {
    const dimFindings = activeFindings.filter((f: any) => getDimKey(f) === dim)
    const score = Math.max(0, 100 - dimFindings.length * 5)
    return {
      dimension: dim,
      score,
      findingCount: findings.filter((f: any) => getDimKey(f) === dim).length,
      activeCount: dimFindings.length,
      weight: defaultWeights[dim] ?? 0,
    }
  })

  // Weighted confidence score
  const confidenceScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
  )

  const confidenceFlag: 'high' | 'medium' | 'low' =
    confidenceScore >= 85 ? 'high' : confidenceScore >= 70 ? 'medium' : 'low'

  logger.info('Built project quality summary', { projectId, confidenceScore, confidenceFlag })

  return {
    projectId,
    confidenceScore,
    confidenceFlag,
    dimensions,
    totalFindings,
    activeFindings: activeFindings.length,
    resolvedFindings: totalFindings - activeFindings.length,
    generatedAt: now,
  }
}

// ============================================================
// Auto-resolve findings when condition is met
// ============================================================
export async function autoResolveFindings(
  projectId: string,
  ruleCode: string,
): Promise<number> {
  const rule = EXTENDED_QUALITY_RULES.find(r => r.ruleCode === ruleCode)
  if (!rule?.autoResolveWhen) return 0

  const { error } = await (supabase as any)
    .from('data_quality_findings')
    .update({
      status: 'auto_resolved',
      resolved_at: new Date().toISOString(),
      resolution_source: 'auto',
    })
    .eq('project_id', projectId)
    .eq('rule_code', ruleCode)
    .eq('status', 'active')

  if (error) {
    logger.error('Failed to auto-resolve findings', { error, ruleCode })
    return 0
  }

  await writeChangeLog({
    projectId,
    entityType: 'data_quality_finding',
    entityId: ruleCode,
    actionType: 'quality_auto_resolved',
    actionGroup: 'auto',
    changeSource: 'system_auto',
    metadata: { ruleCode },
    visibility: 'internal',
  })

  return 1
}
