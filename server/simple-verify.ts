/**
 * 简化版定时任务验证
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function checkTables() {
  console.log('=== 数据库表检查 ===\n');

  const tables = [
    'projects',
    'pre_milestones',
    'risk_statistics',
    'warnings',
    'job_execution_logs'
  ];

  const results: any = {};

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('id')
        .limit(1);
      
      results[table] = !error && data !== null;
      
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: 存在 (${data?.length || 0} 条记录)`);
      }
    } catch (e: any) {
      results[table] = false;
      console.log(`❌ ${table}: ${e.message}`);
    }
  }

  return results;
}

async function checkProjects() {
  console.log('\n=== 项目统计 ===\n');
  
  try {
    const { data, count, error } = await supabase
      .from('projects')
      .select('id, name, status', { count: 'exact' })
      .eq('status', 'active');

    if (error) {
      console.log(`❌ 查询失败: ${error.message}`);
      return { active: 0, total: 0 };
    }

    console.log(`✅ 活跃项目: ${count} 个`);
    
    if (data && data.length > 0) {
      console.log('\n项目列表:');
      data.forEach((p: any, i: number) => {
        console.log(`  ${i + 1}. ${p.name}`);
      });
    }

    return { active: count || 0, total: data?.length || 0 };
  } catch (e: any) {
    console.log(`❌ 查询失败: ${e.message}`);
    return { active: 0, total: 0 };
  }
}

async function main() {
  console.log('╔═════════════════════════════════════════════╗');
  console.log('║       定时任务验证工具（简化版）               ║');
  console.log('╚═════════════════════════════════════════════╝\n');

  const tables = await checkTables();
  const projects = await checkProjects();

  console.log('\n╔═════════════════════════════════════════════╗');
  console.log('║              验证总结                       ║');
  console.log('╚═════════════════════════════════════════════╝\n');

  console.log('核心表状态:');
  console.log(`  projects: ${tables.projects ? '✅' : '❌'}`);
  console.log(`  pre_milestones: ${tables.pre_milestones ? '✅' : '❌'} ⭐ 关键`);
  console.log(`  risk_statistics: ${tables.risk_statistics ? '✅' : '❌'}`);
  console.log(`  warnings: ${tables.warnings ? '✅' : '❌'}`);
  console.log(`  job_execution_logs: ${tables.job_execution_logs ? '✅' : '❌'}`);

  console.log('\n项目数据:');
  console.log(`  活跃项目: ${projects.active} 个`);

  console.log('\n定时任务能力:');
  console.log(`  风险统计: ${tables.risk_statistics && tables.job_execution_logs ? '✅ 可用' : '❌ 不可用'}`);
  console.log(`  证照预警: ${tables.pre_milestones && tables.warnings ? '✅ 可用' : '❌ 不可用'}`);

  if (!tables.pre_milestones) {
    console.log('\n⚠️  关键问题: pre_milestones 表不存在');
    console.log('解决方案: 在 Supabase SQL Editor 中执行 migration-pre_milestones.sql');
    process.exit(1);
  }

  if (projects.active === 0) {
    console.log('\n⚠️  警告: 没有活跃项目');
    console.log('建议: 创建测试项目或激活现有项目');
    process.exit(0);
  }

  console.log('\n✅ 验证通过！可以启动定时任务调度器');
  console.log('\n启动命令:');
  console.log('  npx tsx -r dotenv/config src/scheduler.ts\n');

  process.exit(0);
}

main();
