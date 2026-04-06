/**
 * 风险统计定时任务
 * 每日凌晨生成风险统计快照
 */

import { riskStatisticsService } from '../services/riskStatisticsService.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../middleware/logger.js';

// 创建 Supabase 客户端
function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase configuration missing. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in your .env file.');
  }
  
  return createClient(url, key);
}

class RiskStatisticsJob {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private lastRun: Date | null = null;
  private nextRun: Date | null = null;

  /**
   * 启动定时任务
   * 默认每天凌晨 2:00 执行
   */
  start(schedule: string = '0 2 * * *') {
    if (this.timer) {
      logger.warn('风险统计定时任务已在运行');
      return;
    }

    logger.info('启动风险统计定时任务', { schedule });

    // 计算到下一个执行时间的时间差
    this.nextRun = this.getNextRunTime(schedule);
    const delay = this.nextRun.getTime() - Date.now();

    // 设置首次执行定时器
    setTimeout(() => {
      this.execute('scheduler');
      // 之后每24小时执行一次
      this.timer = setInterval(() => {
        this.execute('scheduler');
      }, 24 * 60 * 60 * 1000);
    }, delay);

    logger.info(`风险统计定时任务已设置，下次执行时间: ${this.nextRun.toISOString()}`);
  }

  /**
   * 停止定时任务
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('风险统计定时任务已停止');
    }
  }

  /**
   * 立即执行一次统计
   */
  async executeNow(): Promise<{ success: number; failed: number }> {
    return this.execute('manual');
  }

  /**
   * 执行统计任务
   */
  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler'): Promise<{ success: number; failed: number }> {
    if (this.isRunning) {
      logger.warn('风险统计任务正在执行中，跳过本次');
      return { success: 0, failed: 0 };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const startedAt = new Date();
    const jobId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    let success = 0;
    let failed = 0;
    let errorMessage: string | null = null;

    try {
      logger.info('开始执行风险统计任务', { triggeredBy, jobId });

      // 获取所有项目
      const supabase = createSupabaseClient();
      const { data: projects, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('status', 'active');

      if (error) {
        throw error;
      }

      if (!projects || projects.length === 0) {
        logger.info('没有活跃项目需要统计');
        return { success: 0, failed: 0 };
      }

      logger.info(`找到 ${projects.length} 个活跃项目`);

      // 为每个项目生成统计快照
      const today = new Date().toISOString().split('T')[0];

      for (const project of projects) {
        try {
          const result = await riskStatisticsService.generateDailySnapshot(project.id, today);
          if (result) {
            success++;
            logger.debug(`项目 ${project.name} (${project.id}) 统计快照生成成功`);
          } else {
            failed++;
            logger.error(`项目 ${project.name} (${project.id}) 统计快照生成失败`);
          }
        } catch (err) {
          failed++;
          logger.error(`项目 ${project.name} (${project.id}) 统计失败:`, err);
        }
      }

      const duration = Date.now() - startTime;
      this.lastRun = startedAt;

      // 计算下次执行时间（仅对调度触发）
      if (triggeredBy === 'scheduler') {
        this.nextRun = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);
      }

      logger.info('风险统计任务完成', {
        duration: `${duration}ms`,
        total: projects.length,
        success,
        failed
      });

      // 记录执行日志
      await this.logExecution({
        jobName: 'riskStatisticsJob',
        status: 'success',
        startedAt,
        completedAt: new Date(),
        durationMs: duration,
        result: { success, failed, total: projects.length },
        triggeredBy,
        jobId
      });

      return { success, failed };
    } catch (error) {
      const duration = Date.now() - startTime;
      errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('风险统计任务执行失败:', error);

      // 记录执行日志（失败）
      await this.logExecution({
        jobName: 'riskStatisticsJob',
        status: 'error',
        startedAt,
        completedAt: new Date(),
        durationMs: duration,
        result: { success, failed },
        errorMessage,
        triggeredBy,
        jobId
      });

      return { success, failed };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 获取下次执行时间
   * 简单实现：每天凌晨 2:00
   */
  private getNextRunTime(schedule: string): Date {
    const now = new Date();
    const next = new Date(now);
    next.setHours(2, 0, 0, 0);

    // 如果今天2点已过，设置为明天2点
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * 记录执行日志到数据库
   */
  private async logExecution(params: {
    jobName: string;
    status: 'success' | 'error' | 'timeout';
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
    result: any;
    triggeredBy: 'scheduler' | 'manual' | 'api';
    jobId: string;
    errorMessage?: string;
  }) {
    try {
      const supabase = createSupabaseClient();

      await supabase
        .from('job_execution_logs')
        .insert({
          job_name: params.jobName,
          status: params.status,
          started_at: params.startedAt.toISOString(),
          completed_at: params.completedAt.toISOString(),
          duration_ms: params.durationMs,
          result: params.result,
          error_message: params.errorMessage || null,
          job_id: params.jobId,
          triggered_by: params.triggeredBy
        });

      logger.debug('任务执行日志已记录', { jobId: params.jobId });
    } catch (error) {
      logger.error('记录任务执行日志失败:', error);
      // 不影响主任务执行，仅记录错误
    }
  }

  /**
   * 获取任务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.timer !== null,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null
    };
  }
}

// 导出单例
export const riskStatisticsJob = new RiskStatisticsJob();
