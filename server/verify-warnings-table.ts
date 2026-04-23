import { Client } from 'pg';

// 数据库连接配置
const client = new Client({
  connectionString: 'postgresql://postgres.project_owner:<db-password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

async function verifyWarningsTable() {
  try {
    await client.connect();
    console.log('🔍 开始验证 warnings 表...\n');

    // 1. 检查表结构
    console.log('=== 1. 表结构 ===');
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'warnings' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);

    if (columnsResult.rows.length === 0) {
      console.log('❌ 表结构查询失败：未找到任何列');
    } else {
      console.log(`✅ 找到 ${columnsResult.rows.length} 个列:`);
      console.table(columnsResult.rows);
    }

    // 2. 检查索引
    console.log('\n=== 2. 索引 ===');
    const indexesResult = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'warnings' AND schemaname = 'public'
    `);

    if (indexesResult.rows.length === 0) {
      console.log('❌ 索引查询失败：未找到任何索引');
    } else {
      console.log(`✅ 找到 ${indexesResult.rows.length} 个索引:`);
      indexesResult.rows.forEach((idx, i) => {
        console.log(`${i + 1}. ${idx.indexname}`);
        console.log(`   ${idx.indexdef}`);
      });
    }

    // 3. 检查 RLS 策略
    console.log('\n=== 3. RLS 策略 ===');
    const policiesResult = await client.query(`
      SELECT policyname, tablename, cmd, permissive, roles
      FROM pg_policies
      WHERE tablename = 'warnings' AND schemaname = 'public'
    `);

    if (policiesResult.rows.length === 0) {
      console.log('❌ RLS 策略查询失败：未找到任何策略');
    } else {
      console.log(`✅ 找到 ${policiesResult.rows.length} 个 RLS 策略:`);
      console.table(policiesResult.rows);
    }

    // 4. 检查触发器
    console.log('\n=== 4. 触发器 ===');
    const triggersResult = await client.query(`
      SELECT trigger_name, event_manipulation, action_timing, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'warnings' AND event_object_schema = 'public'
    `);

    if (triggersResult.rows.length === 0) {
      console.log('❌ 触发器查询失败：未找到任何触发器');
    } else {
      console.log(`✅ 找到 ${triggersResult.rows.length} 个触发器:`);
      console.table(triggersResult.rows);
    }

    // 5. 检查表是否存在
    console.log('\n=== 5. 表存在性检查 ===');
    const tableExistsResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'warnings'
      ) as exists
    `);

    if (tableExistsResult.rows[0].exists) {
      console.log('✅ warnings 表存在');
    } else {
      console.log('❌ warnings 表不存在');
    }

    // 6. 检查数据
    console.log('\n=== 6. 数据统计 ===');
    const countResult = await client.query('SELECT COUNT(*) as count FROM warnings');
    console.log(`✅ 当前记录数: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('❌ 验证过程中发生错误:', error);
  } finally {
    await client.end();
    console.log('\n✅ 验证完成');
  }
}

verifyWarningsTable();
