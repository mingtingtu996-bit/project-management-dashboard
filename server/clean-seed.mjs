import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve('C:/Users/jjj64/WorkBuddy/20260318232610/server/.env');
const content = readFileSync(envPath, 'utf-8');
for (const line of content.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  const key = t.slice(0, i).trim();
  const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  if (!process.env[key]) process.env[key] = val;
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const tables = ['tasks', 'milestones', 'task_conditions', 'task_obstacles', 'risks', 'acceptance_plans'];

for (const table of tables) {
  const { data, error } = await sb.from(table).delete().ilike('description', '%种子数据%');
  console.log(`${table}:`, error ? `ERROR - ${error.message}` : `OK (${data ? data.length : 0} rows)`);
}
console.log('Done.');
