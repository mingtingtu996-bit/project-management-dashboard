/**
 * 风险统计服务
 * 用于生成每日风险统计快照，支持趋势分析
 * 已迁移至直接使用 Supabase SDK（不再依赖 executeSQL 包装层）
 */

import { supabase } from './dbService.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

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
}

const CLOSED_RISK_STATUSES = new Set(['closed', '已关闭'])
const CLOSED_ISSUE_STATUSES = new Set(['resolved', 'closed', '已解决', '已关闭'])
const RESOLVED_WARNING_STATUSES = new Set(['resolved', 'closed', '已解决', '已关闭'])

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function isClosedRiskStatus(status?: string | null) {
  return CLOSED_RISK_STATUSES.has(normalizeText(status))
}

function isClosedIssueStatus(status?: string | null) {
  return CLOSED_ISSUE_STATUSES.has(normalizeText(status))
}

function isResolvedWarningStatus(status?: string | null) {
  return RESOLVED_WARNING_STATUSES.has(normalizeText(status))
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

class RiskStatisticsService {
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
      const { data: newRisks } = await supabase
        .from('risks')
        .select('level, status, source_type, title')
        .eq('project_id', projectId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      // 2. 统计当日已处理的风险
      const { data: resolvedRisks } = await supabase
        .from('risks')
        .select('level, status, source_type, title')
        .eq('project_id', projectId)
        .in('status', ['closed', '已关闭'])
        .gte('updated_at', startOfDay)
        .lte('updated_at', endOfDay);

      // 3. 获取当前风险存量（快照）
      const { data: currentRisks } = await supabase
        .from('risks')
        .select('level, status, source_type, title')
        .eq('project_id', projectId);

      // 4. 计算统计数据
      const stats = this.calculateStatistics(
        newRisks || [],
        resolvedRisks || [],
        currentRisks || []
      );

      const now = new Date().toISOString();
      const id = uuidv4();

      // 5. UPSERT：先删除同日记录再插入
      await supabase
        .from('risk_statistics')
        .delete()
        .eq('project_id', projectId)
        .eq('stat_date', statDate);

      await supabase.from('risk_statistics').insert({
        id,
        project_id: projectId,
        stat_date: statDate,
        new_risks: stats.new_risks,
        new_high_risks: stats.new_high_risks,
        new_medium_risks: stats.new_medium_risks,
        new_low_risks: stats.new_low_risks,
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
        created_at: now,
        updated_at: now,
      });

      // 读取刚写入的记录
      const { data } = await supabase
        .from('risk_statistics')
        .select('*')
        .eq('project_id', projectId)
        .eq('stat_date', statDate)
        .single();

      return (data as RiskStatistics) || null;
    } catch (error) {
      console.error('生成风险统计快照失败:', error);
      return null;
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
    const resolvedHigh = resolvedRisks.filter(r => r.level === 'high').length;
    const resolvedMedium = resolvedRisks.filter(r => r.level === 'medium').length;
    const resolvedLow = resolvedRisks.filter(r => r.level === 'low').length;
    const resolvedCritical = resolvedRisks.filter(r => r.level === 'critical').length;

    // 当前存量统计
    const activeRisks = currentRisks.filter(r => !isClosedRiskStatus(r.status));
    const highCount = activeRisks.filter(r => r.level === 'high').length;
    const mediumCount = activeRisks.filter(r => r.level === 'medium').length;
    const lowCount = activeRisks.filter(r => r.level === 'low').length;
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
          .from('warnings')
          .select('status, warning_level, created_at, updated_at, is_acknowledged')
          .eq('project_id', projectId),
      ]);

      if (riskStatsResult.error) throw riskStatsResult.error;
      if (currentRisksResult.error) throw currentRisksResult.error;
      if (issuesResult.error) throw issuesResult.error;
      if (warningsResult.error) throw warningsResult.error;

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
      for (const stat of riskStatsResult.data ?? []) {
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

      const issueRows = (issuesResult.data ?? []) as Array<{ status?: string | null; created_at?: string | null; updated_at?: string | null }>
      const warningRows = (warningsResult.data ?? []) as Array<{ status?: string | null; created_at?: string | null; updated_at?: string | null }>
      let activeIssueCount = 0
      let activeWarningCount = 0

      for (const issue of issueRows) {
        const createdDate = toIsoDate(issue.created_at)
        if (createdDate && trendMap.has(createdDate)) {
          const point = trendMap.get(createdDate)
          if (point) point.newIssues += 1
        }

        if (isClosedIssueStatus(issue.status)) {
          const resolvedDate = toIsoDate(issue.updated_at)
          if (resolvedDate && trendMap.has(resolvedDate)) {
            const point = trendMap.get(resolvedDate)
            if (point) point.resolvedIssues += 1
          }
        } else {
          activeIssueCount += 1
        }
      }

      for (const warning of warningRows) {
        const createdDate = toIsoDate(warning.created_at)
        if (createdDate && trendMap.has(createdDate)) {
          const point = trendMap.get(createdDate)
          if (point) point.newWarnings += 1
        }

        if (isResolvedWarningStatus(warning.status)) {
          const resolvedDate = toIsoDate(warning.updated_at)
          if (resolvedDate && trendMap.has(resolvedDate)) {
            const point = trendMap.get(resolvedDate)
            if (point) point.resolvedWarnings += 1
          }
        } else {
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

      const currentRiskRows = (currentRisksResult.data ?? []) as Array<{ level?: string | null; status?: string | null; source_type?: string | null; title?: string | null }>
      const activeRiskRows = currentRiskRows.filter((risk) => !isClosedRiskStatus(risk.status))
      const currentCriticalRisks = activeRiskRows.filter((risk) => normalizeText(risk.level) === 'critical').length
      const sourceTypeBreakdown = Array.from(
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
        totalNewRisks: trend.reduce((sum, t) => sum + t.newRisks, 0),
        totalResolvedRisks: trend.reduce((sum, t) => sum + t.resolvedRisks, 0),
        currentTotalRisks: activeRiskRows.length > 0 ? activeRiskRows.length : (trend.length > 0 ? trend[trend.length - 1].totalRisks : 0),
        currentCriticalRisks,
        currentIssueCount: activeIssueCount,
        currentWarningCount: activeWarningCount,
        riskChangeRate: this.calculateChangeRate(trend),
      };

      return { trend, summary, sourceTypeBreakdown };
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
