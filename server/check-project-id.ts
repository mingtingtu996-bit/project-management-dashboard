import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkProject(projectId: string) {
  const result = await pool.query(
    'SELECT id, name, status FROM projects WHERE id = $1',
    [projectId]
  );

  if (result.rows.length === 0) {
    console.log(`❌ 项目 ID ${projectId} 不存在`);
  } else {
    console.log(`✅ 项目存在:`);
    console.log(`   ID: ${result.rows[0].id}`);
    console.log(`   名称: ${result.rows[0].name}`);
    console.log(`   状态: ${result.rows[0].status}`);
  }

  await pool.end();
}

const projectId = process.argv[2];
if (!projectId) {
  console.error('❌ 请提供项目 ID');
  process.exit(1);
}

checkProject(projectId).catch(console.error);
