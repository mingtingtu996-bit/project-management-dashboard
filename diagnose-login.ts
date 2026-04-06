/**
 * 登录问题诊断脚本
 */

import { createClient } from '@supabase/supabase-js';

// Supabase 配置
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// pg 直连配置
import { Pool } from 'pg';
const pgPool = new Pool({
  host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: { rejectUnauthorized: false },
});

async function diagnose() {
  console.log('=== 登录问题诊断 ===\n');

  // 1. 检查 Supabase SDK 用户
  console.log('1. 使用 Supabase SDK 查询用户...');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: sbUsers, error: sbError } = await supabase
    .from('users')
    .select('id, username, password_hash')
    .limit(5);

  if (sbError) {
    console.error('   Supabase SDK 错误:', sbError);
  } else {
    console.log(`   找到 ${sbUsers?.length || 0} 个用户`);
    sbUsers?.forEach(u => {
      console.log(`   - ${u.username} (${u.id}) - hash: ${u.password_hash?.substring(0, 20)}...`);
    });
  }

  // 2. 检查 pg 直连用户
  console.log('\n2. 使用 pg 直连查询用户...');
  try {
    const pgResult = await pgPool.query(
      'SELECT id, username, password_hash FROM public.users LIMIT 5'
    );
    console.log(`   找到 ${pgResult.rows.length} 个用户`);
    pgResult.rows.forEach(u => {
      console.log(`   - ${u.username} (${u.id}) - hash: ${u.password_hash?.substring(0, 20)}...`);
    });
  } catch (e) {
    console.error('   pg 查询错误:', e);
  }

  // 3. 尝试用 test 用户登录
  console.log('\n3. 尝试登录 test 用户...');
  const testUser = sbUsers?.find(u => u.username === 'test');
  if (testUser) {
    console.log('   test 用户存在，测试密码验证...');
    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare('test123', testUser.password_hash);
    console.log(`   密码验证结果: ${isValid}`);
  } else {
    console.log('   test 用户不存在');
  }

  await pgPool.end();
  console.log('\n=== 诊断完成 ===');
}

diagnose().catch(console.error);
