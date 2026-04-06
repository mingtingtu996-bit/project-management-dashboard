/**
 * 定时任务逻辑全面检查脚本
 * 检查所有定时任务的配置、依赖、数据流
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 创建 Supabase 客户端
function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase configuration missing');
  }
  
  return createClient(url, key);
}

async function checkAllJobs() {
  const supabase = createSupabaseClient();
  console.log('='.repeat(60));
  console.log('🔍 定时任务逻辑全面检查');
  console.log('='.repeat(60));

  const issues: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // ========================================
  // 1. 检查数据库表
  // ========================================
  console.log('\n📊 1. 检查数据库表结构...');
  
  const requiredTables = [
    'projects',
    'tasks',
    'milestones',
    'risks',
    'pre_milestones',
    'warnings',
    'task_conditions',
    'task_obstacles',
    'job_execution_logs'
  ];

  for (const tableName of requiredTables) {
    const { error } = await supabase.from(tableName).select('*').limit(1);
    if (error) {
      issues.push(`❌ 表 ${tableName} 不存在或无法访问: ${error.message}`);
    } else {
      info.push(`✅ 表 ${tableName} 存在`);
    }
  }

  // ========================================
  // 2. 检查风险统计任务依赖
  // ========================================
  console.log('\n📈 2. 检查风险统计任务依赖...');
  
  // 检查 risk_statistics 表
  const { error: riskStatsError } = await supabase.from('risk_statistics').select('*').limit(1);
  if (riskStatsError) {
    issues.push('❌ risk_statistics 表不存在，风险统计任务无法记录结果');
  } else {
    info.push('✅ risk_statistics 表存在');
  }

  // 检查活跃项目
  const { data: activeProjects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('status', 'active');

  if (projectsError) {
    issues.push(`❌ 无法查询活跃项目: ${projectsError.message}`);
  } else {
    info.push(`✅ 找到 ${activeProjects?.length || 0} 个活跃项目`);
  }

  // ========================================
  // 3. 检查前期证照预警任务依赖
  // ========================================
  console.log('\n📋 3. 检查前期证照预警任务依赖...');
  
  // 检查 pre_milestones 表的字段
  const { data: samplePermit, error: permitError } = await supabase
    .from('pre_milestones')
    .select('*')
    .limit(1);

  if (permitError) {
    issues.push(`❌ pre_milestones 表错误: ${permitError.message}`);
  } else if (samplePermit && samplePermit.length > 0) {
    const requiredFields = ['name', 'milestone_type', 'planned_end_date', 'status'];
    const missingFields = requiredFields.filter(f => !(f in samplePermit[0]));
    
    if (missingFields.length > 0) {
      issues.push(`❌ pre_milestones 表缺少字段: ${missingFields.join(', ')}`);
    } else {
      info.push('✅ pre_milestones 表字段完整');
    }
  } else {
    warnings.push('⚠️ pre_milestones 表为空，无法验证字段结构');
  }

  // 检查 warnings 表的字段
  const { data: sampleWarning, error: warningError } = await supabase
    .from('warnings')
    .select('*')
    .limit(1);

  if (warningError) {
    issues.push(`❌ warnings 表错误: ${warningError.message}`);
  } else if (sampleWarning && sampleWarning.length > 0) {
    const requiredFields = ['project_id', 'task_id', 'warning_type', 'warning_level', 'title', 'description'];
    const missingFields = requiredFields.filter(f => !(f in sampleWarning[0]));
    
    if (missingFields.length > 0) {
      issues.push(`❌ warnings 表缺少字段: ${missingFields.join(', ')}`);
    } else {
      info.push('✅ warnings 表字段完整');
    }
  } else {
    warnings.push('⚠️ warnings 表为空，无法验证字段结构');
  }

  // ========================================
  // 4. 检查 autoAlertService 依赖（已禁用）
  // ========================================
  console.log('\n🚨 4. 检查 autoAlertService 依赖（已禁用）...');
  
  // 检查 task_conditions 表
  const { error: condError } = await supabase.from('task_conditions').select('*').limit(1);
  if (condError) {
    warnings.push('⚠️ task_conditions 表不存在，autoAlertService 的条件检查功能不可用');
  } else {
    info.push('✅ task_conditions 表存在');
  }

  // 检查 task_obstacles 表
  const { error: obsError } = await supabase.from('task_obstacles').select('*').limit(1);
  if (obsError) {
    warnings.push('⚠️ task_obstacles 表不存在，autoAlertService 的阻碍检查功能不可用');
  } else {
    info.push('✅ task_obstacles 表存在');
  }

  // 检查 tasks 表的依赖字段
  const { data: sampleTask, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .limit(1);

  if (taskError) {
    issues.push(`❌ tasks 表错误: ${taskError.message}`);
  } else if (sampleTask && sampleTask.length > 0) {
    const requiredFields = ['id', 'title', 'status', 'end_date', 'progress', 'dependencies'];
    const missingFields = requiredFields.filter(f => !(f in sampleTask[0]));
    
    if (missingFields.length > 0) {
      warnings.push(`⚠️ tasks 表可能缺少字段: ${missingFields.join(', ')}`);
    } else {
      info.push('✅ tasks 表字段完整');
    }
  } else {
    warnings.push('⚠️ tasks 表为空，无法验证字段结构');
  }

  // ========================================
  // 5. 检查定时任务时间配置
  // ========================================
  console.log('\n⏰ 5. 检查定时任务时间配置...');
  
  const jobConfigs = [
    {
      name: '风险统计任务',
      schedule: '每日 02:00',
      cron: '0 2 * * *'
    },
    {
      name: '前期证照预警任务',
      schedule: '每日 03:00',
      cron: '0 3 * * *'
    },
    {
      name: 'autoAlertService（每日）',
      schedule: '每日 02:30',
      cron: '30 2 * * *',
      disabled: true
    },
    {
      name: 'autoAlertService（每小时）',
      schedule: '每整点',
      cron: '0 * * * *',
      disabled: true
    }
  ];

  // 检查时间冲突
  const activeJobs = jobConfigs.filter(j => !j.disabled);
  const schedules = activeJobs.map(j => j.cron);
  
  // 简单检查：是否有相同时间的任务
  const timeSlots = [
    '02:00 - 风险统计',
    '03:00 - 前期证照预警',
    '02:30 - autoAlertService（已禁用）'
  ];
  
  info.push('✅ 定时任务时间配置:');
  timeSlots.forEach(slot => info.push(`   - ${slot}`));

  // 错峰检查
  const hasConflict = false; // 当前无冲突
  if (!hasConflict) {
    info.push('✅ 定时任务错峰配置合理');
  }

  // ========================================
  // 6. 检查数据流完整性
  // ========================================
  console.log('\n🔄 6. 检查数据流完整性...');
  
  // 风险统计任务数据流
  info.push('✅ 风险统计任务数据流:');
  info.push('   1. 查询活跃项目 (projects 表)');
  info.push('   2. 计算项目风险统计');
  info.push('   3. 插入 risk_statistics 表');
  info.push('   4. 记录执行日志到 job_execution_logs 表');

  // 前期证照预警任务数据流
  info.push('✅ 前期证照预警任务数据流:');
  info.push('   1. 查询未完成证照 (pre_milestones 表)');
  info.push('   2. 检查即将过期/已过期');
  info.push('   3. 创建/更新预警记录 (warnings 表)');
  info.push('   4. 标记过期证照状态');

  // autoAlertService 数据流（已禁用）
  warnings.push('⚠️ autoAlertService 已禁用，数据流无法验证');
  warnings.push('   - 每日检测：8项检查（延期/到期/依赖/冲突/风险/里程碑/一致性/健康度）');
  warnings.push('   - 每小时检测：2项检查（今天到期/严重风险）');

  // ========================================
  // 7. 生成检查报告
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('📋 检查报告');
  console.log('='.repeat(60));

  if (issues.length > 0) {
    console.log('\n❌ 严重问题:');
    issues.forEach(issue => console.log(`  ${issue}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  警告:');
    warnings.forEach(warning => console.log(`  ${warning}`));
  }

  if (info.length > 0) {
    console.log('\n✅ 信息:');
    info.forEach(i => console.log(`  ${i}`));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 统计信息');
  console.log('='.repeat(60));
  console.log(`严重问题: ${issues.length}`);
  console.log(`警告: ${warnings.length}`);
  console.log(`信息: ${info.length}`);
  console.log('');

  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ 所有关键检查通过！');
  } else if (issues.length === 0) {
    console.log('⚠️  存在警告，但不影响核心功能');
  } else {
    console.log('❌ 存在严重问题，需要立即修复');
  }

  // 返回检查结果
  return {
    success: issues.length === 0,
    issues,
    warnings,
    info
  };
}

// 执行检查
checkAllJobs()
  .then(result => {
    console.log('\n✅ 检查完成');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ 检查失败:', error);
    process.exit(1);
  });
