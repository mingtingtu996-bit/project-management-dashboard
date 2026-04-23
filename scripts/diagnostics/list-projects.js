const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, status')
    .limit(5);
  
  if (error) {
    console.error('错误:', error);
    return;
  }
  
  console.log('\n========================================');
  console.log('数据库中的项目列表');
  console.log('========================================\n');
  
  if (data.length === 0) {
    console.log('没有找到任何项目！');
    console.log('\n请先创建一个项目，然后再访问甘特图页面。');
    return;
  }
  
  console.log('找到', data.length, '个项目：\n');
  
  data.forEach((p, index) => {
    console.log(`${index + 1}. ${p.name}`);
    console.log(`   ID: ${p.id}`);
    console.log(`   状态: ${p.status}`);
    console.log(`   访问路径: http://localhost:5173/#/projects/${p.id}/gantt`);
    console.log('');
  });
  
  console.log('========================================');
  console.log('请复制上面的访问路径到浏览器中打开');
  console.log('========================================\n');
}

getProjects();
