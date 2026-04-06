import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

async function test() {
  const client = new Client({
    host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ 数据库连接成功');

    // 查询 admin 用户
    const result = await client.query(
      'SELECT id, username, password_hash FROM public.users WHERE username = $1',
      ['admin']
    );

    if (result.rows.length === 0) {
      console.log('❌ 未找到 admin 用户');
      return;
    }

    const user = result.rows[0];
    console.log('用户信息:', { id: user.id, username: user.username });
    console.log('密码哈希:', user.password_hash);

    // 测试密码验证
    const testPassword = 'admin123';
    console.log('测试密码:', testPassword);

    const isValid = await bcrypt.compare(testPassword, user.password_hash);
    console.log('密码验证结果:', isValid ? '✅ 正确' : '❌ 错误');

    // 生成新的哈希对比
    const newHash = await bcrypt.hash(testPassword, 10);
    console.log('新生成的哈希:', newHash);
    console.log('哈希是否相同:', newHash === user.password_hash ? '✅ 相同' : '❌ 不同');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await client.end();
  }
}

test();
