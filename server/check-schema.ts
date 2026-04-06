import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  // 检查 milestones 表结构
  const { data } = await supabase.from('milestones').select('*').limit(1);
  console.log('milestones 字段:', data ? Object.keys(data[0] || {}) : 'no data');
  
  // 检查 tasks 表结构
  const { data: tasksData } = await supabase.from('tasks').select('*').limit(1);
  console.log('tasks 字段:', tasksData ? Object.keys(tasksData[0] || {}) : 'no data');
}

check();
