import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testPassword() {
  console.log('查询admin用户...');

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', 'admin')
    .single();

  if (error || !user) {
    console.error('未找到admin用户:', error);
    return;
  }

  console.log('✅ 找到用户:', user.username);
  console.log('   存储的哈希:', user.password_hash);

  // 测试密码验证
  const testPassword = 'admin123';
  const isValid = await bcrypt.compare(testPassword, user.password_hash);

  console.log('\n测试密码:', testPassword);
  console.log('验证结果:', isValid ? '✅ 正确' : '❌ 错误');

  // 如果验证失败，生成新的哈希
  if (!isValid) {
    console.log('\n生成新的密码哈希...');
    const newHash = await bcrypt.hash(testPassword, 10);
    console.log('新哈希:', newHash);

    // 更新数据库
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('username', 'admin');

    if (updateError) {
      console.error('更新失败:', updateError);
    } else {
      console.log('✅ 密码已更新');
    }
  }

  // 再次验证
  const { data: updatedUser } = await supabase
    .from('users')
    .select('password_hash')
    .eq('username', 'admin')
    .single();

  if (updatedUser) {
    const finalCheck = await bcrypt.compare(testPassword, updatedUser.password_hash);
    console.log('\n最终验证:', finalCheck ? '✅ 正确' : '❌ 错误');
  }
}

testPassword().catch(console.error);
