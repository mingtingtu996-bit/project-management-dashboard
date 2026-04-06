/**
 * 测试数据自动导入脚本
 * 
 * 使用方法:
 * 1. 将此文件复制到浏览器控制台执行
 * 2. 或者创建一个 HTML 文件引用此脚本
 */

// 导入测试数据的通用函数
async function importTestData(projectFile) {
  try {
    const response = await fetch(`/test-data/${projectFile}`);
    
    if (!response.ok) {
      throw new Error(`无法加载文件: ${projectFile}`);
    }
    
    const data = await response.json();
    
    // 导入项目
    const projects = JSON.parse(localStorage.getItem('pm_projects') || '[]');
    const existingProject = projects.find(p => p.id === data.project.id);
    
    if (existingProject) {
      console.warn(`⚠️ 项目 "${data.project.name}" 已存在,跳过导入`);
      return { success: false, message: '项目已存在', project: data.project };
    }
    
    // 导入新数据
    projects.push(data.project);
    localStorage.setItem('pm_projects', JSON.stringify(projects));
    
    const tasks = JSON.parse(localStorage.getItem('pm_tasks') || '[]');
    data.tasks.forEach(task => tasks.push(task));
    localStorage.setItem('pm_tasks', JSON.stringify(tasks));
    
    const risks = JSON.parse(localStorage.getItem('pm_risks') || '[]');
    data.risks.forEach(risk => risks.push(risk));
    localStorage.setItem('pm_risks', JSON.stringify(risks));
    
    const milestones = JSON.parse(localStorage.getItem('pm_milestones') || '[]');
    data.milestones.forEach(milestone => milestones.push(milestone));
    localStorage.setItem('pm_milestones', JSON.stringify(milestones));
    
    console.log(`✅ 成功导入项目: ${data.project.name}`);
    console.log(`   📊 任务: ${data.tasks.length}, 风险: ${data.risks.length}, 里程碑: ${data.milestones.length}`);
    
    return { 
      success: true, 
      message: '导入成功', 
      project: data.project,
      stats: {
        tasks: data.tasks.length,
        risks: data.risks.length,
        milestones: data.milestones.length
      }
    };
  } catch (error) {
    console.error(`❌ 导入失败 (${projectFile}):`, error.message);
    return { success: false, message: error.message, project: null };
  }
}

/**
 * 强制覆盖导入项目
 */
async function forceImportTestData(projectFile) {
  try {
    const response = await fetch(`/test-data/${projectFile}`);
    
    if (!response.ok) {
      throw new Error(`无法加载文件: ${projectFile}`);
    }
    
    const data = await response.json();
    
    // 删除旧项目的相关数据
    const projects = JSON.parse(localStorage.getItem('pm_projects') || '[]');
    const filteredProjects = projects.filter(p => p.id !== data.project.id);
    localStorage.setItem('pm_projects', JSON.stringify(filteredProjects));
    
    const tasks = JSON.parse(localStorage.getItem('pm_tasks') || '[]');
    localStorage.setItem('pm_tasks', JSON.stringify(tasks.filter(t => t.project_id !== data.project.id)));
    
    const risks = JSON.parse(localStorage.getItem('pm_risks') || '[]');
    localStorage.setItem('pm_risks', JSON.stringify(risks.filter(r => r.project_id !== data.project.id)));
    
    const milestones = JSON.parse(localStorage.getItem('pm_milestones') || '[]');
    localStorage.setItem('pm_milestones', JSON.stringify(milestones.filter(m => m.project_id !== data.project.id)));
    
    // 导入新数据
    projects.push(data.project);
    localStorage.setItem('pm_projects', JSON.stringify(projects));
    
    const newTasks = JSON.parse(localStorage.getItem('pm_tasks') || '[]');
    data.tasks.forEach(task => newTasks.push(task));
    localStorage.setItem('pm_tasks', JSON.stringify(newTasks));
    
    const newRisks = JSON.parse(localStorage.getItem('pm_risks') || '[]');
    data.risks.forEach(risk => newRisks.push(risk));
    localStorage.setItem('pm_risks', JSON.stringify(newRisks));
    
    const newMilestones = JSON.parse(localStorage.getItem('pm_milestones') || '[]');
    data.milestones.forEach(milestone => newMilestones.push(milestone));
    localStorage.setItem('pm_milestones', JSON.stringify(newMilestones));
    
    console.log(`✅ 强制覆盖导入项目: ${data.project.name}`);
    console.log(`   📊 任务: ${data.tasks.length}, 风险: ${data.risks.length}, 里程碑: ${data.milestones.length}`);
    
    return { 
      success: true, 
      message: '强制导入成功', 
      project: data.project,
      stats: {
        tasks: data.tasks.length,
        risks: data.risks.length,
        milestones: data.milestones.length
      }
    };
  } catch (error) {
    console.error(`❌ 强制导入失败 (${projectFile}):`, error.message);
    return { success: false, message: error.message, project: null };
  }
}

/**
 * 导入所有测试项目
 */
