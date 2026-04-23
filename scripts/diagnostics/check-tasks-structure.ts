import { executeSQL } from './server/src/services/dbService.js';

(async () => {
  try {
    console.log('检查 tasks 表结构...\n');

    const columns = await executeSQL(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'tasks'
       ORDER BY ordinal_position`
    );

    console.log('Tasks 表所有列:');
    console.table(columns);

    console.log('\n检查是否有 version 字段...');
    const hasVersion = columns.some((col: any) => col.column_name === 'version');
    console.log(`version 字段存在: ${hasVersion}`);

  } catch (error: any) {
    console.error('错误:', error.message);
  }
})();
