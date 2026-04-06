require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  console.log('=== 数据库数据检查 ===\n');
  
  const projects = await client.from('projects').select('*');
  console.log('项目数:', projects.data.length);
  if (projects.data.length > 0) {
    console.log('项目列表:', projects.data.map(p => p.name).join(', '));
    console.log('第一个项目ID:', projects.data[0].id);
  }
  console.log();
  
  const tasks = await client.from('tasks').select('*');
  console.log('任务数:', tasks.data.length);
  console.log();
  
  const milestones = await client.from('milestones').select('*');
  console.log('里程碑数:', milestones.data.length);
  console.log();
  
  const risks = await client.from('risks').select('*');
  console.log('风险数:', risks.data.length);
}

check().catch(console.error);
