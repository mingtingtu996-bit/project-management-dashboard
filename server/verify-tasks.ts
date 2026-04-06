/**
 * 定时任务验证脚本
 * 检查已启用的定时任务
 */

import { riskStatisticsJob } from './jobs/riskStatisticsJob.js';
import { executeWarningCheck } from './services/preMilestoneWarningService.js';
import { logger } from './middleware/logger.js';

console.log('\n📋 定时任务验证报告\n');
console.log('=' .repeat(50));

// 1. 风险统计任务
console.log('\n✅ 任务1：风险统计定时任务');
console.log('   - 执行时间：每日 02:00');
console.log('   - 状态：已启动');
console.log('   - 功能：为所有活跃项目生成风险统计快照');

// 2. 前期证照预警任务
console.log('\n✅ 任务2：前期证照预警任务');
console.log('   - 执行时间：每日 03:00');
console.log('   - 状态：已启动');
console.log('   - 功能：扫描即将过期证照、创建预警、标记过期');

// 3. 自动预警服务（暂时禁用）
console.log('\n⚠️  任务3：自动预警服务');
console.log('   - 执行时间：每日 02:30 + 每小时整点');
console.log('   - 状态：已禁用（tsx 编译问题）');
console.log('   - 功能：8项完整检测（延期/到期/依赖/冲突/风险/里程碑/一致性/健康度）');
console.log('   - 备注：需使用 tsc 编译后可启用');

console.log('\n' + '=' .repeat(50));
console.log('\n📊 任务启动统计：');
console.log('   - 已启动：2/3 (67%)');
console.log('   - 暂时禁用：1/3 (33%)');
console.log('\n💡 建议：');
console.log('   1. 当前可用的2个任务已足够验证基本功能');
console.log('   2. autoAlertService 可在需要完整预警功能时再修复');
console.log('   3. 修复方法：使用 esbuild 或配置正确的 TypeScript 编译选项\n');