async function importAllTestData() {
  console.log('🚀 开始导入所有测试项目...\n');
  
  const results = [];
  
  results.push(await importTestData('project1-healthy.json'));
  results.push(await importTestData('project2-warning.json'));
  results.push(await importTestData('project3-critical.json'));
  
  console.log('\n📋 导入结果汇总:');
  console.log('='.repeat(50));
  
  results.forEach((result, index) => {
    const projectName = result.project ? result.project.name : '未知项目';
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${projectName}: ${result.message}`);
    if (result.stats) {
      console.log(`   任务: ${result.stats.tasks}, 风险: ${result.stats.risks}, 里程碑: ${result.stats.milestones}`);
    }
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log('='.repeat(50));
  console.log(`总计: ${successCount}/${results.length} 个项目导入成功`);
  
  if (successCount > 0) {
    console.log('\n💡 提示: 刷新页面以查看导入的数据');
    if (confirm('是否立即刷新页面?')) {
      location.reload();
    }
  }
}

/**
 * 强制覆盖导入所有测试项目
 */
async function forceImportAllTestData() {
  console.log('🚀 开始强制覆盖导入所有测试项目...\n');
  
  const results = [];
  
  results.push(await forceImportTestData('project1-healthy.json'));
  results.push(await forceImportTestData('project2-warning.json'));
  results.push(await forceImportTestData('project3-critical.json'));
  
  console.log('\n📋 导入结果汇总:');
  console.log('='.repeat(50));
  
  results.forEach((result, index) => {
    const projectName = result.project ? result.project.name : '未知项目';
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${projectName}: ${result.message}`);
    if (result.stats) {
      console.log(`   任务: ${result.stats.tasks}, 风险: ${result.stats.risks}, 里程碑: ${result.stats.milestones}`);
    }
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log('='.repeat(50));
  console.log(`总计: ${successCount}/${results.length} 个项目导入成功`);
  
  console.log('\n💡 提示: 刷新页面以查看导入的数据');
  if (confirm('是否立即刷新页面?')) {
    location.reload();
  }
}

/**
 * 清除所有测试数据
 */
function clearAllTestData() {
  if (!confirm('确定要清除所有项目数据吗?此操作不可撤销!')) {
    return;
  }
  
  localStorage.removeItem('pm_projects');
  localStorage.removeItem('pm_tasks');
  localStorage.removeItem('pm_risks');
  localStorage.removeItem('pm_milestones');
  localStorage.removeItem('pm_project_members');
  
  console.log('✅ 所有测试数据已清除');
  location.reload();
}

/**
 * 验证导入的数据
 */
function validateTestData() {
  console.log('\n📊 当前数据验证:\n');
  
  const projects = JSON.parse(localStorage.getItem('pm_projects') || '[]');
  const tasks = JSON.parse(localStorage.getItem('pm_tasks') || '[]');
  const risks = JSON.parse(localStorage.getItem('pm_risks') || '[]');
  const milestones = JSON.parse(localStorage.getItem('pm_milestones') || '[]');
  
  console.log(`📁 项目总数: ${projects.length}`);
  console.log(`📝 任务总数: ${tasks.length}`);
  console.log(`⚠️ 风险总数: ${risks.length}`);
  console.log(`🎯 里程碑总数: ${milestones.length}\n`);
  
  if (projects.length === 0) {
    console.log('⚠️ 没有找到任何项目,请先导入测试数据');
    return;
  }
  
  console.log('📋 项目详情:');
  console.log('='.repeat(80));
  
  projects.forEach(project => {
    const projectTasks = tasks.filter(t => t.project_id === project.id);
    const projectRisks = risks.filter(r => r.project_id === project.id);
    const projectMilestones = milestones.filter(m => m.project_id === project.id);
    
    const completedTasks = projectTasks.filter(t => t.status === 'completed').length;
    const activeRisks = projectRisks.filter(r => r.status !== 'mitigated' && r.status !== 'occurred').length;
    const completedMilestones = projectMilestones.filter(m => m.status === 'completed').length;
    
    console.log(`\n📦 ${project.name}`);
    console.log(`   ID: ${project.id}`);
    console.log(`   状态: ${project.status}`);
    console.log(`   任务: ${completedTasks}/${projectTasks.length} 完成 (${Math.round(completedTasks/projectTasks.length*100)}%)`);
    console.log(`   风险: ${activeRisks}/${projectRisks.length} 活跃`);
    console.log(`   里程碑: ${completedMilestones}/${projectMilestones.length} 完成`);
  });
}

/**
 * 显示使用帮助
 */
function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           测试数据导入工具 - 使用帮助                          ║
╚═══════════════════════════════════════════════════════════════╝

可用命令:

1. 导入所有测试项目
   importAllTestData()
   
2. 强制覆盖导入所有项目
   forceImportAllTestData()
   
3. 导入单个项目
   await importTestData('project1-healthy.json')
   await importTestData('project2-warning.json')
   await importTestData('project3-critical.json')
   
4. 强制覆盖导入单个项目
   await forceImportTestData('project1-healthy.json')
   
5. 清除所有测试数据
   clearAllTestData()
   
6. 验证导入的数据
   validateTestData()
   
7. 显示帮助
   showHelp()

═══════════════════════════════════════════════════════════════

项目说明:

1. project1-healthy.json - 智慧城市管理系统 (健康度: 85+)
   - 项目进展顺利,风险得到有效控制
   
2. project2-warning.json - 企业级电商平台 (健康度: 60-85)
   - 有延迟风险,需要关注高并发问题
   
3. project3-critical.json - AI医疗诊断系统 (健康度: <60)
   - 多个严重风险,进度严重滞后

═══════════════════════════════════════════════════════════════

提示: 执行 importAllTestData() 可快速导入所有测试数据!
`);
}

// 自动显示帮助
showHelp();
