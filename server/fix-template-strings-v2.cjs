const fs = require('fs');

const filePath = 'src/services/autoAlertService.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 替换策略：找到所有的 `...` 模板字符串，并提取变量
// 然后创建辅助函数来生成这些字符串

// 简单替换：将复杂的模板字符串改为函数调用
content = content.replace(
  /description: `任务 "\$\{task\.title\}" 已超过截止日期`/g,
  'description: taskDesc(task.title, \'已超过截止日期\')'
);

content = content.replace(
  /description: `任务 "\$\{task\.title\}" 将在 \$\{diffDays === 0 \? '今天' : `\$\{diffDays\}天后`\} 到期，当前进度 \$\{task\.progress\}%`/g,
  'description: taskUpcomingDesc(task.title, diffDays, task.progress)'
);

content = content.replace(
  /description: `任务 "\$\{task\.title\}" 的依赖任务已延期，可能影响当前进度`/g,
  'description: taskDepDesc(task.title)'
);

content = content.replace(
  /description: `\$\{assignee\} 同时负责的任务 "\$\{task1\.title\}" 和 "\$\{task2\.title\}" 时间重叠`/g,
  'description: resourceConflictDesc(assignee, task1.title, task2.title)'
);

content = content.replace(
  /description: `风险 "\$\{risk\.name\}" \(\$\{risk\.level\}\) 尚未处理`/g,
  'description: riskDesc(risk.name, risk.level)'
);

content = content.replace(
  /description: `里程碑 "\$\{milestone\.name\}" 已超过截止日期`/g,
  'description: milestoneOverdueDesc(milestone.name)'
);

content = content.replace(
  /description: `里程碑 "\$\{milestone\.name\}" 将在 \$\{diffDays\}天后到期`/g,
  'description: milestoneUpcomingDesc(milestone.name, diffDays)'
);

content = content.replace(
  /description: `\$\{inconsistentTasks\.length\} 个任务的状态与进度不一致，请检查`/g,
  'description: inconsistentTasks.length + \' 个任务的状态与进度不一致，请检查\''
);

// 在类开头添加辅助函数
const helperFunctions = `
  // 辅助函数：生成描述字符串
  private taskDesc(title: string, suffix: string): string {
    return '任务 "' + title + '" ' + suffix;
  }
  
  private taskUpcomingDesc(title: string, diffDays: number, progress: number): string {
    const whenText = diffDays === 0 ? '今天' : diffDays + '天后';
    return '任务 "' + title + '" 将在 ' + whenText + ' 到期，当前进度 ' + progress + '%';
  }
  
  private taskDepDesc(title: string): string {
    return '任务 "' + title + '" 的依赖任务已延期，可能影响当前进度';
  }
  
  private resourceConflictDesc(assignee: string, title1: string, title2: string): string {
    return assignee + ' 同时负责的任务 "' + title1 + '" 和 "' + title2 + '" 时间重叠';
  }
  
  private riskDesc(name: string, level: string): string {
    return '风险 "' + name + '" (' + level + ') 尚未处理';
  }
  
  private milestoneOverdueDesc(name: string): string {
    return '里程碑 "' + name + '" 已超过截止日期';
  }
  
  private milestoneUpcomingDesc(name: string, diffDays: number): string {
    return '里程碑 "' + name + '" 将在 ' + diffDays + '天后到期';
  }
`;

// 找到类的第一个方法前面，插入辅助函数
content = content.replace(
  /(private async checkDelayedTasks)/,
  helperFunctions + '\n  $1'
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ Template strings replaced successfully!');
