import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://wwdrkjnbvcbfytwnnyvs.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_XuCdxFIxN4c6TBLFM1JPWA_bpnHBmzA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAdminUser() {
  console.log('检查admin用户是否存在...');
  
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', 'admin')
    .maybeSingle();

  if (error) {
    console.error('查询错误:', error);
    return;
  }

  if (users) {
    console.log('✅ 找到admin用户:');
    console.log('  ID:', users.id);
    console.log('  用户名:', users.username);
    console.log('  显示名:', users.display_name);
    console.log('  邮箱:', users.email);
    console.log('  角色:', users.role);
    console.log('  创建时间:', users.created_at);
    console.log('  密码哈希:', users.password_hash ? '存在' : '不存在');
  } else {
    console.log('❌ 未找到admin用户');
    
    // 尝试创建admin用户
    console.log('\n尝试创建admin用户...');
    const bcrypt = (await import('bcryptjs')).default;
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        username: 'admin',
        password_hash: passwordHash,
        display_name: '系统管理员',
        role: 'owner',
      })
      .select()
      .single();

    if (createError) {
      console.error('创建失败:', createError);
    } else {
      console.log('✅ admin用户创建成功!');
      console.log('  ID:', newUser.id);
    }
  }
}

checkAdminUser();
