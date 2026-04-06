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
  resolved_risks: number;
  resolved_high_risks: number;
  resolved_medium_risks: number;
  resolved_low_risks: number;
  total_risks: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
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
}

export interface RiskTrendSummary {
  trend: RiskTrendData[];
  summary: {
    totalNewRisks: number;
    totalResolvedRisks: number;
    currentTotalRisks: number;
    riskChangeRate: number; // 风险变化率
  };
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
        .select('level, status')
        .eq('project_id', projectId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      // 2. 统计当日已处理的风险
      const { data: resolvedRisks } = await supabase
        .from('risks')
        .select('level')
        .eq('project_id', projectId)
        .eq('status', 'resolved')
        .gte('updated_at', startOfDay)
        .lte('updated_at', endOfDay);

      // 3. 获取当前风险存量（快照）
      const { data: currentRisks } = await supabase
        .from('risks')
        .select('level, status, title')
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
        total_risks: stats.total_risks,
        high_risk_count: stats.high_risk_count,
        medium_risk_count: stats.medium_risk_count,
        low_risk_count: stats.low_risk_count,
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

    // 已处理风险统计
    const resolvedHigh = resolvedRisks.filter(r => r.level === 'high').length;
    const resolvedMedium = resolvedRisks.filter(r => r.level === 'medium').length;
    const resolvedLow = resolvedRisks.filter(r => r.level === 'low').length;

    // 当前存量统计
    const activeRisks = currentRisks.filter(r => r.status !== 'resolved');
    const highCount = activeRisks.filter(r => r.level === 'high').length;
    const mediumCount = activeRisks.filter(r => r.level === 'medium').length;
    const lowCount = activeRisks.filter(r => r.level === 'low').length;

    // 按类型统计（根据 title 关键词推断）
    const delayCount = activeRisks.filter(r => r.title?.includes('延期')).length;
    const obstacleCount = activeRisks.filter(r => r.title?.includes('阻碍') || r.title?.includes('受阻')).length;
    const conditionCount = activeRisks.filter(r => r.title?.includes('条件') || r.title?.includes('前置')).length;
    const generalCount = activeRisks.filter(r =>
      !r.title?.includes('延期') && !r.title?.includes('阻碍') && !r.title?.includes('受阻') && !r.title?.includes('条件') && !r.title?.includes('前置')
    ).length;

    return {
      new_risks: newRisks.length,
      new_high_risks: newHigh,
      new_medium_risks: newMedium,
      new_low_risks: newLow,
      resolved_risks: resolvedRisks.length,
      resolved_high_risks: resolvedHigh,
      resolved_medium_risks: resolvedMedium,
      resolved_low_risks: resolvedLow,
      total_risks: activeRisks.length,
      high_risk_count: highCount,
      medium_risk_count: mediumCount,
      low_risk_count: lowCount,
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

      const { data, error } = await supabase
        .from('risk_statistics')
        .select('*')
        .eq('project_id', projectId)
        .gte('stat_date', startDateStr)
        .lte('stat_date', endDateStr)
        .order('stat_date', { ascending: true });

      if (error) throw error;

      const trend: RiskTrendData[] = (data || []).map((stat: any) => ({
        date: stat.stat_date,
        newRisks: stat.new_risks,
        resolvedRisks: stat.resolved_risks,
        totalRisks: stat.total_risks,
        highRiskCount: stat.high_risk_count,
        mediumRiskCount: stat.medium_risk_count,
        lowRiskCount: stat.low_risk_count,
      }));

      const summary = {
        totalNewRisks: trend.reduce((sum, t) => sum + t.newRisks, 0),
        totalResolvedRisks: trend.reduce((sum, t) => sum + t.resolvedRisks, 0),
        currentTotalRisks: trend.length > 0 ? trend[trend.length - 1].totalRisks : 0,
        riskChangeRate: this.calculateChangeRate(trend),
      };

      return { trend, summary };
    } catch (error) {
      console.error('获取风险趋势失败:', error);
      return { trend: [], summary: { totalNewRisks: 0, totalResolvedRisks: 0, currentTotalRisks: 0, riskChangeRate: 0 } };
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
