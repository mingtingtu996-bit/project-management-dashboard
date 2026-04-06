// 独立测试脚本：直接调用前期证照预警检查函数
// 避免网络和 SDK 兼容性问题

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量（必须在任何其他导入之前）
const envPath = path.resolve(process.cwd(), '.env');
console.log('📦 正在加载环境变量...');
dotenv.config({ path: envPath });

if (!process.env.SUPABASE_URL) {
  console.error('❌ 未找到 SUPABASE_URL 环境变量');
  console.error(`   .env 文件路径: ${envPath}`);
  process.exit(1);
}

console.log('✅ 环境变量加载完成');

// 动态导入（确保环境变量先加载）
const { executeWarningCheck } = await import('./src/services/preMilestoneWarningService.js');
const { logger } = await import('./src/middleware/logger.js');

console.log('🧪 开始前期证照预警功能独立测试\n');
console.log('⚠️  这个脚本会：');
console.log('   1. 检查所有有效的前期证照');
console.log('   2. 识别过期或即将过期的证照');
console.log('   3. 自动生成预警记录到 warnings 表');
console.log('   4. 清理已完成/已取消证照的预警\n');

console.log('请确保：');
console.log('✅ 数据库中有测试项目');
console.log('✅ 项目中至少有一个前期证照（pre_milestones 表）');
console.log('✅ Supabase 连接配置正确\n');

// 执行预警检查
executeWarningCheck()
  .then(result => {
    console.log('\n✅ 预警检查完成！\n');
    console.log('📊 检查结果：');
    console.log(`   - 即将过期证照：${result.expiring} 个`);
    console.log(`   - 已过期证照：${result.overdue} 个`);
    console.log(`   - 生成预警数：${result.warningsCreated} 个`);
    console.log(`   - 清理预警数：${result.warningsCleaned} 个`);

    if (result.warningsCreated > 0) {
      console.log('\n🎯 预警已成功生成到 warnings 表！');
    } else {
      console.log('\nℹ️  当前没有需要预警的证照');
    }

    if (result.warningsCleaned > 0) {
      console.log(`\n🧹 已清理 ${result.warningsCleaned} 个已完成/已取消证照的预警记录`);
    }

    console.log('\n💡 验证步骤：');
    console.log('1. 登录 Supabase Dashboard');
    console.log('2. 打开 Table Editor → warnings 表');
    console.log('3. 检查是否有新的预警记录生成');
    console.log('4. 查看预警的 project_id, warning_type, warning_level 字段');
    console.log('5. 特别关注 warning_type=\'permit_expiry\' 的记录');

    console.log('\n✨ 测试成功！');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ 预警检查失败：');
    console.error(error);
    process.exit(1);
  });
