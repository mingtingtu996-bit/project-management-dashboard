import { createClient } from '@supabase/supabase-js';

// Supabase 配置
const supabaseUrl = 'https://wwdrkjnbvcbfytwnnyvs.supabase.co';
const supabaseKey = 'sb_publishable_XuCdxFIxN4c6TBLFM1JPWA_bpnHBmzA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPreMilestoneWarning() {
  console.log('🧪 前期证照预警功能测试\n');
  console.log('='.repeat(60));

  try {
    // Step 1: 获取测试项目
    console.log('\n📋 Step 1: 获取测试项目...');
    let { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .limit(1);

    if (projectError) {
      console.error('❌ 获取项目失败:', projectError.message);
      return;
    }

    if (!projects || projects.length === 0) {
      console.log('⚠️  没有找到项目，需要先创建项目');
      return;
    }

    const projectId = projects[0].id;
    console.log(`✅ 使用项目: ${projects[0].name} (ID: ${projectId})`);

    // Step 2: 创建测试前期证照
    console.log('\n📋 Step 2: 创建测试前期证照...');

    const today = new Date();
    
    // 即将过期（7天后）
    const warningDate = new Date(today);
    warningDate.setDate(warningDate.getDate() + 7);
    
    // 已过期（1天前）
    const expiredDate = new Date(today);
    expiredDate.setDate(expiredDate.getDate() - 1);
    
    // 正常（60天后）
    const normalDate = new Date(today);
    normalDate.setDate(normalDate.getDate() + 60);

    // 清理旧测试数据
    await supabase
      .from('pre_milestones')
      .delete()
      .ilike('document_type', 'TEST_%');

    // 创建测试证照
    const testDocs = [
      {
        project_id: projectId,
        document_type: 'TEST_WARNING_1',
        document_name: '即将过期的测试证照（7天后）',
        issue_date: today.toISOString(),
        expiry_date: warningDate.toISOString(),
        status: 'valid',
        notes: '用于测试预警功能 - 即将过期'
      },
      {
        project_id: projectId,
        document_type: 'TEST_WARNING_2',
        document_name: '已过期的测试证照（1天前）',
        issue_date: today.toISOString(),
        expiry_date: expiredDate.toISOString(),
        status: 'valid',
        notes: '用于测试预警功能 - 已过期'
      },
      {
        project_id: projectId,
        document_type: 'TEST_WARNING_3',
        document_name: '正常的测试证照（60天后）',
        issue_date: today.toISOString(),
        expiry_date: normalDate.toISOString(),
        status: 'valid',
        notes: '用于测试预警功能 - 正常'
      }
    ];

    const { data: insertedDocs, error: insertError } = await supabase
      .from('pre_milestones')
      .insert(testDocs)
      .select();

    if (insertError) {
      console.error('❌ 创建测试证照失败:', insertError.message);
      return;
    }

    console.log(`✅ 创建了 ${insertedDocs?.length || 0} 个测试证照:`);
    insertedDocs?.forEach(doc => {
      const daysUntilExpiry = Math.ceil(
        (new Date(doc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      console.log(`   - ${doc.document_name} (${daysUntilExpiry}天后过期)`);
    });

    // Step 3: 清理旧预警
    console.log('\n📋 Step 3: 清理旧预警记录...');
    const { error: deleteError } = await supabase
      .from('warnings')
      .delete()
      .ilike('title', '%测试证照%');

    if (deleteError) {
      console.error('⚠️  清理旧预警失败:', deleteError.message);
    } else {
      console.log('✅ 已清理旧预警记录');
    }

    // Step 4: 手动生成预警（模拟预警服务逻辑）
    console.log('\n📋 Step 4: 模拟预警服务生成预警...\n');

    // 获取即将过期的证照（7天内）
    const advanceWarningDate = new Date();
    advanceWarningDate.setDate(advanceWarningDate.getDate() + 7);

    const { data: expiringDocs, error: queryError } = await supabase
      .from('pre_milestones')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'valid')
      .ilike('document_type', 'TEST_%')
      .lte('expiry_date', advanceWarningDate.toISOString());

    if (queryError) {
      console.error('❌ 查询即将过期证照失败:', queryError.message);
      return;
    }

    if (!expiringDocs || expiringDocs.length === 0) {
      console.log('✅ 没有即将过期的证照（正常情况）');
      return;
    }

    console.log(`📌 找到 ${expiringDocs.length} 个即将过期或已过期的证照:\n`);

    // 为每个即将过期的证照生成预警
    const warningsCreated = [];
    
    for (const doc of expiringDocs) {
      const expiryDate = new Date(doc.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      
      let warningLevel: 'info' | 'warning' | 'critical';
      let warningType: string;
      
      if (daysUntilExpiry < 0) {
        warningLevel = 'critical';
        warningType = 'expired';
      } else if (daysUntilExpiry <= 7) {
        warningLevel = 'warning';
        warningType = 'expiring_soon';
      } else {
        warningLevel = 'info';
        warningType = 'expiring_soon';
      }

      const warningData = {
        project_id: doc.project_id,
        task_id: null,
        warning_type: warningType,
        warning_level: warningLevel,
        title: `${doc.document_name}`,
        description: `证照类型: ${doc.document_type}\n到期日期: ${expiryDate.toLocaleDateString('zh-CN')}\n剩余天数: ${daysUntilExpiry}天`,
        is_acknowledged: false,
        resolved: false
      };

      const { data: createdWarning, error: createError } = await supabase
        .from('warnings')
        .insert(warningData)
        .select()
        .single();

      if (createError) {
        console.error(`❌ 创建预警失败: ${doc.document_name}`, createError.message);
      } else {
        warningsCreated.push(createdWarning);
        console.log(`✅ 已创建预警: ${doc.document_name}`);
        console.log(`   - 级别: ${warningLevel}`);
        console.log(`   - 剩余天数: ${daysUntilExpiry}天`);
        console.log('');
      }
    }

    // Step 5: 验证预警结果
    console.log('📋 Step 5: 验证预警结果...');
    const { data: warnings, error: warningsError } = await supabase
      .from('warnings')
      .select('*')
      .ilike('title', '%测试证照%')
      .order('created_at', { ascending: false });

    if (warningsError) {
      console.error('❌ 查询预警记录失败:', warningsError.message);
      return;
    }

    if (!warnings || warnings.length === 0) {
      console.log('⚠️  没有生成预警记录');
      return;
    }

    console.log(`\n✅ 共生成 ${warnings.length} 条预警记录:\n`);
    warnings.forEach((warning, index) => {
      const levelEmoji = warning.warning_level === 'critical' ? '🔴' : warning.warning_level === 'warning' ? '🟡' : '🟢';
      console.log(`${index + 1}. ${levelEmoji} ${warning.title}`);
      console.log(`   类型: ${warning.warning_type}`);
      console.log(`   级别: ${warning.warning_level}`);
      console.log(`   状态: ${warning.is_acknowledged ? '已确认' : '未确认'}`);
      console.log(`   已解决: ${warning.resolved ? '是' : '否'}`);
      console.log(`   创建时间: ${new Date(warning.created_at).toLocaleString('zh-CN')}`);
      console.log('');
    });

    // 统计
    console.log('📊 统计:');
    const warningLevels = warnings.reduce((acc, w) => {
      acc[w.warning_level] = (acc[w.warning_level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(warningLevels).forEach(([level, count]) => {
      const levelEmoji = level === 'critical' ? '🔴' : level === 'warning' ? '🟡' : '🟢';
      console.log(`   ${levelEmoji} ${level.toUpperCase()}: ${count} 条`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ 前期证照预警功能测试完成！');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

// 执行测试
testPreMilestoneWarning()
  .then(() => {
    console.log('\n✨ 测试脚本执行完毕\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 测试脚本执行失败:', error);
    process.exit(1);
  });
