/**
 * 添加测试风险数据
 * 运行: node add-test-risks.js
 */
import { createClient } from '@supabase/supabase-js';

// Supabase 配置
const supabaseUrl = 'https://wwdrkjnbvcbfytwnnyvs.supabase.co';
const supabaseKey = 'sb_publishable_XuCdxFIxN4c6TBLFM1JPWA_bpnHBmzA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function addTestRisks() {
  console.log('🧪 添加测试风险数据\n');
  console.log('='.repeat(60));

  try {
    // Step 1: 获取项目列表
    console.log('\n📋 Step 1: 获取项目列表...');
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .limit(5);

    if (projectError) throw projectError;
    
    if (!projects || projects.length === 0) {
      console.log('❌ 没有找到项目，请先创建项目');
      return;
    }

    console.log(`✅ 找到 ${projects.length} 个项目`);
    projects.forEach((p, i) => console.log(`  ${i+1}. ${p.name} (${p.id})`));

    const projectId = projects[0].id;
    console.log(`\n使用项目: ${projects[0].name}`);

    // Step 2: 获取项目任务
    console.log('\n📋 Step 2: 获取项目任务...');
    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('project_id', projectId)
      .limit(5);

    if (taskError) {
      console.log('⚠️ 无法获取任务，继续创建无关联风险');
    }

    const taskId = tasks && tasks.length > 0 ? tasks[0].id : null;
    if (tasks && tasks.length > 0) {
      console.log(`✅ 找到 ${tasks.length} 个任务`);
    } else {
      console.log('⚠️ 没有任务，创建无关联风险');
    }

    // Step 3: 创建测试风险数据
    console.log('\n📋 Step 3: 创建测试风险数据...');

    const testRisks = [
      {
        project_id: projectId,
        title: '施工进度滞后风险',
        description: '由于原材料供应延迟，可能导致主体结构施工进度滞后2周',
        level: 'high',
        status: 'identified',
        probability: 70,
        impact: 80,
        mitigation: '已联系备用供应商，制定赶工计划',
        task_id: taskId
      },
      {
        project_id: projectId,
        title: '资金链紧张风险',
        description: '项目进度款支付可能延迟，影响后续施工',
        level: 'critical',
        status: 'mitigating',
        probability: 60,
        impact: 90,
        mitigation: '加强与建设单位沟通，提前申报进度款',
        task_id: taskId
      },
      {
        project_id: projectId,
        title: '人员安全风险',
        description: '高温天气作业可能引发施工人员中暑',
        level: 'medium',
        status: 'identified',
        probability: 40,
        impact: 70,
        mitigation: '调整作业时间，配备防暑降温物资',
        task_id: taskId
      },
      {
        project_id: projectId,
        title: '质量验收风险',
        description: '部分分项工程可能无法一次通过验收',
        level: 'low',
        status: 'identified',
        probability: 30,
        impact: 50,
        mitigation: '加强过程质量管控',
        task_id: taskId
      },
      {
        project_id: projectId,
        title: '设计变更风险',
        description: '建设单位可能提出设计变更，影响工期',
        level: 'high',
        status: 'identified',
        probability: 50,
        impact: 75,
        mitigation: '提前沟通确认变更需求',
        task_id: taskId
      },
      {
        project_id: projectId,
        title: '材料价格波动风险',
        description: '钢材价格波动可能影响成本控制',
        level: 'medium',
        status: 'resolved',
        probability: 55,
        impact: 60,
        mitigation: '已锁定钢材价格',
        task_id: taskId
      },
      {
        project_id: projectId,
        title: '恶劣天气风险',
        description: '雨季施工可能影响地下室施工',
        level: 'high',
        status: 'mitigating',
        probability: 65,
        impact: 70,
        mitigation: '制定雨季施工方案，储备排水设备',
        task_id: taskId
      },
      {
        project_id: projectId,
        title: '机械设备故障风险',
        description: '塔吊等关键设备可能发生故障',
        level: 'medium',
        status: 'identified',
        probability: 35,
        impact: 65,
        mitigation: '建立设备定期检修制度',
        task_id: taskId
      }
    ];

    // 插入风险数据
    const { data: risks, error: risksError } = await supabase
      .from('risks')
      .insert(testRisks)
      .select();

    if (risksError) throw risksError;

    console.log(`✅ 成功添加 ${risks.length} 条风险记录`);
    
    // 显示创建的风险
    console.log('\n📊 创建的风险列表:');
    risks.forEach((r, i) => {
      console.log(`  ${i+1}. [${r.level.toUpperCase()}] ${r.title}`);
      console.log(`     状态: ${r.status} | 概率: ${r.probability}% | 影响: ${r.impact}%`);
    });

    // Step 4: 验证风险统计
    console.log('\n📋 Step 4: 验证风险统计...');
    
    const { data: riskStats, error: statsError } = await supabase
      .from('risk_statistics')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (statsError) {
      console.log('⚠️ 风险统计表可能需要刷新');
    } else {
      console.log('✅ 风险统计:', riskStats);
    }

    // Step 5: 验证风险管理页面数据
    console.log('\n📋 Step 5: 查询当前项目所有风险...');
    const { data: allRisks, error: allRisksError } = await supabase
      .from('risks')
      .select('id, title, level, status, probability, impact')
      .eq('project_id', projectId);

    if (allRisksError) throw allRisksError;

    console.log(`\n✅ 项目共有 ${allRisks.length} 条风险记录`);
    
    // 按等级统计
    const levelCount = { critical: 0, high: 0, medium: 0, low: 0 };
    const statusCount = { identified: 0, mitigating: 0, resolved: 0 };
    
    allRisks.forEach(r => {
      if (r.level in levelCount) levelCount[r.level]++;
      if (r.status in statusCount) statusCount[r.status]++;
    });

    console.log('\n📈 风险等级分布:');
    console.log(`  Critical: ${levelCount.critical}`);
    console.log(`  High: ${levelCount.high}`);
    console.log(`  Medium: ${levelCount.medium}`);
    console.log(`  Low: ${levelCount.low}`);

    console.log('\n📈 风险状态分布:');
    console.log(`  已识别: ${statusCount.identified}`);
    console.log(`  处理中: ${statusCount.mitigating}`);
    console.log(`  已解决: ${statusCount.resolved}`);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 测试数据添加完成！');
    console.log('\n请刷新风险管理页面查看效果。');
    console.log('如需查看"风险分布比例条"，需要更多风险数据。');

  } catch (error) {
    console.error('\n❌ 错误:', error);
  }
}

addTestRisks();
