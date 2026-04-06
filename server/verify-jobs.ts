/**
 * 定时任务验证脚本（独立运行，不依赖调度器）
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from './src/middleware/logger.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

/**
 * 测试 1: 检查数据库连接
 */
async function testDatabaseConnection() {
  console.log('\n=== 测试 1: 数据库连接 ===\n');
  
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, status')
      .limit(1);

    if (error) throw error;

    console.log('✅ 数据库连接成功');
    console.log(`  找到项目: ${data?.length || 0} 个`);
    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    return false;
  }
}

/**
 * 测试 2: 检查 pre_milestones 表是否存在
 */
async function testPreMilestonesTable() {
  console.log('\n=== 测试 2: pre_milestones 表检查 ===\n');
  
  try {
    const { data, error } = await supabase
      .from('pre_milestones')
      .select('id')
      .limit(1);

    if (error) {
      console.log('❌ pre_milestones 表不存在');
      console.log(`  错误: ${error.message}`);
      return false;
    }

    console.log('✅ pre_milestones 表存在');
    console.log(`  记录数: ${data?.length || 0} 条`);
    return true;
  } catch (error) {
    console.log('❌ pre_milestones 表不存在');
    console.log(`  错误: ${error.message}`);
    return false;
  }
}

/**
 * 测试 3: 检查 risk_statistics 表是否存在
 */
async function testRiskStatisticsTable() {
  console.log('\n=== 测试 3: risk_statistics 表检查 ===\n');
  
  try {
    const { data, error } = await supabase
      .from('risk_statistics')
      .select('id')
      .limit(1);

    if (error) {
      console.log('❌ risk_statistics 表不存在');
      console.log(`  错误: ${error.message}`);
      return false;
    }

    console.log('✅ risk_statistics 表存在');
    console.log(`  记录数: ${data?.length || 0} 条`);
    return true;
  } catch (error) {
    console.log('❌ risk_statistics 表不存在');
    console.log(`  错误: ${error.message}`);
    return false;
  }
}

/**
 * 测试 4: 检查 warnings 表是否存在
 */
async function testWarningsTable() {
  console.log('\n=== 测试 4: warnings 表检查 ===\n');
  
  try {
    const { data, error } = await supabase
      .from('warnings')
      .select('id')
      .limit(1);

    if (error) {
      console.log('❌ warnings 表不存在');
      console.log(`  错误: ${error.message}`);
      return false;
    }

    console.log('✅ warnings 表存在');
    console.log(`  记录数: ${data?.length || 0} 条`);
    return true;
  } catch (error) {
    console.log('❌ warnings 表不存在');
    console.log(`  错误: ${error.message}`);
    return false;
  }
}

/**
 * 测试 5: 检查 job_execution_logs 表是否存在
 */
async function testJobExecutionLogsTable() {
  console.log('\n=== 测试 5: job_execution_logs 表检查 ===\n');
  
  try {
    const { data, error } = await supabase
      .from('job_execution_logs')
      .select('id')
      .limit(1);

    if (error) {
      console.log('❌ job_execution_logs 表不存在');
      console.log(`  错误: ${error.message}`);
      return false;
    }

    console.log('✅ job_execution_logs 表存在');
    console.log(`  记录数: ${data?.length || 0} 条`);
    return true;
  } catch (error) {
    console.log('❌ job_execution_logs 表不存在');
    console.log(`  错误: ${error.message}`);
    return false;
  }
}

/**
 * 测试 6: 统计活跃项目数量
 */
async function testActiveProjectsCount() {
  console.log('\n=== 测试 6: 活跃项目统计 ===\n');
  
  try {
    const { data, error, count } = await supabase
      .from('projects')
      .select('id, name', { count: 'exact' })
      .eq('status', 'active');

    if (error) throw error;

    console.log('✅ 统计完成');
    console.log(`  活跃项目数: ${count || 0} 个`);
    
    if (data && data.length > 0) {
      console.log('  项目列表:');
      data.forEach((p, i) => {
        console.log(`    ${i + 1}. ${p.name} (${p.id})`);
      });
    }
    
    return count || 0;
  } catch (error) {
    console.error('❌ 统计失败:', error.message);
    return 0;
  }
}

/**
 * 测试 7: 风险统计服务测试
 */
