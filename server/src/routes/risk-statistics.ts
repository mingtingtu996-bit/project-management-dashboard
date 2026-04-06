/**
 * 风险统计 API 路由
 * 提供风险趋势分析数据接口
 */

import { Router } from 'express';
import { riskStatisticsService } from '../services/riskStatisticsService.js';
import { authenticate as requireAuth, optionalAuthenticate } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/risk-statistics/trend
 * 获取项目风险趋势数据
 * Query: projectId (required), days (optional, default 30)
 */
router.get('/trend', optionalAuthenticate, async (req, res) => {
  try {
    const { projectId, days = '30' } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少 projectId 参数'
      });
    }

    const daysNum = parseInt(days as string, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      return res.status(400).json({
        success: false,
        error: 'days 参数必须在 1-365 之间'
      });
    }

    const trendData = await riskStatisticsService.getRiskTrend(projectId, daysNum);

    res.json({
      success: true,
      data: trendData
    });
  } catch (error) {
    console.error('获取风险趋势失败:', error);
    res.status(500).json({
      success: false,
      error: '获取风险趋势失败'
    });
  }
});

/**
 * GET /api/risk-statistics/latest
 * 获取项目最新统计快照
 * Query: projectId (required)
 */
router.get('/latest', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少 projectId 参数'
      });
    }

    const snapshot = await riskStatisticsService.getLatestSnapshot(projectId);

    res.json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    console.error('获取最新统计快照失败:', error);
    res.status(500).json({
      success: false,
      error: '获取最新统计快照失败'
    });
  }
});

/**
 * POST /api/risk-statistics/generate
 * 手动生成指定日期的统计快照（管理员/调试用途）
 * Body: projectId (required), date (optional, default today)
 */
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { projectId, date } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少 projectId 参数'
      });
    }

    const statDate = date || new Date().toISOString().split('T')[0];
    const snapshot = await riskStatisticsService.generateDailySnapshot(projectId, statDate);

    if (!snapshot) {
      return res.status(500).json({
        success: false,
        error: '生成统计快照失败'
      });
    }

    res.json({
      success: true,
      data: snapshot,
      message: `成功生成 ${statDate} 的统计快照`
    });
  } catch (error) {
    console.error('生成统计快照失败:', error);
    res.status(500).json({
      success: false,
      error: '生成统计快照失败'
    });
  }
});

/**
 * POST /api/risk-statistics/generate-historical
 * 批量生成历史统计数据（初始化用途）
 * Body: projectId (required), days (optional, default 30)
 */
router.post('/generate-historical', requireAuth, async (req, res) => {
  try {
    const { projectId, days = 30 } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少 projectId 参数'
      });
    }

    const daysNum = typeof days === 'string' ? parseInt(days, 10) : days;
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      return res.status(400).json({
        success: false,
        error: 'days 参数必须在 1-365 之间'
      });
    }

    const generated = await riskStatisticsService.generateHistoricalSnapshots(projectId, daysNum);

    res.json({
      success: true,
      data: { generatedCount: generated },
      message: `成功生成 ${generated} 条历史统计记录`
    });
  } catch (error) {
    console.error('生成历史统计数据失败:', error);
    res.status(500).json({
      success: false,
      error: '生成历史统计数据失败'
    });
  }
});

/**
 * GET /api/risk-statistics/summary
 * 获取风险统计汇总（用于Dashboard展示）
 * Query: projectId (required)
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少 projectId 参数'
      });
    }

    // 获取最近7天和30天的趋势数据
    const [weekTrend, monthTrend] = await Promise.all([
      riskStatisticsService.getRiskTrend(projectId, 7),
      riskStatisticsService.getRiskTrend(projectId, 30)
    ]);

    const latest = monthTrend.trend.length > 0 
      ? monthTrend.trend[monthTrend.trend.length - 1] 
      : null;

    res.json({
      success: true,
      data: {
        week: weekTrend.summary,
        month: monthTrend.summary,
        latest: latest,
        trend: monthTrend.trend
      }
    });
  } catch (error) {
    console.error('获取风险统计汇总失败:', error);
    res.status(500).json({
      success: false,
      error: '获取风险统计汇总失败'
    });
  }
});

export default router;
