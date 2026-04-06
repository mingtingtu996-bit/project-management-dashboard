/**
 * 定时任务调度器
 * 启动所有后台定时任务
 */

import { riskStatisticsJob } from './jobs/riskStatisticsJob.js';
import { executeWarningCheck } from './services/preMilestoneWarningService.js';
import { AutoAlertService } from './services/autoAlertService.js';
import { recordProjectHealthSnapshots } from './services/projectHealthService.js';
import { WarningService } from './services/warningService.js';
import { logger } from './middleware/logger.js';

const MAX_TIMEOUT_MS = 2_147_483_647;


/**
 * 前期证照预警定时任务类
 */
class PreMilestoneWarningJob {
  private timer: NodeJS.Timeout | null = null;

  start() {
    if (this.timer) {
      logger.warn('前期证照预警任务已在运行');
      return;
    }

    // 立即执行一次
    this.execute('scheduler');

    // 每天凌晨3:00执行
    const now = new Date();
    const tomorrow3AM = new Date(now);
    tomorrow3AM.setDate(tomorrow3AM.getDate() + 1);
    tomorrow3AM.setHours(3, 0, 0, 0);

    const initialDelay = tomorrow3AM.getTime() - now.getTime();

    setTimeout(() => {
      this.execute('scheduler');
      // 之后每24小时执行一次
      this.timer = setInterval(() => {
        this.execute('scheduler');
      }, 24 * 60 * 60 * 1000);
    }, initialDelay);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('前期证照预警任务已停止');
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    try {
      logger.info('开始执行前期证照预警检查', { triggeredBy });
      const result = await executeWarningCheck();
      logger.info('前期证照预警检查完成', result);
    } catch (error) {
      logger.error('前期证照预警检查失败', {
        triggeredBy,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const preMilestoneWarningJob = new PreMilestoneWarningJob();

/**
 * 条件/阻碍预警定时任务类
 * 定时扫描条件到期和阻碍超时，主动生成预警记录
 */
class ConditionAlertJob {
  private timer: NodeJS.Timeout | null = null;
  private warningService: WarningService;

  constructor() {
    this.warningService = new WarningService();
  }

  start() {
    if (this.timer) {
      logger.warn('条件/阻碍预警任务已在运行');
      return;
    }

    // 计算距下一个整点的毫秒数，同步到整点执行
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const initialDelay = nextHour.getTime() - now.getTime();

    setTimeout(() => {
      this.execute('scheduler');
      // 首次执行后，每60分钟执行一次
      this.timer = setInterval(() => {
        this.execute('scheduler');
      }, 60 * 60 * 1000);
    }, initialDelay);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('条件/阻碍预警任务已停止');
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    try {
      logger.info('开始执行条件/阻碍预警扫描', { triggeredBy });

      // 扫描条件到期预警
      const conditionWarnings = await this.warningService.scanConditionWarnings();
      logger.info('条件到期预警扫描完成', { count: conditionWarnings.length });

      // 扫描阻碍超时预警
      const obstacleWarnings = await this.warningService.scanObstacleWarnings();
      logger.info('阻碍超时预警扫描完成', { count: obstacleWarnings.length });

      // 生成弹窗提醒
      const reminders = await this.warningService.generateReminders();
      logger.info('弹窗提醒生成完成', { count: reminders.length });

      // 生成通知
      const notifications = await this.warningService.generateNotifications();
      logger.info('通知生成完成', { count: notifications.length });

      const total = conditionWarnings.length + obstacleWarnings.length;
      logger.info('条件/阻碍预警扫描全部完成', { total });
    } catch (error) {
      logger.error('条件/阻碍预警扫描失败', {
        triggeredBy,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const conditionAlertJob = new ConditionAlertJob();

/**
 * 健康度月度快照任务
 * 每月1日 00:05 记录一次所有活跃项目健康度，供公司驾驶舱显示“较上月变化”
 */
class HealthHistorySnapshotJob {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private nextRun: Date | null = null;

  start() {
    if (this.timer) {
      logger.warn('健康度月快照任务已在运行');
      return;
    }

    this.scheduleNextRun();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.nextRun = null;
      logger.info('健康度月快照任务已停止');
    }
  }

  private scheduleNextRun() {
    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 5, 0, 0);
    const nextRun = firstDayThisMonth > now
      ? firstDayThisMonth
      : new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 5, 0, 0);

    this.scheduleForDate(nextRun);
  }

  private scheduleForDate(targetDate: Date) {
    const now = new Date();
    const delay = Math.max(targetDate.getTime() - now.getTime(), 0);
    this.nextRun = targetDate;

    logger.info('健康度月快照任务已设置', {
      nextRun: targetDate.toISOString(),
      remainingMs: delay,
    });

    if (delay > MAX_TIMEOUT_MS) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.scheduleForDate(targetDate);
      }, MAX_TIMEOUT_MS);
      return;
    }

    this.timer = setTimeout(async () => {
      this.timer = null;
      await this.execute('scheduler');
      this.scheduleNextRun();
    }, delay);
  }


  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('健康度月快照任务正在执行中，跳过本次');
      return;
    }

    this.isRunning = true;
    try {
      logger.info('开始记录健康度月快照', { triggeredBy });
      const result = await recordProjectHealthSnapshots();
      logger.info('健康度月快照记录完成', {
        triggeredBy,
        recorded: result.recorded,
        failed: result.failed,
        period: result.period,
      });
    } catch (error) {
      logger.error('健康度月快照记录失败', {
        triggeredBy,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isRunning = false;
    }
  }
}

const healthHistorySnapshotJob = new HealthHistorySnapshotJob();

/**
 * 启动所有定时任务
 */
function startAllJobs() {
  console.log('🚀 启动定时任务调度器...\n');

  // 1. 启动风险统计定时任务（每日 02:00）
  riskStatisticsJob.start('0 2 * * *');
  console.log('✅ 风险统计定时任务已启动（每日 02:00）');

  // 2. 启动前期证照预警任务（每日 03:00）
  preMilestoneWarningJob.start();
  console.log('✅ 前期证照预警任务已启动（每日 03:00）');

  // 3. 启动自动预警服务（每日 02:30 + 每小时整点）
  const autoAlertService = new AutoAlertService();
  autoAlertService.start();
  console.log('✅ 自动预警服务已启动（每日 02:30 + 每小时整点）');

  // 4. 启动条件/阻碍预警扫描任务（每小时整点）
  conditionAlertJob.start();
  console.log('✅ 条件/阻碍预警扫描任务已启动（每小时整点）');

  // 5. 启动健康度月快照任务（每月1日 00:05）
  healthHistorySnapshotJob.start();
  console.log('✅ 健康度月快照任务已启动（每月1日 00:05）');

  console.log('\n📋 所有定时任务已启动，运行中...');
  console.log('💡 按 Ctrl+C 停止所有任务\n');

  // 优雅退出处理
  process.on('SIGINT', () => {
    console.log('\n⏹️  接收到退出信号，正在停止定时任务...');
    riskStatisticsJob.stop();
    preMilestoneWarningJob.stop();
    autoAlertService.stop();
    conditionAlertJob.stop();
    healthHistorySnapshotJob.stop();
    console.log('✅ 所有任务已停止');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n⏹️  接收到终止信号，正在停止定时任务...');
    riskStatisticsJob.stop();
    preMilestoneWarningJob.stop();
    autoAlertService.stop();
    conditionAlertJob.stop();
    healthHistorySnapshotJob.stop();
    console.log('✅ 所有任务已停止');
    process.exit(0);
  });
}

// 启动所有任务
startAllJobs();
