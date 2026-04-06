import { Client } from 'pg';

const client = new Client({
  host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Oo4JmfUzmAEkRSTy',
  ssl: { rejectUnauthorized: false },
});

async function check() {
  await client.connect();
  console.log('✅ 连接成功\n');

  // 1. 项目列表
  const projects = await client.query('SELECT id, name, owner_id FROM projects LIMIT 10');
  console.log(`=== 项目 (${projects.rows.length}) ===`);
  projects.rows.forEach((r: any) => console.log(`  ${r.name}: ${r.id} (owner: ${r.owner_id?.substring(0,8)})`));

  // 2. 用户列表
  const users = await client.query('SELECT id, email FROM users LIMIT 10');
  console.log(`\n=== 用户 (${users.rows.length}) ===`);
  users.rows.forEach((r: any) => console.log(`  ${r.email}: ${r.id}`));

  // 3. 项目成员
  const members = await client.query('SELECT * FROM project_members LIMIT 10');
  console.log(`\n=== 项目成员 (${members.rows.length}) ===`);
  members.rows.forEach((r: any) => console.log(`  project: ${r.project_id?.substring(0,8)}, user: ${r.user_id?.substring(0,8)}, level: ${r.permission_level}`));

  // 4. 任务列表
  const tasks = await client.query('SELECT id, title, project_id, status FROM tasks LIMIT 5');
  console.log(`\n=== 任务 (${tasks.rows.length}) ===`);
  tasks.rows.forEach((r: any) => console.log(`  ${r.title}: ${r.id?.substring(0,8)} (project: ${r.project_id?.substring(0,8)})`));

  // 5. 检查task_conditions和task_obstacles表是否存在及结构
  for (const table of ['task_conditions', 'task_obstacles']) {
    const count = await client.query(`SELECT COUNT(*) as cnt FROM ${table}`);
    console.log(`\n${table}: ${count.rows[0].cnt} 条记录`);
  }

  // 6. 检查acceptance_plans的status约束
  const constraints = await client.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) as def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'acceptance_plans' AND con.contype = 'c'
  `);
  console.log(`\n=== acceptance_plans CHECK 约束 ===`);
  if (constraints.rows.length === 0) console.log('  无CHECK约束 ✅');
  else constraints.rows.forEach((r: any) => console.log(`  ${r.conname}: ${r.def}`));

  await client.end();
}

check().catch(e => { console.error(e); process.exit(1); });
