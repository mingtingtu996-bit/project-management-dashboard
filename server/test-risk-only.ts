/**
 * 只测试风险统计任务（不依赖 pre_milestones 表）
 */

import { riskStatisticsJob } from './src/jobs/riskStatisticsJob.js';

async function main() {
  console.log('\n=== 单独测试风险统计定时任务 ===\n');

  try {
    const result = await riskStatisticsJob.executeNow();
    
    console.log('✅ 风险统计任务执行成功!');
    console.log('\n执行结果:');
    console.log(`  成功统计: ${result.success} 个项目`);
    console.log(`  失败统计: ${result.failed} 个项目`);
    console.log(`  总计处理: ${result.success + result.failed} 个项目`);

    console.log('\n任务状态:');
    const status = riskStatisticsJob.getStatus();
    console.log(`  运行中: ${status.isRunning}`);
    console.log(`  已调度: ${status.isScheduled}`);
    console.log(`  上次运行: ${status.lastRun}`);
    console.log(`  下次运行: ${status.nextRun}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 风险统计任务执行失败:', error);
    process.exit(1);
  }
}

main();
