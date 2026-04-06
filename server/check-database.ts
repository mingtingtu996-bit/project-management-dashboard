import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 配置缺失');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  console.log('🔍 开始检查数据库状态...\n');

  // 1. 检查数据库连接
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ 数据库连接失败:', error.message);
      process.exit(1);
    }
    console.log('✅ 数据库连接成功');
  } catch (e) {
    console.error('❌ 数据库连接异常:', e);
    process.exit(1);
  }

  // 2. 检查关键表是否存在
  const tables = [
    'projects',
    'tasks',
    'milestones',
    'risks',
    'task_conditions',
    'task_obstacles',
    'pre_milestones',
    'acceptance_plans',
    'job_execution_logs'
  ];

  console.log('\n📊 表结构检查:');
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        if (error.code === '42P01') { // 表不存在
          console.log(`  ❌ ${table}: 表不存在`);
        } else {
          console.log(`  ⚠️  ${table}: ${error.message}`);
        }
      } else {
        console.log(`  ✅ ${table}: 正常`);
      }
    } catch (e) {
      console.log(`  ❌ ${table}: 检查失败`);
    }
  }

  // 3. 统计各表记录数
  console.log('\n📈 数据统计:');
  for (const table of ['projects', 'tasks', 'milestones', 'risks']) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`  ${table}: 检查失败`);
      } else {
        console.log(`  ${table}: ${count || 0} 条记录`);
      }
    } catch (e) {
      console.log(`  ${table}: 检查失败`);
    }
  }

  console.log('\n✅ 数据库检查完成');
}

checkDatabase().catch(console.error);
