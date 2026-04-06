/**
 * 测试脚本：验证 Migration 022 — 任务完成自动解决阻碍
 * 用法: npx tsx test-obstacle-auto-resolve.ts
 *
 * 测试步骤:
 * 1. 创建一个测试任务
 * 2. 给该任务添加一条"待处理"阻碍
 * 3. 将任务状态改为"已完成"
 * 4. 验证阻碍是否被自动标记为"已解决"
 * 5. 清理测试数据
 */

import { executeSQL, executeSQLOne } from './src/services/dbService.js';
import { v4 as uuidv4 } from 'uuid';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Migration 022 测试：任务完成自动解决阻碍 ===\n');

  const testTaskId = uuidv4();
  const testObstacleId = uuidv4();
  const testProjectId = '00000000-0000-0000-0000-000000000001'; // 使用存在的项目ID或先查询

  try {
    // Step 0: 找一个存在的项目ID
    console.log('Step 0: 查找测试用项目ID...');
    const project = await executeSQLOne('SELECT id FROM projects LIMIT 1');
    if (!project) {
      console.log('⚠️  未找到任何项目，跳过测试');
      return;
    }
    const projectId = project.id;
    console.log(`  ✓ 项目ID: ${projectId}\n`);

    // Step 1: 创建测试任务
    console.log('Step 1: 创建测试任务...');
    await executeSQL(
      `INSERT INTO tasks (id, project_id, title, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, '进行中', 50, NOW(), NOW())`,
      [testTaskId, projectId, '【测试】任务完成自动解决阻碍测试']
    );
    console.log(`  ✓ 任务ID: ${testTaskId}\n`);

    // Step 2: 添加"待处理"阻碍
    console.log('Step 2: 添加"待处理"阻碍...');
    await executeSQL(
      `INSERT INTO task_obstacles (id, task_id, obstacle_type, description, severity, status, created_at, updated_at)
       VALUES (?, ?, '材料', '测试阻碍 - 等待任务完成后自动解决', '高', '待处理', NOW(), NOW())`,
      [testObstacleId, testTaskId]
    );
    console.log(`  ✓ 阻碍ID: ${testObstacleId}\n`);

    // 验证阻碍初始状态
    const obstacleBefore = await executeSQLOne('SELECT * FROM task_obstacles WHERE id = ?', [testObstacleId]) as any;
    console.log(`  阻碍状态（变更前）: ${obstacleBefore.status}`);
    if (obstacleBefore.status !== '待处理') {
      console.log(`  ⚠️  阻碍初始状态异常，期望"待处理"，实际"${obstacleBefore.status}"\n`);
    } else {
      console.log('  ✓ 阻碍初始状态正确\n');
    }

    // Step 3: 将任务标记为"已完成"
    console.log('Step 3: 将任务状态改为"已完成"...');
    await executeSQL(
      `UPDATE tasks SET status = '已完成', progress = 100, updated_at = NOW() WHERE id = ?`,
      [testTaskId]
    );
    console.log('  ✓ 已提交 UPDATE\n');

    // 等待触发器执行（PostgreSQL 触发器是同步的，但网络可能有延迟）
    await sleep(500);

    // Step 4: 验证阻碍是否被自动解决
    console.log('Step 4: 验证阻碍是否被自动标记为"已解决"...');
    const obstacleAfter = await executeSQLOne('SELECT * FROM task_obstacles WHERE id = ?', [testObstacleId]) as any;
    console.log(`  阻碍状态（变更后）: ${obstacleAfter.status}`);
    console.log(`  解决方案: ${obstacleAfter.resolution}`);
    console.log(`  解决时间: ${obstacleAfter.resolved_at}`);

    if (obstacleAfter.status === '已解决' && obstacleAfter.resolution === '任务已完成，自动关闭') {
      console.log('\n✅ 测试通过！触发器工作正常。\n');
    } else {
      console.log('\n❌ 测试失败！阻碍状态未按预期更新。');
      console.log(`   期望状态: "已解决"，实际: "${obstacleAfter.status}"`);
      console.log(`   期望方案: "任务已完成，自动关闭"，实际: "${obstacleAfter.resolution}"\n`);
    }

    // Step 5: 清理测试数据
    console.log('Step 5: 清理测试数据...');
    await executeSQL('DELETE FROM task_obstacles WHERE id = ?', [testObstacleId]);
    await executeSQL('DELETE FROM tasks WHERE id = ?', [testTaskId]);
    console.log('  ✓ 清理完成\n');

  } catch (error: any) {
    console.error('❌ 测试出错:', error.message);
    console.error('   提示：请确保 Migration 022 已执行');
    console.error('   执行方法：Supabase SQL Editor 中粘贴 server/migrations/022_auto_resolve_obstacles_on_task_complete.sql\n');

    // 清理
    try {
      await executeSQL('DELETE FROM task_obstacles WHERE id = ?', [testObstacleId]);
      await executeSQL('DELETE FROM tasks WHERE id = ?', [testTaskId]);
    } catch {}
  }
}

main();
