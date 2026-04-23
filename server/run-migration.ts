/**
 * 通过 Supabase REST API 执行数据库迁移
 * 创建 pre_milestones 表及其他缺失的表
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('缺少 Supabase 配置');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 创建 pre_milestones 表的 SQL
const createPreMilestonesSQL = `
CREATE TABLE IF NOT EXISTS pre_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN (
    'land_certificate',
    'land_use_planning_permit',
    'engineering_planning_permit',
    'construction_permit'
  )),
  milestone_name TEXT NOT NULL,
  certificate_type TEXT,
  certificate_name TEXT,
  application_date DATE,
  issue_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'preparing_documents',
    'internal_review',
    'external_submission',
    'supplement_required',
    'approved',
    'issued',
    'expired',
    'voided'
  )),
  certificate_no TEXT,
  current_stage VARCHAR(32),
  planned_finish_date DATE,
  actual_finish_date DATE,
  approving_authority VARCHAR(100),
  issuing_authority TEXT,
  next_action TEXT,
  next_action_due_date DATE,
  is_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  latest_record_at TIMESTAMPTZ,
  description TEXT,
  phase_id UUID,
  lead_unit TEXT,
  planned_start_date DATE,
  planned_end_date DATE,
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pre_milestones_project ON pre_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_type ON pre_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_certificate_type ON pre_milestones(project_id, certificate_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_status_current ON pre_milestones(project_id, status);

-- 创建触发器
CREATE TRIGGER update_pre_milestones_updated_at
BEFORE UPDATE ON pre_milestones
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 添加注释
COMMENT ON TABLE pre_milestones IS '前期证照表，记录项目前期各类证照的办理情况';
`;

async function executeMigrationViaRPC() {
  console.log('📦 尝试通过 RPC 执行迁移...\n');

  try {
    // Supabase 不支持通过 REST API 执行任意 SQL
    // 我们需要使用 SQL Editor 或 psql 命令行工具

    console.log('⚠️  Supabase JS 客户端不支持直接执行 SQL 语句');
    console.log('\n📋 请按以下步骤手动执行迁移:\n');

    console.log('方案1: 使用 Supabase Dashboard (推荐)');
    console.log('-----------------------------------------');
    console.log('1. 打开 https://supabase.com/dashboard');
    console.log('2. 选择你的项目');
    console.log('3. 进入 SQL Editor');
    console.log('4. 粘贴以下 SQL 并执行:\n');
    console.log(createPreMilestonesSQL.trim());
    console.log('\n-----------------------------------------\n');

    console.log('方案2: 使用 psql 命令行');
    console.log('-----------------------------------------');
    console.log('1. 获取数据库连接字符串');
    console.log('2. 执行: psql <CONNECTION_STRING> -f migrations/002_add_phase1_tables.sql');
    console.log('-----------------------------------------\n');

    console.log('✅ 迁移准备完成，等待手动执行');

  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    process.exit(1);
  }
}

// 另一种方法：尝试直接通过 REST API 创建表结构
async function createTableViaRestAPI() {
  console.log('\n🔧 尝试通过 REST API 创建表...\n');

  // 由于 Supabase REST API 不支持创建表，我们只能提供手动执行方案
  console.log('⚠️  REST API 无法创建表结构');
  console.log('📝 必须通过 SQL Editor 手动执行\n');

  // 保存 SQL 到文件供用户手动执行
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const outputFile = path.join(__dirname, 'migration-pre_milestones.sql');
  fs.writeFileSync(outputFile, createPreMilestonesSQL.trim());

  console.log(`✅ SQL 已保存到: ${outputFile}`);
  console.log('📄 请将此文件内容复制到 Supabase SQL Editor 中执行\n');
}

async function main() {
  try {
    await executeMigrationViaRPC();
    await createTableViaRestAPI();

    console.log('\n📊 迁移摘要:');
    console.log('  需要创建的表: pre_milestones');
    console.log('  表用途: 存储项目前期证照信息');
    console.log('  关键字段: project_id, milestone_type, status, expiry_date');
    console.log('\n⏹️  执行完成后，重新运行测试脚本验证:\n');
    console.log('  npx tsx -r dotenv/config test-jobs-manual.ts\n');

  } catch (error) {
    console.error('\n❌ 迁移准备失败:', error);
    process.exit(1);
  }
}

main();
