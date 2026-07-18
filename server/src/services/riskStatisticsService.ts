/**
 * 风险统计服务
 * 用于生成每日风险统计快照，支持趋势分析
 * 已迁移至直接使用 Supabase SDK（不再依赖 executeSQL 包装层）
 */

import { query as rawQuery } from '../database.js';
import { supabase } from './dbService.js';
import dotenv from 'dotenv';
import { isActiveIssue } from '../utils/issueStatus.js';
import { isActiveRisk } from '../utils/riskStatus.js';
import { isActiveWarning } from '../utils/warningStatus.js';

// 加载环境变量
dotenv.config();

export interface RiskStatistics {
  id: string;
  project_id: string;
  stat_date: string;
  new_risks: number;
  new_high_risks: number;
  new_medium_risks: number;
  new_low_risks: number;
  new_critical_risks: number;
  resolved_risks: number;
  resolved_high_risks: number;
  resolved_medium_risks: number;
  resolved_low_risks: number;
  resolved_critical_risks: number;
  total_risks: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  critical_risk_count: number;
  delay_risks: number;
  obstacle_risks: number;
  condition_risks: number;
  general_risks: number;
  created_at: string;
  updated_at: string;
}

export interface RiskTrendData {
  date: string;
  newRisks: number;
  resolvedRisks: number;
  totalRisks: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  newIssues: number;
  resolvedIssues: number;
  totalIssues: number;
  newWarnings: number;
  resolvedWarnings: number;
  totalWarnings: number;
}

export interface RiskPipelineStages {
  identified: number;
  assessed: number;
  responded: number;
  monitored: number;
}

