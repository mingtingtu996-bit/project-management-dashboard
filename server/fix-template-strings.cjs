const fs = require('fs');

const filePath = 'src/services/autoAlertService.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 替换所有模板字符串为字符串拼接
const replacements = [
  // 第188行
  ['description: `任务 "${task.title}" 已超过截止日期`', 
   'const taskTitle = task.title;\n          description: \'任务 "\' + taskTitle + \'" 已超过截止日期\''],
  
  // 第230行（复杂嵌套）
  ['description: `任务 "${task.title}" 将在 ${diffDays === 0 ? \'今天\' : `${diffDays}天后`} 到期，当前进度 ${task.progress}%`',
   'const taskTitle = task.title;\n          const whenText = diffDays === 0 ? \'今天\' : diffDays + \'天后\';\n          description: \'任务 "\' + taskTitle + \'" 将在 \' + whenText + \' 到期，当前进度 \' + task.progress + \'%\''],
  
  // 第266行
  ['description: `任务 "${task.title}" 的依赖任务已延期，可能影响当前进度`',
   'const taskTitle = task.title;\n              description: \'任务 "\' + taskTitle + \'" 的依赖任务已延期，可能影响当前进度\''],
  
  // 第315行
  ['description: `${assignee} 同时负责的任务 "${task1.title}" 和 "${task2.title}" 时间重叠`',
   'description: assignee + \' 同时负责的任务 "\' + task1.title + \'" 和 "\' + task2.title + \'" 时间重叠\''],
  
  // 第348行
  ['description: `风险 "${risk.name}" (${risk.level}) 尚未处理`',
   'const riskName = risk.name;\n            description: \'风险 "\' + riskName + \' (\' + risk.level + \') 尚未处理\''],
  
  // 第379行
  ['description: `里程碑 "${milestone.name}" 已超过截止日期`',
   'const milestoneName = milestone.name;\n              description: \'里程碑 "\' + milestoneName + \'" 已超过截止日期\''],
  
  // 第405行
  ['description: `里程碑 "${milestone.name}" 将在 ${diffDays}天后到期`',
   'const milestoneName = milestone.name;\n                description: \'里程碑 "\' + milestoneName + \'" 将在 \' + diffDays + \'天后到期\''],
  
  // 第494行
  ['description: `${inconsistentTasks.length} 个任务的状态与进度不一致，请检查`',
   'description: inconsistentTasks.length + \' 个任务的状态与进度不一致，请检查\''],
];

let modified = false;
replacements.forEach(function(replacement) {
  if (content.includes(replacement[0])) {
    content = content.replace(replacement[0], replacement[1]);
    modified = true;
    console.log('✅ Replaced:', replacement[0].substring(0, 50) + '...');
  }
});

if (modified) {
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('\n✅ All replacements completed successfully!');
} else {
  console.log('\n❌ No patterns found to replace');
}