async function testRiskStatisticsService() {
  console.log('\n=== 测试 7: 风险统计服务 ===\n');
  
  try {
    const { riskStatisticsService } = await import('./src/services/riskStatisticsService.js');
    
    // 获取活跃项目
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('status', 'active')
      .limit(1);

    if (!projects || projects.length === 0) {
      console.log('⚠️  没有活跃项目，跳过风险统计测试');
      return { success: 0, failed: 0 };
    }

    const projectId = projects[0].id;
    const today = new Date().toISOString().split('T')[0];

    console.log(`  测试项目: ${projectId}`);
    console.log(`  统计日期: ${today}`);

    const result = await riskStatisticsService.generateDailySnapshot(projectId, today);
    
    if (result) {
      console.log('✅ 风险统计快照生成成功');
      console.log(`  快照ID: ${result.id}`);
      return { success: 1, failed: 0 };
    } else {
      console.log('⚠️  风险统计快照生成返回空');
      return { success: 0, failed: 1 };
    }
  } catch (error) {
    console.error('❌ 风险统计服务测试失败:', error.message);
    return { success: 0, failed: 1 };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║      定时任务数据库验证工具                   ║');
  console.log('╚════════════════════════════════════════════════╝');

  const results = {
    databaseConnection: false,
    preMilestonesTable: false,
    riskStatisticsTable: false,
    warningsTable: false,
    jobExecutionLogsTable: false,
    activeProjectsCount: 0,
    riskStatisticsTest: { success: 0, failed: 0 }
  };

  // 执行所有测试
  results.databaseConnection = await testDatabaseConnection();
  results.preMilestonesTable = await testPreMilestonesTable();
  results.riskStatisticsTable = await testRiskStatisticsTable();
  results.warningsTable = await testWarningsTable();
  results.jobExecutionLogsTable = await testJobExecutionLogsTable();
  results.activeProjectsCount = await testActiveProjectsCount();

  // 只有在相关表存在时才测试服务
  if (results.riskStatisticsTable && results.databaseConnection) {
    results.riskStatisticsTest = await testRiskStatisticsService();
  }

  // 打印总结
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║                 验证总结                          ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  console.log('数据库状态:');
  console.log(`  连接状态: ${results.databaseConnection ? '✅' : '❌'}`);
  console.log(`  pre_milestones 表: ${results.preMilestonesTable ? '✅' : '❌'}`);
  console.log(`  risk_statistics 表: ${results.riskStatisticsTable ? '✅' : '❌'}`);
  console.log(`  warnings 表: ${results.warningsTable ? '✅' : '❌'}`);
  console.log(`  job_execution_logs 表: ${results.jobExecutionLogsTable ? '✅' : '❌'}`);

  console.log('\n业务数据:');
  console.log(`  活跃项目数: ${results.activeProjectsCount} 个`);

  console.log('\n定时任务能力:');
  console.log(`  风险统计: ${results.riskStatisticsTest.success > 0 ? '✅ 可用' : '❌ 不可用'}`);
  console.log(`  证照预警: ${results.preMilestonesTable ? '✅ 可用' : '❌ 不可用（表缺失）'}`);

  // 给出建议
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║                 下一步建议                          ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  if (!results.preMilestonesTable) {
    console.log('⚠️  关键问题: pre_milestones 表不存在');
    console.log('\n解决步骤:');
    console.log('1. 打开 Supabase Dashboard');
    console.log('2. 进入 SQL Editor');
    console.log('3. 执行 migration-pre_milestones.sql 中的 SQL');
    console.log('4. 重新运行此验证脚本\n');
  } else if (results.riskStatisticsTest.success > 0) {
    console.log('✅ 所有条件满足，可以启动定时任务调度器');
    console.log('\n启动命令:');
    console.log('  npx tsx -r dotenv/config src/scheduler.ts\n');
  } else if (results.activeProjectsCount === 0) {
    console.log('⚠️  警告: 没有活跃项目');
    console.log('\n建议:');
    console.log('1. 创建测试项目');
    console.log('2. 添加一些测试数据');
    console.log('3. 再次运行验证\n');
  } else {
    console.log('⚠️  部分表或功能可能存在问题');
    console.log('\n建议检查:');
    console.log('1. 迁移文件是否已全部执行');
    console.log('2. RLS 策略是否正确配置');
    console.log('3. 服务代码是否有错误\n');
  }

  process.exit(results.preMilestonesTable && results.riskStatisticsTable ? 0 : 1);
}

main();
