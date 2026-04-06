import { readFileSync, writeFileSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

// 需要修复的文件列表（相对于 server 目录）
const filesToFix = [
  'src/jobs/riskStatisticsJob.ts',
  'src/middleware/auth.ts',
  'src/middleware/errorHandler.ts',
  'src/middleware/logger.ts',
  'src/middleware/validation.ts',
  'src/routes/acceptance-nodes.ts',
  'src/routes/acceptance-plans.ts',
  'src/routes/certificate-approvals.ts',
  'src/routes/dashboard.ts',
  'src/routes/invitations.ts',
  'src/routes/members.ts',
  'src/routes/milestones.ts',
  'src/routes/notifications.ts',
  'src/routes/pre-milestone-conditions.ts',
  'src/routes/pre-milestone-dependencies.ts',
  'src/routes/pre-milestones.ts',
  'src/routes/projects.ts',
  'src/routes/risks.ts',
  'src/routes/standard-processes.ts',
  'src/routes/task-conditions.ts',
  'src/routes/task-delays.ts',
  'src/routes/task-obstacles.ts',
  'src/routes/tasks.ts',
  'src/routes/wbs-templates.ts',
  'src/routes/wbs.ts',
  'src/services/dbService.ts',
  'src/services/warningService.ts',
  'src/utils/notificationService.ts',
  'src/utils/riskDetector.ts',
  'src/__tests__/testSetup.ts',
  'src/services/autoAlertService.ts', // 已修复，但仍检查
];

// 修复单个文件
function fixFile(filePath: string): { success: boolean; changes: number } {
  try {
    const fullPath = join(process.cwd(), filePath);
    const content = readFileSync(fullPath, 'utf-8');

    // 查找所有 .js.ts 并替换为 .js
    const regex = /from\s+['"]([^'"]+\.js)\.ts['"]/g;
    let match;
    let changes = 0;
    let newContent = content;

    while ((match = regex.exec(content)) !== null) {
      const fullMatch = match[0];
      const importPath = match[1]; // 不带 .ts 的路径
      const newImport = fullMatch.replace(/\.js\.ts/, '.js');
      newContent = newContent.replace(fullMatch, newImport);
      changes++;
    }

    if (changes > 0) {
      writeFileSync(fullPath, newContent, 'utf-8');
      console.log(`✅ ${filePath} - 修复 ${changes} 处`);
    } else {
      console.log(`⏭️  ${filePath} - 无需修复`);
    }

    return { success: true, changes };
  } catch (error) {
    console.error(`❌ ${filePath} - 修复失败`);
    console.error(error);
    return { success: false, changes: 0 };
  }
}

// 主函数
function main() {
  console.log('🔧 开始修复导入扩展名...\n');

  let totalSuccess = 0;
  let totalFail = 0;
  let totalChanges = 0;

  for (const file of filesToFix) {
    const result = fixFile(file);
    if (result.success) {
      totalSuccess++;
      totalChanges += result.changes;
    } else {
      totalFail++;
    }
  }

  console.log('\n📊 修复完成统计:');
  console.log(`   成功: ${totalSuccess}/${filesToFix.length}`);
  console.log(`   失败: ${totalFail}`);
  console.log(`   总计修复: ${totalChanges} 处`);

  if (totalFail === 0) {
    console.log('\n✅ 所有文件修复成功！');
  } else {
    console.log(`\n⚠️  有 ${totalFail} 个文件修复失败`);
  }
}

main();
