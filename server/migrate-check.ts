/**
 * 执行数据库迁移脚本
 * 创建缺失的 pre_milestones 表
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 创建 Supabase 客户端
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('缺少 Supabase 配置');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeMigration() {
  console.log('📦 开始执行数据库迁移...\n');

  try {
    // 读取迁移 SQL 文件
    const migrationSQL = readFileSync(
      join(__dirname, 'migrations/002_add_phase1_tables.sql'),
      'utf-8'
    );

    console.log('📄 已读取迁移文件: 002_add_phase1_tables.sql');

    // 由于 Supabase JS 客户端不支持直接执行 SQL，需要手动执行
    // 这里我们通过 REST API 执行
    console.log('\n⚠️  注意: 此脚本需要手动在 Supabase Dashboard 中执行 SQL 文件');
    console.log('📁 文件路径: migrations/002_add_phase1_tables.sql');
    console.log('\n包含以下表:');
    console.log('  - task_conditions (开工条件表)');
    console.log('  - task_obstacles (阻碍记录表)');
    console.log('  - task_delay_history (延期历史表)');
    console.log('  - acceptance_plans (验收计划表)');
    console.log('  - wbs_templates (WBS模板表)');
    console.log('  - pre_milestones (前期证照表) ⚠️  关键缺失表');

    // 检查表是否存在
    console.log('\n🔍 检查 pre_milestones 表是否存在...');
    const { data, error } = await supabase
      .from('pre_milestones')
      .select('id')
      .limit(1);

    if (error) {
      console.log('❌ pre_milestones 表不存在，需要创建');
      console.log('\n📋 请按以下步骤执行:');
      console.log('1. 打开 Supabase Dashboard');
      console.log('2. 进入 SQL Editor');
      console.log('3. 复制 migrations/002_add_phase1_tables.sql 的内容');
      console.log('4. 粘贴并执行 SQL');
    } else {
      console.log('✅ pre_milestones 表已存在');
    }

  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    process.exit(1);
  }
}

executeMigration();
