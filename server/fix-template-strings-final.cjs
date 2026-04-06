const fs = require('fs');

const filePath = 'src/services/autoAlertService.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 替换console.log中的模板字符串
content = content.replace(
  /console\.log\(`Checking project \$\{projectId\}\.\.\.`\)/g,
  'console.log(\'Checking project \' + projectId + \'...\')'
);

content = content.replace(
  /`\$\{task1\.id\}-\$\{task2\.id\}`/g,
  'task1.id + \'-\' + task2.id'
);

content = content.replace(
  /`\$\{today\}T23:59:59`/g,
  'today + \'T23:59:59\''
);

content = content.replace(
  /`\$\{today\}T00:00:00`/g,
  'today + \'T00:00:00\''
);

content = content.replace(
  /console\.error\(`Error fetching tasks for project \$\{projectId\}:`, error\)/g,
  'console.error(\'Error fetching tasks for project \' + projectId + \':\', error)'
);

content = content.replace(
  /console\.error\(`Error fetching risks for project \$\{projectId\}:`, error\)/g,
  'console.error(\'Error fetching risks for project \' + projectId + \':\', error)'
);

content = content.replace(
  /console\.error\(`Error fetching milestones for project \$\{projectId\}:`, error\)/g,
  'console.error(\'Error fetching milestones for project \' + projectId + \':\', error)'
);

content = content.replace(
  /console\.log\(`Alert created: \$\{alertData\.title\}`\)/g,
  'console.log(\'Alert created: \' + alertData.title)'
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ All template strings replaced successfully!');
