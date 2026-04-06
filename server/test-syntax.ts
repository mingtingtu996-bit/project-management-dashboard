// 测试autoAlertService的语法问题

// 复制有问题的部分
async function test() {
  const task = {
    project_id: '123',
    id: '456',
    title: '测试任务'
  };

  const result = {
    project_id: task.project_id,
    type: 'task',
    level: 'critical',
    title: '任务今天到期',
    description: `任务 "${task.title}" 今天到期，请及时完成`,
    related_id: task.id,
    related_type: 'tasks'
  };

  console.log('Test passed:', result);
}

test();
