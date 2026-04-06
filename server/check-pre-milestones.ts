import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 配置未找到');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPreMilestones() {
  console.log('🔍 检查 pre_milestones 表状态...\n');

  try {
    // 方法1: 尝试查询表
    const { data, error, count } = await supabase
      .from('pre_milestones')
      .select('*', { count: 'exact', head: false })
      .limit(1);

    if (error) {
      console.error('❌ 表不存在或查询失败');
      console.error('错误信息:', error.message);
      console.error('错误代码:', error.code);
      console.error('错误详情:', error.details);
      console.error('\n✅ 解决方案: 执行 migration-pre_milestones.sql 创建表');
      return false;
    }

    console.log('✅ pre_milestones 表存在');
    console.log(`📊 表中有 ${count || 0} 条记录`);

    // 检查表结构
    const { data: tableInfo } = await supabase
      .from('pre_milestones')
      .select('*')
      .limit(1);

    if (tableInfo && tableInfo.length > 0) {
      console.log('\n📋 表结构:');
      console.log('字段:', Object.keys(tableInfo[0]).join(', '));
      console.log('示例记录:', JSON.stringify(tableInfo[0], null, 2));
    } else {
      console.log('\n📋 表结构（通过查询结果推断）:');
      console.log('字段: id, project_id, milestone_type, milestone_name, ...');
    }

    return true;

  } catch (error: any) {
    console.error('❌ 检查过程中发生错误');
    console.error('错误类型:', error.name);
    console.error('错误信息:', error.message);

    // 分析错误类型
    if (error.code === '42P01') {
      console.log('\n✅ 诊断: 表不存在 (错误代码 42P01)');
      console.log('✅ 解决方案: 执行 migration-pre_milestones.sql 创建表');
    } else {
      console.log('\n⚠️  未知错误，需要进一步调查');
    }

    return false;
  }
}

async function checkAllRequiredTables() {
  console.log('\n🔍 检查所有必需的表...\n');

  const tables = [
    'projects',
    'tasks',
    'milestones',
    'risks',
    'pre_milestones',
    'task_conditions',
    'task_obstacles',
    'acceptance_plans'
  ];

  const results: any = {};

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        results[table] = { exists: false, error: error.message };
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        results[table] = { exists: true, count: count || 0 };
        console.log(`✅ ${table}: ${count || 0} 条记录`);
      }
    } catch (error: any) {
      results[table] = { exists: false, error: error.message };
      console.log(`❌ ${table}: ${error.message}`);
    }
  }

  console.log('\n📊 总结:');
  const existing = Object.values(results).filter((r: any) => r.exists).length;
  console.log(`已存在表: ${existing}/${tables.length}`);

  const missing = tables.filter(t => !results[t].exists);
  if (missing.length > 0) {
    console.log(`缺失表: ${missing.join(', ')}`);
  }

  return results;
}

// 执行检查
(async () => {
  console.log('='.repeat(60));
  console.log('数据库表状态检查');
  console.log('='.repeat(60));

  await checkPreMilestones();
  await checkAllRequiredTables();

  console.log('\n' + '='.repeat(60));
})();
