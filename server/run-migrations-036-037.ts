import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const client = new Client({
  host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Oo4JmfUzmAEkRSTy',
  ssl: { rejectUnauthorized: false },
});

async function runMigrations() {
  try {
    await client.connect();
    console.log('✅ 数据库连接成功\n');

    // ========== Migration 036: 修复 acceptance_plans 状态约束 ==========
    console.log('=== Migration 036: 修复 acceptance_plans 状态约束 ===\n');

    // 检查表是否存在
    const tableCheck = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'acceptance_plans' AND table_schema = 'public')"
    );
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  acceptance_plans 表不存在，跳过036迁移\n');
    } else {
      // 查找并删除CHECK约束
      const constraintCheck = await client.query(`
        SELECT con.conname
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'acceptance_plans'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%status%'
      `);

      if (constraintCheck.rows.length > 0) {
        for (const row of constraintCheck.rows) {
          await client.query(`ALTER TABLE acceptance_plans DROP CONSTRAINT IF EXISTS "${row.conname}"`);
          console.log(`✅ 已删除约束: ${row.conname}`);
        }
      } else {
        console.log('ℹ️  未找到 status 列的 CHECK 约束，无需删除');
      }

      // 添加列注释
      await client.query(`COMMENT ON COLUMN acceptance_plans.status IS '验收状态：待验收(pending)/验收中(in_progress)/已通过(passed)/未通过(failed) 或中文值'`);
      console.log('✅ 已更新 status 列注释');

      // 统计现有记录
      const countResult = await client.query('SELECT COUNT(*) as total FROM acceptance_plans');
      console.log(`✅ acceptance_plans 现有记录: ${countResult.rows[0].total} 条`);
    }

    // ========== Migration 037: 创建 task_conditions 和 task_obstacles 表 ==========
    console.log('\n=== Migration 037: 创建 task_conditions 和 task_obstacles 表 ===\n');

    // 检查 task_conditions 是否已存在
    const tcCheck = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'task_conditions' AND table_schema = 'public')"
    );

    if (tcCheck.rows[0].exists) {
      console.log('ℹ️  task_conditions 表已存在，跳过创建');
    } else {
      await client.query(`
        CREATE TABLE task_conditions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
          condition_type VARCHAR(50) NOT NULL DEFAULT '其他' CHECK (condition_type IN ('图纸', '材料', '人员', '设备', '手续', '其他')),
          name TEXT NOT NULL,
          description TEXT,
          is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
          satisfied_at TIMESTAMPTZ,
          target_date DATE,
          responsible_unit VARCHAR(100),
          responsible_person VARCHAR(100),
          attachments JSONB DEFAULT '[]',
          notes TEXT,
          confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
          confirmed_at TIMESTAMPTZ,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('✅ task_conditions 表创建成功');

      // 索引
      await client.query('CREATE INDEX IF NOT EXISTS idx_task_conditions_task ON task_conditions(task_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_task_conditions_project ON task_conditions(project_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_task_conditions_type ON task_conditions(condition_type)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_task_conditions_satisfied ON task_conditions(is_satisfied)');
      console.log('✅ task_conditions 索引创建成功');

      // 触发器
      await client.query(`
        CREATE OR REPLACE FUNCTION update_task_conditions_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await client.query(`
        DROP TRIGGER IF EXISTS trigger_task_conditions_updated_at ON task_conditions;
        CREATE TRIGGER trigger_task_conditions_updated_at
          BEFORE UPDATE ON task_conditions
          FOR EACH ROW
          EXECUTE FUNCTION update_task_conditions_updated_at();
      `);
      console.log('✅ task_conditions 触发器创建成功');

      // RLS
      await client.query('ALTER TABLE task_conditions ENABLE ROW LEVEL SECURITY');
      await client.query(`DROP POLICY IF EXISTS "task_conditions_select_policy" ON task_conditions`);
      await client.query(`DROP POLICY IF EXISTS "task_conditions_insert_policy" ON task_conditions`);
      await client.query(`DROP POLICY IF EXISTS "task_conditions_update_policy" ON task_conditions`);
      await client.query(`DROP POLICY IF EXISTS "task_conditions_delete_policy" ON task_conditions`);
      await client.query(`CREATE POLICY "task_conditions_select_policy" ON task_conditions FOR SELECT USING (true)`);
      await client.query(`CREATE POLICY "task_conditions_insert_policy" ON task_conditions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)`);
      await client.query(`CREATE POLICY "task_conditions_update_policy" ON task_conditions FOR UPDATE USING (auth.uid() IS NOT NULL)`);
      await client.query(`CREATE POLICY "task_conditions_delete_policy" ON task_conditions FOR DELETE USING (auth.uid() IS NOT NULL)`);
      console.log('✅ task_conditions RLS 策略创建成功');
    }

    // 检查 task_obstacles 是否已存在
    const toCheck = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'task_obstacles' AND table_schema = 'public')"
    );

    if (toCheck.rows[0].exists) {
      console.log('ℹ️  task_obstacles 表已存在，跳过创建');
    } else {
      await client.query(`
        CREATE TABLE task_obstacles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
          obstacle_type VARCHAR(50) NOT NULL DEFAULT '其他' CHECK (obstacle_type IN ('人员', '材料', '设备', '环境', '设计', '手续', '资金', '其他')),
          description TEXT NOT NULL,
          severity VARCHAR(20) NOT NULL DEFAULT '中' CHECK (severity IN ('低', '中', '高', '严重')),
          status VARCHAR(50) NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理', '处理中', '已解决', '无法解决')),
          resolution TEXT,
          resolved_at TIMESTAMPTZ,
          resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
          estimated_resolve_date DATE,
          attachments JSONB DEFAULT '[]',
          notes TEXT,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('✅ task_obstacles 表创建成功');

      // 索引
      await client.query('CREATE INDEX IF NOT EXISTS idx_task_obstacles_task ON task_obstacles(task_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_task_obstacles_project ON task_obstacles(project_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_task_obstacles_type ON task_obstacles(obstacle_type)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_task_obstacles_status ON task_obstacles(status)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_task_obstacles_severity ON task_obstacles(severity)');
      console.log('✅ task_obstacles 索引创建成功');

      // 触发器
      await client.query(`
        CREATE OR REPLACE FUNCTION update_task_obstacles_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await client.query(`
        DROP TRIGGER IF EXISTS trigger_task_obstacles_updated_at ON task_obstacles;
        CREATE TRIGGER trigger_task_obstacles_updated_at
          BEFORE UPDATE ON task_obstacles
          FOR EACH ROW
          EXECUTE FUNCTION update_task_obstacles_updated_at();
      `);
      console.log('✅ task_obstacles 触发器创建成功');

      // RLS
      await client.query('ALTER TABLE task_obstacles ENABLE ROW LEVEL SECURITY');
      await client.query(`DROP POLICY IF EXISTS "task_obstacles_select_policy" ON task_obstacles`);
      await client.query(`DROP POLICY IF EXISTS "task_obstacles_insert_policy" ON task_obstacles`);
      await client.query(`DROP POLICY IF EXISTS "task_obstacles_update_policy" ON task_obstacles`);
      await client.query(`DROP POLICY IF EXISTS "task_obstacles_delete_policy" ON task_obstacles`);
      await client.query(`CREATE POLICY "task_obstacles_select_policy" ON task_obstacles FOR SELECT USING (true)`);
      await client.query(`CREATE POLICY "task_obstacles_insert_policy" ON task_obstacles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)`);
      await client.query(`CREATE POLICY "task_obstacles_update_policy" ON task_obstacles FOR UPDATE USING (auth.uid() IS NOT NULL)`);
      await client.query(`CREATE POLICY "task_obstacles_delete_policy" ON task_obstacles FOR DELETE USING (auth.uid() IS NOT NULL)`);
      console.log('✅ task_obstacles RLS 策略创建成功');
    }

    // ========== 最终验证 ==========
    console.log('\n=== 最终验证 ===\n');

    const tables = ['task_conditions', 'task_obstacles'];
    for (const table of tables) {
      const colResult = await client.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = '${table}' AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      const idxResult = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = '${table}' AND schemaname = 'public'
      `);
      console.log(`${table}: ${colResult.rows.length} 列, ${idxResult.rows.length} 索引`);
    }

    console.log('\n✅ 全部迁移执行成功！');

  } catch (error: any) {
    console.error('\n❌ 迁移执行失败:', error.message);
    if (error.detail) console.error('详情:', error.detail);
    if (error.hint) console.error('提示:', error.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
