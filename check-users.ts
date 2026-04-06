import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, 'server/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

async function check() {
  console.log('=== 检查数据库中的用户 ===\n');
  console.log('Supabase URL:', supabaseUrl ? '已设置' : '未设置');

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 查询所有用户
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, email, role')
    .limit(10);

  if (error) {
    console.error('查询错误:', error);
    return;
  }

  console.log(`找到 ${users?.length || 0} 个用户:`);
  users?.forEach(u => {
    console.log(`  - ${u.username} (${u.id}) - ${u.email || '无邮箱'} - ${u.role}`);
  });
}

check();
