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
      'SELECT id, username, display_name, role FROM public.users WHERE username = $1',
      ['admin']
    );

    console.log('用户查询结果:', JSON.stringify(result.rows, null, 2));

    if (result.rows.length > 0) {
      console.log('✅ 找到 admin 用户:', result.rows[0]);
    } else {
      console.log('❌ 未找到 admin 用户');
    }
  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await client.end();
  }
}

test();
