/**
 * 登录调试测试脚本
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: { rejectUnauthorized: false },
});

async function testLogin() {
  console.log('=== 登录调试测试 ===\n');

  const username = 'test';
  const password = 'test123';

  try {
    // 1. 查询用户
    console.log('1. 查询用户...');
    const result = await pool.query(
      'SELECT * FROM public.users WHERE username = $1',
      [username]
    );
    console.log(`   找到 ${result.rows.length} 个用户`);

    if (result.rows.length === 0) {
      console.log('   用户不存在！');
      return;
    }

    const user = result.rows[0];
    console.log(`   用户: ${user.username}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   password_hash: ${user.password_hash?.substring(0, 30)}...`);

    // 2. 验证密码
    console.log('\n2. 验证密码...');
    console.log(`   输入密码: ${password}`);
    console.log(`   存储哈希: ${user.password_hash}`);

    const isValid = await bcrypt.compare(password, user.password_hash);
    console.log(`   验证结果: ${isValid}`);

    if (!isValid) {
      console.log('   密码不匹配！');
      console.log('   可能原因: 注册时使用的哈希算法与验证时不同');

      // 测试是否能用同样的方法哈希
      console.log('\n3. 测试哈希...');
      const newHash = await bcrypt.hash(password, 10);
      console.log(`   新哈希: ${newHash.substring(0, 30)}...`);
      const testValid = await bcrypt.compare(password, newHash);
      console.log(`   新哈希验证: ${testValid}`);
    }

  } catch (error) {
    console.error('错误:', error);
  } finally {
    await pool.end();
  }
}

testLogin();