export interface RiskTrendSummary {
  trend: RiskTrendData[];
  summary: {
    totalNewRisks: number;
    totalResolvedRisks: number;
    currentTotalRisks: number;
    currentCriticalRisks: number;
    currentIssueCount: number;
    currentWarningCount: number;
    riskChangeRate: number; // 风险变化率
  };
  sourceTypeBreakdown: Array<{
    sourceType: string;
    count: number;
  }>;
  pipelineStages: RiskPipelineStages;
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function toIsoDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

function createDateRange(startDateStr: string, endDateStr: string) {
  const dates: string[] = []
  const current = new Date(`${startDateStr}T00:00:00.000Z`)
  const end = new Date(`${endDateStr}T00:00:00.000Z`)

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

type RiskStockRow = {
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  status?: string | null
  [key: string]: unknown
}

function toTimestamp(value: unknown) {
  const timestamp = Date.parse(String(value ?? ''))
  return Number.isFinite(timestamp) ? timestamp : null
}

export function buildRiskStockAsOf(rows: RiskStockRow[], asOf: string) {
  const asOfTimestamp = toTimestamp(asOf)
  if (asOfTimestamp === null) return []

  return rows.filter((risk) => {
    const createdAt = toTimestamp(risk.created_at)
    if (createdAt === null || createdAt > asOfTimestamp) return false
    if (isActiveRisk(risk)) return true

    const closedAt = toTimestamp(risk.closed_at ?? risk.updated_at)
    return closedAt !== null && closedAt > asOfTimestamp
  })
}

type RiskTrendSourceRows = {
  riskStats: any[]
  currentRisks: any[]
  issues: any[]
  warnings: any[]
}

export function buildRiskPipelineStages(rows: Array<{ status?: string | null }>): RiskPipelineStages {
  return rows.reduce<RiskPipelineStages>((stages, row) => {
    const status = normalizeText(row.status)
    if (status === 'identified' || status === '已识别' || status === '识别') {
      stages.identified += 1
      return stages
    }

    if (status === 'assessed' || status === 'assessment' || status === '已评估' || status === '评估') {
      stages.assessed += 1
      return stages
    }

    if (
      status === 'responded'
      || status === 'responding'
      || status === 'mitigating'
      || status === '应对'
      || status === '已应对'
      || status === '处理中'
    ) {
      stages.responded += 1
      return stages
    }

    if (
      status === 'monitored'
      || status === 'monitoring'
      || status === 'closed'
      || status === 'resolved'
      || status === '监控中'
      || status === '已关闭'
      || status === '已解决'
    ) {
      stages.monitored += 1
      return stages
    }

    stages.identified += 1
    return stages
  }, { identified: 0, assessed: 0, responded: 0, monitored: 0 })
}

class RiskStatisticsService {
  private async loadRiskTrendSourceRowsDirect(
    projectId: string,
    startDateStr: string,
    endDateStr: string,
  ): Promise<RiskTrendSourceRows | null> {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return null

    try {
      const [riskStatsResult, currentRisksResult, issuesResult, warningsResult] = await Promise.all([
        rawQuery(
          `SELECT stat_date::text AS stat_date,
                  new_risks,
                  resolved_risks,
                  total_risks,
                  high_risk_count,
                  medium_risk_count,
                  low_risk_count
             FROM public.risk_statistics
            WHERE project_id = $1
              AND stat_date >= $2::date
              AND stat_date <= $3::date
            ORDER BY stat_date ASC`,
          [projectId, startDateStr, endDateStr],
        ),
        rawQuery(
          `SELECT level, status, source_type, title
             FROM public.risks
            WHERE project_id = $1`,
          [projectId],
        ),
        rawQuery(
          `SELECT status,
                  severity,
                  created_at::text AS created_at,
                  updated_at::text AS updated_at,
                  source_type
             FROM public.issues
            WHERE project_id = $1`,
          [projectId],
        ),
        rawQuery(
          `SELECT warning_lifecycle_status,
                  severity,
                  created_at::text AS created_at,
                  updated_at::text AS updated_at
             FROM public.notifications
            WHERE project_id = $1
              AND source_entity_type = 'warning'`,
          [projectId],
        ),
      ])

      return {
        riskStats: riskStatsResult.rows ?? [],
        currentRisks: currentRisksResult.rows ?? [],
        issues: issuesResult.rows ?? [],
        warnings: warningsResult.rows ?? [],
      }
    } catch (error) {
      console.warn('风险趋势直连查询失败，回退到 Supabase REST:', error)
      return null
    }
  }

  /**
   * 生成指定日期的风险统计快照
   * @param projectId 项目ID
   * @param statDate 统计日期 (默认今天)
   */
  async generateDailySnapshot(
    projectId: string,
    statDate: string = new Date().toISOString().split('T')[0]
  ): Promise<RiskStatistics | null> {
    try {
      const startOfDay = `${statDate}T00:00:00.000Z`;
      const endOfDay = `${statDate}T23:59:59.999Z`;

      // 1. 统计当日新增的风险
      const { data: newRisks, error: newRisksError } = await supabase
        .from('risks')
        .select('level, status, source_type, title')
        .eq('project_id', projectId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);
      if (newRisksError) throw newRisksError;

      // 2. 统计当日已处理的风险
      const { data: resolvedRisks, error: resolvedRisksError } = await supabase
        .from('risks')
        .select('level, status, source_type, title')
        .eq('project_id', projectId)
        .in('status', ['closed', '已关闭'])
        .gte('updated_at', startOfDay)
        .lte('updated_at', endOfDay);
      if (resolvedRisksError) throw resolvedRisksError;

      // 3. 获取当前风险存量（快照）
      const { data: currentRisks, error: currentRisksError } = await supabase
        .from('risks')
        .select('level, status, source_type, title, created_at, updated_at, closed_at')
        .eq('project_id', projectId)
        .lte('created_at', endOfDay);
      if (currentRisksError) throw currentRisksError;

      // 4. 计算统计数据
      const historicalRiskStock = buildRiskStockAsOf(currentRisks || [], endOfDay)
      const stats = this.calculateStatistics(
        newRisks || [],
        resolvedRisks || [],
        historicalRiskStock
      );

      const now = new Date().toISOString();

      // 5. 依赖唯一键 (project_id, stat_date) 原子替换同日快照。
      const { data, error: upsertError } = await supabase.from('risk_statistics').upsert({
        project_id: projectId,
        stat_date: statDate,
        new_risks: stats.new_risks,
        new_high_risks: stats.new_high_risks,
        new_medium_risks: stats.new_medium_risks,
        new_low_risks: stats.new_low_risks,
        new_critical_risks: stats.new_critical_risks,
        resolved_risks: stats.resolved_risks,
        resolved_high_risks: stats.resolved_high_risks,
        resolved_medium_risks: stats.resolved_medium_risks,
        resolved_low_risks: stats.resolved_low_risks,
        resolved_critical_risks: stats.resolved_critical_risks,
        total_risks: stats.total_risks,
        high_risk_count: stats.high_risk_count,
        medium_risk_count: stats.medium_risk_count,
        low_risk_count: stats.low_risk_count,
        critical_risk_count: stats.critical_risk_count,
        delay_risks: stats.delay_risks,
        obstacle_risks: stats.obstacle_risks,
        condition_risks: stats.condition_risks,
        general_risks: stats.general_risks,
        updated_at: now,
      }, {
        onConflict: 'project_id,stat_date',
      })
        .select('*')
        .single();
      if (upsertError) throw upsertError;
      if (!data) throw new Error('Risk statistics snapshot upsert returned no row');

      return data as RiskStatistics;
    } catch (error) {
      console.error('生成风险统计快照失败:', error);
      throw error;
    }
  }

  /**
   * 计算统计数据
   */
  private calculateStatistics(
    newRisks: any[],
    resolvedRisks: any[],
    currentRisks: any[]
  ) {
    // 新增风险统计
    const newHigh = newRisks.filter(r => r.level === 'high').length;
    const newMedium = newRisks.filter(r => r.level === 'medium').length;
    const newLow = newRisks.filter(r => r.level === 'low').length;
    const newCritical = newRisks.filter(r => r.level === 'critical').length;

    // 已处理风险统计
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const resolvedHigh = resolvedRisks.filter(r => r.level === 'high').length;
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const resolvedMedium = resolvedRisks.filter(r => r.level === 'medium').length;
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const resolvedLow = resolvedRisks.filter(r => r.level === 'low').length;
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const resolvedCritical = resolvedRisks.filter(r => r.level === 'critical').length;

    // 当前存量统计
    const activeRisks = currentRisks;
    const highCount = activeRisks.filter(r => r.level === 'high').length;
    const mediumCount = activeRisks.filter(r => r.level === 'medium').length;
    const lowCount = activeRisks.filter(r => r.level === 'low').length;
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const criticalCount = activeRisks.filter(r => r.level === 'critical').length;

    // 按来源类型统计，仅使用 source_type 口径
    const delayCount = activeRisks.filter((r) => {
      const sourceType = normalizeText(r.source_type)
      return sourceType.includes('delay') || sourceType.includes('deviation')
    }).length;
    const obstacleCount = activeRisks.filter((r) => {
      const sourceType = normalizeText(r.source_type)
      return sourceType.includes('obstacle')
    }).length;
    const conditionCount = activeRisks.filter((r) => {
      const sourceType = normalizeText(r.source_type)
      return sourceType.includes('condition')
    }).length;
    const generalCount = activeRisks.filter((r) => {
      const sourceType = normalizeText(r.source_type)
      return !sourceType.includes('delay')
        && !sourceType.includes('deviation')
        && !sourceType.includes('obstacle')
        && !sourceType.includes('condition')
    }).length;

    return {
      new_risks: newRisks.length,
      new_high_risks: newHigh,
      new_medium_risks: newMedium,
      new_low_risks: newLow,
      new_critical_risks: newCritical,
      resolved_risks: resolvedRisks.length,
      resolved_high_risks: resolvedHigh,
      resolved_medium_risks: resolvedMedium,
      resolved_low_risks: resolvedLow,
      resolved_critical_risks: resolvedCritical,
      total_risks: activeRisks.length,
      high_risk_count: highCount,
      medium_risk_count: mediumCount,
      low_risk_count: lowCount,
      critical_risk_count: criticalCount,
      delay_risks: delayCount,
      obstacle_risks: obstacleCount,
      condition_risks: conditionCount,
      general_risks: generalCount,
    };
  }

  /**
   * 获取风险趋势数据
   * @param projectId 项目ID
   * @param days 查询天数 (默认30天)
   */
  async getRiskTrend(projectId: string, days: number = 30): Promise<RiskTrendSummary> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days + 1);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const dateKeys = createDateRange(startDateStr, endDateStr);
      const directRows = await this.loadRiskTrendSourceRowsDirect(projectId, startDateStr, endDateStr)
      let riskStatsRows: any[]
      let currentRiskRows: any[]
      let issueRows: Array<{ status?: string | null; created_at?: string | null; updated_at?: string | null }>
      let warningRows: Array<{ warning_lifecycle_status?: string | null; severity?: string | null; created_at?: string | null; updated_at?: string | null }>

      if (directRows) {
        riskStatsRows = directRows.riskStats
        currentRiskRows = directRows.currentRisks
        issueRows = directRows.issues
        warningRows = directRows.warnings
      } else {
        const [riskStatsResult, currentRisksResult, issuesResult, warningsResult] = await Promise.all([
          supabase
            .from('risk_statistics')
            .select('*')
            .eq('project_id', projectId)
            .gte('stat_date', startDateStr)
            .lte('stat_date', endDateStr)
            .order('stat_date', { ascending: true }),
          supabase
            .from('risks')
            .select('level, status, source_type, title')
            .eq('project_id', projectId),
          supabase
            .from('issues')
            .select('status, severity, created_at, updated_at, source_type')
            .eq('project_id', projectId),
          supabase
            .from('notifications')
            .select('warning_lifecycle_status, severity, created_at, updated_at')
            .eq('project_id', projectId)
            .eq('source_entity_type', 'warning'),
        ]);

        if (riskStatsResult.error) throw riskStatsResult.error;
        if (currentRisksResult.error) throw currentRisksResult.error;
        if (issuesResult.error) throw issuesResult.error;
        if (warningsResult.error) throw warningsResult.error;

        riskStatsRows = riskStatsResult.data ?? []
        currentRiskRows = currentRisksResult.data ?? []
        issueRows = issuesResult.data ?? []
        warningRows = warningsResult.data ?? []
      }

      const trendMap = new Map<string, RiskTrendData>()
      for (const date of dateKeys) {
        trendMap.set(date, {
          date,
          newRisks: 0,
          resolvedRisks: 0,
          totalRisks: 0,
          highRiskCount: 0,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          newIssues: 0,
          resolvedIssues: 0,
          totalIssues: 0,
          newWarnings: 0,
          resolvedWarnings: 0,
          totalWarnings: 0,
        })
      }

      const riskStatsByDate = new Map<string, any>()
      for (const stat of riskStatsRows) {
        riskStatsByDate.set(String(stat.stat_date), stat)
      }

      let previousRiskTotal = 0
      for (const date of dateKeys) {
        const point = trendMap.get(date)
        if (!point) continue
        const stat = riskStatsByDate.get(date)
        if (stat) {
          point.newRisks = Number(stat.new_risks ?? 0)
          point.resolvedRisks = Number(stat.resolved_risks ?? 0)
          point.totalRisks = Number(stat.total_risks ?? 0)
          point.highRiskCount = Number(stat.high_risk_count ?? 0)
          point.mediumRiskCount = Number(stat.medium_risk_count ?? 0)
          point.lowRiskCount = Number(stat.low_risk_count ?? 0)
          previousRiskTotal = point.totalRisks
        } else {
          point.totalRisks = previousRiskTotal
        }
      }

      let activeIssueCount = 0
      let activeWarningCount = 0

      for (const issue of issueRows) {
        const createdDate = toIsoDate(issue.created_at)
        if (createdDate && trendMap.has(createdDate)) {
          const point = trendMap.get(createdDate)
          if (point) point.newIssues += 1
        }

        if (!isActiveIssue(issue)) {
          const resolvedDate = toIsoDate(issue.updated_at)
          if (resolvedDate && trendMap.has(resolvedDate)) {
            const point = trendMap.get(resolvedDate)
            if (point) point.resolvedIssues += 1
          }
        } else {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          activeIssueCount += 1
        }
      }

      for (const warning of warningRows) {
        const createdDate = toIsoDate(warning.created_at)
        if (createdDate && trendMap.has(createdDate)) {
          const point = trendMap.get(createdDate)
          if (point) point.newWarnings += 1
        }

        if (!isActiveWarning(warning)) {
          const resolvedDate = toIsoDate(warning.updated_at)
          if (resolvedDate && trendMap.has(resolvedDate)) {
            const point = trendMap.get(resolvedDate)
            if (point) point.resolvedWarnings += 1
          }
        } else {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          activeWarningCount += 1
        }
      }

      let runningIssueTotal = 0
      let runningWarningTotal = 0
      for (const date of dateKeys) {
        const point = trendMap.get(date)
        if (!point) continue
        runningIssueTotal += point.newIssues - point.resolvedIssues
        runningWarningTotal += point.newWarnings - point.resolvedWarnings
        point.totalIssues = Math.max(0, runningIssueTotal)
        point.totalWarnings = Math.max(0, runningWarningTotal)
      }

      const activeRiskRows = currentRiskRows.filter((risk) => isActiveRisk(risk))
      const pipelineStages = buildRiskPipelineStages(currentRiskRows)
      const currentCriticalRisks = activeRiskRows.filter((risk) => normalizeText(risk.level) === 'critical').length
      const sourceTypeBreakdown = Array.from(
        // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
        activeRiskRows.reduce((map, risk) => {
          const sourceType = normalizeText(risk.source_type) || 'manual'
          map.set(sourceType, (map.get(sourceType) || 0) + 1)
          return map
        }, new Map<string, number>()),
      )
        .map(([sourceType, count]) => ({ sourceType, count }))
        .sort((left, right) => right.count - left.count)

      const trend = dateKeys.map((date) => trendMap.get(date) ?? {
        date,
        newRisks: 0,
        resolvedRisks: 0,
        totalRisks: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        newIssues: 0,
        resolvedIssues: 0,
        totalIssues: 0,
        newWarnings: 0,
        resolvedWarnings: 0,
        totalWarnings: 0,
      })

      const summary = {
        // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
        totalNewRisks: trend.reduce((sum, t) => sum + t.newRisks, 0),
        // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
        totalResolvedRisks: trend.reduce((sum, t) => sum + t.resolvedRisks, 0),
        currentTotalRisks: activeRiskRows.length > 0 ? activeRiskRows.length : (trend.length > 0 ? trend[trend.length - 1].totalRisks : 0),
        currentCriticalRisks,
        currentIssueCount: activeIssueCount,
        currentWarningCount: activeWarningCount,
        riskChangeRate: this.calculateChangeRate(trend),
      };

      return { trend, summary, sourceTypeBreakdown, pipelineStages };
    } catch (error) {
      console.error('获取风险趋势失败:', error);
      return {
        trend: [],
        summary: {
          totalNewRisks: 0,
          totalResolvedRisks: 0,
          currentTotalRisks: 0,
          currentCriticalRisks: 0,
          currentIssueCount: 0,
          currentWarningCount: 0,
          riskChangeRate: 0,
        },
        sourceTypeBreakdown: [],
        pipelineStages: { identified: 0, assessed: 0, responded: 0, monitored: 0 },
      };
    }
  }

  /**
   * 计算风险变化率
   */
  private calculateChangeRate(trend: RiskTrendData[]): number {
    if (trend.length < 2) return 0;
    const firstDay = trend[0].totalRisks;
    const lastDay = trend[trend.length - 1].totalRisks;
    if (firstDay === 0) return lastDay > 0 ? 100 : 0;
    return Math.round(((lastDay - firstDay) / firstDay) * 100);
  }

  /**
   * 获取最新统计快照
   */
  async getLatestSnapshot(projectId: string): Promise<RiskStatistics | null> {
    try {
      const { data, error } = await supabase
        .from('risk_statistics')
        .select('*')
        .eq('project_id', projectId)
        .order('stat_date', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // not found
        throw error;
      }
      return (data as RiskStatistics) || null;
    } catch (error) {
      console.error('获取最新统计快照失败:', error);
      return null;
    }
  }

  /**
   * 批量生成历史统计数据（用于初始化）
   * @param projectId 项目ID
   * @param days 生成天数
   */
  async generateHistoricalSnapshots(projectId: string, days: number = 30): Promise<number> {
    let generated = 0;
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const result = await this.generateDailySnapshot(projectId, dateStr);
      if (result) generated++;
    }

    return generated;
  }
}

export const riskStatisticsService = new RiskStatisticsService();
