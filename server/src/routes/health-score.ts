/**
 * 健康度 API 路由
 * 提供项目健康度的计算和更新接口
 *
 * 路由顺序说明：固定路径（batch/avg-history/record-snapshot）必须在参数路径（/:projectId）之前
 */

import express from 'express';
import { calculateProjectHealth, recordProjectHealthSnapshots, updateProjectHealth, updateAllProjectsHealth } from '../services/projectHealthService';
import { authenticate } from '../middleware/auth.js';


const router = express.Router();
router.use(authenticate);

// ─── 固定路径路由（必须在 /:projectId 之前）──────────────────────────────

/**
 * POST /api/health-score/batch
 * 批量更新所有项目的健康度
 */
router.post('/batch', async (req, res) => {
  try {
    const updatedCount = await updateAllProjectsHealth();

    res.json({
      success: true,
      data: { updatedCount },
      message: `成功更新 ${updatedCount} 个项目的健康度`
    });
  } catch (error) {
    console.error('批量更新健康度失败:', error);
    res.status(500).json({
      success: false,
      error: '批量更新健康度失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/health-score/avg-history
 * 获取所有项目本月和上月的平均健康度
 * 供公司驾驶舱健康度卡片显示"较上月变化"
 * 返回：{ thisMonth, lastMonth, change, thisMonthPeriod, lastMonthPeriod }
 * change > 0 表示上升，< 0 表示下降，null 表示无历史数据
 */
router.get('/avg-history', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('project_health_history')
      .select('period, health_score')
      .in('period', [thisMonth, lastMonth]);

    if (error) {
      console.warn('查询历史均值失败（可能表未创建）:', error.message);
      return res.json({ success: true, data: { thisMonth: null, lastMonth: null, change: null } });
    }

    const rows = data || [];
    const thisMonthScores = rows.filter(r => r.period === thisMonth).map(r => r.health_score);
    const lastMonthScores = rows.filter(r => r.period === lastMonth).map(r => r.health_score);

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const thisAvg = avg(thisMonthScores);
    const lastAvg = avg(lastMonthScores);
    const change = thisAvg !== null && lastAvg !== null ? thisAvg - lastAvg : null;

    res.json({
      success: true,
      data: {
        thisMonth: thisAvg,
        lastMonth: lastAvg,
        change,
        thisMonthPeriod: thisMonth,
        lastMonthPeriod: lastMonth,
      }
    });
  } catch (error) {
    console.error('获取健康度历史均值失败:', error);
    res.json({ success: true, data: { thisMonth: null, lastMonth: null, change: null } });
  }
});

/**
 * POST /api/health-score/record-snapshot
 * 记录当前所有活跃项目的健康度快照
 * 写入 project_health_history，period = YYYY-MM（当前月份，UPSERT）
 * 供定时任务（每月1日执行）和手动触发使用
 */
router.post('/record-snapshot', async (req, res) => {
  try {
    const result = await recordProjectHealthSnapshots();

    res.json({
      success: true,
      data: result,
      message: `成功记录 ${result.recorded} 个项目的健康度快照（${result.period}）`
    });
  } catch (error) {
    console.error('记录健康度快照失败:', error);
    res.status(500).json({
      success: false,
      error: '记录快照失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});


// ─── 参数路径路由 ──────────────────────────────────────────────────────────

/**
 * GET /api/health-score/:projectId
 * 获取项目的健康度分数和状态（不保存）
 */
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const healthResult = await calculateProjectHealth(projectId);

    res.json({
      success: true,
      data: healthResult
    });
  } catch (error) {
    console.error('获取健康度失败:', error);
    res.status(500).json({
      success: false,
      error: '获取健康度失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/health-score/:projectId/history
 * 获取指定项目最近 N 个月的健康度历史记录
 * query: months=3（默认3个月）
 */
router.get('/:projectId/history', async (req, res) => {
  try {
    const { projectId } = req.params;
    const months = parseInt(req.query.months as string) || 3;

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('project_health_history')
      .select('period, health_score, health_status, recorded_at')
      .eq('project_id', projectId)
      .order('period', { ascending: false })
      .limit(months);

    if (error) {
      console.warn('查询健康度历史失败（可能表未创建）:', error.message);
      return res.json({ success: true, data: [] });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('获取健康度历史失败:', error);
    res.json({ success: true, data: [] });
  }
});

/**
 * PUT /api/health-score/:projectId
 * 计算并更新项目的健康度分数和状态
 */
router.put('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const healthResult = await updateProjectHealth(projectId);

    res.json({
      success: true,
      data: healthResult,
      message: '项目健康度已更新'
    });
  } catch (error) {
    console.error('更新健康度失败:', error);
    res.status(500).json({
      success: false,
      error: '更新健康度失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

export default router;
