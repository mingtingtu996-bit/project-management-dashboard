import { createTask, getTasks } from './server/src/services/dbService.js';
import { listProjects } from './server/src/services/dbService.js';

async function testTaskCreate() {
  console.log('🧪 测试任务创建功能（已修复 version 字段问题）\n');

  try {
    // 1. 获取第一个项目
    const projects = await listProjects();
    if (!projects || projects.length === 0) {
      console.error('❌ 没有找到任何项目');
      return;
    }

    const projectId = projects[0].id;
    console.log(`✅ 使用项目: ${projects[0].name} (ID: ${projectId})\n`);

    // 2. 创建测试任务
    console.log('📝 创建测试任务...');
    const testTask = {
      project_id: projectId,
      title: '测试任务 - 修复version字段',
      description: '测试在移除version字段后任务创建是否正常',
      status: 'todo',
      priority: 'medium',
      progress: 0,
      task_type: 'task',
      planned_start_date: '2026-03-30',
      planned_end_date: '2026-04-10',
      assignee_name: '测试用户',
      assignee_type: 'person',
    };

    const createdTask = await createTask(testTask);
    console.log('✅ 任务创建成功!');
    console.log(`   任务ID: ${createdTask.id}`);
    console.log(`   任务名称: ${createdTask.title}`);
    console.log(`   状态: ${createdTask.status}`);
    console.log(`   创建时间: ${createdTask.created_at}\n`);

    // 3. 验证任务列表
    console.log('📋 验证任务列表...');
    const tasks = await getTasks(projectId);
    console.log(`✅ 项目下共有 ${tasks.length} 个任务`);

    // 4. 查找刚创建的任务
    const foundTask = tasks.find(t => t.id === createdTask.id);
    if (foundTask) {
      console.log('✅ 新创建的任务在列表中找到');
      console.log(`   - ID: ${foundTask.id}`);
      console.log(`   - 标题: ${foundTask.title}`);
      console.log(`   - 状态: ${foundTask.status}`);
    } else {
      console.error('❌ 新创建的任务在列表中未找到');
    }

    console.log('\n🎉 所有测试通过！');

  } catch (error: any) {
    console.error('\n❌ 测试失败:');
    console.error(error.message);
    if (error.stack) {
      console.error('\n堆栈跟踪:');
      console.error(error.stack);
    }
  }
}

testTaskCreate();
