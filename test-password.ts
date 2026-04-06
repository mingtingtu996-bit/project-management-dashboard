import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, 'server/.env') });

const pool = new Pool({
  host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: { rejectUnauthorized: false },
});

async function test() {
  console.log('=== 测试登录流程 ===\n');

  const username = 'test';
  const password = 'test123';

  try {
    // 1. 查询用户
    console.log('1. 查询用户...');
    const result = await pool.query(
      'SELECT * FROM public.users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      console.log('   用户不存在!');
      return;
    }

    const user = result.rows[0];
    console.log(`   用户名: ${user.username}`);
    console.log(`   password_hash: ${user.password_hash?.substring(0, 40)}...`);

    // 2. 验证密码
    console.log('\n2. 验证密码...');
    const isValid = await bcrypt.compare(password, user.password_hash);
    console.log(`   验证结果: ${isValid}`);

    if (isValid) {
      console.log('\n✅ 登录应该成功!');
    } else {
      console.log('\n❌ 密码不匹配!');

      // 测试 bcrypt 本身是否正常
      console.log('\n3. 测试 bcrypt...');
      const testHash = await bcrypt.hash('test123', 10);
      console.log(`   测试哈希: ${testHash.substring(0, 40)}...`);
      const testValid = await bcrypt.compare('test123', testHash);
      console.log(`   测试验证: ${testValid}`);
    }

  } catch (error) {
    console.error('\n❌ 错误:', error);
  } finally {
    await pool.end();
  }
}

test();
