/**
 * 手动触发定时任务测试脚本
 */

import { riskStatisticsJob } from './src/jobs/riskStatisticsJob.js';
import { executeWarningCheck } from './src/services/preMilestoneWarningService.js';
import { logger } from './src/middleware/logger.js';

async function testRiskStatistics() {
  console.log('\n=== 测试风险统计定时任务 ===');
  try {
    const result = await riskStatisticsJob.executeNow();
    console.log('✅ 风险统计任务执行成功:', result);
    return result;
  } catch (error) {
    console.error('❌ 风险统计任务执行失败:', error);
    throw error;
  }
}

async function testPreMilestoneWarning() {
  console.log('\n=== 测试前期证照预警任务 ===');
  try {
    const result = await executeWarningCheck();
    console.log('✅ 证照预警任务执行成功:', result);
    return result;
  } catch (error) {
    console.error('❌ 证照预警任务执行失败:', error);
    throw error;
  }
}

async function main() {
  try {
    // 测试风险统计任务
    const riskResult = await testRiskStatistics();

    // 测试证照预警任务
    const warningResult = await testPreMilestoneWarning();

    console.log('\n=== 所有测试完成 ===');
    console.log('风险统计结果:', riskResult);
    console.log('证照预警结果:', warningResult);

    process.exit(0);
  } catch (error) {
    console.error('\n=== 测试失败 ===');
    console.error(error);
    process.exit(1);
  }
}

main();
